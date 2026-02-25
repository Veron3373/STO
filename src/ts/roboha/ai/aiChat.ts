// src/ts/roboha/ai/aiChat.ts
// 🤖 AI-Чат Асистент "Механік" — Google Gemini + аналіз даних СТО

import { supabase } from "../../vxid/supabaseClient";
import { globalCache } from "../zakaz_naraudy/globalCache";

// ============================================================
// ТИПИ
// ============================================================

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

interface DailyStats {
  closedCount: number;
  closedActs: Array<{ id: number; client: string; car: string; total: number; slyusar: string; dateOff: string }>;
  openCount: number;
  openActs: Array<{ id: number; client: string; car: string; dateOn: string }>;
  totalWorksSum: number;
  totalDetailsSum: number;
  totalSum: number;
  worksCount: number;
}

// ============================================================
// СТАН
// ============================================================

const CHAT_MODAL_ID = "ai-chat-modal";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
let chatHistory: ChatMessage[] = [];
let geminiApiKey = "";
let isLoading = false;

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧА GEMINI
// ============================================================

async function loadGeminiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;
  try {
    // Спочатку перевіряємо середовище
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey) {
      geminiApiKey = envKey;
      return geminiApiKey;
    }
    // Потім шукаємо в БД settings (setting_id=20 — Gemini key)
    const { data } = await supabase
      .from("settings")
      .select("Загальні")
      .eq("setting_id", 20)
      .single();
    const row = data as Record<string, string> | null;
    if (row?.["Загальні"]) {
      geminiApiKey = row["Загальні"];
      return geminiApiKey;
    }
  } catch { /* ignore */ }
  return "";
}

// ============================================================
// ЗБІР ДАНИХ СТО ДЛЯ КОНТЕКСТУ
// ============================================================

async function gatherSTOContext(userQuery: string): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  let context = `Ти - AI асистент для автосервісу СТО. Аналізуй дані та відповідай ТІЛЬКИ українською мовою. Будь конкретним, лаконічним і корисним.\n\n`;

  // Визначаємо що завантажувати залежно від запиту
  const queryLower = userQuery.toLowerCase();
  const needsActs = queryLower.includes("акт") || queryLower.includes("закри") || queryLower.includes("відкри") || queryLower.includes("сьогодн") || queryLower.includes("закрито") || queryLower.includes("відкрито");
  const needsSlyusar = queryLower.includes("слюсар") || queryLower.includes("заробив") || queryLower.includes("зарплат") || queryLower.includes("прац");
  const needsWorks = queryLower.includes("робот") || queryLower.includes("послуг") || queryLower.includes("виконан");
  const needsDetails = queryLower.includes("детал") || queryLower.includes("запчастин") || queryLower.includes("склад");
  const needsFinance = queryLower.includes("сум") || queryLower.includes("гривн") || queryLower.includes("заробив") || queryLower.includes("прибуток") || queryLower.includes("гроші");

  try {
    // === АКТИ (поточний день / місяць) ===
    if (needsActs || needsFinance || queryLower.includes("скільки") || userQuery.length < 50) {
      let actsToday: any[] = [];
      let actsMonth: any[] = [];

      // Спробуємо завантажити з фільтром по date_on
      try {
        const { data: d1, error: e1 } = await supabase
          .from("acts")
          .select("act_id, data, date_on, date_off, status")
          .gte("date_on", todayStr)
          .order("act_id", { ascending: false })
          .limit(50);
        if (!e1 && d1) actsToday = d1;
      } catch { /* ignore */ }

      try {
        const { data: d2, error: e2 } = await supabase
          .from("acts")
          .select("act_id, data, date_on, date_off, status")
          .gte("date_on", monthStart)
          .order("act_id", { ascending: false })
          .limit(200);
        if (!e2 && d2) actsMonth = d2;
      } catch { /* ignore */ }

      // Fallback: якщо 400 — беремо останні акти без фільтра
      if (actsToday.length === 0 && actsMonth.length === 0) {
        try {
          const { data: fallback } = await supabase
            .from("acts")
            .select("act_id, data, date_on, date_off, status")
            .order("act_id", { ascending: false })
            .limit(100);
          const all = fallback || [];
          actsToday = all.filter((a: any) => (a.date_on || "").slice(0, 10) >= todayStr);
          actsMonth = all.filter((a: any) => (a.date_on || "").slice(0, 10) >= monthStart);
        } catch { /* ignore */ }
      }

      const closed = actsToday.filter((a: any) => a.status === "closed" || a.date_off);
      const open = actsToday.filter((a: any) => !a.date_off && a.status !== "closed");


      context += `=== АКТИ СЬОГОДНІ (${today.toLocaleDateString("uk-UA")}) ===\n`;
      context += `Закритих актів: ${closed.length}\n`;
      if (closed.length > 0) {
        closed.forEach((a: any) => {
          let d: any = {};
          try { d = typeof a.data === "string" ? JSON.parse(a.data) : (a.data || {}); } catch { }
          const client = d["ПІБ"] || d["Клієнт"] || "—";
          const car = d["Марка"] || d["Авто"] || "—";
          const slyusar = d["Приймальник"] || "—";
          const worksSum = Array.isArray(d["Роботи"]) ? d["Роботи"].reduce((s: number, w: any) => s + Number(w["Ціна"] || 0) * Number(w["Кількість"] || 1), 0) : 0;
          const detailsSum = Array.isArray(d["Деталі"]) ? d["Деталі"].reduce((s: number, det: any) => s + Number(det["Ціна"] || 0) * Number(det["Кількість"] || 1), 0) : 0;
          const total = worksSum + detailsSum;
          context += `  - Акт #${a.act_id}: ${client} | ${car} | Приймальник: ${slyusar} | Сума: ${total} грн | Закрито: ${a.date_off || "сьогодні"}\n`;
        });
      }

      context += `Відкритих актів: ${open.length}\n`;
      if (open.length > 0) {
        open.slice(0, 10).forEach((a: any) => {
          let d: any = {};
          try { d = typeof a.data === "string" ? JSON.parse(a.data) : (a.data || {}); } catch { }
          const client = d["ПІБ"] || "—";
          const car = d["Марка"] || "—";
          context += `  - Акт #${a.act_id}: ${client} | ${car} | Відкрито: ${a.date_on || "—"}\n`;
        });
      }

      // Місячна статистика
      const monthClosed = (actsMonth || []).filter((a: any) => a.date_off || a.status === "closed");
      let monthTotal = 0;
      let monthWorksTotal = 0;
      let monthDetailsTotal = 0;
      monthClosed.forEach((a: any) => {
        let d: any = {};
        try { d = typeof a.data === "string" ? JSON.parse(a.data) : (a.data || {}); } catch { }
        const ws = Array.isArray(d["Роботи"]) ? d["Роботи"].reduce((s: number, w: any) => s + Number(w["Ціна"] || 0) * Number(w["Кількість"] || 1), 0) : 0;
        const ds = Array.isArray(d["Деталі"]) ? d["Деталі"].reduce((s: number, det: any) => s + Number(det["Ціна"] || 0) * Number(det["Кількість"] || 1), 0) : 0;
        monthWorksTotal += ws;
        monthDetailsTotal += ds;
        monthTotal += ws + ds;
      });

      context += `\n=== СТАТИСТИКА МІСЯЦЯ (${today.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}) ===\n`;
      context += `Закрито актів: ${monthClosed.length}\n`;
      context += `Загальна виручка: ${monthTotal.toLocaleString("uk-UA")} грн\n`;
      context += `  з них роботи: ${monthWorksTotal.toLocaleString("uk-UA")} грн\n`;
      context += `  з них деталі: ${monthDetailsTotal.toLocaleString("uk-UA")} грн\n`;
    }

    // === СЛЮСАРІ ===
    if (needsSlyusar || needsFinance) {
      const slyusars = globalCache.slyusars || [];
      if (slyusars.length > 0) {
        context += `\n=== СЛЮСАРІ (${slyusars.length}) ===\n`;
        slyusars.slice(0, 20).forEach((s: any) => {
          context += `  - ${s.Name || "—"}\n`;
        });
      }
    }

    // === РОБОТИ (найпопулярніші) ===
    if (needsWorks) {
      const works = globalCache.works || [];
      context += `\n=== ДОВІДНИК РОБІТ (${works.length} позицій) ===\n`;
      context += works.slice(0, 30).join(", ") + "\n";
    }

    // === СКЛАД ===
    if (needsDetails) {
      const parts = globalCache.skladParts || [];
      context += `\n=== СКЛАД (${parts.length} позицій) ===\n`;
      const lowStock = parts.filter(p => p.quantity <= 2 && p.quantity >= 0).slice(0, 10);
      if (lowStock.length > 0) {
        context += `⚠️ Мало на складі:\n`;
        lowStock.forEach(p => {
          context += `  - ${p.name} (${p.part_number}): ${p.quantity} шт, ціна ${p.price} грн\n`;
        });
      }
      context += `Загальна кількість позицій: ${parts.length}\n`;
    }

  } catch (err) {
    console.warn("⚠️ Помилка збору контексту:", err);
  }

  context += `\n=== ЗАПИТ КОРИСТУВАЧА ===\n${userQuery}`;
  return context;
}

// ============================================================
// ВИКЛИК GEMINI API
// ============================================================

async function callGemini(userMessage: string): Promise<string> {
  const apiKey = await loadGeminiKey();

  if (!apiKey) {
    return `⚠️ Для роботи AI PRO потрібно вказати **Gemini API ключ** у налаштуваннях (setting_id=20 в БД або VITE_GEMINI_API_KEY у .env).\n\nОтримати безкоштовно: [aistudio.google.com](https://aistudio.google.com/app/apikey)`;
  }

  try {
    // Збираємо контекст з бази
    const enrichedPrompt = await gatherSTOContext(userMessage);

    // Будуємо messages для Gemini
    const contents: any[] = [];

    // Попередні повідомлення з контексту (останні 5)
    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }]
      });
    }

    // Поточне повідомлення з контекстом
    contents.push({
      role: "user",
      parts: [{ text: enrichedPrompt }]
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
        },
        systemInstruction: {
          parts: [{ text: "Ти - помічник для автосервісу СТО. Відповідай ТІЛЬКИ УКРАЇНСЬКОЮ мовою. Використовуй emoji для наочності. Надавай точні числові дані з бази. Якщо даних немає - так і написи." }]
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      if (response.status === 400) return "❌ Помилка запиту до Gemini. Перевірте API ключ.";
      if (response.status === 429) return "⏳ Перевищено ліміт запитів Gemini. Спробуйте через хвилину.";
      return `❌ Помилка Gemini API (${response.status}). Спробуйте пізніше.`;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || "🤔 Не вдалося отримати відповідь від AI.";

  } catch (err: any) {
    console.error("Gemini call error:", err);
    return `❌ Помилка зв'язку з AI: ${err.message || "Мережева помилка"}`;
  }
}

// ============================================================
// ШВИДКІ ЗАПИТИ (ДАШБОРД)
// ============================================================

async function loadDailyStats(): Promise<DailyStats> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const stats: DailyStats = {
    closedCount: 0,
    closedActs: [],
    openCount: 0,
    openActs: [],
    totalWorksSum: 0,
    totalDetailsSum: 0,
    totalSum: 0,
    worksCount: 0
  };

  try {
    const { data: acts } = await supabase
      .from("acts")
      .select("act_id, data, date_on, date_off, status")
      .gte("date_on", todayStr)
      .order("act_id", { ascending: false })
      .limit(100);

    (acts || []).forEach((a: any) => {
      let d: any = {};
      try { d = typeof a.data === "string" ? JSON.parse(a.data) : (a.data || {}); } catch { }

      const client = d["ПІБ"] || d["Клієнт"] || "—";
      const car = `${d["Марка"] || ""} ${d["Модель"] || ""}`.trim() || "—";
      const slyusar = d["Приймальник"] || "—";

      const worksArr = Array.isArray(d["Роботи"]) ? d["Роботи"] : [];
      const detailsArr = Array.isArray(d["Деталі"]) ? d["Деталі"] : [];

      const worksSum = worksArr.reduce((s: number, w: any) => s + Number(w["Ціна"] || 0) * Number(w["Кількість"] || 1), 0);
      const detailsSum = detailsArr.reduce((s: number, det: any) => s + Number(det["Ціна"] || 0) * Number(det["Кількість"] || 1), 0);
      const total = worksSum + detailsSum;

      if (a.date_off || a.status === "closed") {
        stats.closedCount++;
        stats.closedActs.push({ id: a.act_id, client, car, total, slyusar, dateOff: a.date_off || "сьогодні" });
        stats.totalWorksSum += worksSum;
        stats.totalDetailsSum += detailsSum;
        stats.totalSum += total;
        stats.worksCount += worksArr.length;
      } else {
        stats.openCount++;
        stats.openActs.push({ id: a.act_id, client, car, dateOn: a.date_on || "—" });
      }
    });
  } catch (err) {
    console.warn("Помилка завантаження статистики:", err);
  }

  return stats;
}

// ============================================================
// РЕНДЕР ПОВІДОМЛЕНЬ
// ============================================================

function renderMessage(msg: ChatMessage, container: HTMLElement): void {
  const div = document.createElement("div");
  div.className = `ai-chat-message ai-chat-message--${msg.role}`;

  const time = msg.timestamp.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  // Перетворюємо markdown-ліке форматування
  let html = msg.text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  div.innerHTML = `
    <div class="ai-chat-bubble">
      <div class="ai-chat-bubble-text">${html}</div>
      <div class="ai-chat-bubble-time">${time}</div>
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderDashboard(stats: DailyStats, container: HTMLElement): void {
  const today = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

  container.innerHTML = `
    <div class="ai-dashboard">
      <div class="ai-dashboard-title">📊 Дашборд — ${today}</div>
      
      <div class="ai-dashboard-cards">
        <div class="ai-dashboard-card ai-dashboard-card--closed">
          <div class="ai-dashboard-card-icon">✅</div>
          <div class="ai-dashboard-card-value">${stats.closedCount}</div>
          <div class="ai-dashboard-card-label">Закрито сьогодні</div>
        </div>
        <div class="ai-dashboard-card ai-dashboard-card--open">
          <div class="ai-dashboard-card-icon">🔧</div>
          <div class="ai-dashboard-card-value">${stats.openCount}</div>
          <div class="ai-dashboard-card-label">Відкрито</div>
        </div>
        <div class="ai-dashboard-card ai-dashboard-card--money">
          <div class="ai-dashboard-card-icon">💰</div>
          <div class="ai-dashboard-card-value">${stats.totalSum.toLocaleString("uk-UA")}</div>
          <div class="ai-dashboard-card-label">Виручка (грн)</div>
        </div>
        <div class="ai-dashboard-card ai-dashboard-card--works">
          <div class="ai-dashboard-card-icon">🔩</div>
          <div class="ai-dashboard-card-value">${stats.worksCount}</div>
          <div class="ai-dashboard-card-label">Робіт виконано</div>
        </div>
      </div>

      ${stats.closedActs.length > 0 ? `
      <div class="ai-dashboard-section">
        <div class="ai-dashboard-section-title">✅ Закриті акти сьогодні</div>
        <div class="ai-dashboard-acts-list">
          ${stats.closedActs.map(a => `
            <div class="ai-dashboard-act-row">
              <span class="ai-act-id">#${a.id}</span>
              <span class="ai-act-client">${a.client}</span>
              <span class="ai-act-car">${a.car}</span>
              <span class="ai-act-slyusar">${a.slyusar}</span>
              <span class="ai-act-sum">${a.total.toLocaleString("uk-UA")} грн</span>
            </div>
          `).join("")}
        </div>
        <div class="ai-dashboard-totals">
          <span>Роботи: <strong>${stats.totalWorksSum.toLocaleString("uk-UA")} грн</strong></span>
          <span>Деталі: <strong>${stats.totalDetailsSum.toLocaleString("uk-UA")} грн</strong></span>
          <span>Разом: <strong>${stats.totalSum.toLocaleString("uk-UA")} грн</strong></span>
        </div>
      </div>` : ""}

      ${stats.openActs.length > 0 ? `
      <div class="ai-dashboard-section">
        <div class="ai-dashboard-section-title">🔧 Відкриті акти</div>
        <div class="ai-dashboard-acts-list">
          ${stats.openActs.map(a => `
            <div class="ai-dashboard-act-row">
              <span class="ai-act-id">#${a.id}</span>
              <span class="ai-act-client">${a.client}</span>
              <span class="ai-act-car">${a.car}</span>
              <span class="ai-act-slyusar">—</span>
              <span class="ai-act-sum open">відкрито</span>
            </div>
          `).join("")}
        </div>
      </div>` : ""}
    </div>
  `;
}

// ============================================================
// ШВИДКІ ПІДКАЗКИ
// ============================================================

const QUICK_PROMPTS = [
  { icon: "📅", text: "Скільки актів закрито сьогодні?" },
  { icon: "💰", text: "Яка виручка за цей місяць?" },
  { icon: "👷", text: "Покажи статистику по слюсарях за місяць" },
  { icon: "🔧", text: "Які роботи найчастіше виконуємо?" },
  { icon: "📦", text: "Що закінчується на складі?" },
  { icon: "🚗", text: "Покажи відкриті акти з найбільшою сумою" },
];

// ============================================================
// СТВОРЕННЯ МОДАЛКИ
// ============================================================

export async function createAIChatModal(): Promise<void> {
  if (document.getElementById(CHAT_MODAL_ID)) {
    document.getElementById(CHAT_MODAL_ID)!.classList.remove("hidden");
    return;
  }

  const modal = document.createElement("div");
  modal.id = CHAT_MODAL_ID;
  modal.className = "ai-chat-modal";

  modal.innerHTML = `
    <div class="ai-chat-window">
      <!-- Header -->
      <div class="ai-chat-header">
        <div class="ai-chat-header-info">
          <div class="ai-chat-avatar">🤖</div>
          <div class="ai-chat-header-text">
            <div class="ai-chat-title">Механік AI</div>
            <div class="ai-chat-status" id="ai-chat-status">
              <span class="ai-status-dot"></span>
              Онлайн — Gemini 2.0 Flash
            </div>
          </div>
        </div>
        <div class="ai-chat-header-actions">
          <button id="ai-chat-dashboard-btn" class="ai-chat-action-btn" title="Дашборд">📊</button>
          <button id="ai-chat-clear-btn" class="ai-chat-action-btn" title="Очистити чат">🗑️</button>
          <button id="ai-chat-close-btn" class="ai-chat-action-btn ai-chat-close" title="Закрити">✕</button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="ai-chat-tabs">
        <button class="ai-chat-tab ai-chat-tab--active" id="tab-chat" data-tab="chat">💬 Чат</button>
        <button class="ai-chat-tab" id="tab-dashboard" data-tab="dashboard">📊 Дашборд</button>
      </div>

      <!-- Chat panel -->
      <div class="ai-chat-panel" id="ai-panel-chat">
        <!-- Messages -->
        <div class="ai-chat-messages" id="ai-chat-messages">
          <div class="ai-chat-welcome">
            <div class="ai-chat-welcome-icon">🤖</div>
            <div class="ai-chat-welcome-text">
              <strong>Привіт! Я Механік AI.</strong><br>
              Запитай мене про акти, виручку, слюсарів, деталі — про все що відбувається в СТО.
            </div>
          </div>
        </div>

        <!-- Quick prompts -->
        <div class="ai-chat-quick-prompts" id="ai-quick-prompts">
          ${QUICK_PROMPTS.map(p => `
            <button class="ai-quick-prompt-btn" data-prompt="${p.text}">
              ${p.icon} ${p.text}
            </button>
          `).join("")}
        </div>

        <!-- Input -->
        <div class="ai-chat-input-area">
          <textarea
            id="ai-chat-input"
            class="ai-chat-input"
            placeholder="Запитай про акти, виручку, слюсарів..."
            rows="1"
          ></textarea>
          <button id="ai-chat-send-btn" class="ai-chat-send-btn" title="Відправити">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>

      <!-- Dashboard panel -->
      <div class="ai-chat-panel hidden" id="ai-panel-dashboard">
        <div class="ai-dashboard-loading" id="ai-dashboard-loading">
          <div class="ai-spinner"></div>
          <span>Завантаження статистики...</span>
        </div>
        <div id="ai-dashboard-content"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  initAIChatHandlers(modal);
}

// ============================================================
// ОБРОБНИКИ ПОДІЙ
// ============================================================

function initAIChatHandlers(modal: HTMLElement): void {
  const messagesEl = modal.querySelector("#ai-chat-messages") as HTMLElement;
  const inputEl = modal.querySelector("#ai-chat-input") as HTMLTextAreaElement;
  const sendBtn = modal.querySelector("#ai-chat-send-btn") as HTMLButtonElement;
  const closeBtn = modal.querySelector("#ai-chat-close-btn") as HTMLButtonElement;
  const clearBtn = modal.querySelector("#ai-chat-clear-btn") as HTMLButtonElement;
  const dashboardBtn = modal.querySelector("#ai-chat-dashboard-btn") as HTMLButtonElement;
  const quickPromptsEl = modal.querySelector("#ai-quick-prompts") as HTMLElement;
  const tabChat = modal.querySelector("#tab-chat") as HTMLButtonElement;
  const tabDashboard = modal.querySelector("#tab-dashboard") as HTMLButtonElement;
  const panelChat = modal.querySelector("#ai-panel-chat") as HTMLElement;
  const panelDashboard = modal.querySelector("#ai-panel-dashboard") as HTMLElement;
  const dashboardLoading = modal.querySelector("#ai-dashboard-loading") as HTMLElement;
  const dashboardContent = modal.querySelector("#ai-dashboard-content") as HTMLElement;

  // ── Закрити ──
  closeBtn?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // ── Очистити чат ──
  clearBtn?.addEventListener("click", () => {
    chatHistory = [];
    messagesEl.innerHTML = `
      <div class="ai-chat-welcome">
        <div class="ai-chat-welcome-icon">🤖</div>
        <div class="ai-chat-welcome-text">
          <strong>Чат очищено!</strong><br>
          Запитай мене про акти, виручку, слюсарів або деталі.
        </div>
      </div>
    `;
    quickPromptsEl.style.display = "";
  });

  // ── Таби ──
  function switchTab(activeTab: "chat" | "dashboard") {
    if (activeTab === "chat") {
      tabChat.classList.add("ai-chat-tab--active");
      tabDashboard.classList.remove("ai-chat-tab--active");
      panelChat.classList.remove("hidden");
      panelDashboard.classList.add("hidden");
    } else {
      tabDashboard.classList.add("ai-chat-tab--active");
      tabChat.classList.remove("ai-chat-tab--active");
      panelDashboard.classList.remove("hidden");
      panelChat.classList.add("hidden");
      loadDashboardData();
    }
  }

  tabChat?.addEventListener("click", () => switchTab("chat"));
  tabDashboard?.addEventListener("click", () => switchTab("dashboard"));
  dashboardBtn?.addEventListener("click", () => switchTab("dashboard"));

  // ── Завантаження дашборду ──
  async function loadDashboardData() {
    dashboardLoading.style.display = "flex";
    dashboardContent.innerHTML = "";
    const stats = await loadDailyStats();
    dashboardLoading.style.display = "none";
    renderDashboard(stats, dashboardContent);
  }

  // ── Відправка повідомлення ──
  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    // Ховаємо підказки
    quickPromptsEl.style.display = "none";

    // Додаємо повідомлення користувача
    const userMsg: ChatMessage = { role: "user", text: text.trim(), timestamp: new Date() };
    chatHistory.push(userMsg);
    renderMessage(userMsg, messagesEl);

    inputEl.value = "";
    inputEl.style.height = "auto";

    // Показуємо loader
    isLoading = true;
    sendBtn.disabled = true;
    const loaderDiv = document.createElement("div");
    loaderDiv.className = "ai-chat-message ai-chat-message--assistant ai-chat-loading";
    loaderDiv.innerHTML = `
      <div class="ai-chat-bubble">
        <div class="ai-typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    messagesEl.appendChild(loaderDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Запит до Gemini
    const reply = await callGemini(text.trim());
    loaderDiv.remove();

    const assistantMsg: ChatMessage = { role: "assistant", text: reply, timestamp: new Date() };
    chatHistory.push(assistantMsg);
    renderMessage(assistantMsg, messagesEl);

    isLoading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  // ── Кнопка відправки ──
  sendBtn?.addEventListener("click", () => {
    sendMessage(inputEl.value);
  });

  // ── Enter для відправки ──
  inputEl?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  // ── Auto-resize textarea ──
  inputEl?.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  // ── Швидкі підказки ──
  quickPromptsEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-prompt]");
    if (btn) {
      const prompt = btn.getAttribute("data-prompt") || "";
      sendMessage(prompt);
    }
  });
}

// ============================================================
// ІНІЦІАЛІЗАЦІЯ КНОПКИ В МЕНЮ
// ============================================================

export function initAIChatButton(): void {
  // Перевіряємо чи увімкнено ШІ PRO
  if (!globalCache.generalSettings.aiChatEnabled) return;

  // Перевіряємо чи вже є кнопка
  if (document.getElementById("ai-chat-menu-btn")) return;

  // Шукаємо меню
  const menuItems = document.getElementById("menu-items-to-hide");
  if (!menuItems) return;

  const li = document.createElement("li");
  li.innerHTML = `<button id="ai-chat-menu-btn" class="ai-chat-menu-btn" title="AI Асистент Механік">🤖</button>`;

  // Вставляємо перед search-container li, або в кінець
  const searchLi = menuItems.querySelector("li.search-container");
  if (searchLi) {
    menuItems.insertBefore(li, searchLi);
  } else {
    menuItems.appendChild(li);
  }

  document.getElementById("ai-chat-menu-btn")?.addEventListener("click", async () => {
    await createAIChatModal();
    const modal = document.getElementById(CHAT_MODAL_ID);
    if (modal) modal.classList.remove("hidden");
  });
}


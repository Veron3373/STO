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
  closedActs: Array<{
    id: number;
    client: string;
    car: string;
    total: number;
    slyusar: string;
    dateOff: string;
  }>;
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
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
let chatHistory: ChatMessage[] = [];
let geminiApiKeys: string[] = []; // Всі 3 ключі (setting_id 20, 21, 22)
let currentKeyIndex = 0; // Поточний активний ключ
let keysLoaded = false;
let isLoading = false;

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧІВ GEMINI (3 ключі з фолбеком)
// ============================================================

async function loadAllGeminiKeys(): Promise<string[]> {
  if (keysLoaded && geminiApiKeys.length > 0) return geminiApiKeys;

  const keys: string[] = [];
  try {
    // Спочатку перевіряємо env
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey) keys.push(envKey);

    // Завантажуємо всі 3 ключі з БД (setting_id 20, 21, 22)
    const { data } = await supabase
      .from("settings")
      .select('setting_id, "Загальні"')
      .in("setting_id", [20, 21, 22])
      .order("setting_id");

    if (data) {
      for (const row of data) {
        const val = (row as any)["Загальні"];
        if (val && typeof val === "string" && val.trim()) {
          // Уникаємо дублікатів (env може збігатися з setting_id=20)
          if (!keys.includes(val.trim())) {
            keys.push(val.trim());
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  geminiApiKeys = keys;
  keysLoaded = true;
  currentKeyIndex = 0;
  return keys;
}

/**
 * Скидає кеш ключів — при наступному запиті ключі будуть перезавантажені з БД
 */
export function resetGeminiKeysCache(): void {
  geminiApiKeys = [];
  keysLoaded = false;
  currentKeyIndex = 0;
  updateKeyIndicator();
  console.log("🔑 Gemini: кеш ключів скинуто");
}

/**
 * Оновлює індикатор номера ключа в хедері чату
 */
function updateKeyIndicator(): void {
  const el = document.getElementById("ai-key-indicator");
  if (!el) return;
  if (geminiApiKeys.length === 0) {
    el.textContent = "";
    return;
  }
  el.textContent = `🔑${currentKeyIndex + 1}`;
  el.title = `Активний API ключ #${currentKeyIndex + 1} з ${geminiApiKeys.length}`;
}

// ============================================================
// ЗБІР ДАНИХ СТО ДЛЯ КОНТЕКСТУ
// ============================================================

async function gatherSTOContext(userQuery: string): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

  let context = `Ти - AI асистент "Механік" для автосервісу (СТО). У тебе є ПОВНИЙ ДОСТУП до бази даних СТО.
Відповідай ТІЛЬКИ українською мовою. Будь конкретним, лаконічним і корисним.
Аналізуй надані дані детально. Якщо питають про конкретний акт, клієнта, слюсаря або авто — шукай в наданих даних.
Суми вказуй в грн. Дати — в українському форматі.\n\n`;

  // Допоміжна функція парсингу даних акту
  const parseActData = (a: any) => {
    let d: any = {};
    try {
      d = typeof a.data === "string" ? JSON.parse(a.data) : a.data || {};
    } catch {}

    const worksArr = Array.isArray(d["Роботи"]) ? d["Роботи"] : [];
    const detailsArr = Array.isArray(d["Деталі"]) ? d["Деталі"] : [];
    const worksSum = worksArr.reduce(
      (s: number, w: any) =>
        s + Number(w["Ціна"] || 0) * Number(w["Кількість"] || 1),
      0,
    );
    const detailsSum = detailsArr.reduce(
      (s: number, det: any) =>
        s + Number(det["Ціна"] || 0) * Number(det["Кількість"] || 1),
      0,
    );
    const discount = Number(d["Знижка"] || 0);
    const total = worksSum + detailsSum - discount;

    return {
      actId: a.act_id,
      client: d["ПІБ"] || d["Клієнт"] || "—",
      phone: d["Телефон"] || "",
      car: `${d["Марка"] || ""} ${d["Модель"] || ""}`.trim() || "—",
      plate: d["Держ. номер"] || d["ДержНомер"] || "",
      vin: d["VIN"] || "",
      mileage: d["Пробіг"] || "",
      receiver: d["Приймальник"] || "—",
      reason: d["Причина звернення"] || "",
      recommendations: d["Рекомендації"] || "",
      works: worksArr.map(
        (w: any) =>
          `${w["Назва"] || w["Робота"] || "?"}: ${w["Ціна"] || 0} грн x ${w["Кількість"] || 1}`,
      ),
      details: detailsArr.map(
        (det: any) =>
          `${det["Назва"] || det["Деталь"] || "?"}: ${det["Ціна"] || 0} грн x ${det["Кількість"] || 1}`,
      ),
      worksSum,
      detailsSum,
      discount,
      total,
      advance: Number(d["Аванс"] || 0),
      dateOn: a.date_on || "",
      dateOff: a.date_off || "",
      isClosed: !!a.date_off,
      slusarsOn: a.slusarsOn || false,
      raw: d,
    };
  };

  // Форматує акт для контексту
  const formatAct = (
    p: ReturnType<typeof parseActData>,
    detailed: boolean = false,
  ) => {
    let s = `Акт #${p.actId}: Клієнт: ${p.client}`;
    if (p.phone) s += ` | Тел: ${p.phone}`;
    s += ` | Авто: ${p.car}`;
    if (p.plate) s += ` (${p.plate})`;
    s += ` | Приймальник: ${p.receiver}`;
    s += ` | Сума: ${p.total} грн (роботи: ${p.worksSum}, деталі: ${p.detailsSum}`;
    if (p.discount > 0) s += `, знижка: ${p.discount}`;
    s += `)`;
    if (p.advance > 0) s += ` | Аванс: ${p.advance} грн`;
    s += ` | Відкрито: ${p.dateOn}`;
    if (p.isClosed) s += ` | Закрито: ${p.dateOff}`;
    else s += ` | ВІДКРИТИЙ`;
    if (p.slusarsOn && !p.isClosed) s += ` | ✅ Роботи завершено`;

    if (detailed) {
      if (p.mileage) s += `\n    Пробіг: ${p.mileage}`;
      if (p.reason) s += `\n    Причина: ${p.reason}`;
      if (p.works.length > 0) s += `\n    Роботи: ${p.works.join("; ")}`;
      if (p.details.length > 0) s += `\n    Деталі: ${p.details.join("; ")}`;
      if (p.recommendations) s += `\n    Рекомендації: ${p.recommendations}`;
    }
    return s;
  };

  try {
    // ============================================================
    // 1. ЗАВАНТАЖУЄМО ВСІ АКТУАЛЬНІ АКТИ З БАЗИ ДАНИХ
    // ============================================================

    // Відкриті акти (без date_off) — ЗАВЖДИ завантажуємо
    let openActs: any[] = [];
    try {
      const { data, error } = await supabase
        .from("acts")
        .select("*")
        .is("date_off", null)
        .order("act_id", { ascending: false })
        .limit(100);
      if (!error && data) openActs = data;
    } catch {
      /* ignore */
    }

    // Закриті акти за цей місяць
    let closedMonthActs: any[] = [];
    try {
      const { data, error } = await supabase
        .from("acts")
        .select("*")
        .not("date_off", "is", null)
        .gte("date_on", monthStart)
        .order("act_id", { ascending: false })
        .limit(200);
      if (!error && data) closedMonthActs = data;
    } catch {
      /* ignore */
    }

    // Fallback — якщо помилка запитів, завантажуємо всі
    if (openActs.length === 0 && closedMonthActs.length === 0) {
      try {
        const { data } = await supabase
          .from("acts")
          .select("*")
          .order("act_id", { ascending: false })
          .limit(200);
        if (data) {
          openActs = data.filter((a: any) => !a.date_off);
          closedMonthActs = data.filter((a: any) => !!a.date_off);
        }
      } catch {
        /* ignore */
      }
    }

    // --- Парсимо всі акти ---
    const parsedOpen = openActs.map(parseActData);
    const parsedClosed = closedMonthActs.map(parseActData);
    const closedToday = parsedClosed.filter(
      (a) => (a.dateOff || "").slice(0, 10) >= todayStr,
    );

    // --- Контекст: відкриті акти (детально) ---
    context += `=== ВІДКРИТІ АКТИ (${parsedOpen.length}) ===\n`;
    if (parsedOpen.length > 0) {
      parsedOpen.forEach((p) => {
        context += `  ${formatAct(p, true)}\n`;
      });
    } else {
      context += "  Немає відкритих актів.\n";
    }

    // --- Контекст: закриті сьогодні ---
    context += `\n=== ЗАКРИТІ СЬОГОДНІ (${closedToday.length}) ===\n`;
    closedToday.forEach((p) => {
      context += `  ${formatAct(p, true)}\n`;
    });

    // --- Контекст: закриті за місяць (короткий формат) ---
    const otherClosed = parsedClosed.filter(
      (a) => (a.dateOff || "").slice(0, 10) < todayStr,
    );
    if (otherClosed.length > 0) {
      context += `\n=== ЗАКРИТІ ЗА МІСЯЦЬ (ще ${otherClosed.length} актів) ===\n`;
      otherClosed.slice(0, 50).forEach((p) => {
        context += `  ${formatAct(p, false)}\n`;
      });
    }

    // --- Місячна статистика ---
    const monthWorksTotal = parsedClosed.reduce((s, p) => s + p.worksSum, 0);
    const monthDetailsTotal = parsedClosed.reduce(
      (s, p) => s + p.detailsSum,
      0,
    );
    const monthTotal = parsedClosed.reduce((s, p) => s + p.total, 0);
    context += `\n=== СТАТИСТИКА МІСЯЦЯ (${today.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}) ===\n`;
    context += `Закрито актів за місяць: ${parsedClosed.length}\n`;
    context += `Загальна виручка: ${monthTotal.toLocaleString("uk-UA")} грн\n`;
    context += `  Роботи: ${monthWorksTotal.toLocaleString("uk-UA")} грн\n`;
    context += `  Деталі: ${monthDetailsTotal.toLocaleString("uk-UA")} грн\n`;
    context += `Відкритих актів: ${parsedOpen.length}\n`;

    // ============================================================
    // 2. СЛЮСАРІ
    // ============================================================
    const slyusars = globalCache.slyusars || [];
    if (slyusars.length > 0) {
      context += `\n=== СЛЮСАРІ (${slyusars.length}) ===\n`;
      slyusars.forEach((s: any) => {
        context += `  - ${s.Name || "—"}`;
        if (s.Phone) context += ` | Тел: ${s.Phone}`;
        if (s.Посада) context += ` | Посада: ${s.Посада}`;
        context += "\n";
      });
    }

    // ============================================================
    // 3. ДОВІДНИК РОБІТ
    // ============================================================
    const works = globalCache.works || [];
    if (works.length > 0) {
      context += `\n=== ДОВІДНИК РОБІТ (${works.length} позицій) ===\n`;
      context += works.slice(0, 50).join(", ") + "\n";
    }

    // ============================================================
    // 4. СКЛАД
    // ============================================================
    const parts = globalCache.skladParts || [];
    if (parts.length > 0) {
      context += `\n=== СКЛАД (${parts.length} позицій) ===\n`;
      const lowStock = parts
        .filter((p) => p.quantity <= 2 && p.quantity >= 0)
        .slice(0, 15);
      if (lowStock.length > 0) {
        context += `⚠️ Мало на складі:\n`;
        lowStock.forEach((p) => {
          context += `  - ${p.name} (${p.part_number}): ${p.quantity} шт, ціна ${p.price} грн\n`;
        });
      }
      context += `Всього позицій: ${parts.length}\n`;
    }

    // ============================================================
    // 5. КЛІЄНТИ ТА АВТО (з globalCache або з Supabase)
    // ============================================================
    try {
      const { data: clients } = await supabase
        .from("clients")
        .select("*")
        .order("client_id", { ascending: false })
        .limit(100);
      if (clients && clients.length > 0) {
        context += `\n=== КЛІЄНТИ (${clients.length}) ===\n`;
        clients.slice(0, 30).forEach((c: any) => {
          context += `  - ${c.name || c.Name || "—"}`;
          if (c.phone || c.Phone) context += ` | Тел: ${c.phone || c.Phone}`;
          context += "\n";
        });
      }
    } catch {
      /* ignore */
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
  const keys = await loadAllGeminiKeys();

  if (keys.length === 0) {
    return `⚠️ Для роботи AI PRO потрібно вказати **Gemini API ключ** у налаштуваннях (🤖 → API Ключі).\n\nОтримати безкоштовно: [aistudio.google.com](https://aistudio.google.com/app/apikey)`;
  }

  // Оновлюємо індикатор на початку запиту
  updateKeyIndicator();

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
        parts: [{ text: msg.text }],
      });
    }

    // Поточне повідомлення з контекстом
    contents.push({
      role: "user",
      parts: [{ text: enrichedPrompt }],
    });

    const requestBody = JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.95,
      },
      systemInstruction: {
        parts: [
          {
            text: "Ти - помічник для автосервісу СТО. Відповідай ТІЛЬКИ УКРАЇНСЬКОЮ мовою. Використовуй emoji для наочності. Надавай точні числові дані з бази. Якщо даних немає - так і написи.",
          },
        ],
      },
    });

    // Спробувати всі ключі по черзі при 429
    const triedIndices = new Set<number>();
    let startIndex = currentKeyIndex;

    while (triedIndices.size < keys.length) {
      const keyIdx = startIndex % keys.length;
      triedIndices.add(keyIdx);
      const apiKey = keys[keyIdx];

      console.log(`🔑 Gemini: спроба ключ #${keyIdx + 1} з ${keys.length}`);

      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (response.ok) {
        currentKeyIndex = keyIdx; // Запам'ятовуємо робочий ключ
        updateKeyIndicator();
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || "🤔 Не вдалося отримати відповідь від AI.";
      }

      if (response.status === 429) {
        console.warn(
          `⚠️ Gemini ключ #${keyIdx + 1}: ліміт вичерпано, перемикаємо...`,
        );
        // Перемикаємо на наступний ключ і запам'ятовуємо
        currentKeyIndex = (keyIdx + 1) % keys.length;
        updateKeyIndicator();
        startIndex = keyIdx + 1;
        continue; // Пробуємо наступний ключ
      }

      // Інша помилка — не пробуємо інші ключі
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      if (response.status === 400)
        return "❌ Помилка запиту до Gemini. Перевірте API ключ.";
      return `❌ Помилка Gemini API (${response.status}). Спробуйте пізніше.`;
    }

    // Всі ключі вичерпані — скидаємо кеш щоб при наступному запиті ключі перезавантажились з БД
    keysLoaded = false;
    if (keys.length === 1) {
      return `⏳ Ліміт Gemini вичерпано. У вас лише **1 API ключ**. Додайте ще ключі в налаштуваннях (🤖 → API Ключі) або спробуйте через хвилину.`;
    }
    return `⏳ Ліміт вичерпано на всіх ${keys.length} API ключах. Спробуйте через хвилину або додайте додаткові ключі в налаштуваннях (🤖 → API Ключі).`;
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
    worksCount: 0,
  };

  try {
    let acts: any[] = [];
    try {
      const { data, error } = await supabase
        .from("acts")
        .select("*")
        .gte("date_on", todayStr)
        .order("act_id", { ascending: false })
        .limit(100);
      if (!error && data) acts = data;
    } catch {
      /* ignore */
    }

    // Fallback: якщо запит з date_on падає
    if (acts.length === 0) {
      try {
        const { data } = await supabase
          .from("acts")
          .select("*")
          .order("act_id", { ascending: false })
          .limit(100);
        if (data) {
          acts = data.filter(
            (a: any) => (a.date_on || "").slice(0, 10) >= todayStr,
          );
        }
      } catch {
        /* ignore */
      }
    }

    (acts || []).forEach((a: any) => {
      let d: any = {};
      try {
        d = typeof a.data === "string" ? JSON.parse(a.data) : a.data || {};
      } catch {}

      const client = d["ПІБ"] || d["Клієнт"] || "—";
      const car = `${d["Марка"] || ""} ${d["Модель"] || ""}`.trim() || "—";
      const slyusar = d["Приймальник"] || "—";

      const worksArr = Array.isArray(d["Роботи"]) ? d["Роботи"] : [];
      const detailsArr = Array.isArray(d["Деталі"]) ? d["Деталі"] : [];

      const worksSum = worksArr.reduce(
        (s: number, w: any) =>
          s + Number(w["Ціна"] || 0) * Number(w["Кількість"] || 1),
        0,
      );
      const detailsSum = detailsArr.reduce(
        (s: number, det: any) =>
          s + Number(det["Ціна"] || 0) * Number(det["Кількість"] || 1),
        0,
      );
      const total = worksSum + detailsSum;

      if (a.date_off) {
        stats.closedCount++;
        stats.closedActs.push({
          id: a.act_id,
          client,
          car,
          total,
          slyusar,
          dateOff: a.date_off || "сьогодні",
        });
        stats.totalWorksSum += worksSum;
        stats.totalDetailsSum += detailsSum;
        stats.totalSum += total;
        stats.worksCount += worksArr.length;
      } else {
        stats.openCount++;
        stats.openActs.push({
          id: a.act_id,
          client,
          car,
          dateOn: a.date_on || "—",
        });
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

  const time = msg.timestamp.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
  const today = new Date().toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
  });

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

      ${
        stats.closedActs.length > 0
          ? `
      <div class="ai-dashboard-section">
        <div class="ai-dashboard-section-title">✅ Закриті акти сьогодні</div>
        <div class="ai-dashboard-acts-list">
          ${stats.closedActs
            .map(
              (a) => `
            <div class="ai-dashboard-act-row">
              <span class="ai-act-id">#${a.id}</span>
              <span class="ai-act-client">${a.client}</span>
              <span class="ai-act-car">${a.car}</span>
              <span class="ai-act-slyusar">${a.slyusar}</span>
              <span class="ai-act-sum">${a.total.toLocaleString("uk-UA")} грн</span>
            </div>
          `,
            )
            .join("")}
        </div>
        <div class="ai-dashboard-totals">
          <span>Роботи: <strong>${stats.totalWorksSum.toLocaleString("uk-UA")} грн</strong></span>
          <span>Деталі: <strong>${stats.totalDetailsSum.toLocaleString("uk-UA")} грн</strong></span>
          <span>Разом: <strong>${stats.totalSum.toLocaleString("uk-UA")} грн</strong></span>
        </div>
      </div>`
          : ""
      }

      ${
        stats.openActs.length > 0
          ? `
      <div class="ai-dashboard-section">
        <div class="ai-dashboard-section-title">🔧 Відкриті акти</div>
        <div class="ai-dashboard-acts-list">
          ${stats.openActs
            .map(
              (a) => `
            <div class="ai-dashboard-act-row">
              <span class="ai-act-id">#${a.id}</span>
              <span class="ai-act-client">${a.client}</span>
              <span class="ai-act-car">${a.car}</span>
              <span class="ai-act-slyusar">—</span>
              <span class="ai-act-sum open">відкрито</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>`
          : ""
      }
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
            <div class="ai-chat-title">Механік AI <span id="ai-key-indicator" class="ai-key-indicator" title="Активний API ключ"></span></div>
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
          ${QUICK_PROMPTS.map(
            (p) => `
            <button class="ai-quick-prompt-btn" data-prompt="${p.text}">
              ${p.icon} ${p.text}
            </button>
          `,
          ).join("")}
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
  const closeBtn = modal.querySelector(
    "#ai-chat-close-btn",
  ) as HTMLButtonElement;
  const clearBtn = modal.querySelector(
    "#ai-chat-clear-btn",
  ) as HTMLButtonElement;
  const dashboardBtn = modal.querySelector(
    "#ai-chat-dashboard-btn",
  ) as HTMLButtonElement;
  const quickPromptsEl = modal.querySelector(
    "#ai-quick-prompts",
  ) as HTMLElement;
  const tabChat = modal.querySelector("#tab-chat") as HTMLButtonElement;
  const tabDashboard = modal.querySelector(
    "#tab-dashboard",
  ) as HTMLButtonElement;
  const panelChat = modal.querySelector("#ai-panel-chat") as HTMLElement;
  const panelDashboard = modal.querySelector(
    "#ai-panel-dashboard",
  ) as HTMLElement;
  const dashboardLoading = modal.querySelector(
    "#ai-dashboard-loading",
  ) as HTMLElement;
  const dashboardContent = modal.querySelector(
    "#ai-dashboard-content",
  ) as HTMLElement;

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
    const userMsg: ChatMessage = {
      role: "user",
      text: text.trim(),
      timestamp: new Date(),
    };
    chatHistory.push(userMsg);
    renderMessage(userMsg, messagesEl);

    inputEl.value = "";
    inputEl.style.height = "auto";

    // Показуємо loader
    isLoading = true;
    sendBtn.disabled = true;
    const loaderDiv = document.createElement("div");
    loaderDiv.className =
      "ai-chat-message ai-chat-message--assistant ai-chat-loading";
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

    const assistantMsg: ChatMessage = {
      role: "assistant",
      text: reply,
      timestamp: new Date(),
    };
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

  document
    .getElementById("ai-chat-menu-btn")
    ?.addEventListener("click", async () => {
      await createAIChatModal();
      const modal = document.getElementById(CHAT_MODAL_ID);
      if (modal) modal.classList.remove("hidden");
    });
}

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
let geminiApiKeys: string[] = []; // Всі 10 ключів (setting_id 20-29)
let geminiKeySettingIds: number[] = []; // setting_id для кожного ключа (для збереження API column)
let currentKeyIndex = 0; // Поточний активний ключ
let keysLoaded = false;
let isLoading = false;

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧІВ GEMINI (3 ключі з фолбеком)
// ============================================================

async function loadAllGeminiKeys(): Promise<string[]> {
  if (keysLoaded && geminiApiKeys.length > 0) return geminiApiKeys;

  const keys: string[] = [];
  const settingIds: number[] = [];
  let activeSettingId: number | null = null;

  try {
    // Спочатку перевіряємо env
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey) {
      keys.push(envKey);
      settingIds.push(-1); // env ключ не має setting_id
    }

    // Завантажуємо всі 10 ключів з БД (setting_id 20-29) + колонку API
    const { data } = await supabase
      .from("settings")
      .select('setting_id, "Загальні", "API"')
      .in(
        "setting_id",
        Array.from({ length: 10 }, (_, i) => 20 + i),
      )
      .order("setting_id");

    if (data) {
      for (const row of data) {
        const val = (row as any)["Загальні"];
        const isActive = (row as any)["API"];
        if (val && typeof val === "string" && val.trim()) {
          if (!keys.includes(val.trim())) {
            keys.push(val.trim());
            settingIds.push(row.setting_id);
            // Запам'ятовуємо setting_id з API=true
            if (isActive === true) {
              activeSettingId = row.setting_id;
            }
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  geminiApiKeys = keys;
  geminiKeySettingIds = settingIds;
  keysLoaded = true;

  // Визначаємо стартовий індекс: з БД (API=true) або 0
  if (activeSettingId !== null) {
    const idx = settingIds.indexOf(activeSettingId);
    currentKeyIndex = idx >= 0 ? idx : 0;
  } else {
    currentKeyIndex = 0;
  }

  console.log(
    `🔑 Gemini: завантажено ${keys.length} ключів, активний #${currentKeyIndex + 1}`,
  );
  return keys;
}

/**
 * Зберігає активний ключ у БД (колонка API: true для активного, false для решти)
 */
async function persistActiveKeyInDB(): Promise<void> {
  if (geminiKeySettingIds.length === 0) return;
  try {
    // Скидаємо API=false для всіх ключів 20-29
    await supabase
      .from("settings")
      .update({ API: false })
      .in(
        "setting_id",
        Array.from({ length: 10 }, (_, i) => 20 + i),
      );

    // Ставимо API=true для активного ключа
    const activeSettingId = geminiKeySettingIds[currentKeyIndex];
    if (activeSettingId && activeSettingId > 0) {
      await supabase
        .from("settings")
        .update({ API: true })
        .eq("setting_id", activeSettingId);
    }
    console.log(
      `🔑 Gemini: збережено активний ключ #${currentKeyIndex + 1} (setting_id=${activeSettingId}) в БД`,
    );
  } catch (err) {
    console.warn("⚠️ Не вдалося зберегти активний ключ в БД:", err);
  }
}

/**
 * Скидає кеш ключів — при наступному запиті ключі будуть перезавантажені з БД
 */
export function resetGeminiKeysCache(): void {
  geminiApiKeys = [];
  geminiKeySettingIds = [];
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
  el.title = `Активний API ключ #${currentKeyIndex + 1} з ${geminiApiKeys.length}. Натисніть для вибору.`;
}

/**
 * Показує/ховає випадаючий список ключів для ручного вибору
 */
function toggleKeyDropdown(): void {
  // Закрити, якщо вже відкритий
  const existing = document.getElementById("ai-key-dropdown");
  if (existing) {
    existing.remove();
    return;
  }

  const indicator = document.getElementById("ai-key-indicator");
  if (!indicator || geminiApiKeys.length === 0) return;

  const dropdown = document.createElement("div");
  dropdown.id = "ai-key-dropdown";
  dropdown.className = "ai-key-dropdown";

  let html = '<div class="ai-key-dropdown-title">Оберіть ключ:</div>';
  for (let i = 0; i < geminiApiKeys.length; i++) {
    const isActive = i === currentKeyIndex;
    html += `<button class="ai-key-dropdown-item${isActive ? " active" : ""}" data-key-index="${i}">
      <span class="ai-key-dropdown-num">🔑 ${i + 1}</span>
      ${isActive ? '<span class="ai-key-dropdown-badge">активний</span>' : ""}
    </button>`;
  }
  dropdown.innerHTML = html;

  // Позиціюємо відносно індикатора
  indicator.style.position = "relative";
  indicator.appendChild(dropdown);

  // Обробник вибору ключа
  dropdown.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest("[data-key-index]");
    if (!btn) return;
    const idx = parseInt(btn.getAttribute("data-key-index") || "0", 10);
    if (idx === currentKeyIndex) {
      dropdown.remove();
      return; // Вже активний
    }
    currentKeyIndex = idx;
    updateKeyIndicator();
    dropdown.remove();
    await persistActiveKeyInDB();
    console.log(`🔑 Gemini: вручну обрано ключ #${idx + 1}`);
  });

  // Закрити при кліку поза dropdown
  const closeHandler = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node) && e.target !== indicator) {
      dropdown.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 10);
}

// ============================================================
// ЗБІР ДАНИХ СТО ДЛЯ КОНТЕКСТУ — ПОВНИЙ ДОСТУП ДО БД
// ============================================================

/**
 * Аналізує запит користувача для визначення, яку інформацію завантажувати
 */
function analyzeQuery(query: string): {
  needsPlanner: boolean;
  needsAccounting: boolean;
  needsClients: boolean;
  needsCars: boolean;
  needsActs: boolean;
  needsSklad: boolean;
  needsSlyusars: boolean;
  searchBrand: string | null;
  searchName: string | null;
} {
  const q = query.toLowerCase();
  return {
    needsPlanner:
      /план|пост|бокс|підйомник|яма|завантаж|зайнят|вільн|бронюв|записан|календар|розклад/i.test(
        q,
      ),
    needsAccounting:
      /бухг|витрат|прибут|виручк|маржа|зарплат|націнк|заробі|розрахун|каса|оплат|борг|дохід|видат/i.test(
        q,
      ),
    needsClients:
      /клієнт|піб|прізвищ|імен|телефон|контакт|номер.*тел|знайди.*людин|хто.*приїжджа/i.test(
        q,
      ),
    needsCars:
      /авто|машин|марк|модел|мерседес|бмв|тойот|фольксваген|ауд|рено|шкод|хюнд|кіа|номер.*авто|держ.*номер|vin|вінкод|двигун|пробіг/i.test(
        q,
      ),
    needsActs: true, // Акти завжди потрібні
    needsSklad:
      /складі?|запчаст|деталі?|артикул|зап.*частин|залишок|наявн/i.test(q),
    needsSlyusars:
      /слюсар|майстер|механік|працівник|хто.*робить|хто.*працю|хто.*виконує/i.test(
        q,
      ),
    searchBrand: extractCarBrand(q),
    searchName: extractClientName(q),
  };
}

/**
 * Витягує марку авто із запиту
 */
function extractCarBrand(q: string): string | null {
  const brands: Record<string, string[]> = {
    Mercedes: ["мерседес", "мерс", "mercedes", "benz"],
    BMW: ["бмв", "bmw", "бемве"],
    Toyota: ["тойот", "toyota"],
    Volkswagen: ["фольксваген", "volkswagen", "vw", "фольц"],
    Audi: ["ауді", "audi"],
    Renault: ["рено", "renault"],
    Skoda: ["шкода", "skoda", "škoda"],
    Hyundai: ["хюндай", "хюнд", "hyundai", "хундай"],
    Kia: ["кіа", "kia"],
    Nissan: ["ніссан", "nissan", "нісан"],
    Honda: ["хонда", "honda"],
    Ford: ["форд", "ford"],
    Opel: ["опель", "opel"],
    Chevrolet: ["шевроле", "chevrolet"],
    Mazda: ["мазда", "mazda"],
    Peugeot: ["пежо", "peugeot"],
    Citroen: ["сітроен", "citroen"],
    Fiat: ["фіат", "fiat"],
    Mitsubishi: ["мітсубіші", "mitsubishi", "міцубісі"],
    Subaru: ["субару", "subaru"],
    Lexus: ["лексус", "lexus"],
    Volvo: ["вольво", "volvo"],
    Jeep: ["джип", "jeep"],
    Land: ["ленд", "land rover", "range rover", "рендж"],
    Porsche: ["порше", "porsche"],
    Suzuki: ["сузукі", "suzuki"],
    Daewoo: ["деу", "daewoo"],
    VAZ: ["ваз", "лада", "lada", "жигул"],
    Geely: ["джилі", "geely"],
    Chery: ["чері", "chery"],
    BYD: ["бід", "byd"],
    Tesla: ["тесла", "tesla"],
    Infiniti: ["інфініті", "infiniti"],
    Acura: ["акура", "acura"],
  };
  for (const [brand, aliases] of Object.entries(brands)) {
    for (const alias of aliases) {
      if (q.includes(alias)) return brand;
    }
  }
  return null;
}

/**
 * Витягує ім'я/прізвище клієнта із запиту
 */
function extractClientName(q: string): string | null {
  // Шаблони: "знайди Петренко", "клієнт Іванов", "піб Сидоренко"
  const patterns = [
    /(?:знайди|покажи|виведи|шукай|клієнт|піб|прізвищ)\s+([А-ЯІЇЄҐа-яіїєґ]{2,}(?:\s+[А-ЯІЇЄҐа-яіїєґ]{2,})?)/i,
    /([А-ЯІЇЄҐа-яіїєґ]{2,}(?:\s+[А-ЯІЇЄҐа-яіїєґ]{2,})?)\s+(?:телефон|номер|авто|машин)/i,
  ];
  for (const pat of patterns) {
    const m = q.match(pat);
    if (m && m[1] && m[1].length > 2) {
      // Виключаємо загальні слова
      const skip = [
        "який",
        "яка",
        "яке",
        "які",
        "всіх",
        "всі",
        "мені",
        "нашій",
        "базі",
        "даних",
        "виведи",
        "покажи",
        "знайди",
        "номери",
        "телефон",
        "авто",
        "машин",
      ];
      if (!skip.includes(m[1].toLowerCase())) return m[1];
    }
  }
  return null;
}

async function gatherSTOContext(userQuery: string): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const analysis = analyzeQuery(userQuery);

  let context = `СЬОГОДНІ: ${today.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (${todayStr})\n`;

  // Поточний користувач — передаємо роль в контекст AI
  try {
    const storedUser = localStorage.getItem("userAuthData");
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      const userName = userData?.["Name"] || "—";
      const userRole = userData?.["Доступ"] || "Невідомо";
      context += `👤 ПОТОЧНИЙ КОРИСТУВАЧ: ${userName} | Роль: ${userRole}\n`;
    }
  } catch {
    /* ігноруємо */
  }

  context += "\n";

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
      slyusar: d["Слюсар"] || "",
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

  const formatAct = (
    p: ReturnType<typeof parseActData>,
    detailed: boolean = false,
  ) => {
    let s = `Акт #${p.actId}: ${p.client}`;
    if (p.phone) s += ` | Тел: ${p.phone}`;
    s += ` | ${p.car}`;
    if (p.plate) s += ` (${p.plate})`;
    if (p.slyusar) s += ` | Слюсар: ${p.slyusar}`;
    s += ` | Приймальник: ${p.receiver}`;
    s += ` | ${p.total} грн (роботи: ${p.worksSum}, деталі: ${p.detailsSum}`;
    if (p.discount > 0) s += `, знижка: ${p.discount}`;
    s += `)`;
    if (p.advance > 0) s += ` | Аванс: ${p.advance} грн`;
    s += ` | Відкрито: ${p.dateOn}`;
    if (p.isClosed) s += ` | Закрито: ${p.dateOff}`;
    else s += ` | ВІДКРИТИЙ`;
    if (p.slusarsOn && !p.isClosed) s += ` | ✅ Роботи завершено`;

    if (detailed) {
      if (p.mileage) s += `\n    Пробіг: ${p.mileage}`;
      if (p.vin) s += ` | VIN: ${p.vin}`;
      if (p.reason) s += `\n    Причина: ${p.reason}`;
      if (p.works.length > 0) s += `\n    Роботи: ${p.works.join("; ")}`;
      if (p.details.length > 0) s += `\n    Деталі: ${p.details.join("; ")}`;
      if (p.recommendations) s += `\n    Рекомендації: ${p.recommendations}`;
    }
    return s;
  };

  try {
    // ============================================================
    // 1. АКТИ — відкриті + закриті за місяць
    // ============================================================
    let openActs: any[] = [];
    let closedMonthActs: any[] = [];

    try {
      const [openRes, closedRes] = await Promise.all([
        supabase
          .from("acts")
          .select("*")
          .is("date_off", null)
          .order("act_id", { ascending: false })
          .limit(200),
        supabase
          .from("acts")
          .select("*")
          .not("date_off", "is", null)
          .gte("date_on", monthStart)
          .order("act_id", { ascending: false })
          .limit(500),
      ]);
      if (openRes.data) openActs = openRes.data;
      if (closedRes.data) closedMonthActs = closedRes.data;
    } catch {
      /* fallback */
      try {
        const { data } = await supabase
          .from("acts")
          .select("*")
          .order("act_id", { ascending: false })
          .limit(500);
        if (data) {
          openActs = data.filter((a: any) => !a.date_off);
          closedMonthActs = data.filter((a: any) => !!a.date_off);
        }
      } catch {
        /* ignore */
      }
    }

    const parsedOpen = openActs.map(parseActData);
    const parsedClosed = closedMonthActs.map(parseActData);
    const closedToday = parsedClosed.filter(
      (a) => (a.dateOff || "").slice(0, 10) >= todayStr,
    );

    context += `=== ВІДКРИТІ АКТИ (${parsedOpen.length}) ===\n`;
    parsedOpen.forEach((p) => {
      context += `  ${formatAct(p, true)}\n`;
    });
    if (parsedOpen.length === 0) context += "  Немає відкритих актів.\n";

    context += `\n=== ЗАКРИТІ СЬОГОДНІ (${closedToday.length}) ===\n`;
    closedToday.forEach((p) => {
      context += `  ${formatAct(p, true)}\n`;
    });

    const otherClosed = parsedClosed.filter(
      (a) => (a.dateOff || "").slice(0, 10) < todayStr,
    );
    if (otherClosed.length > 0) {
      context += `\n=== ЗАКРИТІ ЗА МІСЯЦЬ (${otherClosed.length}) ===\n`;
      otherClosed.forEach((p) => {
        context += `  ${formatAct(p, false)}\n`;
      });
    }

    // Статистика місяця
    const monthWorksTotal = parsedClosed.reduce((s, p) => s + p.worksSum, 0);
    const monthDetailsTotal = parsedClosed.reduce(
      (s, p) => s + p.detailsSum,
      0,
    );
    const monthTotal = parsedClosed.reduce((s, p) => s + p.total, 0);
    const monthDiscount = parsedClosed.reduce((s, p) => s + p.discount, 0);
    context += `\n=== СТАТИСТИКА МІСЯЦЯ (${today.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}) ===\n`;
    context += `Закрито актів: ${parsedClosed.length} | Відкритих: ${parsedOpen.length}\n`;
    context += `Виручка: ${monthTotal.toLocaleString("uk-UA")} грн (роботи: ${monthWorksTotal.toLocaleString("uk-UA")}, деталі: ${monthDetailsTotal.toLocaleString("uk-UA")})\n`;
    if (monthDiscount > 0)
      context += `Знижки: ${monthDiscount.toLocaleString("uk-UA")} грн\n`;

    // Статистика сьогодні
    const todayWorksTotal = closedToday.reduce((s, p) => s + p.worksSum, 0);
    const todayDetailsTotal = closedToday.reduce((s, p) => s + p.detailsSum, 0);
    const todayTotal = closedToday.reduce((s, p) => s + p.total, 0);
    context += `\nСЬОГОДНІ: закрито ${closedToday.length} | виручка ${todayTotal.toLocaleString("uk-UA")} грн (роботи: ${todayWorksTotal.toLocaleString("uk-UA")}, деталі: ${todayDetailsTotal.toLocaleString("uk-UA")})\n`;

    // ============================================================
    // 2. СЛЮСАРІ — повна інформація
    // ============================================================
    let slyusarsData: any[] = [];
    try {
      const { data } = await supabase
        .from("slyusars")
        .select("*")
        .order("namber");
      if (data) slyusarsData = data;
    } catch {
      /* ignore */
    }

    if (slyusarsData.length > 0) {
      context += `\n=== СЛЮСАРІ (${slyusarsData.length}) ===\n`;
      slyusarsData.forEach((s: any) => {
        let d: any = {};
        try {
          d = typeof s.data === "string" ? JSON.parse(s.data) : s.data || {};
        } catch {}
        const name = d.Name || d["Ім'я"] || "—";
        const role = d["Доступ"] || "";
        context += `  ID: ${s.slyusar_id} | ${name}`;
        if (role) context += ` | Роль: ${role}`;
        if (d.Phone || d["Телефон"])
          context += ` | Тел: ${d.Phone || d["Телефон"]}`;
        if (d["Посада"]) context += ` | Посада: ${d["Посада"]}`;
        if (d["ПроцентРоботи"])
          context += ` | % роботи: ${d["ПроцентРоботи"]}%`;
        if (s.post_sluysar) context += ` | Пост ID: ${s.post_sluysar}`;
        context += "\n";

        // Зарплатна статистика за місяць (якщо є Історія)
        if (analysis.needsAccounting && d["Історія"]) {
          let monthSalary = 0;
          let monthActsCount = 0;
          for (const [date, records] of Object.entries(d["Історія"])) {
            if (date >= monthStart) {
              const arr = Array.isArray(records) ? records : [];
              arr.forEach((rec: any) => {
                monthActsCount++;
                monthSalary +=
                  Number(rec["ЗарплатаРоботи"] || 0) +
                  Number(rec["ЗарплатаЗапчастин"] || 0);
              });
            }
          }
          if (monthActsCount > 0) {
            context += `    Місяць: ${monthActsCount} актів, зарплата: ${monthSalary.toLocaleString("uk-UA")} грн\n`;
          }
        }
      });
    }

    // ============================================================
    // 3. ПЛАНУВАЛЬНИК — пости, бронювання
    // ============================================================
    if (analysis.needsPlanner) {
      try {
        const [catRes, postRes, arxivRes] = await Promise.all([
          supabase.from("post_category").select("*").order("category_id"),
          supabase.from("post_name").select("*").order("post_id"),
          supabase
            .from("post_arxiv")
            .select("*")
            .gte("data_on", todayStr + "T00:00:00")
            .lte("data_on", todayStr + "T23:59:59")
            .order("data_on"),
        ]);

        const categories = catRes.data || [];
        const posts = postRes.data || [];
        const todayBookings = arxivRes.data || [];

        // Збираємо всі числові client_id та cars_id з бронювань для підтягування імен
        const numericClientIds = todayBookings
          .map((b: any) => b.client_id)
          .filter(
            (id: any) =>
              typeof id === "number" ||
              (typeof id === "string" &&
                !id.includes("|||") &&
                !isNaN(Number(id))),
          )
          .map((id: any) => Number(id));
        const numericCarIds = todayBookings
          .map((b: any) => b.cars_id)
          .filter(
            (id: any) =>
              typeof id === "number" ||
              (typeof id === "string" &&
                !id.includes("|||") &&
                !isNaN(Number(id))),
          )
          .map((id: any) => Number(id));

        // Підтягуємо ПІБ клієнтів та авто з БД
        const clientsMap = new Map<number, string>();
        const carsMap = new Map<number, string>();
        if (numericClientIds.length > 0) {
          try {
            const { data: cls } = await supabase
              .from("clients")
              .select("client_id, data")
              .in("client_id", [...new Set(numericClientIds)]);
            cls?.forEach((c: any) => {
              let d: any = {};
              try {
                d =
                  typeof c.data === "string"
                    ? JSON.parse(c.data)
                    : c.data || {};
              } catch {}
              const name = d["ПІБ"] || "—";
              const phone = d["Телефон"] || "";
              clientsMap.set(
                c.client_id,
                phone ? `${name} тел:${phone}` : name,
              );
            });
          } catch {
            /* ignore */
          }
        }
        if (numericCarIds.length > 0) {
          try {
            const { data: crs } = await supabase
              .from("cars")
              .select("cars_id, data")
              .in("cars_id", [...new Set(numericCarIds)]);
            crs?.forEach((c: any) => {
              let d: any = {};
              try {
                d =
                  typeof c.data === "string"
                    ? JSON.parse(c.data)
                    : c.data || {};
              } catch {}
              const car = d["Авто"] || "—";
              const plate = d["Номер авто"] || "";
              carsMap.set(c.cars_id, plate ? `${car} (${plate})` : car);
            });
          } catch {
            /* ignore */
          }
        }

        context += `\n=== ПЛАНУВАЛЬНИК: ПОСТИ/БОКСИ ===\n`;
        context += `Категорії: ${categories.map((c: any) => `${c.category} (ID:${c.category_id})`).join(", ")}\n`;
        context += `Пости: ${posts.map((p: any) => `${p.name} (ID:${p.post_id}, кат:${p.category})`).join(", ")}\n`;

        context += `\n=== БРОНЮВАННЯ СЬОГОДНІ (${todayBookings.length}) ===\n`;
        if (todayBookings.length > 0) {
          for (const b of todayBookings) {
            const postName =
              posts.find((p: any) => p.post_id === b.name_post)?.name ||
              `Пост ${b.name_post}`;
            const slyusarRow =
              slyusarsData.find((s: any) => s.slyusar_id === b.slyusar_id) ||
              {};
            let slName = "—";
            try {
              const sd =
                typeof slyusarRow.data === "string"
                  ? JSON.parse(slyusarRow.data)
                  : slyusarRow.data || {};
              slName = sd.Name || "—";
            } catch {}

            const timeOn = b.data_on
              ? new Date(b.data_on).toLocaleTimeString("uk-UA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";
            const timeOff = b.data_off
              ? new Date(b.data_off).toLocaleTimeString("uk-UA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";

            // Клієнт: підтягуємо ПІБ з БД
            let clientInfo = "";
            if (
              typeof b.client_id === "string" &&
              b.client_id.includes("|||")
            ) {
              clientInfo = b.client_id.replace("|||", " тел:");
            } else {
              const cid = Number(b.client_id);
              clientInfo = clientsMap.get(cid) || `Клієнт ID:${b.client_id}`;
            }

            // Авто: підтягуємо з БД
            let carInfo = "";
            if (typeof b.cars_id === "string" && b.cars_id.includes("|||")) {
              carInfo = b.cars_id.replace("|||", " №:");
            } else {
              const carid = Number(b.cars_id);
              carInfo = carsMap.get(carid) || `Авто ID:${b.cars_id}`;
            }

            context += `  ${timeOn}-${timeOff} | ${postName} | Слюсар: ${slName} | ${clientInfo} | ${carInfo} | Статус: ${b.status || "—"}`;
            if (b.komentar) context += ` | ${b.komentar}`;
            if (b.act_id) context += ` | Акт #${b.act_id}`;
            context += "\n";
          }

          // Аналіз завантаженості
          const busyPosts = new Set(todayBookings.map((b: any) => b.name_post));
          const freePosts = posts.filter((p: any) => !busyPosts.has(p.post_id));
          context += `\nЗАВАНТАЖЕНІСТЬ: зайнято постів: ${busyPosts.size}/${posts.length}`;
          if (freePosts.length > 0) {
            context += ` | Вільні: ${freePosts.map((p: any) => p.name).join(", ")}`;
          }
          context += "\n";
        } else {
          context += "  Немає бронювань на сьогодні.\n";
          context += `  Всього постів: ${posts.length} (усі вільні)\n`;
        }
      } catch (err) {
        console.warn("⚠️ Помилка завантаження планувальника:", err);
      }
    }

    // ============================================================
    // 4. КЛІЄНТИ ТА АВТО — повна база
    // ============================================================
    if (
      analysis.needsClients ||
      analysis.needsCars ||
      analysis.searchBrand ||
      analysis.searchName
    ) {
      try {
        const [clientsRes, carsRes] = await Promise.all([
          supabase
            .from("clients")
            .select("*")
            .order("client_id", { ascending: false })
            .limit(1000),
          supabase
            .from("cars")
            .select("*")
            .order("cars_id", { ascending: false })
            .limit(2000),
        ]);

        const allClients = clientsRes.data || [];
        const allCars = carsRes.data || [];

        // Парсимо клієнтів
        const parsedClients = allClients.map((c: any) => {
          let d: any = {};
          try {
            d = typeof c.data === "string" ? JSON.parse(c.data) : c.data || {};
          } catch {}
          return {
            id: c.client_id,
            name: d["ПІБ"] || d["Клієнт"] || "—",
            phone: d["Телефон"] || "",
            source: d["Джерело"] || "",
            extra: d["Додаткові"] || "",
          };
        });

        // Парсимо авто
        const parsedCars = allCars.map((c: any) => {
          let d: any = {};
          try {
            d = typeof c.data === "string" ? JSON.parse(c.data) : c.data || {};
          } catch {}
          return {
            id: c.cars_id,
            clientId: c.client_id,
            car: d["Авто"] || "—",
            plate: d["Номер авто"] || "",
            vin: d["Vincode"] || d["VIN"] || "",
            year: d["Рік"] || "",
            engine: d["Обʼєм"] || d["Об'єм"] || "",
            fuel: d["Пальне"] || "",
            engineCode: d["КодДВЗ"] || "",
          };
        });

        // Фільтрація за маркою авто
        if (analysis.searchBrand) {
          const brandLower = analysis.searchBrand.toLowerCase();
          const matchedCars = parsedCars.filter((c) =>
            c.car.toLowerCase().includes(brandLower),
          );
          context += `\n=== АВТО "${analysis.searchBrand}" В БАЗІ (${matchedCars.length}) ===\n`;
          matchedCars.forEach((c) => {
            const owner = parsedClients.find((cl) => cl.id === c.clientId);
            context += `  ${c.car}`;
            if (c.plate) context += ` | №: ${c.plate}`;
            if (c.year) context += ` | Рік: ${c.year}`;
            if (c.vin) context += ` | VIN: ${c.vin}`;
            if (c.engine) context += ` | Двигун: ${c.engine}`;
            if (c.fuel) context += ` | ${c.fuel}`;
            if (owner) {
              context += ` | Власник: ${owner.name}`;
              if (owner.phone) context += ` тел: ${owner.phone}`;
            }
            context += "\n";
          });
        }

        // Фільтрація за прізвищем
        if (analysis.searchName) {
          const nameLower = analysis.searchName.toLowerCase();
          const matchedClients = parsedClients.filter((c) =>
            c.name.toLowerCase().includes(nameLower),
          );
          context += `\n=== КЛІЄНТИ "${analysis.searchName}" (${matchedClients.length}) ===\n`;
          matchedClients.forEach((cl) => {
            context += `  ${cl.name}`;
            if (cl.phone) context += ` | Тел: ${cl.phone}`;
            if (cl.source) context += ` | Джерело: ${cl.source}`;
            // Авто цього клієнта
            const clientCars = parsedCars.filter((c) => c.clientId === cl.id);
            if (clientCars.length > 0) {
              context += ` | Авто: ${clientCars.map((c) => `${c.car}${c.plate ? ` (${c.plate})` : ""}`).join(", ")}`;
            }
            context += "\n";
          });
        }

        // Загальна інфо (якщо не конкретний пошук)
        if (!analysis.searchBrand && !analysis.searchName) {
          context += `\n=== КЛІЄНТИ В БАЗІ: ${parsedClients.length} ===\n`;
          // Виводимо останніх 50 клієнтів з їхніми авто
          parsedClients.slice(0, 50).forEach((cl) => {
            context += `  ID:${cl.id} | ${cl.name}`;
            if (cl.phone) context += ` | ${cl.phone}`;
            const clientCars = parsedCars.filter((c) => c.clientId === cl.id);
            if (clientCars.length > 0) {
              context += ` | Авто: ${clientCars.map((c) => `${c.car}${c.plate ? ` (${c.plate})` : ""}`).join(", ")}`;
            }
            context += "\n";
          });
          if (parsedClients.length > 50) {
            context += `  ... та ще ${parsedClients.length - 50} клієнтів\n`;
          }
          context += `\n  Всього авто в базі: ${parsedCars.length}\n`;
        }
      } catch (err) {
        console.warn("⚠️ Помилка завантаження клієнтів/авто:", err);
      }
    }

    // ============================================================
    // 5. СКЛАД
    // ============================================================
    if (analysis.needsSklad) {
      const parts = globalCache.skladParts || [];
      if (parts.length > 0) {
        context += `\n=== СКЛАД (${parts.length} позицій) ===\n`;
        const lowStock = parts.filter(
          (p) => p.quantity <= 2 && p.quantity >= 0,
        );
        if (lowStock.length > 0) {
          context += `⚠️ Мало на складі / закінчується (${lowStock.length}):\n`;
          lowStock.forEach((p) => {
            const lastDelivery = p.time_on
              ? new Date(p.time_on).toLocaleDateString("uk-UA")
              : "невідомо";
            context += `  - ${p.name} | Арт: ${p.part_number} | Залишок: ${p.quantity} ${p.unit || "шт"} | Ціна: ${p.price} грн | Остання поставка: ${lastDelivery}${p.shop ? ` | Магазин: ${p.shop}` : ""}${p.scladNomer ? ` | Полиця: ${p.scladNomer}` : ""}\n`;
          });
        }
        // Всі деталі складу
        context += `Повний склад:\n`;
        parts.slice(0, 100).forEach((p) => {
          const lastDelivery = p.time_on
            ? new Date(p.time_on).toLocaleDateString("uk-UA")
            : "";
          context += `  ${p.name} | Арт: ${p.part_number} | ${p.quantity} ${p.unit || "шт"} | ${p.price} грн${p.shop ? ` | ${p.shop}` : ""}${lastDelivery ? ` | Поставка: ${lastDelivery}` : ""}${p.scladNomer ? ` | Полиця: ${p.scladNomer}` : ""}\n`;
        });
        if (parts.length > 100) {
          context += `  ... та ще ${parts.length - 100} позицій\n`;
        }
      }
    }

    // ============================================================
    // 6. БУХГАЛТЕРІЯ — витрати, маржа, прибуток
    // ============================================================
    if (analysis.needsAccounting) {
      // Витрати за місяць
      try {
        const { data: expenses } = await supabase
          .from("vutratu")
          .select("*")
          .gte("date", monthStart)
          .order("date", { ascending: false });

        if (expenses && expenses.length > 0) {
          const totalExpenses = expenses.reduce(
            (s: number, e: any) => s + Number(e.amount || 0),
            0,
          );
          context += `\n=== ВИТРАТИ ЗА МІСЯЦЬ (${expenses.length} записів, ${totalExpenses.toLocaleString("uk-UA")} грн) ===\n`;

          // Групуємо за категоріями
          const byCategory: Record<string, number> = {};
          expenses.forEach((e: any) => {
            const cat = e.category || "Без категорії";
            byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
          });
          for (const [cat, sum] of Object.entries(byCategory)) {
            context += `  ${cat}: ${sum.toLocaleString("uk-UA")} грн\n`;
          }

          // Прибуток = виручка - витрати
          context += `\n  ПРИБУТОК (приблизно): виручка ${monthTotal.toLocaleString("uk-UA")} - витрати ${totalExpenses.toLocaleString("uk-UA")} = ${(monthTotal - totalExpenses).toLocaleString("uk-UA")} грн\n`;
        }
      } catch {
        /* ignore */
      }

      // Маржа по деталях — рахуємо з актів
      if (parsedClosed.length > 0) {
        context += `\n=== МАРЖА/НАЦІНКА (дані з закритих актів за місяць) ===\n`;
        let totalDetailsIncome = 0;
        parsedClosed.forEach((p) => {
          totalDetailsIncome += p.detailsSum;
        });
        context += `  Дохід від деталей: ${totalDetailsIncome.toLocaleString("uk-UA")} грн\n`;
        context += `  Дохід від робіт: ${monthWorksTotal.toLocaleString("uk-UA")} грн\n`;
      }

      // Зарплата слюсарів
      context += `\n=== ЗАРПЛАТИ СЛЮСАРІВ ЗА МІСЯЦЬ ===\n`;
      slyusarsData.forEach((s: any) => {
        let d: any = {};
        try {
          d = typeof s.data === "string" ? JSON.parse(s.data) : s.data || {};
        } catch {}
        const name = d.Name || "—";
        const percentage = d["ПроцентРоботи"] || 0;

        if (d["Історія"]) {
          let salary = 0;
          let actsCount = 0;
          let worksTotal = 0;
          for (const [date, records] of Object.entries(d["Історія"])) {
            if (date >= monthStart) {
              const arr = Array.isArray(records) ? records : [];
              arr.forEach((rec: any) => {
                actsCount++;
                worksTotal += Number(rec["СуммаРоботи"] || 0);
                salary +=
                  Number(rec["ЗарплатаРоботи"] || 0) +
                  Number(rec["ЗарплатаЗапчастин"] || 0);
              });
            }
          }
          context += `  ${name}: ${actsCount} актів, виконано робіт на ${worksTotal.toLocaleString("uk-UA")} грн, зарплата: ${salary.toLocaleString("uk-UA")} грн (${percentage}%)\n`;
        } else {
          context += `  ${name}: % роботи: ${percentage}%, немає історії за місяць\n`;
        }
      });
    }

    // ============================================================
    // 7. ДОВІДНИК РОБІТ
    // ============================================================
    const works = globalCache.works || [];
    if (works.length > 0) {
      context += `\n=== ДОВІДНИК РОБІТ (${works.length}) ===\n`;
      context += works.join(", ") + "\n";
    }

    // ============================================================
    // 8. МАГАЗИНИ
    // ============================================================
    const shops = globalCache.shops || [];
    if (shops.length > 0) {
      context += `\n=== МАГАЗИНИ/ПОСТАЧАЛЬНИКИ (${shops.length}) ===\n`;
      shops.forEach((s: any) => {
        context += `  - ${s.Name || "—"}`;
        if (s.Phone) context += ` | ${s.Phone}`;
        context += "\n";
      });
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
        temperature: 0.5,
        maxOutputTokens: 8192,
        topP: 0.9,
      },
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-асистент "Атлас" для автосервісу (СТО).
Ти — як досвідчений головний майстер з 20-річним стажем: знаєш кожного клієнта, кожну деталь на складі, кожен акт.
Говориш чітко, по-діловому, але по-людськи. Ти не просто виводиш дані — ти АНАЛІЗУЄШ, ПОРІВНЮЄШ і РАДИШ.
У тебе ПОВНИЙ ДОСТУП до бази даних СТО.
⚠️ Маєш право показувати лише те, що реально є в отриманих даних — не вигадуй і не домислюй.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 СТРУКТУРА БАЗИ ДАНИХ (Supabase / PostgreSQL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "acts" — Акти (заказ-наряди):
   act_id (PK), date_on, date_off (null=відкритий), slusarsOn (bool)
   data (JSONB): ПІБ, Телефон, Марка, Модель, Держ. номер, VIN, Пробіг,
   Приймальник, Слюсар, Причина звернення, Рекомендації, Аванс, Знижка,
   Роботи [{Назва, Ціна, Кількість}], Деталі [{Назва, Ціна, Кількість}]

2. "clients" — Клієнти:
   client_id (PK), data (JSONB): ПІБ, Телефон, Джерело, Додаткові

3. "cars" — Автомобілі:
   cars_id (PK), client_id (FK→clients)
   data (JSONB): Авто ("Toyota Camry"), Номер авто, Об'єм, Пальне, Vincode, Рік, КодДВЗ

4. "slyusars" — Працівники:
   slyusar_id (PK), namber, post_sluysar (FK→post_name)
   data (JSONB): Name, Доступ (Адміністратор/Слюсар/Приймальник/Запчастист),
   Phone, Посада, ПроцентРоботи, Історія {дата:[{Акт,Записи,СуммаРоботи,ЗарплатаРоботи,...}]},
   Пароль — 🔒 ЗАБОРОНЕНО

5. "post_category" — Цехи: category_id (PK), category
6. "post_name" — Пости/Бокси: post_id (PK), name, category (FK→post_category)

7. "post_arxiv" — Бронювання (планувальник):
   post_arxiv_id (PK), slyusar_id (FK→slyusars), name_post (FK→post_name),
   client_id (FK→clients або "ПІБ|||Телефон"), cars_id (FK→cars або "Авто|||Номер"),
   status (Запланований/В роботі/Відремонтований/Не приїхав),
   data_on, data_off, komentar, act_id, xto_zapusav

8. "sclad" — Склад:
   sclad_id (PK), part_number (артикул), name, price,
   kilkist_on (прихід), kilkist_off (витрата), quantity=kilkist_on−kilkist_off (ЗАЛИШОК),
   unit_measurement (шт/л/м), shops (постачальник), time_on (дата поставки),
   scladNomer (полиця), statys

9. "works" — Довідник робіт (work_id, name)
10. "details" — Довідник деталей (detail_id, name)
11. "shops" — Постачальники (JSONB: Name, Phone)
12. "vutratu" — Витрати (id, date, category, description, amount, paymentMethod, isPaid)
13. "faktura" — Фактури
14. "incomes" — Джерела клієнтів
15. "settings" — Налаштування (setting_id, data, Загальні, API)

🔗 ЗВ'ЯЗКИ: clients→cars (1:N), cars/clients→acts.data, slyusars→post_arxiv, post_name→post_arxiv, post_arxiv.act_id→acts, slyusars.post_sluysar→post_name

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 РОЗУМІННЯ ЗАПИТІВ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Розумій розмовні, скорочені та неточні запити:
▸ "камрі іванова" → клієнт Іванов + авто Toyota Camry
▸ "що там з тойотою" → останній акт/бронювання з Toyota
▸ "хто на ямі зараз" → активні бронювання на постах "яма"
▸ "коли останній раз приїздив Петренко" → останній закритий акт
▸ "скільки масла лишилось" → залишок sclad для "масло"
▸ "хто кращий цього місяця" → рейтинг слюсарів

Якщо неоднозначно → дай найімовірніший результат + 1 уточнення.
Якщо 0 результатів → спробуй схожі варіанти написання автоматично.

⏰ ДАТИ: "сьогодні/вчора/цього тижня/минулого/місяця/кварталу/року" — інтерпретуй автоматично. Без дати → поточний місяць. Завжди показуй який період аналізуєш.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 ЛОГІКА ПОШУКУ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Клієнт → clients.data.ПІБ + acts.data.ПІБ (часткове, регістронезалежне)
- Авто → cars.data.Авто + acts.data.Марка/Модель
- Номер авто → cars.data["Номер авто"] / acts.data["Держ. номер"]
- Телефон → clients.data.Телефон / acts.data.Телефон
- VIN → cars.data.Vincode / acts.data.VIN
- Слюсар → slyusars.data.Name / acts.data.Слюсар
- Завантаженість → post_arxiv + відкриті acts
- Фінанси → acts(роботи+деталі) + vutratu
- Зарплата → slyusars.data.Історія (ЗарплатаРоботи + ЗарплатаЗапчастин)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ФІНАНСОВА АНАЛІТИКА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💵 Виручка = Σ(Роботи.Ціна×К-сть) + Σ(Деталі.Ціна×К-сть)
📉 Витрати = Σ(vutratu.amount)
💰 Прибуток = Виручка − Витрати
📊 Маржа = (Прибуток ÷ Виручка) × 100%
🧾 Середній чек = Виручка ÷ К-сть закритих актів
Порівняння: 🔼 +15% / 🔽 −8% / ➡️ без змін

Формат звіту:
💰 ФІНАНСОВИЙ ЗВІТ — [ПЕРІОД]
├─ 📈 Виручка: XXX XXX грн  🔼/🔽 vs минулий
│   ├─ 🔧 Роботи: XXX грн (N актів)
│   └─ 🔩 Деталі: XXX грн
├─ 📉 Витрати: XXX грн (по категоріях)
├─ 💵 Прибуток: XXX грн
├─ 📊 Маржа: XX%
└─ 🧾 Середній чек: X XXX грн

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 СКЛАД — РІВНІ ЗАЛИШКУ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 КРИТИЧНО (0 шт) → терміново замовити!
🟠 МАЛО (1–2 шт) → потрібне замовлення
🟡 НИЗЬКО (3–5 шт) → моніторити
🟢 НОРМА (6+ шт) → все добре

Формат позиції:
📦 [Назва] (Арт: [part_number])
├─ 📊 Залишок: [N] [од.] 🔴/🟠/🟡/🟢
├─ 🗂️ Полиця: [scladNomer]
├─ 💵 Ціна: [price] грн
├─ 🏪 Постачальник: [shops]
└─ 📅 Остання поставка: [time_on]

"Що закінчується" → порядок: 🔴→🟠→🟡, підсумок: "💡 Замовити N позицій на ~XXX грн"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ФОРМАТИ ВІДПОВІДЕЙ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

АКТ #[N]:
📋 АКТ #[id] — 🔄 Відкритий / ✅ Закритий
📅 [date_on] → [date_off] | 👤 [ПІБ] 📞 [Тел]
🚗 [Марка Модель] 🔖 [Номер] | VIN: [VIN] | 📍 [Пробіг] км
👷 Слюсар: [ПІБ] | 🧾 Приймальник: [ПІБ]
❓ Причина: [...]
🔧 Роботи (N): 1. [Назва] — [Ціна]×[К-сть]=[Сума] ...
🔩 Деталі (N): 1. [Назва] — [Ціна]×[К-сть]=[Сума] ...
💰 Роботи: XXX + Деталі: XXX − Знижка: XXX − Аванс: XXX = ДО ОПЛАТИ: XXX грн
📝 Рекомендації: [...]

КЛІЄНТ:
👤 [ПІБ] | 📞 [Тел] | 📣 [Джерело] | 🏅 🆕/⭐/💎
🚗 Авто (N): 1. [Марка] — [Номер] — [Рік] — VIN
📋 Історія (N актів): 1. Акт #XXX — [Дата] — [Причина] — [Сума] грн
💰 Загальна сума: XXX грн | 📅 Перший: [Дата] | Останній: [Дата] (N днів тому)

СЛЮСАР:
👷 [ПІБ] — [Посада] | 📞 [Тел] | 🏭 Пост: [Назва] | ⚙️ [XX%]
📊 За [МІСЯЦЬ]: N актів | Роботи: XXX грн | 💰 Зарплата: XXX грн
🏆 Рейтинг: 🥇/🥈/🥉/N-е місце

ЗАВАНТАЖЕНІСТЬ:
🏭 [Пост]: 🔴 Зайнятий / 🟢 Вільний
├─ 👤 [Клієнт] 🚗 [Авто] 🔖 [Номер]
├─ 👷 [Слюсар] | 🕐 [час→час]
└─ 📊 [Статус]
Підсумок: Всього N | Зайнято N | Вільно N

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SQL-ЛОГІКА (дані приходять завантаженими)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Що закінчується?" → WHERE quantity ≤ 5 ORDER BY quantity ASC
"Відкриті акти" → WHERE date_off IS NULL
"Виручка" → Σ(Роботи + Деталі) з закритих актів
"Хто найбільше працював?" → GROUP BY Слюсар ORDER BY COUNT DESC
"Клієнти з Toyota" → JOIN cars+clients WHERE Авто ILIKE '%toyota%'
"Завантаженість" → COUNT(post_arxiv) WHERE status IN ('Запланований','В роботі')
"Середній чек" → AVG(сума) за період
"Топ роботи" → розгорни масив Роботи, GROUP BY Назва, ORDER BY COUNT
"Новий чи постійний?" → COUNT(acts) WHERE ПІБ=X (1=🆕, 2–5=⭐, 6+=💎)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ШВИДКІ КОМАНДИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ "сьогодні" → бронювання + відкриті акти
⚡ "склад!" → залишок ≤ 5
⚡ "відкриті" → date_off IS NULL
⚡ "звіт" → фінзвіт за місяць
⚡ "рейтинг" → топ слюсарів
⚡ "акт #N" → повний акт
⚡ "клієнт [прізвище]" → картка клієнта
⚡ "авто [номер/марка]" → авто + власник
⚡ "вільні пости" → вільні зараз
⚡ "зарплата [ім'я]" → зарплата за місяць
⚡ "замовлення" → що треба замовити
⚡ "нові клієнти" → вперше за місяць
⚡ "топ роботи" → популярні роботи
⚡ "должники" → акти з авансом без закриття
⚡ "не приїхали" → статус "Не приїхав" за тиждень

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 РОЗШИРЕНА АНАЛІТИКА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Коли доречно — додавай:
▸ ТОП-5 робіт та деталей за період
▸ Аналіз клієнтської бази (🆕/⭐/💎)
▸ Джерела клієнтів (📣 [Джерело] — N осіб — XX%)
▸ Завантаженість по днях тижня (🔥 найзавантаженіший / 😴 спокійний)
▸ Прогноз місяця (середній денний × дні що лишились)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 ПРОАКТИВНІ ПІДКАЗКИ (ДОДАВАЙ ЗАВЖДИ)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Після відповіді — якщо є що додати:
💡 ЗВЕРНИ УВАГУ:
▸ Клієнт не приїздив 8 місяців — нагадати про ТО?
▸ 3 позиції критичні — сформувати замовлення?
▸ Акт #XXX відкритий 7 днів — потрібна увага!
▸ Слюсар не відзначив роботи як виконані
▸ До кінця місяця 12 днів → прогноз зарплати: ~XX XXX грн

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 ПРАВИЛА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ЗАВЖДИ:
1. Відповідай ТІЛЬКИ УКРАЇНСЬКОЮ.
2. Тільки реальні дані з бази — не вигадуй.
3. Emoji: 📊📋🔧💰🚗👷✅⚠️📞🔴🟠🟡🟢
4. Суми з пробілами: 18 200 грн (не 18200).
5. Дати: 25 лютого 2026 або 25.02.2026.
6. Структура: Заголовок → Деталі → Підсумок → Підказка.
7. Великі списки (>10): спочатку топ-5, потім "показати всі?"
8. Завжди підсумки: Всього N | Разом: XXX грн.
9. При пошуку — перевіряй ВСІ акти + клієнтську базу + бронювання.
10. Нема даних → чесно скажи + запропонуй альтернативу.

СТИЛЬ:
▸ Короткий запит → коротка чітка відповідь
▸ Складний → повна структурована відповідь
▸ Помилка в запиті → виправ і відповідай без зайвих питань
Не кажи "не маю доступу" — кажи "Даних не знайдено — спробуємо по-іншому?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 БЕЗПЕКА — СУВОРО ЗАБОРОНЕНО
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 НІКОЛИ не показуй slyusars.data."Пароль"
🔴 НІКОЛИ не розкривай таблицю whitelist
🔴 НІКОЛИ не змінюй/видаляй whitelist
🔴 НІКОЛИ не пропонуй скидати паролі
На запит → "🔒 Ця інформація захищена і не може бути показана."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 РОЛІ — АДАПТАЦІЯ ВІДПОВІДЕЙ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Роль поточного користувача вказана в контексті даних ("ПОТОЧНИЙ КОРИСТУВАЧ").
Адаптуй відповіді залежно від ролі:

🔑 Адміністратор — повний доступ: фінанси, зарплати, всі слюсарі, вся аналітика.
🔧 Слюсар — бачить ТІЛЬКИ власні акти, бронювання, зарплату. НЕ бачить зарплати інших та фінансові звіти.
📋 Приймальник — клієнти, авто, контакти, графік бронювань, акти. НЕ бачить зарплати.
📦 Запчастист — склад, залишки, постачальники. НЕ бачить зарплати та фінансову аналітику.

Якщо роль невідома або не визначена → вважай що користувач НЕ адміністратор.
Адмін-дії (фінанси, зарплати всіх, видалення) → тільки для ролі "Адміністратор".

Рольові відмінності у швидких командах:
▸ "рейтинг" → Адмін: топ всіх слюсарів | Слюсар: лише власна статистика
▸ "зарплата" → Адмін: всіх | Слюсар: тільки своя
▸ "звіт" → Адмін: повний фінзвіт | Інші: загальна статистика без сум зарплат

Працюй швидко, точно і по справі.`,
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
        persistActiveKeyInDB(); // Зберігаємо в БД без await
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
        persistActiveKeyInDB(); // Зберігаємо новий активний ключ в БД
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
  { icon: "📅", text: "Яка завантаженість сьогодні? Хто на якому посту?" },
  { icon: "💰", text: "Яка виручка та прибуток за цей місяць?" },
  { icon: "👷", text: "Статистика та зарплати слюсарів за місяць" },
  { icon: "🚗", text: "Покажи всі відкриті акти з деталями" },
  { icon: "📦", text: "Що закінчується на складі?" },
  { icon: "🔍", text: "Покажи всіх клієнтів та їхні авто" },
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
            <div class="ai-chat-title">Атлас AI <span id="ai-key-indicator" class="ai-key-indicator" title="Активний API ключ"></span></div>

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
              <strong>Привіт! Я Атлас AI.</strong><br>
              Запитай про акти, клієнтів, авто, слюсарів, завантаженість, фінанси, склад — я маю повний доступ до бази даних.
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
          Запитай про акти, клієнтів, авто, фінанси або завантаженість.
        </div>
      </div>
    `;
    quickPromptsEl.style.display = "";
  });

  // ── Клік на індикатор ключа → випадаючий список ──
  const keyIndicator = modal.querySelector("#ai-key-indicator");
  if (keyIndicator) {
    keyIndicator.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleKeyDropdown();
    });
  }

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

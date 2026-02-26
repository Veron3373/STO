// src/ts/roboha/ai/aiChat.ts
// 🤖 AI-Чат Асистент "Механік" — Google Gemini + аналіз даних СТО

import { supabase } from "../../vxid/supabaseClient";
import { globalCache } from "../zakaz_naraudy/globalCache";
import { loadActsTable } from "../tablucya/tablucya";
import { startChatVoiceInput } from "./voiceInput";

// ============================================================
// УТИЛІТИ
// ============================================================

/** Форматує дату з ISO/timestamp → ДД.ММ.РР */
function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  } catch {
    return dateStr;
  }
}

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
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

/** Визначає провайдера за форматом ключа */
function getKeyProvider(key: string): "gemini" | "groq" {
  if (key.startsWith("gsk_")) return "groq";
  return "gemini";
}

let chatHistory: ChatMessage[] = [];
let geminiApiKeys: string[] = []; // Всі 10 ключів (setting_id 20-29)
let geminiKeySettingIds: number[] = []; // setting_id для кожного ключа (для збереження API column)
let currentKeyIndex = 0; // Поточний активний ключ
let keysLoaded = false;
let isLoading = false;

/** Рівень використання токенів: light=мінімальний, medium=середній, heavy=повний */
type AIContextLevel = "light" | "medium" | "heavy";
let aiContextLevel: AIContextLevel = "light";

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

  const activeProvider =
    keys.length > 0 ? getKeyProvider(keys[currentKeyIndex]) : "?";
  console.log(
    `🔑 AI: завантажено ${keys.length} ключів, активний №${currentKeyIndex + 1} (${activeProvider})`,
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
    const savedProvider =
      geminiApiKeys.length > 0
        ? getKeyProvider(geminiApiKeys[currentKeyIndex])
        : "?";
    console.log(
      `🔑 ${savedProvider}: збережено активний ключ №${currentKeyIndex + 1} (setting_id=${activeSettingId}) в БД`,
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
  console.log("🔑 AI: кеш ключів скинуто");
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
  const currentKey = geminiApiKeys[currentKeyIndex] || "";
  const provider = getKeyProvider(currentKey);
  const providerLabel = provider === "groq" ? "Groq" : "Gemini";
  el.textContent = `🔑${currentKeyIndex + 1} ${providerLabel}`;
  el.title = `Активний API ключ №${currentKeyIndex + 1} з ${geminiApiKeys.length} (${providerLabel}). Натисніть для вибору.`;
}

/**
 * Оновлює лічильник токенів у статус-барі
 */
function updateTokenCounter(tokens: number): void {
  const el = document.getElementById("ai-token-counter");
  if (!el) return;
  if (tokens <= 0) {
    el.textContent = "🎫 —";
    return;
  }
  const formatted =
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  el.textContent = `🎫 ~${formatted}`;
  el.title = `Останній запит: ~${tokens.toLocaleString("uk-UA")} токенів (контекст)`;
  // Колір залежить від кількості
  el.classList.remove("ai-tokens-low", "ai-tokens-mid", "ai-tokens-high");
  if (tokens < 3000) el.classList.add("ai-tokens-low");
  else if (tokens < 10000) el.classList.add("ai-tokens-mid");
  else el.classList.add("ai-tokens-high");
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
    const keyProvider = getKeyProvider(geminiApiKeys[i]);
    const providerIcon = keyProvider === "groq" ? "⚡" : "💎";
    const providerName = keyProvider === "groq" ? "Groq" : "Gemini";
    html += `<button class="ai-key-dropdown-item${isActive ? " active" : ""}" data-key-index="${i}">
      <span class="ai-key-dropdown-num">${providerIcon} ${i + 1} ${providerName}</span>
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
    const chosenProvider = getKeyProvider(geminiApiKeys[idx]);
    console.log(`🔑 ${chosenProvider}: вручну обрано ключ №${idx + 1}`);
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
/**
 * 💡 Детектор тривіальних запитів — пропускаємо ВСІ запити до БД
 */
function isTrivialQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  // Короткі привітання/подяки/загальні питання
  if (
    q.length < 40 &&
    /^(привіт|здоров|здрастуй|вітаю|салам|хай|hello|hi|дякую|спасибі|спс|дяка|ок|окей|зрозуміло|добре|ясно|лады|хорош|гуд|бувай|до побачення|поки|пока|хто ти|як тебе|що ти вмієш|що ти можеш|допоможи|help|як справи|що нового|що можеш)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  return false;
}

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

  const needsPlanner =
    /план|пост|бокс|підйомник|яма|завантаж|зайнят|вільн|бронюв|записан|календар|розклад/i.test(
      q,
    );
  const needsAccounting =
    /бухг|витрат|прибут|виручк|маржа|зарплат|націнк|заробі|розрахун|каса|оплат|борг|дохід|видат/i.test(
      q,
    );
  const needsClients =
    /клієнт|піб|прізвищ|імен|телефон|контакт|номер.*тел|знайди.*людин|хто.*приїжджа|відфільтр|фільтр/i.test(
      q,
    );
  const needsCars =
    /авто|машин|марк|модел|мерседес|бмв|тойот|фольксваген|ауд|рено|шкод|хюнд|кіа|номер.*авто|держ.*номер|vin|вінкод|двигун|пробіг|відфільтр|фільтр/i.test(
      q,
    );
  const needsSklad =
    /складі?|запчаст|деталі?|артикул|зап.*частин|залишок|наявн|закінч|замов|полиц|постачальн|рахун|розрах|повернен/i.test(
      q,
    );
  const needsSlyusars =
    /слюсар|майстер|механік|працівник|хто.*робить|хто.*працю|хто.*виконує/i.test(
      q,
    );

  // 💡 Акти — тільки коли реально потрібно (загальні запити, фінанси, клієнти, фільтри)
  const needsActs =
    /акт|заказ|наряд|відкри|закри|сьогодн|вчора|тижн|місяц|звіт|загальн|стат|виру|дохід|прибут|зарплат|сума|грн|оплат|борг|фільтр|відфільтр/i.test(
      q,
    ) ||
    needsAccounting ||
    needsClients ||
    needsCars ||
    needsSlyusars ||
    extractClientName(q) !== null ||
    extractCarBrand(q) !== null;

  return {
    needsPlanner,
    needsAccounting,
    needsClients,
    needsCars,
    needsActs,
    needsSklad,
    needsSlyusars,
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

async function gatherSTOContext(
  userQuery: string,
  level: AIContextLevel = "light",
): Promise<string> {
  const isHeavy = level === "heavy";
  const isMedium = level === "medium";
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const analysis = analyzeQuery(userQuery);

  // 💡 У heavy/medium режимі — всі секції завжди підвантажуються
  if (isHeavy || isMedium) {
    analysis.needsActs = true;
    analysis.needsClients = true;
    analysis.needsCars = true;
    analysis.needsSklad = true;
    analysis.needsSlyusars = true;
    analysis.needsAccounting = isMedium ? analysis.needsAccounting : true;
    analysis.needsPlanner = isMedium ? analysis.needsPlanner : true;
  }

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
      dateOn: fmtDate(a.date_on),
      dateOff: fmtDate(a.date_off),
      isClosed: !!a.date_off,
      slusarsOn: a.slusarsOn || false,
      raw: d,
    };
  };

  const formatAct = (
    p: ReturnType<typeof parseActData>,
    detailed: boolean = false,
  ) => {
    let s = `Акт №${p.actId}: ${p.client}`;
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
    // 1. АКТИ — 💡 тільки коли потрібні (needsActs)
    // ============================================================
    let openActs: any[] = [];
    let closedMonthActs: any[] = [];
    let parsedOpen: ReturnType<typeof parseActData>[] = [];
    let parsedClosed: ReturnType<typeof parseActData>[] = [];
    let monthTotal = 0,
      monthWorksTotal = 0,
      monthDetailsTotal = 0,
      monthDiscount = 0;

    if (analysis.needsActs) {
      // 💡 ОПТИМІЗАЦІЯ: обмежуємо кількість актів для зменшення токенів
      // 💡 Ліміти залежать від рівня
      const OPEN_ACTS_LIMIT = isHeavy ? 200 : isMedium ? 100 : 50;
      const CLOSED_TODAY_LIMIT = isHeavy ? 100 : isMedium ? 50 : 20;
      const CLOSED_MONTH_LIMIT = isHeavy ? 500 : isMedium ? 200 : 100;

      try {
        const [openRes, closedRes] = await Promise.all([
          supabase
            .from("acts")
            .select("*")
            .is("date_off", null)
            .order("act_id", { ascending: false })
            .limit(OPEN_ACTS_LIMIT),
          supabase
            .from("acts")
            .select("*")
            .not("date_off", "is", null)
            .gte("date_off", monthStart)
            .order("act_id", { ascending: false })
            .limit(CLOSED_MONTH_LIMIT),
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
            .limit(CLOSED_MONTH_LIMIT);
          if (data) {
            openActs = data
              .filter((a: any) => !a.date_off)
              .slice(0, OPEN_ACTS_LIMIT);
            closedMonthActs = data.filter((a: any) => !!a.date_off);
          }
        } catch {
          /* ignore */
        }
      }

      parsedOpen = openActs.map(parseActData);
      parsedClosed = closedMonthActs.map(parseActData);
      const closedToday = parsedClosed.filter(
        (a) => (a.dateOff || "").slice(0, 10) >= todayStr,
      );

      // 💡 Відкриті акти — деталізація залежить від рівня
      context += `=== ВІДКРИТІ АКТИ (${parsedOpen.length}) ===\n`;
      parsedOpen.forEach((p) => {
        context += `  ${formatAct(p, isHeavy || isMedium)}\n`;
      });
      if (parsedOpen.length === 0) context += "  Немає відкритих актів.\n";

      // Закриті сьогодні — детально
      const closedTodayLimited = closedToday.slice(0, CLOSED_TODAY_LIMIT);
      context += `\n=== ЗАКРИТІ СЬОГОДНІ (${closedToday.length}) ===\n`;
      closedTodayLimited.forEach((p) => {
        context += `  ${formatAct(p, true)}\n`;
      });
      if (closedToday.length > CLOSED_TODAY_LIMIT) {
        context += `  ... та ще ${closedToday.length - CLOSED_TODAY_LIMIT} актів\n`;
      }

      // 💡 Закриті за місяць — heavy: всі детально, medium: компактно, light: тільки статистика
      monthWorksTotal = parsedClosed.reduce((s, p) => s + p.worksSum, 0);
      monthDetailsTotal = parsedClosed.reduce((s, p) => s + p.detailsSum, 0);
      monthTotal = parsedClosed.reduce((s, p) => s + p.total, 0);
      monthDiscount = parsedClosed.reduce((s, p) => s + p.discount, 0);

      if (isHeavy) {
        context += `\n=== ВСІ ЗАКРИТІ ЗА МІСЯЦЬ (${parsedClosed.length}) ===\n`;
        parsedClosed.forEach((p) => {
          context += `  ${formatAct(p, true)}\n`;
        });
      } else if (isMedium) {
        context += `\n=== ЗАКРИТІ ЗА МІСЯЦЬ (${parsedClosed.length}) ===\n`;
        parsedClosed.forEach((p) => {
          context += `  ${formatAct(p, false)}\n`;
        });
      }

      context += `\n=== СТАТИСТИКА МІСЯЦЯ (${today.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}) ===\n`;
      context += `Закрито актів: ${parsedClosed.length} | Відкритих: ${parsedOpen.length}\n`;
      context += `Виручка: ${monthTotal.toLocaleString("uk-UA")} грн (роботи: ${monthWorksTotal.toLocaleString("uk-UA")}, деталі: ${monthDetailsTotal.toLocaleString("uk-UA")})\n`;
      if (monthDiscount > 0)
        context += `Знижки: ${monthDiscount.toLocaleString("uk-UA")} грн\n`;

      // Статистика сьогодні
      const todayWorksTotal = closedToday.reduce((s, p) => s + p.worksSum, 0);
      const todayDetailsTotal = closedToday.reduce(
        (s, p) => s + p.detailsSum,
        0,
      );
      const todayTotal = closedToday.reduce((s, p) => s + p.total, 0);
      context += `\nСЬОГОДНІ: закрито ${closedToday.length} | виручка ${todayTotal.toLocaleString("uk-UA")} грн (роботи: ${todayWorksTotal.toLocaleString("uk-UA")}, деталі: ${todayDetailsTotal.toLocaleString("uk-UA")})\n`;
    } // end needsActs

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
        // 💡 Компактний формат: все в одну стрічку
        context += `  ${s.slyusar_id}|${name}`;
        if (role) context += `|${role}`;
        if (d["ПроцентРоботи"]) context += `|${d["ПроцентРоботи"]}%`;

        // 💡 Зарплатна статистика — тільки якщо потрібна бухгалтерія або слюсарі
        if (
          (analysis.needsAccounting || analysis.needsSlyusars) &&
          d["Історія"]
        ) {
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
            context += `|${monthActsCount}акт|ЗП:${monthSalary}`;
          }
        }
        context += "\n";
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
            if (b.act_id) context += ` | Акт №${b.act_id}`;
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
    // 4. КЛІЄНТИ ТА АВТО — 💡 тільки при конкретному пошуку
    // ============================================================
    if (
      analysis.needsClients ||
      analysis.needsCars ||
      analysis.searchBrand ||
      analysis.searchName
    ) {
      // 💡 Обмежуємо: ліміти залежать від рівня
      const clientLimit = isHeavy
        ? 2000
        : isMedium
          ? 500
          : analysis.searchName || analysis.searchBrand
            ? 500
            : 100;
      const carLimit = isHeavy
        ? 5000
        : isMedium
          ? 1000
          : analysis.searchName || analysis.searchBrand
            ? 1000
            : 200;

      try {
        const [clientsRes, carsRes] = await Promise.all([
          supabase
            .from("clients")
            .select("*")
            .order("client_id", { ascending: false })
            .limit(clientLimit),
          supabase
            .from("cars")
            .select("*")
            .order("cars_id", { ascending: false })
            .limit(carLimit),
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

        // 💡 Загальна інфо — кількість залежить від рівня
        if (!analysis.searchBrand && !analysis.searchName) {
          const showCount = isHeavy ? parsedClients.length : isMedium ? 50 : 15;
          context += `\n=== КЛІЄНТИ В БАЗІ: ${parsedClients.length} | АВТО: ${parsedCars.length} ===\n`;
          parsedClients.slice(0, showCount).forEach((cl) => {
            context += `  ${cl.id}|${cl.name}`;
            if (cl.phone) context += `|${cl.phone}`;
            const clientCars = parsedCars.filter((c) => c.clientId === cl.id);
            if (clientCars.length > 0) {
              context += `|${clientCars.map((c) => `${c.car}${c.plate ? `(${c.plate})` : ""}`).join(",")}`;
            }
            context += "\n";
          });
          if (parsedClients.length > showCount) {
            context += `  ...ще ${parsedClients.length - showCount} клієнтів (запитай конкретного)\n`;
          }
        }
      } catch (err) {
        console.warn("⚠️ Помилка завантаження клієнтів/авто:", err);
      }
    }

    // ============================================================
    // 5. СКЛАД — ПРЯМИЙ ЗАПИТ ДО БД (100% доступ)
    // ============================================================
    {
      let skladParts: Array<{
        sclad_id: number;
        name: string;
        part_number: string;
        price: number;
        kilkist_on: number;
        kilkist_off: number;
        quantity: number;
        unit_measurement: string | null;
        shops: string | null;
        time_on: string | null;
        time_off: string | null;
        scladNomer: string | null;
        statys: string | null;
        akt: number | null;
        rahunok: string | null;
        rosraxovano: string | null;
        date_open: string | null;
        xto_zamovuv: number | null;
        povernennya: string | null;
        xto_povernyv: string | null;
      }> = [];

      try {
        // Завантажуємо ВСІ записи складу напряму з Supabase
        const { data: scladData, error: scladErr } = await supabase
          .from("sclad")
          .select("*")
          .order("sclad_id", { ascending: false });

        if (scladErr) {
          console.warn("⚠️ Помилка завантаження складу:", scladErr);
        }

        if (scladData && scladData.length > 0) {
          skladParts = scladData.map((row: any) => ({
            sclad_id: row.sclad_id,
            name: row.name || "—",
            part_number: row.part_number || "",
            price: Number(row.price || 0),
            kilkist_on: Number(row.kilkist_on || 0),
            kilkist_off: Number(row.kilkist_off || 0),
            quantity:
              Number(row.kilkist_on || 0) - Number(row.kilkist_off || 0),
            unit_measurement: row.unit_measurement || null,
            shops: row.shops || null,
            time_on: row.time_on || null,
            time_off: row.time_off || null,
            scladNomer: row.scladNomer || null,
            statys: row.statys || null,
            akt: row.akt || null,
            rahunok: row.rahunok || null,
            rosraxovano: row.rosraxovano || null,
            date_open: row.date_open || null,
            xto_zamovuv: row.xto_zamovuv || null,
            povernennya: row.povernennya || null,
            xto_povernyv: row.xto_povernyv || null,
          }));
        }
      } catch (err) {
        console.warn("⚠️ Помилка завантаження складу (catch):", err);
        // Фолбек на globalCache
        const cacheParts = globalCache.skladParts || [];
        if (cacheParts.length > 0) {
          skladParts = cacheParts.map((p) => ({
            sclad_id: p.sclad_id,
            name: p.name,
            part_number: p.part_number,
            price: p.price,
            kilkist_on: p.kilkist_on,
            kilkist_off: p.kilkist_off,
            quantity: p.quantity,
            unit_measurement: p.unit || null,
            shops: p.shop || null,
            time_on: p.time_on || null,
            time_off: null,
            scladNomer: p.scladNomer ? String(p.scladNomer) : null,
            statys: p.statys || null,
            akt: null,
            rahunok: null,
            rosraxovano: null,
            date_open: null,
            xto_zamovuv: null,
            povernennya: null,
            xto_povernyv: null,
          }));
        }
      }

      if (skladParts.length > 0) {
        // Критичні / мало на складі
        const criticalStock = skladParts.filter((p) => p.quantity <= 0);
        const lowStock = skladParts.filter(
          (p) => p.quantity > 0 && p.quantity <= 2,
        );
        const mediumStock = skladParts.filter(
          (p) => p.quantity > 2 && p.quantity <= 5,
        );
        const normalStock = skladParts.filter((p) => p.quantity > 5);

        // 💡 ЗАВЖДИ: тільки статистика + критичні/мало (компактно)
        context += `\n=== СКЛАД (${skladParts.length} поз) ===\n`;
        context += `🔴${criticalStock.length} 🟠${lowStock.length} 🟡${mediumStock.length} 🟢${normalStock.length} | Вартість: ${skladParts.reduce((s, p) => s + p.price * Math.max(p.quantity, 0), 0).toLocaleString("uk-UA")} грн\n`;

        // Не розраховані позиції — тільки кількість
        const notPaid = skladParts.filter((p) => !p.rosraxovano && p.price > 0);
        if (notPaid.length > 0) {
          context += `💳 Не розрах: ${notPaid.length} поз\n`;
        }

        // 💡 Критичні та мало — КОМПАКТНО, одна стрічка
        if (criticalStock.length > 0) {
          context += `🔴 ЗАКІНЧИЛИСЬ:\n`;
          criticalStock.forEach((p) => {
            context += `  ${p.name}|${p.part_number}|${p.quantity}${p.unit_measurement || "шт"}|${p.price}грн`;
            if (p.shops) context += `|${p.shops}`;
            if (p.akt) context += `|акт${p.akt}`;
            context += "\n";
          });
        }
        if (lowStock.length > 0) {
          context += `🟠 МАЛО:\n`;
          lowStock.forEach((p) => {
            context += `  ${p.name}|${p.part_number}|${p.quantity}${p.unit_measurement || "шт"}|${p.price}грн`;
            if (p.shops) context += `|${p.shops}`;
            context += "\n";
          });
        }

        // 💡 Середній та повний — залежить від рівня або запиту про склад
        if (analysis.needsSklad || isHeavy || isMedium) {
          if (mediumStock.length > 0) {
            context += `🟡 НИЗЬКО:\n`;
            mediumStock.forEach((p) => {
              context += `  ${p.name}|${p.part_number}|${p.quantity}${p.unit_measurement || "шт"}|${p.price}грн\n`;
            });
          }
          context += `🟢 НОРМА (${normalStock.length}):\n`;
          normalStock.forEach((p) => {
            context += `  ${p.name}|${p.part_number}|${p.quantity}${p.unit_measurement || "шт"}|${p.price}грн`;
            if (p.shops) context += `|${p.shops}`;
            if (p.scladNomer) context += `|п${p.scladNomer}`;
            context += "\n";
          });
        }
      } else {
        context += `\n=== СКЛАД: порожній ===\n`;
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
    // 8. МАГАЗИНИ — 💡 компактно, тільки імена
    // ============================================================
    const shops = globalCache.shops || [];
    if (shops.length > 0) {
      context += `\n=== МАГАЗИНИ (${shops.length}) ===\n`;
      context += shops.map((s: any) => s.Name || "—").join(", ") + "\n";
    }

    // ============================================================
    // 9. ФАКТУРИ — 💡 тільки якщо запит про фактури/рахунки/бухгалтерію
    // ============================================================
    if (
      isHeavy ||
      isMedium ||
      analysis.needsAccounting ||
      /фактур|рахунок|контрагент/i.test(userQuery)
    ) {
      try {
        const { data: fakturaData } = await supabase
          .from("faktura")
          .select("*")
          .order("faktura_id", { ascending: false })
          .limit(20);

        if (fakturaData && fakturaData.length > 0) {
          context += `\n=== ФАКТУРИ (${fakturaData.length}) ===\n`;
          fakturaData.forEach((f: any) => {
            context += `  №${f.faktura_id}`;
            if (f.namber) context += `|${f.namber}`;
            if (f.name) context += `|${f.name}`;
            if (f.act_id) context += `|акт${f.act_id}`;
            if (f.oderjyvach) context += `|${f.oderjyvach}`;
            context += "\n";
          });
        }
      } catch {
        /* ignore */
      }
    }

    // ============================================================
    // 10. ВИТРАТИ — 💡 тільки якщо запит фінансовий
    // ============================================================
    if (
      isHeavy ||
      (!analysis.needsAccounting && /витрат|видат|каса|прибут/i.test(userQuery))
    ) {
      try {
        const { data: expenses } = await supabase
          .from("vutratu")
          .select("*")
          .gte("dataOnn", monthStart)
          .order("dataOnn", { ascending: false })
          .limit(50);

        if (expenses && expenses.length > 0) {
          const totalExpenses = expenses.reduce(
            (s: number, e: any) => s + Number(e.suma || 0),
            0,
          );
          context += `\n=== ВИТРАТИ (${expenses.length} зап, ${totalExpenses.toLocaleString("uk-UA")} грн) ===\n`;
          const byCategory: Record<string, number> = {};
          expenses.forEach((e: any) => {
            const cat = e.kategoria || "—";
            byCategory[cat] = (byCategory[cat] || 0) + Number(e.suma || 0);
          });
          for (const [cat, sum] of Object.entries(byCategory)) {
            context += `  ${cat}: ${(sum as number).toLocaleString("uk-UA")}\n`;
          }
        }
      } catch {
        /* ignore */
      }
    }

    // ============================================================
    // 11-12. СПОВІЩЕННЯ — 💡 тільки якщо є непереглянуті (компактно)
    // ============================================================
    try {
      const [notifRes, completeRes] = await Promise.all([
        supabase
          .from("act_changes_notifications")
          .select("act_id, item_name, dodav_vudaluv, changed_by_surname")
          .eq("delit", false)
          .order("data", { ascending: false })
          .limit(10),
        supabase
          .from("slusar_complete_notifications")
          .select("act_id, pruimalnyk")
          .eq("delit", false)
          .eq("viewed", false)
          .limit(10),
      ]);

      const notifs = notifRes.data || [];
      const completes = completeRes.data || [];

      if (notifs.length > 0) {
        context += `\n=== СПОВІЩЕННЯ ЗМІН (${notifs.length}) ===\n`;
        notifs.forEach((n: any) => {
          context += `  акт${n.act_id}|${n.dodav_vudaluv ? "+" : "-"}${n.item_name || "?"}|${n.changed_by_surname || ""}\n`;
        });
      }
      if (completes.length > 0) {
        context += `=== ЗАВЕРШЕНО СЛЮСАРЕМ (${completes.length}) ===\n`;
        completes.forEach((n: any) => {
          context += `  акт${n.act_id}\n`;
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
    return `⚠️ Для роботи AI PRO потрібно вказати **API ключ** (Gemini або Groq) у налаштуваннях (🤖 → API Ключі).\n\nGemini: [aistudio.google.com](https://aistudio.google.com/app/apikey)\nGroq: [console.groq.com](https://console.groq.com/keys)`;
  }

  // Оновлюємо індикатор на початку запиту
  updateKeyIndicator();

  try {
    // 💡 Тривіальні запити — без контексту БД (економія ~95% токенів)
    const trivial = isTrivialQuery(userMessage);
    let enrichedPrompt: string;
    if (trivial) {
      enrichedPrompt = `СЬОГОДНІ: ${new Date().toLocaleDateString("uk-UA")}\n\n${userMessage}`;
    } else if (aiContextLevel === "light") {
      // Легкий — оптимізований контекст (умовні секції, компакт)
      enrichedPrompt = await gatherSTOContext(userMessage);
    } else if (aiContextLevel === "medium") {
      // Середній — більше даних (акти завжди, більше лімітів)
      enrichedPrompt = await gatherSTOContext(userMessage, "medium");
    } else {
      // Важкий — повний контекст без обрізань
      enrichedPrompt = await gatherSTOContext(userMessage, "heavy");
    }

    // 💡 Логування розміру контексту для моніторингу токенів
    const contextChars = enrichedPrompt.length;
    const estimatedTokens = Math.round(contextChars / 3.5);
    console.log(
      `📊 AI контекст [${aiContextLevel}]: ${contextChars.toLocaleString()} симв. ≈ ${estimatedTokens.toLocaleString()} токенів${trivial ? " (тривіальний запит)" : ""}`,
    );
    // Оновлюємо лічильник токенів у UI
    updateTokenCounter(estimatedTokens);

    // 💡 Історія залежить від рівня
    const historySize =
      aiContextLevel === "heavy" ? 10 : aiContextLevel === "medium" ? 8 : 6;
    const recentHistory = chatHistory.slice(-historySize);

    // Системний промпт (спільний для Gemini і Groq)
    const systemPromptText = `Ти — AI "Атлас" для СТО. Відповідай ТІЛЬКИ українською. Тільки реальні дані — НЕ вигадуй.
СТИСЛО: кожна позиція — 1 стрічка з emoji. Дати: ДД.ММ.РР. Суми: "18 200 грн".

📦 БД (Supabase):
acts: act_id,date_on,date_off(null=відкритий),slusarsOn,client_id→clients,cars_id→cars,avans,pruimalnyk,data{ПІБ,Телефон,Марка,Модель,Держ.номер,VIN,Пробіг,Приймальник,Слюсар,Причина,Рекомендації,Знижка,Роботи[{Робота,К-сть,Ціна,Зарплата}],Деталі[{Деталь,К-сть,Ціна,Каталог,Магазин,sclad_id}]}
clients: client_id,data{ПІБ,Телефон,Джерело}
cars: cars_id,client_id→clients,data{Авто,Номер авто,VIN,Рік,Обʼєм,Пальне,КодДВЗ}
slyusars: slyusar_id,Name,data{Доступ(Адмін/Слюсар/Приймальник/Запчастист),ПроцентРоботи,Історія{дата:[{Акт,ЗарплатаРоботи,ЗарплатаЗапчастин}]}} 🔒Пароль-ЗАБОРОНЕНО
sclad: sclad_id,name,part_number,price,kilkist_on,kilkist_off,quantity(залишок),shops,rahunok,scladNomer,akt→acts,rosraxovano
post_category: category_id,category | post_name: post_id,name,category
post_arxiv: slyusar_id→slyusars,name_post→post_name,client_id,cars_id,status(Запланований/В роботі/Відремонтований/Не приїхав),data_on,data_off,act_id
shops: shop_id,data{Name,Склад,Історія} | vutratu: vutratu_id,dataOnn,kategoria,suma,opys_vytraty
faktura: faktura_id,name,namber,act_id,oderjyvach | works/details: довідники

🔗 clients→cars(1:N), clients→acts(1:N), acts→sclad.akt(1:N), acts→faktura(1:N), post_name→post_arxiv(1:N)

📊 Виручка=Σ(Роботи.Ціна×К-сть)+Σ(Деталі.Ціна×К-сть) | Прибуток=Виручка−Витрати
📦 Склад: 🔴0шт 🟠1-2 🟡3-5 🟢6+ — одна стрічка/позиція, без ├─└─

📋 Формати:
АКТ: #id ✅/🔄 📅дата 👤ПІБ 🚗Авто 👷Слюсар 💰Сума
СКЛАД: 🔴Назва арт кількість ціна дата — без "Арт:","Ціна:" просто значення
Списки>10→топ-5+"показати всі?" Завжди підсумок.

👥 Адмін—все. Слюсар—тільки своє. Приймальник—клієнти. Запчастист—склад. ЗП всіх→тільки адмін.

🔎 ФІЛЬТРАЦІЯ: "відфільтруй X" → додай [FILTER:ключові слова] останнім рядком.
Для слюсаря: [FILTER:слюсар:Прізвище]. Для приймальника: [FILTER:приймальник:Прізвище].
Мінімум слів, без "всі","акти","покажи". Один фільтр на відповідь.

Стисло. Точно. Компактно.`;

    // === Компактний промпт для Groq (ліміт ~12k TPM) ===
    const groqSystemPrompt = `Ти — AI-асистент "Атлас" для автосервісу (СТО). Відповідай ТІЛЬКИ українською. Будь стислим.
⚠️ Показуй лише реальні дані — не вигадуй. Кожна позиція — в одну стрічку з emoji.
📋 Формат акту: #id ✅/🔄 | 📅 дата | 👤 ПІБ | 🚗 Авто | 👷 Слюсар | 💰 Сума
📦 Склад: 🔴 0шт 🟠 1-2 🟡 3-5 🟢 6+. Одна стрічка на позицію.
💰 Фінанси: Виручка=Роботи+Деталі. Суми: "18 200 грн". Дати: ДД.ММ.РР.
🔒 Паролі — ЗАБОРОНЕНО.
🔎 Фільтрація: "відфільтруй X" → додай [FILTER:ключові слова] в кінці відповіді.
  Для слюсаря: [FILTER:слюсар:Прізвище]. Мінімум слів.`;

    // 💡 Ліміти та параметри залежать від рівня
    const GROQ_CONTEXT_LIMIT =
      aiContextLevel === "heavy"
        ? 30000
        : aiContextLevel === "medium"
          ? 20000
          : 12000;
    const groqEnrichedPrompt =
      enrichedPrompt.length > GROQ_CONTEXT_LIMIT
        ? enrichedPrompt.slice(0, GROQ_CONTEXT_LIMIT) +
          "\n...(контекст обрізано)"
        : enrichedPrompt;

    const groqHistorySize =
      aiContextLevel === "heavy" ? 8 : aiContextLevel === "medium" ? 5 : 3;
    const groqHistory = chatHistory.slice(-groqHistorySize);

    const GEMINI_CONTEXT_LIMIT =
      aiContextLevel === "heavy"
        ? 120000
        : aiContextLevel === "medium"
          ? 60000
          : 40000;
    const geminiEnrichedPrompt =
      enrichedPrompt.length > GEMINI_CONTEXT_LIMIT
        ? enrichedPrompt.slice(0, GEMINI_CONTEXT_LIMIT) +
          "\n...(контекст обрізано)"
        : enrichedPrompt;

    // === Формат Gemini ===
    const contents: any[] = [];
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
      });
    }
    contents.push({ role: "user", parts: [{ text: geminiEnrichedPrompt }] });

    const geminiMaxOutput =
      aiContextLevel === "heavy"
        ? 8192
        : aiContextLevel === "medium"
          ? 6144
          : 4096;
    const geminiRequestBody = JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: geminiMaxOutput,
        topP: 0.9,
      },
      systemInstruction: { parts: [{ text: systemPromptText }] },
    });

    // === Формат Groq (OpenAI-сумісний, компактний) ===
    const groqMessages: any[] = [{ role: "system", content: groqSystemPrompt }];
    for (const msg of groqHistory) {
      groqMessages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text,
      });
    }
    groqMessages.push({ role: "user", content: groqEnrichedPrompt });

    const groqMaxTokens =
      aiContextLevel === "heavy"
        ? 4096
        : aiContextLevel === "medium"
          ? 3072
          : 2048;
    const groqRequestBody = JSON.stringify({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: 0.5,
      max_tokens: groqMaxTokens,
      top_p: 0.9,
    });

    // Спробувати всі ключі по черзі при 429
    const triedIndices = new Set<number>();
    let startIndex = currentKeyIndex;

    while (triedIndices.size < keys.length) {
      const keyIdx = startIndex % keys.length;
      triedIndices.add(keyIdx);
      const apiKey = keys[keyIdx];
      const provider = getKeyProvider(apiKey);

      console.log(
        `🔑 ${provider}: спроба ключ №${keyIdx + 1} з ${keys.length}`,
      );

      let response: Response;
      if (provider === "groq") {
        response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: groqRequestBody,
        });
      } else {
        response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: geminiRequestBody,
        });
      }

      if (response.ok) {
        currentKeyIndex = keyIdx;
        updateKeyIndicator();
        persistActiveKeyInDB();
        const data = await response.json();
        let text: string | undefined;
        if (provider === "groq") {
          text = data?.choices?.[0]?.message?.content;
        } else {
          text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        }
        return text || "🤔 Не вдалося отримати відповідь від AI.";
      }

      if (response.status === 429 || response.status === 413) {
        const reason =
          response.status === 413 ? "запит завеликий" : "ліміт вичерпано";
        console.warn(
          `⚠️ ${provider} ключ №${keyIdx + 1}: ${reason}, перемикаємо...`,
        );
        currentKeyIndex = (keyIdx + 1) % keys.length;
        updateKeyIndicator();
        persistActiveKeyInDB();
        startIndex = keyIdx + 1;
        continue;
      }

      const errText = await response.text();
      console.error(`${provider} API error:`, errText);
      if (response.status === 400)
        return `❌ Помилка запиту до ${provider}. Перевірте API ключ.`;
      return `❌ Помилка ${provider} API (${response.status}). Спробуйте пізніше.`;
    }

    keysLoaded = false;
    if (keys.length === 1) {
      return `⏳ Ліміт вичерпано. У вас лише **1 API ключ**. Додайте ще ключі в налаштуваннях (🤖 → API Ключі) або спробуйте через хвилину.`;
    }
    return `⏳ Ліміт вичерпано на всіх ${keys.length} API ключах. Спробуйте через хвилину або додайте додаткові ключі в налаштуваннях (🤖 → API Ключі).`;
  } catch (err: any) {
    console.error("AI call error:", err);
    return `❌ Помилка зв'язку з AI: ${err.message || "Мережева помилка"}`;
  }
}

// ============================================================
// ШВИДКІ ЗАПИТИ (ДАШБОРД)
// ============================================================

async function loadDailyStats(date?: Date): Promise<DailyStats> {
  const today = date || new Date();
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

  const isToday = todayStr === new Date().toISOString().split("T")[0];

  try {
    let acts: any[] = [];
    try {
      if (isToday) {
        // Сьогодні: акти відкриті сьогодні АБО закриті сьогодні
        const [openedTodayRes, closedTodayRes, stillOpenRes] =
          await Promise.all([
            supabase
              .from("acts")
              .select("*")
              .gte("date_on", todayStr)
              .order("act_id", { ascending: false })
              .limit(100),
            supabase
              .from("acts")
              .select("*")
              .gte("date_off", todayStr)
              .order("act_id", { ascending: false })
              .limit(100),
            supabase
              .from("acts")
              .select("*")
              .is("date_off", null)
              .order("act_id", { ascending: false })
              .limit(200),
          ]);

        const opened =
          !openedTodayRes.error && openedTodayRes.data
            ? openedTodayRes.data
            : [];
        const closed =
          !closedTodayRes.error && closedTodayRes.data
            ? closedTodayRes.data
            : [];
        const stillOpen =
          !stillOpenRes.error && stillOpenRes.data ? stillOpenRes.data : [];

        // Об'єднуємо без дублікатів
        const seen = new Set<number>();
        for (const a of [...opened, ...closed, ...stillOpen]) {
          if (!seen.has(a.act_id)) {
            seen.add(a.act_id);
            acts.push(a);
          }
        }
      } else {
        // Інша дата: акти відкриті У ЦЕЙ день АБО закриті У ЦЕЙ день
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split("T")[0];

        const [openedRes, closedRes] = await Promise.all([
          supabase
            .from("acts")
            .select("*")
            .gte("date_on", todayStr)
            .lt("date_on", nextDayStr)
            .order("act_id", { ascending: false })
            .limit(100),
          supabase
            .from("acts")
            .select("*")
            .gte("date_off", todayStr)
            .lt("date_off", nextDayStr)
            .order("act_id", { ascending: false })
            .limit(100),
        ]);

        const openedActs =
          !openedRes.error && openedRes.data ? openedRes.data : [];
        const closedActs =
          !closedRes.error && closedRes.data ? closedRes.data : [];

        // Об'єднуємо без дублікатів
        const seen = new Set<number>();
        for (const a of [...openedActs, ...closedActs]) {
          if (!seen.has(a.act_id)) {
            seen.add(a.act_id);
            acts.push(a);
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Fallback: якщо запит падає
    if (acts.length === 0) {
      try {
        const { data } = await supabase
          .from("acts")
          .select("*")
          .order("act_id", { ascending: false })
          .limit(200);
        if (data) {
          acts = data.filter((a: any) => {
            const dateOn = (a.date_on || "").slice(0, 10);
            const dateOff = (a.date_off || "").slice(0, 10);
            if (isToday)
              return dateOn >= todayStr || dateOff >= todayStr || !a.date_off;
            return dateOn === todayStr || dateOff === todayStr;
          });
        }
      } catch {
        /* ignore */
      }
    }

    // Збираємо всі client_id та cars_id для пакетного запиту
    const clientIds = [
      ...new Set((acts || []).map((a: any) => a.client_id).filter(Boolean)),
    ];
    const carsIds = [
      ...new Set((acts || []).map((a: any) => a.cars_id).filter(Boolean)),
    ];

    // Завантажуємо клієнтів та авто паралельно
    const [clientsRes, carsRes] = await Promise.all([
      clientIds.length > 0
        ? supabase
            .from("clients")
            .select("client_id, data")
            .in("client_id", clientIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      carsIds.length > 0
        ? supabase.from("cars").select("cars_id, data").in("cars_id", carsIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const clientsMap = new Map<number, any>();
    (clientsRes.data || []).forEach((c: any) => {
      let cd: any = {};
      try {
        cd = typeof c.data === "string" ? JSON.parse(c.data) : c.data || {};
      } catch {}
      clientsMap.set(c.client_id, cd);
    });

    const carsMap = new Map<number, any>();
    (carsRes.data || []).forEach((c: any) => {
      let cd: any = {};
      try {
        cd = typeof c.data === "string" ? JSON.parse(c.data) : c.data || {};
      } catch {}
      carsMap.set(c.cars_id, cd);
    });

    (acts || []).forEach((a: any) => {
      let d: any = {};
      try {
        const raw = a.info || a.data || a.details;
        d = typeof raw === "string" ? JSON.parse(raw) : raw || {};
      } catch {}

      // ПІБ клієнта: спочатку з JSON акту, потім з таблиці clients
      let client = d["ПІБ"] || d["Клієнт"] || "";
      if (!client && a.client_id) {
        const cd = clientsMap.get(a.client_id);
        if (cd) client = cd["ПІБ"] || cd["Клієнт"] || "";
      }
      if (!client) client = "—";

      // Авто: спочатку з JSON акту, потім з таблиці cars
      let car = `${d["Марка"] || ""} ${d["Модель"] || ""}`.trim();
      if (!car && a.cars_id) {
        const cd = carsMap.get(a.cars_id);
        if (cd)
          car =
            cd["Авто"] || `${cd["Марка"] || ""} ${cd["Модель"] || ""}`.trim();
      }
      if (!car) car = "—";

      const slyusar = d["Приймальник"] || a.pruimalnyk || "—";

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

      // Закритий акт рахуємо тільки якщо date_off потрапляє в обраний день
      const dateOffDay = a.date_off ? (a.date_off as string).slice(0, 10) : "";
      const isClosed = !!a.date_off;
      const isClosedOnSelectedDay = isClosed && dateOffDay === todayStr;

      if (isClosedOnSelectedDay) {
        stats.closedCount++;
        stats.closedActs.push({
          id: a.act_id,
          client,
          car,
          total,
          slyusar,
          dateOff: fmtDate(a.date_off) || "сьогодні",
        });
        stats.totalWorksSum += worksSum;
        stats.totalDetailsSum += detailsSum;
        stats.totalSum += total;
        stats.worksCount += worksArr.length;
      } else if (!isClosed) {
        stats.openCount++;
        stats.openActs.push({
          id: a.act_id,
          client,
          car,
          dateOn: fmtDate(a.date_on),
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

function renderDashboard(
  stats: DailyStats,
  container: HTMLElement,
  selectedDate?: Date,
): void {
  const dateObj = selectedDate || new Date();
  const displayDate = dateObj.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
  });
  const isoDate = dateObj.toISOString().split("T")[0];
  const isToday = isoDate === new Date().toISOString().split("T")[0];
  const closedLabel = isToday ? "Закрито сьогодні" : `Закрито ${displayDate}`;
  const closedSectionTitle = isToday
    ? "✅ Закриті акти сьогодні"
    : `✅ Закриті акти ${displayDate}`;

  container.innerHTML = `
    <div class="ai-dashboard">
      <div class="ai-dashboard-title">
        📊 Дашборд — 
        <span class="ai-dashboard-date-picker">
          <span class="ai-dashboard-date-label" id="ai-dashboard-date-label">${displayDate}</span>
          <span class="ai-dashboard-date-icon">📅</span>
          <input type="date" id="ai-dashboard-date-input" class="ai-dashboard-date-input" value="${isoDate}" />
        </span>
      </div>
      
      <div class="ai-dashboard-cards">
        <div class="ai-dashboard-card ai-dashboard-card--closed">
          <div class="ai-dashboard-card-icon">✅</div>
          <div class="ai-dashboard-card-value">${stats.closedCount}</div>
          <div class="ai-dashboard-card-label">${closedLabel}</div>
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
        <div class="ai-dashboard-section-title">${closedSectionTitle}</div>
        <div class="ai-dashboard-acts-list">
          ${stats.closedActs
            .map(
              (a) => `
            <div class="ai-dashboard-act-row">
              <span class="ai-act-id">№${a.id}</span>
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
              <span class="ai-act-id">№${a.id}</span>
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
// ФІЛЬТРАЦІЯ ТАБЛИЦІ З AI
// ============================================================

/**
 * Програмно застосовує фільтр: вводить текст у #searchInput та перезавантажує таблицю
 */
function applyFilterFromAI(filterText: string): void {
  // Перевірка на спеціальний префікс статус:
  const statusMatch = filterText.match(/статус:(\S+)/i);
  if (statusMatch) {
    const status = statusMatch[1].toLowerCase();
    const filterType: "open" | "closed" | null = status.includes("закрит")
      ? "closed"
      : status.includes("відкрит")
        ? "open"
        : null;

    if (filterType) {
      // Видаляємо статус: з пошукового рядка, залишаємо інші ключові слова
      const remaining = filterText.replace(/статус:\S+/gi, "").trim();

      try {
        loadActsTable(null, null, filterType, remaining || null);
      } catch (err) {
        console.warn("⚠️ AI Filter: помилка loadActsTable", err);
      }

      // Закриваємо AI модалку
      const modal = document.getElementById(CHAT_MODAL_ID);
      if (modal) modal.classList.add("hidden");
      console.log(
        `🔎 AI Filter: статус=${filterType}${remaining ? `, пошук="${remaining}"` : ""}`,
      );
      return;
    }
  }

  // Викликаємо loadActsTable напряму — БЕЗ запису в #searchInput
  try {
    loadActsTable(null, null, null, filterText);
  } catch (err) {
    console.warn("⚠️ AI Filter: помилка loadActsTable", err);
  }

  // Закриваємо AI модалку щоб побачити результат
  const modal = document.getElementById(CHAT_MODAL_ID);
  if (modal) modal.classList.add("hidden");

  console.log(`🔎 AI Filter: застосовано фільтр "${filterText}"`);
}

/**
 * Парсить відповідь AI і витягує тег [FILTER:...], якщо є
 * Повертає { cleanText, filterText } або null
 */
function extractFilterTag(
  response: string,
): { cleanText: string; filterText: string } | null {
  const filterMatch = response.match(/\[FILTER:([^\]]+)\]/i);
  if (!filterMatch) return null;

  const filterText = filterMatch[1].trim();
  const cleanText = response.replace(/\[FILTER:[^\]]+\]/gi, "").trim();

  return { cleanText, filterText };
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
  { icon: "🔎", text: "Відфільтруй всі BMW які міняли масло" },
  { icon: "👷", text: "Покажи всі акти слюсаря" },
];

// ============================================================
// СТВОРЕННЯ МОДАЛКИ
// ============================================================

export async function createAIChatModal(): Promise<void> {
  if (document.getElementById(CHAT_MODAL_ID)) {
    document.getElementById(CHAT_MODAL_ID)!.classList.remove("hidden");
    // При кожному відкритті — підвантажуємо ключі та показуємо активний
    loadAllGeminiKeys().then(() => updateKeyIndicator());
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
            <div class="ai-chat-title">Атлас AI</div>

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
          <button id="ai-chat-voice-btn" class="ai-chat-voice-btn" title="Голосове введення" type="button">
            🎙️
          </button>
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

        <!-- Статус-бар: ключ + рівень + токени -->
        <div class="ai-chat-statusbar">
          <span id="ai-key-indicator" class="ai-key-indicator" title="Активний API ключ"></span>
          <select id="ai-context-level" class="ai-context-level" title="Рівень контексту">
            <option value="light" ${aiContextLevel === "light" ? " selected" : ""}>⚡ Легкий</option>
            <option value="medium"${aiContextLevel === "medium" ? " selected" : ""}>⚖️ Середній</option>
            <option value="heavy"${aiContextLevel === "heavy" ? " selected" : ""}>💪 Важкий</option>
          </select>
          <span id="ai-token-counter" class="ai-token-counter" title="Останній запит">🎫 —</span>
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

  // Підвантажуємо ключі одразу при відкритті, щоб показати активний
  loadAllGeminiKeys().then(() => updateKeyIndicator());
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

  // ── Зміна рівня контексту ──
  const levelSelect = modal.querySelector(
    "#ai-context-level",
  ) as HTMLSelectElement | null;
  if (levelSelect) {
    levelSelect.addEventListener("change", () => {
      aiContextLevel = levelSelect.value as AIContextLevel;
      localStorage.setItem("aiContextLevel", aiContextLevel);
      console.log(`⚙️ AI рівень контексту: ${aiContextLevel}`);
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
  let dashboardSelectedDate: Date = new Date();

  async function loadDashboardData(date?: Date) {
    if (date) dashboardSelectedDate = date;
    dashboardLoading.style.display = "flex";
    dashboardContent.innerHTML = "";
    const stats = await loadDailyStats(dashboardSelectedDate);
    dashboardLoading.style.display = "none";
    renderDashboard(stats, dashboardContent, dashboardSelectedDate);

    // Підключаємо обробник зміни дати
    const dateInput = dashboardContent.querySelector(
      "#ai-dashboard-date-input",
    ) as HTMLInputElement;
    if (dateInput) {
      dateInput.addEventListener("change", () => {
        const newDate = new Date(dateInput.value + "T00:00:00");
        if (!isNaN(newDate.getTime())) {
          loadDashboardData(newDate);
        }
      });
    }
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

    // Перевіряємо чи є тег [FILTER:...] у відповіді
    const filterResult = extractFilterTag(reply);
    const displayText = filterResult ? filterResult.cleanText : reply;

    const assistantMsg: ChatMessage = {
      role: "assistant",
      text: displayText,
      timestamp: new Date(),
    };
    chatHistory.push(assistantMsg);
    renderMessage(assistantMsg, messagesEl);

    // Якщо є фільтр — застосовуємо його до таблиці
    if (filterResult && filterResult.filterText) {
      // Невелика затримка щоб користувач побачив відповідь
      setTimeout(() => {
        applyFilterFromAI(filterResult.filterText);
      }, 1200);
    }

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

  // ── Голосове введення в чат ──
  const voiceBtn = modal.querySelector(
    "#ai-chat-voice-btn",
  ) as HTMLButtonElement;
  if (voiceBtn) {
    voiceBtn.addEventListener("click", async () => {
      // Якщо вже слухає — зупинити
      if (voiceBtn.classList.contains("ai-chat-voice-btn--listening")) {
        voiceBtn.classList.remove("ai-chat-voice-btn--listening");
        voiceBtn.innerHTML = "🎙️";
        return;
      }

      try {
        voiceBtn.classList.add("ai-chat-voice-btn--listening");
        voiceBtn.innerHTML = `<span class="ai-voice-pulse">🔴</span>`;

        const text = await startChatVoiceInput();

        voiceBtn.classList.remove("ai-chat-voice-btn--listening");
        voiceBtn.innerHTML = "🎙️";

        if (text?.trim()) {
          inputEl.value = text.trim();
          inputEl.style.height = "auto";
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
          inputEl.focus();
        }
      } catch (err: any) {
        voiceBtn.classList.remove("ai-chat-voice-btn--listening");
        voiceBtn.innerHTML = "🎙️";
      }
    });
  }
}

// ============================================================
// ІНІЦІАЛІЗАЦІЯ КНОПКИ В МЕНЮ
// ============================================================

export function initAIChatButton(): void {
  // Перевіряємо чи увімкнено ШІ Атлас
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

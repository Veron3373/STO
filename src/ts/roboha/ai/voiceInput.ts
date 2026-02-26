// src/ts/roboha/ai/voiceInput.ts
// 🎤 Голосове введення в наряд — Web Speech API + Gemini парсинг
// Контекстне: заповнює рядок/клітинку на якій стоїть фокус

import { supabase } from "../../vxid/supabaseClient";
import {
  globalCache,
  ACT_ITEMS_TABLE_CONTAINER_ID,
} from "../zakaz_naraudy/globalCache";
import { updateCalculatedSumsInFooter } from "../zakaz_naraudy/modalUI";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { handleItemSelection } from "./aiPriceHelper";

// ============================================================
// ТИПИ
// ============================================================

/** Яка колонка зараз у фокусі */
type ColumnType =
  | "name"
  | "id_count"
  | "price"
  | "slyusar_sum"
  | "pib_magazin"
  | "catalog"
  | "unknown";

/** Результат парсингу повного рядка (від Найменування) */
interface ParsedFullRow {
  type: "work" | "detail";
  name: string;
  price: number | null;
  quantity: number | null;
  slyusar: string | null;
  slyusarSum: number | null;
}

/** Стан голосового запису */
type VoiceState = "idle" | "listening" | "processing";

// ============================================================
// СТАН
// ============================================================

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

let voiceState: VoiceState = "idle";
let recognition: any = null;
let geminiApiKeys: string[] = [];
let currentKeyIndex = 0;
let keysLoaded = false;

/** Останній сфокусований рядок та комірка */
let lastFocusedRow: HTMLTableRowElement | null = null;
let lastFocusedColumn: ColumnType = "unknown";

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧІВ GEMINI
// ============================================================

async function loadGeminiKeys(): Promise<string[]> {
  if (keysLoaded && geminiApiKeys.length > 0) return geminiApiKeys;

  const keys: string[] = [];
  let activeIndex = 0;

  try {
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey) keys.push(envKey);

    const { data } = await supabase
      .from("settings")
      .select('setting_id, "Загальні", "API"')
      .in(
        "setting_id",
        Array.from({ length: 10 }, (_, i) => 20 + i),
      )
      .order("setting_id");

    if (data) {
      let idx = keys.length;
      for (const row of data) {
        const val = (row as any)["Загальні"];
        const isActive = (row as any)["API"];
        if (val && typeof val === "string" && val.trim()) {
          if (!keys.includes(val.trim())) {
            keys.push(val.trim());
            if (isActive === true) activeIndex = idx;
            idx++;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  geminiApiKeys = keys;
  keysLoaded = true;
  currentKeyIndex = activeIndex;
  return keys;
}

// ============================================================
// WEB SPEECH API
// ============================================================

export function isSpeechRecognitionSupported(): boolean {
  return !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

function startListening(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reject(new Error("Браузер не підтримує розпізнавання мови"));
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "uk-UA";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log(
        `🎤 Розпізнано (${Math.round(confidence * 100)}%): "${transcript}"`,
      );
      resolve(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("🎤 Помилка розпізнавання:", event.error);
      if (event.error === "no-speech") {
        reject(new Error("Мову не виявлено. Спробуйте ще раз."));
      } else if (event.error === "audio-capture") {
        reject(new Error("Мікрофон не знайдено. Перевірте підключення."));
      } else if (event.error === "not-allowed") {
        reject(
          new Error("Доступ до мікрофона заборонений. Дозвольте у браузері."),
        );
      } else {
        reject(new Error(`Помилка: ${event.error}`));
      }
    };

    recognition.onend = () => {
      recognition = null;
    };

    recognition.start();
  });
}

export function stopListening(): void {
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }
}

// ============================================================
// ТРЕКІНГ ФОКУСУ — яка клітинка/рядок зараз активний
// ============================================================

/**
 * Визначає data-name комірки (колонки)
 */
function getCellColumn(cell: HTMLElement): ColumnType {
  const dataName =
    cell.getAttribute("data-name") ||
    cell.closest("[data-name]")?.getAttribute("data-name") ||
    "";

  switch (dataName) {
    case "name":
      return "name";
    case "id_count":
      return "id_count";
    case "price":
      return "price";
    case "slyusar_sum":
      return "slyusar_sum";
    case "pib_magazin":
      return "pib_magazin";
    case "catalog":
      return "catalog";
    default:
      return "unknown";
  }
}

/**
 * Ініціалізує трекінг фокусу на клітинках таблиці.
 * Запам'ятовує останній сфокусований рядок та колонку.
 */
function initFocusTracking(): void {
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return;

  // Делегуємо: ловимо focusin/click на будь-якій комірці
  container.addEventListener("focusin", (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest("tr") as HTMLTableRowElement | null;
    if (row && row.closest("tbody")) {
      lastFocusedRow = row;
      lastFocusedColumn = getCellColumn(target);
      updateVoiceBtnHint();
    }
  });

  container.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest("tr") as HTMLTableRowElement | null;
    if (row && row.closest("tbody")) {
      lastFocusedRow = row;
      const col = getCellColumn(target);
      if (col !== "unknown") {
        lastFocusedColumn = col;
      }
      updateVoiceBtnHint();
    }
  });
}

/**
 * Оновлює підказку на кнопці голосу
 */
function updateVoiceBtnHint(): void {
  const btn = document.getElementById("voice-input-button");
  if (!btn || voiceState !== "idle") return;

  const colLabels: Record<ColumnType, string> = {
    name: "Найменування → весь рядок",
    id_count: "Кількість",
    price: "Ціна",
    slyusar_sum: "Зарплата",
    pib_magazin: "ПІБ / Магазин",
    catalog: "Каталог",
    unknown: "оберіть клітинку",
  };

  if (lastFocusedRow && lastFocusedColumn !== "unknown") {
    const rowIdx =
      lastFocusedRow.querySelector(".row-index")?.textContent?.trim() || "";
    btn.title = `🎤 Голос → рядок ${rowIdx}, ${colLabels[lastFocusedColumn]}`;
  } else {
    btn.title = "🎤 Голос — спочатку клікніть на клітинку в таблиці";
  }
}

// ============================================================
// GEMINI: ПОВНИЙ ПАРСИНГ РЯДКА (коли фокус на Найменуванні)
// ============================================================

async function parseFullRowWithGemini(
  transcript: string,
): Promise<ParsedFullRow | null> {
  const keys = await loadGeminiKeys();
  if (keys.length === 0) {
    throw new Error("Немає API ключів Gemini. Додайте ключі в налаштуваннях.");
  }

  const workNames = globalCache.works.slice(0, 200);
  const detailNames = globalCache.details.slice(0, 200);
  const slyusarNames = globalCache.slyusars.map((s) => s.Name).filter(Boolean);

  const systemPrompt = `Ти — парсер голосових команд для автомобільного СТО (Україна).
Механік каже фразу яка описує ОДИН рядок в акті: назву роботи/деталі та характеристики.

ПРАВИЛА: Користувач говорить в ДОВІЛЬНОМУ порядку, використовуючи ключові слова:
- Слово(а) перед/без ключових — це НАЗВА роботи/деталі
- "кількість" / "штук" / "штуки" + число → кількість
- "ціна" / "за" / "по" / "коштує" / просто число після назви → ціна
- "зарплата" / "зп" / "зарплатня" + число → зарплата слюсаря
- Прізвище (якщо збігається зі СЛЮСАРЕМ) → слюсар
- Числа словами: "тисяча двісті" = 1200, "п'ятсот" = 500

ДОСТУПНІ РОБОТИ:
${workNames.join("\n")}

ДОСТУПНІ ДЕТАЛІ:
${detailNames.join("\n")}

СЛЮСАРІ:
${slyusarNames.join(", ")}

ФОРМАТ ВІДПОВІДІ — ТІЛЬКИ JSON об'єкт (без markdown, без \`\`\`):
{
  "type": "work" або "detail",
  "name": "точна назва з доступного списку",
  "price": число або null,
  "quantity": число або null,
  "slyusar": "Ім'я слюсаря" або null,
  "slyusarSum": число або null
}

Якщо не розпізнано — поверни: {"type":"work","name":"","price":null,"quantity":null,"slyusar":null,"slyusarSum":null}

ПРИКЛАДИ:
"Заміна масла кількість один ціна тисяча зарплата п'ятсот Петренко"
→ {"type":"work","name":"Заміна масла двигуна","price":1000,"quantity":1,"slyusar":"Петренко","slyusarSum":500}

"фільтр масляний дві штуки по триста"
→ {"type":"detail","name":"Фільтр масляний","price":300,"quantity":2,"slyusar":null,"slyusarSum":null}

"заміна"
→ {"type":"work","name":"Заміна...","price":null,"quantity":null,"slyusar":null,"slyusarSum":null}

"розвал сходження вісімсот"
→ {"type":"work","name":"Розвал-сходження","price":800,"quantity":1,"slyusar":null,"slyusarSum":null}`;

  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `Розбери: "${transcript}"` }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  });

  return await callGeminiForObject(requestBody);
}

/**
 * Парсить значення одного поля через Gemini
 */
async function parseSingleFieldWithGemini(
  transcript: string,
  column: ColumnType,
): Promise<string | number | null> {
  // Для чисел — спочатку локально
  if (column === "id_count" || column === "price" || column === "slyusar_sum") {
    const localNum = tryParseNumberLocally(transcript);
    if (localNum !== null) return localNum;
  }

  // Для ПІБ — шукаємо серед слюсарів/магазинів
  if (column === "pib_magazin") {
    const localMatch = findSlyusarOrShop(transcript);
    if (localMatch) return localMatch;
  }

  const keys = await loadGeminiKeys();
  if (keys.length === 0) throw new Error("Немає API ключів Gemini.");

  const columnLabel: Record<string, string> = {
    id_count: "КІЛЬКІСТЬ (ціле число)",
    price: "ЦІНА (число в гривнях)",
    slyusar_sum: "ЗАРПЛАТА слюсаря (число в гривнях)",
    pib_magazin: "ПІБ слюсаря або назва магазину",
    catalog: "Каталожний номер",
    name: "Назва роботи або деталі",
  };

  let contextList = "";
  if (column === "pib_magazin") {
    const names = [
      ...globalCache.slyusars.map((s) => s.Name),
      ...globalCache.shops.map((s) => s.Name),
    ].filter(Boolean);
    contextList = `\nДОСТУПНІ ІМЕНА:\n${names.join(", ")}`;
  }
  if (column === "name") {
    contextList = `\nДОСТУПНІ РОБОТИ:\n${globalCache.works.slice(0, 100).join("\n")}\n\nДОСТУПНІ ДЕТАЛІ:\n${globalCache.details.slice(0, 100).join("\n")}`;
  }

  const systemPrompt = `Ти парсер голосового введення. Користувач каже значення для поля: ${columnLabel[column] || column}.
${contextList}

Відповідай ТІЛЬКИ значенням — без пояснень, без лапок, без JSON.
Для чисел: переведи слова в цифри. "тисяча двісті" → 1200, "п'ятсот" → 500, "два" → 2, "п'ять" → 5.
Для імен: знайди найближче з доступних.
Для назв: знайди найближчу з доступних списків.`;

  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: transcript }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 128 },
  });

  const triedIndices = new Set<number>();
  let startIndex = currentKeyIndex;

  while (triedIndices.size < keys.length) {
    const keyIdx = startIndex % keys.length;
    triedIndices.add(keyIdx);
    const apiKey = keys[keyIdx];

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (response.ok) {
        currentKeyIndex = keyIdx;
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) return null;

        // Числове поле — витягти число
        if (
          column === "id_count" ||
          column === "price" ||
          column === "slyusar_sum"
        ) {
          const num = parseFloat(
            text.replace(/[^\d.,]/g, "").replace(",", "."),
          );
          return isNaN(num) ? null : Math.round(num);
        }

        return text;
      }

      if (response.status === 429) {
        currentKeyIndex = (keyIdx + 1) % keys.length;
        startIndex = keyIdx + 1;
        continue;
      }
      return null;
    } catch {
      startIndex = keyIdx + 1;
    }
  }
  return null;
}

// ============================================================
// GEMINI API (спільний виклик для повного рядка)
// ============================================================

async function callGeminiForObject(
  requestBody: string,
): Promise<ParsedFullRow | null> {
  const keys = geminiApiKeys;
  const triedIndices = new Set<number>();
  let startIndex = currentKeyIndex;

  while (triedIndices.size < keys.length) {
    const keyIdx = startIndex % keys.length;
    triedIndices.add(keyIdx);
    const apiKey = keys[keyIdx];

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (response.ok) {
        currentKeyIndex = keyIdx;
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn("🎤 Gemini не повернув JSON:", text);
          return null;
        }
        return JSON.parse(jsonMatch[0]);
      }

      if (response.status === 429) {
        currentKeyIndex = (keyIdx + 1) % keys.length;
        startIndex = keyIdx + 1;
        continue;
      }
      return null;
    } catch (err) {
      if (triedIndices.size >= keys.length) throw err;
      startIndex = keyIdx + 1;
    }
  }
  return null;
}

// ============================================================
// ЛОКАЛЬНИЙ ПАРСИНГ ЧИСЕЛ (без Gemini — швидко)
// ============================================================

const UKR_NUMBERS: Record<string, number> = {
  нуль: 0,
  один: 1,
  одна: 1,
  одне: 1,
  два: 2,
  дві: 2,
  три: 3,
  чотири: 4,
  "п'ять": 5,
  пять: 5,
  шість: 6,
  сім: 7,
  вісім: 8,
  "дев'ять": 9,
  девять: 9,
  десять: 10,
  одинадцять: 11,
  дванадцять: 12,
  тринадцять: 13,
  чотирнадцять: 14,
  "п'ятнадцять": 15,
  шістнадцять: 16,
  сімнадцять: 17,
  вісімнадцять: 18,
  "дев'ятнадцять": 19,
  двадцять: 20,
  тридцять: 30,
  сорок: 40,
  "п'ятдесят": 50,
  пятдесят: 50,
  шістдесят: 60,
  сімдесят: 70,
  вісімдесят: 80,
  "дев'яносто": 90,
  сто: 100,
  двісті: 200,
  триста: 300,
  чотириста: 400,
  "п'ятсот": 500,
  пятсот: 500,
  шістсот: 600,
  сімсот: 700,
  вісімсот: 800,
  "дев'ятсот": 900,
  девятсот: 900,
  тисяча: 1000,
  тисячі: 1000,
  тисяч: 1000,
};

function tryParseNumberLocally(text: string): number | null {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[.,;!?]/g, "");

  // Просте число цифрами
  const numMatch = cleaned.match(/^(\d+)$/);
  if (numMatch) return parseInt(numMatch[1], 10);

  // "1200 грн"
  const numSuffix = cleaned.match(/^(\d+)\s*(грн|грив|шт|штук)?$/);
  if (numSuffix) return parseInt(numSuffix[1], 10);

  // Українські числівники
  const words = cleaned.split(/[\s-]+/);
  let total = 0;
  let current = 0;
  let hasNumber = false;

  for (const word of words) {
    if (["грн", "гривень", "штук", "штуки", "штука"].includes(word)) continue;

    const val = UKR_NUMBERS[word];
    if (val !== undefined) {
      hasNumber = true;
      if (val === 1000) {
        current = current === 0 ? 1000 : current * 1000;
        total += current;
        current = 0;
      } else if (val >= 100) {
        current += val;
      } else {
        current += val;
      }
    } else {
      const digitMatch = word.match(/^\d+$/);
      if (digitMatch) {
        hasNumber = true;
        current += parseInt(digitMatch[0], 10);
      }
    }
  }

  total += current;
  return hasNumber && total > 0 ? total : null;
}

// ============================================================
// ПОШУК ЗБІГІВ У КЕШІ
// ============================================================

function findBestMatch(
  parsedName: string,
  type: "work" | "detail",
): { name: string; workId?: string; scladId?: number } | null {
  const nameLower = parsedName.toLowerCase().trim();
  if (!nameLower) return null;

  if (type === "work") {
    const exact = globalCache.worksWithId.find(
      (w) => w.name.toLowerCase() === nameLower,
    );
    if (exact) return { name: exact.name, workId: exact.work_id };

    const partial = globalCache.worksWithId.find(
      (w) =>
        w.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(w.name.toLowerCase()),
    );
    if (partial) return { name: partial.name, workId: partial.work_id };

    const searchWords = nameLower.split(/\s+/).filter((w) => w.length > 2);
    let best: { name: string; workId: string; score: number } | null = null;
    for (const w of globalCache.worksWithId) {
      const wL = w.name.toLowerCase();
      const score = searchWords.filter((sw) => wL.includes(sw)).length;
      if (score >= 1 && (!best || score > best.score)) {
        best = { name: w.name, workId: w.work_id, score };
      }
    }
    if (best) return { name: best.name, workId: best.workId };
    return null;
  } else {
    const exactS = globalCache.skladParts.find(
      (p) => p.name.toLowerCase() === nameLower,
    );
    if (exactS) return { name: exactS.name, scladId: exactS.sclad_id };

    const partS = globalCache.skladParts.find(
      (p) =>
        p.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(p.name.toLowerCase()),
    );
    if (partS) return { name: partS.name, scladId: partS.sclad_id };

    const exactD = globalCache.details.find(
      (d) => d.toLowerCase() === nameLower,
    );
    if (exactD) return { name: exactD };

    const partD = globalCache.details.find(
      (d) =>
        d.toLowerCase().includes(nameLower) ||
        nameLower.includes(d.toLowerCase()),
    );
    if (partD) return { name: partD };
    return null;
  }
}

function findSlyusarOrShop(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  for (const s of globalCache.slyusars) {
    if (s.Name.toLowerCase() === t) return s.Name;
  }
  for (const s of globalCache.slyusars) {
    if (s.Name.toLowerCase().includes(t) || t.includes(s.Name.toLowerCase()))
      return s.Name;
  }
  for (const s of globalCache.shops) {
    if (s.Name.toLowerCase() === t) return s.Name;
  }
  for (const s of globalCache.shops) {
    if (s.Name.toLowerCase().includes(t) || t.includes(s.Name.toLowerCase()))
      return s.Name;
  }
  return null;
}

// ============================================================
// ЗАПОВНЕННЯ РЯДКА / КЛІТИНКИ
// ============================================================

/**
 * Заповнює повний рядок (коли фокус на Найменуванні)
 */
function fillFullRow(row: HTMLTableRowElement, parsed: ParsedFullRow): void {
  const match = findBestMatch(parsed.name, parsed.type);
  const finalName = match?.name || parsed.name;
  const isWork = parsed.type === "work";

  // Назва
  const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
  if (nameCell && finalName) {
    nameCell.textContent = finalName;
    nameCell.setAttribute("data-full-name", finalName);
    nameCell.setAttribute("data-type", isWork ? "works" : "details");
  }

  // Іконка рядка
  const indexCell = row.querySelector(".row-index");
  if (indexCell) {
    const icon = isWork ? "🛠️" : "⚙️";
    const idx = indexCell.textContent?.match(/\d+/)?.[0] || "1";
    indexCell.innerHTML = `${icon} ${idx}`;
  }

  // Каталог
  if (isWork && match?.workId) {
    const catCell = row.querySelector('[data-name="catalog"]') as HTMLElement;
    if (catCell) catCell.textContent = match.workId;
  }
  if (!isWork && match?.scladId) {
    const catCell = row.querySelector('[data-name="catalog"]') as HTMLElement;
    if (catCell) catCell.setAttribute("data-sclad-id", String(match.scladId));
  }

  // Кількість
  const qtyCell = row.querySelector('[data-name="id_count"]') as HTMLElement;
  if (qtyCell) qtyCell.textContent = String(parsed.quantity ?? 1);

  // Ціна
  const priceCell = row.querySelector('[data-name="price"]') as HTMLElement;
  if (priceCell && parsed.price !== null) {
    priceCell.textContent = String(parsed.price);
  }

  // Сума
  const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
  if (sumCell && parsed.price !== null) {
    sumCell.textContent = String(parsed.price * (parsed.quantity ?? 1));
  }

  // Слюсар
  if (parsed.slyusar) {
    const found = findSlyusarOrShop(parsed.slyusar);
    if (found) {
      const pibCell = row.querySelector(
        '[data-name="pib_magazin"]',
      ) as HTMLElement;
      if (pibCell) {
        pibCell.textContent = found;
        pibCell.setAttribute("data-type", "slyusars");
      }
    }
  }

  // Зарплата
  if (parsed.slyusarSum !== null) {
    const sCell = row.querySelector('[data-name="slyusar_sum"]') as HTMLElement;
    if (sCell) sCell.textContent = String(parsed.slyusarSum);
  }

  // ШІ-підказка ціни якщо не вказана
  if (parsed.price === null && finalName) {
    handleItemSelection(row, finalName, parsed.type).catch(() => {});
  }

  updateCalculatedSumsInFooter();
}

/**
 * Заповнює одну клітинку
 */
function fillSingleCell(
  row: HTMLTableRowElement,
  column: ColumnType,
  value: string | number,
): void {
  const cell = row.querySelector(`[data-name="${column}"]`) as HTMLElement;
  if (!cell) return;

  if (column === "pib_magazin") {
    const found = findSlyusarOrShop(String(value));
    cell.textContent = found || String(value);
    if (found) {
      const isSlyusar = globalCache.slyusars.some((s) => s.Name === found);
      cell.setAttribute("data-type", isSlyusar ? "slyusars" : "shops");
    }
  } else {
    cell.textContent = String(value);
  }

  // Перерахунок суми
  if (column === "price" || column === "id_count") {
    const priceEl = row.querySelector('[data-name="price"]') as HTMLElement;
    const qtyEl = row.querySelector('[data-name="id_count"]') as HTMLElement;
    const sumEl = row.querySelector('[data-name="sum"]') as HTMLElement;
    const price = parseFloat(priceEl?.textContent?.replace(/\s/g, "") || "0");
    const qty = parseFloat(qtyEl?.textContent?.replace(/\s/g, "") || "1");
    if (sumEl && !isNaN(price) && !isNaN(qty)) {
      sumEl.textContent = String(Math.round(price * qty));
    }
  }

  updateCalculatedSumsInFooter();
}

// ============================================================
// КНОПКА МІКРОФОНА — UI
// ============================================================

function updateMicButton(btn: HTMLElement, state: VoiceState): void {
  voiceState = state;
  btn.classList.remove("voice-idle", "voice-listening", "voice-processing");

  switch (state) {
    case "idle":
      btn.classList.add("voice-idle");
      btn.innerHTML = `<span class="voice-btn-icon">🎤</span><span class="voice-btn-text">Голос</span>`;
      updateVoiceBtnHint();
      break;
    case "listening":
      btn.classList.add("voice-listening");
      btn.innerHTML = `<span class="voice-btn-icon voice-pulse">🔴</span><span class="voice-btn-text">Слухаю...</span>`;
      btn.title = "Слухаю... Натисніть для зупинки";
      break;
    case "processing":
      btn.classList.add("voice-processing");
      btn.innerHTML = `<span class="voice-btn-icon voice-spin">⚙️</span><span class="voice-btn-text">Аналізую...</span>`;
      btn.title = "Обробка...";
      break;
  }
}

/**
 * Показує результат голосового введення
 */
function showVoiceResult(
  transcript: string,
  column: ColumnType,
  success: boolean,
  details?: string,
): void {
  document.getElementById("voice-result-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "voice-result-overlay";
  overlay.className = "voice-result-overlay";

  const colNames: Record<ColumnType, string> = {
    name: "Найменування",
    id_count: "Кількість",
    price: "Ціна",
    slyusar_sum: "Зарплата",
    pib_magazin: "ПІБ/Магазин",
    catalog: "Каталог",
    unknown: "—",
  };

  const statusIcon = success ? "✅" : "❌";
  const statusText = success ? details || "Записано" : "Не вдалося розпізнати";

  overlay.innerHTML = `
    <div class="voice-result-content">
      <div class="voice-result-header">
        <span>🎤 ${colNames[column]}:</span>
        <button class="voice-result-close" id="voice-result-close-btn">✕</button>
      </div>
      <div class="voice-result-transcript">"${transcript}"</div>
      <div class="voice-result-items">
        <div class="voice-result-item ${success ? "" : "voice-result-empty"}">${statusIcon} ${statusText}</div>
      </div>
    </div>
  `;

  const modalBody = document.getElementById("zakaz_narayd-body");
  (modalBody || document.body).appendChild(overlay);

  document
    .getElementById("voice-result-close-btn")
    ?.addEventListener("click", () => overlay.remove());
  setTimeout(() => overlay.remove(), 4000);
}

// ============================================================
// ГОЛОВНИЙ ОБРОБНИК
// ============================================================

export async function handleVoiceButtonClick(btn: HTMLElement): Promise<void> {
  // Якщо вже слухаємо — зупинити
  if (voiceState === "listening") {
    stopListening();
    updateMicButton(btn, "idle");
    return;
  }
  if (voiceState === "processing") return;

  if (!isSpeechRecognitionSupported()) {
    showNotification(
      "❌ Браузер не підтримує розпізнавання мови. Використовуйте Chrome.",
      "error",
      4000,
    );
    return;
  }

  // Перевіряємо чи є фокус на рядку
  if (!lastFocusedRow || lastFocusedColumn === "unknown") {
    showNotification(
      "⚠️ Спочатку клікніть на клітинку в таблиці, потім натисніть 🎤",
      "warning",
      3000,
    );
    return;
  }

  // Перевіряємо чи рядок ще існує
  if (!lastFocusedRow.closest("tbody")) {
    showNotification(
      "⚠️ Рядок видалено. Клікніть на інший рядок.",
      "warning",
      2500,
    );
    lastFocusedRow = null;
    lastFocusedColumn = "unknown";
    return;
  }

  const targetRow = lastFocusedRow;
  const targetColumn = lastFocusedColumn;

  // Підказка що говорити
  const hints: Record<ColumnType, string> = {
    name: "назву роботи/деталі (+ кількість, ціну, зарплату, ПІБ)",
    id_count: "кількість (число)",
    price: "ціну (число)",
    slyusar_sum: "зарплату (число)",
    pib_magazin: "прізвище слюсаря або магазин",
    catalog: "номер каталогу",
    unknown: "",
  };

  try {
    updateMicButton(btn, "listening");
    showNotification(`🎤 Говоріть ${hints[targetColumn]}...`, "info", 3000);

    const transcript = await startListening();

    if (!transcript?.trim()) {
      showNotification("🎤 Мову не розпізнано. Спробуйте ще.", "warning", 2500);
      updateMicButton(btn, "idle");
      return;
    }

    updateMicButton(btn, "processing");

    if (targetColumn === "name") {
      // === ПОВНИЙ РЯДОК ===
      showNotification(`🔄 Аналізую: "${transcript}"`, "info", 2000);
      const parsed = await parseFullRowWithGemini(transcript);

      if (parsed && parsed.name) {
        fillFullRow(targetRow, parsed);
        const match = findBestMatch(parsed.name, parsed.type);
        const finalName = match?.name || parsed.name;
        const icon = parsed.type === "work" ? "🛠️" : "⚙️";

        // Збираємо деталі що заповнено
        const parts: string[] = [`${icon} ${finalName}`];
        if (parsed.quantity) parts.push(`К-ть: ${parsed.quantity}`);
        if (parsed.price) parts.push(`Ціна: ${parsed.price}`);
        if (parsed.slyusarSum) parts.push(`Зар-та: ${parsed.slyusarSum}`);
        if (parsed.slyusar) parts.push(`ПІБ: ${parsed.slyusar}`);

        showNotification(`✅ ${parts[0]}`, "success", 3000);
        showVoiceResult(transcript, targetColumn, true, parts.join(" | "));
      } else {
        showNotification(
          `❌ Не вдалося розібрати: "${transcript}"`,
          "warning",
          3500,
        );
        showVoiceResult(transcript, targetColumn, false);
      }
    } else {
      // === ОДНА КЛІТИНКА ===
      const value = await parseSingleFieldWithGemini(transcript, targetColumn);

      if (value !== null) {
        fillSingleCell(targetRow, targetColumn, value);
        showNotification(`✅ Записано: ${value}`, "success", 2500);
        showVoiceResult(transcript, targetColumn, true, String(value));
      } else {
        showNotification(`❌ Не розпізнано: "${transcript}"`, "warning", 3000);
        showVoiceResult(transcript, targetColumn, false);
      }
    }
  } catch (err: any) {
    console.error("🎤 Помилка:", err);
    showNotification(
      `❌ ${err.message || "Помилка голосового введення"}`,
      "error",
      3500,
    );
  } finally {
    updateMicButton(btn, "idle");
  }
}

// ============================================================
// СТВОРЕННЯ ТА ІНІЦІАЛІЗАЦІЯ
// ============================================================

export function createVoiceButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = "voice-input-button";
  btn.className = "action-button voice-input-button voice-idle";
  btn.type = "button";
  btn.innerHTML = `<span class="voice-btn-icon">🎤</span><span class="voice-btn-text">Голос</span>`;
  btn.title = "🎤 Голос — спочатку клікніть на клітинку";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleVoiceButtonClick(btn);
  });

  return btn;
}

/**
 * Ініціалізує голосове введення:
 * 1. Трекінг фокусу на клітинках таблиці
 * 2. Кнопка 🎤 між "Додати рядок" та "Зберегти"
 */
export function initVoiceInput(): void {
  if (globalCache.isActClosed) return;

  if (!isSpeechRecognitionSupported()) {
    console.log(
      "🎤 Голосове введення недоступне: Web Speech API не підтримується",
    );
    return;
  }

  // Трекінг фокусу клітинок
  initFocusTracking();

  // Кнопка
  const container = document.querySelector(".zakaz_narayd-buttons-container");
  if (!container) return;
  if (document.getElementById("voice-input-button")) return;

  const voiceBtn = createVoiceButton();
  const saveBtn = document.getElementById("save-act-data");
  if (saveBtn) {
    container.insertBefore(voiceBtn, saveBtn);
  } else {
    container.appendChild(voiceBtn);
  }
}

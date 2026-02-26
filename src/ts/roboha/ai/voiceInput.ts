// src/ts/roboha/ai/voiceInput.ts
// 🎙️ Голосове введення в акт — ключові фрази визначають ціль
// Формат: "[ключ] [значення]"
// Наприклад: "пробіг 150000", "рядок 2 найменування заміна масла"

import { supabase } from "../../vxid/supabaseClient";
import {
  globalCache,
  ACT_ITEMS_TABLE_CONTAINER_ID,
} from "../zakaz_naraudy/globalCache";
import {
  updateCalculatedSumsInFooter,
  addNewRow,
} from "../zakaz_naraudy/modalUI";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { handleItemSelection } from "./aiPriceHelper";

// ============================================================
// ТИПИ
// ============================================================

/** Куди записати голосові дані */
type VoiceTarget =
  | { kind: "field"; fieldId: string; label: string }
  | { kind: "cell"; rowIndex: number; column: string; label: string };

/** Результат парсингу повного рядка (Найменування) через Gemini */
interface ParsedFullRow {
  type: "work" | "detail";
  name: string;
  price: number | null;
  quantity: number | null;
  slyusar: string | null;
  slyusarSum: number | null;
}

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

// ============================================================
// КЛЮЧІ GEMINI
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

    // Таймаут — якщо за 7с нічого немає, зупиняємо
    const timeout = setTimeout(() => {
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
      reject(new Error("Час очікування вичерпано"));
    }, 7000);

    recognition.onresult = (event: any) => {
      clearTimeout(timeout);
      const transcript = event.results[0][0].transcript;
      resolve(transcript);
    };

    recognition.onerror = (event: any) => {
      clearTimeout(timeout);
      if (event.error === "no-speech")
        reject(new Error("Мову не виявлено. Спробуйте ще раз."));
      else if (event.error === "audio-capture")
        reject(new Error("Мікрофон не знайдено."));
      else if (event.error === "not-allowed")
        reject(new Error("Доступ до мікрофона заборонений."));
      else reject(new Error(`Помилка: ${event.error}`));
    };

    recognition.onend = () => {
      clearTimeout(timeout);
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
// ПАРСИНГ КЛЮЧОВИХ ФРАЗ — визначення КУДИ вводити
// ============================================================

/**
 * Ключові фрази для верхніх полів акту.
 * Порядок важливий — довші фрази першими!
 */
const FIELD_KEYWORDS: { keywords: string[]; fieldId: string; label: string }[] =
  [
    {
      keywords: ["причина звернення", "причина"],
      fieldId: "editable-reason",
      label: "Причина звернення",
    },
    {
      keywords: ["рекомендації", "рекомендація"],
      fieldId: "editable-recommendations",
      label: "Рекомендації",
    },
    {
      keywords: ["примітки", "примітка", "нотатки", "замітки"],
      fieldId: "editable-notes",
      label: "Примітки",
    },
    {
      keywords: ["пробіг", "пробег", "кілометраж"],
      fieldId: "editable-probig",
      label: "Пробіг",
    },
    { keywords: ["аванс"], fieldId: "editable-avans", label: "Аванс" },
    {
      keywords: ["знижка", "скидка", "скідка"],
      fieldId: "editable-discount",
      label: "Знижка",
    },
  ];

/**
 * Ключові фрази для колонок таблиці.
 * Порядок важливий — довші фрази першими!
 */
const COLUMN_KEYWORDS: { keywords: string[]; column: string; label: string }[] =
  [
    {
      keywords: ["найменування", "назва", "робота", "деталь", "запчастина"],
      column: "name",
      label: "Найменування",
    },
    {
      keywords: ["каталог", "каталожний", "артикул"],
      column: "catalog",
      label: "Каталог",
    },
    {
      keywords: ["кількість", "штук", "штуки"],
      column: "id_count",
      label: "К-ть",
    },
    {
      keywords: ["ціна", "вартість", "коштує", "прайс"],
      column: "price",
      label: "Ціна",
    },
    {
      keywords: ["зарплата", "зарплатня", "зп"],
      column: "slyusar_sum",
      label: "Зар-та",
    },
    {
      keywords: [
        "піб",
        "слюсар",
        "виконавець",
        "прізвище",
        "фамілія",
        "магазин",
      ],
      column: "pib_magazin",
      label: "ПІБ",
    },
  ];

/**
 * Парсить голосову фразу → визначає КУДИ і ЩО записати.
 * Формати:
 *   "пробіг 150000"
 *   "причина звернення ТО"
 *   "рядок 2 найменування заміна масла"
 *   "2 ціна тисяча"
 *   "рядок 3 кількість два"
 *   "додати рядок заміна масла" — додає новий рядок і заповнює
 */
function parseVoiceCommand(
  transcript: string,
): { target: VoiceTarget; value: string } | null {
  const text = transcript.trim().toLowerCase();
  if (!text) return null;

  // --- 1. Перевірка полів акту (Пробіг, Причина звернення, Рекомендації, Примітки, Аванс, Знижка)
  for (const field of FIELD_KEYWORDS) {
    for (const kw of field.keywords) {
      if (text.startsWith(kw)) {
        const value = transcript.trim().substring(kw.length).trim();
        return {
          target: { kind: "field", fieldId: field.fieldId, label: field.label },
          value: value || "",
        };
      }
    }
  }

  // --- 2. Перевірка рядків таблиці: "рядок N [колонка] [значення]" або "N [колонка] [значення]"
  // Формат: "рядок 2 найменування заміна масла", "3 ціна 500", "рядок 1 піб Петренко"
  const rowPatterns = [
    /^(?:рядок|строка|строчка|ряд)\s+(\d+)\s+(.+)$/i,
    /^(\d+)\s+(.+)$/i,
  ];

  for (const pattern of rowPatterns) {
    const match = text.match(pattern);
    if (match) {
      const rowIndex = parseInt(match[1], 10);
      const rest = match[2].trim();

      // Шукаємо ключову колонку в rest
      for (const col of COLUMN_KEYWORDS) {
        for (const kw of col.keywords) {
          if (rest.startsWith(kw)) {
            // Залишок після ключового слова = значення
            const valueStart = rest.indexOf(kw) + kw.length;
            const value = rest.substring(valueStart).trim();
            return {
              target: {
                kind: "cell",
                rowIndex,
                column: col.column,
                label: col.label,
              },
              value: value || "",
            };
          }
        }
      }

      // Якщо колонка не вказана — за замовчуванням "Найменування"
      return {
        target: {
          kind: "cell",
          rowIndex,
          column: "name",
          label: "Найменування",
        },
        value: rest,
      };
    }
  }

  // --- 3. Колонка БЕЗ номера рядка: "найменування заміна масла", "ціна 500", "піб Петренко"
  // → знаходимо перший порожній рядок в цій колонці, або останній рядок
  for (const col of COLUMN_KEYWORDS) {
    for (const kw of col.keywords) {
      if (text.startsWith(kw)) {
        const value = transcript.trim().substring(kw.length).trim();
        const targetRow = findFirstEmptyRowForColumn(col.column);
        return {
          target: {
            kind: "cell",
            rowIndex: targetRow,
            column: col.column,
            label: col.label,
          },
          value: value || "",
        };
      }
    }
  }

  // --- 4. "додати рядок [найменування]" — додає порожній рядок і вписує
  const addRowMatch = text.match(
    /^(?:додати рядок|новий рядок|додати)\s*(.*)$/i,
  );
  if (addRowMatch) {
    const value = addRowMatch[1].trim();
    // Додаємо рядок та отримуємо його номер
    return {
      target: {
        kind: "cell",
        rowIndex: -1,
        column: "name",
        label: "Новий рядок",
      },
      value: value || "",
    };
  }

  // --- 5. Якщо не розпізнано як команду — трактуємо як найменування для першого порожнього рядка
  {
    const targetRow = findFirstEmptyRowForColumn("name");
    return {
      target: {
        kind: "cell",
        rowIndex: targetRow,
        column: "name",
        label: "Найменування",
      },
      value: transcript.trim(),
    };
  }
}

// ============================================================
// ДОПОМІЖНА УТИЛІТА: знайти рядок таблиці за номером
// ============================================================

function getTableRow(rowIndex: number): HTMLTableRowElement | null {
  const tbody = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`,
  );
  if (!tbody) return null;

  const rows = tbody.querySelectorAll("tr");
  // rowIndex починається з 1, rows від 0
  if (rowIndex < 1 || rowIndex > rows.length) return null;
  return rows[rowIndex - 1] as HTMLTableRowElement;
}

function getRowCount(): number {
  const tbody = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`,
  );
  if (!tbody) return 0;
  return tbody.querySelectorAll("tr").length;
}

/** Знайти перший рядок де колонка порожня. Якщо всі заповнені — повертає -1 (додати новий) */
function findFirstEmptyRowForColumn(column: string): number {
  const tbody = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`,
  );
  if (!tbody) return -1;

  const rows = tbody.querySelectorAll("tr");
  if (rows.length === 0) return -1;

  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i].querySelector(
      `[data-name="${column}"]`,
    ) as HTMLElement;
    if (cell) {
      const text = cell.textContent?.trim() || "";
      if (!text) return i + 1; // 1-based
    }
  }

  // Всі заповнені → останній рядок якщо це не name, інакше додати новий
  if (column === "name") return -1;
  return rows.length;
}

// ============================================================
// ЛОКАЛЬНИЙ ПАРСИНГ ЧИСЕЛ
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

  const numMatch = cleaned.match(/^(\d+)$/);
  if (numMatch) return parseInt(numMatch[1], 10);

  const numSuffix = cleaned.match(/^(\d+)\s*(грн|грив|шт|штук|км)?$/);
  if (numSuffix) return parseInt(numSuffix[1], 10);

  const words = cleaned.split(/[\s-]+/);
  let total = 0;
  let current = 0;
  let hasNumber = false;

  for (const word of words) {
    if (
      ["грн", "гривень", "штук", "штуки", "штука", "км", "кілометрів"].includes(
        word,
      )
    )
      continue;
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
// ПОШУК В КЕШІ
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

    // Fuzzy — обрізаний початок
    for (const w of globalCache.worksWithId) {
      const wL = w.name.toLowerCase();
      for (const ww of wL.split(/\s+/)) {
        if (ww.length > 3 && ww.endsWith(nameLower))
          return { name: w.name, workId: w.work_id };
      }
    }

    // По словах
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
// GEMINI: ПАРСИНГ РЯДКА (Найменування)
// ============================================================

async function parseFullRowWithGemini(
  transcript: string,
): Promise<ParsedFullRow | null> {
  const keys = await loadGeminiKeys();
  if (keys.length === 0) throw new Error("Немає API ключів Gemini.");

  const workNames = globalCache.works.slice(0, 200);
  const detailNames = globalCache.details.slice(0, 200);
  const slyusarNames = globalCache.slyusars.map((s) => s.Name).filter(Boolean);

  const systemPrompt = `Ти — парсер голосових команд для автомобільного СТО (Україна).
Механік каже фразу яка описує рядок в акті: назву роботи/деталі та характеристики.

ГОЛОВНЕ ПРАВИЛО: Знайди НАЙБІЛЬШ СХОЖУ назву з доступних списків.
НАВІТЬ якщо сказано одне слово ("заміна", "фільтр") — знайди роботу/деталь зі списку що МІСТИТЬ це слово.
НІКОЛИ не повертай порожнє name ("") та НІКОЛИ не додавай "..." до назви.

⚠️ ТИПОВІ ПОМИЛКИ РОЗПІЗНАВАННЯ (Голосове рушій часто обрізає початок):
- "аміна" → "заміна", "ільтр" → "фільтр", "асло" → "масло"
- "емонт" → "ремонт", "іагностика" → "діагностика"
Завжди відновлюй повне слово!

КЛЮЧОВІ СЛОВА:
- "кількість"/"штук" + число → quantity
- "ціна"/"за"/"по"/"коштує" → price
- "зарплата"/"зп" + число → slyusarSum
- Прізвище слюсаря → slyusar
- Числа словами: "тисяча двісті" = 1200

РОБОТИ:
${workNames.join("\n")}

ДЕТАЛІ:
${detailNames.join("\n")}

СЛЮСАРІ:
${slyusarNames.join(", ")}

Відповідь — ТІЛЬКИ JSON:
{"type":"work","name":"Точна назва зі списку","price":null,"quantity":1,"slyusar":null,"slyusarSum":null}`;

  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `Розбери: "${transcript}"` }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  return await callGeminiForObject(requestBody);
}

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
        const allParts = data?.candidates?.[0]?.content?.parts || [];
        const text = allParts.map((p: any) => p.text || "").join("");
        if (!text) return null;

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch {
            /* fallthrough */
          }
        }

        // Спроба відновити JSON
        return tryRepairJson(text);
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

function tryRepairJson(text: string): ParsedFullRow | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let jsonStr = text
    .substring(start)
    .replace(/```[\s\S]*$/g, "")
    .trim();

  if (!jsonStr.endsWith("}")) {
    let braceCount = 0;
    for (const ch of jsonStr) {
      if (ch === "{") braceCount++;
      if (ch === "}") braceCount--;
    }
    const lastComma = jsonStr.lastIndexOf(",");
    const lastColon = jsonStr.lastIndexOf(":");
    const lastNull = jsonStr.lastIndexOf("null");
    const lastQuote = jsonStr.lastIndexOf('"');
    if (
      lastColon > lastComma &&
      lastColon > lastNull &&
      lastColon > lastQuote
    ) {
      jsonStr = jsonStr.substring(0, lastComma > 0 ? lastComma : lastColon);
    }
    while (braceCount > 0) {
      jsonStr += "}";
      braceCount--;
    }
  }

  jsonStr = jsonStr.replace(/,\s*}/g, "}");

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.type && typeof parsed.name === "string") {
      return {
        type: parsed.type === "detail" ? "detail" : "work",
        name: parsed.name || "",
        price: typeof parsed.price === "number" ? parsed.price : null,
        quantity: typeof parsed.quantity === "number" ? parsed.quantity : null,
        slyusar: parsed.slyusar || null,
        slyusarSum:
          typeof parsed.slyusarSum === "number" ? parsed.slyusarSum : null,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Парсить одне значення через Gemini (число, ПІБ, каталог)
 */
async function parseSingleFieldWithGemini(
  transcript: string,
  column: string,
): Promise<string | number | null> {
  if (["id_count", "price", "slyusar_sum"].includes(column)) {
    const localNum = tryParseNumberLocally(transcript);
    if (localNum !== null) return localNum;
  }

  if (column === "pib_magazin") {
    const localMatch = findSlyusarOrShop(transcript);
    if (localMatch) return localMatch;
  }

  const keys = await loadGeminiKeys();
  if (keys.length === 0) throw new Error("Немає API ключів Gemini.");

  const columnLabel: Record<string, string> = {
    id_count: "КІЛЬКІСТЬ (ціле число)",
    price: "ЦІНА (число в гривнях)",
    slyusar_sum: "ЗАРПЛАТА слюсаря (число)",
    pib_magazin: "ПІБ слюсаря або магазин",
    catalog: "Каталожний номер",
  };

  let contextList = "";
  if (column === "pib_magazin") {
    const names = [
      ...globalCache.slyusars.map((s) => s.Name),
      ...globalCache.shops.map((s) => s.Name),
    ].filter(Boolean);
    contextList = `\nДОСТУПНІ ІМЕНА:\n${names.join(", ")}`;
  }

  const systemPrompt = `Ти парсер голосового введення. Потрібно значення для: ${columnLabel[column] || column}.${contextList}
Відповідай ТІЛЬКИ значенням — без пояснень. Числа словами → цифри. Імена → найближче з доступних.`;

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

        if (["id_count", "price", "slyusar_sum"].includes(column)) {
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
// ЗАПОВНЕННЯ ПОЛІВ / КЛІТИНОК
// ============================================================

/** Записує значення у верхнє поле акту (Пробіг, Причина, тощо) */
function fillField(fieldId: string, value: string): void {
  const el = document.getElementById(fieldId);
  if (!el) return;

  // Для input — value, для contenteditable — textContent/innerText
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // contenteditable span
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** Заповнює повний рядок (Найменування + всі поля) */
function fillFullRow(row: HTMLTableRowElement, parsed: ParsedFullRow): void {
  const match = findBestMatch(parsed.name, parsed.type);
  const finalName = match?.name || parsed.name;
  const isWork = parsed.type === "work";

  const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
  if (nameCell && finalName) {
    nameCell.textContent = finalName;
    nameCell.setAttribute("data-full-name", finalName);
    nameCell.setAttribute("data-type", isWork ? "works" : "details");
  }

  const indexCell = row.querySelector(".row-index");
  if (indexCell) {
    const icon = isWork ? "🛠️" : "⚙️";
    const idx = indexCell.textContent?.match(/\d+/)?.[0] || "1";
    indexCell.innerHTML = `${icon} ${idx}`;
  }

  if (isWork && match?.workId) {
    const catCell = row.querySelector('[data-name="catalog"]') as HTMLElement;
    if (catCell) catCell.textContent = match.workId;
  }
  if (!isWork && match?.scladId) {
    const catCell = row.querySelector('[data-name="catalog"]') as HTMLElement;
    if (catCell) catCell.setAttribute("data-sclad-id", String(match.scladId));
  }

  const qtyCell = row.querySelector('[data-name="id_count"]') as HTMLElement;
  if (qtyCell) qtyCell.textContent = String(parsed.quantity ?? 1);

  const priceCell = row.querySelector('[data-name="price"]') as HTMLElement;
  if (priceCell && parsed.price !== null)
    priceCell.textContent = String(parsed.price);

  const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
  if (sumCell && parsed.price !== null)
    sumCell.textContent = String(parsed.price * (parsed.quantity ?? 1));

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

  if (parsed.slyusarSum !== null) {
    const sCell = row.querySelector('[data-name="slyusar_sum"]') as HTMLElement;
    if (sCell) sCell.textContent = String(parsed.slyusarSum);
  }

  if (parsed.price === null && finalName) {
    handleItemSelection(row, finalName, parsed.type).catch(() => {});
  }

  updateCalculatedSumsInFooter();
}

/** Заповнює одну клітинку рядка */
function fillSingleCell(
  row: HTMLTableRowElement,
  column: string,
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
  btn.classList.remove("ai-chat-voice-btn--listening");

  switch (state) {
    case "idle":
      btn.innerHTML = "🎙️";
      btn.title = "Голосове введення";
      break;
    case "listening":
      btn.classList.add("ai-chat-voice-btn--listening");
      btn.innerHTML = `<span class="ai-voice-pulse">🔴</span>`;
      btn.title = "Слухаю... Натисніть для зупинки";
      break;
    case "processing":
      btn.innerHTML = `<span class="ai-voice-pulse">⚙️</span>`;
      btn.title = "Обробка...";
      break;
  }
}

// ============================================================
// ГОЛОВНИЙ ОБРОБНИК
// ============================================================

export async function handleVoiceButtonClick(btn: HTMLElement): Promise<void> {
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

  try {
    updateMicButton(btn, "listening");
    showNotification(
      `�️ Говоріть команду, наприклад:\n• "пробіг 150000"\n• "причина звернення ТО"\n• "рядок 1 найменування заміна масла"\n• "2 ціна тисяча"\n• "додати рядок фільтр масляний"`,
      "info",
      5000,
    );

    const transcript = await startListening();

    if (!transcript?.trim()) {
      showNotification("�️ Мову не розпізнано. Спробуйте ще.", "warning", 2500);
      updateMicButton(btn, "idle");
      return;
    }

    updateMicButton(btn, "processing");

    // Парсимо ключову фразу
    const command = parseVoiceCommand(transcript);

    if (!command) {
      showNotification(
        `❌ Не розпізнано команду: "${transcript}"\n\nВикористовуйте формат:\n• пробіг [число]\n• причина звернення [текст]\n• рядок [N] найменування [назва]\n• [N] ціна [число]`,
        "warning",
        5000,
      );
      updateMicButton(btn, "idle");
      return;
    }

    const { target, value } = command;

    // === ПОЛЕ АКТУ (Пробіг, Причина, тощо) ===
    if (target.kind === "field") {
      let finalValue = value;

      // Для числових полів парсимо число
      if (
        target.fieldId === "editable-probig" ||
        target.fieldId === "editable-avans" ||
        target.fieldId === "editable-discount"
      ) {
        const num = tryParseNumberLocally(value);
        if (num !== null) finalValue = String(num);
      }

      if (!finalValue) {
        showNotification(
          `⚠️ Скажіть значення для поля "${target.label}". Наприклад: "${target.label.toLowerCase()} 150000"`,
          "warning",
          3000,
        );
        updateMicButton(btn, "idle");
        return;
      }

      fillField(target.fieldId, finalValue);
      showNotification(`✅ ${target.label}: ${finalValue}`, "success", 3000);
      updateMicButton(btn, "idle");
      return;
    }

    // === КЛІТИНКА ТАБЛИЦІ ===
    if (target.kind === "cell") {
      let row: HTMLTableRowElement | null = null;

      // "додати рядок" — rowIndex = -1
      if (target.rowIndex === -1) {
        addNewRow(ACT_ITEMS_TABLE_CONTAINER_ID);
        const newCount = getRowCount();
        row = getTableRow(newCount);
        if (!row) {
          showNotification("❌ Не вдалося додати рядок", "error", 3000);
          updateMicButton(btn, "idle");
          return;
        }
        showNotification(`➕ Додано рядок ${newCount}`, "info", 2000);
      } else {
        row = getTableRow(target.rowIndex);
        if (!row) {
          const totalRows = getRowCount();
          showNotification(
            `❌ Рядок ${target.rowIndex} не існує. Є ${totalRows} рядків.`,
            "error",
            3000,
          );
          updateMicButton(btn, "idle");
          return;
        }
      }

      // --- Найменування — повний парсинг через Gemini ---
      if (target.column === "name") {
        if (!value) {
          showNotification(`⚠️ Скажіть назву роботи/деталі`, "warning", 3000);
          updateMicButton(btn, "idle");
          return;
        }

        showNotification(`🔄 Аналізую: "${value}"`, "info", 2000);

        const localMatch =
          findBestMatch(value, "work") || findBestMatch(value, "detail");
        let parsed = await parseFullRowWithGemini(value);

        // Фолбек якщо Gemini повернув пусте
        if (
          parsed &&
          (!parsed.name ||
            parsed.name.includes("...") ||
            parsed.name.length < 3)
        ) {
          if (localMatch) {
            parsed.name = localMatch.name;
            parsed.type = localMatch.workId ? "work" : "detail";
          }
        }

        if (!parsed && localMatch) {
          parsed = {
            type: localMatch.workId ? "work" : "detail",
            name: localMatch.name,
            price: null,
            quantity: 1,
            slyusar: null,
            slyusarSum: null,
          };
        }

        // Останній фолбек — записати транскрипт як є
        if (!parsed) {
          parsed = {
            type: "work",
            name: value,
            price: null,
            quantity: 1,
            slyusar: null,
            slyusarSum: null,
          };
        }

        fillFullRow(row, parsed);
        const match = findBestMatch(parsed.name, parsed.type);
        const finalName = match?.name || parsed.name;
        const icon = parsed.type === "work" ? "🛠️" : "⚙️";

        const rowIdx = target.rowIndex === -1 ? getRowCount() : target.rowIndex;
        showNotification(
          `✅ Рядок ${rowIdx}: ${icon} ${finalName}`,
          "success",
          3000,
        );
      } else {
        // --- Інша колонка (ціна, кількість, ПІБ, каталог, зарплата) ---
        if (!value) {
          showNotification(
            `⚠️ Скажіть значення для "${target.label}"`,
            "warning",
            3000,
          );
          updateMicButton(btn, "idle");
          return;
        }

        let finalValue: string | number | null = null;

        // Спочатку локально
        if (["id_count", "price", "slyusar_sum"].includes(target.column)) {
          finalValue = tryParseNumberLocally(value);
        }
        if (target.column === "pib_magazin") {
          finalValue = findSlyusarOrShop(value);
        }

        // Якщо не вдалось — через Gemini
        if (finalValue === null) {
          finalValue = await parseSingleFieldWithGemini(value, target.column);
        }

        // Фолбек — записати як є
        if (finalValue === null) {
          finalValue = value;
        }

        fillSingleCell(row, target.column, finalValue);
        const rowIdx = target.rowIndex === -1 ? getRowCount() : target.rowIndex;
        showNotification(
          `✅ Рядок ${rowIdx}, ${target.label}: ${finalValue}`,
          "success",
          3000,
        );
      }
    }
  } catch (err: any) {
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
  btn.className = "ai-chat-voice-btn";
  btn.type = "button";
  btn.innerHTML = "🎙️";
  btn.title = "Голосове введення";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleVoiceButtonClick(btn);
  });

  return btn;
}

/**
 * Ініціалізує голосове введення — кнопка �️
 * Без трекінгу фокусу, команди визначаються ключовими словами
 * Видимість кнопки визначається налаштуванням voiceInputEnabled
 */
export function initVoiceInput(): void {
  if (globalCache.isActClosed) return;

  if (!isSpeechRecognitionSupported()) return;

  const container = document.querySelector(".zakaz_narayd-buttons-container");
  if (!container) return;
  if (document.getElementById("voice-input-button")) return;

  const voiceBtn = createVoiceButton();

  // 🎙️ Перевіряємо налаштування видимості
  if (!globalCache.generalSettings.voiceInputEnabled) {
    voiceBtn.style.display = "none";
  }

  const saveBtn = document.getElementById("save-act-data");
  if (saveBtn) {
    container.insertBefore(voiceBtn, saveBtn);
  } else {
    container.appendChild(voiceBtn);
  }
}

// ============================================================
// 🎙️ ШВИДКЕ ГОЛОСОВЕ ВВЕДЕННЯ ДЛЯ ЧАТУ
// ============================================================

/**
 * Швидке розпізнавання голосу для AI чату.
 * Повертає розпізнаний текст — без парсингу команд.
 * interimResults = true для швидкого відгуку.
 */
export function startChatVoiceInput(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reject(new Error("Браузер не підтримує розпізнавання мови"));
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "uk-UA";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    // Таймаут — якщо за 7с нічого немає, зупиняємо
    const timeout = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      reject(new Error("Час очікування вичерпано"));
    }, 7000);

    rec.onresult = (event: any) => {
      clearTimeout(timeout);
      const transcript = event.results[0][0].transcript;
      resolve(transcript || "");
    };

    rec.onerror = (event: any) => {
      clearTimeout(timeout);
      if (event.error === "no-speech") reject(new Error("Мову не виявлено"));
      else if (event.error === "audio-capture")
        reject(new Error("Мікрофон не знайдено"));
      else if (event.error === "not-allowed")
        reject(new Error("Доступ до мікрофона заборонено"));
      else reject(new Error(event.error));
    };

    rec.onend = () => {
      clearTimeout(timeout);
    };

    rec.start();
  });
}

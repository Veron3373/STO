// src/ts/roboha/dodatu_inchi_bazu/inhi/voiceInputExcel.ts
// 🎙️ Голосове введення для модального вікна Excel (batchImportSclad)
// Команди: заповнення полів, фільтрація/сортування, додавання рядків

import { showNotification } from "../../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

// ============================================================
// ТИПИ ТА СТАН
// ============================================================

type VoiceExcelState = "idle" | "listening";

let voiceState: VoiceExcelState = "idle";
let recognition: any = null;

// Зовнішні колбеки — встановлюються з batchImportSclad
let onAddRow: (() => number) | null = null; // повертає індекс нового рядка
let onSortColumn: ((col: string) => void) | null = null;
let getParsedData: (() => any[]) | null = null;

// ============================================================
// МАППІНГ КОЛОНОК — ключові слова → data-field / data-col
// ============================================================

const COLUMN_KEYWORDS: { keywords: string[]; field: string; label: string }[] =
  [
    { keywords: ["дата", "дату"], field: "date", label: "Дата" },
    { keywords: ["магазин", "магазину"], field: "shop", label: "Магазин" },
    {
      keywords: ["каталог", "каталог номер", "каталожний", "артикул"],
      field: "catno",
      label: "Каталог номер",
    },
    {
      keywords: ["деталь", "деталі", "запчастина", "запчастину"],
      field: "detail",
      label: "Деталь",
    },
    {
      keywords: ["кількість", "к-ть", "штук", "штуки", "кількості"],
      field: "qty",
      label: "К-ть",
    },
    { keywords: ["ціна", "ціну", "вартість"], field: "price", label: "Ціна" },
    {
      keywords: ["клієнта", "ціна клієнта", "клієнту"],
      field: "clientPrice",
      label: "Клієнта",
    },
    { keywords: ["склад", "складу"], field: "warehouse", label: "Склад" },
    {
      keywords: ["рахунок номер", "рахунок", "рах номер", "рах", "рахунку"],
      field: "invoice",
      label: "Рах. №",
    },
    {
      keywords: ["акт номер", "акт", "акту"],
      field: "actNo",
      label: "Акт №",
    },
    {
      keywords: ["одиниця", "одиниці", "о-ця"],
      field: "unit",
      label: "О-ця",
    },
    {
      keywords: ["статус", "замовити", "замовлено", "прибула"],
      field: "orderStatus",
      label: "Статус",
    },
    {
      keywords: ["примітка", "примітку", "нотатка"],
      field: "notes",
      label: "Примітка",
    },
    {
      keywords: ["дія", "записати", "видалити"],
      field: "action",
      label: "Дія",
    },
  ];

// Значення для випадаючих списків
const STATUS_VALUES: Record<string, string> = {
  замовити: "Замовити",
  замовлено: "Замовлено",
  прибула: "Прибула",
};

const ACTION_VALUES: Record<string, string> = {
  записати: "Записати",
  видалити: "Видалити",
};

// ============================================================
// ІНІЦІАЛІЗАЦІЯ
// ============================================================

/**
 * Ініціалізація голосового введення для Excel-модалки
 * @param callbacks - зовнішні колбеки для взаємодії з batchImportSclad
 */
export function initVoiceInputExcel(callbacks: {
  addRow: () => number; // повертає індекс нового рядка
  sortColumn: (col: string) => void;
  getParsedData: () => any[];
  renderTable: (data: any[]) => void;
}): void {
  onAddRow = callbacks.addRow;
  onSortColumn = callbacks.sortColumn;
  getParsedData = callbacks.getParsedData;

  const btn = document.getElementById(
    "voice-input-btn-Excel",
  ) as HTMLButtonElement | null;
  if (!btn) return;

  btn.onclick = () => {
    if (voiceState === "listening") {
      stopVoiceExcel();
    } else {
      startVoiceExcel();
    }
  };
}

// ============================================================
// WEB SPEECH API
// ============================================================

function isSpeechSupported(): boolean {
  return !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

function startVoiceExcel(): void {
  if (!isSpeechSupported()) {
    showNotification("Браузер не підтримує розпізнавання мови", "error");
    return;
  }

  const btn = document.getElementById(
    "voice-input-btn-Excel",
  ) as HTMLButtonElement;
  if (!btn) return;

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  recognition = new SpeechRecognition();
  recognition.lang = "uk-UA";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let fullTranscript = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  // Кодові слова для зупинки
  const STOP_PHRASES = [
    "це все",
    "це всі",
    "усе",
    "все",
    "готово",
    "стоп",
    "кінець",
  ];

  voiceState = "listening";
  btn.classList.add("ai-chat-voice-btn--listening");
  btn.innerHTML = `<span class="ai-voice-pulse">🔴</span>`;
  showNotification("🎙️ Слухаю команду...", "info", 2000);

  function finishAndProcess() {
    if (silenceTimer) clearTimeout(silenceTimer);
    clearTimeout(maxTimeout);
    try {
      recognition?.stop();
    } catch {
      /* ignore */
    }

    let result = fullTranscript.trim();
    const lower = result.toLowerCase();
    for (const phrase of STOP_PHRASES) {
      if (lower.endsWith(phrase)) {
        result = result
          .slice(0, -phrase.length)
          .trim()
          .replace(/[,.\s]+$/, "");
        break;
      }
    }

    voiceState = "idle";
    btn.classList.remove("ai-chat-voice-btn--listening");
    btn.innerHTML = "🎙️";
    recognition = null;

    if (result.trim()) {
      processVoiceCommand(result.trim());
    } else {
      showNotification("Мову не виявлено. Спробуйте ще раз.", "error", 2000);
    }
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => finishAndProcess(), 2500);
  }

  // Максимум 30 секунд
  const maxTimeout = setTimeout(() => finishAndProcess(), 30000);

  recognition.onresult = (event: any) => {
    let final = "";
    let interim = "";

    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    fullTranscript = final;
    const currentText = (final + interim).toLowerCase().trim();

    for (const phrase of STOP_PHRASES) {
      if (
        currentText.endsWith(phrase) ||
        currentText.endsWith(phrase + ".") ||
        currentText.endsWith(phrase + ",")
      ) {
        setTimeout(() => finishAndProcess(), 300);
        return;
      }
    }

    resetSilenceTimer();
  };

  recognition.onerror = (event: any) => {
    voiceState = "idle";
    btn.classList.remove("ai-chat-voice-btn--listening");
    btn.innerHTML = "🎙️";

    if (fullTranscript.trim()) {
      finishAndProcess();
      return;
    }

    if (event.error === "no-speech") {
      showNotification("Мову не виявлено. Спробуйте ще раз.", "error", 2000);
    } else if (event.error === "audio-capture") {
      showNotification("Мікрофон не знайдено.", "error", 2000);
    } else if (event.error === "not-allowed") {
      showNotification("Доступ до мікрофона заборонений.", "error", 2000);
    } else {
      showNotification(`Помилка: ${event.error}`, "error", 2000);
    }
    recognition = null;
  };

  recognition.onend = () => {
    if (voiceState === "listening") {
      if (fullTranscript.trim()) {
        finishAndProcess();
      } else {
        voiceState = "idle";
        btn.classList.remove("ai-chat-voice-btn--listening");
        btn.innerHTML = "🎙️";
        recognition = null;
      }
    }
  };

  // Початковий таймер тиші — 7с
  silenceTimer = setTimeout(() => {
    if (!fullTranscript.trim()) {
      voiceState = "idle";
      btn.classList.remove("ai-chat-voice-btn--listening");
      btn.innerHTML = "🎙️";
      clearTimeout(maxTimeout);
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
      recognition = null;
      showNotification("Мову не виявлено. Спробуйте ще раз.", "error", 2000);
    }
  }, 7000);

  recognition.start();
}

function stopVoiceExcel(): void {
  const btn = document.getElementById(
    "voice-input-btn-Excel",
  ) as HTMLButtonElement | null;
  if (btn) {
    btn.classList.remove("ai-chat-voice-btn--listening");
    btn.innerHTML = "🎙️";
  }
  voiceState = "idle";
  try {
    recognition?.stop();
  } catch {
    /* ignore */
  }
  recognition = null;
}

// ============================================================
// ОБРОБКА ГОЛОСОВОЇ КОМАНДИ
// ============================================================

function processVoiceCommand(transcript: string): void {
  const text = transcript.toLowerCase().trim();

  // 1. Команда «Додати рядок» (можливо з даними після)
  const addRowResult = matchAddRow(text);
  if (addRowResult.matched) {
    if (onAddRow) {
      const newRowIndex = onAddRow();
      showNotification(`➕ Додано рядок №${newRowIndex + 1}`, "success", 1500);

      // Якщо є дані після "додати рядок" — заповнюємо новий рядок
      if (addRowResult.rest) {
        const restText = addRowResult.rest;
        const restOriginal = transcript.substring(
          transcript.toLowerCase().indexOf(restText.toLowerCase()),
        );

        // Спроба розпарсити декілька полів з решти тексту
        const fieldsApplied = applyMultipleFields(
          newRowIndex,
          restText,
          restOriginal,
        );
        if (!fieldsApplied) {
          // Спроба як одне поле
          const parsed = parseColumnAndValue(
            restText,
            transcript,
            restOriginal,
          );
          if (parsed) {
            applyFieldValue(newRowIndex, parsed.field, parsed.value);
          }
        }
      }
    }
    return;
  }

  // 2. Команда «Фільтр / Відфільтрувати [колонка]»
  const filterResult = matchFilter(text);
  if (filterResult) {
    if (onSortColumn) {
      onSortColumn(filterResult);
      showNotification(
        `🔽 Фільтр по: ${getColumnLabel(filterResult)}`,
        "info",
        1500,
      );
    }
    return;
  }

  // 3. Заповнення поля — «[рядок N / № N] [колонка] [значення]»
  const fieldResult = matchFieldCommand(text, transcript);
  if (fieldResult) {
    applyFieldValue(fieldResult.rowIndex, fieldResult.field, fieldResult.value);
    return;
  }

  // 4. Якщо тільки значення статусу або дії для останнього рядка
  const directStatus = matchDirectStatusOrAction(text);
  if (directStatus) {
    const data = getParsedData ? getParsedData() : [];
    const lastIdx = data.length > 0 ? data.length - 1 : 0;
    applyFieldValue(lastIdx, directStatus.field, directStatus.value);
    return;
  }

  showNotification(`🎙️ Не розпізнано: "${transcript}"`, "error", 3000);
}

// ============================================================
// ПАРСИНГ КОМАНД
// ============================================================

/** Перевірка: команда "додати рядок" (з можливими даними після) */
function matchAddRow(text: string): { matched: boolean; rest: string } {
  const patterns = [
    /^(?:додати\s+рядок|новий\s+рядок|додай\s+рядок|додай\s+строку|новий\s+запис)\s*(.*)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      return { matched: true, rest: (match[1] || "").trim() };
    }
  }
  return { matched: false, rest: "" };
}

/**
 * Спроба застосувати декілька полів з тексту.
 * Наприклад: "додати рядок деталь фільтр масла ціна 500 кількість 2"
 */
function applyMultipleFields(
  rowIndex: number,
  text: string,
  _originalText: string,
): boolean {
  // Шукаємо всі ключові слова колонок у тексті та їхні позиції
  const normalized = text.toLowerCase();
  const positions: { pos: number; field: string; kwLen: number }[] = [];

  const sorted = [...COLUMN_KEYWORDS].sort(
    (a, b) =>
      Math.max(...b.keywords.map((k) => k.length)) -
      Math.max(...a.keywords.map((k) => k.length)),
  );

  for (const col of sorted) {
    for (const kw of col.keywords) {
      let searchFrom = 0;
      while (searchFrom < normalized.length) {
        const idx = normalized.indexOf(kw, searchFrom);
        if (idx === -1) break;
        // Перевіряємо що це початок слова
        if (idx > 0 && /\p{L}/u.test(normalized[idx - 1])) {
          searchFrom = idx + 1;
          continue;
        }
        // Перевіряємо що ця позиція не зайнята довшим ключовим словом
        const alreadyCovered = positions.some(
          (p) => idx >= p.pos && idx < p.pos + p.kwLen,
        );
        if (!alreadyCovered) {
          positions.push({ pos: idx, field: col.field, kwLen: kw.length });
        }
        break;
      }
    }
  }

  if (positions.length === 0) return false;

  // Сортуємо за позицією
  positions.sort((a, b) => a.pos - b.pos);

  // Витягуємо значення між ключовими словами
  let applied = 0;
  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const valueStart = current.pos + current.kwLen;
    const valueEnd =
      i + 1 < positions.length ? positions[i + 1].pos : text.length;
    let value = text.substring(valueStart, valueEnd).trim();

    if (!value) continue;

    // Спеціальна обробка для різних типів полів
    const field = current.field;

    if (field === "orderStatus") {
      const mapped = mapStatusValue(
        text.substring(current.pos, current.pos + current.kwLen),
        value,
      );
      if (mapped) {
        applyFieldValue(rowIndex, field, mapped);
        applied++;
      }
      continue;
    }

    if (field === "action") {
      const mapped = mapActionValue(
        text.substring(current.pos, current.pos + current.kwLen),
        value,
      );
      if (mapped) {
        applyFieldValue(rowIndex, field, mapped);
        applied++;
      }
      continue;
    }

    if (["qty", "price", "clientPrice"].includes(field)) {
      value = convertWordsToNumber(value);
    }

    if (field === "catno") {
      value = value.replace(/\s+/g, "").toUpperCase();
    }

    applyFieldValue(rowIndex, field, value);
    applied++;
  }

  return applied > 0;
}

/** Перевірка: команда "фільтр / відфільтрувати [колонка]" */
function matchFilter(text: string): string | null {
  const filterPatterns = [
    /(?:фільтр|відфільтрувати|фільтрувати|сортувати|сортування|відсортувати|відсортуй|фільтруй)\s+(?:по\s+)?(.+)/i,
    /(?:фільтр|відфільтрувати|фільтрувати|сортувати|сортування)\s+(.+)/i,
  ];

  for (const pattern of filterPatterns) {
    const match = text.match(pattern);
    if (match) {
      const colText = match[1].trim();
      const col = findColumnByKeyword(colText);
      if (col) return col;
    }
  }

  return null;
}

/** Знаходження колонки за ключовим словом */
function findColumnByKeyword(text: string): string | null {
  const normalized = text.toLowerCase().trim();
  // Довші ключові слова першими
  const sorted = [...COLUMN_KEYWORDS].sort(
    (a, b) =>
      Math.max(...b.keywords.map((k) => k.length)) -
      Math.max(...a.keywords.map((k) => k.length)),
  );
  for (const col of sorted) {
    for (const kw of col.keywords) {
      if (normalized.includes(kw)) {
        return col.field;
      }
    }
  }
  return null;
}

/** Отримати мітку колонки */
function getColumnLabel(field: string): string {
  const found = COLUMN_KEYWORDS.find((c) => c.field === field);
  return found ? found.label : field;
}

/** Парсинг команди поля: «[рядок N] [колонка] [значення]» */
function matchFieldCommand(
  text: string,
  originalTranscript: string,
): { rowIndex: number; field: string; value: string } | null {
  // Патерни:
  // "рядок 2 деталь фільтр масла"
  // "3 ціна 500"
  // "дата 25.02.2026"
  // "магазин Автозапчастини"
  // "статус замовлено"

  const data = getParsedData ? getParsedData() : [];
  const lastRowIndex = data.length > 0 ? data.length - 1 : 0;

  // Спочатку з номером рядка
  const rowPatterns = [
    /^(?:рядок|строка|ряд|номер|№)\s+(\d+)\s+(.+)$/i,
    /^(\d+)\s+(.+)$/i,
  ];

  for (const pattern of rowPatterns) {
    const match = text.match(pattern);
    if (match) {
      const rowNum = parseInt(match[1], 10);
      const rest = match[2].trim();
      const rowIndex = rowNum - 1; // 0-based

      if (rowIndex < 0 || rowIndex >= data.length) {
        showNotification(
          `Рядок ${rowNum} не існує (всього ${data.length})`,
          "error",
          2000,
        );
        return null;
      }

      const parsed = parseColumnAndValue(rest, originalTranscript, match[2]);
      if (parsed) {
        return { rowIndex, field: parsed.field, value: parsed.value };
      }
    }
  }

  // Без номера рядка — останній рядок
  const parsed = parseColumnAndValue(
    text,
    originalTranscript,
    originalTranscript,
  );
  if (parsed) {
    return { rowIndex: lastRowIndex, field: parsed.field, value: parsed.value };
  }

  return null;
}

/** Парсинг «колонка значення» з тексту */
function parseColumnAndValue(
  text: string,
  _fullOriginal: string,
  restOriginal: string,
): { field: string; value: string } | null {
  const normalized = text.toLowerCase().trim();

  // Довші ключові слова першими
  const sorted = [...COLUMN_KEYWORDS].sort(
    (a, b) =>
      Math.max(...b.keywords.map((k) => k.length)) -
      Math.max(...a.keywords.map((k) => k.length)),
  );

  for (const col of sorted) {
    for (const kw of col.keywords) {
      if (normalized.startsWith(kw)) {
        let value = text.substring(kw.length).trim();

        // Для статусу — маппінг на конкретні значення
        if (col.field === "orderStatus") {
          const mapped = mapStatusValue(kw, value);
          if (mapped) return { field: col.field, value: mapped };
          continue;
        }

        // Для дії — маппінг на конкретні значення
        if (col.field === "action") {
          const mapped = mapActionValue(kw, value);
          if (mapped) return { field: col.field, value: mapped };
          continue;
        }

        // Для числових полів — конвертація словесних чисел
        if (["qty", "price", "clientPrice"].includes(col.field)) {
          value = convertWordsToNumber(value);
        }

        // Для каталог номеру — зберігаємо оригінальний регістр (є англ. літери)
        if (col.field === "catno") {
          // Спроба знайти оригінальне value у повному тексті
          const origIdx = restOriginal.toLowerCase().indexOf(kw);
          if (origIdx >= 0) {
            value = restOriginal.substring(origIdx + kw.length).trim();
          }
          // Прибираємо пробіли, які SpeechRecognition додає між літерами
          value = value.replace(/\s+/g, "").toUpperCase();
        }

        if (value) {
          return { field: col.field, value };
        }
      }
    }
  }

  return null;
}

/** Маппінг статусу */
function mapStatusValue(keyword: string, extraValue: string): string | null {
  const combined = (keyword + " " + extraValue).toLowerCase().trim();
  for (const [key, val] of Object.entries(STATUS_VALUES)) {
    if (combined.includes(key)) return val;
  }
  // Якщо ключове слово само є статусом
  if (STATUS_VALUES[keyword.toLowerCase()]) {
    return STATUS_VALUES[keyword.toLowerCase()];
  }
  return null;
}

/** Маппінг дії */
function mapActionValue(keyword: string, extraValue: string): string | null {
  const combined = (keyword + " " + extraValue).toLowerCase().trim();
  for (const [key, val] of Object.entries(ACTION_VALUES)) {
    if (combined.includes(key)) return val;
  }
  if (ACTION_VALUES[keyword.toLowerCase()]) {
    return ACTION_VALUES[keyword.toLowerCase()];
  }
  return null;
}

/** Пряме розпізнавання статусу або дії */
function matchDirectStatusOrAction(
  text: string,
): { field: string; value: string } | null {
  const normalized = text.toLowerCase().trim();

  // Статус
  for (const [key, val] of Object.entries(STATUS_VALUES)) {
    if (normalized === key || normalized.startsWith(key)) {
      return { field: "orderStatus", value: val };
    }
  }

  // Дія
  for (const [key, val] of Object.entries(ACTION_VALUES)) {
    if (normalized === key || normalized.startsWith(key)) {
      return { field: "action", value: val };
    }
  }

  return null;
}

// ============================================================
// ЗАСТОСУВАННЯ ЗНАЧЕННЯ ДО КОМІРКИ
// ============================================================

function applyFieldValue(rowIndex: number, field: string, value: string): void {
  const tbody = document.querySelector("#batch-table-Excel tbody");
  if (!tbody) {
    showNotification("Таблиця не знайдена", "error", 2000);
    return;
  }

  const tr = tbody.querySelectorAll("tr")[rowIndex];
  if (!tr) {
    showNotification(`Рядок ${rowIndex + 1} не знайдено`, "error", 2000);
    return;
  }

  // Шукаємо input по data-field
  const input = tr.querySelector(`[data-field="${field}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;

  if (!input) {
    showNotification(
      `Поле "${getColumnLabel(field)}" не знайдено`,
      "error",
      2000,
    );
    return;
  }

  // Для статусу й дії — клікаємо для зміни через вбудований механізм
  if (field === "orderStatus" || field === "action") {
    // Встановлюємо значення безпосередньо
    input.value = value;
    // Оновлюємо дані в масиві
    const data = getParsedData ? getParsedData() : [];
    if (data[rowIndex]) {
      data[rowIndex][field] = value;
    }

    // Оновлюємо стилі для статусу
    if (field === "orderStatus") {
      const td = input.closest("td");
      if (td) {
        td.style.backgroundColor = getOrderStatusBg(value);
        input.style.color = getOrderStatusColor(value);
      }
    }

    // Оновлюємо стилі для дії
    if (field === "action") {
      input.style.color = value === "Видалити" ? "#ef4444" : "#2D7244";
    }

    // Тригеримо подію для ревалідації
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    showNotification(
      `✅ Рядок ${rowIndex + 1}: ${getColumnLabel(field)} → ${value}`,
      "success",
      1500,
    );
    return;
  }

  // Для дати
  if (field === "date") {
    // Спроба конвертувати в ISO формат
    const isoDate = parseDateInput(value);
    input.value = isoDate || value;
  } else {
    input.value = value;
  }

  // Оновлюємо дані в масиві
  const data = getParsedData ? getParsedData() : [];
  if (data[rowIndex]) {
    if (["qty", "price", "clientPrice"].includes(field)) {
      data[rowIndex][field] = parseFloat(value) || 0;
    } else {
      data[rowIndex][field] = input.value;
    }
  }

  // Тригеримо подію input для ревалідації
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  showNotification(
    `✅ Рядок ${rowIndex + 1}: ${getColumnLabel(field)} → ${value}`,
    "success",
    1500,
  );
}

// ============================================================
// ДОПОМІЖНІ ФУНКЦІЇ
// ============================================================

/** Конвертація словесних чисел в цифри */
function convertWordsToNumber(text: string): string {
  const trimmed = text.trim().toLowerCase();

  // Якщо вже число — повертаємо
  if (/^\d+([.,]\d+)?$/.test(trimmed)) {
    return trimmed.replace(",", ".");
  }

  const units: Record<string, number> = {
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
    пятнадцять: 15,
    шістнадцять: 16,
    сімнадцять: 17,
    вісімнадцять: 18,
    "дев'ятнадцять": 19,
    девятнадцять: 19,
    двадцять: 20,
    тридцять: 30,
    сорок: 40,
    "п'ятдесят": 50,
    пятдесят: 50,
    шістдесят: 60,
    сімдесят: 70,
    вісімдесят: 80,
    "дев'яносто": 90,
    девяносто: 90,
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
  };

  const multipliers: Record<string, number> = {
    тисяча: 1000,
    тисячі: 1000,
    тисяч: 1000,
  };

  // Простий парсинг
  if (units[trimmed] !== undefined) return String(units[trimmed]);
  if (multipliers[trimmed] !== undefined) return String(multipliers[trimmed]);

  // Спроба скласти числа: "двісті п'ятдесят" → 250
  const words = trimmed.split(/\s+/);
  let result = 0;
  let currentGroup = 0;
  let hasNumber = false;

  for (const word of words) {
    if (units[word] !== undefined) {
      currentGroup += units[word];
      hasNumber = true;
    } else if (multipliers[word] !== undefined) {
      if (currentGroup === 0) currentGroup = 1;
      result += currentGroup * multipliers[word];
      currentGroup = 0;
      hasNumber = true;
    }
  }

  result += currentGroup;

  if (hasNumber && result > 0) return String(result);

  // Якщо не розпізнано — повертаємо як є
  return text.trim();
}

/** Парсинг дати з голосу */
function parseDateInput(text: string): string | null {
  const trimmed = text.trim();

  // Вже ISO формат: 2026-02-25
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // dd.mm.yyyy або dd.mm.yy
  const dotMatch = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (dotMatch) {
    const day = dotMatch[1].padStart(2, "0");
    const month = dotMatch[2].padStart(2, "0");
    let year = dotMatch[3];
    if (year.length === 2) year = "20" + year;
    return `${year}-${month}-${day}`;
  }

  // Словесний формат: "двадцять п'яте лютого" — занадто складно, залишаємо як є
  return null;
}

/** Колір фону статусу замовлення */
function getOrderStatusBg(status: string): string {
  switch (status) {
    case "Замовити":
      return "rgba(248, 113, 113, 0.15)";
    case "Замовлено":
      return "rgba(59, 130, 246, 0.15)";
    case "Прибула":
      return "rgba(45, 114, 68, 0.15)";
    default:
      return "";
  }
}

/** Колір тексту статусу */
function getOrderStatusColor(status: string): string {
  switch (status) {
    case "Замовити":
      return "#f87171";
    case "Замовлено":
      return "#3b82f6";
    case "Прибула":
      return "#2D7244";
    default:
      return "inherit";
  }
}

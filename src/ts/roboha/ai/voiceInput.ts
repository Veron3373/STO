// src/ts/roboha/ai/voiceInput.ts
// 🎤 Голосове введення в наряд — Web Speech API + Gemini парсинг

import { supabase } from "../../vxid/supabaseClient";
import {
  globalCache,
  ACT_ITEMS_TABLE_CONTAINER_ID,
} from "../zakaz_naraudy/globalCache";
import {
  addNewRow,
  updateCalculatedSumsInFooter,
} from "../zakaz_naraudy/modalUI";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { handleItemSelection } from "./aiPriceHelper";

// ============================================================
// ТИПИ
// ============================================================

/** Результат парсингу одного рядка роботи/деталі */
interface ParsedVoiceItem {
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
let recognition: any = null; // SpeechRecognition instance
let geminiApiKeys: string[] = [];
let currentKeyIndex = 0;
let keysLoaded = false;

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧІВ GEMINI (спільна з aiChat.ts логіка)
// ============================================================

async function loadGeminiKeys(): Promise<string[]> {
  if (keysLoaded && geminiApiKeys.length > 0) return geminiApiKeys;

  const keys: string[] = [];
  let activeIndex = 0;

  try {
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey) {
      keys.push(envKey);
    }

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
// WEB SPEECH API — РОЗПІЗНАВАННЯ МОВИ
// ============================================================

/** Перевіряє підтримку Web Speech API у браузері */
export function isSpeechRecognitionSupported(): boolean {
  return !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

/** Запускає розпізнавання мови та повертає текст */
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
    recognition.lang = "uk-UA"; // Українська мова
    recognition.continuous = false; // Одна фраза
    recognition.interimResults = false; // Тільки фінальний результат
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
          new Error(
            "Доступ до мікрофона заборонений. Дозвольте у налаштуваннях браузера.",
          ),
        );
      } else {
        reject(new Error(`Помилка: ${event.error}`));
      }
    };

    recognition.onend = () => {
      // Якщо не було результату — таймаут
      recognition = null;
    };

    recognition.start();
  });
}

/** Зупиняє розпізнавання, якщо воно активне */
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
// GEMINI ПАРСИНГ — РОЗБІР РОЗПІЗНАНОГО ТЕКСТУ
// ============================================================

/**
 * Відправляє розпізнаний текст у Gemini для парсингу.
 * Gemini отримує список доступних робіт/деталей/слюсарів і парсить фразу.
 */
async function parseVoiceWithGemini(
  transcript: string,
): Promise<ParsedVoiceItem[]> {
  const keys = await loadGeminiKeys();
  if (keys.length === 0) {
    throw new Error("Немає API ключів Gemini. Додайте ключі в налаштуваннях.");
  }

  // Збираємо списки з глобального кешу
  const workNames = globalCache.works.slice(0, 200); // Обмежуємо для промпту
  const detailNames = globalCache.details.slice(0, 200);
  const slyusarNames = globalCache.slyusars.map((s) => s.Name).filter(Boolean);

  const systemPrompt = `Ти — парсер голосових команд для автомобільного СТО.
Користувач (механік) говорить фразу про роботу/деталь яку потрібно додати в акт.

ТВОЄ ЗАВДАННЯ: розібрати фразу і витягнути структуровані дані.

ДОСТУПНІ РОБОТИ (назви з бази):
${workNames.join("\n")}

ДОСТУПНІ ДЕТАЛІ (назви з бази):
${detailNames.join("\n")}

ДОСТУПНІ СЛЮСАРІ:
${slyusarNames.join(", ")}

ПРАВИЛА ПАРСИНГУ:
1. Визнач тип: "work" (робота/послуга) або "detail" (деталь/запчастина).
2. Знайди найбільш відповідну назву з ДОСТУПНИХ СПИСКІВ. Якщо точного збігу нема — вибери найближчу.
3. Якщо користувач каже число (словами чи цифрами) після "ціна", "по", "за", "коштує", "за ціною" — це ціна.
4. Якщо каже "кількість", "штук", "два", "три" тощо — це кількість.
5. Якщо каже ім'я/прізвище — шукай серед СЛЮСАРІВ.
6. Якщо каже "зарплата", "зп" + число — це зарплата слюсаря.
7. Одна фраза може містити КІЛЬКА робіт/деталей, розділених "та", "і", "ще", "також", "плюс".
8. Числа можуть бути словами: "тисяча двісті" = 1200, "п'ятсот" = 500, "дві тисячі" = 2000.

ФОРМАТ ВІДПОВІДІ — ТІЛЬКИ JSON масив (без markdown, без коментарів):
[
  {
    "type": "work" або "detail",
    "name": "точна назва з доступного списку",
    "price": число або null,
    "quantity": число або null,
    "slyusar": "Ім'я слюсаря" або null,
    "slyusarSum": число або null
  }
]

Якщо не вдалося розпізнати — поверни порожній масив: []

ПРИКЛАДИ:
Фраза: "Заміна гальмівних колодок спереду, ціна тисяча двісті"
→ [{"type":"work","name":"Заміна гальмівних колодок спереду","price":1200,"quantity":1,"slyusar":null,"slyusarSum":null}]

Фраза: "Масляний фільтр дві штуки по триста п'ятдесят"
→ [{"type":"detail","name":"Фільтр масляний","price":350,"quantity":2,"slyusar":null,"slyusarSum":null}]

Фраза: "Заміна масла на Петренко зарплата п'ятсот"
→ [{"type":"work","name":"Заміна масла двигуна","price":null,"quantity":1,"slyusar":"Петренко","slyusarSum":500}]

Фраза: "Розвал сходження ціна вісімсот та балансування коліс по чотириста"
→ [{"type":"work","name":"Розвал-сходження","price":800,"quantity":1,"slyusar":null,"slyusarSum":null},{"type":"work","name":"Балансування коліс","price":400,"quantity":1,"slyusar":null,"slyusarSum":null}]`;

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: `Розбери фразу: "${transcript}"` }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.1, // Низька температура для точності
      maxOutputTokens: 1024,
    },
  });

  // Спробувати ключі з ротацією
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
        if (!text) throw new Error("Порожня відповідь від Gemini");

        // Витягуємо JSON з відповіді (може бути обгорнуто в ```)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.warn("🎤 Gemini не повернув JSON:", text);
          return [];
        }

        const parsed: ParsedVoiceItem[] = JSON.parse(jsonMatch[0]);
        return parsed;
      }

      if (response.status === 429) {
        console.warn(`⚠️ Gemini ключ №${keyIdx + 1}: ліміт, перемикаємо...`);
        currentKeyIndex = (keyIdx + 1) % keys.length;
        startIndex = keyIdx + 1;
        continue;
      }

      throw new Error(`Gemini API помилка: ${response.status}`);
    } catch (err: any) {
      if (triedIndices.size >= keys.length) throw err;
      startIndex = keyIdx + 1;
    }
  }

  throw new Error("Всі ключі Gemini вичерпано. Спробуйте пізніше.");
}

// ============================================================
// ЗАПОВНЕННЯ РЯДКА ТАБЛИЦІ — ІНТЕГРАЦІЯ
// ============================================================

/**
 * Знаходить найближчу роботу/деталь з кешу за назвою від Gemini
 */
function findBestMatch(
  parsedName: string,
  type: "work" | "detail",
): {
  name: string;
  workId?: string;
  scladId?: number;
} | null {
  const nameLower = parsedName.toLowerCase();

  if (type === "work") {
    // Шукаємо точний збіг
    const exact = globalCache.worksWithId.find(
      (w) => w.name.toLowerCase() === nameLower,
    );
    if (exact) return { name: exact.name, workId: exact.work_id };

    // Шукаємо часткове входження
    const partial = globalCache.worksWithId.find(
      (w) =>
        w.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(w.name.toLowerCase()),
    );
    if (partial) return { name: partial.name, workId: partial.work_id };

    // Шукаємо за окремими словами (мінімум 2 збіги)
    const words = nameLower.split(/\s+/).filter((w) => w.length > 2);
    let bestMatch: { name: string; workId: string; score: number } | null =
      null;
    for (const w of globalCache.worksWithId) {
      const wLower = w.name.toLowerCase();
      const score = words.filter((word) => wLower.includes(word)).length;
      if (score >= 2 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { name: w.name, workId: w.work_id, score };
      }
    }
    if (bestMatch) return { name: bestMatch.name, workId: bestMatch.workId };

    return null;
  } else {
    // Деталі — шукаємо в складі та в деталях
    const exactSklad = globalCache.skladParts.find(
      (p) => p.name.toLowerCase() === nameLower,
    );
    if (exactSklad)
      return { name: exactSklad.name, scladId: exactSklad.sclad_id };

    const partialSklad = globalCache.skladParts.find(
      (p) =>
        p.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(p.name.toLowerCase()),
    );
    if (partialSklad)
      return { name: partialSklad.name, scladId: partialSklad.sclad_id };

    const exactDetail = globalCache.details.find(
      (d) => d.toLowerCase() === nameLower,
    );
    if (exactDetail) return { name: exactDetail };

    const partialDetail = globalCache.details.find(
      (d) =>
        d.toLowerCase().includes(nameLower) ||
        nameLower.includes(d.toLowerCase()),
    );
    if (partialDetail) return { name: partialDetail };

    return null;
  }
}

/**
 * Знаходить слюсаря з кешу за іменем/прізвищем
 */
function findSlyusar(name: string): string | null {
  if (!name) return null;
  const nameLower = name.trim().toLowerCase();

  const exact = globalCache.slyusars.find(
    (s) => s.Name.toLowerCase() === nameLower,
  );
  if (exact) return exact.Name;

  const partial = globalCache.slyusars.find(
    (s) =>
      s.Name.toLowerCase().includes(nameLower) ||
      nameLower.includes(s.Name.toLowerCase()),
  );
  if (partial) return partial.Name;

  return null;
}

/**
 * Заповнює рядки таблиці розпізнаними даними.
 * Для кожного ParsedVoiceItem:
 * 1. Додає новий рядок (або використовує існуючий пустий)
 * 2. Заповнює назву, кількість, ціну, слюсаря, зарплату
 */
async function fillTableRows(items: ParsedVoiceItem[]): Promise<number> {
  let filledCount = 0;

  for (const item of items) {
    try {
      // Знаходимо відповідну назву з бази
      const match = findBestMatch(item.name, item.type);
      const finalName = match?.name || item.name;

      // Знаходимо пустий рядок або створюємо новий
      const tableBody = document.querySelector<HTMLTableSectionElement>(
        `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`,
      );
      if (!tableBody) continue;

      // Шукаємо пустий рядок (без назви)
      let targetRow: HTMLTableRowElement | null = null;
      const rows = tableBody.querySelectorAll("tr");
      for (const row of rows) {
        const nameCell = row.querySelector('[data-name="name"]');
        if (nameCell && !nameCell.textContent?.trim()) {
          targetRow = row as HTMLTableRowElement;
          break;
        }
      }

      // Якщо пустого рядка нема — додаємо
      if (!targetRow) {
        addNewRow(ACT_ITEMS_TABLE_CONTAINER_ID);
        const updatedRows = tableBody.querySelectorAll("tr");
        targetRow = updatedRows[updatedRows.length - 1] as HTMLTableRowElement;
      }

      if (!targetRow) continue;

      // --- Заповнюємо НАЗВУ ---
      const nameCell = targetRow.querySelector(
        '[data-name="name"]',
      ) as HTMLElement;
      if (nameCell) {
        nameCell.textContent = finalName;
        // Зберігаємо повну назву
        nameCell.setAttribute("data-full-name", finalName);

        // Встановлюємо тип (робота/деталь) та іконку
        const isWork = item.type === "work";
        nameCell.setAttribute("data-type", isWork ? "works" : "details");

        // Оновлюємо іконку номера рядка
        const indexCell = targetRow.querySelector(".row-index");
        if (indexCell) {
          const currentIcon = isWork ? "🛠️" : "⚙️";
          const index = indexCell.textContent?.match(/\d+/)?.[0] || "1";
          indexCell.innerHTML = `${currentIcon} ${index}`;
        }

        // Встановлюємо каталог для робіт
        if (isWork && match?.workId) {
          const catalogCell = targetRow.querySelector(
            '[data-name="catalog"]',
          ) as HTMLElement;
          if (catalogCell) {
            catalogCell.textContent = match.workId;
          }
        }

        // Встановлюємо sclad_id для деталей зі складу
        if (!isWork && match?.scladId) {
          const catalogCell = targetRow.querySelector(
            '[data-name="catalog"]',
          ) as HTMLElement;
          if (catalogCell) {
            catalogCell.setAttribute("data-sclad-id", String(match.scladId));
          }
        }
      }

      // --- Заповнюємо КІЛЬКІСТЬ ---
      const qtyCell = targetRow.querySelector(
        '[data-name="id_count"]',
      ) as HTMLElement;
      if (qtyCell) {
        qtyCell.textContent = String(item.quantity ?? 1);
      }

      // --- Заповнюємо ЦІНУ ---
      const priceCell = targetRow.querySelector(
        '[data-name="price"]',
      ) as HTMLElement;
      if (priceCell && item.price !== null) {
        priceCell.textContent = String(item.price);
      }

      // --- Рахуємо СУМУ ---
      const sumCell = targetRow.querySelector(
        '[data-name="sum"]',
      ) as HTMLElement;
      if (sumCell && item.price !== null) {
        const qty = item.quantity ?? 1;
        sumCell.textContent = String(item.price * qty);
      }

      // --- Заповнюємо СЛЮСАРЯ ---
      if (item.slyusar) {
        const slyusarName = findSlyusar(item.slyusar);
        if (slyusarName) {
          const pibCell = targetRow.querySelector(
            '[data-name="pib_magazin"]',
          ) as HTMLElement;
          if (pibCell) {
            pibCell.textContent = slyusarName;
            pibCell.setAttribute("data-type", "slyusars");
          }
        }
      }

      // --- Заповнюємо ЗАРПЛАТУ СЛЮСАРЯ ---
      if (item.slyusarSum !== null) {
        const slyusarSumCell = targetRow.querySelector(
          '[data-name="slyusar_sum"]',
        ) as HTMLElement;
        if (slyusarSumCell) {
          slyusarSumCell.textContent = String(item.slyusarSum);
        }
      }

      // Якщо ціна не задана голосом — запускаємо AI підказку ціни
      if (item.price === null && finalName) {
        try {
          await handleItemSelection(targetRow, finalName, item.type);
        } catch {
          /* ignore */
        }
      }

      filledCount++;
    } catch (err) {
      console.error("🎤 Помилка заповнення рядка:", err);
    }
  }

  // Оновлюємо підсумки
  updateCalculatedSumsInFooter();

  return filledCount;
}

// ============================================================
// ГОЛОВНА ФУНКЦІЯ — КНОПКА МІКРОФОНА
// ============================================================

/**
 * Оновлює візуальний стан кнопки мікрофона
 */
function updateMicButton(btn: HTMLElement, state: VoiceState): void {
  voiceState = state;
  btn.classList.remove("voice-idle", "voice-listening", "voice-processing");

  switch (state) {
    case "idle":
      btn.classList.add("voice-idle");
      btn.innerHTML = `<span class="voice-btn-icon">🎤</span><span class="voice-btn-text">Голос</span>`;
      btn.title = "Голосове введення — натисніть і говоріть";
      break;
    case "listening":
      btn.classList.add("voice-listening");
      btn.innerHTML = `<span class="voice-btn-icon voice-pulse">🔴</span><span class="voice-btn-text">Слухаю...</span>`;
      btn.title = "Слухаю... Натисніть для зупинки";
      break;
    case "processing":
      btn.classList.add("voice-processing");
      btn.innerHTML = `<span class="voice-btn-icon voice-spin">⚙️</span><span class="voice-btn-text">Аналізую...</span>`;
      btn.title = "Зачекайте, обробка...";
      break;
  }
}

/**
 * Показує overlay із розпізнаним текстом та результатом парсингу
 */
function showVoiceResultOverlay(
  transcript: string,
  items: ParsedVoiceItem[],
): void {
  // Видаляємо попередній overlay якщо є
  document.getElementById("voice-result-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "voice-result-overlay";
  overlay.className = "voice-result-overlay";

  const itemsHtml =
    items.length > 0
      ? items
          .map((it, i) => {
            const icon = it.type === "work" ? "🛠️" : "⚙️";
            const priceTxt = it.price !== null ? `${it.price} грн` : "—";
            const qtyTxt = it.quantity !== null ? `×${it.quantity}` : "";
            const slyusarTxt = it.slyusar ? ` → ${it.slyusar}` : "";
            return `<div class="voice-result-item">
          <span>${icon} ${i + 1}.</span>
          <strong>${it.name}</strong> ${qtyTxt} — ${priceTxt}${slyusarTxt}
        </div>`;
          })
          .join("")
      : `<div class="voice-result-item voice-result-empty">❌ Не вдалося розпізнати роботу/деталь</div>`;

  overlay.innerHTML = `
    <div class="voice-result-content">
      <div class="voice-result-header">
        <span>🎤 Розпізнано:</span>
        <button class="voice-result-close" id="voice-result-close-btn">✕</button>
      </div>
      <div class="voice-result-transcript">"${transcript}"</div>
      <div class="voice-result-items">${itemsHtml}</div>
    </div>
  `;

  // Додаємо в модалку акту
  const modalBody = document.getElementById("zakaz_narayd-body");
  if (modalBody) {
    modalBody.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }

  // Закриття
  document
    .getElementById("voice-result-close-btn")
    ?.addEventListener("click", () => {
      overlay.remove();
    });

  // Автозакриття через 5 секунд
  setTimeout(() => overlay.remove(), 5000);
}

/**
 * Головний обробник натискання на кнопку мікрофона.
 * Цикл: idle → listening → processing → idle
 */
export async function handleVoiceButtonClick(btn: HTMLElement): Promise<void> {
  // Якщо вже слухаємо — зупинити
  if (voiceState === "listening") {
    stopListening();
    updateMicButton(btn, "idle");
    return;
  }

  // Якщо обробляємо — ігноруємо
  if (voiceState === "processing") return;

  // Перевіряємо підтримку
  if (!isSpeechRecognitionSupported()) {
    showNotification(
      "❌ Ваш браузер не підтримує розпізнавання мови. Використовуйте Chrome.",
      "error",
      4000,
    );
    return;
  }

  try {
    // Стан: Слухаємо
    updateMicButton(btn, "listening");
    showNotification(
      "🎤 Говоріть... (наприклад: «Заміна масла, ціна тисяча»)",
      "info",
      3000,
    );

    const transcript = await startListening();

    if (!transcript || !transcript.trim()) {
      showNotification(
        "🎤 Мову не розпізнано. Спробуйте ще раз.",
        "warning",
        2500,
      );
      updateMicButton(btn, "idle");
      return;
    }

    // Стан: Обробляємо
    updateMicButton(btn, "processing");
    showNotification(`🔄 Аналізую: "${transcript}"`, "info", 2000);

    // Парсинг через Gemini
    const parsedItems = await parseVoiceWithGemini(transcript);

    if (!parsedItems || parsedItems.length === 0) {
      showNotification(
        `❌ Не вдалося розібрати: "${transcript}". Спробуйте чіткіше.`,
        "warning",
        3500,
      );
      showVoiceResultOverlay(transcript, []);
      updateMicButton(btn, "idle");
      return;
    }

    // Заповнюємо рядки таблиці
    const filledCount = await fillTableRows(parsedItems);

    // Успіх!
    const workWord =
      filledCount === 1 ? "рядок" : filledCount < 5 ? "рядки" : "рядків";
    showNotification(
      `✅ Додано ${filledCount} ${workWord} голосом!`,
      "success",
      3000,
    );

    showVoiceResultOverlay(transcript, parsedItems);
  } catch (err: any) {
    console.error("🎤 Помилка голосового введення:", err);
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
// СТВОРЕННЯ КНОПКИ МІКРОФОНА
// ============================================================

/**
 * Створює кнопку 🎤 і додає її поруч із "Додати рядок"
 */
export function createVoiceButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = "voice-input-button";
  btn.className = "action-button voice-input-button voice-idle";
  btn.type = "button";
  btn.innerHTML = `<span class="voice-btn-icon">🎤</span><span class="voice-btn-text">Голос</span>`;
  btn.title = "Голосове введення — натисніть і говоріть";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleVoiceButtonClick(btn);
  });

  return btn;
}

/**
 * Ініціалізує кнопку голосового введення в модалці акту.
 * Викликати після рендерингу модалки.
 */
export function initVoiceInput(): void {
  // Не додаємо якщо акт закритий
  if (globalCache.isActClosed) return;

  // Не додаємо якщо браузер не підтримує
  if (!isSpeechRecognitionSupported()) {
    console.log(
      "🎤 Голосове введення недоступне: браузер не підтримує Web Speech API",
    );
    return;
  }

  // Шукаємо контейнер кнопок
  const buttonsContainer = document.querySelector(
    ".zakaz_narayd-buttons-container",
  );
  if (!buttonsContainer) return;

  // Не додаємо дублікат
  if (document.getElementById("voice-input-button")) return;

  const voiceBtn = createVoiceButton();

  // Вставляємо між "Додати рядок" та "Зберегти зміни"
  const saveBtn = document.getElementById("save-act-data");
  if (saveBtn) {
    buttonsContainer.insertBefore(voiceBtn, saveBtn);
  } else {
    buttonsContainer.appendChild(voiceBtn);
  }
}

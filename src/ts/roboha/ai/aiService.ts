// src/ts/roboha/ai/aiService.ts
// Модуль штучного інтелекту для СТО
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { globalCache } from "../zakaz_naraudy/globalCache";

// ============================================================================
// ТИПИ ТА ІНТЕРФЕЙСИ
// ============================================================================

export interface AISettings {
  enabled: boolean; // Чи увімкнено ШІ (setting_id: 10)
  apiToken: string; // API токен OpenAI (setting_id: 11)
  model: string; // Модель (setting_id: 12, за замовчуванням gpt-4o-mini)
}

export interface PriceSuggestion {
  avgPrice: number; // Середня ціна
  minPrice: number; // Мінімальна ціна
  maxPrice: number; // Максимальна ціна
  count: number; // Кількість записів для розрахунку
  source: "history" | "ai"; // Джерело даних
  confirmed: boolean; // Чи підтверджено користувачем
  // Додаткові підказки для робіт
  avgQuantity?: number; // Середня кількість
  avgSalary?: number; // Середня зарплата
  mostFrequentSlyusar?: string; // Найчастіший виконавець
}

export interface SalarySuggestion {
  amount: number; // Сума зарплати
  percent: number; // Відсоток
  source: "history" | "ai"; // Джерело
  slyusarName: string; // Ім'я слюсаря
  workName: string; // Назва роботи
}

// ============================================================================
// КЕШУВАННЯ НАЛАШТУВАНЬ AI
// ============================================================================

let aiSettingsCache: AISettings | null = null;
let aiSettingsCacheLoaded = false;

// Кеш середніх цін для швидкого доступу
const avgPriceCache = new Map<string, PriceSuggestion>();
// Кеш зарплат слюсарів
const salaryCacheMap = new Map<string, SalarySuggestion>();

// ============================================================================
// ФУНКЦІЇ РОБОТИ З НАЛАШТУВАННЯМИ AI
// ============================================================================

/**
 * Завантажує налаштування AI з globalCache
 * Тепер AI toggle зберігається в setting_id=7, data колонці
 */
export async function loadAISettings(): Promise<AISettings> {
  if (aiSettingsCacheLoaded && aiSettingsCache) {
    return aiSettingsCache;
  }

  const settings: AISettings = {
    enabled: globalCache.generalSettings.aiEnabled || false,
    apiToken: "",
    model: "gpt-4o-mini",
  };

  aiSettingsCache = settings;
  aiSettingsCacheLoaded = true;

  return settings;
}

/**
 * Зберігає налаштування AI в базу даних
 */
export async function saveAISettings(
  settings: Partial<AISettings>,
): Promise<boolean> {
  try {
    const updates: Array<{ id: number; value: string }> = [];

    if (settings.enabled !== undefined) {
      updates.push({ id: 10, value: String(settings.enabled) });
    }
    if (settings.apiToken !== undefined) {
      updates.push({ id: 11, value: settings.apiToken });
    }
    if (settings.model !== undefined) {
      updates.push({ id: 12, value: settings.model });
    }

    for (const { id, value } of updates) {
      // Перевіряємо чи існує запис
      const { data: existing } = await supabase
        .from("settings")
        .select("setting_id")
        .eq("setting_id", id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("settings")
          .update({ Загальні: value })
          .eq("setting_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ setting_id: id, Загальні: value, data: false });
        if (error) throw error;
      }
    }

    // Оновлюємо кеш
    if (aiSettingsCache) {
      if (settings.enabled !== undefined)
        aiSettingsCache.enabled = settings.enabled;
      if (settings.apiToken !== undefined)
        aiSettingsCache.apiToken = settings.apiToken;
      if (settings.model !== undefined) aiSettingsCache.model = settings.model;
    }

    return true;
  } catch (err) {
    // console.error("❌ Помилка збереження AI налаштувань:", err);
    return false;
  }
}

/**
 * Перевіряє чи увімкнено AI
 * Для базових підказок з історії токен НЕ потрібен
 */
export async function isAIEnabled(): Promise<boolean> {
  const settings = await loadAISettings();
  return settings.enabled;
}

/**
 * Скидає кеш AI налаштувань
 */
export function resetAISettingsCache(): void {
  aiSettingsCache = null;
  aiSettingsCacheLoaded = false;
  avgPriceCache.clear();
  salaryCacheMap.clear();
}

// ============================================================================
// ФУНКЦІЇ РОЗРАХУНКУ СЕРЕДНІХ ЦІН
// ============================================================================

/**
 * Отримує середню ціну для роботи/деталі з історії актів
 * @param itemName - назва роботи або деталі
 * @param itemType - тип: "work" або "detail"
 */
export async function getAveragePriceFromHistory(
  itemName: string,
  itemType: "work" | "detail",
): Promise<PriceSuggestion | null> {
  const cacheKey = `${itemType}:${itemName.toLowerCase()}`;

  // Перевіряємо кеш
  if (avgPriceCache.has(cacheKey)) {
    return avgPriceCache.get(cacheKey)!;
  }

  try {
    // Завантажуємо акти з історії
    const { data: acts, error } = await supabase
      .from("acts")
      .select("data")
      .not("data", "is", null)
      .order("act_id", { ascending: false })
      .limit(50); // Останні 50 актів для швидкості

    if (error) {
      // console.error("Помилка отримання історії цін:", error);
      showNotification(
        `Помилка отримання історії цін: ${error.message}`,
        "error",
      );
      return null;
    }

    if (acts) {
      const prices: number[] = [];
      const quantities: number[] = [];
      const salaries: number[] = [];
      const slyusarNames: string[] = [];
      const itemNameLower = itemName.toLowerCase(); // Для порівняння без урахування регістру

      acts.forEach((act) => {
        let actData = act.data;

        // Парсимо JSON, якщо це рядок
        if (typeof actData === "string") {
          try {
            actData = JSON.parse(actData);
          } catch (e) {
            return; // Пропускаємо некоректний JSON
          }
        }

        if (!actData || typeof actData !== "object") {
          return; // Пропускаємо, якщо дані відсутні або некоректні
        }

        // Визначаємо масив для пошуку залежно від типу
        let itemsArray: any[] = [];
        if (itemType === "work") {
          itemsArray = Array.isArray(actData["Роботи"])
            ? actData["Роботи"]
            : [];
        } else if (itemType === "detail") {
          itemsArray = Array.isArray(actData["Деталі"])
            ? actData["Деталі"]
            : [];
        }

        // Шукаємо ціни в відповідному масиві
        itemsArray.forEach((item: any) => {
          // Для робіт: item["Робота"], для деталей: item["Найменування"]
          const itemName =
            itemType === "work" ? item["Робота"] : item["Найменування"];
          const itemPrice = Number(item["Ціна"] || 0);
          const itemQuantity = Number(item["Кількість"] || 1);
          const itemSalary =
            itemType === "work" ? Number(item["Зар-та"] || 0) : 0;
          const itemSlyusar =
            itemType === "work" ? (item["ПІБ _ Магазин"] || "").trim() : "";

          if (itemName && typeof itemName === "string" && itemPrice > 0) {
            const nameLower = itemName.toLowerCase();
            // Перевірка на частковий збіг в обидві сторони
            if (
              nameLower.includes(itemNameLower) ||
              itemNameLower.includes(nameLower)
            ) {
              prices.push(itemPrice);
              quantities.push(itemQuantity);
              if (itemSalary > 0) salaries.push(itemSalary);
              if (itemSlyusar) slyusarNames.push(itemSlyusar);
            }
          }
        });
      });

      if (prices.length < 1) {
        return null; // Недостатньо даних
      }

      // Розраховуємо статистику — беремо НАЙНИЖЧУ ціну
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = minPrice; // Показуємо найнижчу ціну

      // Середня кількість
      const avgQuantity =
        quantities.length > 0
          ? Math.round(
              quantities.reduce((a, b) => a + b, 0) / quantities.length,
            )
          : undefined;

      // Середня зарплата
      const avgSalary =
        salaries.length > 0
          ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
          : undefined;

      // Найчастіший слюсар
      let mostFrequentSlyusar: string | undefined;
      if (slyusarNames.length > 0) {
        const slyusarCounts = new Map<string, number>();
        slyusarNames.forEach((name) => {
          slyusarCounts.set(name, (slyusarCounts.get(name) || 0) + 1);
        });
        let maxCount = 0;
        slyusarCounts.forEach((count, name) => {
          if (count > maxCount) {
            maxCount = count;
            mostFrequentSlyusar = name;
          }
        });
      }

      const suggestion: PriceSuggestion = {
        avgPrice,
        minPrice,
        maxPrice,
        count: prices.length,
        source: "history",
        confirmed: false,
        avgQuantity,
        avgSalary,
        mostFrequentSlyusar,
      };

      // Зберігаємо в кеш
      avgPriceCache.set(cacheKey, suggestion);

      return suggestion;
    }

    // Якщо `acts` не існує, але помилки не було (малоймовірно, але можливо)
    return null;
  } catch (err) {
    // console.error("❌ Помилка отримання середньої ціни:", err);
    return null;
  }
}

// ============================================================================
// ФУНКЦІЇ РОЗРАХУНКУ ЗАРПЛАТ
// ============================================================================

/**
 * Шукає зарплату в історії слюсаря для подібної роботи
 */
export async function findSalaryInHistory(
  slyusarName: string,
  workName: string,
  price: number,
): Promise<SalarySuggestion | null> {
  const cacheKey = `salary:${slyusarName.toLowerCase()}:${workName.toLowerCase()}`;

  if (salaryCacheMap.has(cacheKey)) {
    return salaryCacheMap.get(cacheKey)!;
  }

  try {
    // Завантажуємо історію слюсаря
    const { data: slyusars, error } = await supabase
      .from("slyusars")
      .select("Name, Історія")
      .ilike("Name", slyusarName);

    if (error) throw error;
    if (!slyusars?.length) return null;

    const slyusar = slyusars[0] as any;
    const history = slyusar["Історія"] as Record<string, any>;

    if (!history || typeof history !== "object") return null;

    const workNameLower = workName.toLowerCase();
    const salaryEntries: Array<{ salary: number; price: number }> = [];

    // Шукаємо подібні роботи в історії
    for (const dateKey in history) {
      const dayBucket = history[dateKey];
      if (!Array.isArray(dayBucket)) continue;

      for (const actEntry of dayBucket) {
        const zapisi = actEntry?.["Записи"];
        if (!Array.isArray(zapisi)) continue;

        for (const record of zapisi) {
          const recordWorkLower = (record.Робота || "").toLowerCase();

          // Шукаємо схожі роботи
          if (
            recordWorkLower.includes(workNameLower) ||
            workNameLower.includes(recordWorkLower)
          ) {
            if (record.Зарплата > 0 && record.Ціна > 0) {
              salaryEntries.push({
                salary: record.Зарплата,
                price: record.Ціна,
              });
            }
          }
        }
      }
    }

    if (salaryEntries.length === 0) return null;

    // Обчислюємо Помірний відсоток
    const percentages = salaryEntries.map((e) => (e.salary / e.price) * 100);
    const avgPercent =
      percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const calculatedSalary = Math.round((price * avgPercent) / 100);

    const suggestion: SalarySuggestion = {
      amount: calculatedSalary,
      percent: Math.round(avgPercent),
      source: "history",
      slyusarName,
      workName,
    };

    salaryCacheMap.set(cacheKey, suggestion);

    return suggestion;
  } catch (err) {
    // console.error("❌ Помилка пошуку зарплати в історії:", err);
    return null;
  }
}

// ============================================================================
// МОДАЛЬНЕ ВІКНО ВВЕДЕННЯ ТОКЕНА
// ============================================================================

const AI_TOKEN_MODAL_ID = "ai-token-modal";

/**
 * Створює та показує модальне вікно для введення API токена
 */
export function showAITokenModal(onSave?: (token: string) => void): void {
  // Видаляємо попереднє вікно якщо є
  const existing = document.getElementById(AI_TOKEN_MODAL_ID);
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = AI_TOKEN_MODAL_ID;
  modal.className = "ai-token-modal";
  modal.innerHTML = `
    <div class="ai-token-modal-content">
      <div class="ai-token-modal-header">
        <h3>🤖 Налаштування ШІ</h3>
        <button class="ai-token-close-btn" id="ai-token-close">×</button>
      </div>
      <div class="ai-token-modal-body">
        <p class="ai-token-description">
          Для роботи штучного інтелекту потрібен API ключ OpenAI.<br>
          Отримати ключ можна на <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>
        </p>
        <div class="ai-token-input-group">
          <label for="ai-token-input">API Ключ:</label>
          <input type="password" id="ai-token-input" placeholder="sk-..." autocomplete="off" />
          <button type="button" id="ai-token-toggle" class="ai-token-toggle-btn" title="Показати/Сховати">👁️</button>
        </div>
        <div class="ai-token-model-group">
          <label for="ai-model-select">Модель:</label>
          <select id="ai-model-select">
            <option value="gpt-4o-mini" selected>GPT-4o Mini (швидка, дешева)</option>
            <option value="gpt-4o">GPT-4o (точніша, дорожча)</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (найдешевша)</option>
          </select>
        </div>
      </div>
      <div class="ai-token-modal-footer">
        <button type="button" id="ai-token-cancel" class="ai-token-btn cancel">Скасувати</button>
        <button type="button" id="ai-token-save" class="ai-token-btn save">Зберегти</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Завантажуємо поточні налаштування
  loadAISettings().then((settings) => {
    const tokenInput = modal.querySelector(
      "#ai-token-input",
    ) as HTMLInputElement;
    const modelSelect = modal.querySelector(
      "#ai-model-select",
    ) as HTMLSelectElement;

    if (tokenInput && settings.apiToken) {
      tokenInput.value = settings.apiToken;
    }
    if (modelSelect && settings.model) {
      modelSelect.value = settings.model;
    }
  });

  // Обробники
  const closeBtn = modal.querySelector("#ai-token-close") as HTMLButtonElement;
  const cancelBtn = modal.querySelector(
    "#ai-token-cancel",
  ) as HTMLButtonElement;
  const saveBtn = modal.querySelector("#ai-token-save") as HTMLButtonElement;
  const toggleBtn = modal.querySelector(
    "#ai-token-toggle",
  ) as HTMLButtonElement;
  const tokenInput = modal.querySelector("#ai-token-input") as HTMLInputElement;
  const modelSelect = modal.querySelector(
    "#ai-model-select",
  ) as HTMLSelectElement;

  const closeModal = () => {
    modal.classList.add("closing");
    setTimeout(() => modal.remove(), 200);
  };

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Показати/сховати токен
  toggleBtn?.addEventListener("click", () => {
    if (tokenInput.type === "password") {
      tokenInput.type = "text";
      toggleBtn.textContent = "🙈";
    } else {
      tokenInput.type = "password";
      toggleBtn.textContent = "👁️";
    }
  });

  // Збереження
  saveBtn?.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    const model = modelSelect.value;

    if (!token) {
      showNotification("Введіть API ключ", "warning", 2000);
      return;
    }

    if (!token.startsWith("sk-")) {
      showNotification("API ключ повинен починатися з 'sk-'", "warning", 2000);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Збереження...";

    const success = await saveAISettings({
      apiToken: token,
      model,
      enabled: true,
    });

    if (success) {
      showNotification("✅ AI налаштування збережено", "success", 2000);
      onSave?.(token);
      closeModal();
    } else {
      showNotification("❌ Помилка збереження", "error", 2000);
      saveBtn.disabled = false;
      saveBtn.textContent = "Зберегти";
    }
  });

  // Анімація появи
  requestAnimationFrame(() => {
    modal.classList.add("visible");
  });
}

// ============================================================================
// ДОПОМІЖНІ ФУНКЦІЇ
// ============================================================================

/**
 * Форматує ціну для відображення
 */
export function formatPriceForDisplay(price: number): string {
  return Math.round(price)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Перевіряє валідність API токена
 */
export async function validateAPIToken(token: string): Promise<boolean> {
  if (!token || !token.startsWith("sk-")) return false;

  // Базова валідація - токен має бути достатньо довгим
  return token.length > 20;
}

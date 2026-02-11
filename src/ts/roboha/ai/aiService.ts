// src/ts/roboha/ai/aiService.ts
// Модуль штучного інтелекту для СТО
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

// ============================================================================
// ТИПИ ТА ІНТЕРФЕЙСИ
// ============================================================================

export interface AISettings {
  enabled: boolean;           // Чи увімкнено ШІ (setting_id: 10)
  apiToken: string;           // API токен OpenAI (setting_id: 11)
  model: string;              // Модель (setting_id: 12, за замовчуванням gpt-4o-mini)
}

export interface PriceSuggestion {
  avgPrice: number;           // Середня ціна
  minPrice: number;           // Мінімальна ціна
  maxPrice: number;           // Максимальна ціна
  count: number;              // Кількість записів для розрахунку
  source: "history" | "ai";   // Джерело даних
  confirmed: boolean;         // Чи підтверджено користувачем
}

export interface SalarySuggestion {
  amount: number;             // Сума зарплати
  percent: number;            // Відсоток
  source: "history" | "ai";   // Джерело
  slyusarName: string;        // Ім'я слюсаря
  workName: string;           // Назва роботи
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
 * Завантажує налаштування AI з бази даних
 */
export async function loadAISettings(): Promise<AISettings> {
  if (aiSettingsCacheLoaded && aiSettingsCache) {
    return aiSettingsCache;
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select('setting_id, "Загальні"')
      .in("setting_id", [10, 11, 12])
      .order("setting_id");

    if (error) throw error;

    const settings: AISettings = {
      enabled: false,
      apiToken: "",
      model: "gpt-4o-mini",
    };

    data?.forEach((row: any) => {
      const value = row["Загальні"] || "";
      switch (row.setting_id) {
        case 10:
          settings.enabled = value === "true" || value === true;
          break;
        case 11:
          settings.apiToken = value;
          break;
        case 12:
          settings.model = value || "gpt-4o-mini";
          break;
      }
    });

    aiSettingsCache = settings;
    aiSettingsCacheLoaded = true;
    
    console.log("🤖 AI налаштування завантажено:", { enabled: settings.enabled, hasToken: !!settings.apiToken });
    return settings;
  } catch (err) {
    console.error("❌ Помилка завантаження AI налаштувань:", err);
    return { enabled: false, apiToken: "", model: "gpt-4o-mini" };
  }
}

/**
 * Зберігає налаштування AI в базу даних
 */
export async function saveAISettings(settings: Partial<AISettings>): Promise<boolean> {
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
          .update({ "Загальні": value })
          .eq("setting_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ setting_id: id, "Загальні": value, data: false });
        if (error) throw error;
      }
    }

    // Оновлюємо кеш
    if (aiSettingsCache) {
      if (settings.enabled !== undefined) aiSettingsCache.enabled = settings.enabled;
      if (settings.apiToken !== undefined) aiSettingsCache.apiToken = settings.apiToken;
      if (settings.model !== undefined) aiSettingsCache.model = settings.model;
    }

    console.log("✅ AI налаштування збережено");
    return true;
  } catch (err) {
    console.error("❌ Помилка збереження AI налаштувань:", err);
    return false;
  }
}

/**
 * Перевіряє чи увімкнено AI
 */
export async function isAIEnabled(): Promise<boolean> {
  const settings = await loadAISettings();
  return settings.enabled && !!settings.apiToken;
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
  itemType: "work" | "detail"
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
      .order("id", { ascending: false })
      .limit(500); // Останні 500 актів

    if (error) throw error;

    const prices: number[] = [];
    const itemNameLower = itemName.toLowerCase();

    acts?.forEach((act: any) => {
      const actData = typeof act.data === "string" ? JSON.parse(act.data) : act.data;
      if (!actData?.items) return;

      actData.items.forEach((item: any) => {
        if (!item.name) return;
        
        const nameLower = item.name.toLowerCase();
        const matchesName = nameLower.includes(itemNameLower) || itemNameLower.includes(nameLower);
        const matchesType = itemType === "work" ? item.type === "work" : item.type === "detail";
        
        if (matchesName && matchesType && item.price > 0) {
          prices.push(Number(item.price));
        }
      });
    });

    if (prices.length < 2) {
      return null; // Недостатньо даних
    }

    // Розраховуємо статистику
    const sum = prices.reduce((a, b) => a + b, 0);
    const avgPrice = Math.round(sum / prices.length);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const suggestion: PriceSuggestion = {
      avgPrice,
      minPrice,
      maxPrice,
      count: prices.length,
      source: "history",
      confirmed: false,
    };

    // Зберігаємо в кеш
    avgPriceCache.set(cacheKey, suggestion);

    console.log(`💰 Середня ціна для "${itemName}": ${avgPrice} грн (з ${prices.length} записів)`);
    return suggestion;
  } catch (err) {
    console.error("❌ Помилка отримання середньої ціни:", err);
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
  price: number
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

    // Обчислюємо середній відсоток
    const percentages = salaryEntries.map(e => (e.salary / e.price) * 100);
    const avgPercent = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const calculatedSalary = Math.round((price * avgPercent) / 100);

    const suggestion: SalarySuggestion = {
      amount: calculatedSalary,
      percent: Math.round(avgPercent),
      source: "history",
      slyusarName,
      workName,
    };

    salaryCacheMap.set(cacheKey, suggestion);

    console.log(`👷 Зарплата для "${slyusarName}" на "${workName}": ${calculatedSalary} грн (${Math.round(avgPercent)}%)`);
    return suggestion;
  } catch (err) {
    console.error("❌ Помилка пошуку зарплати в історії:", err);
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
    const tokenInput = modal.querySelector("#ai-token-input") as HTMLInputElement;
    const modelSelect = modal.querySelector("#ai-model-select") as HTMLSelectElement;
    
    if (tokenInput && settings.apiToken) {
      tokenInput.value = settings.apiToken;
    }
    if (modelSelect && settings.model) {
      modelSelect.value = settings.model;
    }
  });

  // Обробники
  const closeBtn = modal.querySelector("#ai-token-close") as HTMLButtonElement;
  const cancelBtn = modal.querySelector("#ai-token-cancel") as HTMLButtonElement;
  const saveBtn = modal.querySelector("#ai-token-save") as HTMLButtonElement;
  const toggleBtn = modal.querySelector("#ai-token-toggle") as HTMLButtonElement;
  const tokenInput = modal.querySelector("#ai-token-input") as HTMLInputElement;
  const modelSelect = modal.querySelector("#ai-model-select") as HTMLSelectElement;

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

    const success = await saveAISettings({ apiToken: token, model, enabled: true });

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
  return Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Перевіряє валідність API токена
 */
export async function validateAPIToken(token: string): Promise<boolean> {
  if (!token || !token.startsWith("sk-")) return false;
  
  // Базова валідація - токен має бути достатньо довгим
  return token.length > 20;
}

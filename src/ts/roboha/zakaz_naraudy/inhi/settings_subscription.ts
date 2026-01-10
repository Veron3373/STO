// src/ts/roboha/zakaz_naraudy/inhi/settings_subscription.ts
/**
 * Real-time підписка на зміни в таблиці settings
 * Автоматично оновлює інтерфейс при зміні налаштувань адміністратором
 * без необхідності перезавантаження сторінки
 */

import { supabase } from "../../../vxid/supabaseClient";
import { globalCache } from "../globalCache";
import { showNotification } from "./vspluvauhe_povidomlenna";
import { userAccessLevel } from "../../tablucya/users";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Канал підписки
let settingsChannel: RealtimeChannel | null = null;

/**
 * Мапа setting_id → колонка ролі в БД
 * Визначає які налаштування відносяться до якої ролі
 */
const SETTING_COLUMN_MAP: Record<number, string> = {
  1: "Приймальник",      // Налаштування
  2: "data",             // Каталог (для всіх через data)
  3: "Слюсар",          // Зарплата / Акт Закриття
  4: "Приймальник",      // Бухгалтерія
  5: "data",             // SMS (для всіх через data)
  6: "Приймальник",      // Бухгалтерія 🏪 Склад розраховувати
  7: "Приймальник",      // Бухгалтерія 🏪 Склад відміна розраховувати
  8: "Приймальник",      // Бухгалтерія 🏪 Склад повертати
  9: "Приймальник",      // Бухгалтерія 🏪 Склад відміна повернення
  13: "Складовщик",      // Бухгалтерія ⚙️ Деталі
  14: "Приймальник",     // Акт Зарплата
  15: "Приймальник",     // Акт Ціна та Сума
  16: "Запчастист",      // Акт Закриття акту із зауваженнями
  17: "Приймальник",     // Акт Відкриття акту
  18: "Приймальник",     // Акт Створити Рахунок
  19: "Запчастист",      // Акт Створити PDF
  20: "Приймальник",     // Акт Налаштування
  21: "Приймальник",     // Планування
};

/**
 * Мапа колонки в БД → роль користувача
 */
const COLUMN_TO_ROLE: Record<string, string> = {
  "data": "Адміністратор", // Загальні налаштування
  "Приймальник": "Приймальник",
  "Слюсар": "Слюсар",
  "Запчастист": "Запчастист",
  "Складовщик": "Складовщик",
};

/**
 * Перевіряє чи потрібно оновлювати UI для поточного користувача
 * @param settingId - ID налаштування яке змінилося
 * @param changedColumn - назва колонки яка змінилася
 * @returns true якщо зміни стосуються поточної ролі
 */
function shouldUpdateForCurrentUser(settingId: number, changedColumn?: string): boolean {
  // Адміністратор завжди бачить всі зміни
  if (userAccessLevel === "Адміністратор") {
    return true;
  }

  // Якщо змінилась колонка "data" - це впливає на всіх
  if (changedColumn === "data") {
    return true;
  }

  // Перевіряємо чи колонка стосується поточної ролі
  if (changedColumn && COLUMN_TO_ROLE[changedColumn]) {
    return COLUMN_TO_ROLE[changedColumn] === userAccessLevel;
  }

  // Перевіряємо чи налаштування стосується поточної ролі через setting_id
  const targetColumn = SETTING_COLUMN_MAP[settingId];
  if (!targetColumn) {
    console.warn(`⚠️ Невідомий setting_id: ${settingId}`);
    return false;
  }

  if (targetColumn === "data") {
    return true; // Налаштування для всіх
  }

  return targetColumn === userAccessLevel;
}

/**
 * Оновлює globalCache.settings з актуальними даними з БД
 */
async function refreshSettingsCache(): Promise<void> {
  try {
    const { data: settingsRows, error } = await supabase
      .from("settings")
      .select("setting_id, data");

    if (error) {
      console.error("❌ Помилка завантаження settings:", error);
      return;
    }

    // Оновлюємо кеш налаштувань
    const settingShop = settingsRows?.find((s: any) => s.setting_id === 1);
    const settingCatalog = settingsRows?.find((s: any) => s.setting_id === 2);
    const settingZarplata = settingsRows?.find((s: any) => s.setting_id === 3);
    const settingSMS = settingsRows?.find((s: any) => s.setting_id === 5);

    globalCache.settings = {
      showPibMagazin: !!settingShop?.data,
      showCatalog: !!settingCatalog?.data,
      showZarplata: !!settingZarplata?.data,
      showSMS: !!settingSMS?.data,
      preferredLanguage: globalCache.settings.preferredLanguage,
      saveMargins: globalCache.settings.saveMargins,
    };

    console.log("✅ Settings cache оновлено:", globalCache.settings);
  } catch (error) {
    console.error("❌ Критична помилка при оновленні settings:", error);
  }
}

/**
 * Оновлює відображення елементів UI відповідно до нових налаштувань
 */
function updateUIBasedOnSettings(): void {
  // Оновлюємо видимість колонки "ПІБ / Магазин"
  updatePibMagazinVisibility();
  
  // Оновлюємо видимість колонки "Каталог"
  updateCatalogVisibility();
  
  // Оновлюємо видимість колонки "Зарплата"
  updateZarplataVisibility();
  
  // Оновлюємо видимість кнопки SMS
  updateSMSButtonVisibility();
  
  // Оновлюємо кнопки в модальному вікні акту
  updateActModalButtons();

  console.log("🔄 UI оновлено відповідно до нових налаштувань");
}

/**
 * Оновлює видимість колонки "ПІБ / Магазин"
 */
function updatePibMagazinVisibility(): void {
  const showPibMagazin = globalCache.settings.showPibMagazin;
  
  // Знаходимо всі заголовки та комірки колонки
  const headers = document.querySelectorAll('th[data-name="pib_magazin"]');
  const cells = document.querySelectorAll('td.pib-magazin-cell');
  
  headers.forEach(header => {
    (header as HTMLElement).style.display = showPibMagazin ? '' : 'none';
  });
  
  cells.forEach(cell => {
    (cell as HTMLElement).style.display = showPibMagazin ? '' : 'none';
  });
}

/**
 * Оновлює видимість колонки "Каталог"
 */
function updateCatalogVisibility(): void {
  const showCatalog = globalCache.settings.showCatalog;
  
  const headers = document.querySelectorAll('th[data-name="catalog"]');
  const cells = document.querySelectorAll('td.catalog-cell');
  
  headers.forEach(header => {
    (header as HTMLElement).style.display = showCatalog ? '' : 'none';
  });
  
  cells.forEach(cell => {
    (cell as HTMLElement).style.display = showCatalog ? '' : 'none';
  });
}

/**
 * Оновлює видимість колонки "Зарплата"
 */
function updateZarplataVisibility(): void {
  const showZarplata = globalCache.settings.showZarplata;
  
  const headers = document.querySelectorAll('th[data-name="slyusar_sum"]');
  const cells = document.querySelectorAll('td.slyusar-sum-cell');
  
  headers.forEach(header => {
    (header as HTMLElement).style.display = showZarplata ? '' : 'none';
  });
  
  cells.forEach(cell => {
    (cell as HTMLElement).style.display = showZarplata ? '' : 'none';
  });
}

/**
 * Оновлює видимість кнопки SMS
 */
function updateSMSButtonVisibility(): void {
  const showSMS = globalCache.settings.showSMS;
  const smsButton = document.querySelector('[data-action="send-sms"]');
  
  if (smsButton) {
    (smsButton as HTMLElement).style.display = showSMS ? '' : 'none';
  }
}

/**
 * Оновлює видимість кнопок в модальному вікні акту
 * (Бухгалтерія, Планування тощо)
 */
function updateActModalButtons(): void {
  // Тут можна додати логіку оновлення кнопок
  // наприклад, приховування кнопки "Бухгалтерія" для Приймальника
  // в залежності від налаштувань
  
  // Приклад:
  const buhButton = document.querySelector('[data-nav="bukhhalteriya"]');
  if (buhButton && userAccessLevel === "Приймальник") {
    // Перевіряємо налаштування для кнопки Бухгалтерія (setting_id = 4)
    // Якщо потрібно додати таку логіку
  }
}

/**
 * Обробник змін в таблиці settings
 */
async function handleSettingsChange(payload: any): Promise<void> {
  console.log("📡 Settings change detected:", payload);
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  // Перевіряємо тип події
  if (eventType !== "UPDATE" && eventType !== "INSERT") {
    return;
  }
  
  const settingId = newRecord?.setting_id;
  
  if (!settingId) {
    console.warn("⚠️ Setting change without setting_id");
    return;
  }

  // Визначаємо яка колонка змінилася
  let changedColumn: string | undefined;
  if (eventType === "UPDATE" && oldRecord) {
    // Знаходимо яка колонка змінилася
    for (const key of Object.keys(newRecord)) {
      if (key !== "setting_id" && newRecord[key] !== oldRecord[key]) {
        changedColumn = key;
        break;
      }
    }
  }
  
  console.log(`🔍 Зміна в setting_id=${settingId}, колонка="${changedColumn || 'невідома'}"`);
  
  // Перевіряємо чи стосується зміна поточного користувача
  if (!shouldUpdateForCurrentUser(settingId, changedColumn)) {
    console.log(`ℹ️ Зміна setting_id=${settingId} не стосується ролі ${userAccessLevel}`);
    return;
  }
  
  console.log(`✅ Зміна стосується ролі ${userAccessLevel}, оновлюємо...`);
  
  // Оновлюємо кеш налаштувань
  await refreshSettingsCache();
  
  // Оновлюємо UI
  updateUIBasedOnSettings();
  
  // Показуємо повідомлення користувачу
  showNotification(
    "Налаштування оновлено адміністратором",
    "info",
    3000
  );
}

/**
 * Ініціалізує підписку на зміни в таблиці settings
 */
export function initializeSettingsSubscription(): void {
  // Якщо підписка вже активна, спочатку відключаємо її
  if (settingsChannel) {
    console.log("🔌 Відключення попередньої підписки settings...");
    settingsChannel.unsubscribe();
    settingsChannel = null;
  }

  try {
    console.log("🔌 Ініціалізація підписки на зміни в settings...");
    
    // Створюємо канал підписки
    settingsChannel = supabase
      .channel("settings-changes")
      .on(
        "postgres_changes",
        {
          event: "*", // Всі події: INSERT, UPDATE, DELETE
          schema: "public",
          table: "settings",
        },
        handleSettingsChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Підписка на settings активна");
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ Помилка підписки на settings");
          showNotification(
            "Помилка підключення до оновлень налаштувань",
            "error",
            3000
          );
        }
      });
  } catch (error) {
    console.error("❌ Критична помилка при ініціалізації підписки:", error);
  }
}

/**
 * Відключає підписку на зміни в таблиці settings
 */
export function disconnectSettingsSubscription(): void {
  if (settingsChannel) {
    console.log("🔌 Відключення підписки на settings...");
    settingsChannel.unsubscribe();
    settingsChannel = null;
    console.log("✅ Підписка відключена");
  }
}

/**
 * Перевіряє стан підписки
 */
export function isSettingsSubscriptionActive(): boolean {
  return settingsChannel !== null;
}

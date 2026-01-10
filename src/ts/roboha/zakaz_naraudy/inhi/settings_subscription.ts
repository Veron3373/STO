// src/ts/roboha/zakaz_naraudy/inhi/settings_subscription.ts
/**
 * Real-time підписка на зміни в таблиці settings
 * Автоматично оновлює інтерфейс при зміні налаштувань адміністратором
 * для ВСІХ ролей: Адміністратор, Приймальник, Слюсар, Запчастист, Складовщик
 */

import { supabase } from "../../../vxid/supabaseClient";
import { globalCache } from "../globalCache";
import { showNotification } from "./vspluvauhe_povidomlenna";
import { userAccessLevel } from "../../tablucya/users";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { enforcePageAccess } from "./page_access_guard";

let settingsChannel: RealtimeChannel | null = null;

/**
 * Перевіряє чи потрібно оновлювати UI для поточного користувача
 */
function shouldUpdateForCurrentUser(_settingId: number, changedColumn?: string): boolean {
  // Адміністратор бачить ВСІ зміни
  if (userAccessLevel === "Адміністратор") return true;
  
  // Якщо змінилась колонка "data" - це впливає на ВСІХ
  if (changedColumn === "data") return true;
  
  // Якщо знаємо яка колонка змінилась - перевіряємо чи це колонка поточної ролі
  if (changedColumn) {
    // Назва колонки в БД = назва ролі ("Приймальник", "Слюсар", "Запчастист", "Складовщик")
    if (changedColumn === userAccessLevel) {
      return true;
    }
  }
  
  // Якщо не знаємо колонку - оновлюємо на всяк випадок (безпечніше)
  return true;
}

async function refreshSettingsCache(): Promise<void> {
  try {
    const { data: settingsRows, error } = await supabase
      .from("settings")
      .select("setting_id, data");
    if (error) return;
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
    console.error("❌ Помилка оновлення settings:", error);
  }
}

function findElementsByText(selector: string, text: string): HTMLElement[] {
  const elements = document.querySelectorAll(selector);
  const found: HTMLElement[] = [];
  elements.forEach(el => {
    if (el.textContent?.includes(text)) found.push(el as HTMLElement);
  });
  return found;
}

function updatePibMagazinVisibility(): void {
  const show = globalCache.settings.showPibMagazin;
  const headers = findElementsByText('th', 'ПІБ _ Магазин');
  const cells = document.querySelectorAll('td.pib-magazin-cell, td[data-name="pib_magazin"]');
  headers.forEach(h => h.style.display = show ? '' : 'none');
  cells.forEach(c => (c as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 ПІБ/Магазин: ${show ? 'показано' : 'приховано'}`);
}

function updateCatalogVisibility(): void {
  const show = globalCache.settings.showCatalog;
  const headers = findElementsByText('th', 'Каталог');
  const cells = document.querySelectorAll('td.catalog-cell, td[data-name="catalog"]');
  headers.forEach(h => h.style.display = show ? '' : 'none');
  cells.forEach(c => (c as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 Каталог: ${show ? 'показано' : 'приховано'}`);
}

function updateZarplataVisibility(): void {
  const show = globalCache.settings.showZarplata;
  const headers = findElementsByText('th', 'Зар-та');
  const cells = document.querySelectorAll('td.slyusar-sum-cell, td[data-name="slyusar_sum"]');
  headers.forEach(h => h.style.display = show ? '' : 'none');
  cells.forEach(c => (c as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 Зарплата: ${show ? 'показано' : 'приховано'}`);
}

function updateSMSButtonVisibility(): void {
  // SMS кнопки в актах тепер контролюються через ролеві налаштування (20, 21, 18)
  // і оновлюються через updateActButtonsVisibility()
  // Тут залишаємо тільки для глобальних SMS кнопок (якщо є)
  const show = globalCache.settings.showSMS;
  const btns = document.querySelectorAll('[data-action="send-sms"]:not(#sms-btn), .sms-button:not(#sms-btn)');
  btns.forEach(b => (b as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 Глобальні SMS кнопки: ${show ? 'показано' : 'приховано'}`);
}

async function updateMenuVisibility(): Promise<void> {
  try {
    const { updateUIBasedOnAccess } = await import("../../tablucya/users");
    await updateUIBasedOnAccess(userAccessLevel);
    console.log(`✅ Меню оновлено для ролі: ${userAccessLevel}`);
  } catch (error) {
    console.error("❌ Помилка оновлення меню:", error);
  }
}

/**
 * Оновлює видимість кнопок в акті на основі налаштувань ролі
 */
async function updateActButtonsVisibility(): Promise<void> {
  if (userAccessLevel === "Адміністратор") return; // Адмін бачить все

  try {
    const roleColumn = userAccessLevel;
    if (!roleColumn) return;

    // Отримуємо ВСІ налаштування для ролі
    const { data: settings, error } = await supabase
      .from("settings")
      .select(`setting_id, "${roleColumn}"`);

    if (error || !settings) {
      console.error("❌ Помилка отримання налаштувань кнопок:", error);
      return;
    }

    // Мапа: роль → setting_id → селектор
    const roleButtonMap: Record<string, Record<number, string>> = {
      "Слюсар": {
        1: "[data-zarplata-visible]",   // Зарплата
        2: "[data-price-visible]",      // Ціна та Сума
        3: "#status-lock-btn",          // Закриття акту
        4: "#status-lock-btn",          // Закриття з зауваженнями
        5: "#status-lock-btn",          // Відкриття акту
      },
      "Приймальник": {
        14: "[data-zarplata-visible]",  // Зарплата
        15: "[data-price-visible]",     // Ціна та Сума
        16: "#status-lock-btn",         // Закриття з зауваженнями
        17: "#status-lock-btn",         // Відкриття акту
        18: "#create-act-btn",          // Рахунок і Акт
        19: "#print-act-button",        // PDF
        20: "#sms-btn",                 // SMS
      },
      "Запчастист": {
        14: "[data-zarplata-visible]",  // Зарплата
        15: "[data-price-visible]",     // Ціна та Сума
        16: "#status-lock-btn",         // Закриття акту
        17: "#status-lock-btn",         // Закриття з зауваженнями
        18: "#status-lock-btn",         // Відкриття акту
        19: "#create-act-btn",          // Рахунок і Акт
        20: "#print-act-button",        // PDF
        21: "#sms-btn",                 // SMS
      },
      "Складовщик": {
        11: "[data-zarplata-visible]",  // Зарплата
        12: "[data-price-visible]",     // Ціна та Сума
        13: "#status-lock-btn",         // Закриття акту
        14: "#status-lock-btn",         // Закриття з зауваженнями
        15: "#status-lock-btn",         // Відкриття акту
        16: "#create-act-btn",          // Рахунок і Акт
        17: "#print-act-button",        // PDF
        18: "#sms-btn",                 // SMS
      },
    };

    const buttonMap = roleButtonMap[roleColumn];
    if (!buttonMap) return;

    // Оновлюємо видимість для кожного налаштування
    settings.forEach((row: any) => {
      const settingId = row.setting_id;
      const allowed = !!(row as any)[roleColumn];
      const selector = buttonMap[settingId];
      
      if (!selector) return;
      
      const buttons = document.querySelectorAll(selector);
      if (buttons.length > 0) {
        buttons.forEach(btn => {
          (btn as HTMLElement).style.display = allowed ? '' : 'none';
        });
        console.log(`🔄 Кнопка ${selector}: ${allowed ? 'показано' : 'приховано'} (setting_id=${settingId})`);
      }
    });

    console.log(`✅ Кнопки актів оновлено для ролі ${roleColumn}`);
  } catch (error) {
    console.error("❌ Помилка оновлення кнопок актів:", error);
  }
}

async function updateUIBasedOnSettings(): Promise<void> {
  updatePibMagazinVisibility();
  updateCatalogVisibility();
  updateZarplataVisibility();
  updateSMSButtonVisibility();
  await updateActButtonsVisibility();
  await updateMenuVisibility();
  console.log("🔄 UI оновлено для всіх елементів");
}

async function handleSettingsChange(payload: any): Promise<void> {
  console.log("📡 Settings change:", payload);
  const { eventType, new: newRecord, old: oldRecord } = payload;
  if (eventType !== "UPDATE" && eventType !== "INSERT") return;
  const settingId = newRecord?.setting_id;
  if (!settingId) return;
  
  let changedColumn: string | undefined;
  if (eventType === "UPDATE" && oldRecord) {
    for (const key of Object.keys(newRecord)) {
      if (key !== "setting_id" && newRecord[key] !== oldRecord[key]) {
        changedColumn = key;
        break;
      }
    }
  }
  
  console.log(`🔍 setting_id=${settingId}, колонка="${changedColumn || '?'}", роль="${userAccessLevel}"`);
  
  if (!shouldUpdateForCurrentUser(settingId, changedColumn)) {
    console.log(`ℹ️ Зміна не стосується ролі ${userAccessLevel}`);
    return;
  }
  
  console.log(`✅ Оновлюємо UI для ролі ${userAccessLevel}...`);
  await refreshSettingsCache();
  await updateUIBasedOnSettings();
  
  // 🔐 КРИТИЧНО: Перевіряємо чи користувач ще має доступ до поточної сторінки
  await enforcePageAccess();
  
  showNotification("Налаштування оновлено адміністратором", "info", 3000);
}

export function initializeSettingsSubscription(): void {
  if (settingsChannel) {
    settingsChannel.unsubscribe();
    settingsChannel = null;
  }
  try {
    console.log(`🔌 Підписка на settings для ролі: ${userAccessLevel}`);
    settingsChannel = supabase
      .channel("settings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, handleSettingsChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("✅ Підписка активна");
        else if (status === "CHANNEL_ERROR") console.error("❌ Помилка підписки");
      });
  } catch (error) {
    console.error("❌ Помилка ініціалізації:", error);
  }
}

export function disconnectSettingsSubscription(): void {
  if (settingsChannel) {
    settingsChannel.unsubscribe();
    settingsChannel = null;
  }
}

export function isSettingsSubscriptionActive(): boolean {
  return settingsChannel !== null;
}

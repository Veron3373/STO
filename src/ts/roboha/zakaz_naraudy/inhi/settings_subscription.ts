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
 */
const SETTING_COLUMN_MAP: Record<number, string> = {
  1: "Приймальник",
  2: "data",
  3: "Слюсар",
  4: "Приймальник",
  5: "data",
  6: "Приймальник",
  7: "Приймальник",
  8: "Приймальник",
  9: "Приймальник",
  13: "Складовщик",
  14: "Приймальник",
  15: "Приймальник",
  16: "Запчастист",
  17: "Приймальник",
  18: "Приймальник",
  19: "Запчастист",
  20: "Приймальник",
  21: "Приймальник",
};

/**
 * Мапа колонки в БД → роль користувача
 */
const COLUMN_TO_ROLE: Record<string, string> = {
  "data": "Адміністратор",
  "Приймальник": "Приймальник",
  "Слюсар": "Слюсар",
  "Запчастист": "Запчастист",
  "Складовщик": "Складовщик",
};

function shouldUpdateForCurrentUser(settingId: number, changedColumn?: string): boolean {
  if (userAccessLevel === "Адміністратор") return true;
  if (changedColumn === "data") return true;
  if (changedColumn && COLUMN_TO_ROLE[changedColumn]) {
    return COLUMN_TO_ROLE[changedColumn] === userAccessLevel;
  }
  const targetColumn = SETTING_COLUMN_MAP[settingId];
  if (!targetColumn) return false;
  if (targetColumn === "data") return true;
  return targetColumn === userAccessLevel;
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
  console.log(`🔄 ПІБ/Магазин: ${show ? 'показано' : 'приховано'}, ${headers.length}+${cells.length}`);
}

function updateCatalogVisibility(): void {
  const show = globalCache.settings.showCatalog;
  const headers = findElementsByText('th', 'Каталог');
  const cells = document.querySelectorAll('td.catalog-cell, td[data-name="catalog"]');
  headers.forEach(h => h.style.display = show ? '' : 'none');
  cells.forEach(c => (c as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 Каталог: ${show ? 'показано' : 'приховано'}, ${headers.length}+${cells.length}`);
}

function updateZarplataVisibility(): void {
  const show = globalCache.settings.showZarplata;
  const headers = findElementsByText('th', 'Зар-та');
  const cells = document.querySelectorAll('td.slyusar-sum-cell, td[data-name="slyusar_sum"]');
  headers.forEach(h => h.style.display = show ? '' : 'none');
  cells.forEach(c => (c as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 Зарплата: ${show ? 'показано' : 'приховано'}, ${headers.length}+${cells.length}`);
}

function updateSMSButtonVisibility(): void {
  const show = globalCache.settings.showSMS;
  const btns = document.querySelectorAll('[data-action="send-sms"], .sms-button');
  btns.forEach(b => (b as HTMLElement).style.display = show ? '' : 'none');
  console.log(`🔄 SMS: ${show ? 'показано' : 'приховано'}, ${btns.length}`);
}

async function updateMenuVisibility(): Promise<void> {
  try {
    const { updateUIBasedOnAccess } = await import("../../tablucya/users");
    await updateUIBasedOnAccess(userAccessLevel);
    console.log("✅ Меню оновлено");
  } catch (error) {
    console.error("❌ Помилка оновлення меню:", error);
  }
}

async function updateUIBasedOnSettings(): Promise<void> {
  updatePibMagazinVisibility();
  updateCatalogVisibility();
  updateZarplataVisibility();
  updateSMSButtonVisibility();
  await updateMenuVisibility();
  console.log("🔄 UI оновлено");
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
  console.log(`🔍 setting_id=${settingId}, колонка="${changedColumn || '?'}"`);
  if (!shouldUpdateForCurrentUser(settingId, changedColumn)) {
    console.log(`ℹ️ Не стосується ролі ${userAccessLevel}`);
    return;
  }
  console.log(`✅ Стосується ${userAccessLevel}, оновлюємо...`);
  await refreshSettingsCache();
  await updateUIBasedOnSettings();
  showNotification("Налаштування оновлено адміністратором", "info", 3000);
}

export function initializeSettingsSubscription(): void {
  if (settingsChannel) {
    settingsChannel.unsubscribe();
    settingsChannel = null;
  }
  try {
    console.log("🔌 Підписка на settings...");
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

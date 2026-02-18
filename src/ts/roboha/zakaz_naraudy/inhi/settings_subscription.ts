// src/ts/roboha/zakaz_naraudy/inhi/settings_subscription.ts
/**
 * Real-time підписка на зміни в таблиці settings
 * Автоматично оновлює інтерфейс при зміні налаштувань адміністратором
 * для ВСІХ ролей: Адміністратор, Приймальник, Слюсар, Запчастист, Складовщик
 */

import { supabase } from "../../../vxid/supabaseClient";
import { globalCache } from "../globalCache";
import { showNotification } from "./vspluvauhe_povidomlenna";
import {
  userAccessLevel,
  updateUIBasedOnAccess,
  clearSettingsCache,
} from "../../tablucya/users";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { enforcePageAccess } from "./page_access_guard";
import { refreshActsTable } from "../../tablucya/tablucya";

let settingsChannel: RealtimeChannel | null = null;

/**
 * Перевіряє чи потрібно оновлювати UI для поточного користувача
 */
function shouldUpdateForCurrentUser(
  _settingId: number,
  changedColumn?: string,
): boolean {
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
  } catch (error) {
    console.error("❌ Помилка оновлення settings:", error);
  }
}

function findElementsByText(selector: string, text: string): HTMLElement[] {
  const elements = document.querySelectorAll(selector);
  const found: HTMLElement[] = [];
  elements.forEach((el) => {
    if (el.textContent?.includes(text)) found.push(el as HTMLElement);
  });
  return found;
}

function updatePibMagazinVisibility(): void {
  const show = globalCache.settings.showPibMagazin;
  const headers = findElementsByText("th", "ПІБ _ Магазин");
  const cells = document.querySelectorAll(
    'td.pib-magazin-cell, td[data-name="pib_magazin"]',
  );
  headers.forEach((h) => (h.style.display = show ? "" : "none"));
  cells.forEach((c) => ((c as HTMLElement).style.display = show ? "" : "none"));
}

function updateCatalogVisibility(): void {
  const show = globalCache.settings.showCatalog;
  const headers = findElementsByText("th", "Каталог");
  const cells = document.querySelectorAll(
    'td.catalog-cell, td[data-name="catalog"]',
  );
  headers.forEach((h) => (h.style.display = show ? "" : "none"));
  cells.forEach((c) => ((c as HTMLElement).style.display = show ? "" : "none"));
}

function updateZarplataVisibility(): void {
  const show = globalCache.settings.showZarplata;
  const headers = findElementsByText("th", "Зар-та");
  const cells = document.querySelectorAll(
    'td.slyusar-sum-cell, td[data-name="slyusar_sum"]',
  );
  headers.forEach((h) => (h.style.display = show ? "" : "none"));
  cells.forEach((c) => ((c as HTMLElement).style.display = show ? "" : "none"));
}

function updateSMSButtonVisibility(): void {
  // SMS кнопки в актах тепер контролюються через ролеві налаштування (20, 21, 18)
  // і оновлюються через updateActButtonsVisibility()
  // Тут залишаємо тільки для глобальних SMS кнопок (якщо є)
  const show = globalCache.settings.showSMS;
  const btns = document.querySelectorAll(
    '[data-action="send-sms"]:not(#sms-btn), .sms-button:not(#sms-btn)',
  );
  btns.forEach((b) => ((b as HTMLElement).style.display = show ? "" : "none"));
}

async function updateMenuVisibility(): Promise<void> {
  try {
    // 🔑 КРИТИЧНО: Очищаємо кеш налаштувань перед оновленням меню
    clearSettingsCache();
    await updateUIBasedOnAccess(userAccessLevel);
  } catch (error) {
    console.error("❌ Помилка оновлення меню:", error);
  }
}

/**
 * Оновлює видимість кнопок і колонок в акті на основі налаштувань ролі
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

    // Мапа: роль → setting_id → дія (селектор або функція)
    const roleActionMap: Record<
      string,
      Record<number, { type: "selector" | "column"; value: string }>
    > = {
      Слюсар: {
        1: { type: "column", value: "zarplata" }, // Зарплата колонка
        2: { type: "column", value: "price" }, // Ціна та Сума колонки
        3: { type: "selector", value: "#status-lock-btn" },
        4: { type: "selector", value: "#status-lock-btn" },
        5: { type: "selector", value: "#status-lock-btn" },
      },
      Приймальник: {
        14: { type: "column", value: "zarplata" }, // Зарплата колонка
        15: { type: "column", value: "price" }, // Ціна та Сума колонки
        16: { type: "selector", value: "#status-lock-btn" },
        17: { type: "selector", value: "#status-lock-btn" },
        18: { type: "selector", value: "#create-act-btn" },
        19: { type: "selector", value: "#print-act-button" },
        20: { type: "selector", value: "#sms-btn" },
      },
      Запчастист: {
        14: { type: "column", value: "zarplata" }, // Зарплата колонка
        15: { type: "column", value: "price" }, // Ціна та Сума колонки
        16: { type: "selector", value: "#status-lock-btn" },
        17: { type: "selector", value: "#status-lock-btn" },
        18: { type: "selector", value: "#status-lock-btn" },
        19: { type: "selector", value: "#create-act-btn" },
        20: { type: "selector", value: "#print-act-button" },
        21: { type: "selector", value: "#sms-btn" },
      },
      Складовщик: {
        11: { type: "column", value: "zarplata" }, // Зарплата колонка
        12: { type: "column", value: "price" }, // Ціна та Сума колонки
        13: { type: "selector", value: "#status-lock-btn" },
        14: { type: "selector", value: "#status-lock-btn" },
        15: { type: "selector", value: "#status-lock-btn" },
        16: { type: "selector", value: "#create-act-btn" },
        17: { type: "selector", value: "#print-act-button" },
        18: { type: "selector", value: "#sms-btn" },
      },
    };

    const actionMap = roleActionMap[roleColumn];
    if (!actionMap) return;

    // Оновлюємо видимість для кожного налаштування
    settings.forEach((row: any) => {
      const settingId = row.setting_id;
      const allowed = !!(row as any)[roleColumn];
      const action = actionMap[settingId];

      if (!action) return;

      if (action.type === "selector") {
        // Приховування/показ кнопок
        const buttons = document.querySelectorAll(action.value);
        if (buttons.length > 0) {
          buttons.forEach((btn) => {
            (btn as HTMLElement).style.display = allowed ? "" : "none";
          });
        }
      } else if (action.type === "column") {
        // Приховування/показ колонок
        if (action.value === "zarplata") {
          toggleZarplataColumnVisibility(allowed);
        } else if (action.value === "price") {
          togglePriceColumnsVisibility(allowed);
        }
      }
    });
  } catch (error) {
    console.error("❌ Помилка оновлення кнопок актів:", error);
  }
}

/**
 * Приховує/показує колонку Зарплата в таблиці акту
 */
function toggleZarplataColumnVisibility(show: boolean): void {
  // Заголовки колонки Зар-та
  const headers = document.querySelectorAll("th");
  headers.forEach((h) => {
    if (h.textContent?.includes("Зар-та")) {
      (h as HTMLElement).style.display = show ? "" : "none";
    }
  });

  // Комірки з даними зарплати
  const cells = document.querySelectorAll(
    'td[data-name="slyusar_sum"], td.slyusar-sum-cell',
  );
  cells.forEach((cell) => {
    (cell as HTMLElement).style.display = show ? "" : "none";
  });
}

/**
 * Приховує/показує колонки Ціна та Сума в таблиці акту
 */
function togglePriceColumnsVisibility(show: boolean): void {
  // Заголовки колонок
  const headers = document.querySelectorAll("th");
  headers.forEach((h) => {
    const text = h.textContent?.trim();
    if (text === "Ціна" || text === "Сума") {
      (h as HTMLElement).style.display = show ? "" : "none";
    }
  });

  // Комірки з даними ціни та суми
  const priceCells = document.querySelectorAll(
    'td[data-name="price"], td.price-cell',
  );
  const sumCells = document.querySelectorAll(
    'td[data-name="sum"], td.sum-cell',
  );

  priceCells.forEach((cell) => {
    (cell as HTMLElement).style.display = show ? "" : "none";
  });

  sumCells.forEach((cell) => {
    (cell as HTMLElement).style.display = show ? "" : "none";
  });

  // ✅ Також приховуємо/показуємо футер з сумами
  const sumsFooter = document.querySelector<HTMLElement>(
    ".zakaz_narayd-sums-footer",
  );
  if (sumsFooter) {
    sumsFooter.style.display = show ? "" : "none";
  }

  // ✅ Також оновлюємо стовпець "Сума" в таблиці списку актів
  toggleActsTableSumaColumn(show);
}

/**
 * Приховує/показує стовпець "Сума" в таблиці списку актів (без перезавантаження)
 */
function toggleActsTableSumaColumn(show: boolean): void {
  const actsTable = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (!actsTable) return;

  const displayValue = show ? "" : "none";

  // Знаходимо індекс стовпця "Сума" в заголовку
  const headers = actsTable.querySelectorAll("thead th");
  let sumaColumnIndex = -1;

  headers.forEach((th, index) => {
    if (th.textContent?.trim() === "Сума") {
      sumaColumnIndex = index;
      (th as HTMLElement).style.display = displayValue;
    }
  });

  // Якщо стовпець "Сума" не існує і потрібно показати - перезавантажуємо таблицю
  if (sumaColumnIndex === -1 && show) {
    refreshActsTable().catch((err) =>
      console.error("Помилка оновлення таблиці:", err),
    );
    return;
  }

  // Якщо стовпець існує - приховуємо/показуємо комірки в рядках
  if (sumaColumnIndex !== -1) {
    const rows = actsTable.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells[sumaColumnIndex]) {
        (cells[sumaColumnIndex] as HTMLElement).style.display = displayValue;
      }
    });
  }
}

async function updateUIBasedOnSettings(): Promise<void> {
  updatePibMagazinVisibility();
  updateCatalogVisibility();
  updateZarplataVisibility();
  updateSMSButtonVisibility();
  await updateActButtonsVisibility();
  await updateMenuVisibility();
}

async function handleSettingsChange(payload: any): Promise<void> {
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

  if (!shouldUpdateForCurrentUser(settingId, changedColumn)) {
    return;
  }

  await refreshSettingsCache();
  await updateUIBasedOnSettings();

  // 🔐 КРИТИЧНО: Перевіряємо чи користувач ще має доступ до поточної сторінки
  await enforcePageAccess();

  showNotification("Налаштування оновлено адміністратором", "info", 3000);
}

let settingsErrorLogged = false;
let settingsRetryCount = 0;
const MAX_SETTINGS_RETRIES = 5;

export function initializeSettingsSubscription(): void {
  if (settingsChannel) {
    settingsChannel.unsubscribe();
    settingsChannel = null;
  }
  settingsErrorLogged = false;
  settingsRetryCount = 0;

  try {
    settingsChannel = supabase
      .channel("settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        handleSettingsChange,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          settingsErrorLogged = false;
          settingsRetryCount = 0;
        } else if (status === "CHANNEL_ERROR") {
          settingsRetryCount++;
          if (!settingsErrorLogged) {
            console.warn(
              "⚠️ Помилка підписки settings. Спроба перепідключення...",
            );
            settingsErrorLogged = true;
          }
          if (settingsRetryCount >= MAX_SETTINGS_RETRIES) {
            console.error(
              "❌ Не вдалось підключитись до settings після",
              MAX_SETTINGS_RETRIES,
              "спроб",
            );
            settingsChannel?.unsubscribe();
          }
        }
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

/**
 * Експортуємо функції для використання в інших модулях
 */
export { updateActButtonsVisibility, updateUIBasedOnSettings };

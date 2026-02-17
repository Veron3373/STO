// ===== ФАЙЛ: src/ts/roboha/tablucya/tablucya.ts =====

import { supabase } from "../../vxid/supabaseClient";
import { showModal } from "../zakaz_naraudy/modalMain";
import {
  globalCache,
  loadGeneralSettingsFromDB,
  loadGeneralSettingsFromLocalStorage,
  isGeneralSettingsLoadedThisSession,
  markGeneralSettingsAsLoaded,
} from "../zakaz_naraudy/globalCache";
import {
  showLoginModalBeforeTable,
  isUserAuthenticated,
  userAccessLevel,
  userName as currentUserName,
  logoutFromSystemAndRedirect,
  canUserViewActs,
  canUserOpenActs,
  getSavedUserDataFromLocalStorage, // ✅ Додано для фільтрації по приймальнику
  canUserSeePriceColumns, // ✅ Додано для приховування стовпця "Сума"
} from "./users";

// 👇 ІМПОРТ НОВОЇ ФУНКЦІЇ ПОВІДОМЛЕНЬ
import {
  showRealtimeActNotification,
  removeNotificationsForAct,
  loadAndShowExistingNotifications,
} from "./povidomlennya_tablucya";

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement | null;
  if (target && target.closest("#logout-link")) {
    e.preventDefault();
    logoutFromSystemAndRedirect();
  }
});

// 📞 Глобальний обробник кліків на індикатор дзвінка
document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const callIndicator = target.closest(".call-indicator") as HTMLElement | null;
  if (!callIndicator) return;

  e.stopPropagation(); // Не відкривати модалку акту
  e.preventDefault();

  const actId = callIndicator.dataset.actId;
  if (!actId) return;

  await handleCallIndicatorClick(Number(actId), callIndicator);
});

/**
 * 📞 Форматує поточний час та дату для дзвінка
 * Формат: HH:MM DD.MM.YY
 */
function formatCallDateTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear().toString().slice(-2);
  return `${hours}:${minutes} ${day}.${month}.${year}`;
}

/**
 * 📞 Обробник кліку на індикатор дзвінка
 * ⏳ -> 📞 (взяв) -> 📵 (не взяв) -> 📞 -> ...
 */
async function handleCallIndicatorClick(
  actId: number,
  indicator: HTMLElement,
): Promise<void> {
  const currentText = indicator.textContent?.trim() || "";
  let newCallValue = "";

  if (currentText === "⏳" || currentText === "") {
    // Перший клік - записуємо 📞 (взяв слухавку)
    newCallValue = `📞 ${formatCallDateTime()}`;
  } else if (currentText.startsWith("📞")) {
    // Був "взяв" - міняємо на "не взяв" 📵
    newCallValue = `📵 ${formatCallDateTime()}`;
  } else if (currentText.startsWith("📵")) {
    // Був "не взяв" - міняємо назад на "взяв" 📞
    newCallValue = `📞 ${formatCallDateTime()}`;
  } else {
    // Щось інше - ставимо 📞
    newCallValue = `📞 ${formatCallDateTime()}`;
  }

  // Показуємо нове значення одразу
  indicator.textContent = newCallValue;
  indicator.classList.remove("call-indicator-hover");
  indicator.classList.add("call-indicator-result");
  indicator.style.opacity = "1";

  // Зберігаємо в базу даних
  await saveCallToDatabase(actId, newCallValue);
}

/**
 * 📞 Зберігає запис про дзвінок в базу даних (в поле info акту)
 */
async function saveCallToDatabase(
  actId: number,
  callValue: string,
): Promise<void> {
  try {
    // Отримуємо поточні дані акту
    const { data: act, error: fetchError } = await supabase
      .from("acts")
      .select("info")
      .eq("act_id", actId)
      .single();

    if (fetchError) {
      console.error("📞 Помилка отримання акту:", fetchError);
      return;
    }

    // Парсимо info
    let actInfo = safeParseJSON(act?.info) || {};

    // Записуємо дзвінок
    actInfo["Дзвінок"] = callValue;

    // Оновлюємо в базі
    const { error: updateError } = await supabase
      .from("acts")
      .update({ info: JSON.stringify(actInfo) })
      .eq("act_id", actId);

    if (updateError) {
      console.error("📞 Помилка збереження дзвінка:", updateError);
    }
  } catch (err) {
    console.error("📞 Критична помилка збереження дзвінка:", err);
  }
}

// =============================================================================
// ГЛОБАЛЬНІ ЗМІННІ
// =============================================================================

let actsGlobal: any[] = [];
let clientsGlobal: any[] = [];
let carsGlobal: any[] = [];
// Зберігаємо ID змінених актів
let modifiedActIdsGlobal: Set<number> = new Set();
// Зберігаємо кількість повідомлень для кожного акту
let actNotificationCounts: Map<number, number> = new Map();
let sortByDateStep = 0;

// ✏️ Глобальна мапа: actId -> ПІБ редактора (для показу хто редагує акт)
let actEditorsMap: Map<number, string> = new Map();
// Канал для відстеження присутності в актах
let globalPresenceChannel: any = null;

// ⏰ Максимальний час "життя" присутності (30 хвилин - повинен співпадати з actPresence.ts)
// Heartbeat в actPresence.ts оновлює присутність кожні 5 хвилин
const PRESENCE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * 🧹 Перевіряє чи присутність "застаріла" (старше PRESENCE_MAX_AGE_MS)
 */
function isPresenceStale(openedAt: string): boolean {
  const openedTime = new Date(openedAt).getTime();
  const now = Date.now();
  return now - openedTime > PRESENCE_MAX_AGE_MS;
}

/**
 * ✏️ Отримує ім'я редактора для акту з глобальної мапи присутності
 * @param actId - ID акту
 * @returns Ім'я редактора або null якщо ніхто не редагує
 */
export function getActEditorFromPresence(actId: number): string | null {
  return actEditorsMap.get(actId) || null;
}

// =============================================================================
// УТИЛІТИ
// =============================================================================

function safeParseJSON(data: any): any {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function formatDate(date: Date): string {
  return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}.${date.getFullYear()}`;
}

function formatDateTime(date: Date): { date: string; time: string } {
  const dateStr = formatDate(date);
  const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  return { date: dateStr, time: timeStr };
}

function convertISOtoShortDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(-2);
    return `${day}.${month}.${year}`;
  } catch {
    return null;
  }
}

function validateDateFormat(dateStr: string): boolean {
  const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
  if (!dateRegex.test(dateStr)) return false;
  const [d, m, y] = dateStr.split(".");
  const day = parseInt(d);
  const month = parseInt(m);
  const year = parseInt(y);
  return (
    day >= 1 &&
    day <= 31 &&
    month >= 1 &&
    month <= 12 &&
    year >= 2000 &&
    year <= 2100
  );
}

// =============================================================================
// ЛОГІКА REALTIME ТА СПОВІЩЕНЬ
// =============================================================================

/**
 * 1. Завантажує існуючі сповіщення при старті (щоб підсвітити те, що вже є)
 */
async function fetchModifiedActIds(): Promise<Set<number>> {
  // ✅ Для Адміністратора - всі повідомлення
  if (userAccessLevel === "Адміністратор") {
    const { data, error } = await supabase
      .from("act_changes_notifications")
      .select("act_id")
      .eq("delit", false); // ✅ тільки "не видалені" нотифікації

    if (error) {
      console.error("❌ Помилка завантаження сповіщень:", error);
      return new Set();
    }

    const ids = new Set((data || []).map((item) => Number(item.act_id)));
    return ids;
  }

  // ✅ Для Приймальника - фільтруємо по pruimalnyk
  if (userAccessLevel === "Приймальник") {
    const userData = getSavedUserDataFromLocalStorage?.();
    const currentUserName = userData?.name;

    if (!currentUserName) {
      console.warn("⚠️ Не вдалося отримати ПІБ поточного користувача");
      return new Set();
    }

    const { data, error } = await supabase
      .from("act_changes_notifications")
      .select("act_id")
      .eq("delit", false)
      .eq("pruimalnyk", currentUserName); // ✅ Фільтр по приймальнику

    if (error) {
      console.error("❌ Помилка завантаження сповіщень:", error);
      return new Set();
    }

    const ids = new Set((data || []).map((item) => Number(item.act_id)));
    return ids;
  }

  // ✅ Для інших ролей - немає повідомлень
  return new Set();
}

/**
 * Завантажує кількість повідомлень для кожного акту
 */
async function fetchActNotificationCounts(): Promise<Map<number, number>> {
  const counts = new Map<number, number>();

  // ✅ Для Адміністратора - всі повідомлення
  if (userAccessLevel === "Адміністратор") {
    const { data, error } = await supabase
      .from("act_changes_notifications")
      .select("act_id")
      .eq("delit", false);

    if (error) {
      console.error("❌ Помилка завантаження кількості повідомлень:", error);
      return counts;
    }

    // Підраховуємо кількість для кожного акту
    (data || []).forEach((item) => {
      const actId = Number(item.act_id);
      counts.set(actId, (counts.get(actId) || 0) + 1);
    });

    return counts;
  }

  // ✅ Для Приймальника - фільтруємо по pruimalnyk
  if (userAccessLevel === "Приймальник") {
    const userData = getSavedUserDataFromLocalStorage?.();
    const currentUserName = userData?.name;

    if (!currentUserName) {
      console.warn("⚠️ Не вдалося отримати ПІБ поточного користувача");
      return counts;
    }

    const { data, error } = await supabase
      .from("act_changes_notifications")
      .select("act_id")
      .eq("delit", false)
      .eq("pruimalnyk", currentUserName);

    if (error) {
      console.error("❌ Помилка завантаження кількості повідомлень:", error);
      return counts;
    }

    // Підраховуємо кількість для кожного акту
    (data || []).forEach((item) => {
      const actId = Number(item.act_id);
      counts.set(actId, (counts.get(actId) || 0) + 1);
    });

    return counts;
  }

  // ✅ Для інших ролей - немає повідомлень
  return counts;
}

/**
 * 2. Підписується на нові сповіщення (PUSH) без перезавантаження таблиці
 */
function subscribeToActNotifications() {
  // ✅ Підписка для Адміністратора та Приймальника
  if (userAccessLevel !== "Адміністратор" && userAccessLevel !== "Приймальник")
    return;

  // ✅ Отримуємо ПІБ поточного користувача для фільтрації
  const userData = getSavedUserDataFromLocalStorage?.();
  const currentUserName = userData?.name;

  supabase
    .channel("act-notifications-channel")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "act_changes_notifications",
      },
      (payload) => {
        const newNotification = payload.new;

        if (newNotification && newNotification.act_id) {
          // ✅ ФІЛЬТРАЦІЯ ДЛЯ ПРИЙМАЛЬНИКА
          if (userAccessLevel === "Приймальник") {
            const notificationPruimalnyk = newNotification.pruimalnyk;

            if (notificationPruimalnyk !== currentUserName) {
              return; // Пропускаємо
            }
          }

          const actId = Number(newNotification.act_id);

          // 1. Додаємо ID в локальний сет для підсвітки
          modifiedActIdsGlobal.add(actId);

          // 2. Оновлюємо лічильник повідомлень
          const currentCount = actNotificationCounts.get(actId) || 0;
          actNotificationCounts.set(actId, currentCount + 1);
          updateNotificationBadgeInDom(actId, currentCount + 1);

          // 3. Миттєво підсвічуємо рядок в DOM (синя ручка)
          highlightRowInDom(actId);

          // 4. 👇 ПОКАЗУЄМО КРАСИВЕ ПОВІДОМЛЕННЯ ВНИЗУ СПРАВА 👇
          showRealtimeActNotification({
            act_id: actId,
            notification_id: newNotification.notification_id,
            changed_by_surname: newNotification.changed_by_surname,
            item_name: newNotification.item_name,
            dodav_vudaluv: newNotification.dodav_vudaluv,
            created_at: newNotification.data || newNotification.created_at, // поле timestamp з БД
            pib: newNotification.pib, // ✅ ПІБ клієнта
            auto: newNotification.auto, // ✅ Автомобіль
            pruimalnyk: newNotification.pruimalnyk, // ✅ Приймальник
          });
        }
      },
    )
    .subscribe();

  // 📢 ПІДПИСКА НА ПОВІДОМЛЕННЯ ПРО ЗАВЕРШЕННЯ РОБІТ СЛЮСАРЕМ
  subscribeToSlusarNotifications();
}

/**
 * 📢 Підписка на нові повідомлення про завершення робіт Слюсарем (slusarsOn)
 * Оновлює жовте фарбування рядків в реальному часі
 */
function subscribeToSlusarNotifications() {
  // ✅ Підписка для Адміністратора, Приймальника та Слюсаря
  if (
    userAccessLevel !== "Адміністратор" &&
    userAccessLevel !== "Приймальник" &&
    userAccessLevel !== "Слюсар"
  )
    return;

  const userData = getSavedUserDataFromLocalStorage?.();
  const currentUserName = userData?.name;

  // 🔥 ПІДПИСКА БЕЗПОСЕРЕДНЬО НА ЗМІНИ В ТАБЛИЦІ acts
  supabase
    .channel("slusarsOn-realtime-channel")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "acts",
      },
      (payload) => {
        const updatedAct = payload.new;
        if (!updatedAct || updatedAct.act_id === undefined) {
          return;
        }

        const actId = Number(updatedAct.act_id);
        const newSlusarsOn = updatedAct.slusarsOn === true;
        const isClosed = !!updatedAct.date_off;
        const pruimalnyk = updatedAct.pruimalnyk;

        // ✅ ФІЛЬТРАЦІЯ ДЛЯ ПРИЙМАЛЬНИКА
        if (userAccessLevel === "Приймальник") {
          if (pruimalnyk !== currentUserName) {
            return;
          }
        }

        // 🎨 МИТТЄВЕ ОНОВЛЕННЯ КЛАСУ РЯДКА
        updateSlusarsOnRowInDom(actId, newSlusarsOn, isClosed, pruimalnyk);

        // 📢 Показуємо сповіщення
        if (newSlusarsOn && !isClosed) {
          const message = `✅ Роботи завершено в акті №${actId}`;
          if (typeof (window as any).showNotification === "function") {
            (window as any).showNotification(message, "success", 3000);
          }
        }
      },
    )
    .subscribe(() => {});
}

/**
 * ✏️ Підписка на глобальний канал присутності для відстеження хто редагує які акти
 * Показує ПІБ редактора в комірці клієнта
 */
function subscribeToGlobalActPresence() {
  // Відписуємося від попереднього каналу, якщо він існує
  if (globalPresenceChannel) {
    try {
      supabase.removeChannel(globalPresenceChannel);
    } catch (err) {
      console.warn(
        "⚠️ [subscribeToGlobalActPresence] Помилка при видаленні каналу:",
        err,
      );
    } finally {
      globalPresenceChannel = null;
    }
  }

  // Створюємо канал для ВСІХ актів
  globalPresenceChannel = supabase.channel("global_acts_presence", {
    config: {
      presence: {
        key: currentUserName || "Unknown",
      },
    },
  });

  // Функція для оновлення списку редакторів
  const handlePresenceSync = () => {
    // Перевіряємо, чи канал ще існує
    if (!globalPresenceChannel) {
      return;
    }

    const state = globalPresenceChannel.presenceState();

    // Очищаємо попередню мапу редакторів
    const newEditorsMap = new Map<number, string>();

    // Перебираємо всіх користувачів у стані
    Object.keys(state).forEach((key) => {
      const presences = state[key] as any[];
      if (presences && presences.length > 0) {
        presences.forEach((p) => {
          if (p.actId && p.userName) {
            // 🧹 Ігноруємо "застарілі" присутності (старше 8 годин)
            if (p.openedAt && isPresenceStale(p.openedAt)) {
              return;
            }
            // Зберігаємо тільки якщо це НЕ поточний користувач
            if (p.userName !== currentUserName) {
              newEditorsMap.set(p.actId, p.userName);
            }
          }
        });
      }
    });

    // Порівнюємо зі старою мапою та оновлюємо DOM
    const allActIds = new Set([
      ...actEditorsMap.keys(),
      ...newEditorsMap.keys(),
    ]);

    allActIds.forEach((actId) => {
      const oldEditor = actEditorsMap.get(actId);
      const newEditor = newEditorsMap.get(actId);

      if (oldEditor !== newEditor) {
        // Оновлюємо DOM для цього акту
        updateEditorInfoInDom(actId, newEditor || null);
      }
    });

    // Оновлюємо глобальну мапу
    actEditorsMap = newEditorsMap;
  };

  // Підписуємося на події присутності
  globalPresenceChannel
    .on("presence", { event: "sync" }, handlePresenceSync)
    .on("presence", { event: "join" }, () => {})
    .on("presence", { event: "leave" }, () => {})
    .subscribe(() => {});
}

/**
 * ✏️ Оновлює інформацію про редактора в DOM для конкретного акту
 */
function updateEditorInfoInDom(actId: number, editorName: string | null): void {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (!table) return;

  const rows = table.querySelectorAll("tbody tr");

  rows.forEach((row) => {
    const firstCell = row.querySelector("td");
    if (!firstCell) return;

    const cellActId = getActIdFromCell(firstCell);
    if (cellActId !== actId) return;

    // Знаходимо комірку клієнта (3-я комірка)
    const clientCell = row.querySelectorAll("td")[2];
    if (!clientCell) return;

    // Знаходимо span для редактора
    let editorSpan = clientCell.querySelector(
      ".act-editor-info",
    ) as HTMLElement;

    if (editorName) {
      // Показуємо інформацію про редактора
      if (editorSpan) {
        editorSpan.innerHTML = `✏️ ${editorName}`;
        editorSpan.style.display = "inline";
      }
    } else {
      // Приховуємо інформацію про редактора
      if (editorSpan) {
        editorSpan.style.display = "none";
      }
    }
  });
}

/**
 * 🎨 Миттєво оновлює жовте фарбування рядка в таблиці
 */
function updateSlusarsOnRowInDom(
  actId: number,
  slusarsOn: boolean,
  isClosed: boolean,
  pruimalnyk?: string,
): void {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (!table) {
    // Таблиця може бути недоступна (модальне вікно відкрито, сторінка у процесі завантаження)
    // Це нормально - просто пропускаємо оновлення
    return;
  }

  const userData = getSavedUserDataFromLocalStorage?.();
  const currentUserName = userData?.name;

  const rows = table.querySelectorAll("tbody tr");

  rows.forEach((row) => {
    // Шукаємо act_id в data-атрибуті або в першій клітинці
    const rowActId = row.getAttribute("data-act-id");

    if (!rowActId) {
      // Якщо немає data-act-id, шукаємо в першій клітинці з 🔒
      const firstCell = row.querySelector("td");
      if (firstCell) {
        const cellText = firstCell.textContent || "";
        // Витягуємо число (може бути "🔒 452" або просто "452")
        const match = cellText.match(/\d+/);
        if (match) {
          const cellActId = parseInt(match[0]);
          if (cellActId === actId) {
            applyClassToRow(
              row,
              slusarsOn,
              isClosed,
              pruimalnyk,
              currentUserName,
              actId,
            );
          }
        }
      }
    } else if (parseInt(rowActId) === actId) {
      applyClassToRow(
        row,
        slusarsOn,
        isClosed,
        pruimalnyk,
        currentUserName,
        actId,
      );
    }
  });

  // Якщо рядок не знайдено - це нормально, просто пропускаємо
  // (таблиця може бути в процесі оновлення)
}

/**
 * Застосовує клас до рядка
 */
function applyClassToRow(
  row: Element,
  slusarsOn: boolean,
  isClosed: boolean,
  pruimalnyk: string | undefined,
  currentUserName: string | undefined,
  _actId: number,
): void {
  const shouldShowSlusarsOn =
    slusarsOn &&
    !isClosed &&
    (userAccessLevel === "Адміністратор" ||
      userAccessLevel === "Слюсар" ||
      (userAccessLevel === "Приймальник" && pruimalnyk === currentUserName));

  if (shouldShowSlusarsOn) {
    row.classList.add("row-slusar-on");
  } else {
    row.classList.remove("row-slusar-on");
  }
}

/**
 * Знаходить рядок в таблиці і додає клас підсвітки (Синя ручка)
 */
/**
 * Отримує ID акту з комірки, надійно ігноруючи бейдж
 */
function getActIdFromCell(cell: HTMLElement): number {
  // Спробуємо знайти div, який НЕ є бейджем (це зазвичай div з номером і ключем)
  const contentDiv = cell.querySelector("div:not(.notification-count-badge)");

  if (contentDiv && contentDiv.textContent) {
    return parseInt(contentDiv.textContent.replace(/\D/g, ""));
  }

  // Резервний варіант: клонування і очищення (якщо структура інша)
  const clone = cell.cloneNode(true) as HTMLElement;
  const badge = clone.querySelector(".notification-count-badge");
  if (badge) badge.remove();

  const cellText = clone.textContent || "";
  return parseInt(cellText.replace(/\D/g, ""));
}

/**
 * Знаходить рядок в таблиці і додає клас підсвітки (Синя ручка)
 */
function highlightRowInDom(actId: number) {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (!table) {
    console.warn(`⚠️ [highlightRowInDom] Таблиця не знайдена`);
    return;
  }

  const rows = table.querySelectorAll("tbody tr");

  let found = false;
  rows.forEach((row, index) => {
    const firstCell = row.querySelector("td");
    if (firstCell) {
      // ✅ ВИПРАВЛЕНО: Використовуємо нову функцію для отримання ID
      const cellActId = getActIdFromCell(firstCell);

      // Детальний лог для кожного рядка (перші 5)
      if (index < 5) {
      }

      if (cellActId === actId) {
        row.classList.add("act-modified-blue-pen");
        found = true;
      }
    }
  });

  if (!found) {
    console.warn(`❌ [highlightRowInDom] Рядок для акту #${actId} НЕ ЗНАЙДЕНО`);
  }
}

/**
 * Оновлює бейдж з кількістю повідомлень в комірці з номером акту
 */
export function updateNotificationBadgeInDom(actId: number, count: number) {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (!table) {
    console.warn(`⚠️ [updateBadge] Таблиця не знайдена`);
    return;
  }

  const rows = table.querySelectorAll("tbody tr");
  let found = false;

  rows.forEach((row) => {
    const firstCell = row.querySelector("td") as HTMLTableCellElement;
    if (firstCell) {
      // ✅ ВИПРАВЛЕНО: Використовуємо нову функцію для отримання ID
      const cellActId = getActIdFromCell(firstCell);

      if (cellActId === actId) {
        found = true;

        // Шукаємо існуючий бейдж
        let badge = firstCell.querySelector(
          ".notification-count-badge",
        ) as HTMLElement;

        if (count > 0) {
          // Якщо бейджа немає - створюємо
          if (!badge) {
            badge = document.createElement("div");
            badge.className = "notification-count-badge";
            firstCell.style.position = "relative";
            firstCell.appendChild(badge);
          } else {
          }
          badge.textContent = count.toString();
          badge.style.display = "flex";
        } else {
          // Якщо кількість 0 - ховаємо бейдж
          if (badge) {
            badge.style.display = "none";
          }
        }
      }
    }
  });

  if (!found) {
    console.warn(`❌ [updateBadge] Рядок для акту #${actId} НЕ ЗНАЙДЕНО`);
  }
}

/**
 * Зменшує лічильник повідомлень для акту на 1
 */
export function decrementNotificationCount(actId: number) {
  const currentCount = actNotificationCounts.get(actId) || 0;
  const newCount = Math.max(0, currentCount - 1);
  actNotificationCounts.set(actId, newCount);
  updateNotificationBadgeInDom(actId, newCount);
}

/**
 * 3. Очищає ВІЗУАЛЬНУ підсвітку в таблиці, АЛЕ НЕ ВИДАЛЯЄ З БАЗИ.
 * @param actId - ID акту
 * @param removeToasts - чи видаляти тости (за замовчуванням false)
 */
export async function clearNotificationVisualOnly(
  actId: number,
  removeToasts: boolean = false,
) {
  // ✅ Працює для Адміністратора та Приймальника
  if (userAccessLevel !== "Адміністратор" && userAccessLevel !== "Приймальник")
    return;

  // Видаляємо з сету (якщо є)
  modifiedActIdsGlobal.delete(actId);

  // Скидаємо лічильник повідомлень (ЗАВЖДИ, навіть якщо не було в сеті)
  actNotificationCounts.set(actId, 0);
  updateNotificationBadgeInDom(actId, 0);

  // Знімаємо синю підсвітку (ЗАВЖДИ)
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (table) {
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const firstCell = row.querySelector("td");
      if (firstCell) {
        // ✅ ВИПРАВЛЕНО: Використовуємо нову функцію для отримання ID
        const cellActId = getActIdFromCell(firstCell);

        if (cellActId === actId) {
          row.classList.remove("act-modified-blue-pen");
        }
      }
    });
  }

  // Видаляємо повідомлення з UI тільки якщо явно вказано
  if (removeToasts) {
    removeNotificationsForAct(actId);
  }
}

// =============================================================================
// ОБРОБКА ДАНИХ АКТІВ
// =============================================================================

function getClientInfo(
  act: any,
  clients: any[],
): { pib: string; phone: string } {
  const client = clients?.find((c) => c.client_id === act.client_id);
  const clientData = safeParseJSON(client?.data);
  const pib = clientData?.["ПІБ"] || "Невідомо";
  let phone = clientData?.["Телефон"] || "";
  phone = phone.replace(/[\(\)\-\s]/g, "");
  return { pib, phone };
}

function getCarInfo(act: any, cars: any[]): { number: string; name: string } {
  const car = cars?.find((c) => c.cars_id === act.cars_id);
  const carData = safeParseJSON(car?.data);
  const number = carData?.["Номер авто"] || "";
  const name = carData?.["Авто"] || "";
  return { number, name };
}

function getActAmount(act: any): number {
  const actData = safeParseJSON(act.info || act.data || act.details);
  const rawAmount =
    actData?.["Загальна сума"] ||
    actData?.["total"] ||
    actData?.["amount"] ||
    act.total ||
    act.amount;
  const num = Number(rawAmount);
  return isNaN(num) ? 0 : num;
}

// Отримуємо відсоток знижки з акту
function getActDiscount(act: any): number {
  const actData = safeParseJSON(act.info || act.data || act.details);
  const discount = Number(actData?.["Знижка"]) || 0;
  return discount;
}

// Отримуємо повну суму ДО знижки (За деталі + За роботу)
function getActFullAmount(act: any): number {
  const actData = safeParseJSON(act.info || act.data || act.details);
  const detailsSum = Number(actData?.["За деталі"]) || 0;
  const workSum = Number(actData?.["За роботу"]) || 0;
  return detailsSum + workSum;
}

function getActDateAsDate(act: any): Date | null {
  if (!act.date_on) return null;
  return new Date(act.date_on);
}

function isActClosed(act: any): boolean {
  return act.date_off && !isNaN(Date.parse(act.date_off));
}

// =============================================================================
// РЕНДЕРИНГ ТАБЛИЦІ (СТВОРЕННЯ КОМІРОК)
// =============================================================================

function createClientCell(
  clientInfo: { pib: string; phone: string },
  actId: number,
  act: any,
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.style.position = "relative"; // Для позиціонування індикатора примітки
  const phones = clientInfo.phone ? [clientInfo.phone] : [];
  let pibOnly = clientInfo.pib;

  // 📞 Отримуємо дані про попередні дзвінки
  const actData = safeParseJSON(act.info || act.data || act.details);
  const callData = actData?.["Дзвінок"] || "";

  // Визначаємо HTML для індикатора дзвінка
  let callIndicatorHtml = "";
  if (callData) {
    // Якщо є запис дзвінка - показуємо його
    callIndicatorHtml = `<span class="call-indicator call-indicator-result" data-act-id="${actId}" style="position: absolute; left: 0; top: 0; font-size: 0.85em; cursor: pointer; transition: opacity 0.2s; z-index: 10; white-space: nowrap;">${callData}</span>`;
  } else {
    // Якщо дзвінка ще не було - показуємо ⏳ при наведенні
    callIndicatorHtml = `<span class="call-indicator call-indicator-hover" data-act-id="${actId}" style="position: absolute; left: 0; top: 0; font-size: 0.85em; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10;">⏳</span>`;
  }

  // Додаємо ПІБ з індикатором дзвінка
  td.innerHTML = `<div style="position: relative;"><div>${pibOnly}</div>${callIndicatorHtml}</div>`;

  // 📝 Отримуємо примітки акту (actData вже оголошена вище)
  const actNotes = actData?.["Примітки"];
  if (actNotes && actNotes !== "—" && actNotes.trim() !== "") {
    td.innerHTML += `<div class="act-note-indicator">${actNotes}</div>`;
  }

  let smsHtml = "";
  // Формуємо HTML для SMS, якщо є
  if (act && act.sms) {
    try {
      const dateString = String(act.sms).replace(" ", "T");
      const smsDate = new Date(dateString);

      if (!isNaN(smsDate.getTime())) {
        const { date, time } = formatDateTime(smsDate);
        // Колір #0400ff
        const timeHtml = `<span style="color: #0400ff; font-size: 0.85em; font-weight: bold;">${time}</span>`;
        const dateHtml = `<span style="font-size: 0.85em; color: #555;">${date}</span>`;

        smsHtml = `<div style="font-size: 0.9em; line-height: 1.2; white-space: nowrap;">📨 ${timeHtml} / ${dateHtml}</div>`;
      }
    } catch (e) {
      console.warn(`Error parsing SMS date for act ${actId}:`, e);
    }
  }

  // ✏️ Отримуємо інформацію про редактора
  const editorName = actEditorsMap.get(actId);
  const editorHtml = editorName
    ? `<span class="act-editor-info">✏️ ${editorName}</span>`
    : `<span class="act-editor-info" style="display: none;"></span>`;

  // Виводимо телефони і SMS
  if (phones.length > 0) {
    phones.forEach((p) => {
      if (smsHtml) {
        // Для збереження центрування телефону використовуємо position: relative
        td.innerHTML += `
           <div style="position: relative; width: 100%; margin-top: 4px; min-height: 1.2em;">
             <div style="position: absolute; left: 0; top: 0; white-space: nowrap;">${smsHtml}</div>
             <div class="phone-blue-italic" style="text-align: center; width: 100%;">${p}</div>
           </div>`;
        // Очищаємо smsHtml щоб не дублювати
        smsHtml = "";
      } else {
        // ✏️ Телефон і редактор на одній лінії
        td.innerHTML += `<div class="phone-editor-row"><span class="phone-blue-italic">${p}</span>${editorHtml}</div>`;
      }
    });
  } else if (smsHtml) {
    // Якщо телефонів немає, але є SMS
    td.innerHTML += `<div style="margin-top: 4px; text-align: left;">${smsHtml}</div>`;
  }

  td.addEventListener("click", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId, true);
      showModal(actId, "client");
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function createCarCell(
  carInfo: { number: string; name: string },
  actId: number,
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.innerHTML = `<div style="word-wrap: break-word; word-break: break-word; white-space: normal;">${carInfo.name}</div>`;
  if (carInfo.number) {
    td.innerHTML += `<div style="color: #ff8800; font-size: 0.9em; word-wrap: break-word; word-break: break-word; white-space: normal;">${carInfo.number}</div>`;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId, true);
      showModal(actId, "other");
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function formatShortDateTime(date: Date): { date: string; time: string } {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return { date: `${day}.${month}.${year}`, time: `${hours}:${minutes}` };
}

function createDateCell(act: any, actId: number): HTMLTableCellElement {
  const td = document.createElement("td");
  const actDateOn = act.date_on ? new Date(act.date_on) : null;
  const actDateOff = act.date_off ? new Date(act.date_off) : null;

  if (actDateOn && actDateOff) {
    // Обидві дати: date_on / date_off
    const on = formatShortDateTime(actDateOn);
    const off = formatShortDateTime(actDateOff);
    td.innerHTML = `
      <div style="display: flex; justify-content: space-around; align-items: center; gap: 4px;">
        <div style="text-align: center;">
          <div style="font-size: 0.9em;">${on.date}</div>
          <div style="color: #0400ff; font-size: 0.75em;">${on.time}</div>
        </div>
        <div style="font-size: 0.85em; color: #666;">/</div>
        <div style="text-align: center;">
          <div style="font-size: 0.9em;">${off.date}</div>
          <div style="color: #8B0000; font-size: 0.75em;">${off.time}</div>
        </div>
      </div>`;
  } else if (actDateOn) {
    // Тільки date_on
    const on = formatShortDateTime(actDateOn);
    td.innerHTML = `<div>${on.date}</div><div style="color: #0400ff; font-size: 0.85em;">${on.time}</div>`;
  } else {
    td.innerHTML = `<div>-</div>`;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId, true);
      showModal(actId, "other");
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

// Створюємо комірку для суми з відображенням знижки
function createSumCell(act: any, actId: number): HTMLTableCellElement {
  const td = document.createElement("td");
  td.classList.add("act-table-cell", "act-sum-cell");

  const discountPercent = getActDiscount(act); // Відсоток знижки
  const fullAmount = getActFullAmount(act); // Повна сума ДО знижки (За деталі + За роботу)

  if (discountPercent > 0 && fullAmount > 0) {
    // Обчислюємо суму після знижки: 315 - 10% = 284
    const discountedAmount = Math.round(
      fullAmount * (1 - discountPercent / 100),
    );

    // Є знижка - показуємо в два рядки
    // Верхній: повна сума (315) з відсотком (-10%)
    // Нижній: сума після знижки (284 грн)
    td.innerHTML = `
      <div class="sum-full-price">
        ${fullAmount.toLocaleString("uk-UA")}<sup class="discount-percent">-${discountPercent}%</sup>
      </div>
      <div class="sum-discounted-price">${discountedAmount.toLocaleString("uk-UA")} грн</div>
    `;
  } else {
    // Без знижки - звичайний вивід
    td.innerHTML = `${fullAmount.toLocaleString("uk-UA")} грн`;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId, true);
      showModal(actId, "other");
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function createStandardCell(
  content: string,
  act: any,
  actId: number,
  isActNumberCell: boolean = false,
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.classList.add("act-table-cell");

  if (isActNumberCell) {
    // Робимо комірку позиціонованою для абсолютного позиціонування бейджа
    td.style.position = "relative";

    // 1. ЗВЕРХУ: ОУ-123 / 01.12.24 малим темно-помаранчевим
    if (act.contrAgent_act && act.contrAgent_act_data) {
      const actNum = act.contrAgent_act;
      const actDateFormatted = convertISOtoShortDate(act.contrAgent_act_data);

      if (actDateFormatted) {
        const actLabel = document.createElement("div");
        actLabel.classList.add("act-label-small");
        actLabel.textContent = `ОУ-${actNum} / ${actDateFormatted}`;
        td.appendChild(actLabel);
      }
    }

    // 2. ПОСЕРЕДИНІ: 🗝️ 1234 нормальним розміром
    const mainNumber = document.createElement("div");
    mainNumber.innerHTML = content;
    td.appendChild(mainNumber);

    // 3. ЗНИЗУ: СФ-123 / 15.12.24 малим темно-помаранчевим
    if (act.contrAgent_raxunok && act.contrAgent_raxunok_data) {
      const raxunokNum = act.contrAgent_raxunok;
      const raxunokDateFormatted = convertISOtoShortDate(
        act.contrAgent_raxunok_data,
      );

      if (raxunokDateFormatted) {
        const raxunokLabel = document.createElement("div");
        raxunokLabel.classList.add("raxunok-label-small");
        raxunokLabel.textContent = `СФ-${raxunokNum} / ${raxunokDateFormatted}`;
        td.appendChild(raxunokLabel);
      }
    }

    // 4. БЕЙДЖ З КІЛЬКІСТЮ ПОВІДОМЛЕНЬ (правий верхній кут)
    const notificationCount = actNotificationCounts.get(actId) || 0;
    if (notificationCount > 0) {
      const badge = document.createElement("div");
      badge.className = "notification-count-badge";
      badge.textContent = notificationCount.toString();
      td.appendChild(badge);
    }
  } else {
    td.innerHTML = content;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId, true);
      showModal(actId, "other");
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function showNoAccessNotification(): void {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    font-size: 16px;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = "🔒 У вас немає доступу до перегляду актів";
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// =============================================================================
// РЕНДЕРИНГ РЯДКІВ
// =============================================================================

function renderActsRows(
  acts: any[],
  clients: any[],
  cars: any[],
  tbody: HTMLTableSectionElement,
  _accessLevel: string | null,
  modifiedActIds: Set<number>,
  showSumaColumn: boolean = true,
): void {
  tbody.innerHTML = "";

  acts.forEach((act) => {
    const isClosed = isActClosed(act);
    const lockIcon = isClosed ? "🔒" : "🗝️";
    const clientInfo = getClientInfo(act, clients);
    const carInfo = getCarInfo(act, cars);
    const row = document.createElement("tr");

    row.classList.add(isClosed ? "row-closed" : "row-open");

    // 💛 ПЕРЕВІРКА slusarsOn ДЛЯ ЗОЛОТИСТОГО ФАРБУВАННЯ (ТІЛЬКИ ДЛЯ ВІДКРИТИХ АКТІВ)
    // ✨ Для Приймальника показувати тільки якщо pruimalnyk === currentUserName
    const shouldShowSlusarsOn =
      act.slusarsOn === true &&
      !isClosed &&
      (userAccessLevel === "Адміністратор" ||
        userAccessLevel === "Слюсар" ||
        (userAccessLevel === "Приймальник" &&
          act.pruimalnyk === currentUserName));

    if (shouldShowSlusarsOn) {
      row.classList.add("row-slusar-on");
    }

    // ПЕРЕВІРКА ПІДСВІТКИ (СИНЯ РУЧКА)
    if (act.act_id && modifiedActIds.has(Number(act.act_id))) {
      row.classList.add("act-modified-blue-pen");
    }

    // Комірка № акту
    row.appendChild(
      createStandardCell(
        `${lockIcon} ${act.act_id?.toString() || "N/A"}`,
        act,
        act.act_id,
        true,
      ),
    );
    row.appendChild(createDateCell(act, act.act_id));
    row.appendChild(createClientCell(clientInfo, act.act_id, act));
    row.appendChild(createCarCell(carInfo, act.act_id));

    // ✅ Показуємо "Сума" тільки якщо showSumaColumn = true
    if (showSumaColumn) {
      row.appendChild(createSumCell(act, act.act_id));
    }

    tbody.appendChild(row);
  });
}

// =============================================================================
// СОРТУВАННЯ ТА ФІЛЬТРАЦІЯ
// =============================================================================

function sortActs(): void {
  if (sortByDateStep === 0) {
    actsGlobal.sort((a, b) => {
      const aOpen = !isActClosed(a);
      const bOpen = !isActClosed(b);
      if (aOpen && !bOpen) return -1;
      if (!aOpen && bOpen) return 1;
      return 0;
    });
    sortByDateStep = 1;
  } else {
    actsGlobal.sort(
      (a, b) =>
        (getActDateAsDate(b)?.getTime() || 0) -
        (getActDateAsDate(a)?.getTime() || 0),
    );
    sortByDateStep = 0;
  }
}

function getDefaultDateRange(): string {
  const today = new Date();
  const lastMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    today.getDate(),
  );
  return `${formatDate(lastMonth)} - ${formatDate(today)}`;
}

function getDateRange(): { dateFrom: string; dateTo: string } | null {
  const input = document.getElementById("dateRangePicker") as HTMLInputElement;
  const dateRangeValue = input?.value?.trim();
  if (!dateRangeValue) {
    input.value = getDefaultDateRange();
  }
  const currentValue = input.value.trim();
  if (currentValue === "Відкриті" || currentValue === "Закриті") return null;
  if (!currentValue.includes(" - ")) return null;

  const [startStr, endStr] = currentValue.split(" - ");
  if (!validateDateFormat(startStr) || !validateDateFormat(endStr)) return null;

  try {
    const [dateFrom, dateTo] = [startStr, endStr].map((str, i) => {
      const [d, m, y] = str.split(".");
      const full = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      return i === 0 ? `${full} 00:00:00` : `${full} 23:59:59`;
    });
    return { dateFrom, dateTo };
  } catch {
    return null;
  }
}

function filterActs(
  acts: any[],
  searchTerm: string,
  clients: any[],
  cars: any[],
): any[] {
  if (!searchTerm) return acts;
  const filters = parseSearchTerm(searchTerm);

  return acts.filter((act) => {
    const clientInfo = getClientInfo(act, clients);
    const carInfo = getCarInfo(act, cars);
    const actDate = getActDateAsDate(act);
    const formattedDate = actDate ? formatDate(actDate) : "";
    const amount = getActAmount(act);
    const raxunokNum = act.contrAgent_raxunok || "";
    const actNum = act.contrAgent_act || "";

    return filters.every((filter) => {
      const searchValue = filter.value.toUpperCase();
      if (searchValue.startsWith("СФ-")) {
        const numPart = searchValue.replace("СФ-", "").trim();
        return !numPart ? raxunokNum : raxunokNum.toString().includes(numPart);
      }
      if (searchValue.startsWith("ОУ-")) {
        const numPart = searchValue.replace("ОУ-", "").trim();
        return !numPart ? actNum : actNum.toString().includes(numPart);
      }
      switch (filter.key.toLowerCase()) {
        case "акт":
          return act.act_id?.toString().includes(filter.value);
        case "сума":
          return amount >= parseFloat(filter.value);
        case "дата":
          return formattedDate.includes(filter.value);
        case "тел":
        case "телефон":
          return clientInfo.phone.includes(filter.value);
        case "піб":
          return clientInfo.pib
            .toLowerCase()
            .includes(filter.value.toLowerCase());
        case "машина":
          return carInfo.name
            .toLowerCase()
            .includes(filter.value.toLowerCase());
        case "номер":
          return carInfo.number.includes(filter.value);
        default:
          return (
            clientInfo.pib.toLowerCase().includes(filter.value.toLowerCase()) ||
            clientInfo.phone.includes(filter.value) ||
            carInfo.number.includes(filter.value) ||
            carInfo.name.toLowerCase().includes(filter.value.toLowerCase()) ||
            act.act_id?.toString().includes(filter.value) ||
            formattedDate.includes(filter.value) ||
            amount.toString().includes(filter.value) ||
            raxunokNum.toString().includes(filter.value) ||
            actNum.toString().includes(filter.value)
          );
      }
    });
  });
}

function parseSearchTerm(searchTerm: string): { key: string; value: string }[] {
  const filters: { key: string; value: string }[] = [];
  const parts = searchTerm.split(" ").filter((p) => p);
  parts.forEach((part) => {
    const [key, value] = part.split(":");
    if (key && value) filters.push({ key, value });
    else filters.push({ key: "", value: part });
  });
  return filters;
}

// =============================================================================
// ЗАВАНТАЖЕННЯ ДАНИХ
// =============================================================================

async function loadActsFromDB(
  dateFrom: string | null,
  dateTo: string | null,
  filterType: "open" | "closed" | null = null,
): Promise<any[] | null> {
  let query = supabase.from("acts").select("*");
  if (filterType === "open") query = query.is("date_off", null);
  else if (filterType === "closed") query = query.not("date_off", "is", null);
  else if (dateFrom && dateTo)
    query = query.gte("date_on", dateFrom).lte("date_on", dateTo);
  else {
    const fallbackDates = getDateRange();
    if (fallbackDates)
      query = supabase
        .from("acts")
        .select("*")
        .gte("date_on", fallbackDates.dateFrom)
        .lte("date_on", fallbackDates.dateTo);
    else return [];
  }
  query = query.order("act_id", { ascending: false });
  const { data: acts, error: actsError } = await query;
  if (actsError) {
    console.error("❌ Помилка при отриманні актів:", actsError);
    return null;
  }
  return acts || [];
}

async function loadClientsFromDB(): Promise<any[] | null> {
  const { data: clients, error: clientError } = await supabase
    .from("clients")
    .select("client_id, data");
  return clientError ? null : clients || [];
}

async function loadCarsFromDB(): Promise<any[] | null> {
  const { data: cars, error: carsError } = await supabase
    .from("cars")
    .select("cars_id, data");
  return carsError ? null : cars || [];
}

// =============================================================================
// СТВОРЕННЯ ТАБЛИЦІ
// =============================================================================

function createTableHeader(
  _accessLevel: string | null,
  showSumaColumn: boolean = true,
): HTMLTableSectionElement {
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = ["№ акту", "Дата", "Клієнт 🔽", "Автомобіль"];
  // ✅ Показуємо "Сума" тільки якщо showSumaColumn = true
  if (showSumaColumn) headers.push("Сума");

  // Колір шапки з налаштувань
  const tableColor = globalCache.generalSettings?.tableColor || "#177245";

  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.backgroundColor = tableColor;
    th.style.color = "#fff";
    if (header.includes("Клієнт")) {
      th.addEventListener("click", () => {
        sortActs();
        updateTableBody();
      });
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  return thead;
}

function updateTableBody(): void {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table",
  );
  if (!table) return;

  // ✅ Перевіряємо чи є стовпець "Сума" в заголовку таблиці
  const headers = table.querySelectorAll("thead th");
  const showSumaColumn = Array.from(headers).some((th) =>
    th.textContent?.includes("Сума"),
  );

  const newTbody = document.createElement("tbody");
  renderActsRows(
    actsGlobal,
    clientsGlobal,
    carsGlobal,
    newTbody,
    userAccessLevel,
    modifiedActIdsGlobal,
    showSumaColumn,
  );
  const oldTbody = table.querySelector("tbody");
  if (oldTbody) oldTbody.replaceWith(newTbody);
}

function createTable(
  accessLevel: string | null,
  showSumaColumn: boolean = true,
): HTMLTableElement {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  const thead = createTableHeader(accessLevel, showSumaColumn);
  const tbody = document.createElement("tbody");
  renderActsRows(
    actsGlobal,
    clientsGlobal,
    carsGlobal,
    tbody,
    accessLevel,
    modifiedActIdsGlobal,
    showSumaColumn,
  );
  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function showNoDataMessage(message: string): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad",
  );
  if (container)
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: #666;">${message}</div>`;
}

function showAuthRequiredMessage(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad",
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 20px;">🔐</div>
      <h3>Доступ обмежено</h3>
      <p>Для перегляду таблиці актів потрібна автентифікація</p>
      <button id="authRetryBtn" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px;">Увійти</button>
    </div>`;
    const retryBtn = document.getElementById("authRetryBtn");
    if (retryBtn)
      retryBtn.addEventListener("click", () => initializeActsSystem());
  }
}

function showNoViewAccessMessage(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad",
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
      <h3>Доступ заборонено</h3>
      <p>У вас немає прав на перегляд актів</p>
    </div>`;
  }
}

// Функція applyVerticalScrollbarCompensation видалена, оскільки вирівнювання тепер контролюється CSS (sticky header)

// =============================================================================
// ОСНОВНІ ФУНКЦІОНАЛЬНІ
// =============================================================================

export async function loadActsTable(
  dateFrom: string | null = null,
  dateTo: string | null = null,
  filterType: "open" | "closed" | null = null,
  searchTerm: string | null = null,
): Promise<void> {
  if (!isUserAuthenticated()) {
    const accessLevel = await showLoginModalBeforeTable();
    if (!accessLevel) {
      showAuthRequiredMessage();
      return;
    }
  }

  const canView = await canUserViewActs();
  if (!canView) {
    showNoViewAccessMessage();
    return;
  }

  try {
    let finalDateFrom: string | null = null;
    let finalDateTo: string | null = null;
    let finalFilterType: "open" | "closed" | null = filterType || null;
    const dateRangePicker = document.getElementById(
      "dateRangePicker",
    ) as HTMLInputElement;

    if (finalFilterType === "open" || finalFilterType === "closed") {
      finalDateFrom = null;
      finalDateTo = null;
    } else {
      if (dateFrom && dateTo) {
        finalDateFrom = dateFrom;
        finalDateTo = dateTo;
      } else {
        const fallback = getDateRange();
        if (fallback) {
          finalDateFrom = fallback.dateFrom;
          finalDateTo = fallback.dateTo;
        } else {
          const currentValue = dateRangePicker?.value?.trim();
          if (currentValue === "Відкриті") finalFilterType = "open";
          else if (currentValue === "Закриті") finalFilterType = "closed";
          else {
            const defaultRange = getDefaultDateRange();
            const [startStr, endStr] = defaultRange.split(" - ");
            const [d1, m1, y1] = startStr.split(".");
            const [d2, m2, y2] = endStr.split(".");
            finalDateFrom = `${y1}-${m1.padStart(2, "0")}-${d1.padStart(
              2,
              "0",
            )} 00:00:00`;
            finalDateTo = `${y2}-${m2.padStart(2, "0")}-${d2.padStart(
              2,
              "0",
            )} 23:59:59`;
            if (dateRangePicker) dateRangePicker.value = defaultRange;
          }
        }
      }
    }

    // ✅ Завантажуємо акти, клієнтів, машини + СПОВІЩЕННЯ + КІЛЬКІСТЬ ПОВІДОМЛЕНЬ
    const [acts, clients, cars, modifiedIds, notificationCounts] =
      await Promise.all([
        loadActsFromDB(finalDateFrom, finalDateTo, finalFilterType),
        loadClientsFromDB(),
        loadCarsFromDB(),
        fetchModifiedActIds(), // <-- Завантажуємо існуючі підсвітки
        fetchActNotificationCounts(), // <-- Завантажуємо кількість повідомлень
      ]);

    if (acts === null || clients === null || cars === null) return;

    clientsGlobal = clients;
    carsGlobal = cars;
    modifiedActIdsGlobal = modifiedIds; // Зберігаємо глобально
    actNotificationCounts = notificationCounts; // Зберігаємо кількість повідомлень

    actsGlobal = filterActs(acts, searchTerm ?? "", clients, cars);

    if (actsGlobal.length === 0) {
      showNoDataMessage("Немає актів у вказаному діапазоні.");
      return;
    }

    // ✅ Перевіряємо налаштування для приховування стовпця "Сума"
    const showSumaColumn = await canUserSeePriceColumns();
    const table = createTable(userAccessLevel, showSumaColumn);
    const container = document.getElementById(
      "table-container-modal-sakaz_narad",
    );
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(table);
  } catch (error) {
    console.error("💥 Критична помилка:", error);
  }
}

export async function refreshActsTable(): Promise<void> {
  if (!isUserAuthenticated()) return;
  const searchInput = document.getElementById(
    "searchInput",
  ) as HTMLInputElement;
  const currentSearchTerm = searchInput?.value?.trim() || "";
  const dateRangePicker = document.getElementById(
    "dateRangePicker",
  ) as HTMLInputElement;
  const currentValue = dateRangePicker?.value?.trim() || "";

  let currentFilterType: "open" | "closed" | null = null;
  let currentDateFrom: string | null = null;
  let currentDateTo: string | null = null;

  if (currentValue === "Відкриті") currentFilterType = "open";
  else if (currentValue === "Закриті") currentFilterType = "closed";
  else {
    const dates = getDateRange();
    if (dates) {
      currentDateFrom = dates.dateFrom;
      currentDateTo = dates.dateTo;
    }
  }
  loadActsTable(
    currentDateFrom,
    currentDateTo,
    currentFilterType,
    currentSearchTerm,
  );
}

function resizeInput(input: HTMLInputElement): void {
  const tempSpan = document.createElement("span");
  tempSpan.style.visibility = "hidden";
  tempSpan.style.position = "absolute";
  tempSpan.style.whiteSpace = "pre";

  const computedStyle = window.getComputedStyle(input);
  tempSpan.style.font = computedStyle.font;
  tempSpan.style.fontSize = computedStyle.fontSize;
  tempSpan.style.fontWeight = computedStyle.fontWeight;
  tempSpan.style.fontFamily = computedStyle.fontFamily;
  tempSpan.style.letterSpacing = computedStyle.letterSpacing;

  tempSpan.textContent = input.value || input.placeholder || " ";
  document.body.appendChild(tempSpan);

  const width = tempSpan.offsetWidth;
  document.body.removeChild(tempSpan);

  input.style.width = `${width + 30}px`;
}

function watchDateRangeChanges(): void {
  const dateRangePicker = document.getElementById(
    "dateRangePicker",
  ) as HTMLInputElement;
  if (!dateRangePicker) return;

  // Початкове налаштування ширини
  resizeInput(dateRangePicker);

  let lastValue = dateRangePicker.value;
  const observer = new MutationObserver(() => {
    const currentValue = dateRangePicker.value;
    if (currentValue !== lastValue) {
      lastValue = currentValue;

      // Оновлюємо ширину при зміні значення
      resizeInput(dateRangePicker);

      const searchInput = document.getElementById(
        "searchInput",
      ) as HTMLInputElement;
      const currentSearchTerm = searchInput?.value?.trim() || "";
      loadActsTable(undefined, undefined, undefined, currentSearchTerm);
    }
  });

  observer.observe(dateRangePicker, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Додаткові слухачі подій для кращої реактивності
  dateRangePicker.addEventListener("input", () => resizeInput(dateRangePicker));
  dateRangePicker.addEventListener("change", () =>
    resizeInput(dateRangePicker),
  );

  window.addEventListener("beforeunload", () => observer.disconnect());
}

export async function initializeActsSystem(): Promise<void> {
  try {
    // 📦 Завантажуємо загальні налаштування:
    // - Якщо вже завантажено в цій сесії → просто беремо з localStorage
    // - Інакше (перезавантаження/новий вхід) → завантажуємо з БД і позначаємо прапором
    if (isGeneralSettingsLoadedThisSession()) {
      loadGeneralSettingsFromLocalStorage();
    } else {
      await loadGeneralSettingsFromDB();
      markGeneralSettingsAsLoaded();
    }

    const accessLevel = await showLoginModalBeforeTable();
    if (!accessLevel) {
      showAuthRequiredMessage();
      return;
    }
    const canView = await canUserViewActs();
    if (!canView) {
      showNoViewAccessMessage();
      return;
    }

    await loadActsTable(null, null, "open");

    // ✅ АКТИВУЄМО REALTIME ПІДПИСКУ
    subscribeToActNotifications();

    // ✏️ ПІДПИСКА НА ГЛОБАЛЬНУ ПРИСУТНІСТЬ (хто редагує акти)
    subscribeToGlobalActPresence();

    // 📥 ЗАВАНТАЖУЄМО ІСНУЮЧІ ПОВІДОМЛЕННЯ З БД
    if (accessLevel === "Адміністратор" || accessLevel === "Приймальник") {
      await loadAndShowExistingNotifications();
    } else {
    }

    watchDateRangeChanges();
  } catch (error) {
    console.error("💥 Помилка ініціалізації:", error);
    showNoDataMessage("❌ Помилка");
  }
}

export { logoutFromSystemAndRedirect, isUserAuthenticated } from "./users";

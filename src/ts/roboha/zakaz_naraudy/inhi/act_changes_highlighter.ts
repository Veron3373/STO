// ===== ФАЙЛ: src/ts/roboha/zakaz_naraudy/inhi/act_changes_highlighter.ts =====

import { supabase } from "../../../vxid/supabaseClient";
import {
  userAccessLevel,
  getSavedUserDataFromLocalStorage,
} from "../../tablucya/users";
import { ACT_ITEMS_TABLE_CONTAINER_ID, globalCache } from "../globalCache";
import { clearNotificationVisualOnly } from "../../tablucya/tablucya";

/* ====================ТИПИ =============================== */

interface ChangeRecord {
  id?: number;
  act_id: number;
  item_name: string;
  cina: number;
  kilkist: number;
  zarplata: number;
  dodav_vudaluv: boolean;
  changed_by_surname: string;
}

/* =============================== УТИЛ ІТИ =============================== */

/**
 * Затримка виконання (для анімації)
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Додає CSS стилі для підсвічування (якщо ще не додані)
 */
function injectHighlightStyles(): void {
  const styleId = "act-changes-highlight-styles";

  if (document.getElementById(styleId)) {
    return; // Стилі вже додані
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
        /* Синє підсвічування для доданих */
        .highlight-added {
            background-color: rgba(33, 150, 243, 0.3) !important;
            border: 2px solid #2196F3 !important;
            transition: all 0.5s ease;
        }

        /* Червоне підсвічування для видалених */
        .highlight-deleted {
            background-color: rgba(244, 67, 54, 0.3) !important;
            border: 2px solid #F44336 !important;
            transition: all 0.5s ease;
        }

        /* Анімація моргання */
        @keyframes blink-highlight {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .blinking {
            animation: blink-highlight 1s ease-in-out;
        }
    `;

  document.head.appendChild(style);
}

/* =============================== ПІДСВІЧУВАННЯ ДОДАНИХ =============================== */

/**
 * Знаходить рядок в таблиці за назвою позиції
 */
function findRowByItemName(itemName: string): HTMLTableRowElement | null {
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return null;

  const rows = container.querySelectorAll<HTMLTableRowElement>("tbody tr");

  for (const row of rows) {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const name = nameCell?.textContent?.trim() || "";

    if (name === itemName) {
      return row;
    }
  }

  return null;
}

/**
 * Підсвічує додані позиції синім кольором з морганням (ОДНОЧАСНО)
 */
async function highlightAddedItems(
  addedChanges: ChangeRecord[]
): Promise<void> {
  console.log(
    `🔵 Підсвічування ${addedChanges.length} доданих позицій ОДНОЧАСНО...`
  );

  // Знаходимо всі рядки одразу
  const rowsToHighlight: HTMLTableRowElement[] = [];

  for (const change of addedChanges) {
    const row = findRowByItemName(change.item_name);

    if (!row) {
      console.warn(`⚠️ Не знайдено рядок для "${change.item_name}"`);
      continue;
    }

    rowsToHighlight.push(row);
    // Додаємо синє підсвічування
    row.classList.add("highlight-added");
  }

  if (rowsToHighlight.length === 0) {
    console.log("⚠️ Немає рядків для підсвічування");
    return;
  }

  // Моргання 5 разів (5 секунд) - ВСІ ОДНОЧАСНО
  for (let i = 0; i < 5; i++) {
    // Додаємо клас моргання до ВСІХ рядків одночасно
    rowsToHighlight.forEach((row) => row.classList.add("blinking"));
    await delay(500); // Моргання (0.5 сек)

    // Прибираємо клас моргання у ВСІХ рядків одночасно
    rowsToHighlight.forEach((row) => row.classList.remove("blinking"));
    await delay(500); // Пауза (0.5 сек)
  }

  // Прибираємо підсвічування у ВСІХ рядків
  rowsToHighlight.forEach((row) => row.classList.remove("highlight-added"));

  console.log(`✅ Підсвічено ${rowsToHighlight.length} доданих позицій`);
}

/* =============================== ПІДСВІЧУВАННЯ ВИДАЛЕНИХ =============================== */

/**
 * Генерує HTML для тимчасового рядка з даними видаленої позиції
 */
function generateDeletedItemHtml(change: ChangeRecord, index: number): string {
  const showPibMagazin = globalCache.settings?.showPibMagazin ?? true;
  const showCatalog = globalCache.settings?.showCatalog ?? true;
  const showZarplata = globalCache.settings?.showZarplata ?? true;

  // Визначаємо тип позиції (робота чи деталь) за наявністю зарплати
  const isWork = change.zarplata > 0;
  const icon = isWork ? "🛠️" : "⚙️";

  // Розраховуємо суму
  const sum = change.cina * change.kilkist;

  // Форматуємо числа
  const formatNum = (n: number) => new Intl.NumberFormat("uk-UA").format(n);

  const catalogCellHTML = showCatalog
    ? `<td class="catalog-cell" data-name="catalog"></td>`
    : "";

  const pibMagazinCellHTML = showPibMagazin
    ? `<td class="pib-magazin-cell" data-name="pib_magazin">${change.changed_by_surname}</td>`
    : "";

  // ✅ ВИПРАВЛЕНО: Завжди створюємо комірку зарплати, але приховуємо якщо showZarplata = false
  const zarplataCellHTML = `<td class="text-right slyusar-sum-cell" data-name="slyusar_sum"${
      !showZarplata ? ' style="display: none;"' : ''
    }>${change.zarplata > 0 ? formatNum(change.zarplata) : ""}</td>`;

  return `
        <tr class="deleted-item-row">
            <td class="row-index">${icon} ${index + 1}</td>
            <td class="name-cell">
                <div data-name="name">${change.item_name}</div>
            </td>
            ${catalogCellHTML}
            <td class="text-right qty-cell" data-name="id_count">${formatNum(
              change.kilkist
            )}</td>
            <td class="text-right price-cell" data-name="price">${formatNum(
              change.cina
            )}</td>
            <td class="text-right" data-name="sum">${formatNum(sum)}</td>
            ${zarplataCellHTML}
            ${pibMagazinCellHTML}
        </tr>
    `;
}

/**
 * Підсвічує видалені позиції червоним кольором з морганням, потім видаляє (ОДНОЧАСНО)
 */
async function highlightDeletedItems(
  deletedChanges: ChangeRecord[]
): Promise<void> {
  console.log(
    `🔴 Підсвічування ${deletedChanges.length} видалених позицій ОДНОЧАСНО...`
  );

  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) {
    console.error("❌ Контейнер таблиці не знайдено");
    return;
  }

  const tableBody = container.querySelector("tbody");
  if (!tableBody) {
    console.error("❌ Тіло таблиці не знайдено");
    return;
  }

  // Створюємо ВСІ рядки одразу
  const rowsToHighlight: HTMLTableRowElement[] = [];

  for (const change of deletedChanges) {
    try {
      // Отримуємо поточну кількість рядків для індексу
      const currentRowCount = tableBody.querySelectorAll("tr").length;
      const index = currentRowCount;

      // Створюємо HTML рядка
      const rowHtml = generateDeletedItemHtml(change, index);

      // Додаємо рядок в кінець таблиці
      tableBody.insertAdjacentHTML("beforeend", rowHtml);

      // Знаходимо щойно доданий рядок
      const row = tableBody.querySelector(
        "tr.deleted-item-row:last-child"
      ) as HTMLTableRowElement;

      if (!row) {
        console.error("❌ Не вдалося знайти доданий рядок");
        continue;
      }

      // Додаємо червоне підсвічування
      row.classList.add("highlight-deleted");
      rowsToHighlight.push(row);
    } catch (error) {
      console.error(`❌ Помилка при створенні рядка:`, error);
    }
  }

  if (rowsToHighlight.length === 0) {
    console.log("⚠️ Немає рядків для підсвічування");
    return;
  }

  // Моргання 5 разів (5 секунд) - ВСІ ОДНОЧАСНО
  for (let i = 0; i < 5; i++) {
    // Додаємо клас моргання до ВСІХ рядків одночасно
    rowsToHighlight.forEach((row) => row.classList.add("blinking"));
    await delay(500); // Моргання (0.5 сек)

    // Прибираємо клас моргання у ВСІХ рядків одночасно
    rowsToHighlight.forEach((row) => row.classList.remove("blinking"));
    await delay(500); // Пауза (0.5 сек)
  }

  // Видаляємо ВСІ рядки
  rowsToHighlight.forEach((row) => row.remove());

  console.log(`✅ Підсвічено та видалено ${rowsToHighlight.length} позицій`);
}

/* =============================== РОБОТА З БД =============================== */

/**
 * Завантажує зміни для акту з БД
 */
async function loadChangesForAct(actId: number): Promise<{
  added: ChangeRecord[];
  deleted: ChangeRecord[];
}> {
  // ✅ Для Адміністратора - всі зміни
  if (userAccessLevel === "Адміністратор") {
    const { data, error } = await supabase
      .from("act_changes_notifications")
      .select("*")
      .eq("act_id", actId);

    if (error) {
      console.error("❌ Помилка завантаження змін:", error);
      throw error;
    }

    const changes = (data || []) as ChangeRecord[];
    const added = changes.filter((c) => c.dodav_vudaluv === true);
    const deleted = changes.filter((c) => c.dodav_vudaluv === false);

    console.log(
      `📊 Завантажено змін для акту #${actId}: додано=${added.length}, видалено=${deleted.length}`
    );
    return { added, deleted };
  }

  // ✅ Для Приймальника - фільтруємо по pruimalnyk
  if (userAccessLevel === "Приймальник") {
    // Отримуємо ПІБ поточного користувача через функцію
    const userData = getSavedUserDataFromLocalStorage();
    const currentUserName = userData?.name || null;

    if (!currentUserName) {
      console.warn("⚠️ Не вдалося отримати ПІБ поточного користувача");
      return { added: [], deleted: [] };
    }

    const { data, error } = await supabase
      .from("act_changes_notifications")
      .select("*")
      .eq("act_id", actId)
      .eq("pruimalnyk", currentUserName); // ✅ Фільтр по приймальнику

    if (error) {
      console.error("❌ Помилка завантаження змін:", error);
      throw error;
    }

    const changes = (data || []) as ChangeRecord[];
    const added = changes.filter((c) => c.dodav_vudaluv === true);
    const deleted = changes.filter((c) => c.dodav_vudaluv === false);

    console.log(
      `📊 Завантажено змін для акту #${actId} (приймальник: ${currentUserName}): додано=${added.length}, видалено=${deleted.length}`
    );
    return { added, deleted };
  }

  // ✅ Для інших ролей - немає змін
  return { added: [], deleted: [] };
}

/**
 * Видаляє оброблені записи з БД
 * ЛОГІКА:
 * - Приймальник видаляє ТІЛЬКИ свої записи (де pruimalnyk = його ПІБ)
 * - Адміністратор видаляє ТІЛЬКИ записи з пустим pruimalnyk (null або пустий рядок)
 */
async function deleteProcessedChanges(actId: number): Promise<void> {
  // ✅ Для Приймальника - видаляємо тільки свої записи
  if (userAccessLevel === "Приймальник") {
    const userData = getSavedUserDataFromLocalStorage();
    const currentUserName = userData?.name || null;

    if (!currentUserName) {
      console.warn(
        "⚠️ Не вдалося отримати ПІБ поточного користувача для видалення"
      );
      return;
    }

    console.log(
      `🔍 [deleteProcessedChanges] Приймальник: "${currentUserName}", видаляємо записи для акту #${actId}`
    );

    // ✅ Видаляємо ТІЛЬКИ ті записи, де pruimalnyk = ПІБ поточного Приймальника
    const { error } = await supabase
      .from("act_changes_notifications")
      .delete()
      .eq("act_id", actId)
      .eq("pruimalnyk", currentUserName); // ✅ Видаляємо тільки свої записи

    if (error) {
      console.error("❌ Помилка видалення оброблених змін:", error);
      throw error;
    }

    console.log(
      `🗑️ Видалено оброблені записи для акту #${actId} (Приймальник: ${currentUserName})`
    );
    return;
  }

  // ✅ Для Адміністратора - видаляємо ТІЛЬКИ записи з пустим pruimalnyk
  if (userAccessLevel === "Адміністратор") {
    console.log(
      `🔍 [deleteProcessedChanges] Адміністратор видаляє записи з пустим pruimalnyk для акту #${actId}`
    );

    // ✅ Видаляємо ТІЛЬКИ ті записи, де pruimalnyk is null
    const { error } = await supabase
      .from("act_changes_notifications")
      .delete()
      .eq("act_id", actId)
      .is("pruimalnyk", null); // ✅ Видаляємо тільки записи з пустим pruimalnyk

    if (error) {
      console.error("❌ Помилка видалення оброблених змін:", error);
      throw error;
    }

    console.log(
      `🗑️ Видалено оброблені записи з пустим pruimalnyk для акту #${actId} (Адміністратор)`
    );
    return;
  }

  // ⚠️ Для інших ролей - видалення недоступне
  console.log(
    `⏭️ [deleteProcessedChanges] ${userAccessLevel} не може видаляти записи`
  );
}

/* =============================== ГОЛОВНА ФУНКЦІЯ =============================== */

/**
 * Перевіряє та підсвічує зміни в акті для Адміністратора та Приймальника
 */
export async function checkAndHighlightChanges(actId: number): Promise<void> {
  // ✅ Працює для Адміністратора та Приймальника
  if (
    userAccessLevel !== "Адміністратор" &&
    userAccessLevel !== "Приймальник"
  ) {
    console.log(
      `⏭️ Підсвічування змін недоступне для ролі "${userAccessLevel}"`
    );
    return;
  }

  try {
    console.log(`🔍 Перевірка змін для акту #${actId} (${userAccessLevel})...`);

    // Додаємо CSS стилі
    injectHighlightStyles();

    // Завантажуємо зміни з БД (з фільтрацією по pruimalnyk для Приймальника)
    const { added, deleted } = await loadChangesForAct(actId);

    // Якщо змін немає - виходимо
    if (added.length === 0 && deleted.length === 0) {
      console.log("📝 Змін не виявлено");
      return;
    }

    console.log(`✨ Початок підсвічування змін...`);

    // Підсвічуємо додані позиції (синім)
    if (added.length > 0) {
      await highlightAddedItems(added);
    }

    // Підсвічуємо видалені позиції (червоним)
    if (deleted.length > 0) {
      await highlightDeletedItems(deleted);
    }

    // ✅ ДЛЯ ПРИЙМАЛЬНИКА та АДМІНІСТРАТОРА: видаляємо оброблені записи
    if (
      userAccessLevel === "Приймальник" ||
      userAccessLevel === "Адміністратор"
    ) {
      await deleteProcessedChanges(actId);

      // Знімаємо синю підсвітку з акту в таблиці
      clearNotificationVisualOnly(actId);

      console.log(
        `✅ Підсвічування завершено, оброблені записи видалено, синя ручка знята (${userAccessLevel})`
      );
    } else {
      console.log(
        `✅ Підсвічування завершено (${userAccessLevel} - записи НЕ видалено)`
      );
    }
  } catch (error) {
    console.error("❌ Помилка при підсвічуванні змін:", error);
    // Не блокуємо відкриття акту через помилку підсвічування
  }
}

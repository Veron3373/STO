// ===== ФАЙЛ: modalUI.ts =====

import {
  globalCache,
  ZAKAZ_NARAYD_MODAL_ID,
  ZAKAZ_NARAYD_BODY_ID,
  ZAKAZ_NARAYD_CLOSE_BTN_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  formatNumberWithSpaces,
} from "./globalCache";
import { setupAutocompleteForEditableCells } from "./inhi/kastomna_tabluca";
import { userAccessLevel } from "../tablucya/users";
import { supabase } from "../../vxid/supabaseClient";

function showNotification(message: string, type: string): void {
  console.log(`[${type}] ${message}`);
}

function parseNumber(text: string | null | undefined): number {
  return parseFloat(text?.replace(/\s/g, "") || "0") || 0;
}

async function getScladPrice(scladId: number): Promise<number | null> {
  const { data, error } = await supabase
    .from("sclad")
    .select("price")
    .eq("sclad_id", scladId)
    .single();
  if (error || !data) {
    console.error(`Помилка отримання ціни для sclad_id ${scladId}:`, error);
    return null;
  }
  return parseFloat(data.price) || 0;
}

/**
 * Отримує зарплату з історії слюсаря для конкретної роботи та акту
 * @param slyusarName - ім'я слюсаря
 * @param workName - назва роботи
 * @param actId - номер акту (необов'язковий, якщо не вказано - шукає останнє значення)
 */
function getSlyusarSalaryFromHistory(
  slyusarName: string,
  workName: string,
  actId?: number | null
): number | null {
  if (!slyusarName || !workName) return null;

  const slyusar = globalCache.slyusars.find(
    (s) => s.Name?.toLowerCase() === slyusarName.toLowerCase()
  );

  if (!slyusar?.["Історія"]) return null;

  const history = slyusar["Історія"];

  // Якщо вказано actId - шукаємо конкретно для цього акту
  if (actId) {
    for (const dateKey in history) {
      const dayBucket = history[dateKey];
      if (!Array.isArray(dayBucket)) continue;

      for (const actEntry of dayBucket) {
        // Перевіряємо, чи це потрібний акт
        if (Number(actEntry?.["Акт"]) !== Number(actId)) continue;

        const zapisi = actEntry?.["Записи"];
        if (!Array.isArray(zapisi)) continue;

        const workRecord = zapisi.find(
          (z: any) => z.Робота?.toLowerCase() === workName.toLowerCase()
        );

        if (workRecord && typeof workRecord.Зарплата === "number") {
          return workRecord.Зарплата;
        }
      }
    }
    // Якщо для конкретного акту не знайшли - повертаємо null
    return null;
  }

  // Якщо actId не вказано - шукаємо останнє значення (старий алгоритм)
  for (const dateKey in history) {
    const dayBucket = history[dateKey];
    if (!Array.isArray(dayBucket)) continue;

    for (const actEntry of dayBucket) {
      const zapisi = actEntry?.["Записи"];
      if (!Array.isArray(zapisi)) continue;

      const workRecord = zapisi.find(
        (z: any) => z.Робота?.toLowerCase() === workName.toLowerCase()
      );

      if (workRecord && typeof workRecord.Зарплата === "number") {
        return workRecord.Зарплата;
      }
    }
  }

  return null;
}

/**
 * Отримує відсоток роботи слюсаря
 */
export function getSlyusarWorkPercent(slyusarName: string): number {
  if (!slyusarName) return 0;

  const slyusar = globalCache.slyusars.find(
    (s) => s.Name?.toLowerCase() === slyusarName.toLowerCase()
  );

  if (slyusar && typeof slyusar.ПроцентРоботи === "number") {
    return slyusar.ПроцентРоботи;
  }

  return 0;
}

/**
 * Розраховує зарплату слюсаря від суми
 */
export function calculateSlyusarSum(totalSum: number, percent: number): number {
  if (percent <= 0 || totalSum <= 0) return 0;
  return Math.round(totalSum * (percent / 100));
}

/**
 * Оновлює зарплату слюсаря в рядку
 * Пріоритет:
 * 1. Якщо є історія для цієї роботи в цьому акті - беремо звідти
 * 2. Якщо історії немає - рахуємо від відсотка
 */
function updateSlyusarSalaryInRow(row: HTMLTableRowElement): void {
  const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
  const typeFromCell = nameCell?.getAttribute("data-type");

  if (typeFromCell !== "works") {
    // Це не робота - очищаємо зарплату
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;
    if (slyusarSumCell) {
      slyusarSumCell.textContent = "";
    }
    return;
  }

  const workName = nameCell?.textContent?.trim();
  const pibCell = row.querySelector('[data-name="pib_magazin"]') as HTMLElement;
  const slyusarName = pibCell?.textContent?.trim();
  const slyusarSumCell = row.querySelector(
    '[data-name="slyusar_sum"]'
  ) as HTMLElement;

  if (!workName || !slyusarName || !slyusarSumCell) return;

  // Отримуємо суму роботи
  const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
  const totalSum = parseNumber(sumCell?.textContent);

  if (totalSum <= 0) {
    slyusarSumCell.textContent = "";
    return;
  }

  // 1. Спробуємо отримати з історії для конкретного акту
  const actId = globalCache.currentActId;
  const historySalary = getSlyusarSalaryFromHistory(
    slyusarName,
    workName,
    actId
  );

  if (historySalary !== null) {
    // Знайшли в історії для цього акту - використовуємо це значення
    slyusarSumCell.textContent = formatNumberWithSpaces(historySalary);
    return;
  }

  // 2. Історії немає - рахуємо від відсотка
  const percent = getSlyusarWorkPercent(slyusarName);
  const calculatedSalary = calculateSlyusarSum(totalSum, percent);
  slyusarSumCell.textContent = formatNumberWithSpaces(calculatedSalary);
}

/**
 * Оновлює "Зар-та" для всіх робіт у таблиці з урахуванням історії/відсотків
 * Використовується з modalMain.ts одразу після рендеру модалки.
 */
export function updateAllSlyusarSumsFromHistory(): void {
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`
  );
  if (!tableBody) return;

  const rows = Array.from(
    tableBody.querySelectorAll<HTMLTableRowElement>("tr")
  );

  for (const row of rows) {
    const nameCell = row.querySelector(
      '[data-name="name"]'
    ) as HTMLElement | null;
    if (!nameCell) continue;
    const typeFromCell = nameCell.getAttribute("data-type");
    if (typeFromCell !== "works") continue;

    // Оновлюємо зарплату по кожному рядку "Роботи"
    updateSlyusarSalaryInRow(row);
  }
}

/**
 * Перераховує суму в рядку і оновлює зарплату слюсаря
 */
export function calculateRowSum(row: HTMLTableRowElement): void {
  const price = parseNumber(
    (row.querySelector('[data-name="price"]') as HTMLElement)?.textContent
  );
  const quantity = parseNumber(
    (row.querySelector('[data-name="id_count"]') as HTMLElement)?.textContent
  );
  const sum = price * quantity;

  const sumCell = row.querySelector(
    '[data-name="sum"]'
  ) as HTMLTableCellElement;
  if (sumCell) {
    sumCell.textContent = formatNumberWithSpaces(Math.round(sum));
  }

  // Оновлюємо зарплату слюсаря
  updateSlyusarSalaryInRow(row);
  updateCalculatedSumsInFooter();
}

/**
 * Ініціалізує зарплати слюсарів при завантаженні акту
 * Викликається ОДИН РАЗ після завантаження всіх даних
 */
export function initializeSlyusarSalaries(): void {
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`
  );
  if (!tableBody) return;

  const rows = Array.from(
    tableBody.querySelectorAll<HTMLTableRowElement>("tr")
  );

  const actId = globalCache.currentActId;

  for (const row of rows) {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const typeFromCell = nameCell?.getAttribute("data-type");

    if (typeFromCell !== "works") continue;

    const workName = nameCell?.textContent?.trim();
    const pibCell = row.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement;
    const slyusarName = pibCell?.textContent?.trim();
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    if (!workName || !slyusarName || !slyusarSumCell) continue;

    // Перевіряємо, чи вже є значення (завантажене з акту)
    const existingValue = slyusarSumCell.textContent?.trim();
    if (existingValue) {
      // Якщо значення вже є - залишаємо його
      continue;
    }

    // Значення немає - намагаємось заповнити
    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const totalSum = parseNumber(sumCell?.textContent);

    if (totalSum <= 0) continue;

    // 1. Шукаємо в історії для конкретного акту
    const historySalary = getSlyusarSalaryFromHistory(
      slyusarName,
      workName,
      actId
    );

    if (historySalary !== null) {
      slyusarSumCell.textContent = formatNumberWithSpaces(historySalary);
      continue;
    }

    // 2. Рахуємо від відсотка
    const percent = getSlyusarWorkPercent(slyusarName);
    const calculatedSalary = calculateSlyusarSum(totalSum, percent);
    slyusarSumCell.textContent = formatNumberWithSpaces(calculatedSalary);
  }
}

/**
 * Перевіряє попередження про зарплату при завантаженні
 */
export function checkSlyusarSalaryWarnings(): void {
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return;

  const rows = Array.from(
    container.querySelectorAll<HTMLTableRowElement>("tbody tr")
  );
  let hasWarnings = false;

  for (const row of rows) {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const typeFromCell = nameCell?.getAttribute("data-type");

    if (typeFromCell !== "works") continue;

    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    if (!sumCell || !slyusarSumCell) continue;

    const sum = parseNumber(sumCell.textContent);
    const slyusarSum = parseNumber(slyusarSumCell.textContent);

    if (slyusarSum > sum && sum > 0) {
      hasWarnings = true;
      slyusarSumCell.setAttribute("data-warnzp", "1");
      slyusarSumCell.classList.add("slyusar-sum-cell");
    } else {
      slyusarSumCell.removeAttribute("data-warnzp");
      slyusarSumCell.classList.remove("slyusar-sum-cell");
    }
  }

  if (hasWarnings) {
    showNotification(
      "⚠️ Увага: Зарплата більша ніж сума роботи у деяких рядках",
      "warning"
    );
  }
}

export async function saveActData(): Promise<void> {
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`
  );
  if (!tableBody || !globalCache.currentActId) return;

  const rows = Array.from(
    tableBody.querySelectorAll<HTMLTableRowElement>("tr")
  );
  let totalDetailsProfit = 0;
  let totalWorksProfit = 0;
  const details = [];
  const works = [];

  for (const row of rows) {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const type = nameCell?.getAttribute("data-type");
    const price = parseNumber(
      row.querySelector('[data-name="price"]')?.textContent
    );
    const quantity = parseNumber(
      row.querySelector('[data-name="id_count"]')?.textContent
    );
    const sum = price * quantity;
    const slyusarSum = parseNumber(
      row.querySelector('[data-name="slyusar_sum"]')?.textContent
    );
    const catalog =
      row.querySelector('[data-name="catalog"]')?.textContent?.trim() || "";
    const shop =
      row.querySelector('[data-name="pib_magazin"]')?.textContent?.trim() || "";
    const name = nameCell?.textContent?.trim() || "";

    if (type === "details") {
      const scladId = parseInt(
        row
          .querySelector('[data-name="catalog"]')
          ?.getAttribute("data-sclad-id") || "0"
      );
      let profit = 0;
      if (scladId) {
        const scladPrice = await getScladPrice(scladId);
        if (scladPrice !== null) {
          const scladSum = scladPrice * quantity;
          profit = sum - scladSum;
          totalDetailsProfit += profit;
        }
      }

      details.push({
        sclad_id: scladId || null,
        Сума: sum,
        Ціна: price,
        Деталь: name,
        Каталог: catalog,
        Магазин: shop,
        Кількість: quantity,
      });
    } else if (type === "works") {
      const profit = sum >= slyusarSum ? sum - slyusarSum : 0;
      if (sum < slyusarSum && sum > 0) {
        console.warn(
          `Від'ємний прибуток за роботу (${sum} - ${slyusarSum} = ${
            sum - slyusarSum
          }) для "${name}". Встановлено 0.`
        );
        showNotification(
          `Попередження: Сума (${sum}) менша за зарплату (${slyusarSum}) для роботи "${name}". Прибуток встановлено в 0.`,
          "warning"
        );
      }
      totalWorksProfit += profit;

      works.push({
        Сума: sum,
        Ціна: price,
        Робота: name,
        Зарплата: slyusarSum,
        Слюсар: shop,
        Кількість: quantity,
        Прибуток: profit,
      });
    }
  }

  const { data: actData, error: fetchError } = await supabase
    .from("acts")
    .select("data")
    .eq("act_id", globalCache.currentActId)
    .single();

  if (fetchError || !actData) {
    console.error(
      `Помилка отримання акта ${globalCache.currentActId}:`,
      fetchError
    );
    showNotification("Помилка отримання акту", "error");
    return;
  }

  let actJsonData = actData.data || {};
  actJsonData["Деталі"] = details;
  actJsonData["Роботи"] = works;
  actJsonData["За деталі"] = details.reduce((sum, d) => sum + (d.Сума || 0), 0);
  actJsonData["За роботу"] = works.reduce((sum, w) => sum + (w.Сума || 0), 0);
  actJsonData["Прибуток за деталі"] = totalDetailsProfit;
  actJsonData["Прибуток за роботу"] = totalWorksProfit;
  actJsonData["Загальна сума"] =
    actJsonData["За деталі"] + actJsonData["За роботу"];

  const { error: updateError } = await supabase
    .from("acts")
    .update({ data: actJsonData })
    .eq("act_id", globalCache.currentActId);

  if (updateError) {
    console.error(
      `Помилка оновлення акта ${globalCache.currentActId}:`,
      updateError
    );
    showNotification("Помилка збереження акту", "error");
  } else {
    showNotification("Акт успішно збережено", "success");
    updateCalculatedSumsInFooter();
  }
}

function createRowHtml(
  item: any | null,
  index: number,
  showPibMagazin: boolean,
  showCatalog: boolean
): string {
  const isActClosed = globalCache.isActClosed;
  const isEditable = !isActClosed;
  const isRestricted = userAccessLevel === "Слюсар";

  const dataTypeForName =
    item?.type === "detail" ? "details" : item?.type === "work" ? "works" : "";
  const pibMagazinType = item?.type === "detail" ? "shops" : "slyusars";

  // Зарплата завантажується окремо через initializeSlyusarSalaries()
  const slyusarSumValue = "";

  const catalogCellHTML = showCatalog
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete catalog-cell" data-name="catalog" ${
        item?.sclad_id != null ? `data-sclad-id="${item.sclad_id}"` : ""
      }>${item?.catalog || ""}</td>`
    : "";

  const pibMagazinCellHTML = showPibMagazin
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete pib-magazin-cell" data-name="pib_magazin" data-type="${
        item ? pibMagazinType : ""
      }">${item?.person_or_store || ""}</td>`
    : "";

  return `
    <tr>
      <td class="row-index">${index + 1}</td>
      <td style="position: relative; padding-right: 30px;" class="name-cell">
        <div contenteditable="${isEditable}" class="editable-autocomplete" data-name="name" data-type="${dataTypeForName}" style="display: inline-block; width: 100%; outline: none;">${
    item?.name || ""
  }</div>
        ${
          !isActClosed
            ? `<button class="delete-row-btn" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 18px; padding: 0; margin: 0; z-index: 10; pointer-events: auto; line-height: 1; opacity: 0.6; transition: opacity 0.2s;" title="Видалити рядок">🗑️</button>`
            : ""
        }
      </td>
      ${catalogCellHTML}
      <td contenteditable="${isEditable}" class="text-right editable-autocomplete qty-cell" data-name="id_count">${
    item ? formatNumberWithSpaces(item.quantity) : ""
  }</td>
      ${
        isRestricted
          ? ""
          : `<td contenteditable="${isEditable}" class="text-right editable-autocomplete price-cell" data-name="price">${
              item ? formatNumberWithSpaces(Math.round(item.price)) : ""
            }</td>`
      }
      ${
        isRestricted
          ? ""
          : `<td class="text-right" data-name="sum">${
              item ? formatNumberWithSpaces(Math.round(item.sum)) : ""
            }</td>`
      }
      ${
        isRestricted
          ? ""
          : `<td contenteditable="${isEditable}" class="text-right editable-number slyusar-sum-cell" data-name="slyusar_sum">${slyusarSumValue}</td>`
      }
      ${pibMagazinCellHTML}
    </tr>`;
}

export function generateTableHTML(
  allItems: any[],
  showPibMagazin: boolean
): string {
  const showCatalog = globalCache.settings.showCatalog;
  const isRestricted = userAccessLevel === "Слюсар";

  const catalogColumnHeader = showCatalog ? "<th>Каталог</th>" : "";
  const pibMagazinColumnHeader = showPibMagazin ? "<th>ПІБ _ Магазин</th>" : "";

  const actItemsHtml =
    allItems.length > 0
      ? allItems
          .map((item, index) =>
            createRowHtml(item, index, showPibMagazin, showCatalog)
          )
          .join("")
      : createRowHtml(null, 0, showPibMagazin, showCatalog);

  const sumsFooter = isRestricted
    ? ""
    : `
    <div class="zakaz_narayd-sums-footer">
      <p><strong>За роботу:</strong> <span class="zakaz_narayd-sums-footer-sum" id="total-works-sum">${formatNumberWithSpaces(
        0
      )}</span> грн</p>
      <p><strong>За деталі:</strong> <span class="zakaz_narayd-sums-footer-sum" id="total-details-sum">${formatNumberWithSpaces(
        0
      )}</span> грн</p>
      <p><strong>Загальна сума:</strong> <span class="zakaz_narayd-sums-footer-total" id="total-overall-sum">${formatNumberWithSpaces(
        0
      )}</span> грн</p>
    </div>`;

  const buttons = globalCache.isActClosed
    ? ""
    : `
    <div class="zakaz_narayd-buttons-container${
      isRestricted ? " obmesheniy" : ""
    }">
      <button id="add-row-button" class="action-button add-row-button">➕ Додати рядок</button>
      <button id="save-act-data" class="zakaz_narayd-save-button" style="padding: 0.5rem 1rem;"> 💾 Зберегти зміни</button>
    </div>`;

  const tableHTML = `
  <style>
  @media print {
  .zakaz_narayd-items-table {
    page-break-after: always; /* Забезпечує, щоб вся таблиця могла розриватися після себе, якщо потрібно */
  }

  .zakaz_narayd-items-table thead {
    display: table-header-group; /* Повторює заголовки на кожній сторінці */
    page-break-before: avoid; /* Уникає розриву перед заголовком */
  }

  .zakaz_narayd-items-table tbody tr {
    page-break-inside: avoid; /* Основне правило: запобігає розділенню рядка на сторінках */
    page-break-after: auto; /* Дозволяє природні розриви після рядків */
    page-break-before: auto;
  }

  .zakaz_narayd-items-table tfoot {
    display: table-footer-group; /* Правильно обробляє футери */
    page-break-after: avoid;
  }

  /* Опціонально: Налаштуйте маржини або orphans/widows для кращого контролю */
  @page {
    margin: 1cm; /* Налаштуйте маржини сторінок, якщо потрібно */
  }

  .zakaz_narayd-items-table tbody tr td {
    orphans: 3; /* Мінімальна кількість рядків перед розривом */
    widows: 3; /* Мінімальна кількість рядків після розриву */
  }

  /* Приховайте елементи, які не для друку (наприклад, кнопки) */
  .delete-row-btn, .zakaz_narayd-buttons-container {
    display: none;
  }
}
  </style>
    <div class="zakaz_narayd-table-container-value" id="${ACT_ITEMS_TABLE_CONTAINER_ID}">
      <table class="zakaz_narayd-items-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Найменування</th>
            ${catalogColumnHeader}
            <th class="text-right">К-ть</th>
            ${isRestricted ? "" : '<th class="text-right">Ціна</th>'}
            ${isRestricted ? "" : '<th class="text-right">Сума</th>'}
            ${isRestricted ? "" : '<th class="text-right">Зар-та</th>'}
            ${pibMagazinColumnHeader}
          </tr>
        </thead>
        <tbody>${actItemsHtml}</tbody>
      </table>
      ${sumsFooter}
      ${buttons}
    </div>`;

  setTimeout(() => {
    const saveBtn = document.querySelector<HTMLButtonElement>("#save-act-data");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        await saveActData();
      };
    }
  }, 0);

  return tableHTML;
}

export function addNewRow(containerId: string): void {
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${containerId} tbody`
  );
  if (!tableBody) return;

  const rowCount = tableBody.children.length;
  const showPibMagazin = globalCache.settings.showPibMagazin;
  const showCatalog = globalCache.settings.showCatalog;

  const newRowHTML = createRowHtml(null, rowCount, showPibMagazin, showCatalog);
  tableBody.insertAdjacentHTML("beforeend", newRowHTML);

  if (!globalCache.isActClosed) {
    setupAutocompleteForEditableCells(containerId, globalCache);
  }
  updateCalculatedSumsInFooter();
}

export function updateCalculatedSumsInFooter(): void {
  if (userAccessLevel === "Слюсар") return;

  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`
  );
  if (!tableBody) return;

  const { totalWorksSum, totalDetailsSum } = Array.from(
    tableBody.querySelectorAll("tr")
  ).reduce(
    (sums, row, index) => {
      const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
      const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
      const iconCell = row.querySelector("td:first-child");

      if (!nameCell || !sumCell || !iconCell) return sums;

      const name = nameCell.textContent?.trim() || "";
      const sum = parseNumber(sumCell.textContent);
      let type = nameCell.getAttribute("data-type");

      const works = new Set(globalCache.works);
      const details = new Set(globalCache.details);

      if (!type || (type !== "details" && type !== "works")) {
        const isInWorks = works.has(name);
        const isInDetails = details.has(name);
        type = isInWorks && !isInDetails ? "works" : "details";
        nameCell.setAttribute("data-type", type);
      }

      if (type === "works") {
        sums.totalWorksSum += sum;
        iconCell.textContent = `🛠️ ${index + 1}`;
      } else {
        sums.totalDetailsSum += sum;
        iconCell.textContent = `⚙️ ${index + 1}`;
      }

      return sums;
    },
    { totalWorksSum: 0, totalDetailsSum: 0 }
  );

  const totalOverallSum = totalWorksSum + totalDetailsSum;

  const set = (id: string, val: number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatNumberWithSpaces(Math.round(val));
  };
  set("total-works-sum", totalWorksSum);
  set("total-details-sum", totalDetailsSum);
  set("total-overall-sum", totalOverallSum);
}

export function createTableRow(
  label: string,
  value: string,
  className: string = ""
): string {
  return `<tr><td>${label}</td><td${
    className ? ` class="${className}"` : ""
  }>${value}</td></tr>`;
}

export function createModal(): void {
  const modalOverlay = document.getElementById(ZAKAZ_NARAYD_MODAL_ID);
  if (modalOverlay) return;

  const newModalOverlay = document.createElement("div");
  newModalOverlay.id = ZAKAZ_NARAYD_MODAL_ID;
  newModalOverlay.className = "zakaz_narayd-modal-overlay hidden";
  newModalOverlay.innerHTML = `
    <div class="zakaz_narayd-modal-content">
      <button class="zakaz_narayd-modal-close" id="${ZAKAZ_NARAYD_CLOSE_BTN_ID}">&times;</button>
      <div class="zakaz_narayd-modal-body" id="${ZAKAZ_NARAYD_BODY_ID}"></div>
    </div>`;
  document.body.appendChild(newModalOverlay);

  const closeBtn = newModalOverlay.querySelector<HTMLButtonElement>(
    `#${ZAKAZ_NARAYD_CLOSE_BTN_ID}`
  );
  closeBtn?.addEventListener("click", () => {
    newModalOverlay.classList.add("hidden");
    globalCache.currentActId = null;
  });
}

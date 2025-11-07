// ===== ФАЙЛ: modalUI.ts =====

import {
  globalCache,
  loadGlobalData,
  ZAKAZ_NARAYD_MODAL_ID,
  ZAKAZ_NARAYD_BODY_ID,
  ZAKAZ_NARAYD_CLOSE_BTN_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  formatNumberWithSpaces,
} from "./globalCache";
import {
  setupAutocompleteForEditableCells,
  refreshQtyWarningsIn,
} from "./inhi/kastomna_tabluca";
import { userAccessLevel } from "../tablucya/users";
import { supabase } from "../../vxid/supabaseClient";

function showNotification(message: string, type: string): void {
  console.log(`[${type}] ${message}`);
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
 * Отримує відсоток роботи слюсаря з бази даних або кешу
 */
export async function getSlyusarWorkPercent(
  slyusarName: string
): Promise<number> {
  if (!slyusarName) return 0;

  // Спочатку шукаємо в кеші
  const cached = globalCache.slyusars.find(
    (s) => s.Name?.toLowerCase() === slyusarName.toLowerCase()
  );

  if (cached && typeof cached.ПроцентРоботи === "number") {
    return cached.ПроцентРоботи;
  }

  // Якщо в кеші немає - йдемо в базу даних
  try {
    const { data, error } = await supabase
      .from("slyusars")
      .select("data")
      .eq("data->>Name", slyusarName)
      .maybeSingle();

    if (error) {
      console.error(`Помилка отримання даних слюсаря ${slyusarName}:`, error);
      return 0;
    }

    if (!data?.data) return 0;

    const slyusarData =
      typeof data.data === "string" ? JSON.parse(data.data) : data.data;

    const percent = Number(slyusarData.ПроцентРоботи) || 0;

    // Оновлюємо кеш
    const existingIndex = globalCache.slyusars.findIndex(
      (s) => s.Name?.toLowerCase() === slyusarName.toLowerCase()
    );

    if (existingIndex !== -1) {
      globalCache.slyusars[existingIndex].ПроцентРоботи = percent;
    } else {
      globalCache.slyusars.push({ ...slyusarData, ПроцентРоботи: percent });
    }

    return percent;
  } catch (err) {
    console.error(`Помилка парсингу даних слюсаря ${slyusarName}:`, err);
    return 0;
  }
}

/**
 * Розраховує зарплату слюсаря від суми
 */
export function calculateSlyusarSum(totalSum: number, percent: number): number {
  if (percent <= 0 || totalSum <= 0) return 0;
  return Math.round(totalSum * (percent / 100));
}

/**
 * Оновлює зарплату слюсаря в рядку (async версія)
 */
async function updateSlyusarSalaryInRow(
  row: HTMLTableRowElement
): Promise<void> {
  if (!globalCache.settings.showZarplata) return;

  const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
  const typeFromCell = nameCell?.getAttribute("data-type");
  if (typeFromCell !== "works") {
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;
    if (slyusarSumCell) slyusarSumCell.textContent = "";
    return;
  }

  if (!globalCache.settings.showPibMagazin) return;

  const workName = nameCell?.textContent?.trim();
  const pibCell = row.querySelector('[data-name="pib_magazin"]') as HTMLElement;
  const slyusarName = pibCell?.textContent?.trim();
  const slyusarSumCell = row.querySelector(
    '[data-name="slyusar_sum"]'
  ) as HTMLElement;

  if (!workName || !slyusarName || !slyusarSumCell) return;

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
    slyusarSumCell.textContent = formatNumberWithSpaces(historySalary);
    return;
  }

  // 2. Історії немає - рахуємо від відсотка (ASYNC)
  const percent = await getSlyusarWorkPercent(slyusarName);
  const calculatedSalary = calculateSlyusarSum(totalSum, percent);
  slyusarSumCell.textContent = formatNumberWithSpaces(calculatedSalary);
}

/**
 * Оновлює "Зар-та" для всіх робіт у таблиці з урахуванням історії/відсотків
 * Використовується з modalMain.ts одразу після рендеру модалки.
 */
export function updateAllSlyusarSumsFromHistory(): void {
  if (!globalCache.settings.showZarplata) return;
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

    void updateSlyusarSalaryInRow(row); // ← додай void
  }
}

/**
 * Перераховує суму в рядку і оновлює зарплату слюсаря (async)
 */
/**
 * Перераховує суму в рядку і оновлює зарплату слюсаря (async)
 */
export async function calculateRowSum(row: HTMLTableRowElement): Promise<void> {
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
  if (sumCell) sumCell.textContent = formatNumberWithSpaces(Math.round(sum));

  if (globalCache.settings.showZarplata) {
    await updateSlyusarSalaryInRow(row);
  }
  updateCalculatedSumsInFooter();
}

/**
 * Ініціалізує зарплати слюсарів при завантаженні акту (async)
 */
export async function initializeSlyusarSalaries(): Promise<void> {
  if (!globalCache.settings.showZarplata) return;
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

    const existingValue = slyusarSumCell.textContent?.trim();
    if (existingValue) {
      continue;
    }

    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const totalSum = parseNumber(sumCell?.textContent);

    if (totalSum <= 0) continue;

    const historySalary = getSlyusarSalaryFromHistory(
      slyusarName,
      workName,
      actId
    );

    if (historySalary !== null) {
      slyusarSumCell.textContent = formatNumberWithSpaces(historySalary);
      continue;
    }

    // ASYNC отримання відсотка
    const percent = await getSlyusarWorkPercent(slyusarName);
    const calculatedSalary = calculateSlyusarSum(totalSum, percent);
    slyusarSumCell.textContent = formatNumberWithSpaces(calculatedSalary);
  }
}

/**
 * Перевіряє попередження про зарплату при завантаженні
 */
export function checkSlyusarSalaryWarnings(): void {
  if (!globalCache.settings.showZarplata) return;
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

function createRowHtml(
  item: any | null,
  index: number,
  showPibMagazin: boolean,
  showCatalog: boolean,
  showZarplata: boolean
): string {
  const isActClosed = globalCache.isActClosed;
  const isEditable = !isActClosed;
  const isRestricted = userAccessLevel === "Слюсар";

  const dataTypeForName =
    item?.type === "detail" ? "details" : item?.type === "work" ? "works" : "";
  const pibMagazinType = item?.type === "detail" ? "shops" : "slyusars";

  // ← БЕЗПЕЧНЕ ОТРИМАННЯ ЗНАЧЕНЬ з перевіркою
  const catalogValue = showCatalog ? item?.catalog || "" : "";
  const pibMagazinValue = showPibMagazin ? item?.person_or_store || "" : "";
  const scladIdAttr =
    showCatalog && item?.sclad_id != null
      ? `data-sclad-id="${item.sclad_id}"`
      : "";

  const slyusarSumValue = ""; // Завантажується окремо

  const catalogCellHTML = showCatalog
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete catalog-cell" data-name="catalog" ${scladIdAttr}>${catalogValue}</td>`
    : "";

  const pibMagazinCellHTML = showPibMagazin
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete pib-magazin-cell" data-name="pib_magazin" data-type="${
        item ? pibMagazinType : ""
      }">${pibMagazinValue}</td>`
    : "";

  const zarplataCellHTML =
    showZarplata && !isRestricted
      ? `<td contenteditable="${isEditable}" class="text-right editable-number slyusar-sum-cell" data-name="slyusar_sum">${slyusarSumValue}</td>`
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
      ${zarplataCellHTML}
      ${pibMagazinCellHTML}
    </tr>`;
}

export function generateTableHTML(
  allItems: any[],
  showPibMagazin: boolean
): string {
  const showCatalog = globalCache.settings.showCatalog;
  const showZarplata = globalCache.settings.showZarplata;
  const isRestricted = userAccessLevel === "Слюсар";

  const catalogColumnHeader = showCatalog ? "<th>Каталог</th>" : "";
  const pibMagazinColumnHeader = showPibMagazin ? "<th>ПІБ _ Магазин</th>" : "";
  const zarplataColumnHeader =
    showZarplata && !isRestricted ? "<th>Зар-та</th>" : "";

  const actItemsHtml =
    allItems.length > 0
      ? allItems
          .map((item, index) =>
            createRowHtml(
              item,
              index,
              showPibMagazin,
              showCatalog,
              showZarplata
            )
          )
          .join("")
      : createRowHtml(null, 0, showPibMagazin, showCatalog, showZarplata);

  const sumsFooter = isRestricted
    ? ""
    : `
  <div class="zakaz_narayd-sums-footer">
    <p class="sum-row">
      <span class="sum-label">Аванс:</span>
      <input 
        type="text"
        id="editable-avans"
        class="editable-avans-input sum-value"
        value="0"
        placeholder="0"
      />
      <span class="sum-currency">грн</span>
    </p>
      <p><strong>За роботу:</strong> <span class="zakaz_narayd-sums-footer-sum" id="total-works-sum">${formatNumberWithSpaces(
        0
      )}</span> грн</p>
      <p><strong>За деталі:</strong> <span class="zakaz_narayd-sums-footer-sum" id="total-details-sum">${formatNumberWithSpaces(
        0
      )}</span> грн</p>
      <p id="overall-sum-line"><strong>Загальна сума:</strong> <span class="zakaz_narayd-sums-footer-total" id="total-overall-sum">${formatNumberWithSpaces(
        0
      )}</span> грн<span id="avans-subtract-display" class="avans-subtract-display" style="display: none;"></span><span id="final-sum-display" class="final-sum-display" style="display: none;"></span></p>
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
            ${zarplataColumnHeader}
            ${pibMagazinColumnHeader}
          </tr>
        </thead>
        <tbody>${actItemsHtml}</tbody>
      </table>
      ${sumsFooter}
      ${buttons}
    </div>`;

  setTimeout(() => {
    const avans = document.getElementById(
      "editable-avans"
    ) as HTMLInputElement | null;
    if (!avans) return;

    // утиліти
    const unformat = (s: string) => s.replace(/\s+/g, ""); // забрати пробіли
    const format = (num: number) => {
      const str = String(num);
      return str.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    };

    // автопідгін ширини
    const autoFit = () => {
      const visibleLen = (avans.value || avans.placeholder || "0").length;
      const ch = Math.min(Math.max(visibleLen, 3), 16);
      avans.style.width = ch + "ch";
    };

    // КРИТИЧНО: форматуємо початкове значення як ЧИСЛО
    const initialValue = parseInt(unformat(avans.value) || "0");
    avans.value = format(initialValue);
    autoFit();
    updateFinalSumWithAvans();

    // м'яке форматування під час вводу
    const onInput = () => {
      const selEndBefore = avans.selectionEnd ?? avans.value.length;
      const digitsBefore = unformat(avans.value.slice(0, selEndBefore)).length;

      // Парсимо як число і форматуємо
      const numValue = parseInt(unformat(avans.value) || "0");
      avans.value = format(numValue);
      autoFit();

      let idx = 0,
        digitsSeen = 0;
      while (idx < avans.value.length && digitsSeen < digitsBefore) {
        if (/\d/.test(avans.value[idx])) digitsSeen++;
        idx++;
      }
      avans.setSelectionRange(idx, idx);

      updateFinalSumWithAvans();
    };

    const onBlur = () => {
      const numValue = parseInt(unformat(avans.value) || "0");
      avans.value = format(numValue);
      autoFit();
      updateFinalSumWithAvans();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const allowed =
        /\d/.test(e.key) ||
        [
          "Backspace",
          "Delete",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Tab",
        ].includes(e.key);
      if (!allowed) {
        e.preventDefault();
      }
    };

    avans.addEventListener("keydown", onKeyDown);
    avans.addEventListener("input", onInput);
    avans.addEventListener("blur", onBlur);
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
  const showZarplata = globalCache.settings.showZarplata; // ← ДОДАНО

  const newRowHTML = createRowHtml(
    null,
    rowCount,
    showPibMagazin,
    showCatalog,
    showZarplata
  ); // ← ДОДАНО ПАРАМЕТР
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

  // Оновлюємо відображення з урахуванням авансу
  updateFinalSumWithAvans();
}

function parseNumber(text: string | null | undefined): number {
  return parseFloat((text ?? "0").replace(/\s/g, "").replace(",", ".")) || 0;
}

function updateFinalSumWithAvans(): void {
  const avansInput = document.getElementById(
    "editable-avans"
  ) as HTMLInputElement;
  const overallSumSpan = document.getElementById("total-overall-sum");
  const avansSubtractDisplay = document.getElementById(
    "avans-subtract-display"
  );
  const finalSumDisplay = document.getElementById("final-sum-display");

  if (
    !avansInput ||
    !overallSumSpan ||
    !avansSubtractDisplay ||
    !finalSumDisplay
  )
    return;

  const avans = parseNumber(avansInput.value);
  const overallSum = parseNumber(overallSumSpan.textContent);

  if (avans > 0) {
    const finalSum = overallSum - avans;

    // Показуємо формулу: загальна сума - аванс = фінальна сума
    avansSubtractDisplay.textContent = ` - ${formatNumberWithSpaces(
      Math.round(avans)
    )} грн`;
    avansSubtractDisplay.style.color = "#2e7d32";
    avansSubtractDisplay.style.display = "inline";

    finalSumDisplay.textContent = ` = ${formatNumberWithSpaces(
      Math.round(finalSum)
    )} грн`;
    finalSumDisplay.style.color = "#1a73e8";
    finalSumDisplay.style.display = "inline";
  } else {
    // Якщо аванс = 0, ховаємо формулу
    avansSubtractDisplay.style.display = "none";
    finalSumDisplay.style.display = "none";
  }
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

if (!(window as any).__otherBasesHandlerBound__) {
  document.addEventListener("other-base-data-updated", async () => {
    await loadGlobalData();
    const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
    if (container) {
      setupAutocompleteForEditableCells(
        ACT_ITEMS_TABLE_CONTAINER_ID,
        globalCache
      );
      await refreshQtyWarningsIn(ACT_ITEMS_TABLE_CONTAINER_ID);
      updateCalculatedSumsInFooter();
    }
  });
  (window as any).__otherBasesHandlerBound__ = true;
}

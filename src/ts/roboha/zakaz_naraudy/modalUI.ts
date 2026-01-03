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
import { userAccessLevel, canUserAddRowToAct } from "../tablucya/users";
import { supabase } from "../../vxid/supabaseClient";
import { cleanupSlusarsOnSubscription } from "./modalMain";

// Утилиты для форматирования чисел с пробелами
const unformat = (s: string) => s.replace(/\s+/g, "");
const format = (num: number) => {
  const str = String(num);
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

function showNotification(message: string, type: string): void {
  console.log(`[${type}] ${message}`);
}

function expandName(shortenedName: string): string {
  if (!shortenedName || !shortenedName.includes(".....")) return shortenedName;

  const allNames = [...globalCache.works, ...globalCache.details];
  const [firstPart, lastPart] = shortenedName.split(".....");

  const fullName = allNames.find((name) => {
    const sentences = name
      .split(/(?<=\.)\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length < 2) return false;
    const lastSentence = sentences[sentences.length - 1];
    return (
      name.startsWith(firstPart) &&
      (name.endsWith(lastPart) || lastSentence === lastPart)
    );
  });

  return fullName || shortenedName;
}

/**
 * Отримує зарплату з історії слюсаря для конкретної роботи та акту
 * @param slyusarName - ім'я слюсаря
 * @param workName - назва роботи
 * @param actId - номер акту (ОБОВ'ЯЗКОВИЙ параметр)
 */
function getSlyusarSalaryFromHistory(
  slyusarName: string,
  workName: string,
  actId: number | null
): number | null {
  if (!slyusarName || !workName || !actId) {
    console.log(
      "❌ getSlyusarSalaryFromHistory: відсутні обов'язкові параметри",
      {
        slyusarName,
        workName,
        actId,
      }
    );
    return null;
  }

  const slyusar = globalCache.slyusars.find(
    (s) => s.Name?.toLowerCase() === slyusarName.toLowerCase()
  );

  if (!slyusar?.["Історія"]) {
    console.log(`⚠️ Слюсар "${slyusarName}" не знайдений або немає історії`);
    return null;
  }

  const history = slyusar["Історія"];
  const targetActId = String(actId);

  console.log(`🔍 Шукаємо зарплату для:`, {
    slyusarName,
    workName,
    actId: targetActId,
    isShortened: workName.includes("....."), // ← ДОДАНО
  });

  // ← ДОДАНО: Розгортаємо скорочену назву
  const fullWorkName = expandName(workName);
  console.log(`📝 Розгорнута назва: "${fullWorkName}"`);

  for (const dateKey in history) {
    const dayBucket = history[dateKey];
    if (!Array.isArray(dayBucket)) continue;

    for (const actEntry of dayBucket) {
      const entryActId = String(actEntry?.["Акт"] || "");

      if (entryActId !== targetActId) continue;

      console.log(`✅ Знайдено акт ${targetActId} в даті ${dateKey}`);

      const zapisi = actEntry?.["Записи"];
      if (!Array.isArray(zapisi)) {
        console.log(`⚠️ Немає записів в акті ${targetActId}`);
        continue;
      }

      // ← ВИПРАВЛЕНО: Порівнюємо як скорочену, так і повну назву
      const workRecord = zapisi.find((z: any) => {
        const recordWork = z.Робота?.trim() || "";
        const recordWorkLower = recordWork.toLowerCase();
        const workNameLower = workName.toLowerCase();
        const fullWorkNameLower = fullWorkName.toLowerCase();

        return (
          recordWorkLower === workNameLower ||
          recordWorkLower === fullWorkNameLower
        );
      });

      if (workRecord) {
        const salary = workRecord.Зарплата;
        console.log(`💰 Знайдено зарплату для "${workName}":`, salary);

        if (typeof salary === "number") {
          return salary;
        }
      }
    }
  }

  console.log(
    `❌ Зарплату не знайдено для акту ${targetActId}, роботи "${workName}"`
  );
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
 * Оновлює зарплату слюсаря в рядку (async версія) - ВИПРАВЛЕНА ВЕРСІЯ 2.0
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

  const actId = globalCache.currentActId;

  if (!actId) {
    console.warn("⚠️ globalCache.currentActId не встановлено!");
    return;
  }

  console.log(`🔄 Оновлення зарплати для рядка:`, {
    actId,
    slyusarName,
    workName,
    totalSum,
  });

  // 1. ПРІОРИТЕТ: Шукаємо в історії для ПОТОЧНОГО акту
  const historySalary = getSlyusarSalaryFromHistory(
    slyusarName,
    workName,
    actId
  );

  if (historySalary !== null) {
    console.log(`✅ Встановлюємо зарплату з історії: ${historySalary}`);
    slyusarSumCell.textContent = formatNumberWithSpaces(historySalary);
    return;
  }

  // 2. ВИПРАВЛЕННЯ: Якщо в історії немає І totalSum <= 0 - очищуємо
  if (totalSum <= 0) {
    console.log(`⚠️ Сума <= 0 і немає даних в історії - очищуємо`);
    slyusarSumCell.textContent = "";
    return;
  }

  // 3. Якщо є сума, але немає в історії - рахуємо від відсотка
  console.log(`⚙️ Зарплати в історії немає, рахуємо від відсотка`);
  const percent = await getSlyusarWorkPercent(slyusarName);
  const calculatedSalary = calculateSlyusarSum(totalSum, percent);
  console.log(`💰 Розрахована зарплата: ${calculatedSalary} (${percent}%)`);
  slyusarSumCell.textContent = formatNumberWithSpaces(calculatedSalary);
}

/**
 * Ініціалізує зарплати слюсарів при завантаженні акту - ВИПРАВЛЕНА ВЕРСІЯ 2.0
 */
export async function initializeSlyusarSalaries(): Promise<void> {
  if (!globalCache.settings.showZarplata) return;

  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`
  );
  if (!tableBody) return;

  const actId = globalCache.currentActId;

  if (!actId) {
    console.warn("⚠️ initializeSlyusarSalaries: actId не встановлено");
    return;
  }

  console.log(`🚀 Ініціалізація зарплат для акту ${actId}`);

  const rows = Array.from(
    tableBody.querySelectorAll<HTMLTableRowElement>("tr")
  );

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

    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const totalSum = parseNumber(sumCell?.textContent);

    console.log(`🔍 Обробка роботи "${workName}" для "${slyusarName}"`);

    // КРИТИЧНО: Завжди шукаємо в історії ПЕРШИМ
    const historySalary = getSlyusarSalaryFromHistory(
      slyusarName,
      workName,
      actId
    );

    if (historySalary !== null) {
      console.log(`✅ Встановлено з історії: ${historySalary}`);
      slyusarSumCell.textContent = formatNumberWithSpaces(historySalary);
      continue; // ← ВАЖЛИВО: переходимо до наступного рядка
    }

    // ВИПРАВЛЕННЯ: Якщо немає в історії і сума <= 0 - пропускаємо
    if (totalSum <= 0) {
      console.log(`⏭️ Сума <= 0 і немає в історії - пропускаємо`);
      continue;
    }

    // Якщо немає в історії, але є сума - рахуємо від відсотка
    console.log(`⚙️ Розрахунок від відсотка`);
    const percent = await getSlyusarWorkPercent(slyusarName);
    const calculatedSalary = calculateSlyusarSum(totalSum, percent);
    console.log(`💰 Розраховано: ${calculatedSalary} (${percent}%)`);
    slyusarSumCell.textContent = formatNumberWithSpaces(calculatedSalary);
  }

  console.log(`✅ Ініціалізація зарплат завершена для акту ${actId}`);
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

    void updateSlyusarSalaryInRow(row);
  }
}

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
  if (sumCell)
    sumCell.textContent =
      sum === 0 ? "" : formatNumberWithSpaces(Math.round(sum));

  if (globalCache.settings.showZarplata) {
    await updateSlyusarSalaryInRow(row);
  }
  updateCalculatedSumsInFooter();
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
  canDelete: boolean = true // <--- НОВИЙ ПАРАМЕТР
): string {
  const isActClosed = globalCache.isActClosed;
  const isEditable = !isActClosed;

  const dataTypeForName =
    item?.type === "detail" ? "details" : item?.type === "work" ? "works" : "";
  const pibMagazinType = item?.type === "detail" ? "shops" : "slyusars";

  const catalogValue = showCatalog ? item?.catalog || "" : "";
  const pibMagazinValue = showPibMagazin ? item?.person_or_store || "" : "";
  const scladIdAttr =
    showCatalog && item?.sclad_id != null
      ? `data-sclad-id="${item.sclad_id}"`
      : "";

  const slyusarSumValue = "";

  const catalogCellHTML = showCatalog
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete catalog-cell" data-name="catalog" ${scladIdAttr}>${catalogValue}</td>`
    : "";

  const pibMagazinCellHTML = showPibMagazin
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete pib-magazin-cell" data-name="pib_magazin" data-type="${
        item ? pibMagazinType : ""
      }">${pibMagazinValue}</td>`
    : "";

  /* ===== ЗМІНИ: відображення пустоти замість 0 ===== */
  const priceValue =
    item && typeof item.price === "number" && item.price !== 0
      ? formatNumberWithSpaces(Math.round(item.price))
      : "";
  const sumValue =
    item && typeof item.sum === "number" && item.sum !== 0
      ? formatNumberWithSpaces(Math.round(item.sum))
      : "";

  // ⚡ ВАЖЛИВО: завжди створюємо комірки "Ціна" і "Сума",
  // а показ/приховування робимо через JS (togglePriceColumnsVisibility)
  const priceCellHTML = `<td data-col="price" contenteditable="${isEditable}" class="text-right editable-autocomplete price-cell" data-name="price">${priceValue}</td>`;

  const sumCellHTML = `<td data-col="sum" class="text-right" data-name="sum">${sumValue}</td>`;

  const showZarplata = globalCache.settings.showZarplata;
  const canEditZarplata = isEditable && showZarplata; // акт відкритий і стовпець увімкнено

  const zarplataCellHTML = showZarplata
    ? `<td contenteditable="${canEditZarplata}"
        class="text-right editable-number slyusar-sum-cell"
        data-name="slyusar_sum">
       ${slyusarSumValue}
     </td>`
    : "";

  // 🔽 ЛОГІКА ВИДАЛЕННЯ:
  // Кнопка показується ТІЛЬКИ якщо акт відкритий І користувач має права (canDelete)
  const showDeleteBtn = !isActClosed && canDelete;

  return `
    <tr>
      <td class="row-index">${
        item?.type === "work"
          ? `🛠️ ${index + 1}`
          : item?.type === "detail"
          ? `⚙️ ${index + 1}`
          : `${index + 1}`
      }</td>
      <td style="position: relative; padding-right: 30px;" class="name-cell">
        <div contenteditable="${isEditable}" class="editable-autocomplete" data-name="name" data-type="${dataTypeForName}" style="display: inline-block; width: 100%; outline: none; min-width: 50px;">${
    item?.name || ""
  }</div>
        ${
          showDeleteBtn
            ? `<button class="delete-row-btn" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 18px; padding: 0; margin: 0; z-index: 10; pointer-events: auto; line-height: 1; opacity: 0.6; transition: opacity 0.2s;" title="Видалити рядок">🗑️</button>`
            : ""
        }
      </td>
      ${catalogCellHTML}
      <td contenteditable="${isEditable}" class="text-right editable-autocomplete qty-cell" data-name="id_count">${
    item && item.quantity ? formatNumberWithSpaces(item.quantity) : ""
  }</td>
      ${priceCellHTML}
      ${sumCellHTML}
      ${zarplataCellHTML}
      ${pibMagazinCellHTML}
    </tr>`;
}

export function generateTableHTML(
  allItems: any[],
  showPibMagazin: boolean,
  canAddRow: boolean = true
): string {
  const showCatalog = globalCache.settings.showCatalog;
  const showZarplata = globalCache.settings.showZarplata;
  const isRestricted = userAccessLevel === "Слюсар";

  const catalogColumnHeader = showCatalog ? "<th>Каталог</th>" : "";
  const pibMagazinColumnHeader = showPibMagazin ? "<th>ПІБ _ Магазин</th>" : "";
  const zarplataColumnHeader = showZarplata ? "<th>Зар-та</th>" : "";

  // ⚡ НОВЕ: заголовки для "Ціна" і "Сума" з data-col
  const priceColumnHeader = '<th class="text-right" data-col="price">Ціна</th>';
  const sumColumnHeader = '<th class="text-right" data-col="sum">Сума</th>';

  const actItemsHtml =
    allItems.length > 0
      ? allItems
          .map(
            (item, index) =>
              createRowHtml(item, index, showPibMagazin, showCatalog, canAddRow) // <--- ПЕРЕДАЄМО canAddRow
          )
          .join("")
      : createRowHtml(null, 0, showPibMagazin, showCatalog, canAddRow); // <--- ПЕРЕДАЄМО canAddRow

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
        autocomplete="off"
      />
      <span class="sum-currency">грн</span>
    </p>
    <p><strong>За роботу:</strong> <span class="zakaz_narayd-sums-footer-sum" id="total-works-sum">${formatNumberWithSpaces(
      0
    )}</span> грн</p>
    <p><strong>За деталі:</strong> <span class="zakaz_narayd-sums-footer-sum" id="total-details-sum">${formatNumberWithSpaces(
      0
    )}</span> грн</p>
    <p class="sum-row">
      <span class="sum-label">Знижка:</span>
      <input 
        type="text"
        id="editable-discount"
        class="editable-discount-input sum-value"
        value="0"
        placeholder="0"
        autocomplete="off"
      />
      <span class="sum-currency">%</span>
    </p>
    <p id="overall-sum-line"><strong>Загальна сума:</strong> <span class="zakaz_narayd-sums-footer-total" id="total-overall-sum">${formatNumberWithSpaces(
      0
    )}</span> грн<span id="avans-subtract-display" class="avans-subtract-display" style="display: none;"></span><span id="final-sum-display" class="final-sum-display" style="display: none;"></span></p>
  </div>`;

  const buttons =
    globalCache.isActClosed || !canAddRow
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
            ${priceColumnHeader}
            ${sumColumnHeader}
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
    const discount = document.getElementById(
      "editable-discount"
    ) as HTMLInputElement | null;

    if (!avans && !discount) return;

    // Обробник для Авансу
    if (avans) {
      const autoFitAvans = () => {
        const visibleLen = (avans.value || avans.placeholder || "0").length;
        const ch = Math.min(Math.max(visibleLen, 3), 16);
        avans.style.width = ch + "ch";
      };

      const initialValue = parseInt(unformat(avans.value) || "0");
      avans.value = format(initialValue);
      autoFitAvans();
      updateFinalSumWithAvans();

      const onInputAvans = () => {
        const selEndBefore = avans.selectionEnd ?? avans.value.length;
        const digitsBefore = unformat(
          avans.value.slice(0, selEndBefore)
        ).length;

        const numValue = parseInt(unformat(avans.value) || "0");
        avans.value = format(numValue);
        autoFitAvans();

        let idx = 0,
          digitsSeen = 0;
        while (idx < avans.value.length && digitsSeen < digitsBefore) {
          if (/\d/.test(avans.value[idx])) digitsSeen++;
          idx++;
        }
        avans.setSelectionRange(idx, idx);

        updateFinalSumWithAvans();
      };

      const onBlurAvans = () => {
        const numValue = parseInt(unformat(avans.value) || "0");
        avans.value = format(numValue);
        autoFitAvans();
        updateFinalSumWithAvans();
      };

      const onKeyDownAvans = (e: KeyboardEvent) => {
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

      avans.addEventListener("keydown", onKeyDownAvans);
      avans.addEventListener("input", onInputAvans);
      avans.addEventListener("blur", onBlurAvans);
    }

    // Обробник для Знижки
    if (discount) {
      const autoFitDiscount = () => {
        const visibleLen = (discount.value || discount.placeholder || "0")
          .length;
        const ch = Math.min(Math.max(visibleLen, 3), 16);
        discount.style.width = ch + "ch";
      };

      let initialValue = parseInt(unformat(discount.value) || "0");
      // Обмежуємо до 100% при ініціалізації
      initialValue = Math.min(100, Math.max(0, initialValue));
      discount.value = format(initialValue);
      autoFitDiscount();
      updateFinalSumWithAvans();

      const onInputDiscount = () => {
        const selEndBefore = discount.selectionEnd ?? discount.value.length;
        const digitsBefore = unformat(
          discount.value.slice(0, selEndBefore)
        ).length;

        let numValue = parseInt(unformat(discount.value) || "0");
        // Обмежуємо до 100% при ручному вводі
        numValue = Math.min(100, Math.max(0, numValue));
        discount.value = format(numValue);
        autoFitDiscount();

        let idx = 0,
          digitsSeen = 0;
        while (idx < discount.value.length && digitsSeen < digitsBefore) {
          if (/\d/.test(discount.value[idx])) digitsSeen++;
          idx++;
        }
        discount.setSelectionRange(idx, idx);

        updateFinalSumWithAvans();
      };

      const onBlurDiscount = () => {
        let numValue = parseInt(unformat(discount.value) || "0");
        // Обмежуємо до 100% при розфокусуванні
        numValue = Math.min(100, Math.max(0, numValue));
        discount.value = format(numValue);
        autoFitDiscount();
        updateFinalSumWithAvans();
      };

      const onKeyDownDiscount = (e: KeyboardEvent) => {
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

      discount.addEventListener("keydown", onKeyDownDiscount);
      discount.addEventListener("input", onInputDiscount);
      discount.addEventListener("blur", onBlurDiscount);
    }
  }, 0);

  return tableHTML;
}

/**
 * Приховує або показує кнопки "➕ Додати рядок" та "💾 Зберегти зміни" на основі прав користувача
 * Викликається після рендерингу модального вікна
 * Для Запчастиста та Складовщика обидві кнопки керуються однією перевіркою прав
 */
export async function toggleAddRowButtonVisibility(): Promise<void> {
  const addRowButton = document.getElementById("add-row-button");
  const saveButton = document.getElementById("save-act-data");

  // Якщо кнопок немає (акт закритий) - нічого не робимо
  if (!addRowButton && !saveButton) {
    return;
  }

  try {
    const canAdd = await canUserAddRowToAct();

    if (!canAdd) {
      // Приховуємо обидві кнопки
      if (addRowButton) {
        addRowButton.style.display = "none";
      }
      if (saveButton) {
        saveButton.style.display = "none";
      }
      console.log(
        "🚫 Кнопки 'Додати рядок' та 'Зберегти зміни' приховано (немає прав доступу)"
      );
    } else {
      // Показуємо обидві кнопки
      if (addRowButton) {
        addRowButton.style.display = "";
      }
      if (saveButton) {
        saveButton.style.display = "";
      }
      console.log("✅ Кнопки 'Додати рядок' та 'Зберегти зміни' доступні");
    }
  } catch (error) {
    console.error("❌ Помилка при перевірці прав на додавання рядків:", error);
    // У випадку помилки - показуємо кнопки (безпечніший варіант)
    if (addRowButton) {
      addRowButton.style.display = "";
    }
    if (saveButton) {
      saveButton.style.display = "";
    }
  }
}

export function addNewRow(containerId: string): void {
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    `#${containerId} tbody`
  );
  if (!tableBody) return;

  const rowCount = tableBody.children.length;
  const showPibMagazin = globalCache.settings.showPibMagazin;
  const showCatalog = globalCache.settings.showCatalog;

  // При додаванні нового рядка кнопкою, ми явно маємо право (кнопка була доступна)
  // тому canDelete = true
  const newRowHTML = createRowHtml(
    null,
    rowCount,
    showPibMagazin,
    showCatalog,
    true
  );
  tableBody.insertAdjacentHTML("beforeend", newRowHTML);

  // Focus the new row's Name input
  const lastRow = tableBody.lastElementChild as HTMLElement;
  if (lastRow) {
    const nameInput = lastRow.querySelector(
      '[data-name="name"]'
    ) as HTMLElement;
    if (nameInput) {
      nameInput.focus();
    }
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

        // If name is present, try to deduce type
        if (name.length > 0) {
          if (isInDetails && !isInWorks) {
            type = "details";
          } else if (isInWorks && !isInDetails) {
            type = "works";
          } else {
            type = "works"; // default to works if ambiguous but has name
          }
          nameCell.setAttribute("data-type", type);
        } else {
          // Name is empty -> Neutral. Do not set type.
          type = null;
        }
      }

      // Update Icons only if type is known
      if (type === "works") {
        sums.totalWorksSum += sum;
        iconCell.textContent = `🛠️ ${index + 1}`;
      } else if (type === "details") {
        sums.totalDetailsSum += sum;
        iconCell.textContent = `⚙️ ${index + 1}`;
      } else {
        // Neutral
        iconCell.textContent = `${index + 1}`;
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

  updateFinalSumWithAvans();
}

function parseNumber(text: string | null | undefined): number {
  return parseFloat((text ?? "0").replace(/\s/g, "").replace(",", ".")) || 0;
}

function updateFinalSumWithAvans(): void {
  const avansInput = document.getElementById(
    "editable-avans"
  ) as HTMLInputElement;
  const discountInput = document.getElementById(
    "editable-discount"
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
  const discountPercent = parseNumber(discountInput?.value || "0");
  const overallSum = parseNumber(overallSumSpan.textContent);

  // Розраховуємо суму знижки як відсоток від загальної суми
  const discountAmount = (overallSum * discountPercent) / 100;
  const sumAfterDiscount = overallSum - discountAmount;
  const finalSum = sumAfterDiscount - avans;

  let displayText = "";

  // Спочатку знижка (червона), потім аванс (зелений)
  if (discountPercent > 0) {
    displayText += ` - <input type="text" id="editable-discount-amount" class="editable-discount-amount" value="${formatNumberWithSpaces(
      Math.round(discountAmount)
    )}" style="color: #d32f2f; font-weight: 700; border: none; background: transparent; width: auto; padding: 0; margin: 0; font-size: inherit;" /> <span style="color: #d32f2f; font-weight: 700;">грн (знижка)</span>`;
  }

  if (avans > 0) {
    displayText += ` - <span style="color: #2e7d32; font-weight: 700;">${formatNumberWithSpaces(
      Math.round(avans)
    )} грн (аванс)</span>`;
  }

  if (discountPercent > 0 || avans > 0) {
    avansSubtractDisplay.innerHTML = displayText;
    avansSubtractDisplay.style.display = "inline";

    // Додаємо обробник для редагування суми знижки
    if (discountPercent > 0) {
      const discountAmountInput = avansSubtractDisplay.querySelector(
        "#editable-discount-amount"
      ) as HTMLInputElement | null;
      if (discountAmountInput) {
        // Встановлюємо ширину input в залежності від значення
        const autoFitInput = () => {
          const visibleLen = (discountAmountInput.value || "0").length;
          const ch = Math.min(Math.max(visibleLen, 3), 16);
          discountAmountInput.style.width = ch + "ch";
        };
        autoFitInput();

        const onInputDiscount = () => {
          // При вводі НЕ форматуємо - тільки дозволяємо вводити цифри
          // Форматування буде тільки при blur (вихід з інпута)
        };

        const onBlurDiscount = () => {
          let numValue = parseInt(unformat(discountAmountInput.value) || "0");

          // Перевіряємо не більша ли сума від загальної суми
          if (numValue > overallSum) {
            numValue = overallSum;
          }

          // Форматуємо число з пробілами
          discountAmountInput.value = format(numValue);
          autoFitInput();

          // Розраховуємо відсоток на основі нової суми
          // ВАЖЛИВО: Перераховуємо відсоток ТІЛЬКИ якщо сума досягає величини цілого відсотка
          // Інакше залишаємо поточний відсоток без змін
          const discountInputEl = document.getElementById(
            "editable-discount"
          ) as HTMLInputElement;

          if (discountInputEl && overallSum > 0) {
            const newPercent = Math.round((numValue / overallSum) * 100);
            const expectedAmountForNewPercent = Math.round(
              (newPercent / 100) * overallSum
            );

            // Якщо сума достатня для нового цілого відсотка, оновлюємо його
            if (
              numValue >= expectedAmountForNewPercent ||
              numValue >= overallSum
            ) {
              discountInputEl.value = String(newPercent);
              discountInputEl.dispatchEvent(new Event("input"));
            }
            // Інакше залишаємо поточний процент без змін
          }
        };

        const onKeyDownDiscount = (e: KeyboardEvent) => {
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

        discountAmountInput.addEventListener("keydown", onKeyDownDiscount);
        discountAmountInput.addEventListener("input", onInputDiscount);
        discountAmountInput.addEventListener("blur", onBlurDiscount);
      }
    }

    finalSumDisplay.textContent = ` = ${formatNumberWithSpaces(
      Math.round(finalSum)
    )} грн`;
    finalSumDisplay.style.color = "#1a73e8";
    finalSumDisplay.style.display = "inline";
  } else {
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
    // ✅ Очищуємо приймальника з localStorage при закритті модального вікна
    localStorage.removeItem("current_act_pruimalnyk");
    console.log(
      "🗑️ Очищено приймальника з localStorage при закритті модального вікна"
    );
    // 🧹 Очищуємо Realtime підписку на slusarsOn
    cleanupSlusarsOnSubscription();
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

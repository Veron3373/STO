// src\ts\roboha\zakaz_naraudy\modalUI.ts
import {
  globalCache,
  ZAKAZ_NARAYD_MODAL_ID,
  ZAKAZ_NARAYD_BODY_ID,
  ZAKAZ_NARAYD_CLOSE_BTN_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  formatNumberWithSpaces,
} from "./globalCache";
import { setupAutocompleteForEditableCells } from "./inhi/kastomna_tabluca";
import { userAccessLevel } from "../tablucya/users"; // Імпорт рівня доступу користувача

function parseNumber(text: string | null): number {
  return parseFloat(text?.replace(/\s/g, "") || "0") || 0;
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

  const catalogCellHTML = showCatalog
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete catalog-cell" data-name="catalog" ${
        item?.sclad_id != null ? `data-sclad-id="${item.sclad_id}"` : ""
      }>${item?.catalog || ""}</td>`
    : "";

  const pibMagazinCellHTML = showPibMagazin
    ? `<td contenteditable="${isEditable}" class="editable-autocomplete" data-name="pib_magazin" data-type="${
        item ? pibMagazinType : ""
      }">${item?.person_or_store || ""}</td>`
    : "";

  return `
    <tr>
      <td class="row-index">${index + 1}</td>
      <td contenteditable="${isEditable}" class="editable-autocomplete" data-name="name" data-type="${dataTypeForName}">${
    item?.name || ""
  }</td>
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
      isRestricted ? "obmesheniy" : ""
    }">
      <button id="add-row-button" class="action-button add-row-button">➕ Додати рядок</button>
      <button id="save-act-data" class="zakaz_narayd-save-button" style="padding: 0.5rem 1rem;"> 💾 Зберегти зміни</button>
    </div>`;

  return `
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
            ${pibMagazinColumnHeader}
          </tr>
        </thead>
        <tbody>${actItemsHtml}</tbody>
      </table>
      ${sumsFooter}
      ${buttons}
    </div>`;
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
  if (userAccessLevel === "Слюсар") return; // Skip footer updates for restricted users

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

// ✅ ПОВЕРНУВ ЕКСПОРТ
export function createTableRow(
  label: string,
  value: string,
  className: string = ""
): string {
  return `<tr><td>${label}</td><td${
    className ? ` class="${className}"` : ""
  }>${value}</td></tr>`;
}

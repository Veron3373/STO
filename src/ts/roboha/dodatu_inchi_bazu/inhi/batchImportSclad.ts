// src\ts\roboha\dodatu_inchi_bazu\inhi\batchImportSclad.ts
// === Guards for single init / single upload ===
let batchInitDone = false; // щоб не ініціалізувати слухачі повторно
let isUploading = false; // щоб не запустити upload кілька разів

import { CRUD, updateCRUD } from "../dodatu_inchi_bazu_danux";
import {
  shopEditState,
  detailEditState,
  resetShopState,
  resetDetailState,
} from "./scladMagasunDetal";
import { tryHandleShopsCrud, tryHandleDetailsCrud } from "../db_shops_details";
import { handleScladCrud } from "../db_sclad";
import { showNotification } from "../../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { supabase } from "../../../vxid/supabaseClient";
const batchModalId = "batch-import-modal-Excel";
const confirmModalId = "batch-confirm-modal-Excel";
let parsedDataGlobal: any[] = [];
let shopsListCache: string[] = [];
let detailsListCache: string[] = [];
let actsListCache: string[] = [];
let actsDateOffMap: Map<number, string | null> = new Map();
let scladIdsMap: Map<string, string> = new Map();
const UNIT_OPTIONS = [
  { value: "штук", label: "штук" },
  { value: "літр", label: "літр" },
  { value: "комплект", label: "комплект" },
];
const VALID_UNITS = UNIT_OPTIONS.map((o) => o.value);
// ===== Допоміжні функції =====
type TableName = "shops" | "details";
function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}
function readName(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  const prioritizedKeys = ["Name", "name", "Назва", "Текст", "text", "ПІБ"];
  for (const key of prioritizedKeys) {
    const candidate = obj[key];
    if (candidate) {
      const s = String(candidate).trim();
      if (s && s !== "[object Object]" && s !== "[object Array]") return s;
    }
  }
  return null;
}
function uniqAndSort(list: string[]): string[] {
  const uniq = Array.from(new Set(list));
  const collator = new Intl.Collator(["uk", "ru", "en"], {
    sensitivity: "base",
  });
  return uniq.sort((a, b) => collator.compare(a, b));
}
function toIsoDate(dateStr: string): string {
  if (!dateStr?.trim()) return "";
  let cleanDate = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return cleanDate;
  const match = cleanDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const d = parseInt(dd, 10);
    const m = parseInt(mm, 10);
    const y = parseInt(yyyy, 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
      return `${y}-${m.toString().padStart(2, "0")}-${d
        .toString()
        .padStart(2, "0")}`;
    }
  }
  return "";
}
function fromIsoToDisplay(isoDate: string): string {
  if (!isoDate?.trim()) return "";
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${dd}.${mm}.${yyyy}`;
  }
  return "";
}
async function fetchNames(table: TableName): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from(table)
    .select("name:data->>Name");
  if (!error && Array.isArray(rows) && rows.length) {
    const list = rows.map((r: any) => (r?.name ?? "").trim()).filter(Boolean);
    if (list.length) return uniqAndSort(list);
  }
  const { data: rows2, error: error2 } = await supabase
    .from(table)
    .select("data")
    .not("data", "is", null)
    .neq("data", "");
  if (error2 || !Array.isArray(rows2)) {
    console.error(`[${table}] load error:`, error2);
    return [];
  }
  const names: string[] = [];
  for (const r of rows2) {
    const d = (r as any)?.data;
    if (typeof d === "string") {
      const s = d.trim();
      if (!s) continue;
      if (looksLikeJson(s)) {
        try {
          const j = JSON.parse(s);
          const nm = readName(j);
          if (nm) names.push(nm);
          else names.push(s);
        } catch {
          names.push(s);
        }
      } else {
        names.push(s);
      }
      continue;
    }
    if (d && typeof d === "object") {
      const nm = readName(d);
      if (nm) names.push(nm);
    }
  }
  return uniqAndSort(names);
}
async function loadShopsList(): Promise<string[]> {
  return fetchNames("shops");
}
async function loadDetailsList(): Promise<string[]> {
  return fetchNames("details");
}
async function loadActsList(): Promise<{
  list: string[];
  map: Map<number, string | null>;
}> {
  const { data, error } = await supabase
    .from("acts")
    .select("act_id, date_off")
    .is("date_off", null) // <-- тільки відкриті (date_off = null)
    .order("act_id", { ascending: false });

  if (error || !Array.isArray(data)) {
    console.error("Error loading acts:", error);
    return { list: [], map: new Map() };
  }

  const map = new Map(data.map((r: any) => [r.act_id, r.date_off]));
  const list = data.map((r: any) => String(r.act_id)); // список id у вигляді рядків для автодоповнення
  return { list, map };
}

// Повертає id магазину або null, якщо не знайдено
async function getShopIdByName(name: string): Promise<number | null> {
  const n = (name ?? "").trim();
  if (!n) return null;
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    // УВАГА: БЕЗ лапок навколо Назва
    .or(`data->>Name.eq.${n},data->>name.eq.${n},data->>Назва.eq.${n}`)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0].id as number;
}
// Повертає id деталі або null, якщо не знайдено
async function getDetailIdByName(name: string): Promise<number | null> {
  const n = (name ?? "").trim();
  if (!n) return null;
  const { data, error } = await supabase
    .from("details")
    .select("id")
    .or(`data->>Name.eq.${n},data->>name.eq.${n},data->>Назва.eq.${n}`)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0].id as number;
}
// Функція для отримання sclad_id з бази даних
async function getScladId(
  date: string,
  catno: string,
  detail: string
): Promise<string | null> {
  const isoDate = toIsoDate(date);
  if (!isoDate) return null;
  const { data, error } = await supabase
    .from("sclad")
    .select("sclad_id, time_on, name, part_number")
    .eq("time_on", isoDate)
    .eq("name", detail)
    .eq("part_number", catno)
    .limit(1);
  if (error || !data || data.length === 0) {
    return null;
  }
  return data[0].sclad_id;
}
// Функція для оновлення акта
async function updateActWithDetails(
  actNo: string,
  detailData: any
): Promise<boolean> {
  try {
    const { data: actData, error: fetchError } = await supabase
      .from("acts")
      .select("act_id, data")
      .eq("act_id", parseInt(actNo, 10))
      .single();
    if (fetchError || !actData) {
      console.warn(`Акт №${actNo} не знайдено`);
      return false;
    }
    let actJsonData: any;
    if (typeof actData.data === "string") {
      try {
        actJsonData = JSON.parse(actData.data);
      } catch {
        actJsonData = {};
      }
    } else {
      actJsonData = actData.data || {};
    }
    if (!actJsonData["Деталі"]) {
      actJsonData["Деталі"] = [];
    }
    if (!actJsonData["За деталі"]) {
      actJsonData["За деталі"] = 0;
    }
    actJsonData["Деталі"].push(detailData);
    const detailSum = detailData["Сума"] || 0;
    actJsonData["За деталі"] = (actJsonData["За деталі"] || 0) + detailSum;
    if (actJsonData["Загальна сума"] !== undefined) {
      actJsonData["Загальна сума"] =
        (actJsonData["Загальна сума"] || 0) + detailSum;
    }
    const { error: updateError } = await supabase
      .from("acts")
      .update({ data: actJsonData })
      .eq("act_id", parseInt(actNo, 10));
    if (updateError) {
      console.error(`Помилка оновлення акта №${actNo}:`, updateError);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Помилка при роботі з актом №${actNo}:`, err);
    return false;
  }
}
// ===== Модалки =====
function createConfirmModal() {
  const modal = document.createElement("div");
  modal.id = confirmModalId;
  modal.className = "modal-overlay-all_other_bases hidden-all_other_bases";
  modal.innerHTML = `
    <div class="modal-all_other_bases confirm-modal-Excel">
      <div class="confirm-content-Excel">
        <div class="confirm-icon-Excel">📊</div>
        <h3 class="confirm-title-Excel">Підтвердження завантаження</h3>
        <p class="confirm-message-Excel"></p>
        <div class="confirm-buttons-Excel">
          <button id="confirm-yes-Excel" class="confirm-btn-Excel yes-Excel">✅ Так, завантажити</button>
          <button id="confirm-no-Excel" class="confirm-btn-Excel no-Excel">❌ Скасувати</button>
        </div>
      </div>
    </div>
  `;
  return modal;
}
function showConfirmModal(count: number): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById(confirmModalId);
    if (!modal) return resolve(false);
    const message = modal.querySelector(".confirm-message-Excel");
    if (message) {
      message.textContent = `Завантажити ${count} ${count === 1 ? "запис" : count < 5 ? "записи" : "записів"
        } в базу даних?`;
    }
    modal.classList.remove("hidden-all_other_bases");
    const yesBtn = document.getElementById("confirm-yes-Excel");
    const noBtn = document.getElementById("confirm-no-Excel");
    const cleanup = () => {
      modal.classList.add("hidden-all_other_bases");
      yesBtn?.removeEventListener("click", onYes);
      noBtn?.removeEventListener("click", onNo);
    };
    const onYes = () => {
      cleanup();
      resolve(true);
    };
    const onNo = () => {
      cleanup();
      showNotification("Завантаження скасовано", "warning");
      resolve(false);
    };
    yesBtn?.addEventListener("click", onYes);
    noBtn?.addEventListener("click", onNo);
  });
}
function createBatchImportModal() {
  const modal = document.createElement("div");
  modal.id = batchModalId;
  modal.className = "modal-overlay-all_other_bases hidden-all_other_bases";
  modal.innerHTML = `
    <div class="modal-all_other_bases batch-modal-Excel">
      <button class="modal-close-all_other_bases">×</button>
      <div class="modal-content-Excel">
        <h3 class="batch-title-Excel">Імпорт даних з Excel</h3>
        <p class="batch-instructions-Excel">
          Вставте дані з Excel (Ctrl+V) у форматі:<br>
          <strong>Дата ┃ Магазин ┃ Каталожний номер ┃ Деталь ┃ Кількість надходження ┃ Ціна ┃ Ціна клієнта ┃ Рахунок № ┃ Акт № ┃ Одиниця виміру</strong><br>
        </p>
        <textarea id="batch-textarea-Excel" class="batch-textarea-Excel" placeholder="Вставте дані з Excel сюди (з табуляцією між колонками)..." autocomplete="off"></textarea>
        <div id="batch-table-container-Excel" class="batch-table-container-Excel hidden-all_other_bases">
          <table id="batch-table-Excel" class="batch-table-Excel">
            <thead>
              <tr>
                <th data-col="date">Дата</th>
                <th data-col="shop">Магазин</th>
                <th data-col="catno">Каталожний номер</th>
                <th data-col="detail">Деталь</th>
                <th data-col="qty">Кількість</th>
                <th data-col="price">Ціна</th>
                <th data-col="clientPrice">Ціна клієнта</th>
                <th data-col="invoice">Рахунок №</th>
                <th data-col="actNo">Акт №</th>
                <th data-col="unit">Одиниця</th>
                <th data-col="status">Статус</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="batch-buttons-Excel">
          <button id="batch-parse-btn-Excel" class="batch-btn-Excel parse-Excel">📋 Розпарсити</button>
          <button id="batch-upload-btn-Excel" class="batch-btn-Excel upload-Excel hidden-all_other_bases">✅ Завантажити</button>
        </div>
      </div>
    </div>
  `;
  return modal;
}
// ===== Парсинг =====
function parseBatchData(text: string) {
  const lines = text
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  const data: any[] = [];
  lines.forEach((line, index) => {
    if (index === 0 && (line.includes("Дата") || line.includes("Магазин")))
      return;
    let parts = line.split("\t");
    if (parts.length < 10) parts = line.split(/\s{2,}/);
    if (parts.length < 10) parts = line.split(/\s+/);
    // Pad to 10 parts with empty strings if necessary
    while (parts.length < 10) {
      parts.push("");
    }
    // Trim each part, but keep empty strings
    parts = parts.map((part) => part.trim());
    // No longer filter out empties - we want all 10 fields, even empty
    if (parts.length < 10) {
      console.warn("⚠️ Пропущено рядок (недостатньо даних):", line);
      return;
    }
    const row = {
      date: parts[0],
      shop: parts[1],
      catno: parts[2],
      detail: parts[3],
      qty: parseFloat(parts[4].replace(",", ".")) || 0,
      price: parseFloat(parts[5].replace(",", ".")) || 0,
      clientPrice: parseFloat(parts[6].replace(",", ".")) || 0,
      invoice: parts[7],
      actNo: parts[8],
      unit: parts[9],
      status: "Готовий",
      unitValid: true,
      shopValid: true,
      detailValid: true,
      actValid: true,
      actClosed: false,
    };
    try {
      if (row.date.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        // OK
      } else if (row.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [yyyy, mm, dd] = row.date.split("-");
        row.date = `${dd}.${mm}.${yyyy}`;
      } else {
        throw new Error("Невірний формат дати");
      }
    } catch {
      row.status = "Помилка формату дати";
    }
    if (!VALID_UNITS.includes(row.unit)) {
      row.unitValid = false;
    }
    row.shopValid = row.shop ? shopsListCache.includes(row.shop) : true;
    row.detailValid = row.detail ? detailsListCache.includes(row.detail) : true;
    if (row.actNo) {
      const trimmedActNo = row.actNo.trim();
      row.actValid = actsListCache.includes(trimmedActNo);
      if (row.actValid) {
        const actIdNum = parseInt(trimmedActNo, 10);
        if (actsDateOffMap.has(actIdNum)) {
          row.actClosed = actsDateOffMap.get(actIdNum) !== null;
        }
      }
    }
    if (
      isNaN(row.qty) ||
      isNaN(row.price) ||
      isNaN(row.clientPrice) ||
      !row.date ||
      !row.catno ||
      !row.detail ||
      !row.unit ||
      !row.shop
    ) {
      row.status = "Помилка валідації";
    }
    data.push(row);
  });
  return data;
}
// ===== ДИНАМІЧНИЙ РОЗРАХУНОК ШИРИНИ КОЛОНОК =====
function calculateDynamicWidths(data: any[]): Map<string, number> {
  const columns = [
    "date",
    "shop",
    "catno",
    "detail",
    "qty",
    "price",
    "clientPrice",
    "invoice",
    "actNo",
    "unit",
    "status",
  ];
  const headers = [
    "Дата",
    "Магазин",
    "Каталожний номер",
    "Деталь",
    "Кількість",
    "Ціна",
    "Ціна клієнта",
    "Рахунок №",
    "Акт №",
    "Одиниця",
    "Статус",
  ];
  const widths = new Map<string, number>();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return widths;
  ctx.font = "13px Arial";
  columns.forEach((col, i) => {
    let maxWidth = ctx.measureText(headers[i]).width + 40;
    data.forEach((row) => {
      const value = String(row[col] ?? "");
      const textWidth = ctx.measureText(value).width + 40;
      if (textWidth > maxWidth) maxWidth = textWidth;
    });
    widths.set(col, Math.min(Math.ceil(maxWidth), 350));
  });
  return widths;
}
function applyColumnWidths(widths: Map<string, number>) {
  const thead = document.querySelector("#batch-table-Excel thead tr");
  if (!thead) return;
  thead.querySelectorAll("th").forEach((th) => {
    const col = (th as HTMLElement).dataset.col;
    if (col && widths.has(col)) {
      const width = widths.get(col)!;
      (th as HTMLElement).style.width = `${width}px`;
      (th as HTMLElement).style.minWidth = `${width}px`;
      (th as HTMLElement).style.maxWidth = `${width}px`;
    }
  });
}
// ===== Dropdown =====
let currentDropdownInput: HTMLElement | null = null;
let currentDropdownList: HTMLElement | null = null;
function closeDropdownList() {
  currentDropdownList?.remove();
  currentDropdownList = null;
  currentDropdownInput?.classList.remove("dropdown-open");
  currentDropdownInput = null;
}
function positionDropdown(input: HTMLElement, list: HTMLElement) {
  const rect = input.getBoundingClientRect();
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let maxContentWidth = rect.width;
  if (ctx) {
    ctx.font = "14px Arial";
    list.querySelectorAll("li").forEach((li) => {
      const text = (li as HTMLElement).textContent || "";
      const textWidth = ctx.measureText(text).width + 50;
      if (textWidth > maxContentWidth) maxContentWidth = textWidth;
    });
  }
  const firstItem = list.querySelector("li") as HTMLElement | null;
  const itemHeight = firstItem?.offsetHeight || 30;
  const totalItems = list.children.length;
  const gap = 4;
  const padding = 16;
  const availableAbove = rect.top + scrollY - gap;
  const availableBelow = window.innerHeight - rect.bottom - gap;
  const useAbove = availableAbove >= availableBelow;
  const availableSpace = useAbove ? availableAbove : availableBelow;
  const maxItemsFromSpace = Math.floor((availableSpace - padding) / itemHeight);
  const effectiveMaxVisible = Math.min(8, Math.max(3, maxItemsFromSpace));
  const visibleItems = Math.min(effectiveMaxVisible, totalItems);
  const listHeight = visibleItems * itemHeight + padding;
  const finalWidth = Math.min(Math.max(maxContentWidth, rect.width, 200), 500);
  list.style.maxHeight = `${listHeight}px`;
  list.style.width = `${finalWidth}px`;
  list.style.top = `${useAbove
      ? scrollY + rect.top - listHeight - gap
      : scrollY + rect.bottom + gap
    }px`;
  list.style.left = `${scrollX + rect.left}px`;
}
function showDropdownList(input: HTMLElement, options: string[]) {
  closeDropdownList();
  if (!options?.length) return;
  const list = document.createElement("ul");
  list.className = "excel-dropdown-list";
  // показуємо всі варіанти, без обрізання
  options.forEach((option) => {
    const li = document.createElement("li");
    li.className = "excel-dropdown-item";
    li.textContent = option;
    li.tabIndex = 0;
    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(input.getAttribute("data-index") || "0");
      const field = input.getAttribute("data-field") || "";
      (input as HTMLInputElement).value = option;
      parsedDataGlobal[index][field] = option;
      const td = input.closest("td");
      if (td) {
        td.classList.remove(
          "invalid-shop",
          "invalid-detail",
          "invalid-unit",
          "invalid-act",
          "closed-act"
        );
      }
      if (field === "unit") {
        parsedDataGlobal[index].unitValid = true;
      } else if (field === "shop") {
        parsedDataGlobal[index].shopValid = true;
      } else if (field === "detail") {
        parsedDataGlobal[index].detailValid = true;
      } else if (field === "actNo") {
        parsedDataGlobal[index].actValid = true;
        const actIdNum = parseInt(option, 10);
        parsedDataGlobal[index].actClosed =
          actsDateOffMap.has(actIdNum) && actsDateOffMap.get(actIdNum) !== null;
        if (parsedDataGlobal[index].actClosed) {
          if (td) td.classList.add("closed-act");
        }
      }
      recalculateAndApplyWidths();
      closeDropdownList();
    });
    list.appendChild(li);
  });
  document.body.appendChild(list);
  currentDropdownList = list;
  currentDropdownInput = input;
  input.classList.add("dropdown-open");
  positionDropdown(input, list);
}
// ===== ФУНКЦІЯ ПЕРЕРАХУНКУ ШИРИНИ =====
function recalculateAndApplyWidths() {
  const widths = calculateDynamicWidths(parsedDataGlobal);
  applyColumnWidths(widths);
  const tbody = document.querySelector("#batch-table-Excel tbody");
  if (!tbody) return;
  const columnKeys = [
    "date",
    "shop",
    "catno",
    "detail",
    "qty",
    "price",
    "clientPrice",
    "invoice",
    "actNo",
    "unit",
    "status",
  ];
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.querySelectorAll("td").forEach((td, colIndex) => {
      const col = columnKeys[colIndex];
      if (widths.has(col)) {
        const width = widths.get(col)!;
        (td as HTMLElement).style.width = `${width}px`;
        (td as HTMLElement).style.minWidth = `${width}px`;
        (td as HTMLElement).style.maxWidth = `${width}px`;
      }
    });
  });
}
// ===== Рендеринг таблиці =====
function createInput(
  type: string,
  value: string,
  field: string,
  index: number,
  className: string = ""
): string {
  return `<input
    type="${type}"
    class="cell-input-Excel ${className}"
    value="${value}"
    data-field="${field}"
    data-index="${index}"
    ${type === "number" ? 'step="0.01"' : ""}
    ${field === "unit" ? "readonly" : ""}
    autocomplete="off"
  >`;
}
function renderBatchTable(data: any[]) {
  const tbody = document.querySelector(
    "#batch-table-Excel tbody"
  ) as HTMLTableSectionElement;
  if (!tbody) return;
  const widths = calculateDynamicWidths(data);
  applyColumnWidths(widths);
  tbody.innerHTML = "";
  data.forEach((row, index) => {
    const tr = document.createElement("tr");
    const statusClass =
      row.status === "Готовий"
        ? "ready-Excel"
        : row.status.includes("Помилка")
          ? "error-Excel"
          : row.status.includes("Успішно")
            ? "success-Excel"
            : "";
    const getWidth = (col: string) => widths.get(col) || 100;
    const shopTdClass = row.shop && !row.shopValid ? "invalid-shop" : "";
    const detailTdClass =
      row.detail && !row.detailValid ? "invalid-detail" : "";
    const unitTdClass = !row.unitValid ? "invalid-unit" : "";
    const actTdClass =
      row.actNo && !row.actValid
        ? "invalid-act"
        : row.actClosed
          ? "closed-act"
          : "";
    tr.innerHTML = `
      <td style="width:${getWidth("date")}px;min-width:${getWidth(
      "date"
    )}px;max-width:${getWidth("date")}px;">
        ${createInput("date", toIsoDate(row.date), "date", index)}
      </td>
      <td class="${shopTdClass}" style="width:${getWidth(
      "shop"
    )}px;min-width:${getWidth("shop")}px;max-width:${getWidth("shop")}px;">
        <input
          type="text"
          class="cell-input-Excel cell-input-combo-Excel shop-input-Excel"
          value="${row.shop}"
          data-field="shop"
          data-index="${index}"
          autocomplete="off"
        >
      </td>
      <td style="width:${getWidth("catno")}px;min-width:${getWidth(
      "catno"
    )}px;max-width:${getWidth("catno")}px;">
        ${createInput("text", row.catno, "catno", index)}
      </td>
      <td class="${detailTdClass}" style="width:${getWidth(
      "detail"
    )}px;min-width:${getWidth("detail")}px;max-width:${getWidth("detail")}px;">
        <input
          type="text"
          class="cell-input-Excel cell-input-combo-Excel detail-input-Excel"
          value="${row.detail}"
          data-field="detail"
          data-index="${index}"
          autocomplete="off"
        >
      </td>
      <td style="width:${getWidth("qty")}px;min-width:${getWidth(
      "qty"
    )}px;max-width:${getWidth("qty")}px;">
        ${createInput("number", row.qty, "qty", index)}
      </td>
      <td style="width:${getWidth("price")}px;min-width:${getWidth(
      "price"
    )}px;max-width:${getWidth("price")}px;">
        ${createInput("number", row.price, "price", index)}
      </td>
      <td style="width:${getWidth("clientPrice")}px;min-width:${getWidth(
      "clientPrice"
    )}px;max-width:${getWidth("clientPrice")}px;">
        ${createInput("number", row.clientPrice, "clientPrice", index)}
      </td>
      <td style="width:${getWidth("invoice")}px;min-width:${getWidth(
      "invoice"
    )}px;max-width:${getWidth("invoice")}px;">
        ${createInput("text", row.invoice, "invoice", index)}
      </td>
      <td class="${actTdClass}" style="width:${getWidth(
      "actNo"
    )}px;min-width:${getWidth("actNo")}px;max-width:${getWidth("actNo")}px;">
        <input
          type="text"
          class="cell-input-Excel cell-input-combo-Excel act-input-Excel"
          value="${row.actNo}"
          data-field="actNo"
          data-index="${index}"
          autocomplete="off"
        >
      </td>
      <td class="${unitTdClass}" style="width:${getWidth(
      "unit"
    )}px;min-width:${getWidth("unit")}px;max-width:${getWidth("unit")}px;">
        <input
          type="text"
          class="cell-input-Excel cell-input-combo-Excel unit-input-Excel"
          value="${row.unit}"
          data-field="unit"
          data-index="${index}"
          readonly
          autocomplete="off"
        >
      </td>
      <td class="status-cell-Excel ${statusClass}" style="width:${getWidth(
      "status"
    )}px;min-width:${getWidth("status")}px;max-width:${getWidth("status")}px;">
        <span class="status-text-Excel">${row.status}</span>
        ${row.status !== "✅ Успішно"
        ? `<button class="delete-row-btn-Excel" data-index="${index}" title="Видалити рядок">🗑️</button>`
        : ""
      }
      </td>
    `;
    tbody.appendChild(tr);
  });
  attachInputHandlers(tbody);
}
function attachInputHandlers(tbody: HTMLTableSectionElement) {
  tbody.querySelectorAll('input[data-field="date"]').forEach((input) => {
    input.addEventListener("click", () => {
      const dateInput = input as HTMLInputElement;
      if ("showPicker" in HTMLInputElement.prototype) {
        dateInput.showPicker();
      } else {
        dateInput.focus();
        dateInput.click();
      }
    });
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      parsedDataGlobal[index]["date"] = fromIsoToDisplay(target.value);
      recalculateAndApplyWidths();
    });
    input.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      parsedDataGlobal[index]["date"] = fromIsoToDisplay(target.value);
      recalculateAndApplyWidths();
    });
  });
  tbody
    .querySelectorAll(
      ".cell-input-Excel:not(.cell-input-combo-Excel):not([data-field='date'])"
    )
    .forEach((input) => {
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        const index = parseInt(target.dataset.index || "0");
        const field = target.dataset.field || "";
        if (field === "qty" || field === "price" || field === "clientPrice") {
          parsedDataGlobal[index][field] = parseFloat(target.value) || 0;
        } else {
          parsedDataGlobal[index][field] = target.value;
        }
        recalculateAndApplyWidths();
      });
    });
  // Акт № з live-фільтром
  // показуємо список відкритих актів при кліку
  tbody.querySelectorAll(".act-input-Excel").forEach((input) => {
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      showDropdownList(e.target as HTMLElement, actsListCache); // <-- тут наш кеш
    });

    // live-фільтр по відкритих актах
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value;
      parsedDataGlobal[index]["actNo"] = value;

      const td = target.closest("td");
      if (td) td.classList.remove("invalid-act", "closed-act");

      const filter = value.toLowerCase();
      const filteredOptions = filter
        ? actsListCache.filter((opt) => opt.toLowerCase().includes(filter))
        : actsListCache;

      if (currentDropdownInput === target && currentDropdownList) {
        updateDropdownList(filteredOptions, target, index, "actNo");
        if (filteredOptions.length)
          positionDropdown(target, currentDropdownList);
        else closeDropdownList();
      }

      recalculateAndApplyWidths();
    });

    // валідація: або порожньо, або існує серед ВІДКРИТИХ
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value.trim();
      const td = target.closest("td");

      parsedDataGlobal[index].actValid =
        !value || actsListCache.includes(value);
      parsedDataGlobal[index].actClosed = false; // бо в кеші тільки відкриті

      if (!parsedDataGlobal[index].actValid && value) {
        td?.classList.add("invalid-act");
      } else {
        td?.classList.remove("invalid-act", "closed-act");
      }
    });
  });

  // Одиниці
  tbody.querySelectorAll(".unit-input-Excel").forEach((input) => {
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      showDropdownList(e.target as HTMLElement, VALID_UNITS);
    });
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value;
      const td = target.closest("td");
      if (!VALID_UNITS.includes(value)) {
        if (td) {
          td.classList.add("invalid-unit");
        }
        parsedDataGlobal[index].unitValid = false;
      } else {
        if (td) {
          td.classList.remove("invalid-unit");
        }
        parsedDataGlobal[index].unitValid = true;
      }
    });
  });
  // Магазин з live-фільтром
  tbody.querySelectorAll(".shop-input-Excel").forEach((input) => {
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      showDropdownList(e.target as HTMLElement, shopsListCache);
    });
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value;
      parsedDataGlobal[index]["shop"] = value;
      const td = target.closest("td");
      if (td) {
        td.classList.remove("invalid-shop");
      }
      const filter = value.toLowerCase();
      const filteredOptions = filter
        ? shopsListCache.filter((opt) => opt.toLowerCase().includes(filter))
        : shopsListCache;
      if (currentDropdownInput === target && currentDropdownList) {
        updateDropdownList(filteredOptions, target, index, "shop");
        if (filteredOptions.length)
          positionDropdown(target, currentDropdownList);
        else closeDropdownList();
      }
      recalculateAndApplyWidths();
    });
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value.trim();
      const td = target.closest("td");
      const isValid = !value || shopsListCache.includes(value);
      parsedDataGlobal[index].shopValid = isValid;
      if (!isValid && value) {
        if (td) {
          td.classList.add("invalid-shop");
        }
      } else {
        if (td) {
          td.classList.remove("invalid-shop");
        }
      }
    });
  });
  // Деталь з live-фільтром
  tbody.querySelectorAll(".detail-input-Excel").forEach((input) => {
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      showDropdownList(e.target as HTMLElement, detailsListCache);
    });
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value;
      parsedDataGlobal[index]["detail"] = value;
      const td = target.closest("td");
      if (td) {
        td.classList.remove("invalid-detail");
      }
      const filter = value.toLowerCase();
      const filteredOptions = filter
        ? detailsListCache.filter((opt) => opt.toLowerCase().includes(filter))
        : detailsListCache;
      if (currentDropdownInput === target && currentDropdownList) {
        updateDropdownList(filteredOptions, target, index, "detail");
        if (filteredOptions.length)
          positionDropdown(target, currentDropdownList);
        else closeDropdownList();
      }
      recalculateAndApplyWidths();
    });
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value.trim();
      const td = target.closest("td");
      const isValid = !value || detailsListCache.includes(value);
      parsedDataGlobal[index].detailValid = isValid;
      if (!isValid && value) {
        if (td) {
          td.classList.add("invalid-detail");
        }
      } else {
        if (td) {
          td.classList.remove("invalid-detail");
        }
      }
    });
  });
  // Видалення рядка
  tbody.querySelectorAll(".delete-row-btn-Excel").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(
        (e.target as HTMLButtonElement).dataset.index || "0"
      );
      parsedDataGlobal.splice(index, 1);
      renderBatchTable(parsedDataGlobal);
      showNotification(`Рядок ${index + 1} видалено`, "success", 2000);
      if (parsedDataGlobal.length === 0) {
        resetModalState();
      }
    });
  });
}
function updateDropdownList(
  options: string[],
  target: HTMLInputElement,
  index: number,
  field: string
) {
  if (!currentDropdownList) return;
  currentDropdownList.innerHTML = "";
  // теж без обрізання
  options.forEach((option) => {
    const li = document.createElement("li");
    li.className = "excel-dropdown-item";
    li.textContent = option;
    li.tabIndex = 0;
    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      target.value = option;
      parsedDataGlobal[index][field] = option;
      const td = target.closest("td");
      if (td) {
        td.classList.remove(
          "invalid-shop",
          "invalid-detail",
          "invalid-unit",
          "invalid-act",
          "closed-act"
        );
      }
      if (field === "unit") {
        parsedDataGlobal[index].unitValid = true;
      } else if (field === "shop") {
        parsedDataGlobal[index].shopValid = true;
      } else if (field === "detail") {
        parsedDataGlobal[index].detailValid = true;
      } else if (field === "actNo") {
        parsedDataGlobal[index].actValid = true;
        const actIdNum = parseInt(option, 10);
        parsedDataGlobal[index].actClosed =
          actsDateOffMap.has(actIdNum) && actsDateOffMap.get(actIdNum) !== null;
        if (parsedDataGlobal[index].actClosed) {
          if (td) td.classList.add("closed-act");
        }
      }
      recalculateAndApplyWidths();
      closeDropdownList();
    });
    currentDropdownList!.appendChild(li);
  });
}
function resetModalState() {
  const textarea = document.getElementById(
    "batch-textarea-Excel"
  ) as HTMLTextAreaElement;
  const instructions = document.querySelector(
    ".batch-instructions-Excel"
  ) as HTMLElement;
  if (textarea) {
    textarea.style.display = "block";
    textarea.value = "";
  }
  if (instructions) instructions.style.display = "block";
  document
    .getElementById("batch-table-container-Excel")
    ?.classList.add("hidden-all_other_bases");
  document
    .getElementById("batch-upload-btn-Excel")
    ?.classList.add("hidden-all_other_bases");
}
// ===== Завантаження даних у БД =====
async function uploadBatchData(data: any[]) {
  // 🔒 анти-дублювання: якщо вже йде аплоад — ігноруємо повторний виклик
  if (isUploading) return;
  isUploading = true;

  const uploadBtn = document.getElementById("batch-upload-btn-Excel");
  uploadBtn?.classList.add("loading-Excel");
  uploadBtn?.setAttribute("disabled", "true");

  let successCount = 0;
  let errorCount = 0;
  scladIdsMap.clear();

  // --- локальні хелпери (self-contained) ---
  async function ensureShopDataName(id: number, name: string): Promise<void> {
    const { data: row } = await supabase
      .from("shops")
      .select("data")
      .eq("id", id)
      .single();
    let newData: any = {};
    if (row?.data && typeof row.data === "object") newData = { ...row.data };
    if (!newData.Name && !newData.name && !newData["Назва"]) {
      newData.Name = name;
      await supabase.from("shops").update({ data: newData }).eq("id", id);
    }
  }

  async function ensureDetailDataName(id: number, name: string): Promise<void> {
    const { data: row } = await supabase
      .from("details")
      .select("data")
      .eq("id", id)
      .single();
    let newData: any = {};
    if (row?.data && typeof row.data === "object") newData = { ...row.data };
    if (!newData.Name && !newData.name && !newData["Назва"]) {
      newData.Name = name;
      await supabase.from("details").update({ data: newData }).eq("id", id);
    }
  }

  try {
    // 1) Унікальні назви
    const uniqueShops = [
      ...new Set(data.map((row) => (row.shop ?? "").trim()).filter(Boolean)),
    ];
    const uniqueDetails = [
      ...new Set(data.map((row) => (row.detail ?? "").trim()).filter(Boolean)),
    ];

    // 2) Кеш існуючих
    const existingShops = new Map<string, number>();
    const existingDetails = new Map<string, number>();

    // 3) Shops
    for (const shopName of uniqueShops) {
      let shopId = await getShopIdByName(shopName);
      if (!shopId) {
        resetShopState();
        shopEditState.currentName = shopName;
        shopEditState.touched = true;
        await tryHandleShopsCrud();
        shopId = await getShopIdByName(shopName);
      }
      if (shopId) {
        await ensureShopDataName(shopId, shopName);
        existingShops.set(shopName, shopId);
      }
    }

    // 4) Details
    for (const detailName of uniqueDetails) {
      let detailId = await getDetailIdByName(detailName);
      if (!detailId) {
        resetDetailState();
        detailEditState.currentName = detailName;
        detailEditState.touched = true;
        await tryHandleDetailsCrud();
        detailId = await getDetailIdByName(detailName);
      }
      if (detailId) {
        await ensureDetailDataName(detailId, detailName);
        existingDetails.set(detailName, detailId);
      }
    }

    // 5) Обробка кожного рядка
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      // дата для БД (yyyy-mm-dd)
      let dbDate = row.date;
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(row.date)) {
        const [dd, mm, yyyy] = row.date.split(".");
        dbDate = `${yyyy}-${mm}-${dd}`;
      }

      // тимчасові приховані інпути для akt та kilkist_off
      const aktInput = document.createElement("input");
      aktInput.id = "sclad_akt";
      aktInput.type = "hidden";
      aktInput.value = row.actNo || "";
      document.body.appendChild(aktInput);

      const offInput = document.createElement("input");
      offInput.id = "sclad_kilkist_off";
      offInput.type = "hidden";
      offInput.value = String(row.qty || 0);
      document.body.appendChild(offInput);

      // заповнюємо інпути під handleScladCrud
      const fields: Record<string, string> = {
        sclad_date: dbDate,
        sclad_detail_catno: row.catno,
        sclad_detail: row.detail,
        sclad_qty_in: String(row.qty),
        sclad_price: String(row.price),
        // sclad_client_price: String(row.clientPrice), // якщо є така колонка в БД
        sclad_invoice_no: row.invoice,
        sclad_unit: row.unit,
        sclad_shop: row.shop,
      };
      Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = val;
      });

      // не створюємо тут shops/details — вони вже оброблені вище
      resetShopState();
      resetDetailState();
      shopEditState.currentName = row.shop;
      shopEditState.touched = false;
      detailEditState.currentName = row.detail;
      detailEditState.touched = false;

      // запис у sclad
      const originalCRUD = CRUD;
      updateCRUD("Додати");
      const scladSuccess = await handleScladCrud();
      updateCRUD(originalCRUD);

      // прибираємо тимчасові інпути
      aktInput.remove();
      offInput.remove();

      if (!scladSuccess) {
        errorCount++;
        updateRowStatus(i, false, "Помилка збереження в sclad");
        continue;
      }

      // отримати sclad_id щойно створеного запису
      let scladIdWeb: string | null = null;
      try {
        scladIdWeb = await getScladId(row.date, row.catno, row.detail);
        if (scladIdWeb) {
          const key = `${dbDate}|${row.catno}|${row.detail}`;
          scladIdsMap.set(key, scladIdWeb);
        }
      } catch (err) {
        console.error("Помилка отримання sclad_id:", err);
      }

      // оновлення акта (за наявності)
      let actSuccess = true;
      if (row.actNo && row.actNo.trim()) {
        const actNo = row.actNo.trim();
        const detailSum = (row.clientPrice || 0) * (row.qty || 0);
        const detailForAct = {
          sclad_id: scladIdWeb || null,
          Сума: detailSum,
          Ціна: row.clientPrice || 0,
          Деталь: row.detail,
          Каталог: row.catno,
          Магазин: row.shop,
          Кількість: row.qty || 0,
        };
        actSuccess = await updateActWithDetails(actNo, detailForAct);
        if (!actSuccess) {
          console.warn(`Не вдалося оновити акт №${actNo} для рядка ${i + 1}`);
        }
      }

      if (scladSuccess && actSuccess) {
        successCount++;
        updateRowStatus(i, true, "✅ Успішно");
      } else if (scladSuccess && !actSuccess) {
        successCount++;
        updateRowStatus(i, true, "⚠️ Збережено (акт не оновлено)");
      } else {
        errorCount++;
        updateRowStatus(i, false, "❌ Помилка");
      }

      // маленька пауза, щоб не “забивати” UI
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    // знімаємо лоадінг та розблоковуємо кнопку
    uploadBtn?.classList.remove("loading-Excel");
    uploadBtn?.removeAttribute("disabled");
    isUploading = false;
  }

  if (errorCount === 0) {
    showNotification(
      `Успішно завантажено ${successCount} ${successCount === 1 ? "запис" : successCount < 5 ? "записи" : "записів"
      }`,
      "success",
      4000
    );
  } else {
    showNotification(
      `Завантажено: ${successCount}, Помилок: ${errorCount}`,
      "warning",
      5000
    );
  }
}

// Функція для оновлення статусу рядка
function updateRowStatus(
  rowIndex: number,
  success: boolean,
  statusText: string
) {
  const statusCell = document.querySelector(
    `#batch-table-Excel tbody tr:nth-child(${rowIndex + 1}) .status-cell-Excel`
  );
  if (statusCell) {
    const statusTextEl = statusCell.querySelector(".status-text-Excel");
    if (statusTextEl) statusTextEl.textContent = statusText;
    (statusCell as HTMLElement).className = success
      ? "status-cell-Excel success-Excel"
      : "status-cell-Excel error-Excel";
    if (success) {
      const deleteBtn = statusCell.querySelector(".delete-row-btn-Excel");
      deleteBtn?.remove();
    }
  }
}
// ===== Ініціалізація =====
export async function initBatchImport() {
  // 🔒 не ініціалізувати вдруге (щоб слухачі не множилися)
  if (batchInitDone) return;
  batchInitDone = true;

  shopsListCache = await loadShopsList();
  detailsListCache = await loadDetailsList();
  const actsData = await loadActsList();
  actsListCache = actsData.list;
  actsDateOffMap = actsData.map;

  console.log("Завантажено магазинів:", shopsListCache.length);
  console.log("Завантажено деталей:", detailsListCache.length);
  console.log("Завантажено актів:", actsListCache.length);

  // Ensure модалки створені один раз
  const existingModal = document.getElementById(batchModalId);
  if (!existingModal) {
    document.body.appendChild(createBatchImportModal());
  }
  const existingConfirmModal = document.getElementById(confirmModalId);
  if (!existingConfirmModal) {
    document.body.appendChild(createConfirmModal());
  }

  // Глобальний клік для закриття дропдаунів — призначаємо 1 раз
  document.onclick = (e) => {
    const target = e.target as HTMLElement;
    if (
      !target.closest(".excel-dropdown-list") &&
      !target.closest(".cell-input-combo-Excel")
    ) {
      closeDropdownList();
    }
  };

  // === КНОПКИ: призначаємо через onclick, щоб НЕ накопичувалось ===
  const importBtn = document.getElementById(
    "import-excel-btn"
  ) as HTMLButtonElement | null;
  if (importBtn) {
    importBtn.onclick = () => {
      const modal = document.getElementById(batchModalId);
      if (!modal) return;
      modal.classList.remove("hidden-all_other_bases");
      resetModalState();
      parsedDataGlobal = [];
    };
  }

  const closeBtn = document.querySelector(
    `#${batchModalId} .modal-close-all_other_bases`
  ) as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.onclick = () => {
      document
        .getElementById(batchModalId)
        ?.classList.add("hidden-all_other_bases");
      closeDropdownList();
    };
  }

  const parseBtn = document.getElementById(
    "batch-parse-btn-Excel"
  ) as HTMLButtonElement | null;
  if (parseBtn) {
    parseBtn.onclick = () => {
      const textarea = document.getElementById(
        "batch-textarea-Excel"
      ) as HTMLTextAreaElement;
      const instructions = document.querySelector(
        ".batch-instructions-Excel"
      ) as HTMLElement;

      const data = parseBatchData(textarea.value);
      if (data.length) {
        parsedDataGlobal = data;
        renderBatchTable(data);
        textarea.style.display = "none";
        if (instructions) instructions.style.display = "none";
        document
          .getElementById("batch-table-container-Excel")
          ?.classList.remove("hidden-all_other_bases");
        document
          .getElementById("batch-upload-btn-Excel")
          ?.classList.remove("hidden-all_other_bases");
        showNotification(
          `Розпарсовано ${data.length} ${data.length === 1 ? "рядок" : data.length < 5 ? "рядки" : "рядків"
          }`,
          "success"
        );
      } else {
        showNotification(
          "Немає валідних даних для парсингу! Перевірте формат.",
          "error",
          4000
        );
      }
    };
  }

  const uploadBtn = document.getElementById(
    "batch-upload-btn-Excel"
  ) as HTMLButtonElement | null;
  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const currentData = parsedDataGlobal.map((row, index) => {
        const tr = document.querySelector(
          `#batch-table-Excel tbody tr:nth-child(${index + 1})`
        );
        if (!tr) return row as any;

        const allInputs = tr.querySelectorAll(
          ".cell-input-Excel, .cell-input-combo-Excel"
        );
        const statusText =
          tr.querySelector(".status-text-Excel")?.textContent || row.status;

        return {
          date: (allInputs[0] as HTMLInputElement).value,
          shop: (allInputs[1] as HTMLInputElement).value,
          catno: (allInputs[2] as HTMLInputElement).value,
          detail: (allInputs[3] as HTMLInputElement).value,
          qty: parseFloat((allInputs[4] as HTMLInputElement).value) || 0,
          price: parseFloat((allInputs[5] as HTMLInputElement).value) || 0,
          clientPrice:
            parseFloat((allInputs[6] as HTMLInputElement).value) || 0,
          invoice: (allInputs[7] as HTMLInputElement).value,
          actNo: (allInputs[8] as HTMLInputElement).value,
          unit: (allInputs[9] as HTMLInputElement).value,
          status: statusText,
          rowNumber: index + 1,
        };
      });

      const allSuccessful = currentData.every(
        (row) =>
          row.status === "✅ Успішно" ||
          row.status === "⚠️ Збережено (акт не оновлено)"
      );
      if (allSuccessful && currentData.length > 0) {
        showNotification("Дані успішно додані до бази даних", "success", 3000);
        return;
      }

      // базові валідації
      let hasErrors = false;
      const invalidUnits = currentData.filter(
        (row) =>
          !VALID_UNITS.includes(row.unit) && !row.status.includes("Помилка")
      );
      if (invalidUnits.length > 0) {
        showNotification("❌ Невірно вказана одиниця виміру", "error", 4000);
        hasErrors = true;
        invalidUnits.forEach((row) => {
          const unitTd = document.querySelector(
            `#batch-table-Excel tbody tr:nth-child(${row.rowNumber}) td:has(.unit-input-Excel)`
          ) as HTMLElement;
          if (unitTd) unitTd.classList.add("invalid-unit");
        });
      }
      if (hasErrors) return;

      const validData = currentData.filter(
        (row) =>
          !row.status.includes("Помилка") && row.shop && row.unit && row.detail
      );
      if (validData.length === 0) {
        showNotification(
          "Немає валідних даних для завантаження! Перевірте, чи заповнено магазин, деталь та одиницю виміру.",
          "error"
        );
        return;
      }

      // Перевірка актів (список відкритих у кеші)
      let hasInvalidActs = false;
      let hasClosedActs = false;
      for (const row of validData) {
        if (row.actNo && row.actNo.trim()) {
          const trimmed = row.actNo.trim();
          if (!actsListCache.includes(trimmed)) {
            hasInvalidActs = true;
          } else {
            const id = parseInt(trimmed, 10);
            if (actsDateOffMap.has(id) && actsDateOffMap.get(id) !== null) {
              hasClosedActs = true;
            }
          }
        }
      }
      if (hasInvalidActs) {
        showNotification("Номер акту не створений", "error");
        return;
      }
      if (hasClosedActs) {
        showNotification(
          "Номер акту закритий і ми неможемо вписати деталь в даний акт",
          "error"
        );
        return;
      }

      const confirmed = await showConfirmModal(validData.length);
      if (confirmed) {
        await uploadBatchData(validData); // ⬅️ тепер захищено isUploading
      }
    };
  }
}

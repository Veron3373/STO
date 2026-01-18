// src\ts\roboha\dodatu_inchi_bazu\inhi\batchImportSclad.ts
// Updated: 2026-01-15 19:18
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
let warehouseListCache: string[] = []; // Кеш активних складів (номери)
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
  // Отримуємо повні дані, щоб коректно обробити різні ключі (Name, name, Назва)
  const { data: rows2, error: error2 } = await supabase
    .from(table)
    .select("data")
    .not("data", "is", null);

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

/** Завантаження списку активних складів з таблиці settings */
async function loadWarehouseList(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("setting_id, procent")
      .gte("setting_id", 1)
      .lte("setting_id", 500)
      .not("procent", "is", null)
      .gte("procent", 0)
      .order("setting_id", { ascending: true });

    if (error || !Array.isArray(data)) {
      console.error("Error loading warehouses:", error);
      return [];
    }

    // Активні склади - повертаємо номери як рядки
    return data.map((row: { setting_id: number }) => String(row.setting_id));
  } catch (e) {
    console.error("Error loading warehouse list:", e);
    return [];
  }
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
function showConfirmModal(count: number, totalCount: number): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById(confirmModalId);
    if (!modal) return resolve(false);
    const message = modal.querySelector(".confirm-message-Excel");
    if (message) {
      const isFull = count === totalCount;
      const colorStyle = isFull ? "color: #10b981;" : "color: #ef4444;"; // green-500 : red-500
      message.innerHTML = `Завантажити <strong style="${colorStyle}">${count}</strong> із <strong style="${colorStyle}">${totalCount}</strong> записів в базу даних?`;
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
    <style>
      .batch-table-container-Excel {
        overflow-y: auto;
        max-height: 60vh; /* slightly less to ensure fit */
        position: relative;
        border: 1px solid #e2e8f0;
      }
      .batch-table-Excel {
        border-collapse: separate; 
        border-spacing: 0;
        width: 100%;
      }
      .batch-table-Excel thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 100; /* Increased z-index */
        background-color: #e2e8f0 !important;
        border-bottom: 2px solid #cbd5e1;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        padding: 10px; /* Add padding for better look */
        color: #1e293b;
        font-weight: bold;
      }
      .batch-table-Excel tbody td {
        border-bottom: 1px solid #e2e8f0;
      }
      .excel-dropdown-list {
        z-index: 99999 !important;
      }
    </style>
    <div class="modal-all_other_bases batch-modal-Excel">
      <button class="modal-close-all_other_bases">×</button>
      <div class="modal-content-Excel">
        <h3 class="batch-title-Excel">Імпорт даних з Excel</h3>
        <p class="batch-instructions-Excel">
          Вставте дані з Excel (Ctrl+V) у форматі:<br>
          <strong>Дата ┃ Магазин ┃ Каталог номер ┃ Деталь ┃ Кількість надходження ┃ Ціна ┃ Ціна клієнта ┃ Склад ┃ Рахунок № ┃ Акт № ┃ Одиниця виміру</strong><br>
        </p>
        <textarea id="batch-textarea-Excel" class="batch-textarea-Excel" placeholder="Вставте дані з Excel сюди (з табуляцією між колонками)..." autocomplete="off"></textarea>
        <div id="batch-table-container-Excel" class="batch-table-container-Excel hidden-all_other_bases">
          <table id="batch-table-Excel" class="batch-table-Excel">
            <thead>
              <tr>
                <th data-col="date">Дата</th>
                <th data-col="shop">Магазин</th>
                <th data-col="catno">Каталог номер</th>
                <th data-col="detail">Деталь</th>
                <th data-col="qty">Кількість</th>
                <th data-col="price">Ціна</th>
                <th data-col="clientPrice">Ціна клієнта</th>
                <th data-col="warehouse">Склад</th>
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
    if (parts.length < 11) parts = line.split(/\s{2,}/);
    if (parts.length < 11) parts = line.split(/\s+/);
    // Pad to 11 parts with empty strings if necessary
    while (parts.length < 11) {
      parts.push("");
    }
    // Trim each part, but keep empty strings
    parts = parts.map((part) => part.trim());
    // No longer filter out empties - we want all 11 fields, even empty
    if (parts.length < 11) {
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
      warehouse: parts[7], // Нове поле Склад
      invoice: parts[8],
      actNo: parts[9],
      unit: parts[10],
      status: "Готовий",
      unitValid: true,
      shopValid: true,
      detailValid: true,
      actValid: true,
      actClosed: false,
      warehouseValid: true, // Нова валідація для складу
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
    // Перевірка одиниці виміру
    if (!VALID_UNITS.includes(row.unit)) {
      row.unitValid = false;
    }

    // Магазин: якщо порожній - невалідний, якщо заповнений - завжди валідний (створимо якщо немає)
    if (!row.shop || !row.shop.trim()) {
      row.shopValid = false;
    } else {
      // Перевіряємо чи є в списку (для підсвічування), але завжди валідний
      const existsInCache = shopsListCache.includes(row.shop);
      row.shopValid = true; // завжди валідний, якщо заповнений
      // Зберігаємо інфо чи існує (для кольору)
      (row as any).shopExists = existsInCache;
    }

    // Деталь: якщо порожня - невалідна, якщо заповнена - завжди валідна (створимо якщо немає)
    if (!row.detail || !row.detail.trim()) {
      row.detailValid = false;
    } else {
      // Перевіряємо чи є в списку (для підсвічування), але завжди валідна
      const existsInCache = detailsListCache.includes(row.detail);
      row.detailValid = true; // завжди валідна, якщо заповнена
      // Зберігаємо інфо чи існує (для кольору)
      (row as any).detailExists = existsInCache;
    }

    // Акт: порожній - валідний (необов'язкове поле), заповнений - перевіряємо
    if (row.actNo && row.actNo.trim()) {
      const trimmedActNo = row.actNo.trim();
      row.actValid = actsListCache.includes(trimmedActNo);
      if (row.actValid) {
        const actIdNum = parseInt(trimmedActNo, 10);
        if (actsDateOffMap.has(actIdNum)) {
          row.actClosed = actsDateOffMap.get(actIdNum) !== null;
        }
      }
    }

    // Склад: обов'язкове поле, перевіряємо чи є в списку активних складів
    if (!row.warehouse || !row.warehouse.trim()) {
      row.warehouseValid = false;
    } else {
      // Перевіряємо чи номер складу є в списку активних
      row.warehouseValid = warehouseListCache.includes(row.warehouse.trim());
    }

    // Фінальна перевірка: тільки обов'язкові поля та їх валідність
    // Обов'язкові: Дата, Магазин, Каталог номер, Деталь, Кількість, Ціна, Одиниця, Склад
    // Необов'язкові: Рахунок №, Ціна клієнта, Акт №
    if (
      isNaN(row.qty) ||
      isNaN(row.price) ||
      !row.date ||
      !row.catno ||
      !row.detail ||
      !row.unit ||
      !row.shop ||
      !row.unitValid ||
      !row.warehouseValid
    ) {
      row.status = "Помилка";
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
    "warehouse",
    "invoice",
    "actNo",
    "unit",
    "status",
  ];
  const headers = [
    "Дата",
    "Магазин",
    "Каталог номер",
    "Деталь",
    "Кількість",
    "Ціна",
    "Ціна клієнта",
    "Склад",
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
    
    // Ліміти відповідно до типу даних в колонці
    let limit = 130;
    if (col === "detail") limit = 240;           // Деталь - залишаємо великий
    else if (col === "shop") limit = 160;        // Магазин - текст
    else if (col === "catno") limit = 150;       // Каталог номер
    else if (col === "date") limit = 105;        // Дата: dd.mm.yyyy
    else if (col === "qty") limit = 90;          // Кількість: числа
    else if (col === "price") limit = 100;       // Ціна: числа
    else if (col === "clientPrice") limit = 100; // Ціна клієнта: числа
    else if (col === "warehouse") limit = 60;    // Склад: 1-3 цифри
    else if (col === "invoice") limit = 90;     // Рахунок №
    else if (col === "actNo") limit = 80;        // Акт №: числа
    else if (col === "unit") limit = 70;         // Одиниця: штук/літр/комплект
    else if (col === "status") limit = 100;      // Статус

    widths.set(col, Math.min(Math.ceil(maxWidth), limit));
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

  // Оптимізація: розраховуємо ширину ТІЛЬКИ якщо вона ще не задана
  if (!list.style.width) {
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
    const finalWidth = Math.min(Math.max(maxContentWidth, rect.width, 200), 500);
    list.style.width = `${finalWidth}px`;
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

  list.style.maxHeight = `${listHeight}px`;

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
          "invalid-warehouse",
          "closed-act"
        );
      }
      if (field === "unit") {
        parsedDataGlobal[index].unitValid = true;
      } else if (field === "shop") {
        parsedDataGlobal[index].shopValid = true;
        (parsedDataGlobal[index] as any).shopExists = true; // вибрано зі списку = існує
      } else if (field === "detail") {
        parsedDataGlobal[index].detailValid = true;
        (parsedDataGlobal[index] as any).detailExists = true; // вибрано зі списку = існує
      } else if (field === "actNo") {
        parsedDataGlobal[index].actValid = true;
        const actIdNum = parseInt(option, 10);
        parsedDataGlobal[index].actClosed =
          actsDateOffMap.has(actIdNum) && actsDateOffMap.get(actIdNum) !== null;
        if (parsedDataGlobal[index].actClosed) {
          if (td) td.classList.add("closed-act");
        }
      } else if (field === "warehouse") {
        parsedDataGlobal[index].warehouseValid = true;
      }

      recalculateAndApplyWidths();
      revalidateRow(index);

      // Додатково: якщо всі поля валідні, явно встановлюємо статус (дублюємо логіку з updateDropdownList)
      const row = parsedDataGlobal[index];
      if (row.status === "Помилка" || row.status === "Помилка") {
        // Перевіряємо чи всі обов'язкові поля заповнені
        const allFilled = row.date && row.shop && row.catno && row.detail && row.unit && row.warehouse;
        const numbersValid = !isNaN(row.qty) && !isNaN(row.price);
        // Примітка: unitValid і warehouseValid перевіряються вище
        if (allFilled && numbersValid && row.unitValid && row.warehouseValid) {
          // Ще раз викликаємо revalidateRow, щоб вона точно схопила нові дані
          // (іноді дані можуть не встигнути оновитися перед першим викликом)
          revalidateRow(index);
        }
      }

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
    "warehouse",
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
    // Магазин: жовтий якщо не існує в базі (буде створено)
    const shopTdClass = row.shop && !(row as any).shopExists ? "invalid-shop" : "";
    // Деталь: жовтий якщо не існує в базі (буде створено)
    const detailTdClass = row.detail && !(row as any).detailExists ? "invalid-detail" : "";
    const unitTdClass = !row.unitValid ? "invalid-unit" : "";
    const actTdClass =
      row.actNo && !row.actValid
        ? "invalid-act"
        : row.actClosed
          ? "closed-act"
          : "";
    // Склад: червоний якщо невалідний
    const warehouseTdClass = !row.warehouseValid ? "invalid-warehouse" : "";
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
        <textarea
          class="cell-input-Excel cell-input-combo-Excel detail-input-Excel"
          data-field="detail"
          data-index="${index}"
          autocomplete="off"
          rows="1"
          style="overflow:hidden; resize:none; min-height:30px; width:100%; box-sizing:border-box; white-space: pre-wrap; line-height: 1.3; padding-top: 6px;"
        >${row.detail}</textarea>
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
      <td class="${warehouseTdClass}" style="width:${getWidth(
      "warehouse"
    )}px;min-width:${getWidth("warehouse")}px;max-width:${getWidth("warehouse")}px;">
        <input
          type="text"
          class="cell-input-Excel cell-input-combo-Excel warehouse-input-Excel"
          value="${row.warehouse || ""}"
          data-field="warehouse"
          data-index="${index}"
          autocomplete="off"
        >
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
// ===== Валідація рядка при редагуванні =====
function revalidateRow(index: number) {
  const row = parsedDataGlobal[index];
  if (!row) return;

  // Якщо статус був "Успішно" або "Збережено", не чіпаємо
  if (
    row.status === "✅ Успішно" ||
    row.status === "⚠️ Збережено (акт не оновлено)"
  ) {
    return;
  }

  // Перевірка на заповненість обов'язкових полів
  // Обов'язкові: Дата, Магазин, Каталог номер, Деталь, Кількість, Ціна, Одиниця, Склад
  // Необов'язкові: Рахунок №, Ціна клієнта, Акт №

  console.log(`[revalidateRow ${index}] Checking row:`, {
    date: row.date,
    shop: row.shop,
    catno: row.catno,
    detail: row.detail,
    unit: row.unit,
    qty: row.qty,
    price: row.price,
    warehouse: row.warehouse,
    unitValid: row.unitValid,
    warehouseValid: row.warehouseValid
  });

  const isFilled =
    row.date &&
    String(row.date).trim() &&
    row.shop &&
    String(row.shop).trim() &&
    row.catno &&
    String(row.catno).trim() &&
    row.detail &&
    String(row.detail).trim() &&
    row.unit &&
    String(row.unit).trim() &&
    row.warehouse &&
    String(row.warehouse).trim();

  // Перевірка чисел (ціна клієнта необов'язкова)
  const areNumbersValid =
    !isNaN(row.qty) && !isNaN(row.price);

  console.log(`[revalidateRow ${index}] Validation:`, {
    isFilled,
    areNumbersValid,
    unitValid: row.unitValid,
    warehouseValid: row.warehouseValid
  });

  // Перевірка валідності
  // shopValid і detailValid тепер завжди true якщо заповнені
  // Перевіряємо unitValid і warehouseValid
  // Акт взагалі не перевіряємо - він необов'язковий

  const isValid =
    isFilled &&
    areNumbersValid &&
    row.unitValid &&
    row.warehouseValid;

  const statusCell = document.querySelector(
    `#batch-table-Excel tbody tr:nth-child(${index + 1}) .status-cell-Excel`
  );
  if (!statusCell) return;
  const statusTextEl = statusCell.querySelector(".status-text-Excel");

  if (isValid) {
    row.status = "Готовий";
    statusCell.className = "status-cell-Excel ready-Excel";
    if (statusTextEl) statusTextEl.textContent = "Готовий";
  } else {
    // Якщо не валідно - ставимо помилку
    row.status = "Помилка";
    statusCell.className = "status-cell-Excel error-Excel";
    if (statusTextEl) statusTextEl.textContent = "Помилка";
  }
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
      parsedDataGlobal[index]["date"] = fromIsoToDisplay(target.value);
      recalculateAndApplyWidths();
      revalidateRow(index);
    });
    input.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      parsedDataGlobal[index]["date"] = fromIsoToDisplay(target.value);
      recalculateAndApplyWidths();
      revalidateRow(index);
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
        revalidateRow(index);
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
      revalidateRow(index);
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
      revalidateRow(index);
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
      revalidateRow(index);
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
      revalidateRow(index);
    });
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value.trim();
      const td = target.closest("td");

      if (!value) {
        // Порожній - невалідний
        parsedDataGlobal[index].shopValid = false;
        (parsedDataGlobal[index] as any).shopExists = false;
      } else {
        // Заповнений - завжди валідний, але перевіряємо чи існує
        const existsInCache = shopsListCache.includes(value);
        parsedDataGlobal[index].shopValid = true;
        (parsedDataGlobal[index] as any).shopExists = existsInCache;

        // Колір: жовтий якщо не існує
        if (!existsInCache) {
          if (td) td.classList.add("invalid-shop");
        } else {
          if (td) td.classList.remove("invalid-shop");
        }
      }
      revalidateRow(index);
    });
  });
  // Деталь з live-фільтром
  tbody.querySelectorAll(".detail-input-Excel").forEach((el) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;

    // Авто-розширення висоти
    const autoResize = () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    };
    // Ініціалізація висоти
    setTimeout(autoResize, 0);

    input.addEventListener("click", (e) => {
      e.stopPropagation();
      showDropdownList(e.target as HTMLElement, detailsListCache);
    });
    input.addEventListener("input", (e) => {
      autoResize(); // Авто-ресайз при введенні
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
      revalidateRow(index);
    });
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value.trim();
      const td = target.closest("td");

      if (!value) {
        // Порожня - невалідна
        parsedDataGlobal[index].detailValid = false;
        (parsedDataGlobal[index] as any).detailExists = false;
      } else {
        // Заповнена - завжди валідна, але перевіряємо чи існує
        const existsInCache = detailsListCache.includes(value);
        parsedDataGlobal[index].detailValid = true;
        (parsedDataGlobal[index] as any).detailExists = existsInCache;

        // Колір: жовтий якщо не існує
        if (!existsInCache) {
          if (td) td.classList.add("invalid-detail");
        } else {
          if (td) td.classList.remove("invalid-detail");
        }
      }
      revalidateRow(index);
    });
  });
  // Склад з live-фільтром
  tbody.querySelectorAll(".warehouse-input-Excel").forEach((input) => {
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      showDropdownList(e.target as HTMLElement, warehouseListCache);
    });
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value;
      parsedDataGlobal[index]["warehouse"] = value;
      const td = target.closest("td");
      if (td) {
        td.classList.remove("invalid-warehouse");
      }
      const filter = value.toLowerCase();
      const filteredOptions = filter
        ? warehouseListCache.filter((opt) => opt.toLowerCase().includes(filter))
        : warehouseListCache;
      if (currentDropdownInput === target && currentDropdownList) {
        updateDropdownList(filteredOptions, target, index, "warehouse");
        if (filteredOptions.length)
          positionDropdown(target, currentDropdownList);
        else closeDropdownList();
      }
      recalculateAndApplyWidths();
      revalidateRow(index);
    });
    input.addEventListener("blur", (e) => {
      const target = e.target as HTMLInputElement;
      const index = parseInt(target.dataset.index || "0");
      const value = target.value.trim();
      const td = target.closest("td");

      if (!value) {
        // Порожній - невалідний
        parsedDataGlobal[index].warehouseValid = false;
        if (td) td.classList.add("invalid-warehouse");
      } else {
        // Перевіряємо чи є в списку активних складів
        const existsInCache = warehouseListCache.includes(value);
        parsedDataGlobal[index].warehouseValid = existsInCache;

        // Колір: червоний якщо не існує
        if (!existsInCache) {
          if (td) td.classList.add("invalid-warehouse");
        } else {
          if (td) td.classList.remove("invalid-warehouse");
        }
      }
      revalidateRow(index);
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
          "invalid-warehouse",
          "closed-act"
        );
      }
      if (field === "unit") {
        parsedDataGlobal[index].unitValid = true;
      } else if (field === "shop") {
        parsedDataGlobal[index].shop = option; // явно оновлюємо
        parsedDataGlobal[index].shopValid = true;
        (parsedDataGlobal[index] as any).shopExists = true; // вибрано зі списку = існує
      } else if (field === "detail") {
        parsedDataGlobal[index].detail = option; // явно оновлюємо
        parsedDataGlobal[index].detailValid = true;
        (parsedDataGlobal[index] as any).detailExists = true; // вибрано зі списку = існує
      } else if (field === "actNo") {
        parsedDataGlobal[index].actNo = option; // явно оновлюємо
        parsedDataGlobal[index].actValid = true;
        const actIdNum = parseInt(option, 10);
        parsedDataGlobal[index].actClosed =
          actsDateOffMap.has(actIdNum) && actsDateOffMap.get(actIdNum) !== null;
        if (parsedDataGlobal[index].actClosed) {
          if (td) td.classList.add("closed-act");
        }
      } else if (field === "warehouse") {
        parsedDataGlobal[index].warehouse = option; // явно оновлюємо
        parsedDataGlobal[index].warehouseValid = true;
      }

      // Примусово оновлюємо статус
      recalculateAndApplyWidths();
      revalidateRow(index);

      // Додатково: якщо всі поля валідні, явно встановлюємо статус
      const row = parsedDataGlobal[index];
      if (row.status === "Помилка" || row.status === "Помилка") {
        // Перевіряємо чи всі обов'язкові поля заповнені
        const allFilled = row.date && row.shop && row.catno && row.detail && row.unit && row.warehouse;
        const numbersValid = !isNaN(row.qty) && !isNaN(row.price);
        if (allFilled && numbersValid && row.unitValid && row.warehouseValid) {
          row.status = "Готовий";
          const statusCell = document.querySelector(
            `#batch-table-Excel tbody tr:nth-child(${index + 1}) .status-cell-Excel`
          );
          if (statusCell) {
            statusCell.className = "status-cell-Excel ready-Excel";
            const statusText = statusCell.querySelector(".status-text-Excel");
            if (statusText) statusText.textContent = "Готовий";
          }
        }
      }

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

    // 3) Shops - з перевіркою на дублікати
    console.log(`🏪 Обробка ${uniqueShops.length} унікальних магазинів...`);
    for (const shopName of uniqueShops) {
      // Спочатку перевіряємо чи вже є в кеші (створений раніше в цьому ж батчі)
      if (existingShops.has(shopName)) {
        console.log(`✓ Магазин "${shopName}" вже в кеші, пропускаємо`);
        continue;
      }

      let shopId = await getShopIdByName(shopName);
      if (!shopId) {
        console.log(`➕ Створюємо новий магазин: "${shopName}"`);
        resetShopState();
        shopEditState.currentName = shopName;
        shopEditState.touched = true;
        await tryHandleShopsCrud();

        // Невелика затримка для синхронізації з БД
        await new Promise((resolve) => setTimeout(resolve, 100));

        shopId = await getShopIdByName(shopName);
        if (shopId) {
          console.log(`✅ Магазин "${shopName}" створено з ID: ${shopId}`);
        } else {
          console.warn(`⚠️ Не вдалося отримати ID для магазину "${shopName}"`);
        }
      } else {
        console.log(`✓ Магазин "${shopName}" вже існує з ID: ${shopId}`);
      }

      if (shopId) {
        await ensureShopDataName(shopId, shopName);
        existingShops.set(shopName, shopId);
      }
    }

    // 4) Details - з перевіркою на дублікати
    console.log(`📦 Обробка ${uniqueDetails.length} унікальних деталей...`);
    for (const detailName of uniqueDetails) {
      // Спочатку перевіряємо чи вже є в кеші (створена раніше в цьому ж батчі)
      if (existingDetails.has(detailName)) {
        console.log(`✓ Деталь "${detailName}" вже в кеші, пропускаємо`);
        continue;
      }

      let detailId = await getDetailIdByName(detailName);
      if (!detailId) {
        console.log(`➕ Створюємо нову деталь: "${detailName}"`);
        resetDetailState();
        detailEditState.currentName = detailName;
        detailEditState.touched = true;
        await tryHandleDetailsCrud();

        // Невелика затримка для синхронізації з БД
        await new Promise((resolve) => setTimeout(resolve, 100));

        detailId = await getDetailIdByName(detailName);
        if (detailId) {
          console.log(`✅ Деталь "${detailName}" створено з ID: ${detailId}`);
        } else {
          console.warn(`⚠️ Не вдалося отримати ID для деталі "${detailName}"`);
        }
      } else {
        console.log(`✓ Деталь "${detailName}" вже існує з ID: ${detailId}`);
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
      offInput.value = "0";
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
        sclad_procent: String(row.warehouse || ""), // Номер складу
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
  const row = document.querySelector(
    `#batch-table-Excel tbody tr:nth-child(${rowIndex + 1})`
  );

  if (!row) return;

  const statusCell = row.querySelector('.status-cell-Excel');

  if (statusCell) {
    const statusTextEl = statusCell.querySelector(".status-text-Excel");
    if (statusTextEl) statusTextEl.textContent = statusText;
    (statusCell as HTMLElement).className = success
      ? "status-cell-Excel success-Excel"
      : "status-cell-Excel error-Excel";
    if (success) {
      const deleteBtn = statusCell.querySelector(".delete-row-btn-Excel");
      deleteBtn?.remove();

      // 🔒 Блокуємо АБСОЛЮТНО ВСІ інпути (включно з dropdown)
      const inputs = row.querySelectorAll<HTMLInputElement>('.cell-input-Excel');
      inputs.forEach(input => {
        input.readOnly = true;
        input.disabled = true; // Для надійності
        input.style.backgroundColor = '#f5f5f5';
        input.style.cursor = 'not-allowed';
        input.style.color = '#666';
        input.style.pointerEvents = 'none'; // Забороняємо кліки (щоб dropdown не відкривався)
      });
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
  warehouseListCache = await loadWarehouseList();

  console.log("Завантажено магазинів:", shopsListCache.length);
  console.log("Завантажено деталей:", detailsListCache.length);
  console.log("Завантажено актів:", actsListCache.length);
  console.log("Завантажено складів:", warehouseListCache.length);

  // Ensure модалки створені один раз
  const existingModal = document.getElementById(batchModalId);
  if (!existingModal) {
    document.body.appendChild(createBatchImportModal());
  }
  const existingConfirmModal = document.getElementById(confirmModalId);
  if (!existingConfirmModal) {
    document.body.appendChild(createConfirmModal());
  }

  // Слухач скролу для "прилипання" дропдауну до інпута
  const tableContainer = document.getElementById("batch-table-container-Excel");
  if (tableContainer) {
    tableContainer.addEventListener("scroll", () => {
      if (currentDropdownInput && currentDropdownList) {
        positionDropdown(currentDropdownInput, currentDropdownList);
      }
    });
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

      // Оновлюємо кеш у фоновому режимі при відкритті
      Promise.all([loadShopsList(), loadDetailsList(), loadActsList(), loadWarehouseList()])
        .then(([shops, details, acts, warehouses]) => {
          shopsListCache = shops;
          detailsListCache = details;
          actsListCache = acts.list;
          actsDateOffMap = acts.map;
          warehouseListCache = warehouses;
        })
        .catch((err) => console.error("Помилка оновлення кешу імпорту:", err));
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
          warehouse: (allInputs[7] as HTMLInputElement).value, // Номер складу
          invoice: (allInputs[8] as HTMLInputElement).value,
          actNo: (allInputs[9] as HTMLInputElement).value,
          unit: (allInputs[10] as HTMLInputElement).value,
          status: statusText,
          rowNumber: index + 1,
          warehouseValid: row.warehouseValid,
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

      // Перевірка складів
      const invalidWarehouses = currentData.filter(
        (row) =>
          (!row.warehouse || !row.warehouse.trim() || !warehouseListCache.includes(row.warehouse.trim())) && 
          !row.status.includes("Помилка")
      );
      if (invalidWarehouses.length > 0) {
        showNotification("❌ Невірно вказаний або порожній склад", "error", 4000);
        hasErrors = true;
        invalidWarehouses.forEach((row) => {
          const warehouseTd = document.querySelector(
            `#batch-table-Excel tbody tr:nth-child(${row.rowNumber}) td:has(.warehouse-input-Excel)`
          ) as HTMLElement;
          if (warehouseTd) warehouseTd.classList.add("invalid-warehouse");
        });
      }

      if (hasErrors) return;

      const validData = currentData.filter(
        (row) =>
          !row.status.includes("Помилка") && row.shop && row.unit && row.detail && row.warehouse && row.warehouseValid
      );
      if (validData.length === 0) {
        showNotification(
          "Немає валідних даних для завантаження! Перевірте, чи заповнено магазин, деталь, одиницю виміру та склад.",
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

      const confirmed = await showConfirmModal(validData.length, currentData.length);
      if (confirmed) {
        await uploadBatchData(validData); // ⬅️ тепер захищено isUploading
      }
    };
  }
}

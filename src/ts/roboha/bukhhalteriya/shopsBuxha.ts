// src/ts/roboha/bukhhalteriya/shopsBuxha.ts

import { supabase } from "../../vxid/supabaseClient";
import {
  formatDate,
  formatNumber,
  byId,
  updateTotalSum,
} from "./bukhhalteriya";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../tablucya/users";

// ==== Доступ та підтвердження пароля (для масового розрахунку) ====
const FULL_ACCESS_ALIASES = ["адміністратор", "full", "admin", "administrator"];

function getCurrentAccessLevel(): string {
  const fromVar =
    (typeof userAccessLevel === "string" ? userAccessLevel : "") || "";
  const fromLS = getSavedUserDataFromLocalStorage?.() || null;
  const level = (fromVar || fromLS?.access || (fromLS as any)?.["Доступ"] || "")
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  return level;
}

function splitDateTimeSafe(dt: string | null | undefined): {
  dateISO: string;
  timeHM: string;
} {
  const s = (dt || "").trim();
  if (!s) return { dateISO: "", timeHM: "" };

  // Витягнемо YYYY-MM-DD і HH:MM з будь-якого формату: "2025-10-05 16:06:00+00", "2025-10-05T16:06:00Z", тощо
  const m = s.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/);
  if (m) {
    return { dateISO: m[1], timeHM: m[2] };
  }

  // fallback: парсимо як Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dateISO = d.toISOString().slice(0, 10);
    const timeHM = d.toTimeString().slice(0, 5); // локальний HH:MM
    return { dateISO, timeHM };
  }

  // якщо зовсім дивний формат — хоч би дата
  return { dateISO: s.split(/[ T]/)[0] || "", timeHM: "" };
}

function hasFullAccess(): boolean {
  return FULL_ACCESS_ALIASES.includes(getCurrentAccessLevel());
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function todayDateTime(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().split(" ")[0].slice(0, 5); // HH:MM
  return `${date} ${time}`;
}

function createPasswordConfirmationModal(
  action: "pay" | "unpay" | "return" | "unreturn"
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "password-confirmation-modal";
    modal.style.cssText = `
      position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,.5); z-index:10000; backdrop-filter: blur(3px);
    `;
    const box = document.createElement("div");
    box.style.cssText = `
      background:#fff; width:320px; border-radius:12px; padding:24px; text-align:center;
      box-shadow:0 8px 32px rgba(0,0,0,.15); border: 1px solid #e0e0e0;
    `;
    const h = document.createElement("h3");
    switch (action) {
      case "pay":
        h.textContent = "🔐 Підтвердження розрахунку";
        break;
      case "unpay":
        h.textContent = "🔐 Підтвердження скасування";
        break;
      case "return":
        h.textContent = "⬅️🚚 Підтвердження повернення";
        break;
      case "unreturn":
        h.textContent = "🚚➡️ Підтвердження скасування повернення";
        break;
    }
    h.style.cssText = "margin: 0 0 16px 0; color: #333; font-size: 18px;";

    const inp = document.createElement("input");
    inp.type = "password";
    inp.placeholder = "Введіть пароль...";
    inp.style.cssText = `
      width:100%; padding:12px; margin:12px 0; border:2px solid #e0e0e0; 
      border-radius:8px; font-size:14px; transition: border-color 0.2s;
      box-sizing: border-box;
    `;
    inp.onfocus = () => (inp.style.borderColor = "#007bff");
    inp.onblur = () => (inp.style.borderColor = "#e0e0e0");

    const err = document.createElement("div");
    err.style.cssText =
      "color:#f44336; display:none; margin:8px 0; font-size:14px;";

    const row = document.createElement("div");
    row.style.cssText =
      "display:flex; gap:12px; justify-content:center; margin-top:16px;";

    const ok = document.createElement("button");
    ok.textContent = "Підтвердити";
    ok.style.cssText = `
      flex:1; padding:12px 0; background:#007bff; color:#fff; border:none; 
      border-radius:8px; cursor:pointer; font-size:14px; font-weight:500;
      transition: background-color 0.2s;
    `;
    ok.onmouseover = () => (ok.style.backgroundColor = "#0056b3");
    ok.onmouseout = () => (ok.style.backgroundColor = "#007bff");

    const cancel = document.createElement("button");
    cancel.textContent = "Скасувати";
    cancel.style.cssText = `
      flex:1; padding:12px 0; background:#6c757d; color:#fff; border:none; 
      border-radius:8px; cursor:pointer; font-size:14px; font-weight:500;
      transition: background-color 0.2s;
    `;
    cancel.onmouseover = () => (cancel.style.backgroundColor = "#545b62");
    cancel.onmouseout = () => (cancel.style.backgroundColor = "#6c757d");

    ok.onclick = () => {
      const p = (inp.value || "").trim();
      const saved = getSavedUserDataFromLocalStorage?.();
      if (!p) {
        err.textContent = "Введіть пароль";
        err.style.display = "block";
        return;
      }
      if (!saved) {
        err.textContent = "Не знайдено дані користувача";
        err.style.display = "block";
        return;
      }
      if (p === saved.password) {
        modal.remove();
        resolve(true);
      } else {
        err.textContent = "Невірний пароль";
        err.style.display = "block";
        inp.focus();
        inp.select();
      }
    };

    cancel.onclick = () => {
      modal.remove();
      resolve(false);
    };

    inp.onkeypress = (e) => {
      if (e.key === "Enter") ok.click();
    };

    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        modal.remove();
        resolve(false);
      }
    };
    document.addEventListener("keydown", esc);
    const rm = modal.remove.bind(modal);
    modal.remove = () => {
      document.removeEventListener("keydown", esc);
      rm();
    };

    row.append(ok, cancel);
    box.append(h, inp, err, row);
    modal.append(box);
    document.body.appendChild(modal);
    setTimeout(() => inp.focus(), 50);
  });
}

// ==== Типи ====
interface Detail {
  sclad_id: number;
  Ціна: number;
  Каталог: number;
  Рахунок: string;
  Кількість: number;
  Найменування: string;
  Розраховано?: string;
}

interface HistoryRecord {
  Акт: number;
  Деталі: Detail[];
  Клієнт: string;
  Автомобіль: string;
  ДатаЗакриття: string | null;
  Статус?: string;
}

interface ShopData {
  Name: string;
  Склад: Record<string, any>;
  Історія: Record<string, HistoryRecord[]>;
  "Про магазин": string;
}

interface MagazineRecord {
  pkName?: string;
  pkValue?: string | number;
  rosraxovano: string | null;
  shops: string;
  rahunok: string;
  akt?: number | null;
  name: string;
  part_number: string;
  kilkist_on: number;
  price: number;
  kilkist_off: number;
  date_open?: string;
  date_close?: string;
  isPaid: boolean;
  povernennya?: string | null;
  isReturned?: boolean;
  xto_povernyv?: string | null;
}

const SCLAD_TABLE = "sclad";

// ==== Стан ====
let magazineData: MagazineRecord[] = [];
let allMagazineData: MagazineRecord[] = [];
let availableShops: string[] = [];
let shopsData: ShopData[] = [];
let hasLoadedData = false;
let shopsLoaded = false;
let currentFilters = {
  dateOpen: "",
  dateClose: "",
  shop: "",
  paymentStatus: 2 as 0 | 1 | 2, // 0: розраховано, 1: не розраховано, 2: всі
  availabilityStatus: 4 as 0 | 1 | 2 | 3 | 4, // 0: >0, 1: =0, 2: <0, 3: повернення, 4: всі
};

let autoSearchTimer: number | null = null;
const AUTOSEARCH_DELAY = 350;

function debounceAutoSearch(fn: () => void) {
  if (autoSearchTimer !== null) {
    clearTimeout(autoSearchTimer);
  }
  autoSearchTimer = window.setTimeout(() => {
    autoSearchTimer = null;
    fn();
  }, AUTOSEARCH_DELAY);
}

function getEl<T extends HTMLInputElement | HTMLSelectElement>(
  id: string
): T | null {
  return document.getElementById(id) as T | null;
}

// ==== Завантаження даних магазинів з JSONB ====
async function fetchShopData(): Promise<ShopData[]> {
  try {
    const { data, error } = await supabase.from("shops").select("*");

    if (error) {
      console.error("Помилка Supabase:", error);
      throw new Error(`Помилка завантаження: ${error.message}`);
    }

    if (data && Array.isArray(data)) {
      return data
        .map((item, index) => {
          try {
            let parsedData;
            if (typeof item.data === "string") {
              parsedData = JSON.parse(item.data);
            } else if (typeof item.data === "object" && item.data !== null) {
              parsedData = item.data;
            } else {
              console.warn(
                `Пропущений запис ${index}: невірний формат data`,
                item
              );
              return null;
            }

            if (!parsedData || !parsedData.Name) {
              console.warn(
                `Пропущений запис ${index}: немає поля Name`,
                parsedData
              );
              return null;
            }

            return parsedData;
          } catch (parseError) {
            console.error(
              `Помилка парсингу запису ${index}:`,
              parseError,
              item
            );
            return null;
          }
        })
        .filter((item): item is ShopData => item !== null);
    } else {
      throw new Error("Невірний формат даних з Supabase");
    }
  } catch (error) {
    console.error("Помилка завантаження даних магазинів:", error);
    showNotification("Помилка завантаження даних магазинів", "error", 5000);
    return [];
  }
}


function openActModal(actNumber: number): void {
  let foundRec: HistoryRecord | null = null;
  let foundShop: ShopData | null = null;
  let foundDate: string | null = null;

  for (const shop of shopsData) {
    for (const date of Object.keys(shop.Історія || {})) {
      for (const rec of shop.Історія[date]) {
        if (rec.Акт === actNumber) {
          foundRec = rec;
          foundShop = shop;
          foundDate = date;
          break;
        }
      }
      if (foundRec) break;
    }
    if (foundRec) break;
  }

  if (!foundRec) {
    showNotification("Акт не знайдено", "error");
    return;
  }

  const modal = document.createElement("div");
  modal.style.cssText = `position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.5); z-index:10000;`;

  const box = document.createElement("div");
  box.style.cssText = `background:#fff; width:90vw; max-width:800px; max-height:90vh; border-radius:12px; padding:24px; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,.15);`;

  const title = document.createElement("h2");
  title.textContent = `Акт №${actNumber}`;
  title.style.cssText = "margin:0 0 16px; color:#333;";

  const info = document.createElement("div");
  info.innerHTML = `
  <p><strong>Магазин:</strong> ${foundShop?.Name || "-"}</p>
  <p><strong>Дата відкриття:</strong> ${formatDate(foundDate || "")}</p>
  <p><strong>Клієнт:</strong> ${foundRec.Клієнт || "-"}</p>
  <p><strong>Автомобіль:</strong> ${foundRec.Автомобіль || "-"}</p>
  <p><strong>Статус:</strong> ${foundRec.Статус || "-"}</p>
  <p><strong>Дата закриття:</strong> ${formatDate(
    foundRec.ДатаЗакриття || ""
  )}</p>
`;

  info.style.cssText =
    "margin-bottom:24px; padding:16px; background:#f8f9fa; border-radius:8px;";

  const detailsTitle = document.createElement("h3");
  detailsTitle.textContent = "Деталі:";
  detailsTitle.style.cssText = "margin:16px 0 8px; color:#333;";

  const detailsTable = document.createElement("table");
  detailsTable.style.cssText = "width:100%; border-collapse:collapse;";

  const thead = detailsTable.createTHead();
  const trh = thead.insertRow();
  ["Найменування", "Каталог", "Рахунок", "Кількість", "Ціна", "Сума"].forEach(
    (text) => {
      const th = document.createElement("th");
      th.textContent = text;
      th.style.cssText =
        "padding:8px; border:1px solid #ddd; background:#e9ecef; text-align:left;";
      trh.appendChild(th);
    }
  );

  const tbody = detailsTable.createTBody();
  foundRec.Деталі?.forEach((det) => {
    const tr = tbody.insertRow();
    ["Найменування", "Каталог", "Рахунок", "Кількість", "Ціна"].forEach(
      (key) => {
        const td = tr.insertCell();
        let val = det[key as keyof Detail];
        if (key === "Ціна") val = formatNumber(Number(val));
        if (key === "Каталог") val = Number(val).toString();
        if (key === "Кількість") val = Number(val);
        td.textContent = String(val || "-");
        td.style.cssText = "padding:8px; border:1px solid #ddd;";
      }
    );
    const sumTd = tr.insertCell();
    sumTd.textContent = formatNumber(Number(det.Ціна) * Number(det.Кількість));
    sumTd.style.cssText =
      "padding:8px; border:1px solid #ddd; font-weight:bold;";
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Закрити";
  closeBtn.style.cssText =
    "margin-top:16px; padding:12px 24px; background:#6c757d; color:#fff; border:none; border-radius:8px; cursor:pointer;";
  closeBtn.onclick = () => modal.remove();

  box.append(title, info, detailsTitle, detailsTable, closeBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
}

// ==== Карта відповідностей найменування -> каталожний номер ====
function buildNameToCatalogMap(): Map<string, string> {
  const map = new Map<string, string>();

  allMagazineData.forEach((record) => {
    if (record.name && record.part_number) {
      const name = record.name.trim();
      const catalog = record.part_number.trim();
      if (name && catalog) {
        if (!map.has(name)) {
          map.set(name, catalog);
        }
      }
    }
  });

  return map;
}

// ==== Функція автосинхронізації між полями ====
function syncCatalogFromName(selectedName: string): void {
  if (!selectedName.trim()) return;

  const catalogInput = getEl<HTMLInputElement>("Bukhhalter-magazine-catalog");
  if (!catalogInput) return;

  const nameTosCatalogMap = buildNameToCatalogMap();
  const matchingCatalog = nameTosCatalogMap.get(selectedName.trim());

  if (matchingCatalog && catalogInput.value.trim() !== matchingCatalog) {
    catalogInput.value = matchingCatalog;

    const catalogDropdown = smartDropdowns.find(
      (d) => d.config.inputId === "Bukhhalter-magazine-catalog"
    );
    if (catalogDropdown) {
      catalogDropdown.updateItems([matchingCatalog]);
    }

    triggerAutoFilter();
  }
}

// ==== Централізована функція для запуску автофільтрації ====
function triggerAutoFilter(): void {
  if (hasLoadedData) {
    debounceAutoSearch(() => {
      void autoFilterFromInputs();
    });
  } else {
    debounceAutoSearch(() => {
      void autoSearchFromInputs();
    });
  }
}

// ==== Завантаження списку магазинів ====
async function loadAvailableShops(): Promise<void> {
  if (shopsLoaded) return;

  try {
    const { data, error } = await supabase
      .from(SCLAD_TABLE)
      .select("shops")
      .not("shops", "is", null)
      .not("shops", "eq", "");

    if (error) throw error;

    availableShops = [
      ...new Set(data?.map((row) => row.shops).filter(Boolean) || []),
    ].sort();

    populateShopsSelectOptions();

    shopsLoaded = true;
    console.log(`Завантажено ${availableShops.length} магазинів для вибору`);
  } catch (error) {
    console.error("Помилка завантаження магазинів:", error);
    showNotification("Помилка завантаження списку магазинів", "error", 3000);
  }
}

// ==== Покращені випадаючі списки з пошуком ====
interface DropdownConfig {
  inputId: string;
  listId: string;
  placeholder: string;
  icon: string;
  maxItems: number;
}

const dropdownConfigs: DropdownConfig[] = [
  {
    inputId: "Bukhhalter-magazine-bill",
    listId: "dl-mag-bill",
    placeholder: "Введіть або оберіть рахунок...",
    icon: "",
    maxItems: 100,
  },
  {
    inputId: "Bukhhalter-magazine-item",
    listId: "dl-mag-item",
    placeholder: "Введіть або оберіть найменування...",
    icon: "",
    maxItems: 150,
  },
  {
    inputId: "Bukhhalter-magazine-catalog",
    listId: "dl-mag-catalog",
    placeholder: "Введіть або оберіть каталожний номер...",
    icon: "",
    maxItems: 100,
  },
];

class SmartDropdown {
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement;
  public readonly config: DropdownConfig;
  private items: string[] = [];
  private filteredItems: string[] = [];
  private selectedIndex = -1;
  private isOpen = false;
  private userHasTyped = false;

  constructor(config: DropdownConfig) {
    this.config = config;
    const inputEl = getEl<HTMLInputElement>(config.inputId);
    if (!inputEl) {
      throw new Error(`Input element with id ${config.inputId} not found`);
    }
    this.input = inputEl;
    this.dropdown = document.createElement("div");

    this.createDropdown();
    this.bindEvents();
  }

  private createDropdown() {
    if (!this.input.parentElement?.classList.contains("dropdown-wrapper")) {
      const wrapper = document.createElement("div");
      wrapper.className = "dropdown-wrapper";
      wrapper.style.cssText =
        "position: relative; display: inline-block; width: 100%;";

      const icon = document.createElement("span");
      icon.textContent = this.config.icon;
      icon.className = "dropdown-icon";
      icon.style.cssText = `
        position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
        font-size: 16px; pointer-events: none; z-index: 2;
      `;

      this.input.placeholder = this.config.placeholder;

      this.input.parentNode?.insertBefore(wrapper, this.input);
      wrapper.appendChild(this.input);
      wrapper.appendChild(icon);
    }

    this.dropdown.className = "smart-dropdown";
    this.dropdown.style.cssText = `
      position: absolute; top: 100%; left: 0; right: 0; z-index: 1000;
      background: white; border: 2px solid #e0e0e0; border-top: none;
      border-radius: 0 0 12px 12px; max-height: 240px; overflow-y: auto; overflow-x: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: none;
      backdrop-filter: blur(8px); background: rgba(255,255,255,0.95);
    `;

    this.input.parentElement?.appendChild(this.dropdown);
  }

  private bindEvents() {
    this.input.addEventListener("focus", () => {
      this.show();
    });

    this.input.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.input.value && !this.userHasTyped) {
        this.filter("");
      } else {
        this.filter(this.input.value);
      }
      this.show();
    });

    this.input.addEventListener("keydown", (e) => {
      if (!this.isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          this.selectNext();
          break;
        case "ArrowUp":
          e.preventDefault();
          this.selectPrev();
          break;
        case "Enter":
          e.preventDefault();
          this.selectCurrent();
          break;
        case "Escape":
          this.hide();
          break;
      }
    });

    this.input.addEventListener("input", () => {
      this.userHasTyped = true;

      this.filter(this.input.value);
      if (!this.isOpen) this.show();

      triggerAutoFilter();
    });

    document.addEventListener("click", (e) => {
      if (!this.input.parentElement?.contains(e.target as Node)) {
        this.hide();
      }
    });
  }

  public updateItems(items: string[]) {
    this.items = [...new Set(items)].sort();
    this.filter(this.input.value);
  }

  private filter(query: string) {
    const q = query.toLowerCase().trim();
    this.filteredItems = q
      ? this.items
          .filter((item) => item.toLowerCase().includes(q))
          .slice(0, this.config.maxItems)
      : this.items.slice(0, this.config.maxItems);

    this.selectedIndex = -1;
    this.render();
  }

  private render() {
    if (this.filteredItems.length === 0) {
      this.dropdown.innerHTML =
        '<div class="dropdown-empty">Немає варіантів</div>';
      return;
    }

    if (this.filteredItems.length > 6) {
      this.dropdown.style.maxHeight = "240px";
      this.dropdown.style.overflowY = "auto";
    } else {
      this.dropdown.style.maxHeight = "none";
      this.dropdown.style.overflowY = "visible";
    }

    this.dropdown.innerHTML = this.filteredItems
      .map(
        (item, index) => `
        <div class="dropdown-item ${
          index === this.selectedIndex ? "selected" : ""
        }" 
             data-index="${index}">
          ${this.highlightMatch(item, this.input.value)}
        </div>
      `
      )
      .join("");

    this.dropdown.querySelectorAll(".dropdown-item").forEach((el, index) => {
      el.addEventListener("click", () => {
        this.selectItem(index);
      });
    });

    // Динамічне розширення ширини під найдовший елемент
    this.adjustDropdownWidth();
  }

  private adjustDropdownWidth() {
    // Створюємо тимчасовий елемент для вимірювання
    const measurer = document.createElement("div");
    measurer.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: nowrap;
      font-size: 14px;
      padding: 12px 16px;
      font-family: inherit;
    `;
    document.body.appendChild(measurer);

    // Знаходимо найдовший текст
    let maxWidth = this.input.offsetWidth;
    this.filteredItems.forEach((item) => {
      measurer.textContent = item;
      const itemWidth = measurer.offsetWidth;
      if (itemWidth > maxWidth) {
        maxWidth = itemWidth;
      }
    });

    document.body.removeChild(measurer);

    // Встановлюємо ширину (мінімум як у поля вводу, максимум +50% від поля)
    const inputWidth = this.input.offsetWidth;
    const finalWidth = Math.min(maxWidth + 20, inputWidth * 1.5);

    if (finalWidth > inputWidth) {
      this.dropdown.style.width = `${finalWidth}px`;
      this.dropdown.style.minWidth = `${inputWidth}px`;
    } else {
      this.dropdown.style.width = "100%";
    }
  }
  private highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    return text.replace(regex, "<mark>$1</mark>");
  }

  private show() {
    this.isOpen = true;
    this.dropdown.style.display = "block";
    this.input.style.borderRadius = "8px 8px 0 0";
    this.input.style.borderColor = "#007bff";
  }

  private hide() {
    this.isOpen = false;
    this.dropdown.style.display = "none";
    this.input.style.borderRadius = "8px";
    this.input.style.borderColor = "#e0e0e0";
    this.selectedIndex = -1;
  }

  private selectNext() {
    this.selectedIndex = Math.min(
      this.selectedIndex + 1,
      this.filteredItems.length - 1
    );
    this.render();
    this.scrollToSelected();
  }

  private selectPrev() {
    this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
    this.render();
    this.scrollToSelected();
  }

  private selectCurrent() {
    if (this.selectedIndex >= 0) {
      this.selectItem(this.selectedIndex);
    }
  }

  private selectItem(index: number) {
    if (index >= 0 && index < this.filteredItems.length) {
      const selectedValue = this.filteredItems[index];
      this.input.value = selectedValue;
      this.userHasTyped = false;
      this.hide();

      if (this.config.inputId === "Bukhhalter-magazine-item") {
        syncCatalogFromName(selectedValue);
      } else {
        triggerAutoFilter();
      }
    }
  }

  private scrollToSelected() {
    const selected = this.dropdown.querySelector(".dropdown-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }
}

// Стилі для випадаючих списків
function addDropdownStyles() {
  if (document.getElementById("smart-dropdown-styles")) return;

  const style = document.createElement("style");
  style.id = "smart-dropdown-styles";
  style.textContent = `
    .dropdown-wrapper {
      position: relative !important;
      display: inline-block !important;
      width: 100% !important;
    }
    
    .dropdown-icon {
      position: absolute !important;
      left: 12px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      font-size: 16px !important;
      pointer-events: none !important;
      z-index: 2 !important;
      color: #666 !important;
    }
    
    .smart-dropdown {
      border: 2px solid #007bff !important;
      border-top: none !important;
      border-radius: 0 0 12px 12px !important;
      background: rgba(255,255,255,0.98) !important;
      backdrop-filter: blur(8px) !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
      overflow-x: auto !important;
    }
    
    .dropdown-item {
      padding: 12px 16px !important;
      cursor: pointer !important;
      border-bottom: 1px solid #f0f0f0 !important;
      transition: all 0.2s ease !important;
      display: flex !important;
      align-items: center !important;
      font-size: 14px !important;
      white-space: nowrap !important;
    }
    
    .dropdown-item:last-child {
      border-bottom: none !important;
    }
    
    .dropdown-item:hover,
    .dropdown-item.selected {
      background: linear-gradient(135deg, #007bff, #0056b3) !important;
      color: white !important;
      transform: translateX(2px) !important;
    }
    
    .dropdown-item mark {
      background: #ffd700 !important;
      color: #333 !important;
      padding: 2px 4px !important;
      border-radius: 3px !important;
      font-weight: 600 !important;
    }
    
    .dropdown-item.selected mark {
      background: rgba(255,255,255,0.3) !important;
      color: white !important;
    }
    
    .dropdown-empty {
      padding: 16px !important;
      text-align: center !important;
      color: #666 !important;
      font-style: italic !important;
    }
    
    .smart-dropdown {
      animation: slideDown 0.2s ease-out !important;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

let smartDropdowns: SmartDropdown[] = [];

function ensureSmartDropdowns(): void {
  addDropdownStyles();

  if (smartDropdowns.length === 0) {
    smartDropdowns = dropdownConfigs
      .filter((config) => getEl(config.inputId))
      .map((config) => {
        try {
          return new SmartDropdown(config);
        } catch (error) {
          console.warn(
            `Failed to create dropdown for ${config.inputId}:`,
            error
          );
          return null;
        }
      })
      .filter((dropdown): dropdown is SmartDropdown => dropdown !== null);
  }
}

function refreshDropdownOptions(): void {
  const shopEl = getEl<HTMLInputElement | HTMLSelectElement>(
    "Bukhhalter-magazine-shop"
  );
  const shopVal = (shopEl?.value || "").trim();

  let source = allMagazineData;
  if (shopVal) {
    source = source.filter(
      (r) => (r.shops || "").trim().toLowerCase() === shopVal.toLowerCase()
    );
  }

  const bills = new Set<string>();
  const items = new Set<string>();
  const catalogs = new Set<string>();

  source.forEach((r) => {
    if (r.rahunok?.trim()) bills.add(r.rahunok.trim());
    if (r.name?.trim()) items.add(r.name.trim());
    if (r.part_number?.trim()) catalogs.add(r.part_number.trim());
  });

  smartDropdowns.forEach((dropdown) => {
    if (dropdown.config.inputId === "Bukhhalter-magazine-bill") {
      dropdown.updateItems(Array.from(bills));
    } else if (dropdown.config.inputId === "Bukhhalter-magazine-item") {
      dropdown.updateItems(Array.from(items));
    } else if (dropdown.config.inputId === "Bukhhalter-magazine-catalog") {
      dropdown.updateItems(Array.from(catalogs));
    }
  });
}

// ==== Фільтрація без повторного завантаження з БД ====
function autoFilterFromInputs(): void {
  const dateOpen =
    getEl<HTMLInputElement>("Bukhhalter-magazine-date-open")?.value || "";
  const dateClose =
    getEl<HTMLInputElement>("Bukhhalter-magazine-date-close")?.value || "";
  const shopEl = getEl<HTMLInputElement | HTMLSelectElement>(
    "Bukhhalter-magazine-shop"
  );
  const shop = (shopEl?.value || "").trim();
  const bill = getElValue<HTMLInputElement>("Bukhhalter-magazine-bill");
  const item = getElValue<HTMLInputElement>("Bukhhalter-magazine-item");
  const cat = getElValue<HTMLInputElement>("Bukhhalter-magazine-catalog");

  let filtered = [...allMagazineData];

  if (dateOpen) {
    filtered = filtered.filter((r) => r.date_open && r.date_open >= dateOpen);
  }
  if (dateClose) {
    filtered = filtered.filter((r) => r.date_open && r.date_open <= dateClose);
  }
  if (shop) {
    filtered = filtered.filter(
      (r) => (r.shops || "").trim().toLowerCase() === shop.toLowerCase()
    );
  }
  if (bill) {
    filtered = filtered.filter((r) =>
      (r.rahunok || "").toLowerCase().includes(bill.toLowerCase())
    );
  }
  if (item) {
    filtered = filtered.filter((r) =>
      (r.name || "").toLowerCase().includes(item.toLowerCase())
    );
  }
  if (cat) {
    filtered = filtered.filter((r) =>
      (r.part_number || "").toLowerCase().includes(cat.toLowerCase())
    );
  }

  magazineData = filtered;
  applyLocalFilters();
  updateMagazineTable();
  updateTotalSum();
}

function getElValue<T extends HTMLInputElement | HTMLSelectElement>(
  id: string
): string {
  const el = document.getElementById(id) as T | null;
  return (el && "value" in el ? (el.value || "").trim() : "").trim();
}

function getShopValue(): string {
  return getElValue<HTMLInputElement | HTMLSelectElement>(
    "Bukhhalter-magazine-shop"
  );
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function detectPK(row: any): { name: string; value: any } | null {
  const candidates = ["id", "sclad_id", "uid", "pk", "_id", "ID"];
  for (const k of candidates) {
    if (row && row[k] !== undefined && row[k] !== null) {
      return { name: k, value: row[k] };
    }
  }
  const js = typeof row?.data === "string" ? safeParse(row.data) : row?.data;
  if (js && typeof js === "object") {
    for (const k of candidates) {
      if (js[k] !== undefined && js[k] !== null) {
        return { name: k, value: js[k] };
      }
    }
  }
  return null;
}

// ✅ НОВИЙ
function mapRowToMagazineRecord(row: any): MagazineRecord {
  const pk = detectPK(row);
  // беремо тільки з sclad.akt (число або null)
  const aktVal =
    typeof row?.akt === "number"
      ? row.akt
      : row?.akt != null
      ? Number(row.akt) || null
      : null;

  return {
    pkName: pk?.name,
    pkValue: pk?.value,
    rosraxovano: row?.rosraxovano ?? null,
    shops: row?.shops ?? "",
    rahunok: row?.rahunok ?? "",
    akt: aktVal,
    name: row?.name ?? "",
    part_number: row?.part_number ?? "",
    kilkist_on: Number(row?.kilkist_on ?? 0) || 0,
    price: Number(row?.price ?? 0) || 0,
    kilkist_off: Number(row?.kilkist_off ?? 0) || 0,
    date_open: row?.time_on ?? "",
    date_close: row?.date_close ?? "",
    isPaid: !!row?.rosraxovano,
    povernennya: row?.povernennya ?? null,
    isReturned: !!row?.povernennya,
    xto_povernyv: row?.xto_povernyv ?? null,
  };
}


// ==== Автопошук з БД ====
async function autoSearchFromInputs(): Promise<void> {
  const dateOpen =
    getEl<HTMLInputElement>("Bukhhalter-magazine-date-open")?.value || "";
  const dateClose =
    getEl<HTMLInputElement>("Bukhhalter-magazine-date-close")?.value || "";
  const shopEl = getEl<HTMLInputElement | HTMLSelectElement>(
    "Bukhhalter-magazine-shop"
  );
  const shop = (shopEl?.value || "").trim();
  const bill = getElValue<HTMLInputElement>("Bukhhalter-magazine-bill");
  const item = getElValue<HTMLInputElement>("Bukhhalter-magazine-item");
  const cat = getElValue<HTMLInputElement>("Bukhhalter-magazine-catalog");

  if (!dateOpen && !dateClose && !shop && !bill && !item && !cat) {
    return;
  }

  const filters: any = {};

  if (dateOpen) filters.date_open = dateOpen;
  if (dateClose) filters.date_close = dateClose;
  if (shop) filters.shops = shop;

  if (bill) {
    const exactBillMatch =
      allMagazineData.length > 0 &&
      allMagazineData.some((r) => r.rahunok?.trim() === bill);
    if (exactBillMatch) {
      filters.rahunok_exact = bill;
    } else {
      filters.rahunok = bill;
    }
  }

  if (item) {
    const exactItemMatch =
      allMagazineData.length > 0 &&
      allMagazineData.some((r) => r.name?.trim() === item);
    if (exactItemMatch) {
      filters.name_exact = item;
    } else {
      filters.name = item;
    }
  }

  if (cat) {
    const exactCatMatch =
      allMagazineData.length > 0 &&
      allMagazineData.some((r) => r.part_number?.trim() === cat);
    if (exactCatMatch) {
      filters.part_number_exact = cat;
    } else {
      filters.part_number = cat;
    }
  }

  const [loadedData] = await Promise.all([
    loadScladData(filters),
    loadAvailableShops(),
  ]);

  allMagazineData = loadedData;
  hasLoadedData = true;

  populateShopsSelectOptions();
  ensureSmartDropdowns();
  refreshDropdownOptions();

  applyLocalFilters();
  updateMagazineTable();
  updateTotalSum();
}

async function loadScladData(
  filters: {
    date_open?: string;
    date_close?: string;
    shops?: string;
    rahunok?: string;
    rahunok_exact?: string;
    name?: string;
    name_exact?: string;
    part_number?: string;
    part_number_exact?: string;
  } = {}
): Promise<MagazineRecord[]> {
  try {
    if (!shopsData.length) {
      shopsData = await fetchShopData();
    }

    let q = supabase.from(SCLAD_TABLE).select("*");

    if (filters.date_open && filters.date_close) {
      q = q
        .gte("time_on", filters.date_open)
        .lte("time_on", filters.date_close);
    } else if (filters.date_open) {
      q = q.gte("time_on", filters.date_open);
    } else if (filters.date_close) {
      q = q.lte("time_on", filters.date_close);
    }

    if (filters.shops) q = q.eq("shops", filters.shops);

    if (filters.rahunok_exact) {
      q = q.eq("rahunok", filters.rahunok_exact);
    } else if (filters.rahunok) {
      q = q.ilike("rahunok", `%${filters.rahunok}%`);
    }

    if (filters.name_exact) {
      q = q.eq("name", filters.name_exact);
    } else if (filters.name) {
      q = q.ilike("name", `%${filters.name}%`);
    }

    if (filters.part_number_exact) {
      q = q.eq("part_number", filters.part_number_exact);
    } else if (filters.part_number) {
      q = q.ilike("part_number", `%${filters.part_number}%`);
    }

    const { data, error } = await q;
    if (error) throw error;

    const mapped = (data || []).map(mapRowToMagazineRecord);
    mapped.sort((a, b) => {
      const da = a.date_open ? +new Date(a.date_open) : 0;
      const db = b.date_open ? +new Date(b.date_open) : 0;
      return db - da;
    });

    return mapped;
  } catch (err) {
    console.error("Помилка завантаження sclad з Supabase:", err);
    showNotification(
      `Помилка завантаження даних з бази sclad: ${
        err instanceof Error ? err.message : "Невідома помилка"
      }`,
      "error",
      5000
    );
    return [];
  }
}

// ==== Публічні API ====
export async function initializeMagazineData(): Promise<void> {
  magazineData = [];
  allMagazineData = [];
  availableShops = [];
  shopsData = [];
  hasLoadedData = false;
  shopsLoaded = false;
  updateMagazineTable();
  updateTotalSum();
  initMagazineAutoBehaviors();
}

export async function searchMagazineData(): Promise<void> {
  const dateOpen = getElValue<HTMLInputElement>(
    "Bukhhalter-magazine-date-open"
  );
  const dateClose = getElValue<HTMLInputElement>(
    "Bukhhalter-magazine-date-close"
  );
  const shop = getShopValue();
  const bill = getElValue<HTMLInputElement>("Bukhhalter-magazine-bill");
  const itemName = getElValue<HTMLInputElement>("Bukhhalter-magazine-item");
  const catalog = getElValue<HTMLInputElement>("Bukhhalter-magazine-catalog");

  const filters: any = {};
  if (dateOpen) filters.date_open = dateOpen;
  if (dateClose) filters.date_close = dateClose;
  if (shop) filters.shops = shop;

  if (bill) {
    const exactBillMatch =
      allMagazineData.length > 0 &&
      allMagazineData.some((r) => r.rahunok?.trim() === bill);
    if (exactBillMatch) {
      filters.rahunok_exact = bill;
    } else {
      filters.rahunok = bill;
    }
  }

  if (itemName) {
    const exactItemMatch =
      allMagazineData.length > 0 &&
      allMagazineData.some((r) => r.name?.trim() === itemName);
    if (exactItemMatch) {
      filters.name_exact = itemName;
    } else {
      filters.name = itemName;
    }
  }

  if (catalog) {
    const exactCatMatch =
      allMagazineData.length > 0 &&
      allMagazineData.some((r) => r.part_number?.trim() === catalog);
    if (exactCatMatch) {
      filters.part_number_exact = catalog;
    } else {
      filters.part_number = catalog;
    }
  }

  const [loadedData] = await Promise.all([
    loadScladData(filters),
    loadAvailableShops(),
  ]);

  allMagazineData = loadedData;
  hasLoadedData = true;

  populateShopsSelectOptions();
  ensureSmartDropdowns();
  refreshDropdownOptions();

  applyLocalFilters();
  updateMagazineTable();
  updateTotalSum();

  if (magazineData.length === 0) {
    showNotification("За вказаними критеріями дані не знайдено", "info", 3500);
  } else {
    showNotification(
      `Знайдено ${magazineData.length} позицій`,
      "success",
      2000
    );
  }
}

// ==== Функція застосування локальних фільтрів ====
function applyLocalFilters(): void {
  let filtered = [...allMagazineData];

  // Фільтр по статусу розрахунку
  // 0: розраховано, 1: не розраховано, 2: всі
  if (currentFilters.paymentStatus !== 2) {
    filtered = filtered.filter((item) => {
      if (currentFilters.paymentStatus === 0) {
        return item.isPaid; // Розраховані
      } else {
        return !item.isPaid; // Не розраховані
      }
    });
  }

  // Фільтр по наявності на складі
  // 0: >0 (присутні), 1: =0 (нульові), 2: <0 (Відємні), 3: повернення, 4: всі
  if (currentFilters.availabilityStatus !== 4) {
    filtered = filtered.filter((item) => {
      const remainder = (item.kilkist_on || 0) - (item.kilkist_off || 0);
      switch (currentFilters.availabilityStatus) {
        case 0:
          return remainder > 0; // Присутні
        case 1:
          return remainder === 0; // Нульові
        case 2:
          return remainder < 0; // Відємні
        case 3:
          return !!item.povernennya; // Повернення
        default:
          return true; // Всі
      }
    });
  }

  magazineData = filtered;
}

export function getMagazineData(): MagazineRecord[] {
  return magazineData;
}

export function calculateMagazineTotalSum(): number {
  return magazineData.reduce(
    (sum, item) => sum + item.kilkist_on * item.price,
    0
  );
}

export function getMagazineExportData(): any[] {
  return magazineData.map((item) => {
    const { dateISO, timeHM } = splitDateTimeSafe(item.povernennya || "");

    return {
      rosraxovano:
        item.isPaid && item.rosraxovano
          ? formatDate(item.rosraxovano)
          : item.isPaid
          ? "Розраховано"
          : "Не розраховано",
      date_open: formatDate(item.date_open || ""),
      shops: item.shops,
      rahunok: item.rahunok,
      akt: item.akt || "-",
      name: item.name,
      part_number: item.part_number,
      kilkist_on: item.kilkist_on,
      price: item.price,
      total: item.kilkist_on * item.price,
      remainder: item.kilkist_on - item.kilkist_off,
      povernennya: item.povernennya
        ? `${formatDate(dateISO)} ${timeHM}`
        : "Не повернено",
    };
  });
}

export function updateMagazineTable(): void {
  const tbody = byId<HTMLTableSectionElement>("magazine-tbody");
  if (!tbody) return;

  if (magazineData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="13" class="Bukhhalter-no-data">Немає даних для відображення</td></tr>';
    return;
  }

  tbody.innerHTML = magazineData
    .map((item, index) => {
      const total = item.kilkist_on * item.price;
      const remainder = item.kilkist_on - item.kilkist_off;

      let rowClass = item.isPaid ? "paid-row" : "unpaid-row";
      if (remainder > 0) {
        rowClass += " available-row stock-available-row";
      } else if (remainder === 0) {
        rowClass += " zero-stock-row";
      } else {
        rowClass += " unavailable-row stock-unavailable-row";
      }
      if (item.isReturned) {
        rowClass += " returned-row";
      }

      const paymentIcon = item.isPaid ? "💰" : "💲";
      const paymentText =
        item.isPaid && item.rosraxovano
          ? formatDate(item.rosraxovano)
          : item.isPaid
          ? "Розраховано"
          : "Не розраховано";

      let stockClass = "";
      if (remainder > 0) {
        stockClass = "available-stock";
      } else if (remainder === 0) {
        stockClass = "zero-stock";
      } else {
        stockClass = "unavailable-stock";
      }

      const returnTitle = item.isReturned
        ? "Скасувати повернення"
        : "Повернути постачальнику";
      const returnBtn = `<button class="Bukhhalter-return-btn" onclick="event.stopPropagation(); toggleReturn(${index})" title="${returnTitle}">↩️</button>`;

      let returnDateHtml = "";
      if (item.isReturned && item.povernennya != null) {
        const { dateISO, timeHM } = splitDateTimeSafe(item.povernennya);
        const userName = item.xto_povernyv || "Невідомий"; // Підтягуємо прізвище
        returnDateHtml = `
    <div class="return-date">
      <div>${formatDate(dateISO)}</div>
      <div>${timeHM || "—"}</div>
      <div class="return-user">${userName}</div>  <!-- Додаємо рядок з прізвищем -->
    </div>
  `;
      }

      const paymentDisabled = item.isReturned ? 'disabled="disabled"' : "";
      const paymentOnclick = item.isReturned
        ? ""
        : `onclick="event.stopPropagation(); toggleMagazinePayment(${index})"`;

      const actBtn = item.akt
        ? `<button class="Bukhhalter-act-btn" onclick="event.stopPropagation(); openActModal(${item.akt})" title="Відкрити акт №${item.akt}">📋 ${item.akt}</button>`
        : "<span>Склад</span>";

      return `
        <tr onclick="handleRowClick(${index})" class="${rowClass}">
          <td>
            <button class="Bukhhalter-payment-btn ${
              item.isPaid ? "paid" : "unpaid"
            }" ${paymentDisabled} ${paymentOnclick}
              title="${item.isPaid ? "Розраховано" : "Не розраховано"}">
              ${paymentIcon} ${paymentText}
            </button>
          </td>
          <td>${formatDate(item.date_open || "")}</td>
          <td>${item.shops || "-"}</td>
          <td>${item.rahunok || "-"}</td>
          <td>${actBtn}</td>
          <td>${item.name || "-"}</td>
          <td>${item.part_number || "-"}</td>
          <td>${item.kilkist_on || 0}</td>
          <td>${item.price ? formatNumber(item.price) : "-"}</td>
          <td>${total ? formatNumber(total) : "-"}</td>
          <td class="${stockClass}">${remainder}</td>
          <td class="return-cell">
            <div class="return-button-wrapper">
              ${returnBtn}
              ${returnDateHtml}
            </div>
          </td>
          <td><button class="Bukhhalter-delete-btn" onclick="event.stopPropagation(); deleteMagazineRecord(${index})">🗑️</button></td>
        </tr>
      `;
    })
    .join("");
}

export async function toggleMagazinePayment(index: number): Promise<void> {
  const item = magazineData[index];
  if (!item) return;

  if (item.isReturned) {
    showNotification(
      "⚠️ Неможливо змінити статус оплати для поверненого товару",
      "warning"
    );
    return;
  }

  if (!hasFullAccess()) {
    showNotification("⚠️ У вас немає прав для зміни статусу оплати", "warning");
    return;
  }

  const action: "pay" | "unpay" = item.isPaid ? "unpay" : "pay";
  const confirmed = await createPasswordConfirmationModal(action);
  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  const prevIsPaid = item.isPaid;
  const prevDate = item.rosraxovano;

  item.isPaid = !prevIsPaid;
  item.rosraxovano = item.isPaid ? todayISO() : null;

  try {
    await updatePaymentInDatabase(item);
    updateMagazineTable();
    updateTotalSum();

    if (item.isPaid) {
      showNotification(
        `💰 Розрахунок встановлено на ${formatDate(item.rosraxovano || "")}`,
        "success"
      );
    } else {
      showNotification("💲 Розрахунок скасовано", "success");
    }
  } catch (e) {
    item.isPaid = prevIsPaid;
    item.rosraxovano = prevDate;
    console.error(e);
    showNotification("❌ Помилка оновлення статусу оплати", "error", 4000);
    updateMagazineTable();
    updateTotalSum();
  }
}

export async function toggleReturn(index: number): Promise<void> {
  const item = magazineData[index];
  if (!item) return;

  const action: "return" | "unreturn" = item.isReturned ? "unreturn" : "return";

  // Перевірка тільки для скасування повернення (unreturn) – для масового розрахунку
  if (action === "unreturn" && item.povernennya) {
    const { dateISO } = splitDateTimeSafe(item.povernennya);
    const todayISO = new Date().toISOString().split("T")[0]; // YYYY-MM-DD для сьогодні
    if (dateISO !== todayISO && !hasFullAccess()) {
      // Блокуємо не-адмінів, якщо дата не сьогодні
      showNotification(
        "❌ Скасувати повернення неможливо: доступно тільки для сьогоднішніх повернень",
        "error",
        4000
      );
      return;
    }
    // Адмін може скасовувати будь-коли – попередження для логів
    if (dateISO !== todayISO && hasFullAccess()) {
      showNotification(
        "⚠️ Скасування повернення не сьогоднішнього терміну (як адміністратор)",
        "warning",
        2000
      );
    }
  }

  const confirmed = await createPasswordConfirmationModal(action);
  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  const prevIsReturned = item.isReturned;
  const prevDate = item.povernennya;
  const prevKilkistOff = item.kilkist_off;

  // Оновлюємо статус повернення
  item.isReturned = !prevIsReturned;
  item.povernennya = item.isReturned ? todayDateTime() : null;
  const userData = getSavedUserDataFromLocalStorage();
  const userName = userData?.name || "Невідомий";
  
  if (item.isReturned) {
    // Повернення: kilkist_off += kilkist_on
    item.kilkist_off = item.kilkist_off + item.kilkist_on;
    item.xto_povernyv = userName;
    console.log("Локально встановлено xto_povernyv:", userName);
    console.log(`Повернення: kilkist_off = ${prevKilkistOff} + ${item.kilkist_on} = ${item.kilkist_off}`);
  } else {
    // Скасування повернення: kilkist_off -= kilkist_on
    item.kilkist_off = item.kilkist_off - item.kilkist_on;
    item.xto_povernyv = null;
    console.log("Локально очищено xto_povernyv");
    console.log(`Скасування повернення: kilkist_off = ${prevKilkistOff} - ${item.kilkist_on} = ${item.kilkist_off}`);
  }

  try {
    await updateReturnInDatabase(item);
    updateMagazineTable();
    updateTotalSum();

    if (item.isReturned && item.povernennya != null) {
      const { dateISO, timeHM } = splitDateTimeSafe(item.povernennya);
      showNotification(
        `🔄 Повернення встановлено на ${formatDate(dateISO)} ${timeHM || ""}`,
        "success"
      );
    } else {
      showNotification("🔄 Повернення скасовано", "success");
    }
  } catch (e) {
    // Відкат змін у разі помилки
    item.isReturned = prevIsReturned;
    item.povernennya = prevDate;
    item.kilkist_off = prevKilkistOff;
    console.error(e);
    showNotification("❌ Помилка оновлення статусу повернення", "error", 4000);
    updateMagazineTable();
    updateTotalSum();
  }
}

// ==== Ініціалізація автоповедінки з правильними обробниками ====
function initMagazineAutoBehaviors(): void {
  ensureSmartDropdowns();

  const shopEl = getEl<HTMLInputElement | HTMLSelectElement>(
    "Bukhhalter-magazine-shop"
  );
  if (shopEl && shopEl.tagName.toLowerCase() === "select") {
    const loadShopsHandler = async () => {
      await loadAvailableShops();
    };

    shopEl.addEventListener("focus", loadShopsHandler);
    shopEl.addEventListener("click", loadShopsHandler);

    const changeHandler = () => {
      refreshDropdownOptions();
      triggerAutoFilter();
    };
    shopEl.addEventListener("change", changeHandler);
    shopEl.addEventListener("input", changeHandler);
  }

  const onDateChange = () => {
    triggerAutoFilter();
  };

  const d1 = getEl<HTMLInputElement>("Bukhhalter-magazine-date-open");
  const d2 = getEl<HTMLInputElement>("Bukhhalter-magazine-date-close");
  d1?.addEventListener("change", onDateChange);
  d2?.addEventListener("change", onDateChange);

  // ==== Перемикач оплати ====
  const paymentToggle = getEl<HTMLInputElement>(
    "magazine-payment-filter-toggle"
  );
  if (paymentToggle) {
    // Встановлюємо початкові значення
    paymentToggle.min = "0";
    paymentToggle.max = "2";
    if (!paymentToggle.value) {
      paymentToggle.value = "2";
      currentFilters.paymentStatus = 2;
    } else {
      currentFilters.paymentStatus = parseInt(paymentToggle.value, 10) as
        | 0
        | 1
        | 2;
    }

    // Додаємо обробник події
    paymentToggle.addEventListener("input", function () {
      const newValue = parseInt(this.value, 10) as 0 | 1 | 2;
      console.log("Payment filter changed to:", newValue); // Для дебагу
      currentFilters.paymentStatus = newValue;
      applyLocalFilters();
      updateMagazineTable();
      updateTotalSum();
    });
  }

  // ==== Перемикач наявності ====
  const availabilityToggle = getEl<HTMLInputElement>(
    "magazine-availability-filter-toggle"
  );
  if (availabilityToggle) {
    // Встановлюємо початкові значення
    availabilityToggle.min = "0";
    availabilityToggle.max = "4";
    if (!availabilityToggle.value) {
      availabilityToggle.value = "4";
      currentFilters.availabilityStatus = 4;
    } else {
      currentFilters.availabilityStatus = parseInt(
        availabilityToggle.value,
        10
      ) as 0 | 1 | 2 | 3 | 4;
    }

    // Додаємо обробник події
    availabilityToggle.addEventListener("input", function () {
      const newValue = parseInt(this.value, 10) as 0 | 1 | 2 | 3 | 4;
      console.log("Availability filter changed to:", newValue); // Для дебагу
      currentFilters.availabilityStatus = newValue;
      applyLocalFilters();
      updateMagazineTable();
      updateTotalSum();
    });
  }
}

async function updatePaymentInDatabase(item: MagazineRecord): Promise<void> {
  if (!item.pkName || item.pkValue === undefined || item.pkValue === null) {
    showNotification("Не знайдено первинний ключ запису (pk)", "error");
    throw new Error("PK запису не визначено");
  }

  const { error } = await supabase
    .from(SCLAD_TABLE)
    .update({ rosraxovano: item.rosraxovano })
    .eq(item.pkName, item.pkValue);

  if (error) {
    console.error("Помилка оновлення статусу оплати:", error);
    throw error;
  }
}

async function updateReturnInDatabase(item: MagazineRecord): Promise<void> {
  if (!item.pkName || item.pkValue === undefined || item.pkValue === null) {
    showNotification("Не знайдено первинний ключ запису (pk)", "error");
    throw new Error("PK запису не визначено");
  }

  const updateData: any = { 
    povernennya: item.povernennya,
    kilkist_off: item.kilkist_off
  };
  
  if (item.isReturned) {
    updateData.xto_povernyv = item.xto_povernyv;
  } else {
    updateData.xto_povernyv = null;
  }

  const { error } = await supabase
    .from(SCLAD_TABLE)
    .update(updateData)
    .eq(item.pkName, item.pkValue);

  if (error) {
    console.error("Помилка оновлення статусу повернення:", error);
    throw error;
  }
}

export function deleteMagazineRecord(index: number): void {
  if (index < 0 || index >= magazineData.length) return;

  const removed = magazineData.splice(index, 1)[0];

  if (removed?.pkName && removed?.pkValue != null) {
    const i = allMagazineData.findIndex(
      (r) => r.pkName === removed.pkName && r.pkValue === removed.pkValue
    );
    if (i > -1) allMagazineData.splice(i, 1);
  }

  updateMagazineTable();
  updateTotalSum();
  showNotification("Видалено з таблиці", "info", 1600);
}

export function clearMagazineForm(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    "#Bukhhalter-magazine-section input:not([readonly])"
  );
  inputs.forEach((i) => (i.value = ""));

  const selects = document.querySelectorAll<HTMLSelectElement>(
    "#Bukhhalter-magazine-section select"
  );
  selects.forEach((s) => (s.value = ""));

  // Скидаємо фільтри до значень за замовчуванням
  currentFilters = {
    dateOpen: "",
    dateClose: "",
    shop: "",
    paymentStatus: 2, // Всі
    availabilityStatus: 4, // Всі
  };

  // Скидаємо перемикачі до початкових значень
  const paymentToggle = byId<HTMLInputElement>(
    "magazine-payment-filter-toggle"
  );
  const availabilityToggle = byId<HTMLInputElement>(
    "magazine-availability-filter-toggle"
  );
  if (paymentToggle) paymentToggle.value = "2";
  if (availabilityToggle) availabilityToggle.value = "4";

  // Очищуємо всі дані
  magazineData = [];
  allMagazineData = [];
  availableShops = [];
  shopsData = [];
  hasLoadedData = false;
  shopsLoaded = false;

  updateMagazineTable();
  updateTotalSum();
  showNotification("Фільтри магазину очищено", "info", 1500);
}

// ==== Функції створення перемикачів ====
export function createMagazinePaymentToggle(): void {
  const existing = byId("magazine-payment-filter-toggle");
  if (existing) {
    // Якщо вже існує, просто ініціалізуємо його
    initMagazineAutoBehaviors();
    return;
  }

  const section = byId("Bukhhalter-magazine-section");
  const btnContainer = section?.querySelector(".Bukhhalter-button-container");

  const wrap = document.createElement("div");
  wrap.className = "Bukhhalter-toggle-container";
  wrap.innerHTML = `
    <label class="Bukhhalter-field-label">💰 Розрахунок</label>
    <div class="Bukhhalter-toggle-wrapper">
      <input type="range" min="0" max="2" value="2"
             class="Bukhhalter-payment-toggle"
             id="magazine-payment-filter-toggle">
      <div class="Bukhhalter-toggle-labels">
        <span>Розраховано</span>
        <span>Не розраховано</span>
        <span>Всі</span>
      </div>
    </div>
  `;
  section?.insertBefore(wrap, btnContainer || null);

  // Ініціалізуємо обробник після створення
  const toggle = byId<HTMLInputElement>("magazine-payment-filter-toggle");
  if (toggle) {
    currentFilters.paymentStatus = 2; // Всі
    toggle.addEventListener("input", function () {
      const newValue = parseInt(this.value, 10) as 0 | 1 | 2;
      currentFilters.paymentStatus = newValue;
      applyLocalFilters();
      updateMagazineTable();
      updateTotalSum();
    });
  }
}

export function createMagazineAvailabilityToggle(): void {
  const existing = byId("magazine-availability-filter-toggle");
  if (existing) {
    // Якщо вже існує, просто ініціалізуємо його
    initMagazineAutoBehaviors();
    return;
  }

  const section = byId("Bukhhalter-magazine-section");
  const btnContainer = section?.querySelector(".Bukhhalter-button-container");

  const wrap = document.createElement("div");
  wrap.className = "Bukhhalter-toggle-container";
  wrap.innerHTML = `
    <label class="Bukhhalter-field-label">📦 Наявність на складі</label>
    <div class="Bukhhalter-toggle-wrapper">
      <input type="range" min="0" max="4" value="4"
             class="Bukhhalter-availability-toggle"
             id="magazine-availability-filter-toggle">
      <div class="Bukhhalter-toggle-labels-5">
        <span>Присутні</span>
        <span>Нульові</span>
        <span>Відємні</span>
        <span>Повернення</span>
        <span>Всі</span>
      </div>
    </div>
  `;
  section?.insertBefore(wrap, btnContainer || null);

  // Ініціалізуємо обробник після створення
  const toggle = byId<HTMLInputElement>("magazine-availability-filter-toggle");
  if (toggle) {
    currentFilters.availabilityStatus = 4; // Всі
    toggle.addEventListener("input", function () {
      const newValue = parseInt(this.value, 10) as 0 | 1 | 2 | 3 | 4;
      currentFilters.availabilityStatus = newValue;
      applyLocalFilters();
      updateMagazineTable();
      updateTotalSum();
    });
  }
}

export function getShopsList(): string[] {
  if (availableShops.length > 0) {
    return [...availableShops];
  }

  const shops = new Set<string>();
  allMagazineData.forEach((i) => {
    if (i.shops) shops.add(i.shops);
  });
  return Array.from(shops).sort();
}

export function createShopsSelect(): void {
  const current = document.getElementById("Bukhhalter-magazine-shop");
  if (!current) return;
  if (current.tagName.toLowerCase() === "select") return;

  const select = document.createElement("select");
  select.id = "Bukhhalter-magazine-shop";
  select.className = "Bukhhalter-field-input";
  select.innerHTML =
    '<option value="">Оберіть магазин (або залиште порожнім для всіх)</option>';

  current.parentNode?.replaceChild(select, current);

  const loadHandler = async () => {
    await loadAvailableShops();
  };

  select.addEventListener("focus", loadHandler);
  select.addEventListener("click", loadHandler);

  select.addEventListener("change", () => {
    refreshDropdownOptions();
    triggerAutoFilter();
  });
}

function populateShopsSelectOptions(): void {
  const el = document.getElementById(
    "Bukhhalter-magazine-shop"
  ) as HTMLSelectElement | null;
  if (!el) return;

  if (el.tagName.toLowerCase() !== "select") {
    createShopsSelect();
  }
  const select = document.getElementById(
    "Bukhhalter-magazine-shop"
  ) as HTMLSelectElement | null;
  if (!select) return;

  const currentValue = select.value;
  const shops = getShopsList();

  select.innerHTML =
    '<option value="">Оберіть магазин (або залиште порожнім для всіх)</option>' +
    shops.map((s) => `<option value="${s}">${s}</option>`).join("");

  if (currentValue && shops.includes(currentValue)) {
    select.value = currentValue;
  }
}

export async function runMassPaymentCalculationForMagazine(): Promise<void> {
  if (!hasFullAccess()) {
    showNotification(
      "⚠️ У вас немає прав для виконання масового розрахунку",
      "warning"
    );
    return;
  }

  const confirmed = await createPasswordConfirmationModal("pay");
  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  const rows = getMagazineData();
  if (!rows || rows.length === 0) {
    showNotification(
      "ℹ️ Немає записів для обробки в поточному фільтрі",
      "info"
    );
    return;
  }

  let toUpdate = rows.filter((r) => !r.isPaid && !r.isReturned);
  if (toUpdate.length === 0) {
    showNotification(
      "ℹ️ Усі записи у фільтрі вже розраховані або повернені",
      "info"
    );
    return;
  }

  const payDate = todayISO();
  toUpdate.forEach((r) => {
    r.isPaid = true;
    r.rosraxovano = payDate;
  });

  const results = await Promise.allSettled(
    toUpdate.map((item) => updatePaymentInDatabase(item))
  );

  let ok = 0,
    fail = 0;
  results.forEach((res, i) => {
    if (res.status === "fulfilled") ok++;
    else {
      fail++;
      const it = toUpdate[i];
      it.isPaid = false;
      it.rosraxovano = null;
      console.error("Помилка оновлення оплати магазину:", res.reason);
    }
  });

  updateMagazineTable();
  updateTotalSum();

  if (ok && !fail) {
    showNotification(
      `✅ Масовий розрахунок виконано (${ok} позицій)`,
      "success"
    );
  } else if (ok && fail) {
    showNotification(
      `⚠️ Частково виконано: успішно ${ok}, помилок ${fail}`,
      "warning",
      5000
    );
  } else {
    showNotification("❌ Не вдалося виконати масовий розрахунок", "error");
  }
}

// Глобалізація функцій
(window as any).toggleMagazinePayment = toggleMagazinePayment;
(window as any).toggleReturn = toggleReturn;
(window as any).deleteMagazineRecord = deleteMagazineRecord;
(window as any).openActModal = openActModal;

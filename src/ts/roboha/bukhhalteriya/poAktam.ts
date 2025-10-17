// src/ts/roboha/bukhhalteriya/poAktam.ts
import { supabase } from "../../vxid/supabaseClient";
import {
  byId,
  formatNumber,
  formatDate,
  updateTotalSum,
} from "./bukhhalteriya";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../tablucya/users";



const FULL_ACCESS_ALIASES = ["адміністратор", "full", "admin", "administrator"];

// ДОДАНО: Тип для фільтра статусу актів
type StatusFilter = "closed" | "open" | "all";

// ДОДАНО: Змінна для поточного фільтра статусу
let currentStatusFilter: StatusFilter = "all";

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

function hasFullAccess(): boolean {
  return FULL_ACCESS_ALIASES.includes(getCurrentAccessLevel());
}

function getCurrentDate(): string {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

function createPasswordConfirmationModal(
  action: "pay" | "unpay"
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "password-confirmation-modal";
    modal.style.cssText = `
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.5); z-index: 10000; backdrop-filter: blur(3px);
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      background: #fff; width: 320px; border-radius: 12px; padding: 24px; text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15); border: 1px solid #e0e0e0;
    `;

    const h = document.createElement("h3");
    h.textContent =
      action === "pay"
        ? "🔐 Підтвердження розрахунку"
        : "🔐 Підтвердження скасування";
    h.style.cssText = "margin: 0 0 16px 0; color: #333; font-size: 18px;";

    const inp = document.createElement("input");
    inp.type = "password";
    inp.placeholder = "Введіть пароль...";
    inp.style.cssText = `
      width: 100%; padding: 12px; margin: 12px 0; border: 2px solid #e0e0e0;
      border-radius: 8px; font-size: 14px; transition: border-color 0.2s;
      box-sizing: border-box;
    `;
    inp.onfocus = () => (inp.style.borderColor = "#007bff");
    inp.onblur = () => (inp.style.borderColor = "#e0e0e0");

    const err = document.createElement("div");
    err.style.cssText =
      "color: #f44336; display: none; margin: 8px 0; font-size: 14px;";

    const row = document.createElement("div");
    row.style.cssText =
      "display: flex; gap: 12px; justify-content: center; margin-top: 16px;";

    const ok = document.createElement("button");
    ok.textContent = "Підтвердити";
    ok.style.cssText = `
      flex: 1; padding: 12px 0; background: #007bff; color: #fff; border: none;
      border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;
      transition: background-color 0.2s;
    `;
    ok.onmouseover = () => (ok.style.backgroundColor = "#0056b3");
    ok.onmouseout = () => (ok.style.backgroundColor = "#007bff");

    const cancel = document.createElement("button");
    cancel.textContent = "Скасувати";
    cancel.style.cssText = `
      flex: 1; padding: 12px 0; background: #6c757d; color: #fff; border: none;
      border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;
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

// Інтерфейс для деталей у JSON
interface Detail {
  sclad_id: number;
  Ціна: number;
  Каталог: number;
  Кількість: number;
  Найменування: string;
  Розраховано?: string;
}

// Інтерфейс для запису історії у JSON
interface HistoryRecord {
  Акт: number;
  Деталі: Detail[];
  Клієнт: string;
  Автомобіль: string;
  ДатаЗакриття: string | null;
}

// Інтерфейс для JSON із бази даних
interface ShopData {
  Name: string;
  Склад: Record<string, any>;
  Історія: Record<string, HistoryRecord[]>;
  "Про магазин": string;
}

// Інтерфейс для записів деталей по актам
export interface DetailsRecord {
  dateOpen: string;
  dateClose: string | null;
  act: string;
  automobile: string;
  shop: string;
  item: string;
  catalog: string;
  quantity: number;
  price: number;
  total: number;
  isPaid: boolean;
  paymentDate?: string;
  isClosed: boolean; // ДОДАНО: для визначення статусу акту
}

// Змінні для зберігання даних деталей
let detailsData: DetailsRecord[] = [];
let shopsData: ShopData[] = [];

// НОВІ ЗМІННІ ДЛЯ АВТОФІЛЬТРАЦІЇ
let allDetailsData: DetailsRecord[] = [];
let hasDetailsDataLoaded = false;
let autoDetailsSearchTimer: number | null = null;
const AUTO_DETAILS_SEARCH_DELAY = 350;

function debounceDetailsAutoSearch(fn: () => void) {
  if (autoDetailsSearchTimer !== null) {
    clearTimeout(autoDetailsSearchTimer);
  }
  autoDetailsSearchTimer = window.setTimeout(() => {
    autoDetailsSearchTimer = null;
    fn();
  }, AUTO_DETAILS_SEARCH_DELAY);
}

// ВИПАДАЮЧІ СПИСКИ
interface DetailsDropdownConfig {
  inputId: string;
  listId: string;
  placeholder: string;
  maxItems: number;
}

const detailsDropdownConfigs: DetailsDropdownConfig[] = [
  {
    inputId: "Bukhhalter-details-item",
    listId: "dl-details-item",
    placeholder: "Введіть або оберіть найменування...",
    maxItems: 150,
  },
  {
    inputId: "Bukhhalter-details-catalog",
    listId: "dl-details-catalog",
    placeholder: "Введіть або оберіть каталожний номер...",
    maxItems: 100,
  },
];

class DetailsSmartDropdown {
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement;
  public readonly config: DetailsDropdownConfig;
  private items: string[] = [];
  private filteredItems: string[] = [];
  private selectedIndex = -1;
  private isOpen = false;

  constructor(config: DetailsDropdownConfig) {
    this.config = config;
    const inputEl = document.getElementById(config.inputId) as HTMLInputElement;
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

      this.input.placeholder = this.config.placeholder;

      this.input.parentNode?.insertBefore(wrapper, this.input);
      wrapper.appendChild(this.input);
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
      this.filter(this.input.value);
      if (!this.isOpen) this.show();

      if (hasDetailsDataLoaded) {
        debounceDetailsAutoSearch(() => {
          autoFilterDetailsFromInputs();
        });
      } else {
        debounceDetailsAutoSearch(() => {
          void autoSearchDetailsFromInputs();
        });
      }
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

    this.adjustDropdownWidth();
  }

  private adjustDropdownWidth() {
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

    let maxWidth = this.input.offsetWidth;
    this.filteredItems.forEach((item) => {
      measurer.textContent = item;
      const itemWidth = measurer.offsetWidth;
      if (itemWidth > maxWidth) {
        maxWidth = itemWidth;
      }
    });

    document.body.removeChild(measurer);

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
    this.filter(this.input.value);
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
      this.input.value = this.filteredItems[index];
      this.hide();

      if (hasDetailsDataLoaded) {
        debounceDetailsAutoSearch(() => {
          autoFilterDetailsFromInputs();
        });
      } else {
        debounceDetailsAutoSearch(() => {
          void autoSearchDetailsFromInputs();
        });
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

let detailsSmartDropdowns: DetailsSmartDropdown[] = [];

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

function ensureDetailsSmartDropdowns(): void {
  addDropdownStyles();

  if (detailsSmartDropdowns.length === 0) {
    detailsSmartDropdowns = detailsDropdownConfigs
      .filter((config) => document.getElementById(config.inputId))
      .map((config) => {
        try {
          return new DetailsSmartDropdown(config);
        } catch (error) {
          console.warn(
            `Failed to create details dropdown for ${config.inputId}:`,
            error
          );
          return null;
        }
      })
      .filter(
        (dropdown): dropdown is DetailsSmartDropdown => dropdown !== null
      );
  }
}

function refreshDetailsDropdownOptions(): void {
  const items = new Set<string>();
  const catalogs = new Set<string>();

  allDetailsData.forEach((r) => {
    if (r.item?.trim()) items.add(r.item.trim());
    if (r.catalog?.trim()) catalogs.add(r.catalog.trim());
  });

  detailsSmartDropdowns.forEach((dropdown) => {
    if (dropdown.config.inputId === "Bukhhalter-details-item") {
      dropdown.updateItems(Array.from(items));
    } else if (dropdown.config.inputId === "Bukhhalter-details-catalog") {
      dropdown.updateItems(Array.from(catalogs));
    }
  });
}

function getDetailsInputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return (el?.value || "").trim();
}

// ДОДАНО: Функція для фільтрації даних деталей
export function getFilteredDetailsData(): DetailsRecord[] {
  let filteredData = detailsData;

  // Фільтр по статусу актів
  if (currentStatusFilter === "closed") {
    filteredData = filteredData.filter((item) => item.isClosed);
  } else if (currentStatusFilter === "open") {
    filteredData = filteredData.filter((item) => !item.isClosed);
  }

  return filteredData;
}

// ОНОВЛЕНО: Автофільтрація з урахуванням статусу актів
function autoFilterDetailsFromInputs(): void {
  const dateOpen = getDetailsInputValue("Bukhhalter-details-date-open");
  const dateClose = getDetailsInputValue("Bukhhalter-details-date-close");
  const item = getDetailsInputValue("Bukhhalter-details-item");
  const catalog = getDetailsInputValue("Bukhhalter-details-catalog");

  let filtered = [...allDetailsData];

  const currentDate = new Date().toISOString().split("T")[0];

  if (!dateOpen && !dateClose) {
    // Всі дати - нічого не робимо
  } else if (dateOpen && !dateClose) {
    filtered = filtered.filter(
      (r) => r.dateOpen >= dateOpen && r.dateOpen <= currentDate
    );
  } else if (!dateOpen && dateClose) {
    filtered = filtered.filter((r) => r.dateOpen <= dateClose);
  } else if (dateOpen && dateClose) {
    filtered = filtered.filter(
      (r) => r.dateOpen >= dateOpen && r.dateOpen <= dateClose
    );
  }

  if (item) {
    filtered = filtered.filter((r) =>
      (r.item || "").toLowerCase().includes(item.toLowerCase())
    );
  }

  if (catalog) {
    filtered = filtered.filter((r) =>
      (r.catalog || "").toLowerCase().includes(catalog.toLowerCase())
    );
  }

  detailsData = filtered;
  updateDetailsTable();
}

async function autoSearchDetailsFromInputs(): Promise<void> {
  const dateOpen = getDetailsInputValue("Bukhhalter-details-date-open");
  const dateClose = getDetailsInputValue("Bukhhalter-details-date-close");
  const item = getDetailsInputValue("Bukhhalter-details-item");
  const catalog = getDetailsInputValue("Bukhhalter-details-catalog");

  if (!dateOpen && !dateClose && !item && !catalog) {
    return;
  }

  await loadAllDetailsData();
  hasDetailsDataLoaded = true;
  ensureDetailsSmartDropdowns();
  refreshDetailsDropdownOptions();
  autoFilterDetailsFromInputs();
}

async function loadAllDetailsData(): Promise<void> {
  const shops = await fetchShopData();
  allDetailsData = [];

  for (const shop of shops) {
    const history = shop.Історія || {};
    for (const openDate of Object.keys(history)) {
      const dayRecords = history[openDate] || [];
      for (const rec of dayRecords) {
        const act = rec.Акт;
        const automobile = rec.Автомобіль || "";
        const closeDate = rec.ДатаЗакриття || null;

        for (const det of rec.Деталі || []) {
          const qty = Number(det.Кількість) || 0;
          const price = Number(det.Ціна) || 0;
          const total = qty * price;

          allDetailsData.push({
            dateOpen: openDate,
            dateClose: closeDate,
            act: String(act),
            automobile,
            shop: shop.Name,
            item: det.Найменування || "",
            catalog: (det.Каталог ?? "").toString(),
            quantity: qty,
            price: price,
            total: total,
            isPaid: Boolean((det as any).Розраховано),
            paymentDate: (det as any).Розраховано || undefined,
            isClosed: closeDate !== null, // ДОДАНО
          });
        }
      }
    }
  }

  allDetailsData.sort((a, b) => b.dateOpen.localeCompare(a.dateOpen));
}

// Функція для завантаження даних із бази даних shops
async function fetchShopData(): Promise<ShopData[]> {
  try {
    const { data, error } = await supabase.from("shops").select("*");

    if (error) {
      console.error("Помилка Supabase:", error);
      throw new Error(`Помилка завантаження: ${error.message}`);
    }

    if (data && Array.isArray(data)) {
      shopsData = data
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

      return shopsData;
    } else {
      throw new Error("Невірний формат даних з Supabase");
    }
  } catch (error) {
    console.error("Помилка завантаження даних магазинів:", error);
    showNotification("Помилка завантаження даних магазинів", "error", 5000);
    return [];
  }
}

// Функція для збереження оновлених даних в базі shops
async function saveShopsDataToDatabase(): Promise<void> {
  try {
    showNotification("💾 Збереження змін в базу...", "info", 2000);

    const { data: existingData, error: fetchError } = await supabase
      .from("shops")
      .select("*");

    if (fetchError) {
      console.error("Помилка отримання даних:", fetchError);
      throw new Error(`Помилка отримання даних: ${fetchError.message}`);
    }

    const primaryKeyCandidates = ["id", "shops_id", "uid", "pk"];
    const detectPrimaryKey = (row: any): string | null => {
      if (!row) return null;
      for (const k of primaryKeyCandidates) if (k in row) return k;
      return null;
    };
    const primaryKey = detectPrimaryKey(existingData?.[0]);

    for (const shop of shopsData) {
      try {
        const target = existingData?.find((item) => {
          let js = item.data;
          if (typeof js === "string") {
            try {
              js = JSON.parse(js);
            } catch {
              /* ignore */
            }
          }
          return js && js.Name === shop.Name;
        });

        if (!target) {
          console.warn(`Не знайдено запис для магазину: ${shop.Name}`);
          continue;
        }

        if (primaryKey) {
          const { error: updErr } = await supabase
            .from("shops")
            .update({ data: shop })
            .eq(primaryKey, target[primaryKey]);

          if (updErr) {
            console.error(`Помилка оновлення ${shop.Name}:`, updErr);
            throw updErr;
          }
        } else {
          const { error: updErr } = await supabase
            .from("shops")
            .update({ data: shop })
            .contains("data", { Name: shop.Name });

          if (updErr) {
            console.error(`Помилка оновлення (fallback) ${shop.Name}:`, updErr);
            throw updErr;
          }
        }
      } catch (recordError) {
        console.error(`Помилка обробки запису для ${shop.Name}:`, recordError);
        throw recordError;
      }
    }

    showNotification("✅ Дані успішно збережено в базу", "success");
  } catch (error) {
    console.error("❌ Помилка збереження в базу shops:", error);
    let errorMessage = "Невідома помилка";
    if (error instanceof Error) errorMessage = error.message;

    showNotification(
      `⚠️ Помилка збереження в базу даних: ${errorMessage}`,
      "error",
      5000
    );
    throw error;
  }
}

// Ініціалізація даних деталей
export function initializeDetailsData(): void {
  detailsData = [];
  allDetailsData = [];
  hasDetailsDataLoaded = false;
  updateDetailsTable();
  initDetailsAutoBehaviors();
  createDetailsStatusToggle(); // ДОДАНО
}

// Обчислення загальної суми деталей
export function calculateDetailsTotalSum(): number {
  const filteredData = getFilteredDetailsData();
  return filteredData.reduce((sum, item) => sum + (item.total || 0), 0);
}

// Додайте нову функцію для розрахунку закупівельної суми:
function calculateDetailsPurchaseTotal(): number {
  const filteredData = getFilteredDetailsData();
  return filteredData.reduce((sum, item) => {
    const purchaseTotal = (item.purchasePrice || 0) * (item.quantity || 0);
    return sum + purchaseTotal;
  }, 0);
}

// Додайте нову функцію для розрахунку наценки:
function calculateDetailsMarginTotal(): number {
  const filteredData = getFilteredDetailsData();
  return filteredData.reduce((sum, item) => sum + (item.margin || 0), 0);
}

// ОНОВЛЕНО: Оновлення таблиці з кольоровим кодуванням та фільтрацією
export function updateDetailsTable(): void {
  const tbody = byId<HTMLTableSectionElement>("details-tbody");
  const filteredData = getFilteredDetailsData();

  if (filteredData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="11" class="Bukhhalter-no-data">Немає даних для відображення</td></tr>';
    
    updateDetailsTotalSumDisplay(0, 0, 0);
    return;
  }

  tbody.innerHTML = filteredData
    .map((item, index) => {
      const originalIndex = detailsData.indexOf(item);
      // ДОДАНО: Кольорове кодування рядків
      const rowClass = item.isClosed ? "closed-row" : "open-row";

      // Форматування цін
      const purchasePriceHtml = item.purchasePrice !== undefined
        ? `<div style="font-size: 0.85em; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 2px;">${formatNumber(item.purchasePrice)}</div>`
        : '<div style="font-size: 0.85em; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 2px;">-</div>';
      
      const salePriceHtml = `<div style="font-size: 0.95em; font-weight: 500;">${formatNumber(item.price)}</div>`;
      
      const marginHtml = item.margin !== undefined
        ? `<div style="font-size: 0.85em; color: ${item.margin >= 0 ? '#28a745' : '#dc3545'}; font-weight: 500; margin-top: 2px;">+${formatNumber(item.margin)}</div>`
        : '';

      return `
        <tr class="${rowClass}" onclick="handleRowClick(${index})">
          <td>${formatDate(item.dateOpen)}</td>
          <td>${formatDate(item.dateClose || "")}</td>
          <td>
            <button class="Bukhhalter-act-btn"
                    onclick="event.stopPropagation(); openActModal(${Number(item.act) || 0})"
                    title="Відкрити акт №${item.act}">
              📋 ${item.act || "-"}
            </button>
          </td>
          <td>${item.automobile || "-"}</td>
          <td>${item.shop || "-"}</td>
          <td>${item.item || "-"}</td>
          <td>${item.catalog || "-"}</td>
          <td>${item.quantity || "-"}</td>
          <td style="padding: 8px;">
            ${purchasePriceHtml}
            ${salePriceHtml}
          </td>
          <td>${item.total ? formatNumber(item.total) : "-"}${marginHtml}</td>
          <td>
            <button class="Bukhhalter-delete-btn"
                    onclick="event.stopPropagation(); deleteRecord('details', ${originalIndex})">🗑️</button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Розраховуємо три суми з відфільтрованих даних
  const purchaseTotal = calculateDetailsPurchaseTotal();
  const saleTotal = calculateDetailsTotalSum();
  const marginTotal = calculateDetailsMarginTotal();
  
  updateDetailsTotalSumDisplay(purchaseTotal, saleTotal, marginTotal);
}

// Функція для оновлення відображення трьох сум:
function updateDetailsTotalSumDisplay(purchaseTotal: number, saleTotal: number, marginTotal: number): void {
  const totalSumElement = byId<HTMLElement>("total-sum");
  
  if (totalSumElement) {
    const marginSign = marginTotal >= 0 ? '+' : '';
    
    totalSumElement.innerHTML = `
      <div style="color: white; font-size: 1.1em; font-weight: 600; white-space: nowrap;">
        Сумма 💰 ${formatNumber(saleTotal)} грн - 💶 ${formatNumber(purchaseTotal)} грн = 📈 ${marginSign}${formatNumber(marginTotal)} грн
      </div>
    `;
  }
}

interface ScladItem {
  sclad_id: number;
  price: number;
  [key: string]: any;
}

// Оновлений інтерфейс DetailsRecord:
export interface DetailsRecord {
  dateOpen: string;
  dateClose: string | null;
  act: string;
  automobile: string;
  shop: string;
  item: string;
  catalog: string;
  quantity: number;
  price: number;
  purchasePrice?: number;
  total: number;
  margin?: number;
  isPaid: boolean;
  paymentDate?: string;
  sclad_id?: number;
  isClosed: boolean;
}

// Кеш даних складу:
let scladData: ScladItem[] = [];

// Завантаження даних зі складу:
async function fetchScladData(): Promise<ScladItem[]> {
  try {
    const { data, error } = await supabase.from("sclad").select("*");

    if (error) {
      console.error("Помилка завантаження складу:", error);
      return [];
    }

    if (data && Array.isArray(data)) {
      scladData = data.map((item) => {
        if (typeof item.data === "string") {
          try {
            const parsed = JSON.parse(item.data);
            return {
              sclad_id: item.sclad_id || parsed.sclad_id,
              price: parsed.price || 0,
              ...parsed,
            };
          } catch {
            return {
              sclad_id: item.sclad_id,
              price: item.price || 0,
              ...item,
            };
          }
        }
        return {
          sclad_id: item.sclad_id || item.data?.sclad_id,
          price: item.price || item.data?.price || 0,
          ...(typeof item.data === "object" ? item.data : item),
        };
      });

      console.log(`✅ Завантажено ${scladData.length} товарів зі складу`);
      return scladData;
    }

    return [];
  } catch (error) {
    console.error("Помилка завантаження даних складу:", error);
    return [];
  }
}

// Функція для отримання закупівельної ціни за sclad_id
function getPurchasePriceBySсladId(scladId: number): number | undefined {
  const item = scladData.find((s) => s.sclad_id === scladId);
  return item?.price;
}

// ОНОВЛЕНО: Функція пошуку з визначенням статусу акту
export async function searchDetailsData(): Promise<void> {
  const dateOpen = byId<HTMLInputElement>("Bukhhalter-details-date-open").value;
  const dateClose = byId<HTMLInputElement>("Bukhhalter-details-date-close").value;

  await fetchScladData();
  
  const shops = await fetchShopData();
  detailsData = [];

  const inRange = (d: string) => {
    const geStart = !dateOpen || d >= dateOpen;
    const leEnd = !dateClose || d <= dateClose;
    return geStart && leEnd;
  };

  for (const shop of shops) {
    const history = shop.Історія || {};
    for (const openDate of Object.keys(history)) {
      if (!inRange(openDate)) continue;

      const dayRecords = history[openDate] || [];
      for (const rec of dayRecords) {
        const act = rec.Акт;
        const automobile = rec.Автомобіль || "";
        const closeDate = rec.ДатаЗакриття || null;

        for (const det of rec.Деталі || []) {
          const qty = Number(det.Кількість) || 0;
          const price = Number(det.Ціна) || 0;
          const total = qty * price;
          const scladId = det.sclad_id;
          
          const purchasePrice = scladId ? getPurchasePriceBySсladId(scladId) : undefined;
          const margin = purchasePrice ? (price - purchasePrice) * qty : undefined;

          detailsData.push({
            dateOpen: openDate,
            dateClose: closeDate,
            act: String(act),
            automobile,
            shop: shop.Name,
            item: det.Найменування || "",
            catalog: (det.Каталог ?? "").toString(),
            quantity: qty,
            price: price,
            purchasePrice: purchasePrice,
            total: total,
            margin: margin,
            isPaid: Boolean((det as any).Розраховано),
            paymentDate: (det as any).Розраховано || undefined,
            sclad_id: scladId,
            isClosed: closeDate !== null, // ДОДАНО
          });
        }
      }
    }
  }

  detailsData.sort((a, b) => b.dateOpen.localeCompare(a.dateOpen));

  allDetailsData = detailsData.slice();
  hasDetailsDataLoaded = true;
  ensureDetailsSmartDropdowns();
  refreshDetailsDropdownOptions();

  updateDetailsTable();

  if (detailsData.length === 0) {
    showNotification("Записів не знайдено за заданими критеріями", "info");
  } else {
    showNotification(`Знайдено ${detailsData.length} записів`, "success");
  }
}

function initDetailsAutoBehaviors(): void {
  const trigger = () => {
    if (hasDetailsDataLoaded) {
      debounceDetailsAutoSearch(() => {
        autoFilterDetailsFromInputs();
      });
    } else {
      debounceDetailsAutoSearch(() => {
        void autoSearchDetailsFromInputs();
      });
    }
  };

  const openEl = document.getElementById(
    "Bukhhalter-details-date-open"
  ) as HTMLInputElement | null;
  const closeEl = document.getElementById(
    "Bukhhalter-details-date-close"
  ) as HTMLInputElement | null;
  openEl?.addEventListener("change", trigger);
  closeEl?.addEventListener("change", trigger);

  ["Bukhhalter-details-item", "Bukhhalter-details-catalog"].forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.addEventListener("input", trigger);
      el.addEventListener("focus", trigger);
    }
  });

  ensureDetailsSmartDropdowns();
}

// ДОДАНО: Створення перемикача для фільтра статусу актів
export function createDetailsStatusToggle(): void {
  const toggle = byId<HTMLInputElement>("details-status-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент details-status-filter-toggle не знайдено в HTML");
    return;
  }

  toggle.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    switch (value) {
      case "0":
        currentStatusFilter = "closed";
        break;
      case "1":
        currentStatusFilter = "open";
        break;
      case "2":
      default:
        currentStatusFilter = "all";
        break;
    }

    updateDetailsTable();
    updateTotalSum();
  });
}

// Функція для кнопки "Пошук"
export async function addDetailsRecord(): Promise<void> {
  await searchDetailsData();
}

// Видалення запису деталей
export function deleteDetailsRecord(index: number): void {
  if (index >= 0 && index < detailsData.length) {
    detailsData.splice(index, 1);
    updateDetailsTable();
    updateTotalSum();
    showNotification("🗑️ Запис видалено", "info");
  }
}

// Функція для зміни статусу оплати
export function toggleDetailsPayment(index: number): void {
  if (index < 0 || index >= detailsData.length) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = detailsData[index];

  if (!record.isPaid) {
    const currentDate = getCurrentDate();
    record.isPaid = true;
    record.paymentDate = currentDate;

    const shop = shopsData.find((s) => s.Name === record.shop);
    if (!shop) {
      console.error(`❌ Магазин ${record.shop} не знайдено`);
      showNotification(
        `⚠️ Помилка: магазин ${record.shop} не знайдено`,
        "error"
      );
      return;
    }

    if (!shop.Історія[record.dateOpen]) {
      console.error(
        `❌ Дата ${record.dateOpen} не знайдена в історії магазину ${record.shop}`
      );
      showNotification(`⚠️ Помилка: дата не знайдена в історії`, "error");
      return;
    }

    const actRecord = shop.Історія[record.dateOpen].find(
      (a) => a.Акт.toString() === record.act
    );
    if (!actRecord) {
      console.error(`❌ Акт ${record.act} не знайдений`);
      showNotification(`⚠️ Помилка: акт ${record.act} не знайдений`, "error");
      return;
    }

    const detailEntry = actRecord.Деталі.find(
      (d) =>
        d.Найменування === record.item &&
        d.Ціна === record.price &&
        d.Кількість === record.quantity
    );

    if (!detailEntry) {
      console.error(`❌ Деталь не знайдена`);
      showNotification(`⚠️ Помилка: деталь не знайдена`, "error");
      return;
    }

    detailEntry.Розраховано = currentDate;
  } else {
    record.isPaid = false;
    record.paymentDate = "";

    const shop = shopsData.find((s) => s.Name === record.shop);
    if (shop && shop.Історія[record.dateOpen]) {
      const actRecord = shop.Історія[record.dateOpen].find(
        (a) => a.Акт.toString() === record.act
      );
      if (actRecord) {
        const detailEntry = actRecord.Деталі.find(
          (d) =>
            d.Найменування === record.item &&
            d.Ціна === record.price &&
            d.Кількість === record.quantity
        );
        if (detailEntry) {
          delete detailEntry.Розраховано;
        }
      }
    }
  }

  saveShopsDataToDatabase()
    .then(() => {
      updateDetailsTable();
      showNotification(
        record.isPaid
          ? `💰 Розрахунок встановлено на ${record.paymentDate}`
          : "❌ Розрахунок скасовано",
        "success"
      );
    })
    .catch((error) => {
      console.error(`❌ Помилка збереження:`, error);
      showNotification("❌ Помилка збереження змін в базу даних", "error");
      record.isPaid = !record.isPaid;
      record.paymentDate = record.isPaid ? getCurrentDate() : "";
      updateDetailsTable();
    });
}

// Масовий розрахунок через кнопку "💰 Розрахунок"
export async function runMassPaymentCalculationForDetails(): Promise<void> {
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

  const filteredData = getFilteredDetailsData();

  if (filteredData.length === 0) {
    showNotification("ℹ️ Немає записів для обробки", "info");
    return;
  }

  const currentDate = getCurrentDate();
  let updatedCount = 0;

  filteredData.forEach((record) => {
    if (!record.isPaid) {
      const originalIndex = detailsData.findIndex(
        (item) =>
          item.dateOpen === record.dateOpen &&
          item.shop === record.shop &&
          item.act === record.act &&
          item.item === record.item &&
          item.price === record.price &&
          item.quantity === record.quantity
      );

      if (originalIndex !== -1) {
        detailsData[originalIndex].isPaid = true;
        detailsData[originalIndex].paymentDate = currentDate;
        updatedCount++;

        const shop = shopsData.find((s) => s.Name === record.shop);
        if (shop && shop.Історія[record.dateOpen]) {
          const actRecord = shop.Історія[record.dateOpen].find(
            (a) => a.Акт.toString() === record.act
          );
          if (actRecord) {
            const detailEntry = actRecord.Деталі.find(
              (d) =>
                d.Найменування === record.item &&
                d.Ціна === record.price &&
                d.Кількість === record.quantity
            );
            if (detailEntry) {
              detailEntry.Розраховано = currentDate;
            }
          }
        }
      }
    }
  });

  if (updatedCount === 0) {
    showNotification("ℹ️ Усі записи вже розраховані", "info");
    return;
  }

  try {
    await saveShopsDataToDatabase();
    updateDetailsTable();
    showNotification(
      `✅ Масовий розрахунок виконано (${updatedCount} записів)`,
      "success"
    );
  } catch (error) {
    console.error("❌ Помилка масового розрахунку:", error);
    showNotification("❌ Помилка при збереженні змін у базу", "error");
  }
}

// Очищення форми деталей
export function clearDetailsForm(): void {
  const detailsSection = byId<HTMLElement>("Bukhhalter-details-section");
  if (!detailsSection) return;

  const inputs = detailsSection.querySelectorAll<HTMLInputElement>(
    "input:not([readonly])"
  );
  inputs.forEach((input) => {
    input.value = "";
  });

  const selects = detailsSection.querySelectorAll<HTMLSelectElement>("select");
  selects.forEach((select) => {
    select.value = "";
  });

  showNotification("Фільтри очищено", "info", 1500);
}

// Оновлення відображених сум
export function updateDetailsDisplayedSums(): void {
  const purchaseTotal = calculateDetailsPurchaseTotal();
  const saleTotal = calculateDetailsTotalSum();
  const marginTotal = calculateDetailsMarginTotal();
  
  updateDetailsTotalSumDisplay(purchaseTotal, saleTotal, marginTotal);
}

// Глобалізація функцій
(window as any).runMassPaymentCalculationForDetails =
  runMassPaymentCalculationForDetails;
(window as any).updateDetailsDisplayedSums = updateDetailsDisplayedSums;
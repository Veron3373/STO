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
import { checkCurrentPageAccess } from "../zakaz_naraudy/inhi/page_access_guard";
import { redirectToIndex } from "../../utils/gitUtils";

const FULL_ACCESS_ALIASES = ["адміністратор", "full", "admin", "administrator"];

// Типи для фільтрів
type StatusFilter = "closed" | "open" | "all";
type PaymentFilter = "paid" | "unpaid" | "all";

// Змінні для фільтрів
let currentStatusFilter: StatusFilter = "all";
let currentPaymentFilterDetails: PaymentFilter = "all";

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
  action: "pay" | "unpay",
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "password-confirmation-modal";
    modal.className = "login-modal";

    const box = document.createElement("div");
    box.className = "login-modal-content";

    // Плаваюча іконка
    const icon = document.createElement("span");
    icon.className = "login-modal-icon";
    icon.textContent = "🔐";

    const h = document.createElement("h3");
    h.className = "login-modal-title";
    h.textContent =
      action === "pay"
        ? "Підтвердження розрахунку"
        : "Підтвердження скасування";

    const subtitle = document.createElement("p");
    subtitle.className = "login-modal-subtitle";
    subtitle.textContent = "Введіть пароль для підтвердження";

    const inp = document.createElement("input");
    inp.type = "password";
    inp.placeholder = "••••••••";
    inp.className = "login-input";
    inp.autocomplete = "current-password";

    const err = document.createElement("div");
    err.className = "login-error-message";
    err.style.display = "none";

    const row = document.createElement("div");
    row.style.cssText =
      "display: flex; gap: 12px; justify-content: center; margin-top: 16px;";

    // Скасувати — ЗЛІВА
    const cancel = document.createElement("button");
    cancel.textContent = "Скасувати";
    cancel.className = "login-button";
    cancel.style.cssText = `flex:1; margin-top:0; background: linear-gradient(135deg, #94a3b8 0%, #a1b0c4 100%); box-shadow: 0 3px 12px rgba(148,163,184,0.25), 0 1px 3px rgba(0,0,0,0.06);`;

    // Підтвердити — СПРАВА
    const ok = document.createElement("button");
    ok.textContent = "Підтвердити";
    ok.className = "login-button";
    ok.style.cssText = `flex:1; margin-top:0;`;

    // Shake-анімація помилки
    const showModalError = (message: string) => {
      err.textContent = message;
      err.style.display = "block";
      inp.classList.remove("input-error");
      void inp.offsetWidth;
      inp.classList.add("input-error");
      setTimeout(() => inp.classList.remove("input-error"), 600);
    };

    ok.onclick = () => {
      const p = (inp.value || "").trim();
      const saved = getSavedUserDataFromLocalStorage?.();
      if (!p) {
        showModalError("Введіть пароль");
        inp.focus();
        return;
      }
      if (!saved) {
        showModalError("Не знайдено дані користувача");
        return;
      }
      if (p === saved.password) {
        // Анімація успіху
        icon.textContent = "✅";
        icon.classList.add("login-success-anim");
        h.textContent = "Підтверджено!";
        h.style.color = "#4ade80";
        inp.classList.add("input-success");
        ok.innerHTML = "✓ Успішно";
        ok.style.background = "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";
        setTimeout(() => { modal.remove(); resolve(true); }, 500);
      } else {
        showModalError("Невірний пароль");
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

    row.append(cancel, ok);
    box.append(icon, h, subtitle, inp, err, row);
    modal.append(box);
    document.body.appendChild(modal);
    setTimeout(() => inp.focus(), 100);
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
  Розрахунок?: string;
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
  purchasePrice?: number;
  total: number;
  margin?: number;
  discountPercent?: number;
  isPaid: boolean;
  paymentDate?: string;
  sclad_id?: number;
  scladNomer?: number; // Номер складу з таблиці sclad
  zapchastystName?: string; // Ім'я Запчастиста хто оприходував
  isClosed: boolean;
}

// Змінні для зберігання даних деталей
let detailsData: DetailsRecord[] = [];
let shopsData: ShopData[] = [];

// Кеш для знижок з актів (act_id -> discountPercent)
let actsDiscountCache: Map<number, number> = new Map();

// НОВІ ЗМІННІ ДЛЯ АВТОФІЛЬТРАЦІЇ
let allDetailsData: DetailsRecord[] = [];
let hasDetailsDataLoaded = false;
let autoDetailsSearchTimer: number | null = null;
const AUTO_DETAILS_SEARCH_DELAY = 350;

// Змінна для фільтру по складу в деталях
let currentDetailsScladFilter: number | null = null;
let availableDetailsScladNomers: number[] = [];

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
    placeholder: "Введіть або оберіть Каталог номер...",
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
      <div class="dropdown-item ${index === this.selectedIndex ? "selected" : ""
          }" 
           data-index="${index}">
        ${this.highlightMatch(item, this.input.value)}
      </div>
    `,
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
      "gi",
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
      this.filteredItems.length - 1,
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
            error,
          );
          return null;
        }
      })
      .filter(
        (dropdown): dropdown is DetailsSmartDropdown => dropdown !== null,
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

// Функція для фільтрації завантажених даних
export function filterDetailsData(): void {
  if (!hasDetailsDataLoaded || allDetailsData.length === 0) {
    detailsData = [];
    updateDetailsTable();
    return;
  }

  const dateOpen = getDetailsInputValue("Bukhhalter-details-date-open");
  const dateClose = getDetailsInputValue("Bukhhalter-details-date-close");
  const item = getDetailsInputValue("Bukhhalter-details-item");
  const catalog = getDetailsInputValue("Bukhhalter-details-catalog");

  let filtered = [...allDetailsData];

  // Функція для отримання цільової дати залежно від режиму
  const getTargetDate = (r: DetailsRecord): string => {
    switch (detailsDateFilterMode) {
      case "close":
        return r.dateClose || "";
      case "paid":
        return r.paymentDate || "";
      case "open":
      default:
        return r.dateOpen;
    }
  };

  // КРИТИЧНО: Якщо режим "close" або "paid", показуємо ТІЛЬКИ записи з відповідною датою
  if (detailsDateFilterMode === "close") {
    filtered = filtered.filter(
      (r) => r.dateClose !== null && r.dateClose !== "",
    );
  } else if (detailsDateFilterMode === "paid") {
    filtered = filtered.filter(
      (r) => r.paymentDate !== undefined && r.paymentDate !== "",
    );
  }

  // Фільтр по датах з урахуванням режиму
  if (dateOpen || dateClose) {
    const toIsoClose = dateClose || todayIso();
    filtered = filtered.filter((r) => {
      const targetDate = getTargetDate(r);
      // Якщо цільової дати немає - виключаємо
      if (!targetDate) {
        return false;
      }
      return inRangeByIso(targetDate, dateOpen, toIsoClose);
    });
  }

  // Фільтр по найменуванню
  if (item) {
    filtered = filtered.filter((r) =>
      (r.item || "").toLowerCase().includes(item.toLowerCase()),
    );
  }

  // Фільтр по каталогу
  if (catalog) {
    filtered = filtered.filter((r) =>
      (r.catalog || "").toLowerCase().includes(catalog.toLowerCase()),
    );
  }

  // Фільтр по статусу актів
  if (currentStatusFilter === "closed") {
    filtered = filtered.filter((item) => item.isClosed);
  } else if (currentStatusFilter === "open") {
    filtered = filtered.filter((item) => !item.isClosed);
  }

  // Фільтр по розрахункам
  if (currentPaymentFilterDetails === "paid") {
    filtered = filtered.filter((item) => item.isPaid);
  } else if (currentPaymentFilterDetails === "unpaid") {
    filtered = filtered.filter((item) => !item.isPaid);
  }

  // Фільтр по складу (використовуємо scladNomer)
  if (currentDetailsScladFilter !== null) {
    filtered = filtered.filter(
      (item) => item.scladNomer === currentDetailsScladFilter,
    );
  }

  // Сортування за цільовою датою
  filtered.sort((a, b) => {
    const ka = toIsoDate(getTargetDate(a));
    const kb = toIsoDate(getTargetDate(b));
    return kb.localeCompare(ka);
  });

  detailsData = filtered;
  updateDetailsTable();
}

// Автофільтрація з урахуванням статусу актів + надійні дати
function autoFilterDetailsFromInputs(): void {
  filterDetailsData();
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
  await fetchScladData();
  await fetchActsDiscounts();

  allDetailsData = [];

  for (const shop of shops) {
    const history = shop.Історія || {};
    for (const openDate of Object.keys(history)) {
      const dayRecords = history[openDate] || [];
      for (const rec of dayRecords) {
        const act = rec.Акт;
        const actId = Number(act);
        const automobile = rec.Автомобіль || "";
        const closeDate = rec.ДатаЗакриття || null;
        const isPaid = Boolean(rec.Розрахунок);
        const paymentDate = rec.Розрахунок || undefined;

        for (const det of rec.Деталі || []) {
          const qty = Number(det.Кількість) || 0;
          const price = Number(det.Ціна) || 0;
          const total = qty * price;
          const scladId = det.sclad_id;

          const purchasePrice = scladId
            ? getPurchasePriceBySсladId(scladId)
            : undefined;

          // Отримуємо номер складу з таблиці sclad
          const scladNomer = scladId
            ? getScladNomerByScladId(scladId)
            : undefined;

          // Отримуємо знижку для конкретного акту
          const discountPercent = getDiscountByActId(actId);
          const discountMultiplier =
            discountPercent > 0 ? 1 - discountPercent / 100 : 1;

          // Рахуємо маржу з урахуванням знижки від ВАЛУ
          // Маржа = (ціна продажу × множник знижки) - вхідна ціна
          let margin: number | undefined;
          if (purchasePrice !== undefined) {
            const saleAfterDiscount = price * discountMultiplier * qty;
            const purchaseTotal = purchasePrice * qty;
            margin = saleAfterDiscount - purchaseTotal;
          }

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
            purchasePrice,
            total: total,
            margin,
            discountPercent,
            isPaid: isPaid,
            paymentDate: paymentDate,
            sclad_id: scladId,
            scladNomer: scladNomer,
            isClosed: closeDate !== null,
          });
        }
      }
    }
  }

  allDetailsData.sort((a, b) =>
    toIsoDate(b.dateOpen).localeCompare(toIsoDate(a.dateOpen)),
  );

  // Оновлюємо кнопки фільтрації складів після завантаження даних
  updateDetailsScladFilterButtons();
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
                item,
              );
              return null;
            }

            if (!parsedData || !parsedData.Name) {
              console.warn(
                `Пропущений запис ${index}: немає поля Name`,
                parsedData,
              );
              return null;
            }

            return parsedData;
          } catch (parseError) {
            console.error(
              `Помилка парсингу запису ${index}:`,
              parseError,
              item,
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
      5000,
    );
    throw error;
  }
}

// Обчислення загальної суми деталей
export function calculateDetailsTotalSum(): number {
  return detailsData.reduce((sum, item) => sum + (item.total || 0), 0);
}

function calculateDetailsPurchaseTotal(): number {
  return detailsData.reduce((sum, item) => {
    const purchaseTotal = (item.purchasePrice || 0) * (item.quantity || 0);
    return sum + purchaseTotal;
  }, 0);
}

function calculateDetailsMarginTotal(): number {
  return detailsData.reduce((sum, item) => sum + (item.margin || 0), 0);
}

// Оновлення таблиці з кольоровим кодуванням та фільтрацією
export function updateDetailsTable(): void {
  const tbody = byId<HTMLTableSectionElement>("details-tbody");

  // Перевірка чи елемент існує (може бути null якщо не на сторінці bukhhalteriya.html)
  if (!tbody) {
    return;
  }

  const filteredData = detailsData;

  if (filteredData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="13" class="Bukhhalter-no-data">Немає даних для відображення</td></tr>';

    updateDetailsTotalSumDisplay(0, 0, 0);
    return;
  }

  tbody.innerHTML = filteredData
    .map((item, index) => {
      const originalIndex = detailsData.indexOf(item);
      const rowClass = item.isClosed ? "closed-row" : "open-row";
      const paidClass = item.isPaid ? "paid-row" : "unpaid-row";

      // Формуємо текст для кнопки розрахунку
      const paymentButtonText = item.isPaid
        ? `💰 ${item.paymentDate || "Розраховано"}`
        : "💲 Не розраховано";

      // Форматування цін
      const purchasePriceHtml =
        item.purchasePrice !== undefined
          ? `<div style="font-size: 0.85em; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 2px;">${formatNumber(
            item.purchasePrice,
          )}</div>`
          : '<div style="font-size: 0.85em; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 2px;">-</div>';

      const salePriceHtml = `<div style="font-size: 0.95em; font-weight: 500;">${formatNumber(
        item.price,
      )}</div>`;

      // Показуємо маржу з індикатором знижки якщо вона є
      const discountIndicator =
        item.discountPercent && item.discountPercent > 0
          ? ` <span style="color: #ff9800; font-size: 0.75em;">(-${item.discountPercent}%)</span>`
          : "";

      const marginHtml =
        item.margin !== undefined
          ? `<div style="font-size: 0.85em; color: ${item.margin >= 0 ? "#28a745" : "#dc3545"
          }; font-weight: 500; margin-top: 2px;">${item.margin >= 0 ? "+" : ""}${formatNumber(
            item.margin,
          )}${discountIndicator}</div>`
          : "";

      return `
        <tr class="${rowClass} ${paidClass}" onclick="handleRowClick(${index})">
          <td>
            <button class="Bukhhalter-payment-btn ${item.isPaid ? "paid" : "unpaid"
        }" 
                    onclick="event.stopPropagation(); toggleDetailsPaymentWithConfirmation(${originalIndex})" 
                    title="${item.isPaid
          ? `Розраховано ${item.paymentDate || ""}`
          : "Не розраховано"
        }">
              ${paymentButtonText}
            </button>
          </td>
          <td>${formatDate(item.dateOpen)}</td>
          <td>${formatDate(item.dateClose || "")}</td>
          <td>
            <button class="Bukhhalter-act-btn"
                    onclick="event.stopPropagation(); openActModalWithClient(${Number(item.act) || 0
        })"
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
          <td class="sklad-cell">${item.scladNomer || "-"}</td>
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
function updateDetailsTotalSumDisplay(
  purchaseTotal: number,
  saleTotal: number,
  marginTotal: number,
): void {
  const totalSumElement = byId<HTMLElement>("total-sum");

  if (totalSumElement) {
    const marginSign = marginTotal >= 0 ? "+" : "";

    totalSumElement.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 15px; font-size: 1.1em;">
        <span>Сума <strong style="color: #333;">💰 ${formatNumber(
      saleTotal,
    )}</strong> грн</span>
        <span style="color: #666;">-</span>
        <span><strong style="color: #8B0000;">💶 ${formatNumber(
      purchaseTotal,
    )}</strong> грн</span>
        <span style="color: #666;">=</span>
        <span><strong style="color: ${marginTotal >= 0 ? "#006400 " : "#8B0000"
      };">📈 ${marginSign}${formatNumber(marginTotal)}</strong> грн</span>
      </div>
    `;
  }
}

// ==== DATE HELPERS (оновлено, додати один раз у файлі) ====
function toIsoDate(input: string | null | undefined): string {
  if (!input) return "";
  // чистимо емодзі/текст і лишаємо цифри та роздільники
  const s = String(input)
    .normalize("NFKC")
    .trim()
    .replace(/[^\d.\-\/]/g, "");

  if (!s) return "";

  // YMD: YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2, "0");
    const dd = m[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // DMY: DD.MM.YYYY / DD-MM-YYYY / DD/MM/YY
  m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) {
      yyyy = (+yyyy >= 70 ? "19" : "20") + yyyy; // 70–99 -> 19xx, інакше 20xx
    }
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inRangeByIso(
  targetDmy: string,
  fromDmy?: string,
  toDmy?: string,
): boolean {
  const t = toIsoDate(targetDmy);
  if (!t) return false;
  const f = fromDmy ? toIsoDate(fromDmy) : "";
  const to = toDmy ? toIsoDate(toDmy) : todayIso();
  return (!f || t >= f) && (!to || t <= to);
}

interface ScladItem {
  sclad_id: number;
  price: number;
  scladNomer?: number; // Номер складу
  xto_zamovuv?: number; // slyusar_id того хто оприходував
  [key: string]: any;
}

// Кеш даних складу:
let scladData: ScladItem[] = [];

// Кеш даних слюсарів (для отримання імен Запчастистів)
let slyusarsNameCache: Map<number, string> = new Map();

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
        // Отримуємо scladNomer напряму з запису (не з data)
        const scladNomer =
          item.scladNomer !== undefined ? Number(item.scladNomer) : undefined;

        if (typeof item.data === "string") {
          try {
            const parsed = JSON.parse(item.data);
            return {
              sclad_id: item.sclad_id || parsed.sclad_id,
              price: parsed.price || 0,
              scladNomer: scladNomer,
              ...parsed,
            };
          } catch {
            return {
              sclad_id: item.sclad_id,
              price: item.price || 0,
              scladNomer: scladNomer,
              ...item,
            };
          }
        }
        return {
          sclad_id: item.sclad_id || item.data?.sclad_id,
          price: item.price || item.data?.price || 0,
          scladNomer: scladNomer,
          xto_zamovuv: item.xto_zamovuv ?? undefined,
          ...(typeof item.data === "object" ? item.data : item),
        };
      });

      return scladData;
    }

    return [];
  } catch (error) {
    console.error("Помилка завантаження даних складу:", error);
    return [];
  }
}

// Завантаження імен Запчастистів з бази slyusars
async function fetchSlyusarsNames(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("slyusars")
      .select("slyusar_id, data");

    if (error) {
      console.error("Помилка завантаження слюсарів:", error);
      return;
    }

    slyusarsNameCache.clear();

    if (data && Array.isArray(data)) {
      for (const slyusar of data) {
        const slyusarData =
          typeof slyusar.data === "string"
            ? JSON.parse(slyusar.data)
            : slyusar.data;
        const name = slyusarData?.Name || "";
        if (name && slyusar.slyusar_id) {
          slyusarsNameCache.set(slyusar.slyusar_id, name);
        }
      }
    }
  } catch (error) {
    console.error("Помилка завантаження імен слюсарів:", error);
  }
}

// Функція для отримання імені Запчастиста за slyusar_id
function getZapchastystNameByScladId(scladId: number): string | undefined {
  const item = scladData.find((s) => s.sclad_id === scladId);
  if (!item?.xto_zamovuv) return undefined;
  return slyusarsNameCache.get(item.xto_zamovuv);
}

// Функція для отримання закупівельної ціни за sclad_id
function getPurchasePriceBySсladId(scladId: number): number | undefined {
  const item = scladData.find((s) => s.sclad_id === scladId);
  return item?.price;
}

// Функція для отримання номера складу за sclad_id
function getScladNomerByScladId(scladId: number): number | undefined {
  const item = scladData.find((s) => s.sclad_id === scladId);
  return item?.scladNomer;
}

// Функція для завантаження знижок з актів
async function fetchActsDiscounts(): Promise<void> {
  try {
    const { data, error } = await supabase.from("acts").select("act_id, data");

    if (error) {
      console.error("Помилка завантаження знижок з актів:", error);
      return;
    }

    actsDiscountCache.clear();

    if (data && Array.isArray(data)) {
      for (const act of data) {
        const actData =
          typeof act.data === "string" ? JSON.parse(act.data) : act.data;
        const discountPercent = Number(actData?.["Знижка"]) || 0;
        if (discountPercent > 0) {
          actsDiscountCache.set(act.act_id, discountPercent);
        }
      }
    }
  } catch (error) {
    console.error("Помилка завантаження знижок:", error);
  }
}

// Функція для отримання знижки за act_id
function getDiscountByActId(actId: number): number {
  return actsDiscountCache.get(actId) || 0;
}

// Функція пошуку з визначенням статусу акту
export async function searchDetailsData(): Promise<void> {
  // 🔐 Перевіряємо доступ до сторінки перед пошуком
  const hasAccess = await checkCurrentPageAccess();

  if (!hasAccess) {
    redirectToIndex();
    return;
  }

  let dateOpen = byId<HTMLInputElement>("Bukhhalter-details-date-open").value;
  const dateClose = byId<HTMLInputElement>(
    "Bukhhalter-details-date-close",
  ).value;

  // Якщо не вказано жодної дати - встановлюємо дату за замовчуванням БЕЗ відображення користувачу
  if (!dateOpen && !dateClose) {
    dateOpen = "01.01.2025"; // Встановлюємо внутрішню дату за замовчуванням
  }

  await fetchScladData();
  await fetchSlyusarsNames();
  await fetchActsDiscounts();

  const shops = await fetchShopData();
  const rawData: DetailsRecord[] = [];

  for (const shop of shops) {
    const history = shop.Історія || {};
    for (const openDate of Object.keys(history)) {
      const dayRecords = history[openDate] || [];

      for (const rec of dayRecords) {
        const act = rec.Акт;
        const automobile = rec.Автомобіль || "";
        const closeDate = rec.ДатаЗакриття || null;
        const isPaid = Boolean(rec.Розрахунок);
        const paymentDate = rec.Розрахунок || undefined;

        for (const det of rec.Деталі || []) {
          const qty = Number(det.Кількість) || 0;
          const price = Number(det.Ціна) || 0;
          const total = qty * price;
          const scladId = det.sclad_id;
          const actId = Number(act);

          const purchasePrice = scladId
            ? getPurchasePriceBySсladId(scladId)
            : undefined;

          // Отримуємо номер складу з таблиці sclad
          const scladNomer = scladId
            ? getScladNomerByScladId(scladId)
            : undefined;

          // Отримуємо знижку для конкретного акту
          const discountPercent = getDiscountByActId(actId);
          const discountMultiplier =
            discountPercent > 0 ? 1 - discountPercent / 100 : 1;

          // Рахуємо маржу з урахуванням знижки від ВАЛУ
          // Маржа = (ціна продажу × множник знижки) - вхідна ціна
          let margin: number | undefined;
          if (purchasePrice !== undefined) {
            const saleAfterDiscount = price * discountMultiplier * qty;
            const purchaseTotal = purchasePrice * qty;
            margin = saleAfterDiscount - purchaseTotal;
          }

          // Отримуємо ім'я Запчастиста за sclad_id
          const zapchastystName = scladId
            ? getZapchastystNameByScladId(scladId)
            : undefined;

          rawData.push({
            dateOpen: openDate,
            dateClose: closeDate,
            act: String(act),
            automobile,
            shop: shop.Name,
            item: det.Найменування || "",
            catalog: (det.Каталог ?? "").toString(),
            quantity: qty,
            price,
            purchasePrice,
            total,
            margin,
            discountPercent,
            isPaid,
            paymentDate,
            sclad_id: scladId,
            scladNomer: scladNomer,
            zapchastystName: zapchastystName,
            isClosed: closeDate !== null,
          });
        }
      }
    }
  }

  // Зберігаємо ВСІ дані без фільтрації по датах
  allDetailsData = rawData;
  hasDetailsDataLoaded = true;

  ensureDetailsSmartDropdowns();
  refreshDetailsDropdownOptions();

  // Оновлюємо кнопки фільтрації складів
  updateDetailsScladFilterButtons();

  // Тепер застосовуємо фільтрацію через нову функцію
  filterDetailsData();

  showNotification(
    `✅ Завантажено ${allDetailsData.length} записів. Застосовано фільтри.`,
    "success",
  );
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
    "Bukhhalter-details-date-open",
  ) as HTMLInputElement | null;
  const closeEl = document.getElementById(
    "Bukhhalter-details-date-close",
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
  initDetailsDateFilterToggle();
}

export function createDetailsStatusToggle(): void {
  const toggle = byId<HTMLInputElement>("poAktam-status-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент poAktam-status-filter-toggle не знайдено в HTML");
    return;
  }

  toggle.addEventListener("change", (e) => {
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

    // ЗМІНЕНО: використовуємо filterDetailsData замість updateDetailsTable
    if (hasDetailsDataLoaded) {
      filterDetailsData();
    } else {
      updateDetailsTable();
    }
    updateTotalSum();
  });

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

    // ЗМІНЕНО: використовуємо filterDetailsData
    if (hasDetailsDataLoaded) {
      filterDetailsData();
    } else {
      updateDetailsTable();
    }
  });
}

// Створення перемикача для фільтра розрахунків деталей
export function createDetailsPaymentToggle(): void {
  const toggle = byId<HTMLInputElement>("poAktam-payment-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент poAktam-payment-filter-toggle не знайдено");
    return;
  }

  toggle.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    switch (value) {
      case "0":
        currentPaymentFilterDetails = "paid";
        break;
      case "1":
        currentPaymentFilterDetails = "unpaid";
        break;
      case "2":
      default:
        currentPaymentFilterDetails = "all";
        break;
    }

    // ЗМІНЕНО: використовуємо filterDetailsData
    if (hasDetailsDataLoaded) {
      filterDetailsData();
    } else {
      updateDetailsTable();
    }
    updateTotalSum();
  });
}

// ==================== ФІЛЬТР ПО СКЛАДАХ ДЛЯ ДЕТАЛЕЙ ====================

// Отримати унікальні номери складів з даних деталей
function getUniqueDetailsScladNomers(): number[] {
  const scladSet = new Set<number>();
  allDetailsData.forEach((item) => {
    if (item.scladNomer && typeof item.scladNomer === "number") {
      scladSet.add(item.scladNomer);
    }
  });
  return Array.from(scladSet).sort((a, b) => a - b);
}

// Оновити кнопки фільтрації складів для деталей
export function updateDetailsScladFilterButtons(): void {
  const container = byId<HTMLElement>("details-sklad-filter-container");
  if (!container) return;

  availableDetailsScladNomers = getUniqueDetailsScladNomers();

  // Якщо немає складів або тільки 1 склад - не показуємо кнопки
  if (
    availableDetailsScladNomers.length === 0 ||
    availableDetailsScladNomers.length === 1
  ) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  // Додаємо клас для однакової ширини кнопок
  container.classList.add("equal-width");

  let buttonsHtml = "";

  availableDetailsScladNomers.forEach((nomer) => {
    const isActive = currentDetailsScladFilter === nomer;
    buttonsHtml += `
      <button 
        class="Bukhhalter-sklad-btn ${isActive ? "active" : ""}" 
        data-sclad-nomer="${nomer}"
        onclick="filterDetailsBySclad(${nomer})"
        title="Показати склад ${nomer}"
      >
        Склад ${nomer}
      </button>
    `;
  });

  // Кнопка "Всі" - помаранчева
  const isAllActive = currentDetailsScladFilter === null;
  buttonsHtml += `
    <button 
      class="Bukhhalter-sklad-btn Bukhhalter-sklad-btn-all ${isAllActive ? "active" : ""}" 
      data-sclad-nomer="all"
      onclick="filterDetailsBySclad(null)"
      title="Показати всі склади"
    >
      Всі
    </button>
  `;

  container.innerHTML = buttonsHtml;
}

// Функція фільтрації по складу для деталей
function filterDetailsBySclad(scladNomer: number | null): void {
  currentDetailsScladFilter = scladNomer;

  // Оновлюємо активну кнопку
  const container = byId<HTMLElement>("details-sklad-filter-container");
  if (container) {
    const buttons = container.querySelectorAll(".Bukhhalter-sklad-btn");
    buttons.forEach((btn) => {
      const btnNomer = btn.getAttribute("data-sclad-nomer");
      if (scladNomer === null) {
        btn.classList.toggle("active", btnNomer === "all");
      } else {
        btn.classList.toggle("active", btnNomer === String(scladNomer));
      }
    });
  }

  filterDetailsData();
}

// Експорт для глобального доступу
(window as any).filterDetailsBySclad = filterDetailsBySclad;

export function initializeDetailsData(): void {
  detailsData = [];
  allDetailsData = [];
  hasDetailsDataLoaded = false;
  updateDetailsTable();
  initDetailsAutoBehaviors();
  createDetailsStatusToggle();
  createDetailsPaymentToggle();
}

// Глобальна змінна для зберігання поточного фільтра дат
let detailsDateFilterMode: "open" | "close" | "paid" = "open";

// Функція для ініціалізації перемикача фільтрації дат для деталей
function initDetailsDateFilterToggle(): void {
  const toggleContainer = document.querySelector(
    "#Bukhhalter-details-section .Bukhhalter-date-filter-toggle",
  );
  if (!toggleContainer) return;

  const buttons =
    toggleContainer.querySelectorAll<HTMLButtonElement>(".date-filter-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      buttons.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      detailsDateFilterMode = this.dataset.filter as "open" | "close" | "paid";

      // ЗМІНЕНО: просто застосовуємо фільтр до вже завантажених даних
      if (hasDetailsDataLoaded) {
        filterDetailsData();
      }
    });
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

// Функція для зміни статусу оплати з підтвердженням
export async function toggleDetailsPaymentWithConfirmation(
  index: number,
): Promise<void> {
  if (!detailsData[index]) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = detailsData[index];

  if (!hasFullAccess()) {
    showNotification(
      "⚠️ У вас немає прав для зміни статусу розрахунку",
      "warning",
    );
    return;
  }

  const action = record.isPaid ? "unpay" : "pay";
  const confirmed = await createPasswordConfirmationModal(action);

  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  toggleDetailsPayment(index);
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
        "error",
      );
      return;
    }

    if (!shop.Історія[record.dateOpen]) {
      console.error(
        `❌ Дата ${record.dateOpen} не знайдена в історії магазину ${record.shop}`,
      );
      showNotification(`⚠️ Помилка: дата не знайдена в історії`, "error");
      return;
    }

    const actRecord = shop.Історія[record.dateOpen].find(
      (a) => a.Акт.toString() === record.act,
    );
    if (!actRecord) {
      console.error(`❌ Акт ${record.act} не знайдений`);
      showNotification(`⚠️ Помилка: акт ${record.act} не знайдений`, "error");
      return;
    }

    // Встановлюємо Розрахунок на рівні акту
    actRecord.Розрахунок = currentDate;
  } else {
    record.isPaid = false;
    record.paymentDate = "";

    const shop = shopsData.find((s) => s.Name === record.shop);
    if (shop && shop.Історія[record.dateOpen]) {
      const actRecord = shop.Історія[record.dateOpen].find(
        (a) => a.Акт.toString() === record.act,
      );
      if (actRecord) {
        delete actRecord.Розрахунок;
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
        "success",
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

// Масовий розрахунок через кнопку "💰 Розрахунок" для деталей
export async function runMassPaymentCalculationForDetails(): Promise<void> {
  if (!hasFullAccess()) {
    showNotification(
      "⚠️ У вас немає прав для виконання масового розрахунку",
      "warning",
    );
    return;
  }

  const confirmed = await createPasswordConfirmationModal("pay");
  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  const filteredData = detailsData; // detailsData вже відфільтровані через filterDetailsData()

  if (filteredData.length === 0) {
    showNotification(
      "ℹ️ Немає записів для обробки в поточному фільтрі",
      "info",
    );
    return;
  }

  const currentDate = getCurrentDate();
  let updatedCount = 0;
  const processedActs = new Set<string>();

  filteredData.forEach((record) => {
    if (!record.isPaid) {
      const actKey = `${record.shop}-${record.dateOpen}-${record.act}`;

      if (!processedActs.has(actKey)) {
        // Оновлюємо всі деталі цього акту в detailsData
        detailsData.forEach((item, index) => {
          if (
            item.shop === record.shop &&
            item.dateOpen === record.dateOpen &&
            item.act === record.act &&
            !item.isPaid
          ) {
            detailsData[index].isPaid = true;
            detailsData[index].paymentDate = currentDate;
            updatedCount++;
          }
        });

        // Оновлюємо в базі даних
        const shop = shopsData.find((s) => s.Name === record.shop);
        if (shop && shop.Історія[record.dateOpen]) {
          const actRecord = shop.Історія[record.dateOpen].find(
            (a) => a.Акт.toString() === record.act,
          );
          if (actRecord) {
            actRecord.Розрахунок = currentDate;
            processedActs.add(actKey);
          }
        }
      }
    }
  });

  if (updatedCount === 0) {
    showNotification(
      "ℹ️ Усі записи в поточному фільтрі вже розраховані",
      "info",
    );
    return;
  }

  try {
    await saveShopsDataToDatabase();
    updateDetailsTable();
    showNotification(
      `✅ Масовий розрахунок виконано (${updatedCount} записів з відфільтрованих)`,
      "success",
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

  // Очищаємо всі інпути
  const inputs = detailsSection.querySelectorAll<HTMLInputElement>(
    "input:not([readonly])",
  );
  inputs.forEach((input) => {
    input.value = "";
  });

  // Очищаємо всі селекти
  const selects = detailsSection.querySelectorAll<HTMLSelectElement>("select");
  selects.forEach((select) => {
    select.value = "";
  });

  // Скидаємо перемикачі статусу актів на "Всі" (значення "2")
  const statusToggle = byId<HTMLInputElement>("poAktam-status-filter-toggle");
  if (statusToggle) {
    statusToggle.value = "2";
    currentStatusFilter = "all";
  }

  // Скидаємо перемикачі розрахунків на "Всі" (значення "2")
  const paymentToggle = byId<HTMLInputElement>("poAktam-payment-filter-toggle");
  if (paymentToggle) {
    paymentToggle.value = "2";
    currentPaymentFilterDetails = "all";
  }

  // Скидаємо режим фільтрації дат на "Відкриття"
  detailsDateFilterMode = "open";
  const dateFilterButtons = document.querySelectorAll(
    "#Bukhhalter-details-section .date-filter-btn",
  );
  dateFilterButtons.forEach((btn) => {
    if ((btn as HTMLButtonElement).dataset.filter === "open") {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Очищаємо дані
  detailsData = [];
  allDetailsData = [];
  hasDetailsDataLoaded = false;

  // Оновлюємо таблицю
  updateDetailsTable();

  showNotification("🗑️ Фільтри та дані очищено", "info", 1500);
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
(window as any).createDetailsStatusToggle = createDetailsStatusToggle;
(window as any).toggleDetailsPaymentWithConfirmation =
  toggleDetailsPaymentWithConfirmation;
(window as any).createDetailsPaymentToggle = createDetailsPaymentToggle;

// Затримуємо ініціалізацію перемикачів при завантаженні сторінки
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const statusToggle = document.getElementById(
      "poAktam-status-filter-toggle",
    ) as HTMLInputElement;
    const paymentToggle = document.getElementById(
      "poAktam-payment-filter-toggle",
    ) as HTMLInputElement;

    if (statusToggle) {
      createDetailsStatusToggle();
    }

    if (paymentToggle) {
      createDetailsPaymentToggle();
    }
  }, 100);
});

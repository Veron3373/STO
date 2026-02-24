// src\ts\roboha\bukhhalteriya\zarplata.ts
import { supabase } from "../../vxid/supabaseClient";
import { formatDate, formatNumber, byId } from "./bukhhalteriya";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../tablucya/users";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { checkCurrentPageAccess } from "../zakaz_naraudy/inhi/page_access_guard";
import { redirectToIndex } from "../../utils/gitUtils";

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

function hasFullAccess(): boolean {
  return FULL_ACCESS_ALIASES.includes(getCurrentAccessLevel());
}

type PaymentFilter = "paid" | "unpaid" | "all";
type StatusFilter = "closed" | "open" | "all";
type PercentageFilter = "higher" | "lower" | "all";

export interface PodlegleRecord {
  dateOpen: string;
  dateClose: string;
  name: string;
  act: string;
  client: string;
  automobile: string;
  work: string;
  quantity: number;
  price: number;
  total: number;
  salary: number;
  margin: number;
  isClosed: boolean;
  isPaid: boolean;
  paymentDate?: string;
  recordedDate?: string; // ✅ Додано: дата створення запису
  customHtmlTotal?: string; // ✅ Додано для кастомного відображення суми
  workIndex?: number; // ✅ Додано: індекс роботи в масиві Записи для точного пошуку
  recordId?: string; // ✅ Додано: унікальний ID запису для найточнішого пошуку
}

interface SlyusarData {
  Name: string;
  ПроцентРоботи?: number;
  Історія: {
    [date: string]: Array<{
      Акт: string;
      Записи?: Array<{
        Ціна: number;
        Робота: string;
        Кількість: number;
        Зарплата?: number;
        Розраховано?: string;
        Записано?: string; // ✅ Додано: дата створення запису
        recordId?: string; // ✅ Додано: унікальний ID для точного пошуку
      }>;
      Клієнт?: string;
      Автомобіль?: string;
      СуммаРоботи: number;
      ДатаЗакриття: string | null;
      // ✅ Нові поля для Приймальника
      СуммаЗапчастин?: number;
      МаржаДляЗарплати?: number; // Маржа запчастин БЕЗ свого складу (для розрахунку ЗарплатаЗапчастин)
      ЗарплатаРоботи?: number;
      ЗарплатаЗапчастин?: number;
      ЗарплатаЗапчастистів?: number; // Сума зарплат всіх Запчастистів по цьому акту
      Розраховано?: string;
      Знижка?: number; // Відсоток знижки
    }>;
  };
}

export let podlegleData: PodlegleRecord[] = [];
let slyusarsData: SlyusarData[] = [];
let availableNames: string[] = [];
let currentPaymentFilter: PaymentFilter = "all";
let currentPercentageFilter: PercentageFilter = "all";

// Кеш для процентів роботи слюсарів (Name -> ПроцентРоботи)
let slyusarPercentCache: Map<string, number> = new Map();

// 🔹 Кеш для дат закриття актів (act_id → date_off з таблиці acts)
let actsDateOffMap: Map<string, string> = new Map();

// 🔹 Хелпер для отримання дати закриття акту (пріоритет: acts.date_off, fallback: slyusars.Історія.ДатаЗакриття)
function getActDateClose(actId: string, fallbackDate: string | null): string {
  return actsDateOffMap.get(actId) || fallbackDate || "";
}

// 🔹 Хелпер для перевірки чи акт закритий
function isActClosed(actId: string, fallbackDate: string | null): boolean {
  return !!actsDateOffMap.get(actId) || !!fallbackDate;
}

// Функція для отримання процента роботи слюсаря за ім'ям
function getSlyusarPercentByName(name: string): number {
  if (!name) return 0;
  return slyusarPercentCache.get(name.toLowerCase()) || 0;
}

let currentStatusFilter: StatusFilter = "all";

let lastSearchDateOpen: string = "";
let lastSearchDateClose: string = "";

// НОВІ ЗМІННІ ДЛЯ АВТОФІЛЬТРАЦІЇ РОБІТ
let allPodlegleData: PodlegleRecord[] = [];
let hasPodlegleDataLoaded = false;
let autoPodlegleSearchTimer: number | null = null;
const AUTO_PODLEGLE_SEARCH_DELAY = 350;

function debouncePodlegleAutoSearch(fn: () => void) {
  if (autoPodlegleSearchTimer !== null) {
    clearTimeout(autoPodlegleSearchTimer);
  }
  autoPodlegleSearchTimer = window.setTimeout(() => {
    autoPodlegleSearchTimer = null;
    fn();
  }, AUTO_PODLEGLE_SEARCH_DELAY);
}

// ВИПАДАЮЧИЙ СПИСОК ДЛЯ РОБІТ
interface WorkDropdownConfig {
  inputId: string;
  listId: string;
  placeholder: string;
  maxItems: number;
}

const workDropdownConfig: WorkDropdownConfig = {
  inputId: "Bukhhalter-podlegle-work-input",
  listId: "dl-podlegle-work",
  placeholder: "Введіть або оберіть роботу",
  maxItems: 150,
};

class WorkSmartDropdown {
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement;
  public readonly config: WorkDropdownConfig;
  private items: string[] = [];
  private filteredItems: string[] = [];
  private selectedIndex = -1;
  private isOpen = false;

  constructor(config: WorkDropdownConfig) {
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

    this.input.addEventListener("click", (e) => {
      e.stopPropagation();
      this.filter(this.input.value);
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
      triggerPodlegleAutoFilter();
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
      const selectedValue = this.filteredItems[index];
      this.input.value = selectedValue;
      this.hide();

      triggerPodlegleAutoFilter();
    }
  }

  private scrollToSelected() {
    const selected = this.dropdown.querySelector(".dropdown-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }
}

let workSmartDropdown: WorkSmartDropdown | null = null;

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

function ensureWorkSmartDropdown(): void {
  addDropdownStyles();

  if (!workSmartDropdown) {
    const inputEl = document.getElementById(workDropdownConfig.inputId);
    if (inputEl) {
      try {
        workSmartDropdown = new WorkSmartDropdown(workDropdownConfig);
      } catch (error) {
        console.warn(
          `Failed to create work dropdown for ${workDropdownConfig.inputId}:`,
          error,
        );
      }
    }
  }
}

function refreshWorkDropdownOptions(): void {
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";

  let source = allPodlegleData;
  if (selectedName) {
    source = source.filter((r) => r.name === selectedName);
  }

  const works = new Set<string>();
  source.forEach((r) => {
    if (r.work?.trim()) works.add(r.work.trim());
  });

  if (workSmartDropdown) {
    workSmartDropdown.updateItems(Array.from(works));
  }
}

// 🔹 Оновлення випадаючого списку номерів актів
function refreshActDropdownOptions(): void {
  const actSelect = byId<HTMLSelectElement>("Bukhhalter-podlegle-act-select");
  if (!actSelect) return;

  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";

  let source = allPodlegleData;
  if (selectedName) {
    source = source.filter((r) => r.name === selectedName);
  }

  const actNumbers = new Set<string>();
  source.forEach((r) => {
    if (r.act && r.act.trim() && r.act.trim() !== "-") {
      actNumbers.add(r.act.trim());
    }
  });

  const previousValue = actSelect.value;
  actSelect.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Всі";
  actSelect.appendChild(emptyOption);

  // Сортуємо номери актів за спаданням (найбільший зверху)
  const sortedActs = Array.from(actNumbers).sort((a, b) => {
    const numA = parseInt(a) || 0;
    const numB = parseInt(b) || 0;
    return numB - numA;
  });

  sortedActs.forEach((actNum) => {
    const option = document.createElement("option");
    option.value = actNum;
    option.textContent = actNum;
    actSelect.appendChild(option);
  });

  // Відновлюємо попереднє значення, якщо воно є в оновленому списку
  if (previousValue && sortedActs.includes(previousValue)) {
    actSelect.value = previousValue;
  } else {
    actSelect.value = "";
  }
}

function triggerPodlegleAutoFilter(): void {
  if (hasPodlegleDataLoaded) {
    // коли дані вже є — фільтруємо локально без звернення в базу
    debouncePodlegleAutoSearch(() => {
      filterPodlegleData();
    });
  } else {
    // коли даних ще немає — ініціюємо первинне завантаження
    debouncePodlegleAutoSearch(() => {
      void autoSearchPodlegleFromInputs();
    });
  }
}

// [НОВИЙ КОД]
async function autoSearchPodlegleFromInputs(): Promise<void> {
  const dateOpen =
    byId<HTMLInputElement>("Bukhhalter-podlegle-date-open")?.value || "";
  const dateClose =
    byId<HTMLInputElement>("Bukhhalter-podlegle-date-close")?.value || "";
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";
  const workInput =
    byId<HTMLInputElement>("Bukhhalter-podlegle-work-input")?.value.trim() ||
    "";

  if (!dateOpen && !dateClose && !selectedName && !workInput) {
    return;
  }

  // ▼▼▼ ЗМІНА: Додано блок оновлення даних (якщо потрібно) ▼▼▼
  // (Якщо ми розширюємо діапазон дат, треба перезавантажити дані)
  if (
    !hasPodlegleDataLoaded ||
    dateOpen < lastSearchDateOpen ||
    (dateClose && dateClose > (lastSearchDateClose || todayIso()))
  ) {
    showNotification("🔄 Оновлення даних...", "info", 1500);
    await loadSlyusarsData();
    if (slyusarsData.length === 0) {
      showNotification("⚠️ Не вдалося завантажити дані.", "error", 3000);
      return;
    }
  } else {
  }
  // ▲▲▲ Кінець блоку змін ▲▲▲

  searchDataInDatabase(dateOpen, dateClose, selectedName);

  allPodlegleData = [...podlegleData];
  hasPodlegleDataLoaded = true;
  ensureWorkSmartDropdown();
  refreshWorkDropdownOptions();
  refreshActDropdownOptions();

  updatepodlegleTable();
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

    const modalContent = document.createElement("div");
    modalContent.className = "login-modal-content";

    // Плаваюча іконка
    const icon = document.createElement("span");
    icon.className = "login-modal-icon";
    icon.textContent = "🔐";

    const title = document.createElement("h3");
    title.className = "login-modal-title";
    title.textContent =
      action === "pay"
        ? "Підтвердження розрахунку"
        : "Підтвердження скасування";

    const description = document.createElement("p");
    description.className = "login-modal-subtitle";
    description.textContent = "Введіть пароль для підтвердження";

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "••••••••";
    input.className = "login-input";
    input.autocomplete = "current-password";

    const errorDiv = document.createElement("div");
    errorDiv.className = "login-error-message";
    errorDiv.style.display = "none";

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `display: flex; gap: 12px; justify-content: center; margin-top: 16px;`;

    // Скасувати — ЗЛІВА
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Скасувати";
    cancelButton.className = "login-button";
    cancelButton.style.cssText = `flex: 1; margin-top: 0; background: linear-gradient(135deg, #94a3b8 0%, #a1b0c4 100%); box-shadow: 0 3px 12px rgba(148, 163, 184, 0.25), 0 1px 3px rgba(0, 0, 0, 0.06);`;

    // Підтвердити — СПРАВА
    const confirmButton = document.createElement("button");
    confirmButton.textContent = "Підтвердити";
    confirmButton.className = "login-button";
    confirmButton.style.cssText = `flex: 1; margin-top: 0;`;

    // Shake-анімація помилки
    const showModalError = (message: string) => {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
      input.classList.remove("input-error");
      void input.offsetWidth;
      input.classList.add("input-error");
      setTimeout(() => input.classList.remove("input-error"), 600);
    };

    confirmButton.addEventListener("click", async () => {
      const inputPassword = input.value.trim();
      if (!inputPassword) {
        showModalError("Введіть пароль");
        input.focus();
        return;
      }

      const savedData = getSavedUserDataFromLocalStorage();
      if (!savedData) {
        showModalError("Не знайдено дані користувача");
        return;
      }

      if (inputPassword === savedData.password) {
        // Анімація успіху
        icon.textContent = "✅";
        icon.classList.add("login-success-anim");
        title.textContent = "Підтверджено!";
        title.style.color = "#4ade80";
        input.classList.add("input-success");
        confirmButton.innerHTML = "✓ Успішно";
        confirmButton.style.background = "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";
        setTimeout(() => { modal.remove(); resolve(true); }, 500);
      } else {
        showModalError("Невірний пароль");
        input.focus();
        input.select();
      }
    });

    cancelButton.addEventListener("click", () => {
      modal.remove();
      resolve(false);
    });

    input.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        confirmButton.click();
      }
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        modal.remove();
        resolve(false);
      }
    };
    document.addEventListener("keydown", handleEscape);

    const originalRemove = modal.remove;
    modal.remove = function () {
      document.removeEventListener("keydown", handleEscape);
      originalRemove.call(this);
    };

    buttonsContainer.appendChild(cancelButton);
    buttonsContainer.appendChild(confirmButton);

    modalContent.appendChild(icon);
    modalContent.appendChild(title);
    modalContent.appendChild(description);
    modalContent.appendChild(input);
    modalContent.appendChild(errorDiv);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);
    setTimeout(() => input.focus(), 100);
  });
}

export async function loadSlyusarsData(): Promise<void> {
  try {
    // 🔹 Паралельно завантажуємо slyusars та acts.date_off
    const [slyusarsResult, actsResult] = await Promise.all([
      supabase.from("slyusars").select("*"),
      supabase.from("acts").select("act_id, date_off"),
    ]);

    const { data, error } = slyusarsResult;

    // 🔹 Завантажуємо дати закриття актів в map
    if (actsResult.data && Array.isArray(actsResult.data)) {
      actsDateOffMap.clear();
      actsResult.data.forEach(
        (act: { act_id: number; date_off: string | null }) => {
          if (act.date_off) {
            actsDateOffMap.set(String(act.act_id), act.date_off);
          }
        },
      );
    }

    if (error) {
      console.error("Помилка Supabase:", error);
      throw new Error(`Помилка завантаження: ${error.message}`);
    }

    if (data && Array.isArray(data)) {
      slyusarsData = data
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

            // Кешуємо ПроцентРоботи для слюсаря
            if (
              parsedData.Name &&
              typeof parsedData.ПроцентРоботи === "number"
            ) {
              slyusarPercentCache.set(
                parsedData.Name.toLowerCase(),
                parsedData.ПроцентРоботи,
              );
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
        .filter((item) => item !== null);

      updateNamesList();
    } else {
      throw new Error(
        "Невірний формат даних з Supabase: дані не є масивом або порожні",
      );
    }
  } catch (error) {
    let errorMessage = "Невідома помилка";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    showNotification(
      `⚠️ Не вдалося завантажити дані з бази: ${errorMessage}. Перевірте підключення до сервера або налаштування Supabase.`,
      "error",
      5000,
    );
    slyusarsData = [];
    availableNames = [];
    createNameSelect();
  }
}

async function saveSlyusarsDataToDatabase(): Promise<void> {
  try {
    showNotification("💾 Збереження змін в базу...", "info", 2000);

    const { data: existingData, error: fetchError } = await supabase
      .from("slyusars")
      .select("*");

    if (fetchError) {
      console.error("Помилка отримання даних:", fetchError);
      throw new Error(`Помилка отримання даних: ${fetchError.message}`);
    }

    // ✅ ВИПРАВЛЕНО: Додано правильний ключ slyusar_id
    const primaryKeyCandidates = [
      "slyusar_id",
      "id",
      "slyusars_id",
      "uid",
      "pk",
    ];
    const detectPrimaryKey = (row: any): string | null => {
      if (!row) return null;
      for (const k of primaryKeyCandidates) if (k in row) return k;
      return null;
    };
    const primaryKey = detectPrimaryKey(existingData?.[0]);

    // ✅ ОПТИМІЗАЦІЯ: Збираємо всі оновлення в масив промісів
    const updatePromises: Promise<any>[] = [];

    for (const slyusar of slyusarsData) {
      const target = existingData?.find((item) => {
        let js = item.data;
        if (typeof js === "string") {
          try {
            js = JSON.parse(js);
          } catch {
            /* ignore */
          }
        }
        return js && js.Name === slyusar.Name;
      });

      if (!target) {
        console.warn(`Не знайдено запис для слюсаря: ${slyusar.Name}`);
        continue;
      }

      if (primaryKey) {
        const updatePromise = (async () => {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .eq(primaryKey, target[primaryKey])
            .select();
          if (updErr) {
            console.error(`Помилка оновлення ${slyusar.Name}:`, updErr);
            throw updErr;
          }
          return upd;
        })();

        updatePromises.push(updatePromise);
      } else {
        const updatePromise = (async () => {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .contains("data", { Name: slyusar.Name })
            .select();
          if (updErr) {
            console.error(
              `Помилка оновлення (fallback) ${slyusar.Name}:`,
              updErr,
            );
            throw updErr;
          }
          return upd;
        })();

        updatePromises.push(updatePromise);
      }
    }

    // ✅ Чекаємо завершення ВСІХ оновлень
    await Promise.all(updatePromises);

    showNotification("✅ Дані успішно збережено в базу", "success");
  } catch (error) {
    console.error("❌ Помилка збереження в базу slyusars:", error);
    let errorMessage = "Невідома помилка";
    if (error instanceof Error) errorMessage = error.message;
    else if (typeof error === "object" && error !== null)
      errorMessage = JSON.stringify(error);

    showNotification(
      `⚠️ Помилка збереження в базу даних: ${errorMessage}. Зміни можуть не зберегтися.`,
      "error",
      5000,
    );
    throw error;
  }
}

function updateNamesList(): void {
  const namesSet = new Set<string>();
  slyusarsData.forEach((item) => {
    if (item.Name) namesSet.add(item.Name);
  });
  availableNames = Array.from(namesSet).sort();
  createNameSelect();
}

export function createNameSelect(): void {
  try {
    const select = byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select");
    if (!select) return; // Added null check

    select.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Оберіть ПІБ (або залиште порожнім для всіх)";
    select.appendChild(emptyOption);

    availableNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    select.addEventListener("change", (event) => {
      const selectedName = (event.target as HTMLSelectElement).value;

      // ✅ ВИПРАВЛЕННЯ БАГ №2: ЗАВЖДИ оновлюємо дані при зміні імені
      // Раніше оновлення відбувалось тільки якщо hasDataForAllEmployees === true
      if (lastSearchDateOpen || lastSearchDateClose) {
        searchDataInDatabase(
          lastSearchDateOpen,
          lastSearchDateClose,
          selectedName,
        );

        // Оновлюємо таблицю після пошуку
        updatepodlegleTable();
      }

      refreshWorkDropdownOptions();
      refreshActDropdownOptions();
    });
  } catch (error) { }
}

export function getFilteredpodlegleData(): PodlegleRecord[] {
  let filteredData = podlegleData;

  // ✅ ВИПРАВЛЕННЯ БАГ №1: Фільтрація по вибраному імені з селекту
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";
  if (selectedName) {
    filteredData = filteredData.filter((item) => item.name === selectedName);
  }

  // ✅ Фільтрація по номеру акту
  const selectedAct =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-act-select")?.value || "";
  if (selectedAct) {
    filteredData = filteredData.filter((item) => item.act === selectedAct);
  }

  if (currentPaymentFilter === "paid") {
    filteredData = filteredData.filter((item) => item.isPaid);
  } else if (currentPaymentFilter === "unpaid") {
    filteredData = filteredData.filter((item) => !item.isPaid);
  }

  if (currentStatusFilter === "closed") {
    filteredData = filteredData.filter((item) => item.isClosed);
  } else if (currentStatusFilter === "open") {
    filteredData = filteredData.filter((item) => !item.isClosed);
  }

  // Фільтр по відсоткам зарплати (тільки записи зі стрілками)
  if (
    currentPercentageFilter === "higher" ||
    currentPercentageFilter === "lower"
  ) {
    filteredData = filteredData.filter((item) => {
      // Фільтруємо тільки прості записи робіт (не приймальників)
      // Приймальники мають customHtmlTotal, а прості записи - ні
      if (item.customHtmlTotal) {
        return false; // Виключаємо приймальників з фільтрації
      }

      const actualSalaryPercent =
        item.total > 0 ? (item.salary / item.total) * 100 : 0;
      const configuredPercent = getSlyusarPercentByName(item.name);

      if (configuredPercent === 0 || item.salary === 0) {
        return false; // Не показувати записи без налаштованого відсотка або зарплати
      }

      if (currentPercentageFilter === "higher") {
        return actualSalaryPercent > configuredPercent; // Червона стрілка вверх
      } else {
        return actualSalaryPercent < configuredPercent; // Синя стрілка вниз
      }
    });
  }

  return filteredData;
}

// Функція для розрахунку суми зарплат
export function calculatePodlegleSalaryTotal(): number {
  const filteredData = getFilteredpodlegleData();
  return filteredData.reduce((sum, item) => sum + (item.salary || 0), 0);
}

// Функція для розрахунку маржі
export function calculatePodlegleMarginTotal(): number {
  const filteredData = getFilteredpodlegleData();
  return filteredData.reduce((sum, item) => sum + (item.margin || 0), 0);
}

// Функція для оновлення відображення суми для співробітників
export function updatePodlegleDisplayedSums(): void {
  const totalSumElement = byId<HTMLElement>("total-sum");

  if (!totalSumElement) {
    console.warn("Елемент total-sum не знайдено");
    return;
  }

  const filteredData = getFilteredpodlegleData();

  let totalRevenue = 0;
  let totalSalary = 0;
  let totalMargin = 0;

  if (filteredData.length > 0) {
    totalRevenue = filteredData.reduce(
      (sum, item) => sum + (item.total || 0),
      0,
    );
    totalSalary = calculatePodlegleSalaryTotal();
    totalMargin = totalRevenue - totalSalary; // Виправлено: тепер margin = revenue - salary
  }

  const marginSign = totalMargin >= 0 ? "+" : "";

  totalSumElement.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 15px; font-size: 1.1em;">
      <span>Сума <strong style="color: #333;">💰 ${formatNumber(
    totalRevenue,
  )}</strong> грн</span>
      <span style="color: #666;">-</span>
      <span><strong style="color: #8B0000;">💶 ${formatNumber(
    totalSalary,
  )}</strong> грн</span>
      <span style="color: #666;">=</span>
      <span><strong style="color: ${totalMargin >= 0 ? "#006400 " : "#8B0000"
    };">📈 ${marginSign}${formatNumber(totalMargin)}</strong> грн</span>
    </div>
  `;
}

export function updatepodlegleTable(): void {
  const tbody = byId<HTMLTableSectionElement>("podlegle-tbody");
  if (!tbody) {
    return;
  }

  const filteredData = getFilteredpodlegleData();

  if (filteredData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="13" class="Bukhhalter-no-data">Немає даних для відображення</td></tr>';
    updatePodlegleDisplayedSums();
    return;
  }

  tbody.innerHTML = filteredData
    .map((item, index) => {
      const originalIndex = podlegleData.indexOf(item);

      // ▼▼▼ ПОЧАТОК ВИПРАВЛЕННЯ ▼▼▼

      // 1. Клас для СТАТУСУ АКТУ (isClosed)
      const rowClass = item.isClosed ? "closed-row" : "open-row";

      // 1. Колір фону рядка (Закритий -> Зелений, Відкритий -> Червоний)
      const rowBackgroundColor = item.isClosed
        ? "rgba(212, 237, 218, 0.6)" // Зеленуватий
        : "rgba(248, 215, 218, 0.6)"; // Червонуватий

      // 2. Клас для КОЛЬОРУ РЯДКА (залежить ТІЛЬКИ від isClosed, як ви просили)
      //    (Червоний, якщо NULL (відкритий), Зелений, якщо НЕ NULL (закритий))
      const paidClass = item.isClosed ? "paid-row" : "unpaid-row";

      // 3. Клас і текст для КНОПКИ (залежить ТІЛЬКИ від isPaid / entry.Розраховано)
      const buttonPaidClass = item.isPaid ? "paid" : "unpaid";
      const paymentButtonText = item.isPaid
        ? `💰 ${item.paymentDate || "Розраховано"}`
        : "💲 Не розраховано";

      // ▲▲▲ КІНЕЦЬ ВИПРАВЛЕННЯ ▲▲▲

      const marginColor = item.margin >= 0 ? "#28a745" : "#dc3545";
      const marginSign = item.margin >= 0 ? "+" : "";

      // Обчислюємо фактичний відсоток зарплати від загальної суми
      const actualSalaryPercent =
        item.total > 0 ? (item.salary / item.total) * 100 : 0;
      // Отримуємо налаштований відсоток слюсаря з кешу
      const configuredPercent = getSlyusarPercentByName(item.name);

      // Визначаємо стрілку для порівняння процентів
      let salaryArrowHtml = "";
      if (configuredPercent > 0 && item.salary > 0) {
        // Розраховуємо різницю в гривнях: очікувана зарплата - фактична зарплата
        const expectedSalary = (item.total * configuredPercent) / 100;
        const salaryDifference = item.salary - expectedSalary;
        const diffSign = salaryDifference >= 0 ? "+" : "";
        const diffText = `${actualSalaryPercent.toFixed(1)}% з ${configuredPercent}% (${diffSign}${Math.round(salaryDifference)} грн)`;

        if (actualSalaryPercent > configuredPercent) {
          // Процент зарплати більший ніж налаштований - темно червона стрілка вверх
          salaryArrowHtml = `<span class="salary-arrow-up" title="${diffText}">🡱</span>`;
        } else if (actualSalaryPercent < configuredPercent) {
          // Процент зарплати менший ніж налаштований - синя стрілка вниз
          salaryArrowHtml = `<span class="salary-arrow-down" title="${diffText}">🡳</span>`;
        }
      }

      // ✅ Якщо є customHtmlTotal - використовуємо його, інакше стандартний
      const totalHtml = item.customHtmlTotal
        ? item.customHtmlTotal
        : `
        <div class="salary-cell-wrapper">
          <div class="salary-cell-numbers">
            <div style="font-size: 0.95em; font-weight: 600; color: #000;">${formatNumber(
          item.total,
        )}</div>
            <div style="font-size: 0.85em; color: #dc3545; margin-top: 2px;">-${formatNumber(
          item.salary,
        )}</div>
            <div style="font-size: 0.9em; color: ${marginColor}; font-weight: 500; margin-top: 2px;">${marginSign}${formatNumber(
          item.margin,
        )}</div>
          </div>
          ${salaryArrowHtml
          ? `<div class="salary-arrow-container">${salaryArrowHtml}</div>`
          : ""
        }
        </div>
      `;

      return `
                <tr class="${rowClass} ${paidClass}" style="background-color: ${rowBackgroundColor};" onclick="handleRowClick(${index})">
                    <td>
                             <button class="Bukhhalter-payment-btn ${buttonPaidClass}"
                                onclick="event.stopPropagation(); togglepodleglePaymentWithConfirmation(${originalIndex})" 
                                title="${item.isPaid
          ? `Розраховано ${item.paymentDate || ""}`
          : "Не розраховано"
        }">
                            ${paymentButtonText}
                        </button>
                    </td>
                    <td>${formatDate(item.dateOpen)}</td>
                    <td>${formatDate(item.dateClose) || "-"}</td>
                    <td>${item.recordedDate || "-"}</td> <!-- ✅ Додано колонку "Додано" -->
                    <td>${item.name || "-"}</td>
                    <td>
                     <button class="Bukhhalter-act-btn"
                             onclick="event.stopPropagation(); openActModalWithClient(${Number(item.act) || 0
        })"
                             title="Відкрити акт №${item.act}">
                       📋 ${item.act || "-"}
                     </button>
                   </td>

                    <td>${item.client || "-"}</td>
                    <td>${item.automobile || "-"}</td>
                    <td>${item.work || "-"}</td>
                    <td>${item.quantity || "-"}</td>
                    <td>${item.price ? formatNumber(item.price) : "-"}</td>
                    <td style="padding: 8px; min-width: 220px; white-space: nowrap;">
                      ${totalHtml}
                    </td>
                    <td><button class="Bukhhalter-delete-btn" onclick="event.stopPropagation(); deleteRecord('podlegle', ${originalIndex})">🗑️</button></td>
                </tr>
            `;
    })
    .join("");

  updatePodlegleDisplayedSums();
}

// ==== DATE HELPERS (додай один раз у файлі) ====

function toIsoDate(input: string | null | undefined): string {
  if (!input) return "";
  // 1) нормалізуємо і викидаємо все зайве (емодзі, текст, тощо)
  const s = String(input)
    .normalize("NFKC")
    .trim()
    .replace(/[^\d.\-\/]/g, ""); // лишаємо тільки цифри і роздільники . - /

  if (!s) return "";

  // 2) Підтримка YMD: YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2, "0");
    const dd = m[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // 3) Підтримка DMY: DD.MM.YYYY / DD-MM-YYYY / DD/MM/YY
  m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) {
      // евристика: 70–99 -> 19xx, інакше -> 20xx
      yyyy = (+yyyy >= 70 ? "19" : "20") + yyyy;
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
  if (!t) return false; // якщо дата в полі була "💰 31.10.2025" або інший шум — тепер парситься
  const f = fromDmy ? toIsoDate(fromDmy) : ""; // приймає і "28.10.2025", і "2025-10-28"
  const to = toDmy ? toIsoDate(toDmy) : todayIso();
  return (!f || t >= f) && (!to || t <= to);
}

// ЗАМІНИТИ ПОВНІСТЮ функцію searchDataInDatabase:
export function searchDataInDatabase(
  dateOpen: string,
  dateClose: string,
  selectedName: string,
): void {
  podlegleData = [];
  if (!dateOpen && !dateClose) {
    dateOpen = "01.01.2020"; // ✅ ВИПРАВЛЕНО: використовуємо більш ранню дату за замовчуванням
  }
  if (slyusarsData.length === 0) {
    showNotification(
      "⚠️ Немає даних з бази slyusars. Спробуйте перезавантажити сторінку.",
      "warning",
    );
    updatepodlegleTable();
    return;
  }

  lastSearchDateOpen = dateOpen;
  lastSearchDateClose = dateClose;

  const toIsoClose = dateClose || todayIso();

  slyusarsData.forEach((slyusar) => {
    if (selectedName && slyusar.Name !== selectedName) return;

    Object.keys(slyusar.Історія).forEach((openDmy) => {
      slyusar.Історія[openDmy].forEach((record) => {
        // 1. ЛОГІКА ДЛЯ СЛЮСАРІВ (з масивом Записи)
        if (
          record.Записи &&
          Array.isArray(record.Записи) &&
          record.Записи.length > 0
        ) {
          if (podlegleDateFilterMode === "paid") {
            record.Записи.forEach((entry, entryIndex) => {
              // ✅ ВИПРАВЛЕНО: Якщо кількість 0, але є зарплата - показуємо запис!
              if (
                entry.Кількість === 0 &&
                (!entry.Зарплата || entry.Зарплата === 0)
              )
                return;

              const payDmy = entry.Розраховано || "";
              if (!payDmy) return;
              if (!inRangeByIso(payDmy, dateOpen, toIsoClose)) return;

              const totalPrice = entry.Ціна * entry.Кількість;
              const salary = entry.Зарплата || 0;
              podlegleData.push({
                dateOpen: openDmy,
                dateClose: getActDateClose(record.Акт, record.ДатаЗакриття),
                name: slyusar.Name,
                act: record.Акт,
                client: String(record.Клієнт || ""),
                automobile: String(record.Автомобіль || ""),
                work: String(entry.Робота || ""),
                quantity: entry.Кількість,
                price: entry.Ціна,
                total: totalPrice,
                salary,
                margin: totalPrice - salary,
                isClosed: isActClosed(record.Акт, record.ДатаЗакриття), // ✅ ВИПРАВЛЕНО: беремо з acts.date_off
                isPaid: true,
                paymentDate: payDmy,
                recordedDate: entry.Записано || "", // ✅ Додано
                workIndex: entryIndex, // ✅ Додано: індекс для точного пошуку
                recordId: entry.recordId, // ✅ Додано: унікальний ID
              });
            });
          } else {
            const targetDmy =
              podlegleDateFilterMode === "close"
                ? getActDateClose(record.Акт, record.ДатаЗакриття)
                : openDmy;
            if (!targetDmy) return;
            if (!inRangeByIso(targetDmy, dateOpen, toIsoClose)) return;

            record.Записи.forEach((entry, entryIndex) => {
              // ✅ ВИПРАВЛЕНО: Якщо кількість 0, але є зарплата - показуємо запис!
              if (
                entry.Кількість === 0 &&
                (!entry.Зарплата || entry.Зарплата === 0)
              )
                return;

              const totalPrice = entry.Ціна * entry.Кількість;
              const salary = entry.Зарплата || 0;
              podlegleData.push({
                dateOpen: openDmy,
                dateClose: getActDateClose(record.Акт, record.ДатаЗакриття),
                name: slyusar.Name,
                act: record.Акт,
                client: String(record.Клієнт || ""),
                automobile: String(record.Автомобіль || ""),
                work: String(entry.Робота || ""),
                quantity: entry.Кількість,
                price: entry.Ціна,
                total: totalPrice,
                salary,
                margin: totalPrice - salary,
                isClosed: isActClosed(record.Акт, record.ДатаЗакриття), // ✅ ВИПРАВЛЕНО: беремо з acts.date_off
                isPaid: !!entry.Розраховано,
                paymentDate: entry.Розраховано || "",
                recordedDate: entry.Записано || "", // ✅ Додано
                workIndex: entryIndex, // ✅ Додано: індекс для точного пошуку
                recordId: entry.recordId, // ✅ Додано: унікальний ID
              });
            });
          }
        }

        // 2. ЛОГІКА ДЛЯ ПРИЙМАЛЬНИКІВ (без масиву Записи, але з сумами)
        else if (record.СуммаРоботи !== undefined) {
          const isPaid = !!record.Розраховано;
          const payDate = record.Розраховано || "";

          // Фільтр "paid"
          if (podlegleDateFilterMode === "paid") {
            if (!isPaid) return;
            if (!inRangeByIso(payDate, dateOpen, toIsoClose)) return;
          }
          // Фільтр "open/close"
          else {
            const targetDmy =
              podlegleDateFilterMode === "close"
                ? getActDateClose(record.Акт, record.ДатаЗакриття)
                : openDmy;
            if (!targetDmy) return;
            // Якщо close-mode і дата закриття пуста - пропускаємо
            if (podlegleDateFilterMode === "close" && !targetDmy) return;
            if (!inRangeByIso(targetDmy, dateOpen, toIsoClose)) return;
          }

          const sumWork = record.СуммаРоботи || 0;
          const sumParts = record.СуммаЗапчастин || 0;

          // ✅ ВИПРАВЛЕНО: Якщо сума від'ємна → зарплата = 0
          const salaryWork = sumWork > 0 ? record.ЗарплатаРоботи || 0 : 0;
          const salaryParts = sumParts > 0 ? record.ЗарплатаЗапчастин || 0 : 0;

          const totalSum = sumWork + sumParts;
          const totalSalary = salaryWork + salaryParts;

          // Дані вже збережені з урахуванням знижки, тому просто показуємо їх
          // sumWork та sumParts - це вже чистий прибуток після дисконту та зарплат
          const margin = totalSum;

          // ✅ ВИПРАВЛЕНО: Виводимо суму мінус зарплата приймальника
          // Для запчастин: виводимо sumParts - salaryParts
          const sumPartsAfterSalary = sumParts - salaryParts;
          // Для робіт: виводимо sumWork - salaryWork
          const sumWorkAfterSalary = sumWork - salaryWork;

          const customHtml = `
            <div style="font-size: 0.85em; line-height: 1.2; text-align: right;">
              ${salaryParts !== 0
              ? `<div style="color: #dc3545;">⚙️ -${formatNumber(salaryParts)}</div>`
              : sumParts < 0
                ? `<div style="color: #6c757d;">⚙️ 0</div>`
                : ""
            }
              ${sumPartsAfterSalary !== 0
              ? `<div style="color: ${sumPartsAfterSalary > 0 ? "#28a745" : "#dc3545"};">⚙️ ${sumPartsAfterSalary > 0 ? "+" : ""}${formatNumber(sumPartsAfterSalary)}</div>`
              : ""
            }
              ${salaryWork !== 0
              ? `<div style="color: #dc3545;">🛠️ -${formatNumber(salaryWork)}</div>`
              : sumWork < 0
                ? `<div style="color: #6c757d;">🛠️ 0</div>`
                : ""
            }
              ${sumWorkAfterSalary !== 0
              ? `<div style="color: ${sumWorkAfterSalary > 0 ? "#28a745" : "#dc3545"};">🛠️ ${sumWorkAfterSalary > 0 ? "+" : ""}${formatNumber(sumWorkAfterSalary)}</div>`
              : ""
            }
            </div>`;

          podlegleData.push({
            dateOpen: openDmy,
            dateClose: getActDateClose(record.Акт, record.ДатаЗакриття),
            name: slyusar.Name,
            act: record.Акт,
            client: String(record.Клієнт || ""),
            automobile: String(record.Автомобіль || ""),
            work: "-", // Пусто
            quantity: 0, // 0 або пусто
            price: 0,
            total: totalSum,
            salary: totalSalary,
            margin: margin,
            isClosed: isActClosed(record.Акт, record.ДатаЗакриття), // ✅ ВИПРАВЛЕНО: беремо з acts.date_off
            isPaid: isPaid,
            paymentDate: payDate,
            customHtmlTotal: customHtml,
          });
        }

        // 3. ЛОГІКА ДЛЯ ЗАПЧАСТИСТІВ (без СуммаРоботи, але з СуммаЗапчастин)
        else if (
          record.СуммаЗапчастин !== undefined &&
          record.СуммаРоботи === undefined
        ) {
          const isPaid = !!record.Розраховано;
          const payDate = record.Розраховано || "";

          // Фільтр "paid"
          if (podlegleDateFilterMode === "paid") {
            if (!isPaid) return;
            if (!inRangeByIso(payDate, dateOpen, toIsoClose)) return;
          }
          // Фільтр "open/close"
          else {
            const targetDmy =
              podlegleDateFilterMode === "close"
                ? getActDateClose(record.Акт, record.ДатаЗакриття)
                : openDmy;
            if (!targetDmy) return;
            if (podlegleDateFilterMode === "close" && !targetDmy) return;
            if (!inRangeByIso(targetDmy, dateOpen, toIsoClose)) return;
          }

          const sumParts = record.СуммаЗапчастин || 0;
          const salaryParts = sumParts > 0 ? record.ЗарплатаЗапчастин || 0 : 0;
          const profitAfterSalary = sumParts - salaryParts;

          // Формуємо HTML: червона зарплата, зелений чистий прибуток
          const customHtml = `
            <div style="font-size: 0.85em; line-height: 1.2; text-align: right;">
              ${salaryParts !== 0
              ? `<div style="color: #dc3545;">💰 -${formatNumber(salaryParts)}</div>`
              : ""
            }
              ${profitAfterSalary !== 0
              ? `<div style="color: ${profitAfterSalary > 0 ? "#28a745" : "#dc3545"};">📊 ${profitAfterSalary > 0 ? "+" : ""}${formatNumber(profitAfterSalary)}</div>`
              : ""
            }
            </div>`;

          podlegleData.push({
            dateOpen: openDmy,
            dateClose: getActDateClose(record.Акт, record.ДатаЗакриття),
            name: slyusar.Name,
            act: record.Акт,
            client: String(record.Клієнт || ""),
            automobile: String(record.Автомобіль || ""),
            work: "Запчастини", // Позначаємо як запчастини
            quantity: 0,
            price: 0,
            total: sumParts,
            salary: salaryParts,
            margin: profitAfterSalary,
            isClosed: isActClosed(record.Акт, record.ДатаЗакриття),
            isPaid: isPaid,
            paymentDate: payDate,
            customHtmlTotal: customHtml,
          });
        }
      });
    });
  });

  // Фільтр по роботі - для приймальників work = "-", тому вони можуть відсіятись, якщо юзер щось ввів
  const workInput =
    byId<HTMLInputElement>("Bukhhalter-podlegle-work-input")?.value.trim() ||
    "";
  if (workInput) {
    // const beforeFilter = podlegleData.length;
    podlegleData = podlegleData.filter((record) =>
      (record.work || "").toLowerCase().includes(workInput.toLowerCase()),
    );
  }

  podlegleData.sort((a, b) => {
    const actA = parseInt(a.act) || 0;
    const actB = parseInt(b.act) || 0;
    if (actA !== actB) return actB - actA;

    const ka =
      podlegleDateFilterMode === "paid"
        ? toIsoDate(a.paymentDate || a.dateOpen)
        : toIsoDate(a.dateOpen);
    const kb =
      podlegleDateFilterMode === "paid"
        ? toIsoDate(b.paymentDate || b.dateOpen)
        : toIsoDate(b.dateOpen);
    return kb.localeCompare(ka);
  });

  notificationHelperInSearch(
    podlegleData.length,
    selectedName,
    dateOpen,
    dateClose,
    workInput,
  );

  allPodlegleData = [...podlegleData];
  hasPodlegleDataLoaded = true;
  ensureWorkSmartDropdown();
  refreshWorkDropdownOptions();
  refreshActDropdownOptions();
  updatepodlegleTable();
}

// Helper to keep notifications clean
function notificationHelperInSearch(
  count: number,
  name: string,
  dOpen: string,
  dClose: string,
  wInput: string,
) {
  const modeLabels = {
    open: "відкриття",
    close: "закриття",
    paid: "розрахунку" as const,
  };
  let dateFilterMessage = "";
  if (!dOpen && !dClose)
    dateFilterMessage = ` (всі дати ${modeLabels[podlegleDateFilterMode]})`;
  else if (dOpen && !dClose)
    dateFilterMessage = ` (${modeLabels[podlegleDateFilterMode]}: з ${dOpen} до сьогодні)`;
  else if (!dOpen && dClose)
    dateFilterMessage = ` (${modeLabels[podlegleDateFilterMode]}: до ${dClose} включно)`;
  else
    dateFilterMessage = ` (${modeLabels[podlegleDateFilterMode]}: з ${dOpen} до ${dClose})`;

  if (wInput) dateFilterMessage += ` | робота: "${wInput}"`;
  const filterMessage = name ? ` для ${name}` : "";

  showNotification(
    count > 0
      ? `✅ Знайдено ${count} записів${filterMessage}${dateFilterMessage}`
      : `ℹ️ Записів не знайдено${filterMessage}${dateFilterMessage}`,
    count > 0 ? "success" : "info",
  );
}

// Функція для локальної фільтрації завантажених даних
export function filterPodlegleData(): void {
  if (!hasPodlegleDataLoaded || allPodlegleData.length === 0) {
    podlegleData = [];
    updatepodlegleTable();
    showNotification(
      "ℹ️ Записів не знайдено за поточним фільтром",
      "info",
      2000,
    );
    return;
  }

  const dateOpen =
    byId<HTMLInputElement>("Bukhhalter-podlegle-date-open")?.value || "";
  const dateClose =
    byId<HTMLInputElement>("Bukhhalter-podlegle-date-close")?.value || "";
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";
  const workInput =
    byId<HTMLInputElement>("Bukhhalter-podlegle-work-input")?.value.trim() ||
    "";

  let filtered = [...allPodlegleData];

  if (selectedName) {
    filtered = filtered.filter((r) => r.name === selectedName);
  }

  if (podlegleDateFilterMode === "close") {
    filtered = filtered.filter((r) => r.dateClose);
  } else if (podlegleDateFilterMode === "paid") {
    filtered = filtered.filter((r) => r.paymentDate);
  }

  if (dateOpen || dateClose) {
    const toIsoClose = dateClose || todayIso();
    filtered = filtered.filter((r) => {
      let targetDate = "";
      switch (podlegleDateFilterMode) {
        case "close":
          targetDate = r.dateClose || "";
          break;
        case "paid":
          targetDate = r.paymentDate || "";
          break;
        case "open":
        default:
          targetDate = r.dateOpen;
          break;
      }
      if (!targetDate) return false;
      return inRangeByIso(targetDate, dateOpen, toIsoClose);
    });
  }

  if (workInput) {
    filtered = filtered.filter((record) =>
      (record.work || "").toLowerCase().includes(workInput.toLowerCase()),
    );
  }

  // 🔹 Фільтр по номеру акту
  const selectedAct =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-act-select")?.value || "";
  if (selectedAct) {
    filtered = filtered.filter((record) => record.act === selectedAct);
  }

  filtered.sort((a, b) => {
    // Спочатку сортуємо за номером акту (більший номер - вище)
    const actA = parseInt(a.act) || 0;
    const actB = parseInt(b.act) || 0;

    if (actA !== actB) {
      return actB - actA; // Зворотний порядок: 300 > 299 > 298
    }

    // Якщо акти однакові, сортуємо за датою
    const ka =
      podlegleDateFilterMode === "paid"
        ? toIsoDate(a.paymentDate || a.dateOpen)
        : toIsoDate(a.dateOpen);
    const kb =
      podlegleDateFilterMode === "paid"
        ? toIsoDate(b.paymentDate || b.dateOpen)
        : toIsoDate(b.dateOpen);
    return kb.localeCompare(ka);
  });

  podlegleData = filtered;

  // ✅ якщо після фільтрації немає результатів — чиста таблиця + повідомлення
  if (filtered.length === 0) {
    updatepodlegleTable(); // це намалює "Немає даних для відображення"
    const modeLabel =
      podlegleDateFilterMode === "paid"
        ? "розрахунку"
        : podlegleDateFilterMode === "close"
          ? "закриття"
          : "відкриття";
    const datePart =
      !dateOpen && !dateClose
        ? ""
        : dateOpen && !dateClose
          ? ` (з ${dateOpen} до сьогодні)`
          : !dateOpen && dateClose
            ? ` (до ${dateClose} включно)`
            : ` (з ${dateOpen} до ${dateClose})`;

    const workPart = workInput ? ` | робота: "${workInput}"` : "";
    const namePart = selectedName ? ` для ${selectedName}` : "";

    showNotification(
      `ℹ️ Записів не знайдено${namePart} (${modeLabel})${datePart}${workPart}`,
      "info",
      2500,
    );
    return;
  }

  updatepodlegleTable();
}

// Глобальна змінна для зберігання поточного фільтра дат
let podlegleDateFilterMode: "open" | "close" | "paid" = "open";

// Функція для ініціалізації перемикача фільтрації дат для підлеглих
function initPodlegleDateFilterToggle(): void {
  const toggleContainer = document.querySelector(
    "#Bukhhalter-podlegle-section .Bukhhalter-date-filter-toggle",
  );
  if (!toggleContainer) return;

  const buttons =
    toggleContainer.querySelectorAll<HTMLButtonElement>(".date-filter-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      buttons.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      podlegleDateFilterMode = this.dataset.filter as "open" | "close" | "paid";

      // ✅ ВИПРАВЛЕНО: Завжди використовуємо локальну фільтрацію
      if (hasPodlegleDataLoaded) {
        filterPodlegleData();
      } else {
        console.warn("⚠️ Дані ще не завантажені, натисніть 🔍 Пошук");
      }
    });
  });
}

export function createStatusToggle(): void {
  const toggle = byId<HTMLInputElement>("details-status-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент status-filter-toggle не знайдено в HTML");
    return;
  }

  // ✅ ДОДАНО: Обробник change
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

    if (hasPodlegleDataLoaded) {
      filterPodlegleData();
    } else {
      updatepodlegleTable();
    }
  });

  // ✅ ЗАЛИШАЄМО: Обробник input (для сумісності)
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

    if (hasPodlegleDataLoaded) {
      filterPodlegleData();
    } else {
      updatepodlegleTable();
    }
  });
}

export function createPaymentToggle(): void {
  const toggle = byId<HTMLInputElement>("payment-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент payment-filter-toggle не знайдено в HTML");
    return;
  }

  // ✅ ДОДАНО: Обробник change
  toggle.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    switch (value) {
      case "0":
        currentPaymentFilter = "paid";
        break;
      case "1":
        currentPaymentFilter = "unpaid";
        break;
      case "2":
      default:
        currentPaymentFilter = "all";
        break;
    }

    if (hasPodlegleDataLoaded) {
      filterPodlegleData();
    } else {
      updatepodlegleTable();
    }
  });

  // ✅ ЗАЛИШАЄМО: Обробник input (для сумісності)
  toggle.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    switch (value) {
      case "0":
        currentPaymentFilter = "paid";
        break;
      case "1":
        currentPaymentFilter = "unpaid";
        break;
      case "2":
      default:
        currentPaymentFilter = "all";
        break;
    }

    if (hasPodlegleDataLoaded) {
      filterPodlegleData();
    } else {
      updatepodlegleTable();
    }
  });
}

export function createPercentageToggle(): void {
  const toggle = byId<HTMLInputElement>("percentage-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент percentage-filter-toggle не знайдено в HTML");
    return;
  }

  // Обробник change
  toggle.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    switch (value) {
      case "0":
        currentPercentageFilter = "lower";
        break;
      case "1":
        currentPercentageFilter = "higher";
        break;
      case "2":
      default:
        currentPercentageFilter = "all";
        break;
    }

    if (hasPodlegleDataLoaded) {
      filterPodlegleData();
    } else {
      updatepodlegleTable();
    }
  });

  // Обробник input (для сумісності)
  toggle.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    switch (value) {
      case "0":
        currentPercentageFilter = "lower";
        break;
      case "1":
        currentPercentageFilter = "higher";
        break;
      case "2":
      default:
        currentPercentageFilter = "all";
        break;
    }

    if (hasPodlegleDataLoaded) {
      filterPodlegleData();
    } else {
      updatepodlegleTable();
    }
  });
}

// [НОВИЙ КОД]
export async function handlepodlegleAddRecord(): Promise<void> {
  // 🔐 Перевіряємо доступ до сторінки перед пошуком
  const hasAccess = await checkCurrentPageAccess();

  if (!hasAccess) {
    redirectToIndex();
    return;
  }

  // <--- ЗМІНА 1: (async)
  const dateOpen = byId<HTMLInputElement>(
    "Bukhhalter-podlegle-date-open",
  ).value;
  const dateClose = byId<HTMLInputElement>(
    "Bukhhalter-podlegle-date-close",
  ).value;
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";

  // ▼▼▼ ЗМІНА 2: Додано примусове оновлення даних ▼▼▼
  showNotification("🔄 Оновлення даних слюсарів...", "info", 1500);
  await loadSlyusarsData(); // <-- !! ОСНОВНЕ ВИПРАВЛЕННЯ !!
  if (slyusarsData.length === 0) {
    showNotification(
      "⚠️ Не вдалося завантажити дані. Пошук неможливий.",
      "error",
      3000,
    );
    return;
  }
  // ▲▲▲ Кінець блоку змін ▲▲▲

  searchDataInDatabase(dateOpen, dateClose, selectedName); // <--- Тепер ця функція шукає по свіжих даних

  allPodlegleData = [...podlegleData];
  hasPodlegleDataLoaded = true;
  ensureWorkSmartDropdown();
  refreshWorkDropdownOptions();
  refreshActDropdownOptions();

  let searchInfo = "";
  if (!dateOpen && !dateClose) {
    searchInfo = "🔍 Завантажуємо всі записи з 01.01.2025";
  } else if (dateOpen && !dateClose) {
    searchInfo = `🔍 Пошук з ${dateOpen} до сьогодні`;
  } else if (!dateOpen && dateClose) {
    searchInfo = `🔍 Пошук всіх записів до ${dateClose}`;
  } else if (dateOpen && dateClose) {
    searchInfo = `🔍 Пошук в діапазоні ${dateOpen} - ${dateClose}`;
  }

  if (selectedName) {
    searchInfo += ` для ${selectedName}`;
  }
}

function initPodlegleDateAutoFilter(): void {
  const openEl = byId<HTMLInputElement>("Bukhhalter-podlegle-date-open");
  const closeEl = byId<HTMLInputElement>("Bukhhalter-podlegle-date-close");
  if (!openEl || !closeEl) return;

  const handler = () => {
    const newFromIso = toIsoDate(openEl.value); // новий "від"
    const newToIso = toIsoDate(closeEl.value); // новий "до"

    // що було завантажено востаннє
    const loadedFromIso = toIsoDate(lastSearchDateOpen) || "";
    const loadedToIso = toIsoDate(lastSearchDateClose) || todayIso(); // якщо не вказували "до", брали "сьогодні"

    // чи є дані вже в пам'яті
    if (!hasPodlegleDataLoaded) {
      // ще не завантажували — тягнемо з бази
      debouncePodlegleAutoSearch(() => {
        void autoSearchPodlegleFromInputs();
      });
      return;
    }

    // Визначаємо напрямок зміни:
    // звужуємо зліва: новий from >= завантаженого from
    const narrowsLeft =
      !!newFromIso && (!!loadedFromIso ? newFromIso >= loadedFromIso : true);
    // звужуємо справа: новий to <= завантаженого to
    const narrowsRight = !!newToIso && newToIso <= loadedToIso;

    // розширюємо зліва: новий from < завантаженого from
    const expandsLeft =
      !!newFromIso && (!!loadedFromIso ? newFromIso < loadedFromIso : false);
    // розширюємо справа: новий to > завантаженого to
    const expandsRight = !!newToIso && newToIso > loadedToIso;

    // якщо користувач звузив (від більша, або до менша) — фільтруємо локально
    if (narrowsLeft || narrowsRight) {
      debouncePodlegleAutoSearch(() => {
        filterPodlegleData();
      });
      return;
    }

    // якщо користувач розширив діапазон — дозавантажуємо з бази
    if (
      expandsLeft ||
      expandsRight ||
      (!newFromIso && loadedFromIso) ||
      (!newToIso && lastSearchDateClose)
    ) {
      debouncePodlegleAutoSearch(() => {
        void autoSearchPodlegleFromInputs();
      });
      return;
    }

    // якщо діапазон по суті не змінився — нічого не робимо
  };

  // слухаємо і 'input', і 'change' (щоб спрацювало і при ручному вводі, і при виборі з календаря)
  openEl.addEventListener("input", handler);
  closeEl.addEventListener("input", handler);
  openEl.addEventListener("change", handler);
  closeEl.addEventListener("change", handler);
}

export function deletepodlegleRecord(index: number): void {
  podlegleData.splice(index, 1);
  updatepodlegleTable();
  showNotification("🗑️ Запис видалено", "info");
}

export async function togglepodleglePaymentWithConfirmation(
  index: number,
): Promise<void> {
  if (!podlegleData[index]) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = podlegleData[index];

  if (!hasFullAccess()) {
    showNotification("⚠️ У вас немає прав для зміни статусу оплати", "warning");
    return;
  }

  const action = record.isPaid ? "unpay" : "pay";

  const confirmed = await createPasswordConfirmationModal(action);

  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  // ✅ ВИПРАВЛЕНО: Чекаємо завершення togglepodleglePayment
  await togglepodleglePayment(index);
}

export async function togglepodleglePayment(index: number): Promise<void> {
  if (!podlegleData[index]) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = podlegleData[index];
  const slyusar = slyusarsData.find((s) => s.Name === record.name);

  if (!slyusar) {
    showNotification(`⚠️ Слюсаря ${record.name} не знайдено`, "error");
    return;
  }

  if (!slyusar.Історія[record.dateOpen]) {
    showNotification(
      `⚠️ Дата ${record.dateOpen} не знайдена в історії`,
      "error",
    );
    return;
  }

  const actRecord = slyusar.Історія[record.dateOpen].find(
    (a) => a.Акт === record.act,
  );

  if (!actRecord) {
    showNotification(`⚠️ Акт ${record.act} не знайдений`, "error");
    return;
  }

  const currentDate = getCurrentDate();
  let statusMsg = "";

  // Зберігаємо попередній стан для можливого відкату
  const prevIsPaid = record.isPaid;
  const prevPaymentDate = record.paymentDate;

  // ВАРІАНТ 1: ПРИЙМАЛЬНИК (якщо є суми і немає Записів)
  if (
    actRecord.СуммаРоботи !== undefined &&
    (!actRecord.Записи || actRecord.Записи.length === 0)
  ) {
    if (!record.isPaid) {
      actRecord.Розраховано = currentDate;
      record.isPaid = true;
      record.paymentDate = currentDate;
      statusMsg = `💰 Розрахунок встановлено на ${currentDate}`;
    } else {
      delete actRecord.Розраховано;
      record.isPaid = false;
      record.paymentDate = "";
      statusMsg = "❌ Розрахунок скасовано";
    }
  }
  // ВАРІАНТ 2: СЛЮСАР (шукаємо конкретну роботу в масиві Записи)
  else if (actRecord.Записи) {
    let workEntry: any;

    // ✅ ПРІОРИТЕТ 0: Пошук за recordId (найточніший спосіб)
    if (record.recordId) {
      workEntry = actRecord.Записи.find((e) => e.recordId === record.recordId);
    }

    // ✅ ПРІОРИТЕТ 1: Використовуємо workIndex для точного пошуку при однакових роботах
    if (
      !workEntry &&
      typeof record.workIndex === "number" &&
      record.workIndex >= 0 &&
      record.workIndex < actRecord.Записи.length
    ) {
      // Точний пошук за індексом
      const entryByIndex = actRecord.Записи[record.workIndex];

      // Перевіряємо що це та сама робота (на випадок якщо порядок змінився)
      if (entryByIndex && entryByIndex.Робота === record.work) {
        workEntry = entryByIndex;
      }
    }

    // Fallback: пошук за назвою (для старих записів без workIndex та recordId)
    if (!workEntry) {
      if (!record.isPaid) {
        workEntry = actRecord.Записи.find(
          (e) => e.Робота === record.work && !e.Розраховано,
        );
      } else {
        workEntry = actRecord.Записи.find(
          (e) =>
            e.Робота === record.work && e.Розраховано === record.paymentDate,
        );
      }
    }

    if (!workEntry) {
      showNotification(`⚠️ Робота "${record.work}" не знайдена`, "error");
      return;
    }

    if (!record.isPaid) {
      if (workEntry.Розраховано) {
        showNotification(`⚠️ Робота "${record.work}" вже оплачена`, "error");
        return;
      }
      workEntry.Розраховано = currentDate;
      record.isPaid = true;
      record.paymentDate = currentDate;
      statusMsg = `💰 Розрахунок встановлено на ${currentDate}`;
    } else {
      delete workEntry.Розраховано;
      record.isPaid = false;
      record.paymentDate = "";
      statusMsg = "❌ Розрахунок скасовано";
    }
  } else {
    console.warn("Невідомий тип запису (ні слюсар, ні приймальник)");
    return;
  }

  // ✅ ВИПРАВЛЕНО: Використовуємо await замість .then() для гарантованого збереження
  try {
    await saveSlyusarsDataToDatabase();
    updatepodlegleTable();
    showNotification(statusMsg, "success");
  } catch (error) {
    console.error(`❌ Помилка збереження:`, error);
    showNotification("❌ Помилка збереження змін в базу даних", "error");
    // Відкат змін
    record.isPaid = prevIsPaid;
    record.paymentDate = prevPaymentDate;
    updatepodlegleTable();
  }
}

export async function runMassPaymentCalculation(): Promise<void> {
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

  const filteredData = getFilteredpodlegleData();

  // ✅ Додаткове логування для відстеження
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";

  // ✅ Логування унікальних імен в filteredData
  const uniqueNames = [...new Set(filteredData.map((r) => r.name))];

  // ✅ Перевірка: якщо вибрано конкретне ім'я, але filteredData містить інші імена - це баг!
  if (selectedName && uniqueNames.some((name) => name !== selectedName)) {
    console.error(
      `❌ УВАГА! Вибрано "${selectedName}", але filteredData містить інші імена:`,
      uniqueNames,
    );
    showNotification(
      `⚠️ Помилка фільтрації! Дані містять записи для інших працівників. Перезавантажте сторінку.`,
      "error",
    );
    return;
  }

  if (filteredData.length === 0) {
    showNotification(
      "ℹ️ Немає записів для обробки в поточному фільтрі",
      "info",
    );
    return;
  }

  const currentDate = getCurrentDate();
  let updatedCount = 0;
  let errorCount = 0;

  filteredData.forEach((record) => {
    if (!record.isPaid) {
      const slyusar = slyusarsData.find((s) => s.Name === record.name);
      if (slyusar && slyusar.Історія[record.dateOpen]) {
        const actRecord = slyusar.Історія[record.dateOpen].find(
          (a) => a.Акт === record.act,
        );
        if (actRecord) {
          // 1. ЛОГІКА ДЛЯ ПРИЙМАЛЬНИКА (якщо є суми і немає Записів)
          if (
            actRecord.СуммаРоботи !== undefined &&
            (!actRecord.Записи || actRecord.Записи.length === 0)
          ) {
            actRecord.Розраховано = currentDate;
            updatedCount++;

            // Оновлюємо локальний масив
            const originalIndex = podlegleData.findIndex(
              (item) =>
                item.dateOpen === record.dateOpen &&
                item.name === record.name &&
                item.act === record.act &&
                !item.isPaid, // work може бути "-" або пустим, тому не перевіряємо його строго, або перевіряємо як є
            );

            if (originalIndex !== -1) {
              podlegleData[originalIndex].isPaid = true;
              podlegleData[originalIndex].paymentDate = currentDate;
            }
          }
          // 2. ЛОГІКА ДЛЯ СЛЮСАРЯ (шукаємо в масиві Записи)
          else if (actRecord.Записи) {
            // ✅ ВИПРАВЛЕННЯ БАГ №3: Шукаємо спочатку по recordId (найточніше), потім по workIndex, потім по роботі
            let workEntry = null;

            // ПРІОРИТЕТ 1: Пошук за recordId (найточніший)
            if (record.recordId) {
              workEntry = actRecord.Записи.find(
                (e) => e.recordId === record.recordId && !e.Розраховано,
              );
              if (workEntry) {
              }
            }

            // ПРІОРИТЕТ 2: Пошук за workIndex (якщо recordId не знайдено)
            if (
              !workEntry &&
              record.workIndex !== undefined &&
              record.workIndex >= 0
            ) {
              const entryByIndex = actRecord.Записи[record.workIndex];
              if (
                entryByIndex &&
                entryByIndex.Робота === record.work &&
                !entryByIndex.Розраховано
              ) {
                workEntry = entryByIndex;
              }
            }

            // ПРІОРИТЕТ 3: Пошук тільки по назві роботи (fallback)
            if (!workEntry) {
              workEntry = actRecord.Записи.find(
                (e) => e.Робота === record.work && !e.Розраховано,
              );
              if (workEntry) {
              }
            }

            if (workEntry) {
              workEntry.Розраховано = currentDate;
              updatedCount++;

              // Оновлюємо локальний масив
              const originalIndex = podlegleData.findIndex(
                (item) =>
                  item.dateOpen === record.dateOpen &&
                  item.name === record.name &&
                  item.act === record.act &&
                  item.work === record.work &&
                  !item.isPaid,
              );

              if (originalIndex !== -1) {
                podlegleData[originalIndex].isPaid = true;
                podlegleData[originalIndex].paymentDate = currentDate;
              }
            } else {
              // Для слюсарів це ворнінг, але для приймальників ми вже обробили вище
              // Тому тут else блок безпечний
              console.warn(
                "❌ Не знайдено workEntry для масового розрахунку:",
                record,
              );
              errorCount++;
            }
          }
        }
      }
    }
  });

  if (updatedCount === 0) {
    if (errorCount > 0) {
      showNotification(
        `❌ Не вдалося знайти ${errorCount} записів для оновлення. Можливо, вони були змінені.`,
        "error",
      );
    } else {
      showNotification(
        "ℹ️ Усі записи в поточному фільтрі вже розраховані",
        "info",
      );
    }
    return;
  }

  try {
    await saveSlyusarsDataToDatabase();
    updatepodlegleTable();

    let notificationMessage = `✅ Масовий розрахунок виконано (${updatedCount} записів з відфільтрованих)`;
    if (errorCount > 0) {
      notificationMessage += ` | ${errorCount} записів не знайдено/пропущено.`;
    }
    showNotification(notificationMessage, "success");
  } catch (error) {
    console.error("❌ Помилка масового розрахунку:", error);
    showNotification("❌ Помилка при збереженні змін у базу", "error");
    showNotification(
      "Будь ласка, оновіть пошук, щоб побачити актуальний стан",
      "warning",
    );
  }
}

export function clearpodlegleForm(): void {
  const podlegleSection = byId<HTMLElement>("Bukhhalter-podlegle-section");
  if (!podlegleSection) return;

  // ✅ 1. Очищаємо всі інпути
  const inputs = podlegleSection.querySelectorAll<HTMLInputElement>(
    "input:not([readonly])",
  );
  inputs.forEach((input) => {
    input.value = "";
  });

  // ✅ 2. Очищаємо селект ПІБ
  const nameSelect = byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select");
  if (nameSelect) {
    nameSelect.value = "";
  }

  // ✅ 3. Очищаємо поле "Робота"
  const workInput = byId<HTMLInputElement>("Bukhhalter-podlegle-work-input");
  if (workInput) {
    workInput.value = "";
  }

  // ✅ 3.1 Очищаємо селект номера акту
  const actSelect = byId<HTMLSelectElement>("Bukhhalter-podlegle-act-select");
  if (actSelect) {
    actSelect.value = "";
  }

  // ✅ 4. Скидаємо перемикач статусу актів на "Всі" (значення "2")
  const statusToggle = byId<HTMLInputElement>("details-status-filter-toggle");
  if (statusToggle) {
    statusToggle.value = "2";
    currentStatusFilter = "all";
    // Тригеримо подію change для оновлення UI
    statusToggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ✅ 5. Скидаємо перемикач розрахунків на "Всі" (значення "2")
  const paymentToggle = byId<HTMLInputElement>("payment-filter-toggle");
  if (paymentToggle) {
    paymentToggle.value = "2";
    currentPaymentFilter = "all";
    // Тригеримо подію change для оновлення UI
    paymentToggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ✅ 6. Скидаємо перемикач процентів на "Всі" (значення "2")
  const percentageToggle = byId<HTMLInputElement>("percentage-filter-toggle");
  if (percentageToggle) {
    percentageToggle.value = "2";
    currentPercentageFilter = "all";
    // Тригеримо подію change для оновлення UI
    percentageToggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ✅ 7. Скидаємо режим фільтрації дат на "Відкриття"
  podlegleDateFilterMode = "open";
  const dateFilterButtons = document.querySelectorAll(
    "#Bukhhalter-podlegle-section .date-filter-btn",
  );
  dateFilterButtons.forEach((btn) => {
    if ((btn as HTMLButtonElement).dataset.filter === "open") {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // ✅ 7. Очищаємо дані
  podlegleData = [];
  allPodlegleData = [];
  hasPodlegleDataLoaded = false;
  lastSearchDateOpen = "";
  lastSearchDateClose = "";

  // ✅ 8. Оновлюємо таблицю
  updatepodlegleTable();

  showNotification("🗑️ Фільтри та дані очищено", "info", 1500);
}

(window as any).runMassPaymentCalculation = runMassPaymentCalculation;
(window as any).togglepodleglePaymentWithConfirmation =
  togglepodleglePaymentWithConfirmation;
(window as any).updatePodlegleDisplayedSums = updatePodlegleDisplayedSums;
(window as any).clearpodlegleForm = clearpodlegleForm;

// Ініціалізація випадаючого списку робіт та перемикача дат при завантаженні
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    ensureWorkSmartDropdown();
    initPodlegleDateFilterToggle();
    initPodlegleDateAutoFilter(); // 👈 нове

    // 🔹 Ініціалізація обробника для селекту номера акту
    const actSelectEl = byId<HTMLSelectElement>(
      "Bukhhalter-podlegle-act-select",
    );
    if (actSelectEl) {
      actSelectEl.addEventListener("change", () => {
        triggerPodlegleAutoFilter();
      });
    }
  }, 100);
});

export { initPodlegleDateFilterToggle, podlegleDateFilterMode };

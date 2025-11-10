// src\ts\roboha\bukhhalteriya\zarplata.ts
import { supabase } from "../../vxid/supabaseClient";
import { formatDate, formatNumber, byId } from "./bukhhalteriya";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../tablucya/users";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

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
}

interface SlyusarData {
  Name: string;
  Історія: {
    [date: string]: Array<{
      Акт: string;
      Записи: Array<{
        Ціна: number;
        Робота: string;
        Кількість: number;
        Зарплата?: number;
        Розраховано?: string;
      }>;
      Клієнт?: string;
      Автомобіль?: string;
      СуммаРоботи: number;
      ДатаЗакриття: string | null;
    }>;
  };
}

export let podlegleData: PodlegleRecord[] = [];
let slyusarsData: SlyusarData[] = [];
let availableNames: string[] = [];
let currentPaymentFilter: PaymentFilter = "all";
let currentStatusFilter: StatusFilter = "all";

let lastSearchDateOpen: string = "";
let lastSearchDateClose: string = "";
let hasDataForAllEmployees: boolean = false;

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
          error
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

  searchDataInDatabase(dateOpen, dateClose, selectedName);

  allPodlegleData = [...podlegleData];
  hasPodlegleDataLoaded = true;
  ensureWorkSmartDropdown();
  refreshWorkDropdownOptions();

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
  action: "pay" | "unpay"
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "password-confirmation-modal";
    modal.className = "login-modal";
    modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center;
            align-items: center; z-index: 10000;
        `;

    const modalContent = document.createElement("div");
    modalContent.className = "login-modal-content";
    modalContent.style.cssText = `
            background-color: #fff; padding: 20px; border-radius: 8px;
            width: 300px; text-align: center; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        `;

    const title = document.createElement("h3");
    title.textContent =
      action === "pay"
        ? "🔐 Підтвердження розрахунку"
        : "🔐 Підтвердження скасування";
    title.className = "login-modal-title";
    title.style.cssText = `margin-bottom: 15px; color: #333;`;

    const description = document.createElement("p");
    description.style.cssText = `margin-bottom: 15px; color: #666; font-size: 14px;`;

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Введіть пароль...";
    input.className = "login-input";
    input.style.cssText = `
            width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ccc;
            border-radius: 4px; box-sizing: border-box;
        `;

    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `color: #f44336; margin: 10px 0; display: none; font-size: 14px;`;

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `display: flex; gap: 10px; justify-content: center;`;

    const confirmButton = document.createElement("button");
    confirmButton.textContent = "Підтвердити";
    confirmButton.className = "login-button";
    confirmButton.style.cssText = `
            padding: 10px 20px; background-color: #007bff; color: #fff; border: none;
            border-radius: 4px; cursor: pointer; transition: background-color 0.2s; flex: 1;
        `;

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Скасувати";
    cancelButton.style.cssText = `
            padding: 10px 20px; background-color: #6c757d; color: #fff; border: none;
            border-radius: 4px; cursor: pointer; transition: background-color 0.2s; flex: 1;
        `;

    confirmButton.addEventListener("click", async () => {
      const inputPassword = input.value.trim();
      if (!inputPassword) {
        errorDiv.textContent = "Введіть пароль";
        errorDiv.style.display = "block";
        return;
      }

      const savedData = getSavedUserDataFromLocalStorage();
      if (!savedData) {
        errorDiv.textContent = "Помилка: не знайдено дані користувача";
        errorDiv.style.display = "block";
        return;
      }

      if (inputPassword === savedData.password) {
        modal.remove();
        resolve(true);
      } else {
        errorDiv.textContent = "Невірний пароль";
        errorDiv.style.display = "block";
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

    buttonsContainer.appendChild(confirmButton);
    buttonsContainer.appendChild(cancelButton);

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
    const { data, error } = await supabase.from("slyusars").select("*");

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
        .filter((item) => item !== null);

      updateNamesList();
    } else {
      throw new Error(
        "Невірний формат даних з Supabase: дані не є масивом або порожні"
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
      5000
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

    const primaryKeyCandidates = ["id", "slyusars_id", "uid", "pk"];
    const detectPrimaryKey = (row: any): string | null => {
      if (!row) return null;
      for (const k of primaryKeyCandidates) if (k in row) return k;
      return null;
    };
    const primaryKey = detectPrimaryKey(existingData?.[0]);

    for (const slyusar of slyusarsData) {
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
          return js && js.Name === slyusar.Name;
        });

        if (!target) {
          console.warn(`Не знайдено запис для слюсаря: ${slyusar.Name}`);
          continue;
        }

        if (primaryKey) {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .eq(primaryKey, target[primaryKey])
            .select();

          if (updErr) {
            console.error(`Помилка оновлення ${slyusar.Name}:`, updErr);
            throw updErr;
          } else {
            console.log(
              `✅ Оновлено по ключу (${primaryKey}) для ${slyusar.Name}`,
              upd
            );
          }
        } else {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .contains("data", { Name: slyusar.Name })
            .select();

          if (updErr) {
            console.error(
              `Помилка оновлення (fallback) ${slyusar.Name}:`,
              updErr
            );
            throw updErr;
          } else {
            console.log(`✅ Оновлено за JSON Name для ${slyusar.Name}`, upd);
          }
        }
      } catch (recordError) {
        console.error(
          `Помилка обробки запису для ${slyusar.Name}:`,
          recordError
        );
        throw recordError;
      }
    }

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
      5000
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

      if (hasDataForAllEmployees) {
        console.log(
          `🔄 Автоматичне фільтрування по співробітнику: ${
            selectedName || "всі"
          }`
        );

        searchDataInDatabase(
          lastSearchDateOpen,
          lastSearchDateClose,
          selectedName
        );
      }

      refreshWorkDropdownOptions();
    });
  } catch (error) {}
}

export function getFilteredpodlegleData(): PodlegleRecord[] {
  let filteredData = podlegleData;

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
      0
    );
    totalSalary = calculatePodlegleSalaryTotal();
    totalMargin = calculatePodlegleMarginTotal();
  }

  const marginSign = totalMargin >= 0 ? "+" : "";

  totalSumElement.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 15px; font-size: 1.1em;">
      <span>Сумма <strong style="color: #333;">💰 ${formatNumber(
        totalRevenue
      )}</strong> грн</span>
      <span style="color: #666;">-</span>
      <span><strong style="color: #8B0000;">💶 ${formatNumber(
        totalSalary
      )}</strong> грн</span>
      <span style="color: #666;">=</span>
      <span><strong style="color: ${
        totalMargin >= 0 ? "#006400 " : "#8B0000"
      };">📈 ${marginSign}${formatNumber(totalMargin)}</strong> грн</span>
    </div>
  `;
}

export function updatepodlegleTable(): void {
  const tbody = byId<HTMLTableSectionElement>("podlegle-tbody");
  const filteredData = getFilteredpodlegleData();

  if (filteredData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="12" class="Bukhhalter-no-data">Немає даних для відображення</td></tr>';
    updatePodlegleDisplayedSums();
    return;
  }

  tbody.innerHTML = filteredData
    .map((item, index) => {
      const originalIndex = podlegleData.indexOf(item);
      const rowClass = item.isClosed ? "closed-row" : "open-row";
      const paidClass = item.isPaid ? "paid-row" : "unpaid-row";

      const paymentButtonText = item.isPaid
        ? `💰 ${item.paymentDate || "Розраховано"}`
        : "💲 Не розраховано";

      const marginColor = item.margin >= 0 ? "#28a745" : "#dc3545";
      const marginSign = item.margin >= 0 ? "+" : "";

      const totalHtml = `
        <div style="font-size: 0.95em; font-weight: 600; color: #000;">${formatNumber(
          item.total
        )}</div>
        <div style="font-size: 0.85em; color: #dc3545; margin-top: 2px;">-${formatNumber(
          item.salary
        )}</div>
        <div style="font-size: 0.9em; color: ${marginColor}; font-weight: 500; margin-top: 2px;">${marginSign}${formatNumber(
        item.margin
      )}</div>
      `;

      return `
                <tr class="${rowClass} ${paidClass}" onclick="handleRowClick(${index})">
                    <td>
                        <button class="Bukhhalter-payment-btn ${
                          item.isPaid ? "paid" : "unpaid"
                        }" 
                                onclick="event.stopPropagation(); togglepodleglePaymentWithConfirmation(${originalIndex})" 
                                title="${
                                  item.isPaid
                                    ? `Розраховано ${item.paymentDate || ""}`
                                    : "Не розраховано"
                                }">
                            ${paymentButtonText}
                        </button>
                    </td>
                    <td>${formatDate(item.dateOpen)}</td>
                    <td>${formatDate(item.dateClose)}</td>
                    <td>${item.name || "-"}</td>
                    <td>
                     <button class="Bukhhalter-act-btn"
                             onclick="event.stopPropagation(); openActModal(${
                               Number(item.act) || 0
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
                    <td style="padding: 8px;">
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
  toDmy?: string
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
  selectedName: string
): void {
  podlegleData = [];
  // ✅ ДОДАНО: Якщо немає дат - встановлюємо 01.01.2025 як початкову
  if (!dateOpen && !dateClose) {
    dateOpen = "01.01.2025";
    console.log("📅 Використано дату за замовчуванням: 01.01.2025");
  }
  if (slyusarsData.length === 0) {
    showNotification(
      "⚠️ Немає даних з бази slyusars. Спробуйте перезавантажити сторінку.",
      "warning"
    );
    updatepodlegleTable();
    return;
  }

  lastSearchDateOpen = dateOpen;
  lastSearchDateClose = dateClose;

  const isSearchForAllEmployees = !selectedName;
  if (isSearchForAllEmployees) hasDataForAllEmployees = true;

  const toIsoClose = dateClose || todayIso();

  console.log(`🔍 Пошук в базі slyusars:`);
  console.log(`  - Початкова дата: ${dateOpen || "не вказана"}`);
  console.log(`  - Кінцева дата: ${dateClose || "сьогодні"}`);
  console.log(`  - ПІБ: ${selectedName || "всі"}`);
  console.log(`  - Режим фільтрації: ${podlegleDateFilterMode}`);

  slyusarsData.forEach((slyusar) => {
    if (selectedName && slyusar.Name !== selectedName) return;

    Object.keys(slyusar.Історія).forEach((openDmy) => {
      slyusar.Історія[openDmy].forEach((record) => {
        if (podlegleDateFilterMode === "paid") {
          record.Записи.forEach((entry) => {
            if (entry.Кількість === 0) return;
            const payDmy = entry.Розраховано || "";
            if (!payDmy) return;
            if (!inRangeByIso(payDmy, dateOpen, toIsoClose)) return;

            const totalPrice = entry.Ціна * entry.Кількість;
            const salary = entry.Зарплата || 0;
            podlegleData.push({
              dateOpen: openDmy,
              dateClose: record.ДатаЗакриття || "",
              name: slyusar.Name,
              act: record.Акт,
              client: record.Клієнт || "",
              automobile: record.Автомобіль || "",
              work: entry.Робота,
              quantity: entry.Кількість,
              price: entry.Ціна,
              total: totalPrice,
              salary,
              margin: totalPrice - salary,
              isClosed: record.ДатаЗакриття !== null,
              isPaid: true,
              paymentDate: payDmy,
            });
          });
        } else {
          const targetDmy =
            podlegleDateFilterMode === "close"
              ? record.ДатаЗакриття || ""
              : openDmy;
          if (!targetDmy) return;
          if (!inRangeByIso(targetDmy, dateOpen, toIsoClose)) return;

          record.Записи.forEach((entry) => {
            if (entry.Кількість === 0) return;
            const totalPrice = entry.Ціна * entry.Кількість;
            const salary = entry.Зарплата || 0;
            podlegleData.push({
              dateOpen: openDmy,
              dateClose: record.ДатаЗакриття || "",
              name: slyusar.Name,
              act: record.Акт,
              client: record.Клієнт || "",
              automobile: record.Автомобіль || "",
              work: entry.Робота,
              quantity: entry.Кількість,
              price: entry.Ціна,
              total: totalPrice,
              salary,
              margin: totalPrice - salary,
              isClosed: record.ДатаЗакриття !== null,
              isPaid: !!entry.Розраховано,
              paymentDate: entry.Розраховано || "",
            });
          });
        }
      });
    });
  });

  console.log(`📊 Знайдено ${podlegleData.length} записів в базі slyusars`);

  // ✅ ДОДАЄМО ФІЛЬТР ПО РОБОТІ
  const workInput =
    byId<HTMLInputElement>("Bukhhalter-podlegle-work-input")?.value.trim() ||
    "";
  if (workInput) {
    const beforeFilter = podlegleData.length;
    podlegleData = podlegleData.filter((record) =>
      (record.work || "").toLowerCase().includes(workInput.toLowerCase())
    );
    console.log(
      `🔍 Фільтр по роботі "${workInput}": ${beforeFilter} → ${podlegleData.length} записів`
    );
  }

  podlegleData.sort((a, b) => {
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

  const recordsCount = podlegleData.length;
  const filterMessage = selectedName ? ` для ${selectedName}` : "";
  const modeLabels = {
    open: "відкриття",
    close: "закриття",
    paid: "розрахунку" as const,
  };

  let dateFilterMessage = "";
  if (!dateOpen && !dateClose) {
    dateFilterMessage = ` (всі дати ${modeLabels[podlegleDateFilterMode]})`;
  } else if (dateOpen && !dateClose) {
    dateFilterMessage = ` (${modeLabels[podlegleDateFilterMode]}: з ${dateOpen} до сьогодні)`;
  } else if (!dateOpen && dateClose) {
    dateFilterMessage = ` (${modeLabels[podlegleDateFilterMode]}: до ${dateClose} включно)`;
  } else {
    dateFilterMessage = ` (${modeLabels[podlegleDateFilterMode]}: з ${dateOpen} до ${dateClose})`;
  }

  if (workInput) {
    dateFilterMessage += ` | робота: "${workInput}"`;
  }

  showNotification(
    recordsCount > 0
      ? `✅ Знайдено ${recordsCount} записів${filterMessage}${dateFilterMessage}`
      : `ℹ️ Записів не знайдено за заданими критеріями${filterMessage}${dateFilterMessage}`,
    recordsCount > 0 ? "success" : "info"
  );

  allPodlegleData = [...podlegleData];
  hasPodlegleDataLoaded = true;
  ensureWorkSmartDropdown();
  refreshWorkDropdownOptions();
  updatepodlegleTable();
}

// Функція для локальної фільтрації завантажених даних
export function filterPodlegleData(): void {
  if (!hasPodlegleDataLoaded || allPodlegleData.length === 0) {
    podlegleData = [];
    updatepodlegleTable();
    showNotification(
      "ℹ️ Записів не знайдено за поточним фільтром",
      "info",
      2000
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
    const before = filtered.length;
    filtered = filtered.filter((record) =>
      (record.work || "").toLowerCase().includes(workInput.toLowerCase())
    );
    console.log(
      `🔍 Фільтр по роботі "${workInput}": ${before} → ${filtered.length}`
    );
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
      2500
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
    "#Bukhhalter-podlegle-section .Bukhhalter-date-filter-toggle"
  );
  if (!toggleContainer) return;

  const buttons =
    toggleContainer.querySelectorAll<HTMLButtonElement>(".date-filter-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      buttons.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      podlegleDateFilterMode = this.dataset.filter as "open" | "close" | "paid";

      console.log(
        `🔄 Підлеглі: змінено режим фільтрації дат на "${podlegleDateFilterMode}"`
      );

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

    console.log("🔄 Зміна фільтра статусу актів:", value);

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

    console.log("🔄 Зміна фільтра статусу актів:", value);

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

    console.log(
      `✅ Фільтр застосовано. Поточний розрахунок: ${currentPaymentFilter}`
    );
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

    console.log(
      `✅ Фільтр застосовано. Поточний розрахунок: ${currentPaymentFilter}`
    );
  });
}

export function handlepodlegleAddRecord(): void {
  const dateOpen = byId<HTMLInputElement>(
    "Bukhhalter-podlegle-date-open"
  ).value;
  const dateClose = byId<HTMLInputElement>(
    "Bukhhalter-podlegle-date-close"
  ).value;
  const selectedName =
    byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select")?.value || "";

  // ✅ ЗМІНЕНО: Завжди завантажуємо дані з бази при натисканні "Пошук"
  searchDataInDatabase(dateOpen, dateClose, selectedName);

  allPodlegleData = [...podlegleData];
  hasPodlegleDataLoaded = true;
  ensureWorkSmartDropdown();
  refreshWorkDropdownOptions();

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

  console.log(searchInfo);
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
  index: number
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

  togglepodleglePayment(index);
}

export function togglepodleglePayment(index: number): void {
  if (!podlegleData[index]) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }
  
  const record = podlegleData[index];
  const slyusar = slyusarsData.find((s) => s.Name === record.name);
  
  if (!slyusar) {
    console.error(`❌ Слюсаря ${record.name} не знайдено в slyusarsData`);
    showNotification(
      `⚠️ Помилка: слюсаря ${record.name} не знайдено в базі даних`,
      "error"
    );
    return;
  }
  
  if (!slyusar.Історія[record.dateOpen]) {
    console.error(
      `❌ Дата ${record.dateOpen} не знайдена в історії слюсаря ${record.name}`
    );
    showNotification(
      `⚠️ Помилка: дата ${record.dateOpen} не знайдена в історії`,
      "error"
    );
    return;
  }
  
  const actRecord = slyusar.Історія[record.dateOpen].find(
    (a) => a.Акт === record.act
  );
  
  if (!actRecord) {
    console.error(
      `❌ Акт ${record.act} не знайдений для дати ${record.dateOpen}`
    );
    showNotification(`⚠️ Помилка: акт ${record.act} не знайдений`, "error");
    return;
  }

  let workEntry:
    | {
        Ціна: number;
        Робота: string;
        Кількість: number;
        Зарплата?: number;
        Розраховано?: string;
      }
    | undefined;

  if (!record.isPaid) {
    // --- ЛОГІКА ОПЛАТИ ---
    const currentDate = getCurrentDate();
    
    // ✅ ВИПРАВЛЕНО: Шукаємо тільки по РОБОТІ (без перевірки ціни/кількості/зарплати)
    workEntry = actRecord.Записи.find(
      (e) =>
        e.Робота === record.work &&
        !e.Розраховано // Шукаємо тільки неоплачений запис
    );

    if (!workEntry) {
      console.error(
        `❌ Запис роботи "${record.work}" не знайдений для оплати в акті ${record.act}`
      );
      showNotification(
        `⚠️ Помилка: запис роботи "${record.work}" не знайдений для оплати`,
        "error"
      );
      return;
    }
    
    workEntry.Розраховано = currentDate;
    record.isPaid = true;
    record.paymentDate = currentDate;

  } else {
    // --- ЛОГІКА СКАСУВАННЯ ОПЛАТИ ---
    
    // ✅ ВИПРАВЛЕНО: Шукаємо тільки по РОБОТІ та ДАТІ ОПЛАТИ
    workEntry = actRecord.Записи.find(
      (e) =>
        e.Робота === record.work &&
        e.Розраховано === record.paymentDate
    );

    if (!workEntry) {
      console.error(
        `❌ Запис роботи "${record.work}" (оплачений ${record.paymentDate}) не знайдений для скасування`
      );
      showNotification(
        `⚠️ Помилка: запис роботи "${record.work}" (оплачений ${record.paymentDate}) не знайдений для скасування`,
        "error"
      );
      return;
    }
    
    delete workEntry.Розраховано;
    record.isPaid = false;
    record.paymentDate = "";
  }

  // --- Збереження ---
  saveSlyusarsDataToDatabase()
    .then(() => {
      updatepodlegleTable();
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
      updatepodlegleTable(); 
    });
}

export async function runMassPaymentCalculation(): Promise<void> {
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
  
  const filteredData = getFilteredpodlegleData();
  
  if (filteredData.length === 0) {
    showNotification(
      "ℹ️ Немає записів для обробки в поточному фільтрі",
      "info"
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
          (a) => a.Акт === record.act
        );
        if (actRecord) {
          // ✅ ВИПРАВЛЕНО: Шукаємо тільки по РОБОТІ
          const workEntry = actRecord.Записи.find(
            (e) =>
              e.Робота === record.work &&
              !e.Розраховано
          );
          
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
                !item.isPaid
            );
            
            if (originalIndex !== -1) {
              podlegleData[originalIndex].isPaid = true;
              podlegleData[originalIndex].paymentDate = currentDate;
            }

          } else {
            console.warn("❌ Не знайдено workEntry для масового розрахунку:", record);
            errorCount++;
          }
        }
      }
    }
  });

  if (updatedCount === 0) {
    if (errorCount > 0) {
       showNotification(
        `❌ Не вдалося знайти ${errorCount} записів для оновлення. Можливо, вони були змінені.`,
        "error"
      );
    } else {
      showNotification(
        "ℹ️ Усі записи в поточному фільтрі вже розраховані",
        "info"
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
    showNotification("Будь ласка, оновіть пошук, щоб побачити актуальний стан", "warning");
  }
}

export function clearpodlegleForm(): void {
  const podlegleSection = byId<HTMLElement>("Bukhhalter-podlegle-section");
  if (!podlegleSection) return;

  // ✅ 1. Очищаємо всі інпути
  const inputs = podlegleSection.querySelectorAll<HTMLInputElement>(
    "input:not([readonly])"
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

  // ✅ 6. Скидаємо режим фільтрації дат на "Відкриття"
  podlegleDateFilterMode = "open";
  const dateFilterButtons = document.querySelectorAll(
    "#Bukhhalter-podlegle-section .date-filter-btn"
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
  hasDataForAllEmployees = false;
  lastSearchDateOpen = "";
  lastSearchDateClose = "";

  // ✅ 8. Оновлюємо таблицю
  updatepodlegleTable();

  console.log("✅ Форма повністю очищена, всі фільтри скинуті");
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
  }, 100);
});

export { initPodlegleDateFilterToggle, podlegleDateFilterMode };

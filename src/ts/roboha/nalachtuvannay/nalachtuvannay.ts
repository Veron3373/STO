import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { resetPercentCache } from "../zakaz_naraudy/inhi/kastomna_tabluca";
import { invalidateGlobalDataCache, globalCache, saveGeneralSettingsToLocalStorage, applyWallpapers } from "../zakaz_naraudy/globalCache";

const SETTINGS = {
  1: { id: "toggle-shop", label: "ПІБ _ Магазин", class: "_shop" },
  2: { id: "toggle-receiver", label: "Каталог", class: "_receiver" },
  3: { id: "toggle-zarplata", label: "Зарплата", class: "_zarplata" },
  4: {
    id: "percentage-value",
    label: "Націнка на запчастина",
    class: "_percentage",
  },
  5: { id: "toggle-sms", label: "SMS", class: "_sms" },
};

const ROLES = [
  "Адміністратор",
  "Приймальник",
  "Слюсар",
  "Запчастист",
  "Складовщик",
  "Загальні",
];

const ROLE_COLORS = {
  Адміністратор: {
    button: "linear-gradient(135deg, #4caf50 0%, #45a049 100%)",
    buttonHover: "linear-gradient(135deg, #45a049 0%, #3d8b40 100%)",
    border: "#4caf50",
    "modal-window": "#4caf50",
  },
  Приймальник: {
    button: "linear-gradient(135deg, #2196F3 0%, #1976D2 100%)",
    buttonHover: "linear-gradient(135deg, #1976D2 0%, #1565C0 100%)",
    border: "#2196F3",
    "modal-window": "#2196F3",
  },
  Слюсар: {
    button: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
    buttonHover: "linear-gradient(135deg, #F57C00 0%, #E65100 100%)",
    border: "#FF9800",
    "modal-window": "#FF9800",
  },
  Запчастист: {
    button: "linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)",
    buttonHover: "linear-gradient(135deg, #7B1FA2 0%, #6A1B9A 100%)",
    border: "#9C27B0",
    "modal-window": "#9C27B0",
  },
  Складовщик: {
    button: "linear-gradient(135deg, #F44336 0%, #D32F2F 100%)",
    buttonHover: "linear-gradient(135deg, #D32F2F 0%, #C62828 100%)",
    border: "#F44336",
    "modal-window": "#F44336",
  },
  Загальні: {
    button: "linear-gradient(135deg, #607D8B 0%, #455A64 100%)",
    buttonHover: "linear-gradient(135deg, #455A64 0%, #37474F 100%)",
    border: "#607D8B",
    "modal-window": "#607D8B",
  },
};

const ROLE_SETTINGS = {
  Приймальник: [
    { id: 1, label: "Налаштування" },
    { divider: true },
    { id: 2, label: "Додати" },
    { id: 3, label: "Додати Співробітники" },
    { divider: true },
    { id: 4, label: "Бухгалтерія" },
    { id: 5, label: "Бухгалтерія 🏪 Склад" },
    { id: 6, label: "Бухгалтерія 🏪 Склад розраховувати💲" },
    { id: 7, label: "Бухгалтерія 🏪 Склад відміна розраховувати 💰" },
    { id: 8, label: "Бухгалтерія 🏪 Склад ↩️ повертати в магазин ⬅️🚚" },
    {
      id: 9,
      label: "Бухгалтерія 🏪 Склад ↩️ відміна повернення в магазин 🚚➡️",
    },
    //{ id: 10, label: "Бухгалтерія 👨‍🔧 Зарплата" },
    //{ id: 11, label: "Бухгалтерія 👨‍🔧 Зарплата розраховувати💲" },
    //{ id: 12, label: "Бухгалтерія 👨‍🔧 Зарплата відміна розраховувати 💰" },
    { id: 13, label: "Бухгалтерія ⚙️ Деталі" },
    { divider: true },
    { id: 14, label: "📋 Акт Зарплата 💲" },
    { id: 15, label: "📋 Акт Ціна та Сума" },
    { id: 16, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 17, label: "📋 Акт Відкриття акту 🔒" },
    { id: 18, label: "📋 Акт Створити Рахунок і Акт виконаних робіт 🗂️" },
    { id: 19, label: "📋 Акт Створити PDF Акту 🖨️" },
    { id: 20, label: "📋 Акт SMS ✉️" },
    { divider: true },
    { id: 21, label: "Планування" },
  ],
  Слюсар: [
    { id: 1, label: "📋 Акт Зарплата 💲" },
    { id: 2, label: "📋 Акт Ціна та Сума" },
    { id: 3, label: "📋 Акт Закриття акту 🗝️" },
    { id: 4, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 5, label: "📋 Акт Відкриття акту 🔒" },
    { divider: true },
    { id: 6, label: "Планування" },
  ],
  Запчастист: [
    { id: 1, label: "Додати" },
    { divider: true },
    { id: 2, label: "Бухгалтерія" },
    //{ id: 3, label: "Бухгалтерія 👨‍🔧 Зарплата" },
    //{ id: 4, label: "Бухгалтерія 👨‍🔧 Зарплата розраховувати💲" },
    //{ id: 5, label: "Бухгалтерія 👨‍🔧 Зарплата відміна розраховувати 💰" },
    { id: 6, label: "Бухгалтерія 🏪 Склад" },
    { id: 7, label: "Бухгалтерія 🏪 Склад розраховувати💲" },
    { id: 8, label: "Бухгалтерія 🏪 Склад відміна розраховувати 💰" },
    { id: 9, label: "Бухгалтерія 🏪 Склад ↩️ повертати в магазин ⬅️🚚" },
    {
      id: 10,
      label: "Бухгалтерія 🏪 Склад відміна ↩️ повернення в магазин 🚚➡️",
    },
    { id: 11, label: "Бухгалтерія ⚙️ Деталі" },
    { divider: true },
    { id: 12, label: "Відображати всі Акти 📋" },
    { id: 13, label: "Відображати Акт 📋" },
    { divider: true },
    { id: 14, label: "📋 Акт Зарплата" },
    { id: 15, label: "📋 Акт Ціна та Сума" },
    { id: 16, label: "📋 Акт Зариття акту 🗝️" },
    { id: 17, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 18, label: "📋 Акт Відкриття акту 🔒" },
    { id: 19, label: "📋 Акт Створити Рахунок і Акт виконаних робіт 🗂️" },
    { id: 20, label: "📋 Акт Створити PDF Акту 🖨️" },
    { id: 21, label: "📋 Акт SMS ✉️" },
    { id: 22, label: "📋 Акт ➕ Додати рядок 💾 Зберегти зміни 🗑️ Видалити" },
    { divider: true },
    { id: 23, label: "Планування" },
  ],
  Складовщик: [
    { id: 1, label: "Додати" },
    { id: 2, label: "Додати Співробітники" },
    { divider: true },
    //{ id: 3, label: "Бухгалтерія 🏪 Склад" },
    { id: 4, label: "Бухгалтерія 🏪 Склад розраховувати💲" },
    { id: 5, label: "Бухгалтерія 🏪 Склад відміна розраховувати 💰" },
    { id: 6, label: "Бухгалтерія 🏪 Склад ↩️ повертати в магазин ⬅️🚚" },
    {
      id: 7,
      label: "Бухгалтерія 🏪 Склад ↩️ відміна повернення в магазин 🚚➡️",
    },
    { id: 8, label: "Бухгалтерія ⚙️ Деталі" },
    { divider: true },
    { id: 9, label: "Відображати всі Акти" },
    { id: 10, label: "Відображати Акт" },
    { divider: true },
    { id: 11, label: "📋 Акт Зарплата 💲" },
    { id: 12, label: "📋 Акт Ціна та Сума" },
    { id: 13, label: "📋 Акт Закриття акту 🗝️" },
    { id: 14, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 15, label: "📋 Акт Відкриття акту 🔒" },
    { id: 16, label: "📋 Акт Створити Рахунок і Акт виконаних робіт 🗂️" },
    { id: 17, label: "📋 Акт Створити PDF Акту 🖨️" },
    { id: 18, label: "📋 Акт SMS ✉️" },
    { id: 19, label: "📋 Акт ➕ Додати рядок 💾 Зберегти зміни 🗑️ Видалити" },
    { divider: true },
    { id: 20, label: "Планування" },
  ],
};

const ROLE_TO_COLUMN = {
  Адміністратор: "data",
  Приймальник: "Приймальник",
  Слюсар: "Слюсар",
  Запчастист: "Запчастист",
  Складовщик: "Складовщик",
  Загальні: "Загальні",
};

// 🔹 Зберігає початковий стан налаштувань при відкритті модалки
let initialSettingsState: Map<number, boolean | number | string> = new Map();

// Константа за замовчуванням для кольорів
const DEFAULT_COLOR = "#164D25";

// Генерує HTML для секції "Загальні"
function createGeneralSettingsHTML(): string {
  return `
    <div class="general-settings-container">
      <div class="general-input-group">
        <label class="general-label" for="general-sto-name">
          <span class="general-label-text">🏢 Назва СТО</span>
          <input type="text" id="general-sto-name" class="general-input" placeholder="Введіть назву СТО" />
        </label>
      </div>
      
      <div class="general-input-group">
        <label class="general-label" for="general-address">
          <span class="general-label-text">📍 Адреса</span>
          <input type="text" id="general-address" class="general-input" placeholder="Введіть адресу" />
        </label>
      </div>
      
      <div class="general-input-group">
        <label class="general-label" for="general-phone">
          <span class="general-label-text">📞 Телефон</span>
          <input type="text" id="general-phone" class="general-input" placeholder="Введіть телефон" />
        </label>
      </div>
      
      <div class="settings-divider"></div>
      
      <div class="general-color-group">
        <label class="general-label color-label" for="general-header-color">
          <span class="general-label-text">🎨 Колір шапки акту</span>
          <div class="color-picker-wrapper">
            <input type="color" id="general-header-color" class="color-picker" value="${DEFAULT_COLOR}" />
            <span class="color-value" id="header-color-value">${DEFAULT_COLOR}</span>
          </div>
        </label>
      </div>
      
      <div class="general-color-group">
        <label class="general-label color-label" for="general-table-color">
          <span class="general-label-text">🎨 Колір таблиці актів</span>
          <div class="color-picker-wrapper">
            <input type="color" id="general-table-color" class="color-picker" value="${DEFAULT_COLOR}" />
            <span class="color-value" id="table-color-value">${DEFAULT_COLOR}</span>
          </div>
        </label>
      </div>
      
<div class="settings-divider"></div>
      
      <div class="general-input-group">
        <label class="general-label" for="general-wallpaper-main">
          <span class="general-label-text">🖼️ Шпалери основні (URL)</span>
          <input type="text" id="general-wallpaper-main" class="general-input" placeholder="Введіть URL зображення для основної сторінки" />
        </label>
      </div>
      
      <div class="reset-colors-wrapper">
        <button type="button" id="reset-colors-btn" class="reset-colors-btn">
          🔄 Скинути кольори за замовчуванням
        </button>
      </div>
    </div>
  `;
}

// Завантажує дані для секції "Загальні"
async function loadGeneralSettings(modal: HTMLElement): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("setting_id, Загальні")
      .in("setting_id", [1, 2, 3, 4, 5, 7])
      .order("setting_id");

    if (error) throw error;

    // Очищуємо попередній стан
    initialSettingsState.clear();

    data?.forEach((row: any) => {
      const value = row["Загальні"] || "";
      initialSettingsState.set(row.setting_id, value);

      switch (row.setting_id) {
        case 1: // Назва СТО
          const nameInput = modal.querySelector("#general-sto-name") as HTMLInputElement;
          if (nameInput) nameInput.value = value;
          break;
        case 2: // Адреса
          const addressInput = modal.querySelector("#general-address") as HTMLInputElement;
          if (addressInput) addressInput.value = value;
          break;
        case 3: // Телефон
          const phoneInput = modal.querySelector("#general-phone") as HTMLInputElement;
          if (phoneInput) phoneInput.value = value;
          break;
        case 4: // Колір шапки акту
          const headerColor = modal.querySelector("#general-header-color") as HTMLInputElement;
          const headerColorValue = modal.querySelector("#header-color-value") as HTMLElement;
          const colorValue4 = value || DEFAULT_COLOR;
          if (headerColor) headerColor.value = colorValue4;
          if (headerColorValue) headerColorValue.textContent = colorValue4;
          break;
        case 5: // Колір таблиці актів
          const tableColor = modal.querySelector("#general-table-color") as HTMLInputElement;
          const tableColorValue = modal.querySelector("#table-color-value") as HTMLElement;
          const colorValue5 = value || DEFAULT_COLOR;
          if (tableColor) tableColor.value = colorValue5;
          if (tableColorValue) tableColorValue.textContent = colorValue5;
          break;
        case 7: // Шпалери основні
          const wallpaperMainInput = modal.querySelector("#general-wallpaper-main") as HTMLInputElement;
          if (wallpaperMainInput) wallpaperMainInput.value = value;
          break;
      }
    });
  } catch (err) {
    console.error(err);
    showNotification("Помилка завантаження загальних налаштувань", "error", 2000);
  }
}

// Зберігає дані для секції "Загальні"
async function saveGeneralSettings(modal: HTMLElement): Promise<number> {
  let changesCount = 0;

  const nameInput = modal.querySelector("#general-sto-name") as HTMLInputElement;
  const addressInput = modal.querySelector("#general-address") as HTMLInputElement;
  const phoneInput = modal.querySelector("#general-phone") as HTMLInputElement;
  const headerColor = modal.querySelector("#general-header-color") as HTMLInputElement;
  const tableColor = modal.querySelector("#general-table-color") as HTMLInputElement;
  const wallpaperMainInput = modal.querySelector("#general-wallpaper-main") as HTMLInputElement;

  const newValues = [
    { id: 1, value: nameInput?.value || "" },
    { id: 2, value: addressInput?.value || "" },
    { id: 3, value: phoneInput?.value || "" },
    { id: 4, value: headerColor?.value || DEFAULT_COLOR },
    { id: 5, value: tableColor?.value || DEFAULT_COLOR },
    { id: 7, value: wallpaperMainInput?.value || "" },
  ];

  for (const { id, value } of newValues) {
    const oldValue = initialSettingsState.get(id);
    if (oldValue !== value) {
      const { error } = await supabase
        .from("settings")
        .update({ "Загальні": value })
        .eq("setting_id", id);

      if (error) {
        console.error(`Помилка при збереженні setting_id ${id}:`, error);
        throw error;
      }
      changesCount++;
    }
  }

  // Оновлюємо globalCache та localStorage, якщо були зміни
  if (changesCount > 0) {
    // Оновлюємо globalCache
    globalCache.generalSettings.stoName = nameInput?.value || "B.S.Motorservice";
    globalCache.generalSettings.address = addressInput?.value || "вул. Корольова, 6, Вінниця";
    globalCache.generalSettings.phone = phoneInput?.value || "068 931 24 38";
    globalCache.generalSettings.headerColor = headerColor?.value || DEFAULT_COLOR;
    globalCache.generalSettings.tableColor = tableColor?.value || DEFAULT_COLOR;
    globalCache.generalSettings.wallpaperMain = wallpaperMainInput?.value || "";
    
    // Зберігаємо в localStorage
    saveGeneralSettingsToLocalStorage();
    
    // Застосовуємо шпалери одразу після збереження
    applyWallpapers();
    
    // Інвалідуємо кеш глобальних даних
    invalidateGlobalDataCache();
  }

  return changesCount;
}

// Ініціалізує обробники для секції "Загальні"
function initGeneralSettingsHandlers(modal: HTMLElement): void {
  // Color pickers
  const headerColor = modal.querySelector("#general-header-color") as HTMLInputElement;
  const tableColor = modal.querySelector("#general-table-color") as HTMLInputElement;
  const headerColorValue = modal.querySelector("#header-color-value") as HTMLElement;
  const tableColorValue = modal.querySelector("#table-color-value") as HTMLElement;

  if (headerColor && headerColorValue) {
    headerColor.addEventListener("input", () => {
      headerColorValue.textContent = headerColor.value;
    });
  }

  if (tableColor && tableColorValue) {
    tableColor.addEventListener("input", () => {
      tableColorValue.textContent = tableColor.value;
    });
  }

  // Кнопка скидання кольорів та шпалер
  const resetBtn = modal.querySelector("#reset-colors-btn") as HTMLButtonElement;
  const wallpaperMainInput = modal.querySelector("#general-wallpaper-main") as HTMLInputElement;
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (headerColor) {
        headerColor.value = DEFAULT_COLOR;
        if (headerColorValue) headerColorValue.textContent = DEFAULT_COLOR;
      }
      if (tableColor) {
        tableColor.value = DEFAULT_COLOR;
        if (tableColorValue) tableColorValue.textContent = DEFAULT_COLOR;
      }
      // Очищаємо поле шпалер
      if (wallpaperMainInput) {
        wallpaperMainInput.value = "";
      }
      showNotification("Кольори та шпалери скинуто до значень за замовчуванням", "info", 1500);
    });
  }
}

function createToggle(id: string, label: string, cls: string): string {
  return `
    <label class="toggle-switch ${cls}">
      <input type="checkbox" id="${id}" />
      <span class="slider"></span>
      <span class="label-text">${label}</span>
    </label>
  `;
}

function createRoleToggles(role: string): string {
  const settings = ROLE_SETTINGS[role as keyof typeof ROLE_SETTINGS];
  if (!settings) return "";
  return settings
    .map((s: any) => {
      if (s.divider) {
        return `<div class="settings-divider"></div>`;
      }
      return createToggle(`role-toggle-${s.id}`, s.label, `_role_${s.id}`);
    })
    .join("");
}

// Функція для додавання нового рядка відсотків
function addPercentageRow(modal: HTMLElement, initialValue: number = 0, settingId?: number): void {
  const container = modal.querySelector("#additional-percentage-rows");
  const addBtn = modal.querySelector("#add-percentage-row") as HTMLButtonElement;
  
  if (!container) return;
  
  // Визначаємо наступний номер рядка (2 або 3)
  const existingRows = container.querySelectorAll(".percentage-row");
  const nextRowNum = settingId || (existingRows.length + 2); // +2 бо перший рядок вже є
  
  // Максимум 3 рядки
  if (nextRowNum > 3) return;
  
  // Перевіряємо чи вже існує цей рядок
  if (modal.querySelector(`#percentage-slider-${nextRowNum}`)) {
    // Просто оновлюємо значення
    const slider = modal.querySelector(`#percentage-slider-${nextRowNum}`) as HTMLInputElement;
    const input = modal.querySelector(`#percentage-input-${nextRowNum}`) as HTMLInputElement;
    if (slider) slider.value = String(initialValue);
    if (input) input.value = String(initialValue);
    return;
  }
  
  // Ховаємо кнопку плюсика якщо досягли максимуму
  if (nextRowNum >= 3 && addBtn) {
    addBtn.style.display = "none";
  }
  
  const rowHtml = `
    <div class="percentage-row" data-setting-id="${nextRowNum}">
      <span class="percentage-number">${nextRowNum}</span>
      <div class="percentage-input-wrapper">
        <input type="range" id="percentage-slider-${nextRowNum}" class="percentage-slider" min="0" max="100" value="${initialValue}" step="1" />
        <div class="percentage-value-display">
          <input type="number" id="percentage-input-${nextRowNum}" class="percentage-input" min="0" max="100" value="${initialValue}" />
          <span class="percent-sign">%</span>
        </div>
      </div>
      <button type="button" class="remove-percentage-btn" id="remove-percentage-row-${nextRowNum}" title="Видалити цей склад">−</button>
    </div>
  `;
  
  container.insertAdjacentHTML("beforeend", rowHtml);
  
  // Додаємо обробники для нового рядка
  const slider = modal.querySelector(`#percentage-slider-${nextRowNum}`) as HTMLInputElement;
  const input = modal.querySelector(`#percentage-input-${nextRowNum}`) as HTMLInputElement;
  const removeBtn = modal.querySelector(`#remove-percentage-row-${nextRowNum}`);
  
  if (slider && input) {
    slider.addEventListener("input", () => {
      input.value = slider.value;
    });
    
    input.addEventListener("input", () => {
      const numValue = parseInt(input.value) || 0;
      if (numValue >= 0 && numValue <= 100) {
        slider.value = String(numValue);
      } else {
        input.value = slider.value;
      }
    });
  }
  
  // Обробник для видалення рядка
  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      const row = modal.querySelector(`.percentage-row[data-setting-id="${nextRowNum}"]`);
      if (row) row.remove();
      
      if (addBtn) {
        addBtn.style.display = "";
      }
      
      // Очищаємо procent в відповідному setting_id
      await supabase
        .from("settings")
        .update({ procent: null })
        .eq("setting_id", nextRowNum);
    });
  }
}

async function loadSettings(modal: HTMLElement): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("setting_id, data, procent")
      .in("setting_id", [1, 2, 3, 4, 5])
      .order("setting_id");

    if (error) throw error;

    // 🔹 Очищуємо попередній стан
    initialSettingsState.clear();
    
    // Очищаємо додаткові рядки відсотків
    const additionalRows = modal.querySelector("#additional-percentage-rows");
    if (additionalRows) additionalRows.innerHTML = "";
    
    // Показуємо кнопку плюсика
    const addBtn = modal.querySelector("#add-percentage-row") as HTMLButtonElement;
    if (addBtn) addBtn.style.display = "";

    Object.values(SETTINGS).forEach((s) => {
      const el = modal.querySelector(`#${s.id}`) as HTMLInputElement;
      if (el?.type === "checkbox") el.checked = false;
    });

    // Збираємо дані про заповнені відсотки
    const procentData: { settingId: number; value: number }[] = [];

    data?.forEach((row: any) => {
      const setting = SETTINGS[row.setting_id as keyof typeof SETTINGS];
      
      // Обробка відсотків - збираємо всі заповнені
      if (row.setting_id >= 1 && row.setting_id <= 3 && row.procent !== null && row.procent !== undefined) {
        procentData.push({ settingId: row.setting_id, value: row.procent });
      }
      
      // Обробка чекбоксів
      if (setting && setting.id !== "percentage-value") {
        const checkbox = modal.querySelector(
          `#${setting.id}`
        ) as HTMLInputElement;
        if (checkbox) checkbox.checked = !!row.data;
        initialSettingsState.set(row.setting_id, !!row.data);
      }
    });

    // Відображаємо заповнені відсотки
    procentData.forEach((item, index) => {
      if (index === 0) {
        // Перший рядок вже існує в HTML
        const slider1 = modal.querySelector("#percentage-slider-1") as HTMLInputElement;
        const input1 = modal.querySelector("#percentage-input-1") as HTMLInputElement;
        if (slider1) slider1.value = String(item.value);
        if (input1) input1.value = String(item.value);
        initialSettingsState.set(item.settingId, item.value);
      } else {
        // Додаткові рядки створюємо динамічно
        addPercentageRow(modal, item.value, item.settingId);
        initialSettingsState.set(item.settingId, item.value);
      }
    });

    // Якщо немає жодного заповненого відсотка, встановлюємо 0 для першого
    if (procentData.length === 0) {
      const slider1 = modal.querySelector("#percentage-slider-1") as HTMLInputElement;
      const input1 = modal.querySelector("#percentage-input-1") as HTMLInputElement;
      if (slider1) slider1.value = "0";
      if (input1) input1.value = "0";
      initialSettingsState.set(1, 0);
    }

    modal
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((cb) => {
        cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
      });
  } catch (err) {
    console.error(err);
    showNotification("Помилка завантаження налаштувань", "error", 2000);
  }
}

async function loadRoleSettings(
  modal: HTMLElement,
  role: string
): Promise<void> {
  const settings = ROLE_SETTINGS[role as keyof typeof ROLE_SETTINGS];
  const column = ROLE_TO_COLUMN[role as keyof typeof ROLE_TO_COLUMN];

  if (!settings || !column) return;

  try {
    // 🔹 Очищуємо попередній стан
    initialSettingsState.clear();

    // Фільтруємо тільки реальні налаштування (без divider)
    const settingIds = settings
      .filter((s: any) => !s.divider && s.id)
      .map((s: any) => s.id);

    const { data, error } = await supabase
      .from("settings")
      .select(`setting_id, "${column}"`)
      .in("setting_id", settingIds)
      .order("setting_id");

    if (error) throw error;

    settings.forEach((s: any) => {
      if (!s.divider && s.id) {
        const el = modal.querySelector(
          `#role-toggle-${s.id}`
        ) as HTMLInputElement;
        if (el?.type === "checkbox") el.checked = false;
      }
    });

    data?.forEach((row: any) => {
      const checkbox = modal.querySelector(
        `#role-toggle-${row.setting_id}`
      ) as HTMLInputElement;
      const value = !!row[column];
      if (checkbox) checkbox.checked = value;
      // 🔹 Зберігаємо початкове значення
      initialSettingsState.set(row.setting_id, value);
    });

    modal
      .querySelectorAll<HTMLInputElement>('[id^="role-toggle-"]')
      .forEach((cb) => {
        cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
      });
  } catch (err) {
    console.error(err);
    showNotification(
      `Помилка завантаження налаштувань для ролі ${role}`,
      "error",
      2000
    );
  }
}

async function saveSettings(modal: HTMLElement): Promise<boolean> {
  try {
    const roleButton = modal.querySelector(
      "#role-toggle-button"
    ) as HTMLButtonElement;

    // ✅ гарантуємо чисту назву ролі
    let role = (roleButton?.textContent || "Адміністратор").trim();

    // ✅ безпечний фолбек, якщо роль невідома/непідтримувана
    if (!(role in ROLE_TO_COLUMN)) {
      console.warn("Невідома роль у кнопці, фолбек до Адміністратор:", role);
      role = "Адміністратор";
    }

    const column = ROLE_TO_COLUMN[role as keyof typeof ROLE_TO_COLUMN];
    let changesCount = 0;

    if (role === "Адміністратор") {
      // Перевіряємо і зберігаємо тільки змінені налаштування
      const checkbox1 = modal.querySelector("#toggle-shop") as HTMLInputElement;
      const newValue1 = checkbox1?.checked ?? false;
      if (initialSettingsState.get(1) !== newValue1) {
        const { error } = await supabase
          .from("settings")
          .update({ [column]: newValue1 })
          .eq("setting_id", 1);
        if (error) throw error;
        changesCount++;
      }

      const checkbox2 = modal.querySelector("#toggle-receiver") as HTMLInputElement;
      const newValue2 = checkbox2?.checked ?? false;
      if (initialSettingsState.get(2) !== newValue2) {
        const { error } = await supabase
          .from("settings")
          .update({ [column]: newValue2 })
          .eq("setting_id", 2);
        if (error) throw error;
        changesCount++;
      }

      const checkbox3 = modal.querySelector("#toggle-zarplata") as HTMLInputElement;
      const newValue3 = checkbox3?.checked ?? false;
      if (initialSettingsState.get(3) !== newValue3) {
        const { error } = await supabase
          .from("settings")
          .update({ [column]: newValue3 })
          .eq("setting_id", 3);
        if (error) throw error;
        changesCount++;
      }

      // Відсоток 1 (setting_id=1)
      const input1 = modal.querySelector("#percentage-input-1") as HTMLInputElement;
      const raw1 = Number(input1?.value ?? 0);
      const newValue4 = Math.min(100, Math.max(0, Math.floor(isFinite(raw1) ? raw1 : 0)));
      if (initialSettingsState.get(1) !== newValue4) {
        const { error } = await supabase
          .from("settings")
          .update({ procent: newValue4 })
          .eq("setting_id", 1);
        if (error) throw error;
        changesCount++;
      }

      // Відсоток 2 (setting_id=2)
      const input2 = modal.querySelector("#percentage-input-2") as HTMLInputElement;
      if (input2) {
        const raw2 = Number(input2?.value ?? 0);
        const newValue4_2 = Math.min(100, Math.max(0, Math.floor(isFinite(raw2) ? raw2 : 0)));
        if (initialSettingsState.get(2) !== newValue4_2) {
          const { error } = await supabase
            .from("settings")
            .update({ procent: newValue4_2 })
            .eq("setting_id", 2);
          if (error) throw error;
          changesCount++;
        }
      }

      // Відсоток 3 (setting_id=3)
      const input3 = modal.querySelector("#percentage-input-3") as HTMLInputElement;
      if (input3) {
        const raw3 = Number(input3?.value ?? 0);
        const newValue4_3 = Math.min(100, Math.max(0, Math.floor(isFinite(raw3) ? raw3 : 0)));
        if (initialSettingsState.get(3) !== newValue4_3) {
          const { error } = await supabase
            .from("settings")
            .update({ procent: newValue4_3 })
            .eq("setting_id", 3);
          if (error) throw error;
          changesCount++;
        }
      }

      const checkbox5 = modal.querySelector("#toggle-sms") as HTMLInputElement;
      const newValue5 = checkbox5?.checked ?? false;
      if (initialSettingsState.get(5) !== newValue5) {
        const { error } = await supabase
          .from("settings")
          .update({ [column]: newValue5 })
          .eq("setting_id", 5);
        if (error) throw error;
        changesCount++;
      }
    } else if (role === "Загальні") {
      // Зберегти налаштування для секції "Загальні"
      changesCount = await saveGeneralSettings(modal);
    } else {
      // Зберегти налаштування для інших ролей - ТІЛЬКИ ЗМІНЕНІ
      const settings = ROLE_SETTINGS[role as keyof typeof ROLE_SETTINGS];
      if (settings) {
        const realSettings = settings.filter((s: any) => !s.divider && s.id);

        for (const setting of realSettings) {
          const checkbox = modal.querySelector(
            `#role-toggle-${setting.id}`
          ) as HTMLInputElement;
          const newValue = checkbox?.checked ?? false;
          const oldValue = initialSettingsState.get(setting.id as number);

          // 🔹 Зберігаємо тільки якщо значення змінилось
          if (oldValue !== newValue) {
            const { error } = await supabase
              .from("settings")
              .update({ [column]: newValue })
              .eq("setting_id", setting.id);

            if (error) {
              console.error(
                `Помилка при збереженні setting_id ${setting.id}:`,
                error
              );
              throw error;
            }
            changesCount++;
          }
        }

        console.log(`Збережено ${changesCount} зміни(н)`);
      }
    }

    if (changesCount === 0) {
      showNotification("Змін не було", "info", 1500);
    } else {
      resetPercentCache();
      showNotification(`Збережено ${changesCount} зміни(н)!`, "success", 1500);
    }
    return true;
  } catch (err) {
    console.error("Save error details:", err);
    showNotification("Помилка збереження", "error", 1500);
    return false;
  }
}

function updateRoleTogglesVisibility(modal: HTMLElement, role: string): void {
  const container = modal.querySelector("#role-toggles-container");
  const mainToggles = modal.querySelector("#main-toggles-container");
  const percentageControl = modal.querySelector(".percentage-control");
  const modalWindow = modal.querySelector(".modal-window") as HTMLElement;
  const roleButton = modal.querySelector("#role-toggle-button") as HTMLElement;

  if (!container) return;

  const colors = ROLE_COLORS[role as keyof typeof ROLE_COLORS];
  if (colors && modalWindow) {
    modalWindow.style.border = `2px solid ${colors["modal-window"]}`;
  }
  if (colors && roleButton) {
    roleButton.style.background = colors.button;
    roleButton.onmouseenter = () => {
      roleButton.style.background = colors.buttonHover;
    };
    roleButton.onmouseleave = () => {
      roleButton.style.background = colors.button;
    };
  }

  if (role === "Адміністратор") {
    container.innerHTML = "";
    if (mainToggles) (mainToggles as HTMLElement).style.display = "";
    if (percentageControl)
      (percentageControl as HTMLElement).style.display = "";
    loadSettings(modal);
  } else if (role === "Загальні") {
    // Обробка секції "Загальні"
    if (mainToggles) (mainToggles as HTMLElement).style.display = "none";
    if (percentageControl)
      (percentageControl as HTMLElement).style.display = "none";

    container.innerHTML = createGeneralSettingsHTML();
    initGeneralSettingsHandlers(modal);
    loadGeneralSettings(modal);
  } else {
    if (mainToggles) (mainToggles as HTMLElement).style.display = "none";
    if (percentageControl)
      (percentageControl as HTMLElement).style.display = "none";

    const togglesHTML = createRoleToggles(role);
    container.innerHTML = togglesHTML;

    container
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", () => {
          cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
        });
      });

    loadRoleSettings(modal, role);
  }
}

export async function createSettingsModal(): Promise<void> {
  if (document.getElementById("modal-settings")) return;

  const modal = document.createElement("div");
  modal.id = "modal-settings";
  modal.className = "modal-settings hidden";

  const toggles = Object.values(SETTINGS)
    .filter((s) => s.id !== "percentage-value")
    .map((s) => createToggle(s.id, s.label, s.class))
    .join("");

  const initialRole = ROLES[0]; // "Адміністратор"
  const colors = ROLE_COLORS[initialRole as keyof typeof ROLE_COLORS];

  modal.innerHTML = `
    <div class="modal-window" style="background-color: #ffffff; border: 2px solid ${colors["modal-window"]}">
      <button id="role-toggle-button" type="button" class="role-toggle-button" style="background: ${colors.button}">
        ${initialRole}
      </button>

      <div id="role-toggles-container"></div>

      <div id="main-toggles-container">
        ${toggles}
      </div>

      <div class="percentage-control">
        <label class="percentage-label">
          <span class="percentage-title">Націнка на запчастини</span>
          <div class="percentage-row" data-setting-id="1">
            <span class="percentage-number">1</span>
            <div class="percentage-input-wrapper">
              <input type="range" id="percentage-slider-1" class="percentage-slider" min="0" max="100" value="0" step="1" />
              <div class="percentage-value-display">
                <input type="number" id="percentage-input-1" class="percentage-input" min="0" max="100" value="0" />
                <span class="percent-sign">%</span>
              </div>
            </div>
            <button type="button" class="add-percentage-btn" id="add-percentage-row" title="Додати ще один склад">+</button>
          </div>
          <div id="additional-percentage-rows"></div>
        </label>
      </div>

      <div class="modal-actions">
        <button id="modal-cancel-button" type="button">Вийти</button>
        <button id="modal-ok-button" type="button">ОК</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // ✅ одразу ініціалізуємо стан під поточну роль і підтягуємо значення
  updateRoleTogglesVisibility(modal, initialRole);
  await loadSettings(modal); // для Адміністратора тягне data/procent

  // Обробник для кнопки додавання нового рядка відсотків
  const addPercentageBtn = modal.querySelector("#add-percentage-row");
  if (addPercentageBtn) {
    addPercentageBtn.addEventListener("click", () => {
      addPercentageRow(modal);
    });
  }

  const roleButton = modal.querySelector(
    "#role-toggle-button"
  ) as HTMLButtonElement;
  let currentRoleIndex = 0;

  if (roleButton) {
    roleButton.addEventListener("click", (e: MouseEvent) => {
      const buttonRect = roleButton.getBoundingClientRect();
      const clickX = e.clientX - buttonRect.left;
      const buttonWidth = buttonRect.width;
      
      // Ліва зона 40% ширини - для перемикання назад
      // Права зона 60% ширини - для перемикання вперед
      const leftZoneWidth = buttonWidth * 0.4;
      
      if (clickX < leftZoneWidth) {
        // Клік на ліву частину (40%) - назад
        currentRoleIndex = (currentRoleIndex - 1 + ROLES.length) % ROLES.length;
      } else {
        // Клік на праву частину (60%) - вперед
        currentRoleIndex = (currentRoleIndex + 1) % ROLES.length;
      }
      
      const newRole = ROLES[currentRoleIndex];
      roleButton.textContent = newRole;
      updateRoleTogglesVisibility(modal, newRole);
    });
  }

  const slider = modal.querySelector("#percentage-slider-1") as HTMLInputElement;
  const input = modal.querySelector("#percentage-input-1") as HTMLInputElement;

  const updateInputFromSlider = () => {
    if (input && slider) {
      input.value = slider.value;
    }
  };

  if (slider) {
    slider.addEventListener("input", updateInputFromSlider);
  }

  if (input) {
    input.addEventListener("input", () => {
      if (slider) {
        const numValue = parseInt(input.value) || 0;
        if (numValue >= 0 && numValue <= 100) {
          slider.value = String(numValue);
          updateInputFromSlider();
        } else {
          input.value = slider.value;
        }
      }
    });
  }

  modal
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((cb) => {
      cb.addEventListener("change", () => {
        cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
      });
    });

  await loadSettings(modal);

  modal
    .querySelector("#modal-ok-button")
    ?.addEventListener("click", async () => {
      if (await saveSettings(modal)) {
        // modal.classList.add("hidden");
      }
    });

  modal.querySelector("#modal-cancel-button")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

export async function openSettingsModal(): Promise<void> {
  const modal = document.getElementById("modal-settings");
  if (modal) {
    const roleButton = modal.querySelector(
      "#role-toggle-button"
    ) as HTMLButtonElement;
    const role = roleButton?.textContent?.trim() || ROLES[0];
    updateRoleTogglesVisibility(modal, role);
    modal.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector('[data-action="openSettings"]');
  btn?.addEventListener("click", async (e: Event) => {
    e.preventDefault();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      alert("⛔ Доступ заблоковано, Ви не авторизовані");
      return;
    }
    if (!document.getElementById("modal-settings")) {
      await createSettingsModal();
    }
    await openSettingsModal();
  });
});

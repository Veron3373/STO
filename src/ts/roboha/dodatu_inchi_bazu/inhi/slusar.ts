import { supabase } from "../../../vxid/supabaseClient";
import {
  updateAllBd,
  updateTableNameDisplay,
} from "../dodatu_inchi_bazu_danux";
import { setupEnterNavigationForFields } from "../../redahyvatu_klient_machuna/enter_navigation";
import { setupDropdownKeyboard } from "./sharedAutocomplete";
import { userAccessLevel } from "../../tablucya/users";

let currentLoadedData: any[] = [];
let currentConfig: {
  table: string;
  field: string;
  deepPath?: string[];
  needsJsonParsing?: boolean;
} | null = null;

let lastValidSlyusarId: number | null = null;

// Функція отримання даних користувача з localStorage
const getCurrentUserFromLocalStorage = (): {
  name: string;
  access: string;
} | null => {
  try {
    const userDataStr = localStorage.getItem("userAuthData");
    if (!userDataStr) return null;
    const userData = JSON.parse(userDataStr);
    return {
      name: userData.Name || "",
      access: userData.Доступ || "",
    };
  } catch (error) {
    console.error("Помилка отримання даних користувача з localStorage:", error);
    return null;
  }
};

const databaseMapping = {
  Слюсар: {
    table: "slyusars",
    field: "data",
    deepPath: ["Name"],
    needsJsonParsing: true,
  },
};

const extractNestedValue = (obj: any, path: string[]): string | undefined => {
  return path.reduce(
    (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
    obj,
  );
};

// Функція нормалізації імені
const normalizeName = (s: string) => {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
};

// Функція перевірки чи існує співробітник з таким іменем
export const checkEmployeeExists = async (name: string): Promise<boolean> => {
  try {
    const { data: rows, error } = await supabase
      .from("slyusars")
      .select("data");
    if (error) {
      console.error("Помилка перевірки існування співробітника:", error);
      return false;
    }
    const needle = normalizeName(name);
    for (const r of rows ?? []) {
      try {
        const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        const nm = normalizeName(d?.Name ?? "");
        if (nm && nm === needle) return true;
      } catch {}
    }
    return false;
  } catch (error) {
    console.error("Помилка при перевірці існування співробітника:", error);
    return false;
  }
};

// Оновлена функція updateAllBdFromInput
const updateAllBdFromInput = async (
  inputValue: string,
  isFromDropdown: boolean = false,
) => {
  if (!inputValue.trim()) {
    return;
  }
  if (!currentConfig) {
    updateAllBd(null);
    return;
  }
  const { table, field, deepPath, needsJsonParsing } = currentConfig;
  let foundMatch = false;
  if (currentLoadedData && currentLoadedData.length > 0) {
    for (const item of currentLoadedData) {
      let parsed = item;
      if (needsJsonParsing && typeof item[field] === "string") {
        try {
          parsed = { ...item, [field]: JSON.parse(item[field]) };
        } catch {
          continue;
        }
      }
      let valueToCheck: string | undefined;
      if (deepPath) {
        valueToCheck = extractNestedValue(parsed[field], deepPath);
      } else {
        valueToCheck =
          needsJsonParsing || typeof item[field] === "object"
            ? parsed[field]
            : item[field];
        if (typeof valueToCheck === "object")
          valueToCheck = JSON.stringify(valueToCheck);
        else if (typeof valueToCheck !== "string")
          valueToCheck = String(valueToCheck);
      }
      if (valueToCheck?.trim() === inputValue.trim()) {
        foundMatch = true;
        const singularTable = table.endsWith("s") ? table.slice(0, -1) : table;
        const idField = `${singularTable}_id`;
        const idValue = item[idField] !== undefined ? item[idField] : null;

        // Зберігаємо ID для можливого перейменування/редагування
        if (idValue !== null && table === "slyusars") {
          lastValidSlyusarId = idValue;
        }

        let dataFieldValue: any;
        if (needsJsonParsing && typeof item[field] === "string") {
          try {
            dataFieldValue = JSON.parse(item[field]);
          } catch {
            dataFieldValue = item[field];
          }
        } else {
          dataFieldValue = item[field];
        }
        // Заповнюємо додаткові інпути при знайденні запису
        fillSlusarInputs(dataFieldValue, inputValue.trim());
        const result = {
          table: table,
          [idField]: idValue,
          data:
            deepPath && deepPath.length === 1
              ? { [deepPath[0]]: extractNestedValue(dataFieldValue, deepPath) }
              : typeof dataFieldValue === "object" &&
                  !Array.isArray(dataFieldValue)
                ? dataFieldValue
                : { [field]: dataFieldValue },
        };
        updateAllBd(JSON.stringify(result, null, 2));
        return;
      }
    }
  }
  if (!foundMatch) {
    if (isFromDropdown) {
      const singularTable = table.endsWith("s") ? table.slice(0, -1) : table;
      const idField = `${singularTable}_id`;
      // Очищаємо додаткові інпути якщо запис не знайдено
      clearSlusarInputs();
      const newRecordResult = {
        table: table,
        [idField]: null,
        data:
          deepPath && deepPath.length === 1
            ? { [deepPath[0]]: inputValue.trim() }
            : { [field]: inputValue.trim() },
      };
      updateAllBd(JSON.stringify(newRecordResult, null, 2));
    }
    // Перевірка дублікатів видалена - не потрібна при редагуванні
  }
};

// Оновлена функція для заповнення додаткових інпутів
const fillSlusarInputs = (data: any, selectedName: string) => {
  const passwordInput = document.getElementById(
    "slusar-password",
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access",
  ) as HTMLSelectElement;
  const percentInput = document.getElementById(
    "slusar-percent",
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts",
  ) as HTMLInputElement;
  const warehouseSelect = document.getElementById(
    "slusar-warehouse",
  ) as HTMLSelectElement;
  const searchInput = document.getElementById(
    "search-input-all_other_bases",
  ) as HTMLInputElement;

  // Перевірка прав доступу
  const currentUser = getCurrentUserFromLocalStorage();
  const isAdmin = currentUser?.access === "Адміністратор";

  // ✅ ЗАХИСТ: Перевірка чи це slyusar_id = 1
  const isSlyusarId1 = lastValidSlyusarId === 1;

  if (passwordInput && data?.Пароль !== undefined) {
    passwordInput.value = String(data.Пароль);
    // Пароль завжди редагується
    passwordInput.disabled = false;
  }

  // ✅ ЗАХИСТ: Для slyusar_id = 1 - поле доступне для вибору, але заборонено ручне редагування
  if (searchInput) {
    if (isSlyusarId1) {
      // Поле активне для вибору з dropdown, але readonly для ручного введення
      searchInput.readOnly = true;
      searchInput.style.backgroundColor = "#f9f9f9";
      searchInput.style.cursor = "pointer";
      searchInput.title =
        "Ім'я адміністратора не можна змінити. Виберіть іншого користувача зі списку.";
    } else {
      // Для інших користувачів - повне редагування
      searchInput.readOnly = false;
      searchInput.style.backgroundColor = "";
      searchInput.style.cursor = "";
      searchInput.title = "";
    }
  }

  if (accessSelect && data?.Доступ) {
    // ✅ ЗАХИСТ: Блокуємо Доступ для slyusar_id = 1
    if (isSlyusarId1) {
      accessSelect.value = data.Доступ;
      accessSelect.disabled = true;
      accessSelect.title =
        "Доступ адміністраторського акаунту не можна змінити";
    }
    // Якщо вибрано "Бемба В. Я", встановлюємо Адміністратор доступ і блокуємо селект
    else if (normalizeName(selectedName) === normalizeName("Бемба В. Я")) {
      accessSelect.value = "Адміністратор";
      accessSelect.disabled = true;
    } else {
      accessSelect.value = data.Доступ;
      // Блокуємо для не-адміністраторів
      accessSelect.disabled = !isAdmin;
    }
    // Оновлюємо видимість інпутів відповідно до ролі
    updatePercentInputsVisibility(accessSelect.value);
    updatePasswordVisibility(accessSelect.value);
  }
  if (percentInput && data?.ПроцентРоботи !== undefined) {
    percentInput.value = String(data.ПроцентРоботи);
    // Блокуємо для не-адміністраторів
    percentInput.disabled = !isAdmin;
  }
  if (percentPartsInput && data?.ПроцентЗапчастин !== undefined) {
    percentPartsInput.value = String(data.ПроцентЗапчастин);
    // Блокуємо для не-адміністраторів
    percentPartsInput.disabled = !isAdmin;
  }
  if (warehouseSelect && data?.Склад !== undefined) {
    warehouseSelect.value = String(data.Склад);
    // Блокуємо для не-адміністраторів
    warehouseSelect.disabled = !isAdmin;
  }
};

// Функція для завантаження списку складів з БД
const getWarehouseNumbers = async (): Promise<number[]> => {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("setting_id")
      .not("setting_id", "is", null)
      .not("procent", "is", null);

    if (error) {
      console.error("Помилка завантаження складів:", error);
      return [0]; // Повертаємо тільки 0 при помилці
    }

    // Отримуємо унікальні setting_id значення і сортуємо їх
    const ids = data
      ? Array.from(
          new Set(data.map((row: any) => Number(row.setting_id))),
        ).sort((a, b) => a - b)
      : [];

    // Завжди додаємо 0 на початку
    return [0, ...ids];
  } catch (error) {
    console.error("Помилка при отриманні номерів складів:", error);
    return [0];
  }
};

// Функція для керування видимістю пароля
const updatePasswordVisibility = (selectedRole: string) => {
  const passwordInput = document.getElementById(
    "slusar-password",
  ) as HTMLInputElement;
  if (!passwordInput) return;

  // Завжди за замовчуванням приховуємо пароль
  passwordInput.type = "password";

  // Якщо поточний користувач - Адміністратор
  if (userAccessLevel === "Адміністратор") {
    // Показуємо пароль тільки для НЕ адміністраторів
    if (selectedRole !== "Адміністратор") {
      passwordInput.type = "text";
    }
  }
  // Для всіх інших користувачів - пароль завжди прихований
};

// Функція для керування видимістю інпутів
const updatePercentInputsVisibility = (role: string) => {
  const percentWrapper = document.getElementById("slusar-percent");
  const partsWrapper = document.getElementById("slusar-percent-parts-wrapper");
  const warehouseWrapper = document.getElementById("slusar-warehouse-wrapper");

  // Для Запчастиста: показуємо % з запчастин та Склад (ховаємо % роботи)
  if (role === "Запчастист") {
    if (percentWrapper) {
      percentWrapper.parentElement?.classList.add("hidden-all_other_bases");
    }
    if (partsWrapper) {
      partsWrapper.classList.remove("hidden-all_other_bases");
    }
    if (warehouseWrapper) {
      warehouseWrapper.classList.remove("hidden-all_other_bases");
    }
  }
  // Для Приймальника: показуємо % з запчастин та Склад (разом з % роботи)
  else if (role === "Приймальник") {
    if (percentWrapper) {
      percentWrapper.parentElement?.classList.remove("hidden-all_other_bases");
    }
    if (partsWrapper) {
      partsWrapper.classList.remove("hidden-all_other_bases");
    }
    if (warehouseWrapper) {
      warehouseWrapper.classList.remove("hidden-all_other_bases");
    }
  }
  // Для інших ролей: показуємо тільки % роботи (ховаємо запчастини та склад)
  else {
    if (percentWrapper) {
      percentWrapper.parentElement?.classList.remove("hidden-all_other_bases");
    }
    if (partsWrapper) {
      partsWrapper.classList.add("hidden-all_other_bases");
    }
    if (warehouseWrapper) {
      warehouseWrapper.classList.add("hidden-all_other_bases");
    }
  }
};

// Функція для очищення додаткових інпутів
const clearSlusarInputs = () => {
  lastValidSlyusarId = null; // Скидаємо збережений ID
  const passwordInput = document.getElementById(
    "slusar-password",
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access",
  ) as HTMLSelectElement;
  const percentInput = document.getElementById(
    "slusar-percent",
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts",
  ) as HTMLInputElement;
  const warehouseSelect = document.getElementById(
    "slusar-warehouse",
  ) as HTMLSelectElement;
  const searchInput = document.getElementById(
    "search-input-all_other_bases",
  ) as HTMLInputElement;

  const currentUser = getCurrentUserFromLocalStorage();
  const isAdmin = currentUser?.access === "Адміністратор";

  // Скидаємо стан поля пошуку
  if (searchInput) {
    searchInput.readOnly = false;
    searchInput.disabled = false;
    searchInput.style.backgroundColor = "";
    searchInput.style.cursor = "";
    searchInput.title = "";
  }

  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.disabled = false; // Пароль завжди доступний
  }
  if (accessSelect) {
    accessSelect.value = "Слюсар";
    accessSelect.disabled = !isAdmin; // Блокуємо для не-адміністраторів
    // Скидаємо видимість (для Слюсаря поле запчастин приховане)
    updatePercentInputsVisibility("Слюсар");
    updatePasswordVisibility("Слюсар");
  }
  if (percentInput) {
    percentInput.value = "50";
    percentInput.disabled = !isAdmin; // Блокуємо для не-адміністраторів
  }
  if (percentPartsInput) {
    percentPartsInput.value = "0";
    percentPartsInput.disabled = !isAdmin; // Блокуємо для не-адміністраторів
  }
  if (warehouseSelect) {
    warehouseSelect.value = "0";
    warehouseSelect.disabled = !isAdmin; // Блокуємо для не-адміністраторів
  }
};

const createCustomDropdown = (
  data: any[],
  field: string,
  inputElement: HTMLInputElement | null,
  deepPath?: string[],
  needsJsonParsing?: boolean,
) => {
  const dropdown = document.getElementById(
    "custom-dropdown-all_other_bases",
  ) as HTMLDivElement;
  if (!dropdown || !inputElement) return;

  // Cleanup previous listeners if any
  const extendedInput = inputElement as HTMLInputElement & {
    _dropdownCleanup?: () => void;
  };
  if (extendedInput._dropdownCleanup) {
    extendedInput._dropdownCleanup();
    extendedInput._dropdownCleanup = undefined;
  }

  // Setup keyboard navigation (only once)
  setupDropdownKeyboard(inputElement, dropdown);

  currentLoadedData = data;
  const values = data
    .map((item) => {
      let parsed = item;
      if (needsJsonParsing && typeof item[field] === "string") {
        try {
          parsed = { ...item, [field]: JSON.parse(item[field]) };
        } catch {
          return null;
        }
      }
      let value;
      if (deepPath) {
        value = extractNestedValue(
          needsJsonParsing ? parsed[field] : item[field],
          deepPath,
        );
      } else {
        value =
          needsJsonParsing || typeof item[field] === "object"
            ? parsed[field]
            : item[field];
      }
      if (value !== null && value !== undefined) {
        return String(value).trim();
      }
      return null;
    })
    .filter((val): val is string => typeof val === "string" && val.length > 0);
  const uniqueValues = [...new Set(values)];

  const renderSuggestions = (filter: string) => {
    dropdown.innerHTML = "";
    const filtered = uniqueValues.filter((val) =>
      val.toLowerCase().includes(filter.toLowerCase()),
    );
    if (filtered.length === 0) {
      dropdown.classList.add("hidden-all_other_bases");
      return;
    }

    // Порядок рівнів доступу для сортування
    const accessOrder = {
      Адміністратор: 1,
      Приймальник: 2,
      Слюсар: 3,
      Запчастист: 4,
      Складовщик: 5,
    };

    // Створюємо масив з даними для сортування
    const itemsWithData = filtered.map((val) => {
      // Знаходимо дані співробітника
      let employeeData: any = null;
      for (const item of currentLoadedData) {
        let parsed = item;
        if (needsJsonParsing && typeof item[field] === "string") {
          try {
            parsed = { ...item, [field]: JSON.parse(item[field]) };
          } catch {
            continue;
          }
        }
        let valueToCheck: string | undefined;
        if (deepPath) {
          valueToCheck = extractNestedValue(parsed[field], deepPath);
        } else {
          valueToCheck =
            needsJsonParsing || typeof item[field] === "object"
              ? parsed[field]
              : item[field];
        }
        if (valueToCheck !== null && valueToCheck !== undefined) {
          if (String(valueToCheck).trim() === val) {
            employeeData =
              needsJsonParsing && typeof item[field] === "string"
                ? JSON.parse(item[field])
                : item[field];
            break;
          }
        }
      }
      return { name: val, data: employeeData };
    });

    // Сортуємо: спочатку по рівню доступу, потім по алфавіту
    itemsWithData.sort((a, b) => {
      const accessA = a.data?.Доступ || "";
      const accessB = b.data?.Доступ || "";

      const orderA = accessOrder[accessA as keyof typeof accessOrder] || 999;
      const orderB = accessOrder[accessB as keyof typeof accessOrder] || 999;

      // Спочатку порівнюємо по рівню доступу
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Якщо рівень доступу однаковий, сортуємо по алфавіту
      return a.name.localeCompare(b.name, "uk");
    });

    itemsWithData.forEach(({ name: val, data: employeeData }) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "8px 12px";
      item.style.cursor = "pointer";

      // Ліва частина - ПІБ
      const nameSpan = document.createElement("span");
      nameSpan.textContent = val;
      nameSpan.style.flex = "1";

      // Права частина - Доступ та Пароль
      const infoSpan = document.createElement("span");
      infoSpan.style.display = "flex";
      infoSpan.style.gap = "15px";
      infoSpan.style.fontSize = "0.9em";
      infoSpan.style.color = "#666";

      if (employeeData) {
        const access = employeeData.Доступ || "";
        const password = employeeData.Пароль || "";
        const isAdmin = access === "Адміністратор";

        // Показуємо рівень доступу
        const accessSpan = document.createElement("span");
        accessSpan.textContent = access;
        accessSpan.style.fontWeight = "500";
        accessSpan.style.minWidth = "120px";

        // Показуємо пароль (зірочки для адміністраторів)
        const passwordSpan = document.createElement("span");
        passwordSpan.style.minWidth = "80px";
        passwordSpan.style.fontFamily = "monospace";

        if (isAdmin) {
          // Для адміністраторів завжди зірочки
          passwordSpan.textContent = "****";
          passwordSpan.title = "Пароль адміністратора прихований";
        } else {
          // Для інших - зірочки, але при ховері показуємо пароль
          passwordSpan.textContent = "****";
          passwordSpan.dataset.realPassword = password;
        }

        infoSpan.appendChild(accessSpan);
        infoSpan.appendChild(passwordSpan);
      }

      item.appendChild(nameSpan);
      item.appendChild(infoSpan);

      item.onmouseenter = () => {
        item.classList.add("selected");
        item.style.backgroundColor = "#e3f2fd";

        // Показуємо реальний пароль при ховері (тільки для не-адміністраторів)
        const passwordSpan = infoSpan.querySelector(
          "span:last-child",
        ) as HTMLElement;
        if (passwordSpan && passwordSpan.dataset.realPassword) {
          passwordSpan.textContent = passwordSpan.dataset.realPassword;
        }

        Array.from(dropdown.children).forEach((child) => {
          if (child !== item) {
            child.classList.remove("selected");
            (child as HTMLElement).style.backgroundColor = "white";

            // Ховаємо пароль для інших елементів
            const otherInfoSpan = (child as HTMLElement).querySelector(
              "span:last-child",
            );
            if (otherInfoSpan) {
              const otherPasswordSpan = otherInfoSpan.querySelector(
                "span:last-child",
              ) as HTMLElement;
              if (otherPasswordSpan && otherPasswordSpan.dataset.realPassword) {
                otherPasswordSpan.textContent = "****";
              }
            }
          }
        });
      };

      item.onmouseleave = () => {
        // Повертаємо зірочки при виході миші
        const passwordSpan = infoSpan.querySelector(
          "span:last-child",
        ) as HTMLElement;
        if (passwordSpan && passwordSpan.dataset.realPassword) {
          passwordSpan.textContent = "****";
        }
      };

      const onSelect = (e?: Event) => {
        if (e && e.type === "mousedown") e.preventDefault();
        inputElement.value = val;
        dropdown.classList.add("hidden-all_other_bases");
        updateAllBdFromInput(val, true);
      };
      item.addEventListener("mousedown", onSelect);
      item.addEventListener("click", onSelect);
      dropdown.appendChild(item);
    });
    dropdown.classList.remove("hidden-all_other_bases");
  };

  // Event Handlers
  const onInput = () => {
    renderSuggestions(inputElement.value.trim());
    updateAllBdFromInput(inputElement.value.trim(), false);
  };

  const onFocus = () => {
    // Якщо поле readonly (захищений адмін), показуємо всі варіанти (скидаємо фільтр)
    const filter = inputElement.readOnly ? "" : inputElement.value.trim();
    renderSuggestions(filter);
  };

  const onClick = (e: Event) => {
    e.stopPropagation(); // Prevents document click from closing the dropdown immediately
    // Якщо поле readonly (захищений адмін), показуємо всі варіанти (скидаємо фільтр)
    const filter = inputElement.readOnly ? "" : inputElement.value.trim();
    renderSuggestions(filter);
  };

  const onDocClick = (e: Event) => {
    if (!dropdown.contains(e.target as Node)) {
      dropdown.classList.add("hidden-all_other_bases");
    }
  };

  // Attach Listeners
  inputElement.addEventListener("input", onInput);
  inputElement.addEventListener("focus", onFocus);
  inputElement.addEventListener("click", onClick);
  document.addEventListener("click", onDocClick);

  // Store cleanup function
  extendedInput._dropdownCleanup = () => {
    inputElement.removeEventListener("input", onInput);
    inputElement.removeEventListener("focus", onFocus);
    inputElement.removeEventListener("click", onClick);
    document.removeEventListener("click", onDocClick);
  };

  const rect = inputElement.getBoundingClientRect();
  dropdown.style.minWidth = `${rect.width}px`;
};

// Функція для отримання та відображення статистики співробітників
const fetchAndDisplayEmployeeStats = async () => {
  try {
    const { data: rows, error } = await supabase
      .from("slyusars")
      .select("data");

    if (error || !rows) {
      console.error("Помилка завантаження статистики співробітників:", error);
      return;
    }

    // Підрахунок кількості за рівнями доступу
    const accessLevelCounts: { [key: string]: number } = {};

    rows.forEach((row) => {
      try {
        const data =
          typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        const accessLevel = data?.Доступ || "Невідомо";

        if (accessLevelCounts[accessLevel]) {
          accessLevelCounts[accessLevel]++;
        } else {
          accessLevelCounts[accessLevel] = 1;
        }
      } catch (e) {
        console.error("Помилка парсингу даних співробітника:", e);
      }
    });

    // Формування тексту статистики
    const statsText = Object.entries(accessLevelCounts)
      .map(([level, count]) => `${level}: ${count}`)
      .join(", ");

    // Відображення статистики
    const statsContainer = document.getElementById("employee-stats-container");
    if (statsContainer) {
      statsContainer.textContent = statsText;
    }
  } catch (error) {
    console.error("Критична помилка при отриманні статистики:", error);
  }
};

// Функція для створення додаткових інпутів
const createSlusarAdditionalInputs = async () => {
  const rightContent = document.querySelector(".modal-right-all_other_bases");
  if (!rightContent) return;
  if (document.getElementById("slusar-additional-inputs")) {
    return;
  }

  // Отримуємо поточного користувача
  const currentUser = getCurrentUserFromLocalStorage();
  const isAdmin = currentUser?.access === "Адміністратор";

  // Завантажуємо список складів з БД
  const warehouses = await getWarehouseNumbers();
  const warehouseOptions = warehouses
    .map((w) => `<option value="${w}">${w}</option>`)
    .join("");

  const additionalInputsContainer = document.createElement("div");
  additionalInputsContainer.id = "slusar-additional-inputs";
  additionalInputsContainer.className = "slusar-additional-inputs";
  additionalInputsContainer.innerHTML = `
    <div class="slusar-input-group">
      <label for="slusar-password" class="label-all_other_bases">Пароль:</label>
      <input type="password" id="slusar-password" class="input-all_other_bases" placeholder="Введіть пароль" autocomplete="new-password">
    </div>
    <div class="slusar-input-group">
      <label for="slusar-access" class="label-all_other_bases">Доступ:</label>
      <select id="slusar-access" class="input-all_other_bases" ${
        !isAdmin ? "disabled" : ""
      }>
        <option value="Адміністратор">Адміністратор</option>
        <option value="Приймальник">Приймальник</option>  
        <option value="Слюсар">Слюсар</option>        
        <option value="Запчастист">Запчастист</option>
        <option value="Складовщик">Складовщик</option>                              
      </select>
    </div>
    <div class="slusar-percent-container">
      <div class="slusar-input-group slusar-percent-half" id="slusar-percent-wrapper">
        <label for="slusar-percent" class="label-all_other_bases">% роботи:</label>
        <input type="number" id="slusar-percent" class="input-all_other_bases" placeholder="Від 0 до 100" min="0" max="100" value="50" ${
          !isAdmin ? "disabled" : ""
        }>
      </div>
      <div class="slusar-input-group slusar-percent-half hidden-all_other_bases" id="slusar-percent-parts-wrapper">
        <label for="slusar-percent-parts" class="label-all_other_bases">% з запчастин:</label>
        <input type="number" id="slusar-percent-parts" class="input-all_other_bases" placeholder="Від 0 до 100" min="0" max="100" value="0" ${
          !isAdmin ? "disabled" : ""
        }>
      </div>
      <div class="slusar-input-group slusar-percent-half hidden-all_other_bases" id="slusar-warehouse-wrapper">
        <label for="slusar-warehouse" class="label-all_other_bases">Склад:</label>
        <select id="slusar-warehouse" class="input-all_other_bases" ${
          !isAdmin ? "disabled" : ""
        }>
          ${warehouseOptions}
        </select>
      </div>
    </div>
    <div class="slusar-stats-container">
      <div class="employee-stats-label">Статистика співробітників:</div>
      <div id="employee-stats-container" class="employee-stats-content">Завантаження...</div>
    </div>
  `;
  const yesNoButtons = rightContent.querySelector(
    ".yes-no-buttons-all_other_bases",
  );
  if (yesNoButtons) {
    rightContent.insertBefore(additionalInputsContainer, yesNoButtons);
  }

  // Додаємо обробник зміни ролі
  const accessSelect = document.getElementById(
    "slusar-access",
  ) as HTMLSelectElement;
  if (accessSelect) {
    accessSelect.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      updatePercentInputsVisibility(target.value);
      updatePasswordVisibility(target.value);
    });
    // Ініціалізація початкового стану (за замовчуванням Слюсар - приховано)
    updatePercentInputsVisibility(accessSelect.value);
    updatePasswordVisibility(accessSelect.value);
  }

  // Завантажуємо статистику після створення контейнера
  await fetchAndDisplayEmployeeStats();

  // Налаштування навігації Enter між полями
  setupEnterNavigationForFields([
    "search-input-all_other_bases",
    "slusar-password",
    "slusar-access",
    "slusar-percent",
    "slusar-percent-parts",
    "slusar-warehouse",
  ]);
};

// Функція для видалення додаткових інпутів
const removeSlusarAdditionalInputs = () => {
  const additionalInputs = document.getElementById("slusar-additional-inputs");
  if (additionalInputs) {
    additionalInputs.remove();
  }
};

const loadDatabaseData = async (buttonText: string) => {
  const config = databaseMapping[buttonText as keyof typeof databaseMapping];
  if (!config) return;
  currentConfig = config;
  try {
    const searchInput = document.getElementById(
      "search-input-all_other_bases",
    ) as HTMLInputElement;

    // Отримуємо поточного користувача
    const currentUser = getCurrentUserFromLocalStorage();
    const isAdmin = currentUser?.access === "Адміністратор";

    // Створюємо додаткові інпути
    await createSlusarAdditionalInputs();

    // Отримуємо кнопку режиму
    const modeButton = document.getElementById(
      "modeToggleLabel",
    ) as HTMLButtonElement;

    if (!isAdmin && currentUser?.name) {
      // Для не-адміністраторів: блокуємо поле пошуку і заповнюємо їхнє ім'я
      if (searchInput) {
        searchInput.value = currentUser.name;
        searchInput.disabled = true;
        searchInput.style.backgroundColor = "#f0f0f0";
        searchInput.style.cursor = "not-allowed";
      }

      // Встановлюємо кнопку в режим "Редагувати"
      if (modeButton) {
        modeButton.textContent = "Редагувати";
        modeButton.style.color = "orange";
        modeButton.disabled = true;
        modeButton.style.cursor = "not-allowed";
      }

      // Приховуємо кнопки імпорту/експорту для не-адміністраторів
      const importBtn = document.getElementById("import-excel-btn");
      const exportBtn = document.getElementById("export-works-excel-btn");
      if (importBtn) importBtn.style.display = "none";
      if (exportBtn) exportBtn.style.display = "none";
    } else {
      // Для адміністраторів: звичайна поведінка
      if (searchInput) {
        searchInput.value = "";
        searchInput.disabled = false;
        searchInput.style.backgroundColor = "";
        searchInput.style.cursor = "";
      }
      if (modeButton) {
        modeButton.disabled = false;
        modeButton.style.cursor = "pointer";
      }
    }

    updateAllBd(
      JSON.stringify(
        {
          config: config,
          table: config.table,
          input: currentUser?.name || "",
        },
        null,
        2,
      ),
    );
    updateTableNameDisplay(buttonText, config.table);
    const { data, error } = await supabase.from(config.table).select("*");
    if (error || !data) throw new Error(error?.message || "Дані не отримані");

    createCustomDropdown(
      data,
      config.field,
      searchInput,
      config.deepPath,
      config.needsJsonParsing,
    );

    // Для не-адміністраторів автоматично завантажуємо їхні дані
    if (!isAdmin && currentUser?.name && searchInput) {
      await updateAllBdFromInput(currentUser.name, true);
    }
  } catch (err) {
    console.error(`Помилка завантаження з ${buttonText}`, err);
  }
};

// Функція для отримання даних з додаткових інпутів
export const getSlusarAdditionalData = () => {
  const passwordInput = document.getElementById(
    "slusar-password",
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access",
  ) as HTMLSelectElement;
  const percentInput = document.getElementById(
    "slusar-percent",
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts",
  ) as HTMLInputElement;
  const warehouseSelect = document.getElementById(
    "slusar-warehouse",
  ) as HTMLSelectElement;

  // Валідація відсотка роботи
  let percentValue = 50; // Значення за замовчуванням
  if (percentInput && percentInput.value) {
    percentValue = Number(percentInput.value);
    // Перевірка меж
    if (isNaN(percentValue) || percentValue < 0) {
      percentValue = 0;
    } else if (percentValue > 100) {
      percentValue = 100;
    }
  }

  // Валідація відсотка запчастин
  let percentPartsValue = 0; // Значення за замовчуванням
  if (percentPartsInput && percentPartsInput.value) {
    percentPartsValue = Number(percentPartsInput.value);
    // Перевірка меж
    if (isNaN(percentPartsValue) || percentPartsValue < 0) {
      percentPartsValue = 0;
    } else if (percentPartsValue > 100) {
      percentPartsValue = 100;
    }
  }

  // Валідація складу
  let warehouseValue = 0; // Значення за замовчуванням
  if (warehouseSelect && warehouseSelect.value) {
    warehouseValue = Number(warehouseSelect.value);
    if (isNaN(warehouseValue)) {
      warehouseValue = 0;
    }
  }

  return {
    password: passwordInput?.value ? Number(passwordInput.value) : 1111,
    access: accessSelect?.value || "Слюсар",
    percent: percentValue,
    percentParts: percentPartsValue,
    warehouse: warehouseValue,
  };
};

export const handleSlusarClick = async () => {
  await loadDatabaseData("Слюсар");
};

// Додаємо обробник для кнопки "Ок" - ТІЛЬКИ ПОКАЗУЄ МОДАЛЬНЕ ВІКНО
export const initYesButtonHandler = () => {
  // Обробник прибрано - збереження тепер тільки через модальне вікно з перевіркою пароля
};

export const initSlusar = () => {
  initYesButtonHandler();
  document.addEventListener("table-changed", (event: any) => {
    if (event.detail?.table !== "slyusars") {
      removeSlusarAdditionalInputs();
    }
  });
};

// Функція збереження даних слюсаря (викликається з модального вікна після перевірки пароля)
export const saveSlusarData = async (): Promise<boolean> => {
  const percentInput = document.getElementById(
    "slusar-percent",
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts",
  ) as HTMLInputElement;
  const warehouseSelect = document.getElementById(
    "slusar-warehouse",
  ) as HTMLSelectElement;
  const searchInput = document.getElementById(
    "search-input-all_other_bases",
  ) as HTMLInputElement;
  const passwordInput = document.getElementById(
    "slusar-password",
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access",
  ) as HTMLSelectElement;

  if (!searchInput || !percentInput || !passwordInput || !accessSelect)
    return false;

  const name = searchInput.value.trim();
  const percentValue = Number(percentInput.value);
  const password = Number(passwordInput.value);
  const access = accessSelect.value;

  // Отримуємо поточного користувача
  const currentUser = getCurrentUserFromLocalStorage();
  const isAdmin = currentUser?.access === "Адміністратор";

  // Перевірка прав доступу для не-адміністраторів
  if (!isAdmin) {
    if (normalizeName(name) !== normalizeName(currentUser?.name || "")) {
      console.error(`Спроба редагувати іншого користувача: ${name}`);
      return false;
    }
  }

  // Валідація відсотка
  if (isNaN(percentValue) || percentValue < 0 || percentValue > 100) {
    console.error("Невалідне значення проценту роботи:", percentValue);
    return false;
  }

  let percentPartsValue = 0;
  if (percentPartsInput && percentPartsInput.value) {
    percentPartsValue = Number(percentPartsInput.value);
    if (
      isNaN(percentPartsValue) ||
      percentPartsValue < 0 ||
      percentPartsValue > 100
    ) {
      console.error(
        "Невалідне значення проценту запчастин:",
        percentPartsValue,
      );
      percentPartsValue = 0;
    }
  }

  let warehouseValue = 0;
  if (warehouseSelect && warehouseSelect.value) {
    warehouseValue = Number(warehouseSelect.value);
    if (isNaN(warehouseValue)) {
      warehouseValue = 0;
    }
  }

  try {
    // Шукаємо запис слюсаря
    // Якщо ми в режимі редагування і маємо збережений ID - шукаємо по ID
    let query = supabase.from("slyusars").select("*");

    // Перевіряємо режим кнопки "Редагувати"
    const modeButton = document.getElementById("modeToggleLabel");
    const isEditMode = modeButton && modeButton.textContent === "Редагувати";

    if (isEditMode && lastValidSlyusarId !== null) {
      console.warn(
        `Редагування по ID: ${lastValidSlyusarId}, нове ім'я: ${name}`,
      );
      query = query.eq("slyusar_id", lastValidSlyusarId);
    } else {
      query = query.eq("data->>Name", name);
    }

    const { data: rows, error } = await query.single();

    if (error || !rows) {
      console.error("Слюсар не знайдений або помилка:", error);
      return false;
    }

    let currentData =
      typeof rows.data === "string" ? JSON.parse(rows.data) : rows.data;

    // ✅ ЗАХИСТ: Для slyusar_id = 1 зберігаємо оригінальні Name та Доступ
    const isSlyusarId1 = rows.slyusar_id === 1;

    // Оновлюємо дані
    const updatedData = {
      ...currentData,
      Name: isSlyusarId1 ? currentData.Name : name, // Для ID=1 зберігаємо оригінальне ім'я
      Пароль: password, // Всі можуть змінювати пароль
      ПроцентРоботи: percentValue, // Всі можуть змінювати % роботи
      ПроцентЗапчастин: percentPartsValue, // Зберігаємо % запчастин для всіх
      Склад: warehouseValue, // Зберігаємо склад для всіх
    };

    // Адміністратор може змінювати ПОЛЕ ДОСТУПУ
    if (isAdmin) {
      updatedData.Доступ = isSlyusarId1 ? currentData.Доступ : access; // Для ID=1 зберігаємо оригінальний доступ
    }
    // Не-адміністратори не можуть змінювати Доступ

    // Оновлюємо запис у базі даних
    const { error: updateError } = await supabase
      .from("slyusars")
      .update({ data: updatedData })
      .eq("slyusar_id", rows.slyusar_id);

    if (updateError) {
      console.error("Помилка при оновленні даних:", updateError);
      return false;
    }

    if (isSlyusarId1) {
    } else {
    }

    // Якщо користувач змінив свій власний пароль, оновлюємо localStorage
    if (normalizeName(name) === normalizeName(currentUser?.name || "")) {
      const userDataStr = localStorage.getItem("userAuthData");
      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        userData.Пароль = String(password);
        localStorage.setItem("userAuthData", JSON.stringify(userData));
      }
    }

    return true;
  } catch (error) {
    console.error("Помилка при обробці даних співробітника:", error);
    return false;
  }
};

export { removeSlusarAdditionalInputs };

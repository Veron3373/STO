import { supabase } from "../../../vxid/supabaseClient";
import {
  updateAllBd,
  updateTableNameDisplay,
} from "../dodatu_inchi_bazu_danux";

let currentLoadedData: any[] = [];
let currentConfig: {
  table: string;
  field: string;
  deepPath?: string[];
  needsJsonParsing?: boolean;
} | null = null;

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
    obj
  );
};

// Функція нормалізації імені
const normalizeName = (s: string) => {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
};

// Функція перевірки дублікатів слюсаря
const checkSlusarDuplicate = async (name: string): Promise<boolean> => {
  try {
    const { data: rows, error } = await supabase
      .from("slyusars")
      .select("data");
    if (error) {
      console.error("Помилка перевірки існування слюсаря:", error);
      return false;
    }
    const needle = normalizeName(name);
    for (const r of rows ?? []) {
      try {
        const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        const nm = normalizeName(d?.Name ?? "");
        if (nm && nm === needle) return true;
      } catch { }
    }
    return false;
  } catch (error) {
    console.error("Помилка при перевірці дубліката слюсаря:", error);
    return false;
  }
};

// Оновлена функція updateAllBdFromInput
const updateAllBdFromInput = async (
  inputValue: string,
  isFromDropdown: boolean = false
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
    } else {
      // Перевірка дублікатів під час введення
      if (table === "slyusars" && inputValue.trim().length > 2) {
        const isDuplicate = await checkSlusarDuplicate(inputValue.trim());
        if (isDuplicate) {
          showDuplicateWarning(inputValue.trim());
        }
      }
    }
  }
};

// Функція показу попередження про дублікат
const showDuplicateWarning = (name: string) => {
  const existingWarning = document.getElementById("slusar-duplicate-warning");
  if (existingWarning) {
    existingWarning.remove();
  }
  const searchInput = document.getElementById("search-input-all_other_bases");
  if (!searchInput) return;
  const warning = document.createElement("div");
  warning.id = "slusar-duplicate-warning";
  warning.className = "duplicate-warning";
  warning.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    color: #856404;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    margin-top: 2px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;
  warning.innerHTML = `
    <strong>⚠️ Увага:</strong> Слюсар "${name}" вже існує в базі даних
  `;
  const globalSearchWrap = document.getElementById("global-search-wrap");
  if (globalSearchWrap) {
    globalSearchWrap.style.position = "relative";
    globalSearchWrap.appendChild(warning);
  }
  setTimeout(() => {
    if (warning.parentNode) {
      warning.remove();
    }
  }, 5000);
};

// Оновлена функція для заповнення додаткових інпутів
const fillSlusarInputs = (data: any, selectedName: string) => {
  const passwordInput = document.getElementById(
    "slusar-password"
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access"
  ) as HTMLSelectElement;
  const percentInput = document.getElementById(
    "slusar-percent"
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts"
  ) as HTMLInputElement;

  if (passwordInput && data?.Пароль !== undefined) {
    passwordInput.value = String(data.Пароль);
  }
  if (accessSelect && data?.Доступ) {
    // Якщо вибрано "Брацлавець Б. С.", встановлюємо Адміністратор доступ і блокуємо селект
    if (normalizeName(selectedName) === normalizeName("Брацлавець Б. С.")) {
      accessSelect.value = "Адміністратор";
      accessSelect.disabled = true;
    } else {
      accessSelect.value = data.Доступ;
      accessSelect.disabled = false;
    }
    // Оновлюємо видимість інпутів відповідно до ролі
    updatePercentInputsVisibility(accessSelect.value);
    updatePasswordVisibility(accessSelect.value);
  }
  if (percentInput && data?.ПроцентРоботи !== undefined) {
    percentInput.value = String(data.ПроцентРоботи);
  }
  if (percentPartsInput && data?.ПроцентЗапчастин !== undefined) {
    percentPartsInput.value = String(data.ПроцентЗапчастин);
  }
};

// Функція для керування видимістю пароля
const updatePasswordVisibility = (role: string) => {
  const passwordInput = document.getElementById("slusar-password") as HTMLInputElement;
  if (passwordInput) {
    if (role === "Адміністратор") {
      passwordInput.type = "text";
    } else {
      passwordInput.type = "password";
    }
  }
};

// Функція для керування видимістю інпутів
const updatePercentInputsVisibility = (role: string) => {
  const partsWrapper = document.getElementById("slusar-percent-parts-wrapper");
  if (partsWrapper) {
    if (role === "Приймальник") {
      partsWrapper.classList.remove("hidden-all_other_bases");
    } else {
      partsWrapper.classList.add("hidden-all_other_bases");
    }
  }
};

// Функція для очищення додаткових інпутів
const clearSlusarInputs = () => {
  const passwordInput = document.getElementById(
    "slusar-password"
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access"
  ) as HTMLSelectElement;
  const percentInput = document.getElementById(
    "slusar-percent"
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts"
  ) as HTMLInputElement;

  if (passwordInput) passwordInput.value = "";
  if (accessSelect) {
    accessSelect.value = "Слюсар";
    accessSelect.disabled = false;
    // Скидаємо видимість (для Слюсаря поле запчастин приховане)
    updatePercentInputsVisibility("Слюсар");
    updatePasswordVisibility("Слюсар");
  }
  if (percentInput) percentInput.value = "50";
  if (percentPartsInput) percentPartsInput.value = "50";
};

const createCustomDropdown = (
  data: any[],
  field: string,
  inputElement: HTMLInputElement | null,
  deepPath?: string[],
  needsJsonParsing?: boolean
) => {
  const dropdown = document.getElementById(
    "custom-dropdown-all_other_bases"
  ) as HTMLDivElement;
  if (!dropdown || !inputElement) return;
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
          deepPath
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
  const uniqueValues = [...new Set(values)].sort();
  const renderSuggestions = (filter: string) => {
    dropdown.innerHTML = "";
    const filtered = uniqueValues.filter((val) =>
      val.toLowerCase().includes(filter.toLowerCase())
    );
    if (filtered.length === 0) {
      dropdown.classList.add("hidden-all_other_bases");
      return;
    }
    filtered.forEach((val) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      item.textContent = val;
      item.addEventListener("click", () => {
        inputElement.value = val;
        dropdown.classList.add("hidden-all_other_bases");
        updateAllBdFromInput(val, true);
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove("hidden-all_other_bases");
  };
  inputElement.addEventListener("input", () => {
    renderSuggestions(inputElement.value.trim());
    updateAllBdFromInput(inputElement.value.trim(), false);
  });
  inputElement.addEventListener("focus", () => {
    renderSuggestions(inputElement.value.trim());
  });
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target as Node) && e.target !== inputElement) {
      dropdown.classList.add("hidden-all_other_bases");
    }
  });
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
        const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
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
  const additionalInputsContainer = document.createElement("div");
  additionalInputsContainer.id = "slusar-additional-inputs";
  additionalInputsContainer.className = "slusar-additional-inputs";
  additionalInputsContainer.innerHTML = `
    <div class="slusar-input-group">
      <label for="slusar-password" class="label-all_other_bases">Пароль:</label>
      <input type="number" id="slusar-password" class="input-all_other_bases" placeholder="Введіть пароль">
    </div>
    <div class="slusar-input-group">
      <label for="slusar-access" class="label-all_other_bases">Доступ:</label>
      <select id="slusar-access" class="input-all_other_bases">
        <option value="Адміністратор">Адміністратор</option>
        <option value="Приймальник">Приймальник</option>  
        <option value="Слюсар">Слюсар</option>        
        <option value="Запчастист">Запчастист</option>
        <option value="Складовщик">Складовщик</option>                              
      </select>
    </div>
    <div class="slusar-percent-container">
      <div class="slusar-input-group slusar-percent-half">
        <label for="slusar-percent" class="label-all_other_bases">Процент роботи:</label>
        <input type="number" id="slusar-percent" class="input-all_other_bases" placeholder="Від 0 до 100" min="0" max="100" value="50">
      </div>
      <div class="slusar-input-group slusar-percent-half hidden-all_other_bases" id="slusar-percent-parts-wrapper">
        <label for="slusar-percent-parts" class="label-all_other_bases">Процент з запчастин:</label>
        <input type="number" id="slusar-percent-parts" class="input-all_other_bases" placeholder="Від 0 до 100" min="0" max="100" value="50">
      </div>
    </div>
    <div class="slusar-stats-container">
      <div class="employee-stats-label">Статистика співробітників:</div>
      <div id="employee-stats-container" class="employee-stats-content">Завантаження...</div>
    </div>
  `;
  const yesNoButtons = rightContent.querySelector(
    ".yes-no-buttons-all_other_bases"
  );
  if (yesNoButtons) {
    rightContent.insertBefore(additionalInputsContainer, yesNoButtons);
  }

  // Додаємо обробник зміни ролі
  const accessSelect = document.getElementById("slusar-access") as HTMLSelectElement;
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
      "search-input-all_other_bases"
    ) as HTMLInputElement;
    if (searchInput) searchInput.value = "";
    createSlusarAdditionalInputs();
    updateAllBd(
      JSON.stringify(
        {
          config: config,
          table: config.table,
          input: "",
        },
        null,
        2
      )
    );
    updateTableNameDisplay(buttonText, config.table);
    const { data, error } = await supabase.from(config.table).select("*");
    if (error || !data) throw new Error(error?.message || "Дані не отримані");
    createCustomDropdown(
      data,
      config.field,
      searchInput,
      config.deepPath,
      config.needsJsonParsing
    );
  } catch (err) {
    console.error(`Помилка завантаження з ${buttonText}`, err);
  }
};

// Функція для отримання даних з додаткових інпутів
export const getSlusarAdditionalData = () => {
  const passwordInput = document.getElementById(
    "slusar-password"
  ) as HTMLInputElement;
  const accessSelect = document.getElementById(
    "slusar-access"
  ) as HTMLSelectElement;
  const percentInput = document.getElementById(
    "slusar-percent"
  ) as HTMLInputElement;
  const percentPartsInput = document.getElementById(
    "slusar-percent-parts"
  ) as HTMLInputElement;

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
  let percentPartsValue = 50; // Значення за замовчуванням
  if (percentPartsInput && percentPartsInput.value) {
    percentPartsValue = Number(percentPartsInput.value);
    // Перевірка меж
    if (isNaN(percentPartsValue) || percentPartsValue < 0) {
      percentPartsValue = 0;
    } else if (percentPartsValue > 100) {
      percentPartsValue = 100;
    }
  }

  console.log("getSlusarAdditionalData викликано:", {
    password: passwordInput?.value ? Number(passwordInput.value) : 1111,
    access: accessSelect?.value || "Слюсар",
    percent: percentValue,
    percentParts: percentPartsValue,
  });
  return {
    password: passwordInput?.value ? Number(passwordInput.value) : 1111,
    access: accessSelect?.value || "Слюсар",
    percent: percentValue,
    percentParts: percentPartsValue,
  };
};

export const handleSlusarClick = async () => {
  await loadDatabaseData("Слюсар");
};

// Додаємо обробник для кнопки "Ок"
export const initYesButtonHandler = () => {
  const yesButton = document.querySelector(
    ".yes-button-all_other_bases"
  ) as HTMLButtonElement;
  if (yesButton) {
    yesButton.addEventListener("click", async () => {
      const percentInput = document.getElementById(
        "slusar-percent"
      ) as HTMLInputElement;
      const percentPartsInput = document.getElementById(
        "slusar-percent-parts"
      ) as HTMLInputElement;
      const searchInput = document.getElementById(
        "search-input-all_other_bases"
      ) as HTMLInputElement;

      if (!searchInput || !percentInput) return;

      const name = searchInput.value.trim();
      const percentValue = Number(percentInput.value);

      let percentPartsValue = 50;
      if (percentPartsInput && percentPartsInput.value) {
        percentPartsValue = Number(percentPartsInput.value);
      }

      // Валідація відсотка
      if (isNaN(percentValue) || percentValue < 0 || percentValue > 100) {
        console.error("Невалідне значення проценту роботи:", percentValue);
        return;
      }

      if (isNaN(percentPartsValue) || percentPartsValue < 0 || percentPartsValue > 100) {
        console.error("Невалідне значення проценту запчастин:", percentPartsValue);
        // Можна продовжити зі значеняям за замовчуванням або повернути помилку
        percentPartsValue = 50;
      }

      try {
        // Шукаємо запис слюсаря за ім'ям
        const { data: rows, error } = await supabase
          .from("slyusars")
          .select("*")
          .eq("data->>Name", name)
          .single();

        if (error || !rows) {
          console.error("Слюсар не знайдений або помилка:", error);
          return;
        }

        let currentData = typeof rows.data === "string" ? JSON.parse(rows.data) : rows.data;

        // Оновлюємо ПроцентРоботи та ПроцентЗапчастин
        currentData = {
          ...currentData,
          ПроцентРоботи: percentValue,
          ПроцентЗапчастин: percentPartsValue,
        };

        // Оновлюємо запис у базі даних
        const { error: updateError } = await supabase
          .from("slyusars")
          .update({ data: currentData })
          .eq("slyusar_id", rows.slyusar_id);

        if (updateError) {
          console.error("Помилка при оновленні процентів:", updateError);
          return;
        }

        console.log(`Успішно оновлено проценти для ${name}: Робота=${percentValue}, Запчастини=${percentPartsValue}`);
      } catch (error) {
        console.error("Помилка при обробці даних слюсаря:", error);
      }
    });
  }
};

export const initSlusar = () => {
  console.log("Ініціалізовано модуль слюсаря");
  initYesButtonHandler(); // Ініціалізуємо обробник кнопки "Ок"
  document.addEventListener("table-changed", (event: any) => {
    if (event.detail?.table !== "slyusars") {
      removeSlusarAdditionalInputs();
    }
  });
};

export { removeSlusarAdditionalInputs };
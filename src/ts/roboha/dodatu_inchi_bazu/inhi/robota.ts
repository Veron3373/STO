//src\ts\roboha\dodatu_inchi_bazu\inhi\robota.ts
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

// 🔥 КЕШ для оптимізації
let cachedOptions: string[] = [];
let lastInputLength = 0;

const databaseMapping = {
  Робота: { table: "works", field: "data" },
};

const updateAllBdFromInput = (
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
        const extractNestedValue = (
          obj: any,
          path: string[]
        ): string | undefined => {
          return path.reduce(
            (acc, key) =>
              acc && acc[key] !== undefined ? acc[key] : undefined,
            obj
          );
        };
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

        const result = {
          table: table,
          [idField]: idValue,
          data:
            typeof dataFieldValue === "object" && !Array.isArray(dataFieldValue)
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

      const newRecordResult = {
        table: table,
        [idField]: null,
        data: { [field]: inputValue.trim() },
      };

      updateAllBd(JSON.stringify(newRecordResult, null, 2));
    }
  }
};

// 🔥 НОВА ФУНКЦІЯ: підтягування даних з БД з фільтром
async function fetchOptionsFromDB(
  table: string,
  field: string,
  filter: string
): Promise<{ options: string[]; fullData: any[] }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .ilike(field, `%${filter}%`)
      .limit(200);

    if (error || !data) {
      // console.error(`Помилка завантаження з ${table}:`, error);
      return { options: [], fullData: [] };
    }

    const uniqueValues = new Set<string>();

    data.forEach((item: any) => {
      const value = item[field];
      if (value !== null && value !== undefined) {
        const stringValue = String(value).trim();
        if (stringValue) uniqueValues.add(stringValue);
      }
    });

    return {
      options: Array.from(uniqueValues).sort(),
      fullData: data,
    };
  } catch (err) {
    // console.error(`Помилка при запиті до ${table}:`, err);
    return { options: [], fullData: [] };
  }
}

const createCustomDropdown = (inputElement: HTMLInputElement | null) => {
  const dropdown = document.getElementById(
    "custom-dropdown-all_other_bases"
  ) as HTMLDivElement;
  if (!dropdown || !inputElement) return;

  const renderSuggestions = async (filter: string) => {
    dropdown.innerHTML = "";

    if (!currentConfig) return;

    const currentInputLength = filter.length;

    // 🔥 ВИПРАВЛЕНО: підтягуємо з БД тільки якщо видалили символ АБО >= 3 символи
    if (currentInputLength < lastInputLength || currentInputLength >= 3) {
      const result = await fetchOptionsFromDB(
        currentConfig.table,
        currentConfig.field,
        filter
      );
      cachedOptions = result.options;
      currentLoadedData = result.fullData;
    } else if (currentInputLength < 3) {
      // Якщо менше 3 символів - очищуємо
      cachedOptions = [];
      currentLoadedData = [];
      dropdown.classList.add("hidden-all_other_bases");
      lastInputLength = currentInputLength;
      return;
    }

    lastInputLength = currentInputLength;

    // 🔥 ВИПРАВЛЕНО: НЕ фільтруємо повторно, показуємо що прийшло з БД
    if (cachedOptions.length === 0) {
      dropdown.classList.add("hidden-all_other_bases");
      return;
    }

    cachedOptions.forEach((val) => {
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

  // Видаляємо старі обробники шляхом клонування елемента
  const newInput = inputElement.cloneNode(true) as HTMLInputElement;
  inputElement.parentNode?.replaceChild(newInput, inputElement);

  newInput.addEventListener("input", async () => {
    await renderSuggestions(newInput.value.trim());
    updateAllBdFromInput(newInput.value.trim(), false);
  });

  newInput.addEventListener("focus", async () => {
    await renderSuggestions(newInput.value.trim());
  });

  // Клік на інпуті — відкривати dropdown навіть якщо вже має фокус
  newInput.addEventListener("click", async () => {
    await renderSuggestions(newInput.value.trim());
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target as Node) && e.target !== newInput) {
      dropdown.classList.add("hidden-all_other_bases");
    }
  });

  const rect = newInput.getBoundingClientRect();
  dropdown.style.minWidth = `${rect.width}px`;
};

const loadDatabaseData = async (buttonText: string) => {
  const config = databaseMapping[buttonText as keyof typeof databaseMapping];
  if (!config) return;

  currentConfig = config;

  // 🔥 СКИДАЄМО КЕШ при зміні таблиці
  cachedOptions = [];
  lastInputLength = 0;
  currentLoadedData = [];

  try {
    const searchInput = document.getElementById(
      "search-input-all_other_bases"
    ) as HTMLInputElement;
    if (searchInput) searchInput.value = "";

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

    createCustomDropdown(searchInput);
  } catch (err) {
    // console.error(`Помилка завантаження з ${buttonText}`, err);
  }
};

export const handleRobotaClick = async () => {
  await loadDatabaseData("Робота");
};

export const initRobota = () => { };

//src\ts\roboha\dodatu_inchi_bazu\inhi\djerelo.ts
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
  Джерело: {
    table: "incomes",
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
  }
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

const loadDatabaseData = async (buttonText: string) => {
  const config = databaseMapping[buttonText as keyof typeof databaseMapping];
  if (!config) return;

  currentConfig = config;

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

export const handleDhereloClick = async () => {
  await loadDatabaseData("Джерело");
};

export const initDherelo = () => {
};

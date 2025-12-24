// src\ts\roboha\dodatu_inchi_bazu\dodatu_inchi_bazu_danux.ts

import { supabase } from "../../vxid/supabaseClient";
import { canUserSeeEmployeeButton } from "../tablucya/users";
import {
  showSavePromptModal,
  createSavePromptModal,
  savePromptModalId,
} from "./vikno_pidtverdchennay_inchi_bazu";

// Змінні для експорту
export let all_bd: string | null = null;
export let CRUD: string = "";

// Функція для оновлення all_bd
export const updateAllBd = (newValue: string | null) => {
  all_bd = newValue;
};

// Функція для оновлення CRUD режиму
export const updateCRUD = (newMode: string) => {
  CRUD = newMode;
};

// Функція для оновлення відображення назви таблиці в інтерфейсі
export const updateTableNameDisplay = (
  buttonText: string,
  tableName: string
) => {
  const tableNameElement = document.getElementById("current-table-name");
  if (tableNameElement) {
    tableNameElement.textContent = `Поточна таблиця: ${buttonText} (${tableName})`;
  }
};

// Функція для очищення всіх даних
// Функція для очищення всіх даних
export const clearAllData = () => {
  let searchInput = document.getElementById(
    "search-input-all_other_bases"
  ) as HTMLInputElement;

  if (searchInput) {
    // 🔥 РЕШЕТО: Клонуємо елемент, щоб видалити ВСІ старі event listeners
    const newSearchInput = searchInput.cloneNode(true) as HTMLInputElement;
    searchInput.parentNode?.replaceChild(newSearchInput, searchInput);
    searchInput = newSearchInput;
    searchInput.value = "";
  }

  const dropdown = document.getElementById(
    "custom-dropdown-all_other_bases"
  ) as HTMLDivElement;
  if (dropdown) {
    dropdown.innerHTML = "";
    dropdown.classList.add("hidden-all_other_bases");
  }

  // Очищуємо додаткові інпути підлеглі при зміні таблиці
  const slusarInputs = document.getElementById("slusar-additional-inputs");
  if (slusarInputs) {
    slusarInputs.remove();
  }

  // Очищуємо форму контрагентів
  const contragentForm = document.getElementById("contragent-form");
  if (contragentForm) {
    contragentForm.remove();
  }

  // Видаляємо всі календарі контрагентів
  document.querySelectorAll(".contragent-calendar").forEach((cal) => {
    cal.remove();
  });

  // Видаляємо всі dropdown-и контрагентів
  document.querySelectorAll(".contragent-dropdown").forEach((dropdown) => {
    dropdown.remove();
  });

  all_bd = null;
};

document.addEventListener("DOMContentLoaded", () => {
  const existing = document.getElementById(savePromptModalId);
  if (!existing) {
    const modal = createSavePromptModal();
    document.body.appendChild(modal);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const closeAllModals = () => {
    document
      .querySelectorAll(".modal-overlay-all_other_bases")
      .forEach((modal) => modal.classList.add("hidden-all_other_bases"));
  };
  /*<button class="toggle-button-all_other_bases">Приймальник</button>*/
  const modal_all_other_bases = document.createElement("div");
  modal_all_other_bases.className =
    "modal-overlay-all_other_bases hidden-all_other_bases";
  modal_all_other_bases.innerHTML = `
    <div class="modal-all_other_bases">
      <button class="modal-close-all_other_bases">×</button>
      <div class="modal-content-all_other_bases">
        <div class="modal-left-all_other_bases">
          <button class="toggle-button-all_other_bases">Склад</button>
          <button class="toggle-button-all_other_bases">Робота</button>
          <button class="toggle-button-all_other_bases">Співробітники</button>
          <button class="toggle-button-all_other_bases">Контрагент</button>
          <button class="toggle-button-all_other_bases">Джерело</button>
        </div>
        <div class="modal-right-all_other_bases">
          <div class="right-header">
            <label for="search-input-all_other_bases" class="label-all_other_bases">Введіть дані для пошуку</label>
            <button id="modeToggleLabel" class="mode-toggle-btn mode--edit" style="cursor: pointer;" type="button">Додати</button>
          </div>
          <div id="global-search-wrap" style="position: relative; width: 100%;">
            <input type="text" id="search-input-all_other_bases" class="input-all_other_bases" />
            <div id="custom-dropdown-all_other_bases" class="custom-dropdown hidden-all_other_bases"></div>
          </div>
          <div id="sclad-form" class="hidden-all_other_bases"></div>
          <div class="yes-no-buttons-all_other_bases">
            <button id="import-excel-btn" class="batch-btn-Excel import-Excel hidden-all_other_bases" style="margin-right: 10px;">📊 Імпорт з Excel</button>
            <button id="export-works-excel-btn" class="batch-btn-Excel export-Excel hidden-all_other_bases" style="margin-right: 10px;">📤 Вивантажити роботи</button>
            <button class="yes-button-all_other_bases">Ок</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal_all_other_bases);

  const yesButton = modal_all_other_bases.querySelector(
    ".yes-button-all_other_bases"
  ) as HTMLButtonElement;

  if (yesButton) {
    yesButton.addEventListener("click", async () => {
      try {
        const confirmed = await showSavePromptModal();
        if (confirmed) {
          // Логіка при підтвердженні
        }
      } catch (error) {
        console.error(
          "Помилка при показі модального вікна підтвердження:",
          error
        );
      }
    });
  }

  const closeModalBtn = modal_all_other_bases.querySelector(
    ".modal-close-all_other_bases"
  ) as HTMLButtonElement;
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      closeAllModals();
    });
  }

  // ВИПРАВЛЕННЯ: Додаємо обробник закриття модального вікна при кліку поза ним
  /*   modal_all_other_bases.addEventListener("click", (e) => {
    if (e.target === modal_all_other_bases) {
      closeAllModals();
    }
  }); */

  // Ініціалізуємо всі модулі
  (async () => {
    const { initScladMagasunDetal } = await import("./inhi/scladMagasunDetal");
    initScladMagasunDetal();

    const { initRobota } = await import("./inhi/robota");
    initRobota();

    const { initSlusar } = await import("./inhi/slusar");
    initSlusar();

    const { initPruimalnik } = await import("./inhi/pruimalnuk");
    initPruimalnik();

    const { initDherelo } = await import("./inhi/djerelo");
    initDherelo();
  })();

  const toggleButtons = modal_all_other_bases.querySelectorAll(
    ".toggle-button-all_other_bases"
  );

  // Функція для показу/приховування кнопки імпорту
  const toggleImportButton = (show: boolean) => {
    const importExcelBtn = document.getElementById("import-excel-btn");
    if (importExcelBtn) {
      if (show) {
        importExcelBtn.classList.remove("hidden-all_other_bases");
      } else {
        importExcelBtn.classList.add("hidden-all_other_bases");
      }
    }
  };

  // Функція для показу/приховування кнопки експорту робіт
  const toggleExportWorksButton = (show: boolean) => {
    const exportBtn = document.getElementById("export-works-excel-btn");
    if (exportBtn) {
      if (show) {
        exportBtn.classList.remove("hidden-all_other_bases");
      } else {
        exportBtn.classList.add("hidden-all_other_bases");
      }
    }
  };

  // Обробник експорту робіт
  const exportWorksBtnRef = modal_all_other_bases.querySelector("#export-works-excel-btn");
  if (exportWorksBtnRef) {
    exportWorksBtnRef.addEventListener("click", async () => {
      try {
        let allData: any[] = [];
        let from = 0;
        const step = 1000;
        let keepFetching = true;

        // 1. Fetch ALL data using pagination
        while (keepFetching) {
          const { data, error } = await supabase
            .from("works")
            .select("work_id, data")
            .order("work_id", { ascending: true })
            .range(from, from + step - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < step) {
              keepFetching = false;
            } else {
              from += step;
            }
          } else {
            keepFetching = false;
          }
        }

        if (allData.length === 0) {
          alert("Немає даних для експорту");
          return;
        }

        // 2. Generate HTML-based Excel (.xls)
        let tableRows = "";
        allData.forEach((row) => {
          const id = row.work_id || "";
          // Escape HTML special chars in data to prevent broken layout
          const rawData = String(row.data || "");
          const desc = rawData
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

          tableRows += `<tr><td>${id}</td><td>${desc}</td></tr>`;
        });

        const excelTemplate = `
          <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="UTF-8">
            <!--[if gte mso 9]>
            <xml>
              <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                  <x:ExcelWorksheet>
                    <x:Name>Works</x:Name>
                    <x:WorksheetOptions>
                      <x:DisplayGridlines/>
                    </x:WorksheetOptions>
                  </x:ExcelWorksheet>
                </x:ExcelWorksheets>
              </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #000000; padding: 5px; text-align: left; vertical-align: top; }
            </style>
          </head>
          <body>
            <table>
              <thead>
                <tr>
                  <th style="background-color: #f0f0f0; font-weight: bold;">№</th>
                  <th style="background-color: #f0f0f0; font-weight: bold;">Опис</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </body>
          </html>
        `;

        const blob = new Blob([excelTemplate], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "robots_base.xls"); // Saving as .xls
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

      } catch (error: any) {
        console.error("Помилка експорту:", error);
        alert("Помилка при експорті: " + error.message);
      }
    });
  }

  toggleButtons.forEach((button) => {
    button.classList.add("inactive-all_other_bases");
    button.addEventListener("click", async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        alert("⛔ Доступ заблоковано , Ви не авторизовані");
        return;
      }

      // Спочатку очищаємо всі дані
      clearAllData();

      // Оновлюємо активну кнопку
      toggleButtons.forEach((btn) =>
        btn.classList.remove("active-all_other_bases")
      );
      button.classList.add("active-all_other_bases");

      const buttonText = button.textContent?.trim() || "";

      // Показуємо/ховаємо кнопку імпорту залежно від таблиці
      toggleImportButton(buttonText === "Склад");
      // Показуємо/ховаємо кнопку експорту робіт
      toggleExportWorksButton(buttonText === "Робота");

      // За замовчуванням — показати глобальний пошук, а форму "Склад" сховати
      const scladForm = document.getElementById("sclad-form");
      const globalSearchWrap = document.getElementById("global-search-wrap");
      if (scladForm) scladForm.classList.add("hidden-all_other_bases");
      if (globalSearchWrap)
        globalSearchWrap.classList.remove("hidden-all_other_bases");

      // Відправляємо подію про зміну таблиці
      const tableMap: Record<string, string> = {
        Склад: "sclad",
        Робота: "works",
        Співробітники: "slyusars",
        Приймальник: "receivers",
        Джерело: "incomes",
        Контрагент: "faktura",
      };

      document.dispatchEvent(
        new CustomEvent("table-changed", {
          detail: { table: tableMap[buttonText] || buttonText },
        })
      );

      // Викликаємо відповідний обробник залежно від кнопки
      switch (buttonText) {
        case "Склад": {
          if (globalSearchWrap)
            globalSearchWrap.classList.add("hidden-all_other_bases");
          const { handleScladClick } = await import("./inhi/scladMagasunDetal");
          await handleScladClick();
          break;
        }
        case "Робота": {
          const { handleRobotaClick } = await import("./inhi/robota");
          await handleRobotaClick();
          break;
        }
        case "Співробітники": {
          const { handleSlusarClick } = await import("./inhi/slusar");
          await handleSlusarClick();
          break;
        }
        case "Приймальник": {
          const { handlePruimalnikClick } = await import("./inhi/pruimalnuk");
          await handlePruimalnikClick();
          break;
        }
        case "Джерело": {
          const { handleDhereloClick } = await import("./inhi/djerelo");
          await handleDhereloClick();
          break;
        }
        case "Контрагент": {
          const { handleDhereloContragent } = await import("./inhi/contragent");
          await handleDhereloContragent();
          break;
        }
      }
    });
  });

  // ВИПРАВЛЕННЯ: Модальне вікно відкривається тільки при кліку на меню, а не автоматично
  document
    .querySelectorAll('a.menu-link.all_other_bases[data-action="openClient"]')
    .forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 1. ДОДАНО ПЕРЕВІРКУ АВТОРИЗАЦІЇ
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          console.warn(
            "⛔ Користувач не авторизований. Модальне вікно 'Додати' не відкривається."
          );
          return; // Зупиняємо виконання, модалка не відкриється
        }

        closeAllModals();
        modal_all_other_bases.classList.remove("hidden-all_other_bases");

        // Перевірка чи може користувач бачити кнопку "Співробітники"
        const canSeeEmployeeButton = await canUserSeeEmployeeButton();
        const employeeButton = Array.from(
          modal_all_other_bases.querySelectorAll(
            ".toggle-button-all_other_bases"
          )
        ).find((btn) => btn.textContent?.trim() === "Співробітники") as
          | HTMLElement
          | undefined;

        if (employeeButton) {
          if (canSeeEmployeeButton) {
            employeeButton.style.display = "";
          } else {
            employeeButton.style.display = "none";
          }
        }
      });
    });

  // Режими роботи
  const modeLabel = document.getElementById("modeToggleLabel") as HTMLElement;
  const modes = ["Додати", "Редагувати", "Видалити"] as const;
  const colors = ["green", "orange", "crimson"];
  let modeIndex = 0;

  if (modeLabel) {
    modeLabel.textContent = modes[modeIndex];
    modeLabel.style.color = colors[modeIndex];
    updateCRUD(modes[modeIndex]);
  }

  const handleModeSwitch = () => {
    modeIndex = (modeIndex + 1) % modes.length;
    if (modeLabel) {
      modeLabel.textContent = modes[modeIndex];
      modeLabel.style.color = colors[modeIndex];
      updateCRUD(modes[modeIndex]);
    }
  };

  if (modeLabel) {
    modeLabel.addEventListener("click", handleModeSwitch);
  }
});

export function showModalAllOtherBases() {
  const modal = document.querySelector(
    ".modal-overlay-all_other_bases"
  ) as HTMLElement;
  if (modal) {
    modal.classList.remove("hidden-all_other_bases");
  }
}

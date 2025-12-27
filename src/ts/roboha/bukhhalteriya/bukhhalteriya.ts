// src/ts/roboha/bukhhalteriya/bukhhalteriya.ts
// Усі повідомлення через showNotification. Без confirm у масовому розрахунку магазину.
import { runMassPaymentCalculation as runMassPaymentCalculationForPodlegle } from "./zarplata";
import { runMassPaymentCalculationForMagazine } from "./shopsBuxha";
import { runMassPaymentCalculationForDetails } from "./poAktam";
import {
  initializevutratuData,
  updatevutratuTable,
  deleteExpenseRecord,
  clearvutratuForm,
  calculatevutratuTotalSum,
  runMassPaymentCalculationForvutratu,
  getFilteredvutratuData,
} from "./prubutok";

import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

import { showModal } from "../zakaz_naraudy/modalMain";
import {
  loadSlyusarsData,
  updatepodlegleTable,
  getFilteredpodlegleData,
  createNameSelect,
  createStatusToggle,
  createPaymentToggle,
  handlepodlegleAddRecord,
  deletepodlegleRecord,
  togglepodleglePayment,
  clearpodlegleForm,
} from "./zarplata";

import {
  canUserSeeSkladButton,
  canUserSeeDetailsButton,
  attemptAutoLogin,
  userAccessLevel,
} from "../tablucya/users";

import {
  calculateMagazineTotalSum,
  updateMagazineTable,
  deleteMagazineRecord,
  toggleMagazinePayment,
  clearMagazineForm,
  searchMagazineData,
  createMagazinePaymentToggle,
  createMagazineAvailabilityToggle,
  createShopsSelect,
} from "./shopsBuxha";

import {
  initializeDetailsData,
  calculateDetailsTotalSum,
  updateDetailsTable,
  addDetailsRecord,
  deleteDetailsRecord,
  toggleDetailsPayment,
  clearDetailsForm,
} from "./poAktam";

type TabName = "podlegle" | "magazine" | "details" | "vutratu";

let currentTab: TabName = "magazine";
let selectedRowIndex: number | null = null;

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  return el as T;
}

export function formatNumber(value: number): string {
  return Math.floor(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatDate(dateString: string): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function calculateTotalSum(): number {
  let total = 0;

  switch (currentTab) {
    case "podlegle":
      const podlegleData = getFilteredpodlegleData();
      total = podlegleData.reduce((sum, item) => sum + (item.total || 0), 0);
      break;
    case "magazine":
      total = calculateMagazineTotalSum();
      break;
    case "details":
      total = calculateDetailsTotalSum();
      break;
    case "vutratu":
      total = calculatevutratuTotalSum();
      break;
  }

  return total;
}

export function updateTotalSum(): void {
  const totalSumElement = byId("total-sum");

  // Для співробітників показуємо спеціальний формат
  if (currentTab === "podlegle") {
    // Викликаємо функцію з pidlehli.ts яка розраховує та відображає три суми
    if (typeof (window as any).updatePodlegleDisplayedSums === "function") {
      (window as any).updatePodlegleDisplayedSums();
    }
    return;
  }

  // Для магазину показуємо спеціальний формат
  if (currentTab === "magazine") {
    // Викликаємо функцію з shopsBuxha.ts яка розраховує та відображає дві суми
    if (typeof (window as any).updateMagazineTotalSum === "function") {
      (window as any).updateMagazineTotalSum();
    }
    return;
  }

  // Для деталей по актам показуємо спеціальний формат
  if (currentTab === "details") {
    // Викликаємо функцію з poAktam.ts яка розраховує та відображає три суми
    if (typeof (window as any).updateDetailsDisplayedSums === "function") {
      (window as any).updateDetailsDisplayedSums();
    }
    return;
  }

  // Для витрат показуємо спеціальний формат
  if (currentTab === "vutratu") {
    // Викликаємо функцію з vutratu.ts яка розраховує та відображає три суми
    if (typeof (window as any).updatevutratuDisplayedSums === "function") {
      (window as any).updatevutratuDisplayedSums();
    }
    return;
  }

  // Fallback для невідомих вкладок
  const total = calculateTotalSum();
  totalSumElement.textContent = `${formatNumber(total)} грн`;
}

export function switchTab(e: Event, tabName: TabName) {
  // Видаляємо активний клас з всіх кнопок вкладок
  const buttons = document.querySelectorAll<HTMLElement>(".Bukhhalter-tab-btn");
  buttons.forEach((button) => button.classList.remove("Bukhhalter-active"));

  // Додаємо активний клас до натиснутої кнопки
  const target = e.currentTarget as HTMLElement | null;
  if (target) {
    target.classList.add("Bukhhalter-active");
  }

  // Видаляємо активний клас з всіх форм
  const sections = document.querySelectorAll<HTMLElement>(
    ".Bukhhalter-form-section"
  );
  sections.forEach((section) => section.classList.remove("Bukhhalter-active"));

  // Додаємо активний клас до обраної форми
  const formSection = byId<HTMLElement>("Bukhhalter-" + tabName + "-section");
  if (formSection) {
    formSection.classList.add("Bukhhalter-active");
  }

  currentTab = tabName;
  updateTableDisplay();
  updateTotalSum();
}
function updateTableDisplay(): void {
  const tableTitle = byId<HTMLDivElement>("table-title");
  const magazineContainer = byId<HTMLDivElement>("magazine-table-container");
  const podlegleContainer = byId<HTMLDivElement>("podlegle-table-container");
  const detailsContainer = byId<HTMLDivElement>("details-table-container");
  const vutratuContainer = byId<HTMLDivElement>("vutratu-table-container");

  podlegleContainer.style.display = "none";
  magazineContainer.style.display = "none";
  detailsContainer.style.display = "none";
  vutratuContainer.style.display = "none";

  if (currentTab === "magazine") {
    tableTitle.innerHTML = "🏪 Дані по складу";
    magazineContainer.style.display = "block";
    updateMagazineTable();
  } else if (currentTab === "podlegle") {
    tableTitle.innerHTML = "👨‍🔧 Дані по зарплаті";
    podlegleContainer.style.display = "block";
    updatepodlegleTable();
  } else if (currentTab === "details") {
    tableTitle.innerHTML = "📊 Деталі по актам";
    detailsContainer.style.display = "block";
    updateDetailsTable();
  } else if (currentTab === "vutratu") {
    tableTitle.innerHTML = "💰 Дані по витратам";
    vutratuContainer.style.display = "block";
    updatevutratuTable();
  }

  updateTotalSum();
}

function handleRowClick(index: number): void {
  if (selectedRowIndex !== null) {
    const prevRow = document.querySelector(
      `.Bukhhalter-data-table tbody tr:nth-child(${selectedRowIndex + 1})`
    );
    if (prevRow) {
      prevRow.classList.remove("selected-row");
    }
  }

  selectedRowIndex = index;
  const currentRow = document.querySelector(
    `.Bukhhalter-data-table tbody tr:nth-child(${index + 1})`
  );
  if (currentRow) {
    currentRow.classList.add("selected-row");
  }
}

function togglePayment(index: number, type: TabName): void {
  if (type === "podlegle") {
    togglepodleglePayment(index);
  } else if (type === "magazine") {
    toggleMagazinePayment(index);
  } else if (type === "details") {
    toggleDetailsPayment(index);
  }
  updateTotalSum();
}

// Функція для керування станом кнопки пошуку
// Було: setSearchButtonLoading(isLoading: boolean)
// Стало:
function setSearchButtonLoadingEl(
  btn: HTMLButtonElement | null,
  isLoading: boolean
): void {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    (btn as any)._origText = btn.textContent || "";
    btn.textContent = "⏳ Завантаження...";
    btn.style.opacity = "0.6";
    btn.style.cursor = "not-allowed";
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.disabled = false;
    btn.textContent = (btn as any)._origText || "🔍 Пошук";
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
    btn.removeAttribute("aria-busy");
    delete (btn as any)._origText;
  }
}

// Додай на початок addRecord:
export async function addRecord(e?: Event): Promise<void> {
  e?.preventDefault?.();

  // Надійний пошук кнопки:
  const maybeFromEvent = e?.currentTarget as HTMLButtonElement | null;
  const maybeActiveEl =
    document.activeElement instanceof HTMLButtonElement
      ? document.activeElement
      : null;
  const btn =
    maybeFromEvent ||
    maybeActiveEl ||
    document.querySelector<HTMLButtonElement>("#Bukhhalter-search-button") ||
    null;

  setSearchButtonLoadingEl(btn, true);
  try {
    if (currentTab === "podlegle") {
      handlepodlegleAddRecord();
      updateTotalSum();
      return;
    }
    if (currentTab === "magazine") {
      await searchMagazineData();
      return;
    }
    if (currentTab === "details") {
      await addDetailsRecord();
      return;
    }
    if (currentTab === "vutratu") {
      await (window as any).searchvutratuFromDatabase();
      return;
    }
  } catch (error) {
    console.error("Помилка при додаванні запису:", error);
    showNotification("Помилка при завантаженні даних", "error");
  } finally {
    setSearchButtonLoadingEl(btn, false);
  }
}

export function deleteRecord(type: TabName, index: number): void {
  if (type === "podlegle") {
    deletepodlegleRecord(index);
  } else if (type === "magazine") {
    deleteMagazineRecord(index);
  } else if (type === "details") {
    deleteDetailsRecord(index);
  } else if (type === "vutratu") {
    deleteExpenseRecord(index);
  }
  updateTotalSum();
}

// Універсальний хелпер (підтримує і textContent, і innerHTML з емодзі)
function setButtonLoadingEl(
  btn: HTMLButtonElement | null,
  isLoading: boolean,
  loadingLabel: string,
  fallbackLabel?: string
): void {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    // збережемо вихідну розмітку (емодзі, пробіли)
    (btn as any)._origHTML = btn.innerHTML;
    btn.innerHTML = loadingLabel;
    btn.style.opacity = "0.6";
    btn.style.cursor = "not-allowed";
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.disabled = false;
    btn.innerHTML = (btn as any)._origHTML || fallbackLabel || btn.innerHTML;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
    btn.removeAttribute("aria-busy");
    delete (btn as any)._origHTML;
  }
}

// [НОВИЙ КОД]
export function clearForm(): void {
  const activeSection = document.querySelector<HTMLElement>(
    ".Bukhhalter-form-section.Bukhhalter-active"
  );
  if (!activeSection) return;

  // --- ПОЧАТОК ВИПРАВЛЕННЯ ---
  // Викликаємо правильну функцію очищення для кожної вкладки

  if (currentTab === "magazine") {
    clearMagazineForm();
    // Функція clearMagazineForm сама покаже сповіщення
    return;
  }

  if (currentTab === "details") {
    clearDetailsForm();
    // Функція clearDetailsForm сама покаже сповіщення
    return;
  }

  if (currentTab === "vutratu") {
    clearvutratuForm();
    // Функція clearvutratuForm сама покаже сповіщення
    return;
  }

  if (currentTab === "podlegle") {
    if (typeof clearpodlegleForm === "function") {
      // Викликаємо імпортовану функцію з zarplata.ts
      clearpodlegleForm(); // Вона вже містить updateTable та showNotification
    } else {
      // Запасний варіант, якщо імпорт не спрацював
      console.error("clearpodlegleForm is not imported or not a function");
      const inputs = activeSection.querySelectorAll<HTMLInputElement>(
        "input:not([readonly])"
      );
      inputs.forEach((input) => {
        input.value = "";
      });
      const selects =
        activeSection.querySelectorAll<HTMLSelectElement>("select");
      selects.forEach((select) => {
        select.value = "";
      });
      showNotification("Фільтри очищено (частково)", "info", 1500);
    }
    return; // <--- ВАЖЛИВО
  }
  // --- КІНЕЦЬ ВИПРАВЛЕННЯ ---

  // Цей код не має виконуватись, якщо всі вкладки оброблені
  console.warn(`Невідома вкладка для очищення: ${currentTab}`);
  const inputs = activeSection.querySelectorAll<HTMLInputElement>(
    "input:not([readonly])"
  );
  inputs.forEach((input) => {
    input.value = "";
  });
  const selects = activeSection.querySelectorAll<HTMLSelectElement>("select");
  selects.forEach((select) => {
    select.value = "";
  });
  updateTotalSum();
  showNotification("Фільтри очищено", "info", 1500);
}

function getCurrentDateForFileName(): string {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}

// Динамічне завантаження XLSX (CDN) при потребі
let xlsxLoadingPromise: Promise<boolean> | null = null;
function loadXLSXIfNeeded(): Promise<boolean> {
  // Перевіряємо чи бібліотека вже завантажена
  if (typeof (window as any).XLSX !== "undefined") {
    console.log("✅ XLSX вже доступна");
    return Promise.resolve(true);
  }

  // Якщо вже йде завантаження - повертаємо існуючий Promise
  if (xlsxLoadingPromise) return xlsxLoadingPromise;

  console.log("🔄 Початок завантаження XLSX...");

  xlsxLoadingPromise = new Promise<boolean>((resolve) => {
    try {
      // Перевіряємо чи скрипт вже в DOM
      const existing = document.querySelector(
        'script[src*="cdnjs.cloudflare.com/ajax/libs/xlsx"]'
      ) as HTMLScriptElement | null;

      if (existing) {
        console.log("📜 Скрипт XLSX знайдено в DOM");

        // Скрипт є, але бібліотека ще не завантажилась - чекаємо
        let attempts = 0;
        const maxAttempts = 50; // 5 секунд (50 * 100ms)

        const checkInterval = setInterval(() => {
          attempts++;

          if (typeof (window as any).XLSX !== "undefined") {
            console.log("✅ XLSX завантажена після очікування");
            clearInterval(checkInterval);
            resolve(true);
            return;
          }

          if (attempts >= maxAttempts) {
            console.error("❌ Таймаут очікування XLSX");
            clearInterval(checkInterval);
            resolve(false);
          }
        }, 100);

        return;
      }

      // Скрипта немає - додаємо його динамічно
      console.log("➕ Додавання нового скрипта XLSX");
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.async = false;
      script.onload = () => {
        console.log("📥 Скрипт XLSX завантажено");
        setTimeout(() => {
          const loaded = typeof (window as any).XLSX !== "undefined";
          console.log(
            loaded
              ? "✅ XLSX доступна"
              : "❌ XLSX недоступна після завантаження"
          );
          resolve(loaded);
        }, 100);
      };
      script.onerror = () => {
        console.error("❌ Помилка завантаження скрипта XLSX");
        resolve(false);
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error("❌ Виняток при завантаженні XLSX:", error);
      resolve(false);
    }
  });

  return xlsxLoadingPromise;
}

function downloadpodlegleToExcel(): void {
  const filteredData = getFilteredpodlegleData();

  if (filteredData.length === 0) {
    showNotification("Немає даних для експорту", "warning");
    return;
  }

  // Ensure XLSX is present (attempt dynamic load if missing)
  if (typeof (window as any).XLSX === "undefined") {
    console.warn("⚠️ XLSX не завантажена, спроба динамічного завантаження...");
    showNotification("⏳ Завантаження бібліотеки Excel...", "info", 2000);
    // try to load dynamically and continue
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadXLSXIfNeeded().then((ok) => {
      if (!ok || typeof (window as any).XLSX === "undefined") {
        console.error("❌ Не вдалося завантажити XLSX");
        showNotification(
          "❌ Помилка завантаження бібліотеки Excel. Перевірте інтернет-з'єднання.",
          "error",
          5000
        );
        return;
      }
      console.log("✅ XLSX успішно завантажена");
      downloadpodlegleToExcel();
    });
    return;
  }

  const XLSX = (window as any).XLSX;

  const excelData = filteredData.map((item) => ({
    Розраховано: item.isPaid ? item.paymentDate || "Так" : "Ні",
    "Дата відкриття": formatDate(item.dateOpen),
    "Дата закриття": formatDate(item.dateClose),
    ПІБ: item.name || "",
    "Акт №": item.act || "",
    Клієнт: item.client || "",
    Автомобіль: item.automobile || "",
    Робота: item.work || "",
    Кількість: String(item.quantity || 0),
    Ціна: String(item.price || 0),
    Сума: String(item.total || 0),
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Дані підлеглих");

  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 10 },
    { wch: 20 },
    { wch: 15 },
    { wch: 30 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
  ];

  const fileName = `Дані_підлеглих_${getCurrentDateForFileName()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showNotification(
    `Експортовано ${filteredData.length} записів підлеглих`,
    "success"
  );
}

function downloadMagazineToExcel(): void {
  if (typeof (window as any).XLSX === "undefined") {
    console.warn("⚠️ XLSX не завантажена, спроба динамічного завантаження...");
    showNotification("⏳ Завантаження бібліотеки Excel...", "info", 2000);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadXLSXIfNeeded().then((ok) => {
      if (!ok || typeof (window as any).XLSX === "undefined") {
        console.error("❌ Не вдалося завантажити XLSX");
        showNotification(
          "❌ Помилка завантаження бібліотеки Excel. Перевірте інтернет-з'єднання.",
          "error",
          5000
        );
        return;
      }
      console.log("✅ XLSX успішно завантажена");
      downloadMagazineToExcel();
    });
    return;
  }

  const XLSX = (window as any).XLSX;

  const tbody = document.querySelector(
    "#magazine-table-container .Bukhhalter-data-table tbody"
  ) as HTMLTableSectionElement | null;

  if (!tbody) {
    showNotification("Таблиця магазину не знайдена", "error");
    return;
  }

  const rows = tbody.querySelectorAll("tr:not(.Bukhhalter-no-data)");

  if (rows.length === 0) {
    showNotification("Немає даних магазину для експорту", "warning");
    return;
  }

  const excelData = Array.from(rows).map((row) => {
    const cells = row.querySelectorAll("td");

    const getTextContent = (index: number): string => {
      const cell = cells[index];
      if (!cell) return "";

      if (cell.querySelector("button")) {
        const text = cell.textContent || "";
        return text.replace(/🗑️|📋|💾/g, "").trim();
      }

      return cell.textContent?.trim() || "";
    };

    let totalText = getTextContent(9);
    totalText = totalText.replace(/\s+/g, "").trim();

    return {
      Розраховано: getTextContent(0),
      Прихід: getTextContent(1),
      Магазин: getTextContent(2),
      Рахунок: getTextContent(3),
      "Акт №": getTextContent(4),
      Найменування: getTextContent(5),
      Каталог: getTextContent(6),
      Кількість: getTextContent(7),
      Ціна: getTextContent(8),
      Сума: totalText,
      Залишок: getTextContent(10),
      Повернення: getTextContent(11),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Дані магазину");

  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 20 },
    { wch: 12 },
    { wch: 10 },
    { wch: 30 },
    { wch: 15 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
  ];

  const fileName = `Дані_магазину_${getCurrentDateForFileName()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showNotification(
    `Експортовано ${excelData.length} записів магазину`,
    "success"
  );
}

function downloadDetailsToExcel(): void {
  if (typeof (window as any).XLSX === "undefined") {
    console.warn("⚠️ XLSX не завантажена, спроба динамічного завантаження...");
    showNotification("⏳ Завантаження бібліотеки Excel...", "info", 2000);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadXLSXIfNeeded().then((ok) => {
      if (!ok || typeof (window as any).XLSX === "undefined") {
        console.error("❌ Не вдалося завантажити XLSX");
        showNotification(
          "❌ Помилка завантаження бібліотеки Excel. Перевірте інтернет-з'єднання.",
          "error",
          5000
        );
        return;
      }
      console.log("✅ XLSX успішно завантажена");
      downloadDetailsToExcel();
    });
    return;
  }

  const XLSX = (window as any).XLSX;

  const tbody = byId<HTMLTableSectionElement>("details-tbody");
  const rows = tbody.querySelectorAll("tr:not(.Bukhhalter-no-data)");

  if (rows.length === 0) {
    showNotification("Немає деталей по актам для експорту", "warning");
    return;
  }

  const excelData = Array.from(rows).map((row) => {
    const cells = row.querySelectorAll("td");

    const getTextContent = (index: number): string => {
      const cell = cells[index];
      if (!cell) return "";

      if (cell.querySelector("button")) {
        const text = cell.textContent || "";
        return text.replace(/🗑️|📋/g, "").trim();
      }

      return cell.textContent?.trim() || "";
    };

    const priceCell = cells[8];
    let salePrice = "-";
    let purchasePrice = "-";

    if (priceCell) {
      const priceTexts = priceCell.textContent?.trim().split("\n") || [];
      if (priceTexts.length >= 2) {
        purchasePrice = priceTexts[0].trim();
        salePrice = priceTexts[1].trim();
      } else if (priceTexts.length === 1) {
        salePrice = priceTexts[0].trim();
      }
    }

    return {
      "Дата відкриття": getTextContent(0),
      "Дата закриття": getTextContent(1),
      "Акт №": getTextContent(2),
      Автомобіль: getTextContent(3),
      Магазин: getTextContent(4),
      Найменування: getTextContent(5),
      Каталог: getTextContent(6),
      Кількість: getTextContent(7),
      "Закупівельна ціна": purchasePrice,
      "Продажна ціна": salePrice,
      Сума: getTextContent(9),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Деталі по актам");

  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
    { wch: 20 },
    { wch: 30 },
    { wch: 15 },
    { wch: 10 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
  ];

  const fileName = `Деталі_по_актам_${getCurrentDateForFileName()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showNotification(
    `Експортовано ${excelData.length} записів деталей`,
    "success"
  );
}

function downloadvutratuToExcel(): void {
  if (typeof (window as any).XLSX === "undefined") {
    console.warn("⚠️ XLSX не завантажена, спроба динамічного завантаження...");
    showNotification("⏳ Завантаження бібліотеки Excel...", "info", 2000);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadXLSXIfNeeded().then((ok) => {
      if (!ok || typeof (window as any).XLSX === "undefined") {
        console.error("❌ Не вдалося завантажити XLSX");
        showNotification(
          "❌ Помилка завантаження бібліотеки Excel. Перевірте інтернет-з'єднання.",
          "error",
          5000
        );
        return;
      }
      console.log("✅ XLSX успішно завантажена");
      downloadvutratuToExcel();
    });
    return;
  }

  const XLSX = (window as any).XLSX;
  const filteredData = getFilteredvutratuData();

  if (filteredData.length === 0) {
    showNotification("Немає витрат для експорту", "warning");
    return;
  }

  const excelData = filteredData.map((item) => {
    // Визначаємо чи це акт
    const isFromAct = item.category === "💰 Прибуток";

    // Формуємо об'єкт для експорту
    const row: any = {
      Розраховано: item.isPaid ? item.paymentDate || "Так" : "Ні",
      Дата: formatDate(item.date),
      Категорія: item.category,
      Опис: item.description,
    };

    // Для актів експортуємо деталі та роботу окремо
    if (isFromAct && item.detailsAmount !== undefined && item.workAmount !== undefined) {
      // Експортуємо як текст зі знаками
      const detailsSign = item.detailsAmount > 0 ? "+" : "";
      const workSign = item.workAmount > 0 ? "+" : "";

      row["⚙️ Деталі"] = item.detailsAmount !== 0 ? `${detailsSign}${item.detailsAmount}` : "0";
      row["🛠️ Робота"] = item.workAmount !== 0 ? `${workSign}${item.workAmount}` : "0";
    } else {
      // Для звичайних витрат експортуємо суму зі знаком
      const sign = item.amount > 0 ? "+" : "";
      row["Сума"] = `${sign}${item.amount}`;
    }

    row["Спосіб оплати"] = item.paymentMethod;
    row["Примітки"] = item.notes || "";

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Витрати");

  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 20 },
    { wch: 30 },
    { wch: 12 },
    { wch: 20 },
    { wch: 30 },
  ];

  const fileName = `Витрати_${getCurrentDateForFileName()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showNotification(
    `Експортовано ${excelData.length} записів витрат`,
    "success"
  );
}

export function downloadToExcel(): void {
  try {
    console.log(
      "📥 Експорт в Excel - перевірка наявності XLSX:",
      typeof (window as any).XLSX
    );

    // ВИПРАВЛЕНО: правильний клас кнопки
    const activeTab = document.querySelector(
      ".Bukhhalter-tab-btn.Bukhhalter-active"
    );
    if (!activeTab) {
      showNotification("Не вдалося визначити активну вкладку", "error");
      return;
    }

    const tabText = activeTab.textContent?.trim() || "";
    console.log("📊 Активна вкладка:", tabText);

    if (tabText.includes("Співробітники") || tabText.includes("Зарплата")) {
      downloadpodlegleToExcel();
    } else if (tabText.includes("Магазин") || tabText.includes("Склад")) {
      downloadMagazineToExcel();
    } else if (tabText.includes("По Актам") || tabText.includes("Деталі")) {
      downloadDetailsToExcel();
    } else if (tabText.includes("Витрати") || tabText.includes("Прибуток")) {
      // ВИПРАВЛЕНО: додано "Прибуток"
      downloadvutratuToExcel();
    } else {
      showNotification("Невідома вкладка для експорту", "warning");
    }
  } catch (error) {
    console.error("Помилка при експорті в Excel:", error);
    showNotification("Помилка при створенні Excel файлу", "error", 5000);
  }
}

export async function runMassPaymentCalculation(e?: Event): Promise<void> {
  e?.preventDefault?.();

  const maybeFromEvent = e?.currentTarget as HTMLButtonElement | null;
  const maybeActiveEl =
    document.activeElement instanceof HTMLButtonElement
      ? document.activeElement
      : null;
  const btn =
    maybeFromEvent ||
    maybeActiveEl ||
    document.querySelector<HTMLButtonElement>("#Bukhhalter-calc-button") ||
    document.querySelector<HTMLButtonElement>(".Bukhhalter-save-btn") ||
    null;

  setButtonLoadingEl(btn, true, "⏳ Розрахунок...", "💰 Розрахунок");

  // Визначаємо активну вкладку по видимості контейнерів
  const podlegleTable = document.getElementById(
    "podlegle-table-container"
  ) as HTMLElement | null;
  const magazineTable = document.getElementById(
    "magazine-table-container"
  ) as HTMLElement | null;
  const detailsTable = document.getElementById(
    "details-table-container"
  ) as HTMLElement | null;
  const vutratuTable = document.getElementById(
    "vutratu-table-container"
  ) as HTMLElement | null;

  const isPodlegleVisible =
    podlegleTable && podlegleTable.style.display !== "none";
  const isMagazineVisible =
    magazineTable && magazineTable.style.display !== "none";
  const isDetailsVisible =
    detailsTable && detailsTable.style.display !== "none";
  const isvutratuVisible =
    vutratuTable && vutratuTable.style.display !== "none";

  try {
    if (isPodlegleVisible) {
      console.log("🔄 Масовий розрахунок: підлеглі");
      await runMassPaymentCalculationForPodlegle();
    } else if (isMagazineVisible) {
      console.log("🔄 Масовий розрахунок: магазин");
      await runMassPaymentCalculationForMagazine();
    } else if (isDetailsVisible) {
      console.log("🔄 Масовий розрахунок: деталі");
      await runMassPaymentCalculationForDetails();
    } else if (isvutratuVisible) {
      console.log("🔄 Масовий розрахунок: витрати");
      await runMassPaymentCalculationForvutratu();
    } else {
      showNotification(
        "Спочатку оберіть вкладку 👨‍🔧 Зарплата, 🏪 Магазин, ⚙️ Деталі або 💰 Прибуток",
        "info"
      );
    }
  } catch (error) {
    console.error("❌ Помилка виконання масового розрахунку:", error);
    showNotification("❌ Помилка виконання масового розрахунку", "error");
  } finally {
    setButtonLoadingEl(btn, false, "", "💰 Розрахунок");
  }
}

function initializeDateInputs(): void {
  const dateInputs =
    document.querySelectorAll<HTMLInputElement>('input[type="date"]');

  dateInputs.forEach((input) => {
    input.addEventListener("click", function () {
      (this as any).showPicker?.();
    });

    input.addEventListener("focus", function () {
      (this as any).showPicker?.();
    });

    input.addEventListener("change", function () {
      console.log(`Дата змінена: ${this.id} = ${this.value}`);
    });
  });
}

// src/ts/roboha/bukhhalteriya/bukhhalteriya.ts

window.addEventListener("load", async function () {
  console.log("🚀 Початок ініціалізації бухгалтерії...");

  // Перевірка наявності XLSX
  if (typeof (window as any).XLSX !== "undefined") {
    console.log("✅ Бібліотека XLSX завантажена успішно");
  } else {
    console.warn("⚠️ Бібліотека XLSX НЕ завантажена при ініціалізації");
  }

  // [FIX] Контейнер тепер прихований за замовчуванням через CSS (style="display: none; visibility: hidden;")
  const mainContainer = document.querySelector(
    ".Bukhhalter-container"
  ) as HTMLElement;

  try {
    // 1. Авторизація та визначення ролі
    await attemptAutoLogin();
    const role = userAccessLevel;
    console.log("👤 Поточна роль:", role);

    // 2. Отримуємо посилання на кнопки
    const btnSklad = document.getElementById("tab-btn-magazine");
    const btnZarplata = document.getElementById("tab-btn-podlegle");
    const btnVutratu = document.getElementById("tab-btn-vutratu");
    const btnDetails = document.getElementById("tab-btn-details");

    // 3. Логіка відображення кнопок (ХОВАЄМО/ПОКАЗУЄМО)

    // --- Склад ---
    const canSeeSklad = await canUserSeeSkladButton();
    if (btnSklad) {
      btnSklad.style.display = canSeeSklad ? "" : "none";
    }

    // --- Деталі ---
    const canSeeDetails = await canUserSeeDetailsButton();
    if (btnDetails) {
      btnDetails.style.display = canSeeDetails ? "" : "none";
    }

    // --- Зарплата та Прибуток (Тільки Адмін) ---
    const isAdmin = role === "Адміністратор";
    if (btnZarplata) {
      btnZarplata.style.display = isAdmin ? "" : "none";
    }
    if (btnVutratu) {
      btnVutratu.style.display = isAdmin ? "" : "none";
    }

    // 4. Ініціалізація даних (завантажуємо довідники, селекти тощо)
    await loadSlyusarsData();
    initializeDetailsData();
    initializevutratuData();

    createStatusToggle();
    createPaymentToggle();
    createNameSelect();

    createMagazinePaymentToggle();
    createMagazineAvailabilityToggle();
    createShopsSelect();

    initializeDateInputs();

    // 5. 🎯 АВТО-КЛІК АБО БЛОКУВАННЯ
    const allTabButtons = document.querySelectorAll<HTMLElement>(
      ".Bukhhalter-tab-btn"
    );
    let firstVisibleTab: HTMLElement | null = null;

    for (let i = 0; i < allTabButtons.length; i++) {
      const btn = allTabButtons[i];
      // Перевіряємо, чи кнопка видима (display != none)
      if (btn && btn.style.display !== "none") {
        firstVisibleTab = btn;
        break; // Знайшли першу, зупиняємось
      }
    }

    if (firstVisibleTab) {
      console.log(`🔘 Авто-клік по вкладці: "${firstVisibleTab.innerText}"`);

      // [FIX] Якщо є доступні вкладки, показуємо ВЕСЬ контейнер
      if (mainContainer) {
        mainContainer.style.display = "";
        mainContainer.style.visibility = "visible";
      }

      firstVisibleTab.click();

      // 6. Додаткова ініціалізація перемикачів (тільки якщо доступ дозволено)
      console.log("🔧 Ініціалізація перемикачів фільтрації...");
      setTimeout(() => {
        if (typeof (window as any).initMagazineDateFilterToggle === "function")
          (window as any).initMagazineDateFilterToggle();
        if (typeof (window as any).initPodlegleDateFilterToggle === "function")
          (window as any).initPodlegleDateFilterToggle();
        if (typeof (window as any).initDetailsDateFilterToggle === "function")
          (window as any).initDetailsDateFilterToggle();
        if (typeof (window as any).initvutratuDateFilterToggle === "function")
          (window as any).initvutratuDateFilterToggle();
      }, 200);
    } else {
      // Очищаємо основний контейнер, щоб приховати інтерфейс (хоча він і так прихований, але для надійності)
      if (mainContainer) {
        mainContainer.innerHTML = "";
      }

      // Створюємо повноекранне повідомлення
      const accessDeniedOverlay = document.createElement("div");
      accessDeniedOverlay.id = "access-denied-overlay";
      accessDeniedOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: #f8f9fa; display: flex; flex-direction: column;
        justify-content: center; align-items: center; z-index: 99999;
        font-family: 'Segoe UI', sans-serif; text-align: center;
      `;

      accessDeniedOverlay.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 20px;">⛔</div>
        <h1 style="color: #dc3545; margin: 0 0 10px 0;">Доступ заборонено</h1>
        <p style="color: #555; font-size: 18px; margin-bottom: 30px;">
          У вас немає прав доступу до розділу Бухгалтерія.<br>
          Будь ласка, зверніться до Адміністратора.
        </p>
        <a href="main.html" style="
          padding: 12px 24px; background: #6c757d; color: white;
          text-decoration: none; border-radius: 8px; font-weight: 500;
          transition: background 0.2s;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        " onmouseover="this.style.background='#5a6268'" onmouseout="this.style.background='#6c757d'">
          🔙 Повернутися на Головну
        </a>
      `;

      document.body.appendChild(accessDeniedOverlay);
    }
  } catch (error) {
    console.error("❌ Помилка ініціалізації:", error);
  }
});
function openActModal(act: string | number) {
  const id = parseInt(String(act), 10);
  if (!Number.isFinite(id) || id <= 0) {
    showNotification("Некоректний номер акту", "warning");
    return;
  }
  showModal(id);
}

// @ts-ignore
(window as any).openActModal = openActModal;
// @ts-ignore
(window as any).showModal = showModal;

// Глобалізація функцій для HTML
// @ts-ignore
window.switchTab = switchTab;
// @ts-ignore
window.addRecord = addRecord;
// @ts-ignore
window.clearForm = clearForm;
// @ts-ignore
window.downloadToExcel = downloadToExcel;
// @ts-ignore
window.deleteRecord = deleteRecord;
// @ts-ignore
window.handleRowClick = handleRowClick;
// @ts-ignore
window.togglePayment = togglePayment;
// @ts-ignore
window.runMassPaymentCalculation = runMassPaymentCalculation;

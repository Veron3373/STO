// src/ts/roboha/bukhhalteriya/bukhhalteriya.ts
// Усі повідомлення через showNotification. Без confirm у масовому розрахунку магазину.
import { runMassPaymentCalculation as runMassPaymentCalculationForPodlegle } from "./pidlehli";
import { runMassPaymentCalculationForMagazine } from "./shopsBuxha";
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
} from "./pidlehli";

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

function isVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  const cs = window.getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

async function runMassPaymentCalculationDelegated(): Promise<void> {
  const podlegleTable = document.getElementById(
    "podlegle-table-container"
  ) as HTMLElement | null;
  const magazineTable = document.getElementById(
    "magazine-table-container"
  ) as HTMLElement | null;

  const onPodlegle = isVisible(podlegleTable);
  const onMagazine = isVisible(magazineTable);

  try {
    if (onPodlegle) {
      // масовий розрахунок підлеглих (використовує твої активні фільтри)
      await runMassPaymentCalculationForPodlegle();
    } else if (onMagazine) {
      // масовий розрахунок магазину (для відфільтрованих рядків)
      await runMassPaymentCalculationForMagazine();
    } else {
      showNotification(
        "Спочатку оберіть вкладку 👥 Співробітники або 🏪 Магазин",
        "info"
      );
    }
  } catch (e) {
    console.error(e);
    showNotification("❌ Помилка виконання масового розрахунку", "error");
  }
}

type TabName = "podlegle" | "magazine" | "details";

let currentTab: TabName = "podlegle";
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
  }

  return total;
}

export function updateTotalSum(): void {
  const totalSumElement = byId("total-sum");
  
  // Для деталей по актам показуємо спеціальний формат
  if (currentTab === "details") {
    // Викликаємо функцію з poAktam.ts яка розраховує та відображає три суми
    if (typeof (window as any).updateDetailsDisplayedSums === "function") {
      (window as any).updateDetailsDisplayedSums();
    }
    return;
  }

  // Для інших вкладок — звичайний формат
  const total = calculateTotalSum();
  totalSumElement.textContent = `Загальна сума: ${formatNumber(total)} грн`;
}

export function switchTab(e: Event, tabName: TabName) {
  const sections = document.querySelectorAll<HTMLElement>(
    ".Bukhhalter-form-section"
  );
  sections.forEach((section) => section.classList.remove("Bukhhalter-active"));

  const buttons = document.querySelectorAll<HTMLButtonElement>(
    ".Bukhhalter-tab-button"
  );
  buttons.forEach((button) => button.classList.remove("Bukhhalter-active"));

  byId<HTMLElement>("Bukhhalter-" + tabName + "-section").classList.add(
    "Bukhhalter-active"
  );

  const target = e.currentTarget as HTMLButtonElement | null;
  if (target) target.classList.add("Bukhhalter-active");

  currentTab = tabName;
  updateTableDisplay();
   updateTotalSum();
}

function updateTableDisplay(): void {
  const tableTitle = byId<HTMLDivElement>("table-title");
  const podlegleContainer = byId<HTMLDivElement>("podlegle-table-container");
  const magazineContainer = byId<HTMLDivElement>("magazine-table-container");
  const detailsContainer = byId<HTMLDivElement>("details-table-container");

  podlegleContainer.style.display = "none";
  magazineContainer.style.display = "none";
  detailsContainer.style.display = "none";

  if (currentTab === "podlegle") {
    tableTitle.innerHTML = "👥 Дані підлеглих";
    podlegleContainer.style.display = "block";
    updatepodlegleTable();
  } else if (currentTab === "magazine") {
    tableTitle.innerHTML = "🏪 Дані магазину";
    magazineContainer.style.display = "block";
    updateMagazineTable();
  } else if (currentTab === "details") {
    tableTitle.innerHTML = "📊 По актам";
    detailsContainer.style.display = "block";
    updateDetailsTable();
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

export async function addRecord(): Promise<void> {
  if (currentTab === "podlegle") {
    handlepodlegleAddRecord();
    updateTotalSum();
    return;
  }

  if (currentTab === "magazine") {
    // searchMagazineData може бути async — якщо так, додай await
    await Promise.resolve(searchMagazineData());
    return;
  }

  if (currentTab === "details") {
    await addDetailsRecord(); // <- головне виправлення
    // НЕ перевіряємо success, бо addDetailsRecord() повертає Promise<void>
    return;
  }
}

export function deleteRecord(type: TabName, index: number): void {
  if (type === "podlegle") {
    deletepodlegleRecord(index);
  } else if (type === "magazine") {
    deleteMagazineRecord(index); // без confirm — реалізовано у shopsBuxha.ts
  } else if (type === "details") {
    deleteDetailsRecord(index);
  }
  updateTotalSum();
}

export function clearForm(): void {
  const activeSection = document.querySelector<HTMLElement>(
    ".Bukhhalter-form-section.Bukhhalter-active"
  );
  if (!activeSection) return;

  if (currentTab === "magazine") {
    clearMagazineForm();
    return;
  }

  if (currentTab === "details") {
    clearDetailsForm();
    return;
  }

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

  if (currentTab === "podlegle") {
    const paymentToggle = byId<HTMLInputElement>("payment-filter-toggle");
    const statusToggle = byId<HTMLInputElement>("status-filter-toggle");

    if (paymentToggle) paymentToggle.value = "2";
    if (statusToggle) statusToggle.value = "2";

    updatepodlegleTable();
  }

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

function downloadpodlegleToExcel(): void {
  const filteredData = getFilteredpodlegleData();

  if (filteredData.length === 0) {
    showNotification("Немає даних для експорту", "warning");
    return;
  }

  if (typeof (window as any).XLSX === "undefined") {
    showNotification(
      "Бібліотека XLSX не завантажена. Додайте скрипт у HTML файл.",
      "error",
      5000
    );
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
    Кількість: item.quantity || 0,
    Ціна: item.price || 0,
    Сума: item.total || 0,
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

// Замініть функцію downloadMagazineToExcel() у файлі bukhhalteriya.ts на це:

function downloadMagazineToExcel(): void {
  if (typeof (window as any).XLSX === "undefined") {
    showNotification(
      "Бібліотека XLSX не завантажена. Додайте скрипт у HTML файл.",
      "error",
      5000
    );
    return;
  }

  const XLSX = (window as any).XLSX;

  // Витягуємо дані з таблиці магазину правильно
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

      // Для клітинок з кнопками отримуємо текст без кнопки
      if (cell.querySelector("button")) {
        const text = cell.textContent || "";
        return text.replace(/🗑️|📋|💾/g, "").trim();
      }

      return cell.textContent?.trim() || "";
    };

    // Структура таблиці магазину (відповідно до шапки на екрані):
    // 0: Розраховано, 1: Прихід, 2: Магазин, 3: Рахунок
    // 4: Акт №, 5: Найменування, 6: Каталог, 7: Кількість
    // 8: Ціна, 9: Сума, 10: Запас Повернення, 11: Дій (видалити)

    // Витягуємо суму зі "Сума" колонки (може мати +/- префікс)
    let totalText = getTextContent(9);
    totalText = totalText.replace(/\s+/g, "").trim();

    return {
      "Розраховано": getTextContent(0),
      "Прихід": getTextContent(1),
      "Магазин": getTextContent(2),
      "Рахунок": getTextContent(3),
      "Акт №": getTextContent(4),
      "Найменування": getTextContent(5),
      "Каталог": getTextContent(6),
      "Кількість": getTextContent(7),
      "Ціна": getTextContent(8),
      "Сума": totalText,
      "Залишок" : getTextContent(10),
      "Повернення": getTextContent(11)
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Дані магазину");

  // Встановлюємо ширину колонок (повинна збігатися з кількістю колонок)
  worksheet["!cols"] = [
    { wch: 15 }, // Розраховано
    { wch: 12 }, // Прихід
    { wch: 20 }, // Магазин
    { wch: 12 }, // Рахунок
    { wch: 10 }, // Акт №
    { wch: 30 }, // Найменування
    { wch: 15 }, // Каталог
    { wch: 10 }, // Кількість
    { wch: 12 }, // Ціна
    { wch: 12 }, // Сума
    { wch: 15 }, // Запас Повернення
  ];

  const fileName = `Дані_магазину_${getCurrentDateForFileName()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showNotification(
    `Експортовано ${excelData.length} записів магазину`,
    "success"
  );
}

// Замініть функцію downloadDetailsToExcel() у файлі bukhhalteriya.ts на цю:

function downloadDetailsToExcel(): void {
  if (typeof (window as any).XLSX === "undefined") {
    showNotification(
      "Бібліотека XLSX не завантажена. Додайте скрипт у HTML файл.",
      "error",
      5000
    );
    return;
  }

  const XLSX = (window as any).XLSX;

  const tbody = byId<HTMLTableSectionElement>("details-tbody");
  const rows = tbody.querySelectorAll("tr:not(.Bukhhalter-no-data)");

  if (rows.length === 0) {
    showNotification("Немає деталей по актам для експорту", "warning");
    return;
  }

  // Витягуємо дані правильно з усіх доступних клітинок
  const excelData = Array.from(rows).map((row) => {
    const cells = row.querySelectorAll("td");
    
    // Читаємо з клітинок у правильному порядку
    // 0: Дата відкриття, 1: Дата закриття, 2: Акт №, 3: Автомобіль
    // 4: Магазин, 5: Найменування, 6: Каталог, 7: Кількість
    // 8: Ціна (з підціною), 9: Сума, 10: Кнопка видалення
    
    const getTextContent = (index: number): string => {
      const cell = cells[index];
      if (!cell) return "";
      
      // Для клітинок з кнопками отримуємо текст без кнопки
      if (cell.querySelector("button")) {
        const text = cell.textContent || "";
        return text.replace(/🗑️|📋/g, "").trim();
      }
      
      return cell.textContent?.trim() || "";
    };

    // Витягуємо ціну правильно (у клітинці 8 може бути дві ціни)
    const priceCell = cells[8];
    let salePrice = "-";
    let purchasePrice = "-";
    
    if (priceCell) {
      const priceTexts = priceCell.textContent?.trim().split("\n") || [];
      // Перша (верхня) ціна — закупівельна, друга — продажна
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
      "Автомобіль": getTextContent(3),
      "Магазин": getTextContent(4),
      "Найменування": getTextContent(5),
      "Каталог": getTextContent(6),
      "Кількість": getTextContent(7),
      "Закупівельна ціна": purchasePrice,
      "Продажна ціна": salePrice,
      "Сума": getTextContent(9),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Деталі по актам");

  // Встановлюємо ширину колонок
  worksheet["!cols"] = [
    { wch: 12 },  // Дата відкриття
    { wch: 12 },  // Дата закриття
    { wch: 10 },  // Акт №
    { wch: 20 },  // Автомобіль
    { wch: 20 },  // Магазин
    { wch: 30 },  // Найменування
    { wch: 15 },  // Каталог
    { wch: 10 },  // Кількість
    { wch: 15 },  // Закупівельна ціна
    { wch: 12 },  // Продажна ціна
    { wch: 12 },  // Сума
  ];

  const fileName = `Деталі_по_актам_${getCurrentDateForFileName()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showNotification(
    `Експортовано ${excelData.length} записів деталей`,
    "success"
  );
}

export function downloadToExcel(): void {
  try {
    const activeTab = document.querySelector(
      ".Bukhhalter-tab-button.Bukhhalter-active"
    );
    if (!activeTab) {
      showNotification("Не вдалося визначити активну вкладку", "error");
      return;
    }

    const tabText = activeTab.textContent?.trim() || "";
    if (tabText.includes("Співробітники")) {
      downloadpodlegleToExcel();
    } else if (tabText.includes("Магазин")) {
      downloadMagazineToExcel();
    } else if (tabText.includes("По Актам")) {
      downloadDetailsToExcel();
    } else {
      showNotification("Невідома вкладка для експорту", "warning");
    }
  } catch (error) {
    console.error("Помилка при експорті в Excel:", error);
    showNotification("Помилка при створенні Excel файлу", "error", 5000);
  }
}

export function runMassPaymentCalculation(): void {
  if (currentTab === "podlegle") {
    showNotification(
      "Функція масового розрахунку для підлеглих поки що недоступна",
      "info"
    );
    return;
  }

  if (currentTab === "magazine") {
    // без confirm — просто повідомлення після умовного виконання
    // (тут постав свою реальну логіку, якщо потрібно)
    showNotification("Масовий розрахунок магазину виконано!", "success");
    return;
  }

  if (currentTab === "details") {
    showNotification(
      "Функція масового розрахунку для деталей по актам поки що недоступна",
      "info"
    );
    return;
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

window.addEventListener("load", async function () {
  console.log("Початок ініціалізації бухгалтерії...");

  try {
    // Співробітники та акти як було (якщо хочеш — теж можеш відключити)
    await loadSlyusarsData();
    initializeDetailsData();

    // Тогли/селекти
    createStatusToggle();
    createPaymentToggle();
    createNameSelect();

    createMagazinePaymentToggle();
    createMagazineAvailabilityToggle();
    createShopsSelect(); // створює select без автопошуку

    // ВАЖЛИВО: магазин НЕ ініціалізуємо тут (ніяких запитів)
    // await initializeMagazineData();  // ← не викликаємо

    updateTableDisplay();
    initializeDateInputs();

    // Ніяких "Ініціалізація завершена. Дані завантажено."
    // showNotification(...) ← прибрано
  } catch (error) {
    console.error("Помилка ініціалізації:", error);
    // Тут теж прибираємо загальну помилку про ініціалізацію магазину
    // showNotification("Помилка при ініціалізації системи бухгалтерії", "error", 5000);
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
// зробимо глобально доступним для HTML-кнопки
(window as any).runMassPaymentCalculation = runMassPaymentCalculationDelegated;

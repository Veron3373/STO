// src/ts/roboha/bukhhalteriya/vutratu.ts
// Модуль для обліку витрат
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { byId, formatNumber, formatDate } from "./bukhhalteriya";

interface ExpenseRecord {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  isPaid: boolean;
  paymentDate?: string;
  notes?: string;
}

let expensesData: ExpenseRecord[] = [];
let filteredExpensesData: ExpenseRecord[] = [];

// Категорії витрат
const EXPENSE_CATEGORIES = [
  "🔧 Інструменти",
  "🏢 Оренда",
  "💡 Комунальні послуги",
  "🚗 Транспорт",
  "📱 Зв'язок",
  "🖥️ Обладнання",
  "📄 Канцелярія",
  "👥 Зарплата",
  "🍴 Харчування",
  "🏥 Медицина",
  "📚 Навчання",
  "🔨 Ремонт",
  "💼 Інше",
];

// Способи оплати
const PAYMENT_METHODS = [
  "💵 Готівка",
  "💳 Картка",
  "🏦 Банківський переказ",
  "📱 Електронний гаманець",
];

// Ініціалізація даних витрат
export function initializeExpensesData(): void {
  console.log("🔄 Ініціалізація даних витрат...");
  
  // Тут можна завантажити дані з сервера або localStorage
  // Поки що створюємо тестові дані
  expensesData = loadExpensesFromStorage();
  filteredExpensesData = [...expensesData];
  
  createExpenseCategorySelect();
  createPaymentMethodSelect();
  createExpensePaymentToggle();
  
  updateExpensesTable();
  console.log("✅ Дані витрат ініціалізовано");
}

// Завантаження витрат зі сховища
function loadExpensesFromStorage(): ExpenseRecord[] {
  try {
    const stored = localStorage.getItem("expensesData");
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Помилка завантаження витрат:", error);
    return [];
  }
}

// Збереження витрат у сховище
function saveExpensesToStorage(): void {
  try {
    localStorage.setItem("expensesData", JSON.stringify(expensesData));
  } catch (error) {
    console.error("Помилка збереження витрат:", error);
  }
}

// Створення селекту категорій
function createExpenseCategorySelect(): void {
  const select = byId<HTMLSelectElement>("Bukhhalter-expenses-category");
  if (!select) return;

  select.innerHTML = '<option value="">Оберіть категорію</option>';
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

// Створення селекту способів оплати
function createPaymentMethodSelect(): void {
  const select = byId<HTMLSelectElement>("Bukhhalter-expenses-payment-method");
  if (!select) return;

  select.innerHTML = '<option value="">Оберіть спосіб оплати</option>';
  PAYMENT_METHODS.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    select.appendChild(option);
  });
}

// Створення перемикача оплати
export function createExpensePaymentToggle(): void {
  const toggle = byId<HTMLInputElement>("expenses-payment-filter-toggle");
  if (!toggle) return;

  toggle.addEventListener("input", () => {
    filterExpensesData();
  });
}

// Фільтрація даних витрат
function filterExpensesData(): void {
  const dateFrom = byId<HTMLInputElement>("Bukhhalter-expenses-date-from").value;
  const dateTo = byId<HTMLInputElement>("Bukhhalter-expenses-date-to").value;
  const category = byId<HTMLSelectElement>("Bukhhalter-expenses-category").value;
  const paymentMethod = byId<HTMLSelectElement>("Bukhhalter-expenses-payment-method").value;
  const description = byId<HTMLInputElement>("Bukhhalter-expenses-description").value.toLowerCase();
  const paymentToggle = byId<HTMLInputElement>("expenses-payment-filter-toggle").value;

  filteredExpensesData = expensesData.filter((expense) => {
    // Фільтр по даті
    if (dateFrom && expense.date < dateFrom) return false;
    if (dateTo && expense.date > dateTo) return false;

    // Фільтр по категорії
    if (category && expense.category !== category) return false;

    // Фільтр по способу оплати
    if (paymentMethod && expense.paymentMethod !== paymentMethod) return false;

    // Фільтр по опису
    if (description && !expense.description.toLowerCase().includes(description)) return false;

    // Фільтр по оплаті
    if (paymentToggle === "0" && !expense.isPaid) return false;
    if (paymentToggle === "1" && expense.isPaid) return false;

    return true;
  });

  updateExpensesTable();
}

// Оновлення таблиці витрат
export function updateExpensesTable(): void {
  const tbody = byId<HTMLTableSectionElement>("expenses-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (filteredExpensesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="Bukhhalter-no-data">Немає витрат для відображення</td></tr>';
    updateExpensesDisplayedSums();
    return;
  }

  filteredExpensesData.forEach((expense, index) => {
    const row = tbody.insertRow();
    row.className = expense.isPaid ? "paid-row" : "unpaid-row";

    // Колонка: Розраховано
    const paymentCell = row.insertCell();
    paymentCell.innerHTML = `
      <button 
        class="Bukhhalter-payment-btn ${expense.isPaid ? "paid" : "unpaid"}"
        onclick="toggleExpensePayment(${index})"
      >
        ${expense.isPaid ? (expense.paymentDate ? formatDate(expense.paymentDate) : "✅ Так") : "❌ Ні"}
      </button>
    `;

    // Колонка: Дата
    const dateCell = row.insertCell();
    dateCell.textContent = formatDate(expense.date);

    // Колонка: Категорія
    const categoryCell = row.insertCell();
    categoryCell.textContent = expense.category;

    // Колонка: Опис
    const descriptionCell = row.insertCell();
    descriptionCell.textContent = expense.description;

    // Колонка: Сума
    const amountCell = row.insertCell();
    amountCell.textContent = formatNumber(expense.amount);

    // Колонка: Спосіб оплати
    const methodCell = row.insertCell();
    methodCell.textContent = expense.paymentMethod;

    // Колонка: Примітки
    const notesCell = row.insertCell();
    notesCell.textContent = expense.notes || "-";

    // Колонка: Дії
    const actionsCell = row.insertCell();
    actionsCell.innerHTML = `
      <button class="Bukhhalter-delete-btn" onclick="deleteExpenseRecord(${index})" title="Видалити">🗑️</button>
    `;

    row.onclick = () => (window as any).handleRowClick(index);
  });

  updateExpensesDisplayedSums();
}

// Розрахунок сум витрат
export function calculateExpensesTotalSum(): number {
  return filteredExpensesData.reduce((sum, expense) => sum + expense.amount, 0);
}

// Оновлення відображуваних сум
export function updateExpensesDisplayedSums(): void {
  const totalSumElement = byId("total-sum");
  if (!totalSumElement) return;

  const totalAll = filteredExpensesData.reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = filteredExpensesData.filter((e) => e.isPaid).reduce((sum, e) => sum + e.amount, 0);
  const totalUnpaid = filteredExpensesData.filter((e) => !e.isPaid).reduce((sum, e) => sum + e.amount, 0);

  totalSumElement.innerHTML = `
    <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 10px;">
      <div>Всього: <strong>${formatNumber(totalAll)}</strong> грн</div>
      <div style="color: #28a745;">Оплачено: <strong>${formatNumber(totalPaid)}</strong> грн</div>
      <div style="color: #f44336;">Не оплачено: <strong>${formatNumber(totalUnpaid)}</strong> грн</div>
    </div>
  `;
}

// Додавання нової витрати
export async function addExpenseRecord(): Promise<void> {
  const date = byId<HTMLInputElement>("Bukhhalter-expenses-date-from").value;
  const category = byId<HTMLSelectElement>("Bukhhalter-expenses-category").value;
  const description = byId<HTMLInputElement>("Bukhhalter-expenses-description").value;
  const amount = parseFloat(byId<HTMLInputElement>("Bukhhalter-expenses-amount").value);
  const paymentMethod = byId<HTMLSelectElement>("Bukhhalter-expenses-payment-method").value;
  const notes = byId<HTMLInputElement>("Bukhhalter-expenses-notes").value;

  if (!date || !category || !description || !amount || !paymentMethod) {
    showNotification("⚠️ Заповніть всі обов'язкові поля", "warning");
    return;
  }

  if (amount <= 0) {
    showNotification("⚠️ Сума повинна бути більше 0", "warning");
    return;
  }

  const newExpense: ExpenseRecord = {
    id: Date.now().toString(),
    date,
    category,
    description,
    amount,
    paymentMethod,
    isPaid: false,
    notes,
  };

  expensesData.unshift(newExpense);
  saveExpensesToStorage();
  filterExpensesData();
  
  showNotification("✅ Витрату додано", "success");
  clearExpensesForm();
}

// Видалення витрати
export function deleteExpenseRecord(index: number): void {
  const expense = filteredExpensesData[index];
  if (!expense) return;

  const originalIndex = expensesData.findIndex((e) => e.id === expense.id);
  if (originalIndex === -1) return;

  if (!confirm(`Видалити витрату "${expense.description}"?`)) return;

  expensesData.splice(originalIndex, 1);
  saveExpensesToStorage();
  filterExpensesData();
  
  showNotification("🗑️ Витрату видалено", "info");
}

// Перемикання статусу оплати
export function toggleExpensePayment(index: number): void {
  const expense = filteredExpensesData[index];
  if (!expense) return;

  const originalIndex = expensesData.findIndex((e) => e.id === expense.id);
  if (originalIndex === -1) return;

  expensesData[originalIndex].isPaid = !expensesData[originalIndex].isPaid;
  
  if (expensesData[originalIndex].isPaid) {
    expensesData[originalIndex].paymentDate = new Date().toISOString().split("T")[0];
  } else {
    delete expensesData[originalIndex].paymentDate;
  }

  saveExpensesToStorage();
  filterExpensesData();
}

// Очищення форми
export function clearExpensesForm(): void {
  byId<HTMLInputElement>("Bukhhalter-expenses-date-from").value = "";
  byId<HTMLInputElement>("Bukhhalter-expenses-date-to").value = "";
  byId<HTMLSelectElement>("Bukhhalter-expenses-category").value = "";
  byId<HTMLInputElement>("Bukhhalter-expenses-description").value = "";
  byId<HTMLInputElement>("Bukhhalter-expenses-amount").value = "";
  byId<HTMLSelectElement>("Bukhhalter-expenses-payment-method").value = "";
  byId<HTMLInputElement>("Bukhhalter-expenses-notes").value = "";
  byId<HTMLInputElement>("expenses-payment-filter-toggle").value = "2";
  
  filterExpensesData();
}

// Масовий розрахунок витрат
export async function runMassPaymentCalculationForExpenses(): Promise<void> {
  const unpaidExpenses = filteredExpensesData.filter((e) => !e.isPaid);

  if (unpaidExpenses.length === 0) {
    showNotification("ℹ️ Немає неоплачених витрат", "info");
    return;
  }

  if (!confirm(`Позначити ${unpaidExpenses.length} витрат як оплачені?`)) return;

  const today = new Date().toISOString().split("T")[0];

  unpaidExpenses.forEach((expense) => {
    const originalIndex = expensesData.findIndex((e) => e.id === expense.id);
    if (originalIndex !== -1) {
      expensesData[originalIndex].isPaid = true;
      expensesData[originalIndex].paymentDate = today;
    }
  });

  saveExpensesToStorage();
  filterExpensesData();
  
  showNotification(`✅ Позначено ${unpaidExpenses.length} витрат як оплачені`, "success");
}

// Експорт для використання в інших модулях
export function getFilteredExpensesData(): ExpenseRecord[] {
  return filteredExpensesData;
}

// Глобалізація функцій
(window as any).toggleExpensePayment = toggleExpensePayment;
(window as any).deleteExpenseRecord = deleteExpenseRecord;
(window as any).updateExpensesDisplayedSums = updateExpensesDisplayedSums;
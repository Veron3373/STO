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

type ExpenseMode = 'add' | 'edit' | 'delete';

interface ExpenseModeConfig {
  emoji: string;
  text: string;
  title: string;
  buttonText: string;
  className: string;
}

let expensesData: ExpenseRecord[] = [];
let filteredExpensesData: ExpenseRecord[] = [];

// Глобальна змінна для зберігання режиму
let currentExpenseMode: ExpenseMode = 'add';

// Конфігурація режимів
// Конфігурація режимів
const expenseModes: Record<ExpenseMode, ExpenseModeConfig> = {
  add: {
    emoji: '➕',
    text: 'Додати',
    title: 'Додати витрату',
    buttonText: '💾 Додати',
    className: 'mode-add'
  },
  edit: {
    emoji: '✏️',
    text: 'Редагувати',
    title: 'Редагувати витрату',
    buttonText: '💾 Зберегти зміни',
    className: 'mode-edit'
  },
  delete: {
    emoji: '🗑️',
    text: 'Видалити',
    title: 'Видалити витрату',
    buttonText: '🗑️ Підтвердити видалення',
    className: 'mode-delete'
  }
};
// Послідовність перемикання
const modeSequence: ExpenseMode[] = ['add', 'edit', 'delete'];

// Категорії витрат
const EXPENSE_CATEGORIES = [
  "🔧 Інструменти",
  "🏢 Оренда",
  "💡 Комунальні послуги",
  "🚗 Доставка",
  "📱 Зв'язок",
  "🖥️ Обладнання",
  "📄 Канцелярія",
  "👨‍🔧 Зарплата",
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

// ==================== ФУНКЦІЇ РЕЖИМІВ ====================

// Циклічне перемикання режимів
export function cycleExpenseMode(): void {
  const currentIndex = modeSequence.indexOf(currentExpenseMode);
  const nextIndex = (currentIndex + 1) % modeSequence.length;
  const nextMode = modeSequence[nextIndex];
  
  setExpenseMode(nextMode);
}

// Встановлення конкретного режиму
export function setExpenseMode(mode: ExpenseMode): void {
  if (!expenseModes[mode]) return;
  
  currentExpenseMode = mode;
  const config = expenseModes[mode];
  
  // Оновлюємо кнопку
  const modeBtn = byId<HTMLButtonElement>('expense-mode-btn');
  if (modeBtn) {
    modeBtn.textContent = `${config.emoji} ${config.text}`;
    modeBtn.className = `expense-mode-switcher ${config.className}`;
  }
  
  // Оновлюємо заголовок
  const title = byId<HTMLHeadingElement>('expense-modal-title');
  if (title) title.textContent = config.title;
  
  // Оновлюємо кнопку збереження
  const saveBtn = document.querySelector('.expense-modal-footer button') as HTMLButtonElement;
  if (saveBtn) {
    saveBtn.textContent = config.buttonText;
  }
  
  console.log('🔄 Режим змінено на:', mode);
}

// Отримання поточного режиму
export function getCurrentExpenseMode(): ExpenseMode {
  return currentExpenseMode;
}

// ==================== ДОПОМІЖНІ ФУНКЦІЇ ====================

// Форматування суми з пробілами
export function formatAmountWithSpaces(input: HTMLInputElement): void {
  const cursorPosition = input.selectionStart || 0;
  const oldValue = input.value;
  
  let value = input.value.replace(/\s/g, '').replace(/[^\d.,]/g, '');
  value = value.replace(',', '.');
  
  const parts = value.split('.');
  let integerPart = parts[0];
  const decimalPart = parts.length > 1 ? '.' + parts[1].substring(0, 2) : '';
  
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  const newValue = integerPart + decimalPart;
  input.value = newValue;
  
  const diff = newValue.length - oldValue.length;
  input.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
}

// Автоматичне розтягування textarea
export function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

// ==================== ІНІЦІАЛІЗАЦІЯ ====================

// Ініціалізація даних витрат
export function initializeExpensesData(): void {
  console.log("🔄 Ініціалізація даних витрат...");
  
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

// ==================== СТВОРЕННЯ СЕЛЕКТІВ ====================

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

// ==================== ФІЛЬТРАЦІЯ ====================

// Фільтрація даних витрат
function filterExpensesData(): void {
  const dateFrom = byId<HTMLInputElement>("Bukhhalter-expenses-date-from")?.value || "";
  const dateTo = byId<HTMLInputElement>("Bukhhalter-expenses-date-to")?.value || "";
  const category = byId<HTMLSelectElement>("Bukhhalter-expenses-category")?.value || "";
  const paymentMethod = byId<HTMLSelectElement>("Bukhhalter-expenses-payment-method")?.value || "";
  const paymentToggle = byId<HTMLInputElement>("expenses-payment-filter-toggle")?.value || "2";

  filteredExpensesData = expensesData.filter((expense) => {
    // Фільтр по даті
    if (dateFrom && expense.date < dateFrom) return false;
    if (dateTo && expense.date > dateTo) return false;

    // Фільтр по категорії
    if (category && expense.category !== category) return false;

    // Фільтр по способу оплати
    if (paymentMethod && expense.paymentMethod !== paymentMethod) return false;

    // Фільтр по оплаті
    if (paymentToggle === "0" && !expense.isPaid) return false;
    if (paymentToggle === "1" && expense.isPaid) return false;

    return true;
  });

  updateExpensesTable();
}

// ==================== ТАБЛИЦЯ ====================

// Оновлення таблиці витрат
export function updateExpensesTable(): void {
  const tbody = byId<HTMLTableSectionElement>("expenses-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (filteredExpensesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="Bukhhalter-no-data">Немає витрат для відображення</td></tr>';
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

    // Колонка: Дата відкриття
    const dateCell = row.insertCell();
    dateCell.textContent = formatDate(expense.date);

    // Колонка: Дата закриття
    const dateCloseCell = row.insertCell();
    dateCloseCell.textContent = expense.paymentDate ? formatDate(expense.paymentDate) : "-";

    // Колонка: Категорія
    const categoryCell = row.insertCell();
    categoryCell.textContent = expense.category;

    // Колонка: Акт_№
    const actCell = row.insertCell();
    actCell.textContent = "-";

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

    row.onclick = () => selectExpenseRow(index);
  });

  updateExpensesDisplayedSums();
}

// ==================== СУМИ ====================

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
  const difference = totalAll - totalPaid;
  const diffSign = difference >= 0 ? '+' : '';

  totalSumElement.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 15px; font-size: 1.1em;">
      <span>Сумма <strong style="color: #333;">💰 ${formatNumber(totalAll)}</strong> грн</span>
      <span style="color: #666;">-</span>
      <span><strong style="color: #8B0000;">💶 ${formatNumber(totalPaid)}</strong> грн</span>
      <span style="color: #666;">=</span>
      <span><strong style="color: ${difference >= 0 ? '#006400 ' : '#8B0000'};">📈 ${diffSign}${formatNumber(difference)}</strong> грн</span>
    </div>
  `;
}

// ==================== CRUD ОПЕРАЦІЇ ====================

// Додавання нової витрати
async function handleAddExpense(
  date: string,
  category: string,
  description: string,
  amount: number,
  paymentMethod: string,
  notes: string
): Promise<void> {
  const newExpense: ExpenseRecord = {
    id: Date.now().toString(),
    date,
    category,
    description,
    amount,
    paymentMethod,
    isPaid: false,
    notes: notes || undefined,
  };

  expensesData.unshift(newExpense);
  saveExpensesToStorage();
  filterExpensesData();

  showNotification("✅ Витрату додано", "success");
  closeExpenseModal();
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

// Вибір рядка для редагування
function selectExpenseRow(index: number): void {
  const expense = filteredExpensesData[index];
  if (!expense) return;

  console.log("Вибрано витрату для редагування:", expense);
  // TODO: Заповнити форму даними для редагування
}

// ==================== ФОРМА ====================

// Очищення форми
export function clearExpensesForm(): void {
  byId<HTMLInputElement>("Bukhhalter-expenses-date-from").value = "";
  byId<HTMLInputElement>("Bukhhalter-expenses-date-to").value = "";
  byId<HTMLSelectElement>("Bukhhalter-expenses-category").value = "";
  byId<HTMLSelectElement>("Bukhhalter-expenses-payment-method").value = "";
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

// ==================== МОДАЛЬНЕ ВІКНО ====================

// Відкриття модального вікна
export function openExpenseModal(): void {
  const modal = byId<HTMLDivElement>("expense-modal");
  if (!modal) return;

  // Встановлюємо режим "Додати" при відкритті
  setExpenseMode('add');

  // Встановлюємо сьогоднішню дату
  const today = new Date().toISOString().split("T")[0];
  byId<HTMLInputElement>("expense-modal-date").value = today;

  // Заповнюємо селекти
  populateModalCategorySelect();
  populateModalPaymentMethodSelect();

  // Очищаємо інші поля
  byId<HTMLInputElement>("expense-modal-description").value = "";
  byId<HTMLInputElement>("expense-modal-amount").value = "";
  byId<HTMLInputElement>("expense-modal-notes").value = "";

  modal.style.display = "flex";
}

// Закриття модального вікна
export function closeExpenseModal(): void {
  const modal = byId<HTMLDivElement>("expense-modal");
  if (!modal) return;
  modal.style.display = "none";
}

// Заповнення селекту категорій в модалці
function populateModalCategorySelect(): void {
  const select = byId<HTMLSelectElement>("expense-modal-category");
  if (!select) return;

  select.innerHTML = '<option value="">Оберіть категорію</option>';
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

// Заповнення селекту способів оплати в модалці
function populateModalPaymentMethodSelect(): void {
  const select = byId<HTMLSelectElement>("expense-modal-payment-method");
  if (!select) return;

  select.innerHTML = '<option value="">Оберіть спосіб оплати</option>';
  PAYMENT_METHODS.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    select.appendChild(option);
  });
}

// Збереження витрати з модального вікна
export async function saveExpenseFromModal(): Promise<void> {
  const mode = getCurrentExpenseMode();
  
  console.log(`💾 Збереження в режимі: ${mode}`);
  
  const date = byId<HTMLInputElement>("expense-modal-date")?.value || "";
  const category = byId<HTMLSelectElement>("expense-modal-category")?.value || "";
  const description = byId<HTMLInputElement>("expense-modal-description")?.value || "";
  const amountStr = byId<HTMLInputElement>("expense-modal-amount")?.value || "";
  const paymentMethod = byId<HTMLSelectElement>("expense-modal-payment-method")?.value || "";
  const notes = byId<HTMLInputElement>("expense-modal-notes")?.value || "";

  // Видалення пробілів з суми перед парсингом
  const amount = parseFloat(amountStr.replace(/\s/g, ''));

  // Валідація
  if (!date) {
    showNotification("⚠️ Введіть дату", "warning");
    return;
  }

  if (!category) {
    showNotification("⚠️ Оберіть категорію", "warning");
    return;
  }

  if (!paymentMethod) {
    showNotification("⚠️ Оберіть спосіб оплати", "warning");
    return;
  }

  if (!description) {
    showNotification("⚠️ Введіть опис витрати", "warning");
    return;
  }

  if (!amount || amount <= 0 || isNaN(amount)) {
    showNotification("⚠️ Введіть коректну суму більше 0", "warning");
    return;
  }

  // Обробка залежно від режиму
  switch (mode) {
    case 'add':
      await handleAddExpense(date, category, description, amount, paymentMethod, notes);
      break;
    case 'edit':
      await handleEditExpense(date, category, description, amount, paymentMethod, notes);
      break;
    case 'delete':
      await handleDeleteExpense();
      break;
  }
}


// Редагування існуючої витрати
async function handleEditExpense(
  date: string,
  category: string,
  description: string,
  amount: number,
  paymentMethod: string,
  notes: string
): Promise<void> {
  const selectedIndex = filteredExpensesData.findIndex(expense => expense.id === selectedExpenseId);
  if (selectedIndex === -1) {
    showNotification("⚠️ Витрата для редагування не вибрана", "warning");
    return;
  }

  const updatedExpense: ExpenseRecord = {
    ...filteredExpensesData[selectedIndex],
    date,
    category,
    description,
    amount,
    paymentMethod,
    notes: notes || undefined,
  };

  try {
    const response = await fetch(`/api/vutratu/${updatedExpense.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedExpense),
    });
    if (!response.ok) throw new Error('Failed to update expense');

    expensesData[expensesData.findIndex(e => e.id === updatedExpense.id)] = updatedExpense;
    saveExpensesToStorage();
    filterExpensesData();

    showNotification("✅ Витрату оновлено", "success");
    closeExpenseModal();
  } catch (error) {
    console.error("Помилка редагування витрати:", error);
    showNotification("❌ Помилка редагування витрати", "error");
  }
}

// Видалення витрати
async function handleDeleteExpense(): Promise<void> {
  const selectedIndex = filteredExpensesData.findIndex(expense => expense.id === selectedExpenseId);
  if (selectedIndex === -1) {
    showNotification("⚠️ Витрата для видалення не вибрана", "warning");
    return;
  }

  const expenseToDelete = filteredExpensesData[selectedIndex];
  if (!confirm(`Видалити витрату "${expenseToDelete.description}"?`)) return;

  try {
    const response = await fetch(`/api/vutratu/${expenseToDelete.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete expense');

    expensesData.splice(expensesData.findIndex(e => e.id === expenseToDelete.id), 1);
    saveExpensesToStorage();
    filterExpensesData();

    showNotification("🗑️ Витрату видалено", "info");
    closeExpenseModal();
  } catch (error) {
    console.error("Помилка видалення витрати:", error);
    showNotification("❌ Помилка видалення витрати", "error");
  }
}

// Глобальна змінна для зберігання ID вибраної витрати
let selectedExpenseId: string | null = null;


// ==================== ЕКСПОРТ ====================

// Експорт для використання в інших модулях
export function getFilteredExpensesData(): ExpenseRecord[] {
  return filteredExpensesData;
}

// ==================== ГЛОБАЛІЗАЦІЯ ====================

// Глобалізація всіх функцій для використання в HTML
(window as any).openExpenseModal = openExpenseModal;
(window as any).closeExpenseModal = closeExpenseModal;
(window as any).saveExpenseFromModal = saveExpenseFromModal;
(window as any).toggleExpensePayment = toggleExpensePayment;
(window as any).deleteExpenseRecord = deleteExpenseRecord;
(window as any).updateExpensesDisplayedSums = updateExpensesDisplayedSums;
(window as any).cycleExpenseMode = cycleExpenseMode;
(window as any).setExpenseMode = setExpenseMode;
(window as any).formatAmountWithSpaces = formatAmountWithSpaces;
(window as any).autoResizeTextarea = autoResizeTextarea;
(window as any).getCurrentExpenseMode = getCurrentExpenseMode;
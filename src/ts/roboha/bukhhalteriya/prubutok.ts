// src/ts/roboha/bukhhalteriya/prubutok.ts
// Модуль для обліку витрат з інтеграцією Supabase
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { byId, formatNumber, formatDate } from "./bukhhalteriya";
import { userName, getSavedUserDataFromLocalStorage } from "../tablucya/users";
import { checkCurrentPageAccess } from "../zakaz_naraudy/inhi/page_access_guard";
import { redirectToIndex } from "../../utils/gitUtils";

interface ExpenseRecordLocal {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  isPaid: boolean;
  paymentDate?: string | null;
  rosraxovanoDate?: string | null;
  notes?: string;
  actNumber?: string | number;
  createdBy?: string;
  detailsAmount?: number;
  workAmount?: number;
  clientId?: number;
  carId?: number;
  xto_rozraxuvav?: string;
  fullAmount?: number; // Повна сума з акту
  fullDetailsAmount?: number; // Повна сума за деталі з акту
  fullWorkAmount?: number; // Повна сума за роботу з акту
  tupOplatu?: string; // Тип оплати
  discount?: number; // Знижка у відсотках
  discountAmount?: number; // Сума знижки
}

type ExpenseMode = "add" | "edit" | "delete";

interface ExpenseModeConfig {
  emoji: string;
  text: string;
  title: string;
  buttonText: string;
  className: string;
}

let vutratuData: ExpenseRecordLocal[] = [];
let filteredvutratuData: ExpenseRecordLocal[] = [];
let currentExpenseMode: ExpenseMode = "add";
let selectedExpenseId: number | null = null;

const expenseModes: Record<ExpenseMode, ExpenseModeConfig> = {
  add: {
    emoji: "➕",
    text: "Додати",
    title: "Додати витрату",
    buttonText: "💾 Додати",
    className: "mode-add",
  },
  edit: {
    emoji: "✏️",
    text: "Редагувати",
    title: "Редагувати витрату",
    buttonText: "💾 Зберегти зміни",
    className: "mode-edit",
  },
  delete: {
    emoji: "🗑️",
    text: "Видалити",
    title: "Видалити витрату",
    buttonText: "🗑️ Підтвердити видалення",
    className: "mode-delete",
  },
};

const modeSequence: ExpenseMode[] = ["add", "edit", "delete"];

const EXPENSE_CATEGORIES = [
  "🚕 Таксі",
  "🚚 Нова Пошта",
  "🚛 Meest Express",
  "🛻 Delivery",
  "🔧 Інструменти",
  "🏢 Оренда",
  "💡 Комунальні послуги",
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

const PAYMENT_METHODS = ["💵 Готівка", "💳 Картка", "🏦 IBAN"];

// ВСТАВИТИ ЦЕЙ КОД:
// Функції для перетворення між форматами з емодзі та без
function removeEmoji(text: string): string {
  return text
    .replace(
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
      "",
    )
    .trim();
}

function addEmojiToCategory(categoryName: string): string {
  const found = EXPENSE_CATEGORIES.find(
    (cat) => removeEmoji(cat) === categoryName,
  );
  return found || categoryName;
}

function addEmojiToPaymentMethod(methodName: string): string {
  const found = PAYMENT_METHODS.find(
    (method) => removeEmoji(method) === methodName,
  );
  return found || methodName;
}

// ==================== ФУНКЦІЇ РЕЖИМІВ ====================

export function cycleExpenseMode(): void {
  const currentIndex = modeSequence.indexOf(currentExpenseMode);
  const nextIndex = (currentIndex + 1) % modeSequence.length;
  const nextMode = modeSequence[nextIndex];
  setExpenseMode(nextMode);
}

export function setExpenseMode(mode: ExpenseMode): void {
  if (!expenseModes[mode]) return;
  currentExpenseMode = mode;
  const config = expenseModes[mode];
  const modeBtn = byId<HTMLButtonElement>("expense-mode-btn");
  if (modeBtn) {
    modeBtn.textContent = `${config.emoji} ${config.text}`;
    modeBtn.className = `expense-mode-switcher ${config.className}`;
  }
  const title = byId<HTMLHeadingElement>("expense-modal-title");
  if (title) title.textContent = config.title;
  const saveBtn = document.querySelector(
    ".expense-modal-footer button",
  ) as HTMLButtonElement;
  if (saveBtn) {
    saveBtn.textContent = config.buttonText;
  }
}

export function getCurrentExpenseMode(): ExpenseMode {
  return currentExpenseMode;
}

// ==================== ДОПОМІЖНІ ФУНКЦІЇ ====================

export function formatAmountWithSpaces(input: HTMLInputElement): void {
  const cursorPosition = input.selectionStart || 0;
  const oldValue = input.value;
  let value = input.value.replace(/\s/g, "").replace(/[^\d.,]/g, "");
  value = value.replace(",", ".");
  const parts = value.split(".");
  let integerPart = parts[0];
  const decimalPart = parts.length > 1 ? "." + parts[1].substring(0, 2) : "";
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const newValue = integerPart + decimalPart;
  input.value = newValue;
  const diff = newValue.length - oldValue.length;
  input.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
}

export function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
}

function getCurrentUserName(): string {
  if (userName && userName !== "Невідомий користувач") {
    return userName;
  }
  const savedData = getSavedUserDataFromLocalStorage();
  if (savedData && savedData.name) {
    return savedData.name;
  }
  return "Система";
}

// 1) Функція для отримання поточного часу в UTC (залишаємо без змін, але уточнюємо)
// Повертає локальний київський час як 'YYYY-MM-DDTHH:MM:SS' (без 'Z')
// Підходить для колонок Postgres типу timestamp (без TZ)
function getCurrentUkrainianTime(): string {
  const now = new Date();
  // Час у Києві як Date, побудований із рядка (без прив'язки до UTC)
  const kyivNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Kyiv", hour12: false }),
  );

  const y = kyivNow.getFullYear();
  const m = String(kyivNow.getMonth() + 1).padStart(2, "0");
  const d = String(kyivNow.getDate()).padStart(2, "0");
  const hh = String(kyivNow.getHours()).padStart(2, "0");
  const mm = String(kyivNow.getMinutes()).padStart(2, "0");
  const ss = String(kyivNow.getSeconds()).padStart(2, "0");

  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`; // без 'Z' і без офсету
}

// 2) Нова функція для отримання дати в форматі YYYY-MM-DD за Київським часом
function getKyivDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    });
  } catch (error) {
    // console.error("❌ Помилка конвертації дати:", error);
    return null;
  }
}

// 3) Функція для форматування повної дати з часом за Київським часом (замінює вашу formatDateKyiv)
// Стало:
export function formatDateKyiv(iso?: string | null): string {
  if (!iso) return "-";
  try {
    const date = new Date(iso);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    return new Intl.DateTimeFormat("uk-UA", options)
      .format(date)
      .replace(", ", " / ");
  } catch (e) {
    // console.error("❌ Помилка форматування дати:", e);
    return "N/A";
  }
}

function createPasswordConfirmationModal(
  action: "pay" | "unpay",
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "password-confirmation-modal";
    modal.className = "login-modal";

    const box = document.createElement("div");
    box.className = "login-modal-content";

    // Плаваюча іконка
    const icon = document.createElement("span");
    icon.className = "login-modal-icon";
    icon.textContent = "🔐";

    const h = document.createElement("h3");
    h.className = "login-modal-title";
    h.textContent =
      action === "pay"
        ? "Підтвердження розрахунку"
        : "Підтвердження скасування";

    const subtitle = document.createElement("p");
    subtitle.className = "login-modal-subtitle";
    subtitle.textContent = "Введіть пароль для підтвердження";

    const inp = document.createElement("input");
    inp.type = "password";
    inp.placeholder = "••••••••";
    inp.className = "login-input";
    inp.autocomplete = "current-password";

    const err = document.createElement("div");
    err.className = "login-error-message";
    err.style.display = "none";

    const row = document.createElement("div");
    row.style.cssText =
      "display: flex; gap: 12px; justify-content: center; margin-top: 16px;";

    // Скасувати — ЗЛІВА
    const cancel = document.createElement("button");
    cancel.textContent = "Скасувати";
    cancel.className = "login-button";
    cancel.style.cssText = `flex:1; margin-top:0; background: linear-gradient(135deg, #94a3b8 0%, #a1b0c4 100%); box-shadow: 0 3px 12px rgba(148,163,184,0.25), 0 1px 3px rgba(0,0,0,0.06);`;

    // Підтвердити — СПРАВА
    const ok = document.createElement("button");
    ok.textContent = "Підтвердити";
    ok.className = "login-button";
    ok.style.cssText = `flex:1; margin-top:0;`;

    // Shake-анімація помилки
    const showModalError = (message: string) => {
      err.textContent = message;
      err.style.display = "block";
      inp.classList.remove("input-error");
      void inp.offsetWidth;
      inp.classList.add("input-error");
      setTimeout(() => inp.classList.remove("input-error"), 600);
    };

    ok.onclick = () => {
      const p = (inp.value || "").trim();
      const saved = getSavedUserDataFromLocalStorage?.();
      if (!p) {
        showModalError("Введіть пароль");
        inp.focus();
        return;
      }
      if (!saved) {
        showModalError("Не знайдено дані користувача");
        return;
      }
      if (p === saved.password) {
        // Анімація успіху
        icon.textContent = "✅";
        icon.classList.add("login-success-anim");
        h.textContent = "Підтверджено!";
        h.style.color = "#4ade80";
        inp.classList.add("input-success");
        ok.innerHTML = "✓ Успішно";
        ok.style.background =
          "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";
        setTimeout(() => {
          modal.remove();
          resolve(true);
        }, 500);
      } else {
        showModalError("Невірний пароль");
        inp.focus();
        inp.select();
      }
    };

    cancel.onclick = () => {
      modal.remove();
      resolve(false);
    };

    inp.onkeypress = (e) => {
      if (e.key === "Enter") ok.click();
    };

    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        modal.remove();
        resolve(false);
      }
    };
    document.addEventListener("keydown", esc);
    const rm = modal.remove.bind(modal);
    modal.remove = () => {
      document.removeEventListener("keydown", esc);
      rm();
    };

    row.append(cancel, ok);
    box.append(icon, h, subtitle, inp, err, row);
    modal.append(box);
    document.body.appendChild(modal);
    setTimeout(() => inp.focus(), 100);
  });
}

// Функції для керування станом кнопки збереження
function setSaveButtonLoading(isLoading: boolean): void {
  const saveBtn = document.querySelector(
    ".expense-modal-footer button",
  ) as HTMLButtonElement;

  if (!saveBtn) return;

  if (isLoading) {
    saveBtn.disabled = true;
    saveBtn.dataset.originalText = saveBtn.textContent || "";
    saveBtn.textContent = "⏳ Зачекайте...";
    saveBtn.style.opacity = "0.6";
    saveBtn.style.cursor = "not-allowed";
  } else {
    saveBtn.disabled = false;
    saveBtn.textContent = saveBtn.dataset.originalText || "💾 Зберегти";
    saveBtn.style.opacity = "1";
    saveBtn.style.cursor = "pointer";
    delete saveBtn.dataset.originalText;
  }
}

// ==================== РОБОТА З БАЗОЮ ДАНИХ ====================

interface ActData {
  "Прибуток за деталі"?: number;
  "Прибуток за роботу"?: number;
  "За деталі"?: number; // Повна сума за деталі
  "За роботу"?: number; // Повна сума за роботу
  client_id?: number;
  cars_id?: number;
  Деталі?: Array<{
    Деталь?: string;
    Кількість?: number;
    Ціна?: number;
    sclad_id?: number;
  }>;
  Роботи?: Array<{
    Робота?: string;
    Кількість?: number;
    Ціна?: number;
    Зарплата?: number;
    Прибуток?: number;
  }>;
  [key: string]: any;
}

// Кеш для зарплат приймальника - Map<actId, {salaryParts, salaryWork, salaryZapchastysty}>
const receipterSalaryCache = new Map<
  number,
  { salaryParts: number; salaryWork: number; salaryZapchastysty: number }
>();

// Завантажує історію приймальника для розрахунку його зарплати
async function loadReceipterSalaries(): Promise<void> {
  try {
    receipterSalaryCache.clear();

    const { data: rawData, error } = await supabase
      .from("slyusars")
      .select("*");

    if (error) {
      // console.error("❌ Помилка завантаження slyusars:", error);
      return;
    }

    const data = rawData as any[];
    if (!data || data.length === 0) {
      return;
    }

    // Проходимо по ВСІХ користувачах
    for (const userRecord of data) {
      let slyusarData: any = {};

      if (!userRecord.data) continue;

      if (typeof userRecord.data === "string") {
        try {
          slyusarData = JSON.parse(userRecord.data);
        } catch (e) {
          continue;
        }
      } else {
        slyusarData = userRecord.data;
      }

      // ✅ ВИПРАВЛЕНО: Враховуємо ЗП тільки від Приймальників
      // Запчастисти мають свою ЗарплатаЗапчастин в історії, але це їхня власна ЗП,
      // яка вже включена в ЗарплатаЗапчастистів Приймальника
      const userRole = slyusarData?.Доступ || "";
      if (userRole !== "Приймальник") continue;

      const history = slyusarData?.Історія || {};
      if (Object.keys(history).length === 0) continue;

      // Проходимо історію
      for (const dateKey in history) {
        const records = history[dateKey] || [];
        if (!Array.isArray(records)) continue;

        for (const record of records) {
          const actId = Number(record?.Акт);

          if (!isNaN(actId) && actId > 0) {
            const salaryParts = Number(record.ЗарплатаЗапчастин) || 0;
            const salaryWork = Number(record.ЗарплатаРоботи) || 0;
            const salaryZapchastysty = Number(record.ЗарплатаЗапчастистів) || 0;

            if (salaryParts > 0 || salaryWork > 0 || salaryZapchastysty > 0) {
              const existing = receipterSalaryCache.get(actId) || {
                salaryParts: 0,
                salaryWork: 0,
                salaryZapchastysty: 0,
              };

              receipterSalaryCache.set(actId, {
                salaryParts: existing.salaryParts + salaryParts,
                salaryWork: existing.salaryWork + salaryWork,
                salaryZapchastysty:
                  existing.salaryZapchastysty + salaryZapchastysty,
              });
            }
          }
        }
      }
    }
  } catch (err: any) {
    // console.error("❌ Помилка завантаження зарплат приймальника:", err);
  }
}

// Отримує зарплату приймальника для конкретного акту (з кешу)
function getReceipterSalaryForAct(actId: number): {
  salaryParts: number;
  salaryWork: number;
  salaryZapchastysty: number;
} {
  const salary = receipterSalaryCache.get(actId);

  if (salary) {
    return salary;
  }

  return { salaryParts: 0, salaryWork: 0, salaryZapchastysty: 0 };
}

// Використовує збережене значення "Прибуток за деталі" з акту
// Віднімає зарплату приймальника та запчастистів щоб показати чистий прибуток компанії
function calculateDetailsMarginFromAct(
  actData: ActData,
  actId: number,
): number {
  // Використовуємо збережене значення з акту (вже враховано закупівельні ціни і розраховано маржу)
  let totalMargin = Number(actData["Прибуток за деталі"]) || 0;

  // Віднімаємо зарплату приймальника та запчастистів щоб показати чистий прибуток компанії
  const receipterSalary = getReceipterSalaryForAct(actId);

  totalMargin -= receipterSalary.salaryParts;
  totalMargin -= receipterSalary.salaryZapchastysty;

  return Number(totalMargin.toFixed(2));
}

// Використовує збережене значення "Прибуток за роботу" з акту
// Віднімає зарплату приймальника щоб показати чистий прибуток компанії
function calculateWorkProfitFromAct(actData: ActData, actId: number): number {
  // Використовуємо збережене значення з акту (вже враховано зарплату слюсаря)
  let profit = Number(actData["Прибуток за роботу"]) || 0;

  // Віднімаємо зарплату приймальника щоб показати чистий прибуток компанії
  const receipterSalary = getReceipterSalaryForAct(actId);
  profit -= receipterSalary.salaryWork;

  return Number(profit.toFixed(2));
}

async function getClientData(clientId: number): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("data")
      .eq("client_id", clientId)
      .single();

    if (error || !data) {
      // console.warn(`⚠️ Клієнт ${clientId} не знайдено`);
      return "-";
    }

    let clientData: any = {};
    if (typeof data.data === "string") {
      clientData = JSON.parse(data.data);
    } else if (typeof data.data === "object") {
      clientData = data.data;
    }

    const pib = clientData["ПІБ"] || "-";
    const phone = clientData["Телефон"] || "-";
    const dzherelo = clientData["Джерело"] || "";
    const dodatkovi = clientData["Додаткові"] || "";

    // Формуємо рядок з усіма даними
    let result = `👤 ${pib}\n📱 ${phone}`;

    if (dzherelo && dzherelo !== "Невказано") {
      result += `\n📍 ${dzherelo}`;
    }

    if (dodatkovi) {
      result += `\n📝 ${dodatkovi}`;
    }

    return result;
  } catch (error) {
    // console.error(`❌ Помилка завантаження клієнта ${clientId}:`, error);
    return "-";
  }
}

async function getCarData(carId: number): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("cars")
      .select("data")
      .eq("cars_id", carId)
      .single();

    if (error || !data) {
      // console.warn(`⚠️ Авто ${carId} не знайдено`);
      return "-";
    }

    let carData: any = {};
    if (typeof data.data === "string") {
      carData = JSON.parse(data.data);
    } else if (typeof data.data === "object") {
      carData = data.data;
    }

    const car = carData["Авто"] || "-";
    const volume = carData["Обʼєм"] || "";
    const engine = carData["КодДВЗ"] || "";
    const fuel = carData["Пальне"] || "";
    const plate = carData["Номер авто"] || "-";

    // Формуємо компактний рядок
    let engineInfo = "";
    if (volume || engine) {
      engineInfo = `\n🔧 ${[volume, engine].filter(Boolean).join(" ")}`;
    }

    let fuelInfo = fuel ? `\n⛽ ${fuel}` : "";

    return `🚗 ${car}\n🔢 ${plate}${engineInfo}${fuelInfo}`;
  } catch (error) {
    // console.error(`❌ Помилка завантаження авто ${carId}:`, error);
    return "-";
  }
}

// Глобальна змінна для зберігання поточного фільтра дат
let vutratuDateFilterMode: "open" | "close" | "paid" = "open";

// Функція для ініціалізації перемикача фільтрації дат для витрат
function initvutratuDateFilterToggle(): void {
  const toggleContainer = document.querySelector(
    "#Bukhhalter-vutratu-section .Bukhhalter-date-filter-toggle",
  );
  if (!toggleContainer) return;

  const buttons =
    toggleContainer.querySelectorAll<HTMLButtonElement>(".date-filter-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      // Знімаємо active з усіх кнопок
      buttons.forEach((b) => b.classList.remove("active"));
      // Додаємо active до натиснутої
      this.classList.add("active");

      // Зберігаємо режим фільтрації
      vutratuDateFilterMode = this.dataset.filter as "open" | "close" | "paid";

      // ЗМІНЕНО: Просто фільтруємо вже завантажені дані, НЕ перезавантажуємо з бази
      filtervutratuData();
    });
  });
}

async function loadvutratuFromDatabase(): Promise<void> {
  try {
    // Якщо дата не вказана - використовуємо 01.01.2025 як дефолт (не показуємо користувачу)
    const dateFromInput =
      byId<HTMLInputElement>("Bukhhalter-vutratu-date-from")?.value || "";
    const dateToInput =
      byId<HTMLInputElement>("Bukhhalter-vutratu-date-to")?.value || "";

    const dateFrom = dateFromInput || "2025-01-01";
    const dateTo = dateToInput || "";
    const category =
      byId<HTMLSelectElement>("Bukhhalter-vutratu-category")?.value || "";
    const paymentMethod =
      byId<HTMLSelectElement>("Bukhhalter-vutratu-payment-method")?.value || "";

    // Отримуємо стани чекбоксів для підтягування даних
    const includeClientInDescription =
      byId<HTMLInputElement>("include-client-description")?.checked || false;
    const includeCarInNotes =
      byId<HTMLInputElement>("include-car-notes")?.checked || false;

    // Завантажуємо дані з vutratu
    let queryVutratu = supabase
      .from("vutratu")
      .select(
        "vutratu_id,dataOnn,dataOff,kategoria,act,opys_vytraty,suma,sposob_oplaty,prymitky,xto_zapusav",
      )
      .lt("suma", 0)
      .is("act", null); // Виключаємо записи з номером акту (щоб уникнути дублювання)

    // Застосовуємо фільтр по датах для витрат
    // ВАЖЛИВО: Витрати не мають окремої "дати закриття" (dataOff зазвичай NULL)
    // Тому для всіх режимів фільтрації використовуємо dataOnn
    // Локальна фільтрація в filtervutratuData() правильно обробляє відображення
    if (dateFrom) queryVutratu = queryVutratu.gte("dataOnn", dateFrom);
    if (dateTo) queryVutratu = queryVutratu.lte("dataOnn", dateTo);

    if (category) queryVutratu = queryVutratu.eq("kategoria", category);
    if (paymentMethod)
      queryVutratu = queryVutratu.eq("sposob_oplaty", paymentMethod);

    queryVutratu = queryVutratu.order("dataOnn", { ascending: false });

    const { data: vutratuDataRaw, error: vutratuError } = await queryVutratu;

    if (vutratuError) {
      // console.error("❌ Помилка завантаження витрат:", vutratuError);
      throw new Error(`Помилка завантаження: ${vutratuError.message}`);
    }

    // Завантажуємо дані з acts
    let queryActs = supabase
      .from("acts")
      .select(
        "act_id,date_on,date_off,frozen,rosraxovano,data,xto_rozraxuvav,client_id,cars_id,avans,tupOplatu",
      );

    // Застосовуємо фільтр по датах залежно від режиму
    // Завжди використовуємо dateFrom (дефолт: 2025-01-01)
    if (vutratuDateFilterMode === "open") {
      // Фільтр по даті відкриття (date_on)
      queryActs = queryActs.gte("date_on", dateFrom);
      if (dateTo) queryActs = queryActs.lte("date_on", dateTo);
    } else if (vutratuDateFilterMode === "close") {
      // Фільтр по даті закриття (date_off)
      queryActs = queryActs.gte("date_off", dateFrom);
      if (dateTo) queryActs = queryActs.lte("date_off", dateTo);
    } else if (vutratuDateFilterMode === "paid") {
      // Фільтр по даті розрахунку (rosraxovano)
      queryActs = queryActs.gte("rosraxovano", dateFrom);
      if (dateTo) queryActs = queryActs.lte("rosraxovano", dateTo);
    }

    queryActs = queryActs.order("date_on", { ascending: false });

    const { data: actsDataRaw, error: actsError } = await queryActs;

    if (actsError) {
      // console.error("❌ Помилка завантаження актів:", actsError);
      throw new Error(`Помилка завантаження актів: ${actsError.message}`);
    }

    vutratuData = [];
    // Очищаємо кеш зарплат приймальника
    receipterSalaryCache.clear();

    // Додаємо дані з vutratu
    if (vutratuDataRaw && Array.isArray(vutratuDataRaw)) {
      vutratuData = vutratuDataRaw.map((item) => ({
        id: item.vutratu_id,
        date: getKyivDate(item.dataOnn) || item.dataOnn.split("T")[0],
        paymentDate: null,
        rosraxovanoDate: item.dataOnn,
        category: addEmojiToCategory(String(item.kategoria || "")),
        actNumber: item.act ?? undefined,
        description: item.opys_vytraty,
        amount: Number(item.suma || 0),
        paymentMethod: addEmojiToPaymentMethod(
          String(item.sposob_oplaty || ""),
        ),
        notes: item.prymitky || undefined,
        isPaid: !!item.dataOff,
        createdBy: item.xto_zapusav || undefined,
        xto_rozraxuvav: item.xto_zapusav || undefined,
      }));
    }

    // Додаємо дані з acts
    if (actsDataRaw && Array.isArray(actsDataRaw)) {
      // Завантажуємо зарплати приймальника для розрахунку чистого прибутку
      await loadReceipterSalaries();

      for (const actItem of actsDataRaw) {
        // ❄️ Пропускаємо заморожені акти
        if (actItem.frozen === true) continue;

        let actData: ActData = {};

        if (typeof actItem.data === "string") {
          try {
            actData = JSON.parse(actItem.data);
          } catch (e) {
            // console.warn(
            // `⚠️ Не вдалося розпарсити data для акту ${actItem.act_id}`,
            // );
          }
        } else if (typeof actItem.data === "object" && actItem.data !== null) {
          actData = actItem.data;
        }

        // Обчислюємо маржу динамічно на основі деталей та робіт
        // Враховуємо зарплату приймальника (тепер синхронно)
        const detailsAmount = calculateDetailsMarginFromAct(
          actData,
          actItem.act_id,
        );
        const workAmount = calculateWorkProfitFromAct(actData, actItem.act_id);
        const totalAmount = detailsAmount + workAmount;

        const clientId = actItem.client_id;
        const carId = actItem.cars_id;

        // Підтягуємо дані тільки якщо чекбокси чекнуті
        const clientInfo =
          includeClientInDescription && clientId
            ? await getClientData(clientId)
            : "-";
        const carInfo =
          includeCarInNotes && carId ? await getCarData(carId) : "-";

        // Отримуємо повну суму з акту (без вирахувань)
        const fullDetailsAmount = Number(actData["За деталі"]) || 0;
        const fullWorkAmount = Number(actData["За роботу"]) || 0;
        const fullAmount = fullDetailsAmount + fullWorkAmount;

        const discountPercent = Number(actData["Знижка"]) || 0;
        // Розраховуємо суму знижки з відсотка та повної суми
        const discountAmountValue =
          discountPercent > 0
            ? Math.round((fullAmount * discountPercent) / 100)
            : 0;

        vutratuData.push({
          id: actItem.act_id * -1,
          date: getKyivDate(actItem.date_on) || actItem.date_on,
          paymentDate: getKyivDate(actItem.date_off) || null,
          rosraxovanoDate: actItem.rosraxovano || null,
          category: "💰 Прибуток",
          actNumber: actItem.act_id,
          description: clientInfo,
          amount: totalAmount,
          paymentMethod: actItem.avans || 0,
          notes: carInfo,
          isPaid: !!actItem.rosraxovano,
          createdBy: "Система",
          detailsAmount: detailsAmount,
          workAmount: workAmount,
          clientId: clientId,
          carId: carId,
          xto_rozraxuvav: actItem.xto_rozraxuvav || undefined,
          fullAmount: fullAmount,
          fullDetailsAmount: fullDetailsAmount,
          fullWorkAmount: fullWorkAmount,
          tupOplatu: actItem.tupOplatu || undefined,
          discount: discountPercent,
          discountAmount: discountAmountValue,
        });
      }
    }

    vutratuData.sort((a, b) => b.date.localeCompare(a.date));

    const modeLabels = {
      open: "відкриття",
      close: "закриття",
      paid: "розрахунку",
    };

    showNotification(
      `📊 Знайдено ${vutratuData.length} записів (${modeLabels[vutratuDateFilterMode]})`,
      "success",
      2000,
    );

    filteredvutratuData = [...vutratuData];
    updatevutratuTable();
  } catch (error) {
    // console.error("❌ Помилка завантаження даних:", error);
    showNotification(
      "⚠️ Не вдалося завантажити дані з бази даних",
      "error",
      5000,
    );
    vutratuData = [];
    filteredvutratuData = [];
    updatevutratuTable();
  }
}

async function saveExpenseToDatabase(
  expense: ExpenseRecordLocal,
  isNew: boolean = true,
): Promise<boolean> {
  try {
    const currentUser = getCurrentUserName();

    const dbRecord = {
      dataOnn: getCurrentUkrainianTime(),
      kategoria: removeEmoji(expense.category),
      act: expense.actNumber ?? null,
      opys_vytraty: expense.description,
      suma: -Math.abs(Number(expense.amount || 0)),
      sposob_oplaty: removeEmoji(expense.paymentMethod),
      prymitky: expense.notes || null,
      xto_zapusav: currentUser,
    };

    if (isNew) {
      const { data, error } = await supabase
        .from("vutratu")
        .insert([dbRecord])
        .select("vutratu_id")
        .single();

      if (error) {
        // console.error("❌ Помилка додавання витрати:", error);
        throw error;
      }

      expense.id = data.vutratu_id;
    } else {
      if (!expense.id) throw new Error("Немає ID для оновлення запису");

      const { error } = await supabase
        .from("vutratu")
        .update(dbRecord)
        .eq("vutratu_id", expense.id);

      if (error) {
        // console.error("❌ Помилка оновлення витрати:", error);
        throw error;
      }
    }

    return true;
  } catch (error: any) {
    // console.error("❌ Помилка збереження витрати:", error);
    showNotification(`❌ Помилка: ${error.message}`, "error", 7000);
    return false;
  }
}

// ==================== ІНІЦІАЛІЗАЦІЯ ====================

export async function initializevutratuData(): Promise<void> {
  vutratuData = [];
  filteredvutratuData = [];
  createExpenseCategorySelect();
  createPaymentMethodSelect();
  createExpensePaymentToggle();
  createExpenseDiscountToggle();
  createExpenseTypeToggle();
  createExpenseStatusToggle(); // Додати цю функцію

  // Додати слухачі для всіх фільтрів
  const categorySelect = byId<HTMLSelectElement>("Bukhhalter-vutratu-category");
  const paymentMethodSelect = byId<HTMLSelectElement>(
    "Bukhhalter-vutratu-payment-method",
  );

  const dateFromInput = byId<HTMLInputElement>("Bukhhalter-vutratu-date-from");
  const dateToInput = byId<HTMLInputElement>("Bukhhalter-vutratu-date-to");

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      filtervutratuData();
    });
  }

  if (paymentMethodSelect) {
    paymentMethodSelect.addEventListener("change", () => {
      filtervutratuData();
    });
  }

  // ✅ Додаємо слухачі для зміни дати - ПЕРЕЗАВАНТАЖУЄМО з бази
  if (dateFromInput) {
    dateFromInput.addEventListener("change", () => {
      searchvutratuFromDatabase();
    });
  }

  if (dateToInput) {
    dateToInput.addEventListener("change", () => {
      searchvutratuFromDatabase();
    });
  }

  // ДОДАТИ В КІНЕЦЬ ФУНКЦІЇ:
  initvutratuDateFilterToggle();
}

function createExpenseTypeToggle(): void {
  const toggle = byId<HTMLInputElement>("vutratu-type-filter-toggle");
  if (!toggle) return;

  toggle.addEventListener("input", () => {
    filtervutratuData();
  });
}
// ==================== СТВОРЕННЯ СЕЛЕКТІВ ====================

function createExpenseCategorySelect(): void {
  const select = byId<HTMLSelectElement>("Bukhhalter-vutratu-category");
  if (!select) return;

  select.innerHTML = '<option value="">Оберіть категорію</option>';
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

function createPaymentMethodSelect(): void {
  const select = byId<HTMLSelectElement>("Bukhhalter-vutratu-payment-method");
  if (!select) return;

  select.innerHTML = '<option value="">Оберіть спосіб оплати</option>';
  PAYMENT_METHODS.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    select.appendChild(option);
  });
}

export function createExpensePaymentToggle(): void {
  const toggle = byId<HTMLInputElement>("vutratu-payment-filter-toggle");
  if (!toggle) return;

  toggle.addEventListener("input", () => {
    filtervutratuData();
  });
}

export function createExpenseDiscountToggle(): void {
  const toggle = byId<HTMLInputElement>("vutratu-discount-filter-toggle");
  if (!toggle) return;

  toggle.addEventListener("input", () => {
    filtervutratuData();
  });
}

function createExpenseStatusToggle(): void {
  const toggle = byId<HTMLInputElement>("vutratu-status-filter-toggle");
  if (!toggle) return;

  toggle.addEventListener("input", () => {
    filtervutratuData();
  });
}

// ==================== ФІЛЬТРАЦІЯ ====================

export function filtervutratuData(): void {
  const dateFrom =
    byId<HTMLInputElement>("Bukhhalter-vutratu-date-from")?.value || "";
  const dateTo =
    byId<HTMLInputElement>("Bukhhalter-vutratu-date-to")?.value || "";
  const category =
    byId<HTMLSelectElement>("Bukhhalter-vutratu-category")?.value || "";
  const paymentMethod =
    byId<HTMLSelectElement>("Bukhhalter-vutratu-payment-method")?.value || "";
  const paymentToggle =
    byId<HTMLInputElement>("vutratu-payment-filter-toggle")?.value || "2";
  const typeToggle =
    byId<HTMLInputElement>("vutratu-type-filter-toggle")?.value || "2";
  const statusToggle =
    byId<HTMLInputElement>("vutratu-status-filter-toggle")?.value || "2";
  const discountToggle =
    byId<HTMLInputElement>("vutratu-discount-filter-toggle")?.value || "2";

  filteredvutratuData = vutratuData.filter((expense) => {
    const isFromAct = expense.category === "💰 Прибуток";

    // НОВИЙ ФІЛЬТР: Фільтр по режиму дати (відкриття/закриття/розрахунку)
    if (vutratuDateFilterMode === "open") {
      // Фільтруємо по даті відкриття (expense.date)
      if (dateFrom && expense.date < dateFrom) return false;
      if (dateTo && expense.date > dateTo) return false;
    } else if (vutratuDateFilterMode === "close") {
      // Фільтруємо по даті закриття
      // Для актів використовуємо paymentDate, для витрат - date (бо витрати не мають дати закриття)
      if (isFromAct) {
        // Для актів: якщо немає дати закриття - виключаємо (акт ще відкритий)
        if (!expense.paymentDate) return false;
        if (dateFrom && expense.paymentDate < dateFrom) return false;
        if (dateTo && expense.paymentDate > dateTo) return false;
      } else {
        // Для витрат: використовуємо дату витрати (date) як "дату закриття"
        if (dateFrom && expense.date < dateFrom) return false;
        if (dateTo && expense.date > dateTo) return false;
      }
    } else if (vutratuDateFilterMode === "paid") {
      // Фільтруємо по даті розрахунку (rosraxovanoDate)
      // Якщо немає дати розрахунку - виключаємо
      if (!expense.rosraxovanoDate) return false;
      const rosraxovanoDateOnly = getKyivDate(expense.rosraxovanoDate);
      if (!rosraxovanoDateOnly) return false;
      if (dateFrom && rosraxovanoDateOnly < dateFrom) return false;
      if (dateTo && rosraxovanoDateOnly > dateTo) return false;
    }

    // Фільтр по категорії
    if (category && expense.category !== category) return false;

    // Фільтр по способу оплати (перевіряємо як paymentMethod для витрат, так і tupOplatu для актів)
    if (paymentMethod) {
      if (isFromAct) {
        // Для актів перевіряємо tupOplatu
        if (
          !expense.tupOplatu ||
          !expense.tupOplatu.includes(
            paymentMethod.replace(/💵 |💳 |🏦 |📱 /g, ""),
          )
        ) {
          return false;
        }
      } else {
        // Для витрат перевіряємо paymentMethod
        if (expense.paymentMethod !== paymentMethod) return false;
      }
    }

    // Фільтр по розрахунку (0-оплачено, 1-Несплочено, 2-всі)
    if (paymentToggle === "0" && !expense.isPaid) return false;
    if (paymentToggle === "1" && expense.isPaid) return false;

    // Фільтр по типу операції (0-прибуток, 1-витрати, 2-всі)
    if (typeToggle !== "2") {
      const isIncome = expense.amount >= 0;
      if (typeToggle === "0" && !isIncome) return false;
      if (typeToggle === "1" && isIncome) return false;
    }

    // Фільтр по статусу акту (0-закриті, 1-відкриті, 2-всі)
    if (statusToggle !== "2") {
      const isClosed = !!expense.paymentDate;
      if (statusToggle === "0" && !isClosed) return false;
      if (statusToggle === "1" && isClosed) return false;
    }

    // Фільтр по знижці (0-Без знижки, 1-Знижка, 2-Всі)
    if (discountToggle !== "2") {
      // Знижка застосовна тільки для актів (Прибуток)
      // Для витрат вважаємо, що знижки немає (amount < 0) - тому вони потраплять в "Без знижки"
      // Або можна вирішити, що витрати показуються завжди або ніколи.
      // Логічно: Витрати не мають знижки. Тому:
      // Якщо обрано "Без знижки" (0) -> показуємо акти без знижки і витрати.
      // Якщо обрано "Знижка" (1) -> показуємо акти зі знижкою. Витрати ховаємо.

      const isExpense = expense.amount < 0;
      const hasDiscount = (expense.discountAmount || 0) > 0;

      if (discountToggle === "0") {
        // "Без знижки" - показуємо, якщо немає знижки (або це витрата)
        // Але якщо це акт і має знижку - ховаємо
        if (!isExpense && hasDiscount) return false;
      } else if (discountToggle === "1") {
        // "З знижкою" - показуємо тільки якщо є знижка
        if (!hasDiscount) return false;
      }
    }

    return true;
  });

  updatevutratuTable();
}

export async function searchvutratuFromDatabase(): Promise<void> {
  // 🔐 Перевіряємо доступ до сторінки перед пошуком
  const hasAccess = await checkCurrentPageAccess();

  if (!hasAccess) {
    redirectToIndex();
    return;
  }

  await loadvutratuFromDatabase();
  filtervutratuData();
}

// ==================== ТАБЛИЦЯ ====================

export function updatevutratuTable(): void {
  const tbody = byId<HTMLTableSectionElement>("vutratu-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (filteredvutratuData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="11" class="Bukhhalter-no-data">Немає витрат для відображення</td></tr>';
    updatevutratuDisplayedSums();
    return;
  }

  filteredvutratuData.forEach((expense, index) => {
    const row = tbody.insertRow();

    const isNegative = expense.amount < 0;
    const isFromAct = expense.category === "💰 Прибуток";

    // Перевіряємо дату закриття (paymentDate) замість isPaid
    const isOpenAct = isFromAct && !expense.paymentDate;

    row.className = isOpenAct
      ? "open-row"
      : isNegative
        ? "negative-row"
        : "positive-row";

    // 💰 Розраховано - показуємо дату витрати або розрахунку акту
    const paymentCell = row.insertCell();

    if (isFromAct) {
      // Логіка для актів залишається без змін
      if (expense.isPaid) {
        const calculatorName = expense.xto_rozraxuvav || "Невідомо";

        let formattedDate = formatDateKyiv(expense.rosraxovanoDate);

        paymentCell.innerHTML = `
          <button class="Bukhhalter-payment-btn paid" 
                  onclick="event.stopPropagation(); toggleActPayment(${index})" 
                  title="Скасувати розрахунок">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 2px 0;">
              <span style="font-size: 0.95em; color: #333;">🧑‍💻 ${calculatorName}</span>
              <span style="font-size: 0.85em; color: #555;">📅 ${formattedDate}</span>
            </div>
          </button>
        `;
      } else {
        paymentCell.innerHTML = `
          <button class="Bukhhalter-payment-btn unpaid" 
                  onclick="event.stopPropagation(); toggleActPayment(${index})" 
                  title="Провести розрахунок">
            💲 Сума в касі
          </button>
        `;
      }
    } else {
      // Для витрат - показуємо дату витрати та хто створив
      if (expense.rosraxovanoDate) {
        const createdByText = expense.xto_rozraxuvav || "Система";

        let formattedDate = formatDateKyiv(expense.rosraxovanoDate);

        paymentCell.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 5px;">
            <span style="font-size: 0.75em; color: #333;">🧑‍💻 ${createdByText}</span>
            <span style="font-size: 0.70em; color: #555;">📅 ${formattedDate}</span>
          </div>
        `;
      } else {
        paymentCell.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; font-size: 11px; color: #999; padding: 5px;">
            -
          </div>
        `;
      }
    }

    // 📅 Відкриття
    const dateCell = row.insertCell();
    dateCell.textContent = formatDate(expense.date);

    // 📅 Закриття
    const dateCloseCell = row.insertCell();
    // Для актів показуємо дату закриття, для витрат - ту саму дату що і відкриття (для фільтрації)
    if (isFromAct) {
      dateCloseCell.textContent = expense.paymentDate
        ? formatDate(expense.paymentDate)
        : "-";
    } else {
      // Для витрат показуємо ту саму дату, що й у стовпці "Відкриття"
      dateCloseCell.textContent = formatDate(expense.date);
    }
    // 📂 Категорія
    const categoryCell = row.insertCell();
    categoryCell.textContent = expense.category;

    // 📋 Акт_№
    const actCell = row.insertCell();
    if (isFromAct && expense.actNumber) {
      actCell.innerHTML = `
        <button class="Bukhhalter-act-btn"
                onclick="event.stopPropagation(); openActModalWithClient(${
                  Number(expense.actNumber) || 0
                })"
                title="Відкрити акт №${expense.actNumber}">
          📋 ${expense.actNumber}
        </button>
      `;
    } else {
      actCell.textContent = expense.actNumber ? String(expense.actNumber) : "-";
    }

    // 📝 Опис
    const descriptionCell = row.insertCell();
    descriptionCell.style.whiteSpace = "pre-line";
    descriptionCell.style.fontSize = "0.9em";
    descriptionCell.textContent = expense.description;

    // 💵 Сума - спеціальне форматування для актів
    const amountCell = row.insertCell();

    if (
      isFromAct &&
      expense.detailsAmount !== undefined &&
      expense.workAmount !== undefined
    ) {
      // Знижка вже врахована в збережених значеннях detailsAmount і workAmount
      // Тому просто відображаємо їх без додаткових вирахувань
      let finalDetailsAmount = expense.detailsAmount;
      let finalWorkAmount = expense.workAmount;

      const detailsColor =
        finalDetailsAmount > 0
          ? "#28a745"
          : finalDetailsAmount < 0
            ? "#dc3545"
            : "#999";
      const workColor =
        finalWorkAmount > 0
          ? "#28a745"
          : finalWorkAmount < 0
            ? "#dc3545"
            : "#999";
      const detailsSign = finalDetailsAmount > 0 ? "+" : "";
      const workSign = finalWorkAmount > 0 ? "+" : "";

      // Показувати емодзі тільки якщо значення не дорівнює 0
      const detailsEmoji = finalDetailsAmount !== 0 ? "⚙️ " : "";
      const workEmoji = finalWorkAmount !== 0 ? "🛠️ " : "";

      amountCell.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span style="color: ${detailsColor}; font-size: 0.95em; font-weight: 500; text-align: right;">
            ${detailsEmoji}${detailsSign}${formatNumber(finalDetailsAmount)}
          </span>
          <span style="color: ${workColor}; font-size: 0.95em; font-weight: 500; text-align: right;">
            ${workEmoji}${workSign}${formatNumber(finalWorkAmount)}
          </span>
        </div>
      `;
    } else {
      const color =
        expense.amount > 0
          ? "#28a745"
          : expense.amount < 0
            ? "#dc3545"
            : "#999";
      const sign = expense.amount > 0 ? "+" : "";
      amountCell.innerHTML = `<span style="color: ${color}; font-size: 0.95em; font-weight: 500;">${sign}${formatNumber(
        expense.amount,
      )}</span>`;
    }

    // � Сума в касі - показуємо повну суму з акту без вирахувань
    const fullAmountCell = row.insertCell();
    fullAmountCell.style.textAlign = "right";

    if (isFromAct && expense.fullAmount !== undefined) {
      const discount = expense.discount || 0;
      const discountVal = expense.discountAmount || 0;
      const finalVal = expense.fullAmount - discountVal;

      let html = `<span style="color: #006400; font-size: 0.95em; font-weight: 500;">
          ${formatNumber(expense.fullAmount)}
        </span>`;

      if (discount > 0) {
        html = `
            <div style="display: flex; flex-direction: column; align-items: flex-end;">
              <span style="color: #1a73e8; font-size: 0.95em; font-weight: 500;">
                ${formatNumber(expense.fullAmount)}
              </span>
              <div style="font-size: 0.85em; color: #d32f2f; margin-top: 2px;">
                🏷️${discount}% ${formatNumber(discountVal)}
              </div>
              <div style="font-size: 0.95em; font-weight: 700; color: #006400; margin-top: 2px; border-top: 1px solid #ddd; padding-top: 2px;">
                ${formatNumber(finalVal)}
              </div>
            </div>
          `;
      }

      fullAmountCell.innerHTML = html;
    } else {
      fullAmountCell.textContent = "-";
    }

    // 💳 Спосіб оплати
    const methodCell = row.insertCell();

    if (isFromAct && expense.tupOplatu) {
      // Для актів - відображаємо тип оплати з tupOplatu
      let paymentText = expense.tupOplatu;

      // Додаємо емодзі якщо їх немає
      if (
        !paymentText.includes("💵") &&
        !paymentText.includes("💳") &&
        !paymentText.includes("🏦")
      ) {
        if (paymentText.toLowerCase().includes("готівка")) {
          paymentText = "💵 " + paymentText;
        } else if (paymentText.toLowerCase().includes("картка")) {
          paymentText = "💳 " + paymentText;
        } else if (paymentText.toLowerCase().includes("iban")) {
          paymentText = "🏦 " + paymentText;
        }
      }

      const avansInfo =
        expense.paymentMethod && Number(expense.paymentMethod) > 0
          ? `<br><span style="color: #000; font-weight: 600; font-size: 0.95em;">💰 ${formatNumber(
              Number(expense.paymentMethod),
            )}</span>`
          : "";
      methodCell.innerHTML = `
        <span style="font-size: 0.95em;">
          ${paymentText}${avansInfo}
        </span>
      `;
    } else if (
      isFromAct &&
      expense.paymentMethod &&
      Number(expense.paymentMethod) > 0
    ) {
      // Для актів з авансом - відображаємо чорним
      methodCell.innerHTML = `
        <span style="color: #000; font-weight: 600; font-size: 0.95em;">
          💰 ${formatNumber(Number(expense.paymentMethod))}
        </span>
      `;
    } else if (isFromAct) {
      // Для актів без авансу та без типу оплати
      methodCell.textContent = "-";
    } else {
      // Для витрат - показуємо спосіб оплати
      methodCell.textContent = String(expense.paymentMethod);
    }

    // 📋 Примітки
    const notesCell = row.insertCell();
    notesCell.style.whiteSpace = "pre-line";
    notesCell.style.fontSize = "0.85em";
    notesCell.textContent = expense.notes || "-";

    // ⚡ Дії
    const actionsCell = row.insertCell();
    if (expense.id > 0) {
      actionsCell.innerHTML = `
        <button class="Bukhhalter-delete-btn" onclick="event.stopPropagation(); deleteExpenseRecord(${index})" title="Видалити">🗑️</button>
      `;
    } else {
      actionsCell.innerHTML = `
        <button class="Bukhhalter-delete-btn" onclick="event.stopPropagation(); deleteExpenseRecord(${index})" title="Видалити з відображення">🗑️</button>
      `;
    }

    row.onclick = (event) => {
      if (expense.id > 0 && expense.amount < 0) {
        selectExpenseRow(index, event);
      }
    };
  });

  updatevutratuDisplayedSums();
}

// ==================== СУМИ ====================

export function calculatevutratuTotalSum(): number {
  return filteredvutratuData.reduce((sum, expense) => sum + expense.amount, 0);
}

export function updatevutratuDisplayedSums(): void {
  const totalSumElement = byId("total-sum");
  if (!totalSumElement) return;

  let totalNegativeSum = 0;
  let totalAvansSum = 0;

  // Суми для "Прибуток" (маржа)
  let totalNetDetailsProfit = 0;
  let totalNetWorkProfit = 0;

  // Суми для "Каса" (оборот - тільки залишок після авансу)
  let totalNetFullDetails = 0;
  let totalNetFullWork = 0;
  let totalDiscountSum = 0;

  filteredvutratuData.forEach((expense) => {
    // 1. Витрати (від'ємні суми) - НЕ враховуємо акти, бо знижка вже врахована в detailsAmount/workAmount
    if (expense.amount < 0 && expense.category !== "💰 Прибуток") {
      totalNegativeSum += expense.amount;
    }

    // 2. Акти (Прибуток)
    if (expense.category === "💰 Прибуток") {
      const isClosed = !!expense.paymentDate;
      const avans =
        expense.paymentMethod && Number(expense.paymentMethod) > 0
          ? Number(expense.paymentMethod)
          : 0;

      // Аванс додаємо тільки з ВІДКРИТИХ актів (закриті акти показують повну суму)
      if (!isClosed) {
        totalAvansSum += avans;
      }

      if (isClosed) {
        const discountVal = expense.discountAmount || 0;
        totalDiscountSum += discountVal;

        // --- Розрахунок для ПРИБУТКУ (маржа) ---
        let detailsProfit = expense.detailsAmount || 0;
        let workProfit = expense.workAmount || 0;

        totalNetDetailsProfit += detailsProfit;
        totalNetWorkProfit += workProfit;

        // --- Розрахунок для КАСИ (повні суми) ---
        // Знижка віднімається в HTML-відображенні рядка, тому тут просто беремо повні суми
        // і віднімаємо знижку один раз
        let fullDetails = expense.fullDetailsAmount || 0;
        let fullWork = expense.fullWorkAmount || 0;
        const fullTotal = fullDetails + fullWork;

        // Віднімаємо знижку від загальної суми (розподіляємо пропорційно)
        if (discountVal > 0 && fullTotal > 0) {
          const discountRatio = discountVal / fullTotal;
          fullDetails -= fullDetails * discountRatio;
          fullWork -= fullWork * discountRatio;
        }

        totalNetFullDetails += fullDetails;
        totalNetFullWork += fullWork;
      }
    }
  });

  // Фінальні суми
  // Каса = (Залишок Деталі + Залишок Робота + Всі Аванси) + Витрати (від'ємні)
  // ВАЖЛИВО: totalNegativeSum НЕ включає акти, тільки реальні витрати
  const finalSumCasa =
    totalNetFullDetails + totalNetFullWork + totalAvansSum + totalNegativeSum;

  // Прибуток = (Чиста Маржа Деталі + Чиста Маржа Робота) - Витрати
  const finalSumProfit =
    totalNetDetailsProfit + totalNetWorkProfit + totalNegativeSum;

  totalSumElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: 1.1em;">
      <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 15px;">
        <span>Каса</span>
        <span><strong style="color: #1E90FF;">⚙️ ${formatNumber(
          totalNetFullDetails,
        )}</strong></span>
        <span style="color: #666;">+</span>
        <span><strong style="color: #FF8C00;">🛠️ ${formatNumber(
          totalNetFullWork,
        )}</strong></span>
        <span style="color: #666;">+</span>
        <span><strong style="color: #000;">💰 ${formatNumber(
          totalAvansSum,
        )}</strong></span>${
          totalNegativeSum !== 0
            ? `
        <span style="color: #666;">+</span>
        <span><strong style="color: #8B0000;">💶 ${formatNumber(
          totalNegativeSum,
        )}</strong></span>`
            : ""
        }
        <span style="color: #666;">=</span>
        <span><strong style="color: ${
          finalSumCasa >= 0 ? "#006400" : "#8B0000"
        };">📈 ${formatNumber(finalSumCasa)}</strong> грн</span>
      </div>
      <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 15px;">
        <span>Прибуток</span>
        <span><strong style="color: #1E90FF;">⚙️ ${formatNumber(
          totalNetDetailsProfit,
        )}</strong></span>
        <span style="color: #666;">+</span>
        <span><strong style="color: #FF8C00;">🛠️ ${formatNumber(
          totalNetWorkProfit,
        )}</strong></span>${
          totalNegativeSum !== 0
            ? `
        <span style="color: #666;">+</span>
        <span><strong style="color: #8B0000;">💶 ${formatNumber(
          totalNegativeSum,
        )}</strong></span>`
            : ""
        }
        <span style="color: #666;">=</span>
        <span><strong style="color: ${
          finalSumProfit >= 0 ? "#006400" : "#8B0000"
        };">📈 ${formatNumber(finalSumProfit)}</strong> грн</span>
        
        <span style="color: #ccc; margin-left: 10px;">|</span>
        
        <span>Знижки</span>
        <span><strong style="color: #c62828;">🏷️ ${formatNumber(
          totalDiscountSum,
        )}</strong> грн</span>
      </div>
    </div>
  `;
}

// ==================== CRUD ОПЕРАЦІЇ ====================

async function handleAddExpense(
  date: string,
  category: string,
  description: string,
  amount: number,
  paymentMethod: string,
  notes: string,
): Promise<void> {
  setSaveButtonLoading(true);

  try {
    const newExpense: ExpenseRecordLocal = {
      id: 0,
      date,
      category,
      description,
      amount,
      paymentMethod,
      isPaid: false,
      notes: notes || undefined,
      actNumber: undefined,
    };

    const success = await saveExpenseToDatabase(newExpense, true);
    if (success) {
      await loadvutratuFromDatabase();
      filtervutratuData();
      showNotification("✅ Витрату додано", "success");
      closeExpenseModal();
    }
  } finally {
    setSaveButtonLoading(false);
  }
}

async function handleEditExpense(
  date: string,
  category: string,
  description: string,
  amount: number,
  paymentMethod: string,
  notes: string,
): Promise<void> {
  if (selectedExpenseId === null) {
    showNotification("⚠️ Витрата для редагування не вибрана", "warning");
    return;
  }

  const expense = vutratuData.find((e) => e.id === selectedExpenseId);
  if (!expense) {
    showNotification("⚠️ Витрата не знайдена", "warning");
    return;
  }

  setSaveButtonLoading(true);

  try {
    expense.date = date;
    expense.category = category;
    expense.description = description;
    expense.amount = amount;
    expense.paymentMethod = paymentMethod;
    expense.notes = notes || undefined;

    const success = await saveExpenseToDatabase(expense, false);
    if (success) {
      await loadvutratuFromDatabase();
      filtervutratuData();
      showNotification("✅ Витрату оновлено", "success");
      closeExpenseModal();
      selectedExpenseId = null;
    }
  } finally {
    setSaveButtonLoading(false);
  }
}

async function handleDeleteExpense(): Promise<void> {
  if (selectedExpenseId === null) {
    showNotification("⚠️ Витрата для видалення не вибрана", "warning");
    return;
  }

  const expenseIndex = vutratuData.findIndex((e) => e.id === selectedExpenseId);
  if (expenseIndex === -1) {
    showNotification("⚠️ Витрата не знайдена", "warning");
    return;
  }

  const expense = vutratuData[expenseIndex];

  setSaveButtonLoading(true);

  try {
    const { error } = await supabase
      .from("vutratu")
      .delete()
      .eq("vutratu_id", expense.id);

    if (error) {
      // console.error("❌ Помилка видалення з БД:", error);
      showNotification("❌ Помилка видалення з бази даних", "error");
      return;
    }

    vutratuData.splice(expenseIndex, 1);
    filtervutratuData();

    showNotification("✅ Витрату видалено з бази даних", "success", 2000);
    closeExpenseModal();
    selectedExpenseId = null;
  } catch (error) {
    // console.error("❌ Критична помилка видалення:", error);
    showNotification("❌ Не вдалося видалити витрату", "error");
  } finally {
    setSaveButtonLoading(false);
  }
}

export function deleteExpenseRecord(index: number): void {
  const expense = filteredvutratuData[index];
  if (!expense) return;

  const mainIndex = vutratuData.findIndex((e) => e.id === expense.id);
  if (mainIndex !== -1) {
    vutratuData.splice(mainIndex, 1);
  }

  filtervutratuData();
  showNotification("🗑️ Витрату приховано з відображення", "info", 2000);
}

function selectExpenseRow(index: number, event?: MouseEvent): void {
  const expense = filteredvutratuData[index];
  if (!expense) return;

  if (
    event &&
    (event.target as HTMLElement).closest(".Bukhhalter-delete-btn")
  ) {
    return;
  }

  if (expense.amount >= 0) {
    showNotification(
      "⚠️ Редагування доступне тільки для витрат",
      "warning",
      2000,
    );
    return;
  }

  selectedExpenseId = expense.id;
  setExpenseMode("edit");

  // 1) Спочатку відкрити модалку → populate* створять <option>
  openExpenseModal();

  // 2) Тепер безпечно ставити значення – опції вже існують
  byId<HTMLInputElement>("expense-modal-date").value = expense.date;
  byId<HTMLSelectElement>("expense-modal-category").value = expense.category;
  byId<HTMLSelectElement>("expense-modal-payment-method").value =
    expense.paymentMethod;
  byId<HTMLInputElement>("expense-modal-amount").value = Math.abs(
    expense.amount,
  ).toString();
  byId<HTMLTextAreaElement>("expense-modal-description").value =
    expense.description;
  byId<HTMLTextAreaElement>("expense-modal-notes").value = expense.notes || "";

  // 3) Формат суми
  const amountInput = byId<HTMLInputElement>("expense-modal-amount");
  if (amountInput) formatAmountWithSpaces(amountInput);
}

// ==================== ФОРМА ====================

export function clearvutratuForm(): void {
  byId<HTMLInputElement>("Bukhhalter-vutratu-date-from").value = "";
  byId<HTMLInputElement>("Bukhhalter-vutratu-date-to").value = "";
  byId<HTMLSelectElement>("Bukhhalter-vutratu-category").value = "";
  byId<HTMLSelectElement>("Bukhhalter-vutratu-payment-method").value = "";
  byId<HTMLInputElement>("vutratu-payment-filter-toggle").value = "2";
  byId<HTMLInputElement>("vutratu-discount-filter-toggle").value = "2";
  vutratuData = [];
  filteredvutratuData = [];
  updatevutratuTable();
}

export async function runMassPaymentCalculationForvutratu(): Promise<void> {
  const unpaidvutratu = filteredvutratuData.filter((e) => !e.isPaid);

  if (unpaidvutratu.length === 0) {
    showNotification("ℹ️ Немає неоплачених витрат", "info");
    return;
  }

  const confirmed = await createPasswordConfirmationModal("pay");
  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  const now = getCurrentUkrainianTime();
  const calculatorName = getCurrentUserName();
  let successCount = 0;

  for (const expense of unpaidvutratu) {
    if (expense.category === "💰 Прибуток") {
      // Для актів оновлюємо rosraxovano та xto_rozraxuvav
      const actId = Math.abs(expense.id);
      const { error } = await supabase
        .from("acts")
        .update({
          rosraxovano: now,
          xto_rozraxuvav: calculatorName,
        })
        .eq("act_id", actId);

      if (!error) {
        expense.isPaid = true;
        expense.xto_rozraxuvav = calculatorName;
        successCount++;
      }
    } else {
      // Для витрат просто позначаємо як оплачені без dataOff
      successCount++;
    }
  }

  await loadvutratuFromDatabase();
  filtervutratuData();
  showNotification(
    `✅ Позначено ${successCount} записів як оплачені`,
    "success",
  );
}

// ==================== МОДАЛЬНЕ ВІКНО ====================

export function openExpenseModal(): void {
  const modal = byId<HTMLDivElement>("expense-modal");
  if (!modal) return;

  // 1) Спочатку опції (щоб <select> мав варіанти до будь-яких .value)
  populateModalCategorySelect();
  populateModalPaymentMethodSelect();

  // 2) Очищення тільки для "add"
  if (currentExpenseMode === "add") {
    selectedExpenseId = null;
    const today = new Date().toISOString().split("T")[0];
    byId<HTMLInputElement>("expense-modal-date").value = today;
    byId<HTMLSelectElement>("expense-modal-category").value = "";
    byId<HTMLSelectElement>("expense-modal-payment-method").value = "";
    byId<HTMLInputElement>("expense-modal-amount").value = "";
    byId<HTMLTextAreaElement>("expense-modal-description").value = "";
    byId<HTMLTextAreaElement>("expense-modal-notes").value = "";
  }

  modal.style.display = "flex";
}

export function closeExpenseModal(): void {
  const modal = byId<HTMLDivElement>("expense-modal");
  if (!modal) return;
  modal.style.display = "none";
  selectedExpenseId = null;
  setExpenseMode("add");
}

function populateModalCategorySelect(): void {
  const select = byId<HTMLSelectElement>("expense-modal-category");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">Оберіть категорію</option>';
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
  if (currentValue) select.value = currentValue;
}

function populateModalPaymentMethodSelect(): void {
  const select = byId<HTMLSelectElement>("expense-modal-payment-method");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">Оберіть спосіб оплати</option>';
  PAYMENT_METHODS.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    select.appendChild(option);
  });
  if (currentValue) select.value = currentValue;
}

export async function saveExpenseFromModal(): Promise<void> {
  const mode = getCurrentExpenseMode();
  const date = byId<HTMLInputElement>("expense-modal-date")?.value || "";
  const category =
    byId<HTMLSelectElement>("expense-modal-category")?.value || "";
  const description =
    byId<HTMLTextAreaElement>("expense-modal-description")?.value || "";
  const amountStr = byId<HTMLInputElement>("expense-modal-amount")?.value || "";
  const paymentMethod =
    byId<HTMLSelectElement>("expense-modal-payment-method")?.value || "";
  const notes = byId<HTMLTextAreaElement>("expense-modal-notes")?.value || "";

  const amount = parseFloat(amountStr.replace(/\s/g, ""));

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

  switch (mode) {
    case "add":
      await handleAddExpense(
        date,
        category,
        description,
        amount,
        paymentMethod,
        notes,
      );
      break;
    case "edit":
      await handleEditExpense(
        date,
        category,
        description,
        amount,
        paymentMethod,
        notes,
      );
      break;
    case "delete":
      await handleDeleteExpense();
      break;
  }
}

// Функція для зміни статусу оплати акту з підтвердженням
async function toggleActPayment(index: number): Promise<void> {
  const expense = filteredvutratuData[index];
  if (!expense || expense.category !== "💰 Прибуток") {
    showNotification("⚠️ Це не акт", "warning");
    return;
  }

  const action = expense.isPaid ? "unpay" : "pay";
  const confirmed = await createPasswordConfirmationModal(action);

  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  const actId = Math.abs(expense.id);

  try {
    if (expense.isPaid) {
      // Скасовуємо розрахунок
      const { error } = await supabase
        .from("acts")
        .update({
          rosraxovano: null,
          xto_rozraxuvav: null,
        })
        .eq("act_id", actId);

      if (error) {
        // console.error("❌ Помилка скасування розрахунку:", error);
        showNotification("❌ Помилка скасування розрахунку", "error");
        return;
      }

      showNotification("✅ Розрахунок скасовано", "success");
    } else {
      // Встановлюємо розрахунок
      const now = getCurrentUkrainianTime();
      const calculatorName = getCurrentUserName();

      const { error } = await supabase
        .from("acts")
        .update({
          rosraxovano: now,
          xto_rozraxuvav: calculatorName,
        })
        .eq("act_id", actId);

      if (error) {
        // console.error("❌ Помилка встановлення розрахунку:", error);
        showNotification("❌ Помилка встановлення розрахунку", "error");
        return;
      }

      showNotification("✅ Розрахунок встановлено", "success");
    }

    // КЛЮЧОВЕ ВИПРАВЛЕННЯ: Перезавантажуємо всі дані з бази
    await loadvutratuFromDatabase();
    filtervutratuData();
  } catch (error) {
    // console.error("❌ Критична помилка:", error);
    showNotification("❌ Не вдалося оновити розрахунок", "error");
  }
}

export function getFilteredvutratuData(): ExpenseRecordLocal[] {
  return filteredvutratuData;
}

// ==================== ГЛОБАЛІЗАЦІЯ ====================

(window as any).openExpenseModal = openExpenseModal;
(window as any).closeExpenseModal = closeExpenseModal;
(window as any).saveExpenseFromModal = saveExpenseFromModal;
(window as any).deleteExpenseRecord = deleteExpenseRecord;
(window as any).updatevutratuDisplayedSums = updatevutratuDisplayedSums;
(window as any).cycleExpenseMode = cycleExpenseMode;
(window as any).setExpenseMode = setExpenseMode;
(window as any).formatAmountWithSpaces = formatAmountWithSpaces;
(window as any).autoResizeTextarea = autoResizeTextarea;
(window as any).getCurrentExpenseMode = getCurrentExpenseMode;
(window as any).searchvutratuFromDatabase = searchvutratuFromDatabase;
(window as any).toggleActPayment = toggleActPayment;

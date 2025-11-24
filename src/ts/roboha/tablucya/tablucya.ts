//src\ts\roboha\tablucya\tablucya.ts (ОНОВЛЕНИЙ КОД)
import { supabase } from "../../vxid/supabaseClient";
import { showModal } from "../zakaz_naraudy/modalMain";
import {
  showLoginModalBeforeTable,
  isUserAuthenticated,
  userAccessLevel,
  logoutFromSystemAndRedirect,
  canUserViewActs,
  canUserOpenActs,
} from "./users";

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement | null;
  if (target && target.closest("#logout-link")) {
    e.preventDefault();
    logoutFromSystemAndRedirect();
  }
});

// =============================================================================
// ГЛОБАЛЬНІ ЗМІННІ
// =============================================================================

let actsGlobal: any[] = [];
let clientsGlobal: any[] = [];
let carsGlobal: any[] = [];
let sortByDateStep = 0;

// =============================================================================
// УТИЛІТИ ДЛЯ РОБОТИ З ДАНИМИ
// =============================================================================

function safeParseJSON(data: any): any {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function formatDate(date: Date): string {
  return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}.${date.getFullYear()}`;
}

function formatDateTime(date: Date): { date: string; time: string } {
  const dateStr = formatDate(date);
  const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  return { date: dateStr, time: timeStr };
}

/**
 * НОВА функція: Конвертує дату з формату ISO (2025-09-11) в формат DD.MM.YY
 */
function convertISOtoShortDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(-2); // Беремо останні 2 цифри року
    return `${day}.${month}.${year}`;
  } catch {
    return null;
  }
}

function validateDateFormat(dateStr: string): boolean {
  const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
  if (!dateRegex.test(dateStr)) return false;

  const [d, m, y] = dateStr.split(".");
  const day = parseInt(d);
  const month = parseInt(m);
  const year = parseInt(y);

  return (
    day >= 1 &&
    day <= 31 &&
    month >= 1 &&
    month <= 12 &&
    year >= 2000 &&
    year <= 2100
  );
}

// =============================================================================
// ОБРОБКА ДАНИХ АКТІВ
// =============================================================================

function getClientInfo(
  act: any,
  clients: any[]
): { pib: string; phone: string } {
  const client = clients?.find((c) => c.client_id === act.client_id);
  const clientData = safeParseJSON(client?.data);

  const pib = clientData?.["ПІБ"] || "Невідомо";
  let phone = clientData?.["Телефон"] || "";

  phone = phone.replace(/[\(\)\-\s]/g, "");

  return { pib, phone };
}

function getCarInfo(act: any, cars: any[]): { number: string; name: string } {
  const car = cars?.find((c) => c.cars_id === act.cars_id);
  const carData = safeParseJSON(car?.data);

  const number = carData?.["Номер авто"] || "";
  const name = carData?.["Авто"] || "";

  return { number, name };
}

function getActAmount(act: any): number {
  const actData = safeParseJSON(act.info || act.data || act.details);
  const rawAmount =
    actData?.["Загальна сума"] ||
    actData?.["total"] ||
    actData?.["amount"] ||
    act.total ||
    act.amount;
  const num = Number(rawAmount);
  return isNaN(num) ? 0 : num;
}

function getActDateAsDate(act: any): Date | null {
  if (!act.date_on) return null;
  return new Date(act.date_on);
}

function isActClosed(act: any): boolean {
  return act.date_off && !isNaN(Date.parse(act.date_off));
}

// =============================================================================
// РЕНДЕРИНГ ТАБЛИЦІ
// =============================================================================

/**
 * ОНОВЛЕНА функція створення комірки клієнта з перевіркою доступу
 */
function createClientCell(
  clientInfo: { pib: string; phone: string },
  actId: number
): HTMLTableCellElement {
  const td = document.createElement("td");
  const phones = clientInfo.phone ? [clientInfo.phone] : [];
  let pibOnly = clientInfo.pib;
  td.innerHTML = `<div>${pibOnly}</div>`;
  phones.forEach((p) => {
    td.innerHTML += `<div class="phone-blue-italic">${p}</div>`;
  });
  
  td.addEventListener("click", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      showModal(actId);
    } else {
      console.warn(`⚠️ Користувач ${userAccessLevel} не має доступу до відкриття актів`);
      showNoAccessNotification();
    }
  });
  
  return td;
}

/**
 * ОНОВЛЕНА функція створення комірки авто з перевіркою доступу
 */
function createCarCell(
  carInfo: { number: string; name: string },
  actId: number
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.innerHTML = `<div style="word-wrap: break-word; word-break: break-word; white-space: normal;">${carInfo.name}</div>`;
  if (carInfo.number) {
    td.innerHTML += `<div style="color: #ff8800; font-size: 0.9em; word-wrap: break-word; word-break: break-word; white-space: normal;">${carInfo.number}</div>`;
  }
  
  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      showModal(actId);
    } else {
      console.warn(`⚠️ Користувач ${userAccessLevel} не має доступу до відкриття актів`);
      showNoAccessNotification();
    }
  });
  
  return td;
}

/**
 * ОНОВЛЕНА функція створення комірки дати з перевіркою доступу
 */
function createDateCell(act: any, actId: number): HTMLTableCellElement {
  const td = document.createElement("td");
  
  const actDate = getActDateAsDate(act);
  if (actDate) {
    const { date, time } = formatDateTime(actDate);
    td.innerHTML = `<div>${date}</div><div style="color: #0400ffff; font-size: 0.85em;">${time}</div>`;
  } else {
    td.innerHTML = `<div>-</div>`;
  }
  
  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      showModal(actId);
    } else {
      console.warn(`⚠️ Користувач ${userAccessLevel} не має доступу до відкриття актів`);
      showNoAccessNotification();
    }
  });
  
  return td;
}

/**
 * ОНОВЛЕНА функція створення стандартної комірки з перевіркою доступу та мітками
 */
function createStandardCell(
  content: string,
  act: any,
  actId: number,
  isActNumberCell: boolean = false
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.classList.add("act-table-cell"); // Додаємо клас
  td.innerHTML = content;

  if (isActNumberCell) {
    // Додаємо дані про акт (верхня мітка)
    if (act.contrAgent_act && act.contrAgent_act_data) {
      const actNum = act.contrAgent_act;
      const actDateFormatted = convertISOtoShortDate(act.contrAgent_act_data);
      if (actDateFormatted) {
        const actLabel = document.createElement("div");
        actLabel.classList.add("act-label"); // Використовуємо клас замість inline стилів
        actLabel.textContent = `ОУ-${actNum} / ${actDateFormatted}`;
        td.appendChild(actLabel);
      }
    }

    // Додаємо дані про рахунок (нижня мітка)
    if (act.contrAgent_raxunok && act.contrAgent_raxunok_data) {
      const raxunokNum = act.contrAgent_raxunok;
      const raxunokDateFormatted = convertISOtoShortDate(act.contrAgent_raxunok_data);
      if (raxunokDateFormatted) {
        const raxunokLabel = document.createElement("div");
        raxunokLabel.classList.add("raxunok-label"); // Використовуємо клас замість inline стилів
        raxunokLabel.textContent = `СФ-${raxunokNum} / ${raxunokDateFormatted}`;
        td.appendChild(raxunokLabel);
      }
    }
  }
  
  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      showModal(actId);
    } else {
      console.warn(`⚠️ Користувач ${userAccessLevel} не має доступу до відкриття актів`);
      showNoAccessNotification();
    }
  });
  
  return td;
}

/**
 * Повідомлення про відсутність доступу
 */
function showNoAccessNotification(): void {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    font-size: 16px;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = "🔒 У вас немає доступу до перегляду актів";
  
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = "slideIn 0.3s ease reverse";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function renderActsRows(
  acts: any[],
  clients: any[],
  cars: any[],
  tbody: HTMLTableSectionElement,
  accessLevel: string | null
): void {
  tbody.innerHTML = "";

  acts.forEach((act) => {
    const isClosed = isActClosed(act);
    const lockIcon = isClosed ? "🔒" : "🗝️";
    const clientInfo = getClientInfo(act, clients);
    const carInfo = getCarInfo(act, cars);
    const row = document.createElement("tr");
    row.classList.add(isClosed ? "row-closed" : "row-open");

    // Комірка № акту - З МІТКАМИ (передаємо true)
    row.appendChild(
      createStandardCell(
        `${lockIcon} ${act.act_id?.toString() || "N/A"}`,
        act,
        act.act_id,
        true // <-- ДОДАЛИ true для показу міток
      )
    );
    row.appendChild(createDateCell(act, act.act_id));
    row.appendChild(createClientCell(clientInfo, act.act_id));
    row.appendChild(createCarCell(carInfo, act.act_id));

    if (accessLevel !== "Слюсар") {
      // Комірка суми - БЕЗ МІТОК (передаємо false або нічого)
      row.appendChild(
        createStandardCell(
          `${getActAmount(act).toLocaleString("uk-UA")} грн`,
          act,
          act.act_id,
          false // <-- ДОДАЛИ false, щоб НЕ показувати мітки
        )
      );
    }

    tbody.appendChild(row);
  });
}

// =============================================================================
// СОРТУВАННЯ
// =============================================================================

function sortActs(): void {
  if (sortByDateStep === 0) {
    actsGlobal.sort((a, b) => {
      const aOpen = !isActClosed(a);
      const bOpen = !isActClosed(b);
      if (aOpen && !bOpen) return -1;
      if (!aOpen && bOpen) return 1;
      return 0;
    });
    sortByDateStep = 1;
  } else {
    actsGlobal.sort(
      (a, b) =>
        (getActDateAsDate(b)?.getTime() || 0) -
        (getActDateAsDate(a)?.getTime() || 0)
    );
    sortByDateStep = 0;
  }
}

// =============================================================================
// РОБОТА З ДАТАМИ
// =============================================================================

function getDefaultDateRange(): string {
  const today = new Date();
  const lastMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    today.getDate()
  );
  return `${formatDate(lastMonth)} - ${formatDate(today)}`;
}

function getDateRange(): { dateFrom: string; dateTo: string } | null {
  const input = document.getElementById("dateRangePicker") as HTMLInputElement;
  const dateRangeValue = input?.value?.trim();

  if (!dateRangeValue) {
    console.warn(
      "⚠️ Діапазон дат порожній. Завантажуємо всі акти за останній місяць."
    );
    input.value = getDefaultDateRange();
  }

  const currentValue = input.value.trim();
  if (currentValue === "Відкриті" || currentValue === "Закриті") {
    return null;
  }

  if (!currentValue.includes(" - ")) {
    console.error(
      "❌ Невірний формат діапазону. Очікується: DD.MM.YYYY - DD.MM.YYYY"
    );
    return null;
  }

  const [startStr, endStr] = currentValue.split(" - ");
  if (!validateDateFormat(startStr) || !validateDateFormat(endStr)) {
    console.error("❌ Невірний формат дати. Використовуйте DD.MM.YYYY");
    return null;
  }

  try {
    const [dateFrom, dateTo] = [startStr, endStr].map((str, i) => {
      const [d, m, y] = str.split(".");
      const full = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      return i === 0 ? `${full} 00:00:00` : `${full} 23:59:59`;
    });
    return { dateFrom, dateTo };
  } catch (error) {
    console.error("❌ Помилка конвертації дати:", error);
    return null;
  }
}

// =============================================================================
// ФІЛЬТРАЦІЯ
// =============================================================================

function filterActs(
  acts: any[],
  searchTerm: string,
  clients: any[],
  cars: any[]
): any[] {
  if (!searchTerm) return acts;
  const filters = parseSearchTerm(searchTerm);
  
  return acts.filter((act) => {
    const clientInfo = getClientInfo(act, clients);
    const carInfo = getCarInfo(act, cars);
    const actDate = getActDateAsDate(act);
    const formattedDate = actDate ? formatDate(actDate) : "";
    const amount = getActAmount(act);
    
    // НОВА ЛОГІКА: Отримуємо дані про рахунок та акт
    const raxunokNum = act.contrAgent_raxunok || "";
    const actNum = act.contrAgent_act || "";

    return filters.every((filter) => {
      const searchValue = filter.value.toUpperCase();
      
      // НОВА ФУНКЦІЯ: Пошук по СФ- (рахунок)
      if (searchValue.startsWith("СФ-")) {
        const numPart = searchValue.replace("СФ-", "").trim();
        if (!numPart) {
          // Якщо тільки "СФ-", показуємо всі акти з рахунками
          return raxunokNum !== "" && raxunokNum !== null;
        }
        // Якщо "СФ-123", фільтруємо по номеру
        return raxunokNum.toString().includes(numPart);
      }
      
      // НОВА ФУНКЦІЯ: Пошук по ОУ- (акт)
      if (searchValue.startsWith("ОУ-")) {
        const numPart = searchValue.replace("ОУ-", "").trim();
        if (!numPart) {
          // Якщо тільки "ОУ-", показуємо всі акти з актами
          return actNum !== "" && actNum !== null;
        }
        // Якщо "ОУ-123", фільтруємо по номеру
        return actNum.toString().includes(numPart);
      }

      // Стандартні фільтри
      switch (filter.key.toLowerCase()) {
        case "акт":
          return act.act_id?.toString().includes(filter.value);
        case "сума":
          return amount >= parseFloat(filter.value);
        case "дата":
          return formattedDate.includes(filter.value);
        case "тел":
        case "телефон":
          return clientInfo.phone.includes(filter.value);
        case "піб":
          return clientInfo.pib
            .toLowerCase()
            .includes(filter.value.toLowerCase());
        case "машина":
          return carInfo.name
            .toLowerCase()
            .includes(filter.value.toLowerCase());
        case "номер":
          return carInfo.number.includes(filter.value);
        default:
          return (
            clientInfo.pib.toLowerCase().includes(filter.value.toLowerCase()) ||
            clientInfo.phone.includes(filter.value) ||
            carInfo.number.includes(filter.value) ||
            carInfo.name.toLowerCase().includes(filter.value.toLowerCase()) ||
            act.act_id?.toString().includes(filter.value) ||
            formattedDate.includes(filter.value) ||
            amount.toString().includes(filter.value) ||
            raxunokNum.toString().includes(filter.value) || // Додано пошук по рахунку
            actNum.toString().includes(filter.value) // Додано пошук по акту
          );
      }
    });
  });
}

function parseSearchTerm(searchTerm: string): { key: string; value: string }[] {
  const filters: { key: string; value: string }[] = [];
  const parts = searchTerm.split(" ").filter((p) => p);
  parts.forEach((part) => {
    const [key, value] = part.split(":");
    if (key && value) {
      filters.push({ key, value });
    } else {
      filters.push({ key: "", value: part });
    }
  });
  return filters;
}

// =============================================================================
// ЗАВАНТАЖЕННЯ ДАНИХ
// =============================================================================

async function loadActsFromDB(
  dateFrom: string | null,
  dateTo: string | null,
  filterType: "open" | "closed" | null = null
): Promise<any[] | null> {
  let query = supabase.from("acts").select("*");
  if (filterType === "open") {
    query = query.is("date_off", null);
  } else if (filterType === "closed") {
    query = query.not("date_off", "is", null);
  } else if (dateFrom && dateTo) {
    query = query.gte("date_on", dateFrom).lte("date_on", dateTo);
  } else {
    console.warn(
      "⚠️ loadActsFromDB викликано без фільтрів. Завантажуємо акти за останній місяць."
    );
    const fallbackDates = getDateRange();
    if (fallbackDates) {
      query = supabase
        .from("acts")
        .select("*")
        .gte("date_on", fallbackDates.dateFrom)
        .lte("date_on", fallbackDates.dateTo);
    } else {
      return [];
    }
  }

  query = query.order("act_id", { ascending: false });

  const { data: acts, error: actsError } = await query;
  if (actsError) {
    console.error("❌ Помилка при отриманні актів:", actsError);
    return null;
  }
  return acts || [];
}

async function loadClientsFromDB(): Promise<any[] | null> {
  const { data: clients, error: clientError } = await supabase
    .from("clients")
    .select("client_id, data");
  if (clientError) {
    console.error("❌ Помилка при отриманні клієнтів:", clientError);
    return null;
  }
  return clients || [];
}

async function loadCarsFromDB(): Promise<any[] | null> {
  const { data: cars, error: carsError } = await supabase
    .from("cars")
    .select("cars_id, data");
  if (carsError) {
    console.error("❌ Помилка при отриманні авто:", carsError);
    return null;
  }
  return cars || [];
}

// =============================================================================
// СТВОРЕННЯ ТАБЛИЦІ
// =============================================================================

function createTableHeader(
  accessLevel: string | null
): HTMLTableSectionElement {
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const headers = ["№ акту", "Дата", "Клієнт 🔽", "Автомобіль"];
  if (accessLevel !== "Слюсар") {
    headers.push("Сумма");
  }

  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    if (header.includes("Клієнт")) {
      th.addEventListener("click", () => {
        sortActs();
        updateTableBody();
      });
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  return thead;
}

function updateTableBody(): void {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table"
  );
  if (!table) return;
  const newTbody = document.createElement("tbody");
  renderActsRows(
    actsGlobal,
    clientsGlobal,
    carsGlobal,
    newTbody,
    userAccessLevel
  );
  const oldTbody = table.querySelector("tbody");
  if (oldTbody) oldTbody.replaceWith(newTbody);
  applyVerticalScrollbarCompensation();
}

function createTable(accessLevel: string | null): HTMLTableElement {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  const thead = createTableHeader(accessLevel);
  const tbody = document.createElement("tbody");
  renderActsRows(actsGlobal, clientsGlobal, carsGlobal, tbody, accessLevel);
  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function showNoDataMessage(message: string): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: #666;">${message}</div>`;
  }
}

function showAuthRequiredMessage(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 20px;">🔐</div>
      <h3>Доступ обмежено</h3>
      <p>Для перегляду таблиці актів потрібна автентифікація</p>
      <button id="authRetryBtn" style="
        background: #4CAF50; color: white; border: none; padding: 10px 20px;
        border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px;
      ">Увійти</button>
    </div>`;
    const retryBtn = document.getElementById("authRetryBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        initializeActsSystem();
      });
    }
  }
}

/**
 * НОВА функція: Повідомлення про відсутність прав на перегляд актів
 */
function showNoViewAccessMessage(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
      <h3>Доступ заборонено</h3>
      <p>У вас немає прав на перегляд актів</p>
      <p style="color: #999; font-size: 14px; margin-top: 10px;">Зверніться до адміністратора для отримання доступу</p>
    </div>`;
  }
}

function applyVerticalScrollbarCompensation(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  const tbody = container?.querySelector("tbody") as HTMLElement | null;
  if (!container || !tbody) return;
  const hasVScroll = tbody.scrollHeight > tbody.clientHeight;
  container.classList.toggle("has-vscroll", hasVScroll);
}

// =============================================================================
// ОСНОВНІ ФУНКЦІОНАЛЬНІ
// =============================================================================

/**
 * ОНОВЛЕНА функція: Завантаження та відображення таблиці актів з перевіркою прав доступу
 */
export async function loadActsTable(
  dateFrom: string | null = null,
  dateTo: string | null = null,
  filterType: "open" | "closed" | null = null,
  searchTerm: string | null = null
): Promise<void> {
  if (!isUserAuthenticated()) {
    const accessLevel = await showLoginModalBeforeTable();
    if (!accessLevel) {
      showAuthRequiredMessage();
      return;
    }
  }

  const canView = await canUserViewActs();
  if (!canView) {
    console.warn(`⚠️ Користувач ${userAccessLevel} не має доступу до перегляду актів (setting перевірка)`);
    showNoViewAccessMessage();
    return;
  }

  try {
    let finalDateFrom: string | null = null;
    let finalDateTo: string | null = null;
    let finalFilterType: "open" | "closed" | null = filterType || null;
    const dateRangePicker = document.getElementById(
      "dateRangePicker"
    ) as HTMLInputElement;

    if (finalFilterType === "open" || finalFilterType === "closed") {
      finalDateFrom = null;
      finalDateTo = null;
    } else {
      if (dateFrom && dateTo) {
        finalDateFrom = dateFrom;
        finalDateTo = dateTo;
      } else {
        const fallback = getDateRange();
        if (fallback) {
          finalDateFrom = fallback.dateFrom;
          finalDateTo = fallback.dateTo;
        } else {
          const currentValue = dateRangePicker?.value?.trim();
          if (currentValue === "Відкриті") {
            finalFilterType = "open";
          } else if (currentValue === "Закриті") {
            finalFilterType = "closed";
          } else {
            const defaultRange = getDefaultDateRange();
            const [startStr, endStr] = defaultRange.split(" - ");
            const [d1, m1, y1] = startStr.split(".");
            const [d2, m2, y2] = endStr.split(".");
            finalDateFrom = `${y1}-${m1.padStart(2, "0")}-${d1.padStart(
              2,
              "0"
            )} 00:00:00`;
            finalDateTo = `${y2}-${m2.padStart(2, "0")}-${d2.padStart(
              2,
              "0"
            )} 23:59:59`;
            if (dateRangePicker) {
              dateRangePicker.value = defaultRange;
            }
          }
        }
      }
    }

    const [acts, clients, cars] = await Promise.all([
      loadActsFromDB(finalDateFrom, finalDateTo, finalFilterType),
      loadClientsFromDB(),
      loadCarsFromDB(),
    ]);

    if (acts === null || clients === null || cars === null) {
      return;
    }

    clientsGlobal = clients;
    carsGlobal = cars;

    let filteredActs = acts;
    filteredActs = filterActs(acts, searchTerm ?? "", clients, cars);
    actsGlobal = filteredActs;

    if (actsGlobal.length === 0) {
      console.warn(
        "⚠️ Немає актів у вказаному діапазоні дат або за терміном пошуку."
      );
      let message = "Немає актів";
      if (finalFilterType === "open") message += " (відкритих)";
      else if (finalFilterType === "closed") message += " (закритих)";
      else
        message += ` у діапазоні дат: ${dateRangePicker?.value || "невідомий"}`;
      if (searchTerm) message += ` за запитом "${searchTerm}"`;
      showNoDataMessage(message);
      return;
    }

    const table = createTable(userAccessLevel);
    const container = document.getElementById(
      "table-container-modal-sakaz_narad"
    );
    if (!container) {
      console.error(
        "❌ Контейнер table-container-modal-sakaz_narad не знайдено."
      );
      return;
    }
    container.innerHTML = "";
    container.appendChild(table);
    applyVerticalScrollbarCompensation();
  } catch (error) {
    console.error("💥 Критична помилка:", error);
  }
}

export async function refreshActsTable(): Promise<void> {
  if (!isUserAuthenticated()) {
    return;
  }

  const searchInput = document.getElementById(
    "searchInput"
  ) as HTMLInputElement;
  const currentSearchTerm = searchInput?.value?.trim() || "";

  const dateRangePicker = document.getElementById(
    "dateRangePicker"
  ) as HTMLInputElement;
  const currentValue = dateRangePicker?.value?.trim() || "";

  let currentFilterType: "open" | "closed" | null = null;
  let currentDateFrom: string | null = null;
  let currentDateTo: string | null = null;

  if (currentValue === "Відкриті") {
    currentFilterType = "open";
  } else if (currentValue === "Закриті") {
    currentFilterType = "closed";
  } else {
    const dates = getDateRange();
    if (dates) {
      currentDateFrom = dates.dateFrom;
      currentDateTo = dates.dateTo;
    }
  }
  loadActsTable(
    currentDateFrom,
    currentDateTo,
    currentFilterType,
    currentSearchTerm
  );
}

function watchDateRangeChanges(): void {
  const dateRangePicker = document.getElementById(
    "dateRangePicker"
  ) as HTMLInputElement;
  if (!dateRangePicker) return;

  let lastValue = dateRangePicker.value;
  const observer = new MutationObserver(() => {
    const currentValue = dateRangePicker.value;
    if (currentValue !== lastValue) {
      lastValue = currentValue;
      const searchInput = document.getElementById(
        "searchInput"
      ) as HTMLInputElement;
      const currentSearchTerm = searchInput?.value?.trim() || "";
      loadActsTable(undefined, undefined, undefined, currentSearchTerm);
    }
  });

  observer.observe(dateRangePicker, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  window.addEventListener("beforeunload", () => observer.disconnect());
}

/**
 * ОНОВЛЕНА функція ініціалізації системи з перевіркою прав доступу
 */
export async function initializeActsSystem(): Promise<void> {
  console.log("Ініціалізація системи актів з автентифікацією...");
  try {
    const accessLevel = await showLoginModalBeforeTable();

    if (!accessLevel) {
      console.log("❌ Автентифікацію скасовано користувачем");
      showAuthRequiredMessage();
      return;
    }

    const canView = await canUserViewActs();
    if (!canView) {
      console.warn(`⚠️ Користувач ${userAccessLevel} не має доступу до перегляду актів`);
      showNoViewAccessMessage();
      return;
    }

    console.log("✅ Автентифікація успішна, завантажуємо дані...");
    await loadActsTable(null, null, "open");
    watchDateRangeChanges();
    window.addEventListener("resize", applyVerticalScrollbarCompensation);
    console.log("✅ Система актів ініціалізована успішно");
  } catch (error) {
    console.error("💥 Помилка при ініціалізації системи актів:", error);
    showNoDataMessage("❌ Помилка при ініціалізації системи");
  }
}

// =============================================================================
// ЕКСПОРТ ДЛЯ ЗОВНІШНЬОГО ВИКОРИСТАННЯ
// =============================================================================

export { logoutFromSystemAndRedirect, isUserAuthenticated } from "./users";
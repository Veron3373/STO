// src\ts\roboha\bukhhalteriya\pidlehli.ts
import { supabase } from "../../vxid/supabaseClient";
import {
  formatDate,
  formatNumber,
  byId,
  updateTotalSum,
} from "./bukhhalteriya";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../tablucya/users"; // Імпортуємо функції для роботи з користувачем
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

// >>> ДОДАЙ ОЦЕ ТУТ (ПІСЛЯ ІМПОРТІВ) <<<
const FULL_ACCESS_ALIASES = ["адміністратор", "full", "admin", "administrator"];

function getCurrentAccessLevel(): string {
  const fromVar =
    (typeof userAccessLevel === "string" ? userAccessLevel : "") || "";
  const fromLS = getSavedUserDataFromLocalStorage?.() || null;

  const level = (fromVar || fromLS?.access || (fromLS as any)?.["Доступ"] || "")
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase();

  return level;
}

function hasFullAccess(): boolean {
  return FULL_ACCESS_ALIASES.includes(getCurrentAccessLevel());
}
// <<< КІНЕЦЬ ДОДАТКУ >>>

// Тип для фільтра виплат
type PaymentFilter = "paid" | "unpaid" | "all";

// Тип для фільтра статусу актів
type StatusFilter = "closed" | "open" | "all";

// Інтерфейс для записів підлеглих з бази даних
export interface PodlegleRecord {
  dateOpen: string;
  dateClose: string;
  name: string;
  act: string;
  client: string;
  automobile: string;
  work: string;
  quantity: number;
  price: number;
  total: number;
  isClosed: boolean;
  isPaid: boolean;
  paymentDate?: string; // Дата оплати
}

// Інтерфейс для даних з бази slyusars
interface SlyusarData {
  Name: string;
  Історія: {
    [date: string]: Array<{
      Акт: string;
      Записи: Array<{
        Ціна: number;
        Робота: string;
        Кількість: number;
        Розраховано?: string; // Дата розрахунку
      }>;
      Клієнт?: string;
      Автомобіль?: string;
      СуммаРоботи: number;
      ДатаЗакриття: string | null;
    }>;
  };
}

// Змінні для зберігання даних підлеглих
export let podlegleData: PodlegleRecord[] = [];
let slyusarsData: SlyusarData[] = [];
let availableNames: string[] = [];
let currentPaymentFilter: PaymentFilter = "all";
let currentStatusFilter: StatusFilter = "all";

// Змінні для відстеження стану пошуку
let lastSearchDateOpen: string = "";
let lastSearchDateClose: string = "";
let hasDataForAllEmployees: boolean = false;

// Функція для отримання поточної дати у форматі DD.MM.YYYY
function getCurrentDate(): string {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

// =============================================================================
// МОДАЛЬНЕ ВІКНО ДЛЯ ПІДТВЕРДЖЕННЯ ПАРОЛЯ
// =============================================================================

/**
 * Створення модального вікна для підтвердження пароля
 */
function createPasswordConfirmationModal(
  action: "pay" | "unpay"
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "password-confirmation-modal";
    modal.className = "login-modal";
    modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center;
            align-items: center; z-index: 10000;
        `;

    const modalContent = document.createElement("div");
    modalContent.className = "login-modal-content";
    modalContent.style.cssText = `
            background-color: #fff; padding: 20px; border-radius: 8px;
            width: 300px; text-align: center; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        `;

    const title = document.createElement("h3");
    title.textContent =
      action === "pay"
        ? "🔐 Підтвердження розрахунку"
        : "🔐 Підтвердження скасування";
    title.className = "login-modal-title";
    title.style.cssText = `margin-bottom: 15px; color: #333;`;

    const description = document.createElement("p");
    description.style.cssText = `margin-bottom: 15px; color: #666; font-size: 14px;`;

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Введіть пароль...";
    input.className = "login-input";
    input.style.cssText = `
            width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ccc;
            border-radius: 4px; box-sizing: border-box;
        `;

    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `color: #f44336; margin: 10px 0; display: none; font-size: 14px;`;

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `display: flex; gap: 10px; justify-content: center;`;

    const confirmButton = document.createElement("button");
    confirmButton.textContent = "Підтвердити";
    confirmButton.className = "login-button";
    confirmButton.style.cssText = `
            padding: 10px 20px; background-color: #007bff; color: #fff; border: none;
            border-radius: 4px; cursor: pointer; transition: background-color 0.2s; flex: 1;
        `;

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Скасувати";
    cancelButton.style.cssText = `
            padding: 10px 20px; background-color: #6c757d; color: #fff; border: none;
            border-radius: 4px; cursor: pointer; transition: background-color 0.2s; flex: 1;
        `;

    // Обробники подій
    confirmButton.addEventListener("click", async () => {
      const inputPassword = input.value.trim();
      if (!inputPassword) {
        errorDiv.textContent = "Введіть пароль";
        errorDiv.style.display = "block";
        return;
      }

      // Отримуємо збережені дані користувача
      const savedData = getSavedUserDataFromLocalStorage();
      if (!savedData) {
        errorDiv.textContent = "Помилка: не знайдено дані користувача";
        errorDiv.style.display = "block";
        return;
      }

      // Перевіряємо пароль
      if (inputPassword === savedData.password) {
        modal.remove();
        resolve(true);
      } else {
        errorDiv.textContent = "Невірний пароль";
        errorDiv.style.display = "block";
        input.focus();
        input.select();
      }
    });

    cancelButton.addEventListener("click", () => {
      modal.remove();
      resolve(false);
    });

    // Обробка Enter
    input.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        confirmButton.click();
      }
    });

    // Обробка Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        modal.remove();
        resolve(false);
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Очищення слухача при видаленні модального вікна
    const originalRemove = modal.remove;
    modal.remove = function () {
      document.removeEventListener("keydown", handleEscape);
      originalRemove.call(this);
    };

    // Додавання елементів до модального вікна
    buttonsContainer.appendChild(confirmButton);
    buttonsContainer.appendChild(cancelButton);

    modalContent.appendChild(title);
    modalContent.appendChild(description);
    modalContent.appendChild(input);
    modalContent.appendChild(errorDiv);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);
    setTimeout(() => input.focus(), 100);
  });
}

// Функція для завантаження даних з бази slyusars
export async function loadSlyusarsData(): Promise<void> {
  try {
    // //console.log('Завантаження даних slyusars з Supabase...');
    //showNotification('🔄 Завантаження даних з бази...', 'info', 2000);

    const { data, error } = await supabase.from("slyusars").select("*");

    if (error) {
      console.error("Помилка Supabase:", error);
      throw new Error(`Помилка завантаження: ${error.message}`);
    }

    //console.log('Сирі дані з Supabase:', data);

    if (data && Array.isArray(data)) {
      slyusarsData = data
        .map((item, index) => {
          try {
            let parsedData;
            if (typeof item.data === "string") {
              parsedData = JSON.parse(item.data);
            } else if (typeof item.data === "object" && item.data !== null) {
              parsedData = item.data;
            } else {
              console.warn(
                `Пропущений запис ${index}: невірний формат data`,
                item
              );
              return null;
            }

            if (!parsedData || !parsedData.Name) {
              console.warn(
                `Пропущений запис ${index}: немає поля Name`,
                parsedData
              );
              return null;
            }

            //console.log(`✅ Завантажено слюсаря: ${parsedData.Name}`);
            return parsedData;
          } catch (parseError) {
            console.error(
              `Помилка парсингу запису ${index}:`,
              parseError,
              item
            );
            return null;
          }
        })
        .filter((item) => item !== null);

      //console.log(`📊 Загальна кількість завантажених слюсарів: ${slyusarsData.length}`);
      updateNamesList();
      //showNotification(`✅ Завантажено ${slyusarsData.length} слюсарів з бази`, 'success');
    } else {
      throw new Error(
        "Невірний формат даних з Supabase: дані не є масивом або порожні"
      );
    }
  } catch (error) {
    // console.error('❌ Помилка завантаження даних з бази slyusars:', error);

    let errorMessage = "Невідома помилка";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    showNotification(
      `⚠️ Не вдалося завантажити дані з бази: ${errorMessage}. Перевірте підключення до сервера або налаштування Supabase.`,
      "error",
      5000
    );
    slyusarsData = [];
    availableNames = [];
    createNameSelect();
  }
}

// Функція для збереження оновлених даних в базі slyusars
async function saveSlyusarsDataToDatabase(): Promise<void> {
  try {
    //console.log('Збереження оновлених даних в базу slyusars...');
    showNotification("💾 Збереження змін в базу...", "info", 2000);

    // 1) Беремо поточні записи, але без зайвого: тільки ключ + data
    const { data: existingData, error: fetchError } = await supabase
      .from("slyusars")
      .select("*");

    if (fetchError) {
      console.error("Помилка отримання даних:", fetchError);
      throw new Error(`Помилка отримання даних: ${fetchError.message}`);
    }

    // Визначаємо назву ключа таблиці (id або slyusars_id)
    const primaryKeyCandidates = ["id", "slyusars_id", "uid", "pk"];
    const detectPrimaryKey = (row: any): string | null => {
      if (!row) return null;
      for (const k of primaryKeyCandidates) if (k in row) return k;
      return null;
    };
    const primaryKey = detectPrimaryKey(existingData?.[0]);

    for (const slyusar of slyusarsData) {
      try {
        // Знаходимо відповідний запис у вибірці за ім'ям всередині JSON
        const target = existingData?.find((item) => {
          let js = item.data;
          if (typeof js === "string") {
            try {
              js = JSON.parse(js);
            } catch {
              /* ignore */
            }
          }
          return js && js.Name === slyusar.Name;
        });

        if (!target) {
          console.warn(`Не знайдено запис для слюсаря: ${slyusar.Name}`);
          continue;
        }

        // 2) Оновлюємо: якщо знаємо ключ — по ключу; інакше — по JSON фільтру
        if (primaryKey) {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar }) // jsonb оновлюємо відразу об'єктом
            .eq(primaryKey, target[primaryKey]) // правильне поле ключа
            .select();

          if (updErr) {
            console.error(`Помилка оновлення ${slyusar.Name}:`, updErr);
            throw updErr;
          } else {
            console.log(
              `✅ Оновлено по ключу (${primaryKey}) для ${slyusar.Name}`,
              upd
            );
          }
        } else {
          // fallback: оновлення за вмістом JSON (Name має бути унікальним у таблиці)
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .contains("data", { Name: slyusar.Name })
            .select();

          if (updErr) {
            console.error(
              `Помилка оновлення (fallback) ${slyusar.Name}:`,
              updErr
            );
            throw updErr;
          } else {
            console.log(`✅ Оновлено за JSON Name для ${slyusar.Name}`, upd);
          }
        }
      } catch (recordError) {
        console.error(
          `Помилка обробки запису для ${slyusar.Name}:`,
          recordError
        );
        throw recordError;
      }
    }

    //console.log('✅ Дані успішно збережено в базу slyusars');
    showNotification("✅ Дані успішно збережено в базу", "success");
  } catch (error) {
    console.error("❌ Помилка збереження в базу slyusars:", error);
    let errorMessage = "Невідома помилка";
    if (error instanceof Error) errorMessage = error.message;
    else if (typeof error === "object" && error !== null)
      errorMessage = JSON.stringify(error);

    showNotification(
      `⚠️ Помилка збереження в базу даних: ${errorMessage}. Зміни можуть не зберегтися.`,
      "error",
      5000
    );
    throw error;
  }
}

// Оновлення списку доступних імен з реальної бази даних
function updateNamesList(): void {
  const namesSet = new Set<string>();
  slyusarsData.forEach((item) => {
    if (item.Name) namesSet.add(item.Name);
  });
  availableNames = Array.from(namesSet).sort();
  //console.log('Доступні імена з бази:', availableNames);
  createNameSelect();
}

// Створення випадаючого списку для імен з автоматичним фільтруванням
export function createNameSelect(): void {
  try {
    const select = byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select");

    // Очищаємо старі опції
    select.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Оберіть ПІБ (або залиште порожнім для всіх)";
    select.appendChild(emptyOption);

    // Додаємо опції з реальними іменами з бази даних
    availableNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    // Додаємо обробник зміни вибору співробітника
    select.addEventListener("change", (event) => {
      const selectedName = (event.target as HTMLSelectElement).value;

      // Якщо раніше були завантажені дані для всіх співробітників,
      // то при зміні імені автоматично фільтруємо
      if (hasDataForAllEmployees) {
        console.log(
          `🔄 Автоматичне фільтрування по співробітнику: ${
            selectedName || "всі"
          }`
        );

        // Використовуємо збережені параметри пошуку
        searchDataInDatabase(
          lastSearchDateOpen,
          lastSearchDateClose,
          selectedName
        );
      }
    });

    //console.log('Створено випадаючий список з', availableNames.length, 'іменами з бази даних');
  } catch (error) {}
}

// Функція для фільтрації даних підлеглих
export function getFilteredpodlegleData(): PodlegleRecord[] {
  let filteredData = podlegleData;

  // Фільтр по статусу виплат
  if (currentPaymentFilter === "paid") {
    filteredData = filteredData.filter((item) => item.isPaid);
  } else if (currentPaymentFilter === "unpaid") {
    filteredData = filteredData.filter((item) => !item.isPaid);
  }

  // Фільтр по статусу актів
  if (currentStatusFilter === "closed") {
    filteredData = filteredData.filter((item) => item.isClosed);
  } else if (currentStatusFilter === "open") {
    filteredData = filteredData.filter((item) => !item.isClosed);
  }

  return filteredData;
}

// Оновлення таблиці підлеглих з кольоровим кодуванням та фільтрацією
export function updatepodlegleTable(): void {
  const tbody = byId<HTMLTableSectionElement>("podlegle-tbody");
  const filteredData = getFilteredpodlegleData();

  if (filteredData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="12" class="Bukhhalter-no-data">Немає даних для відображення</td></tr>';
    return;
  }

  tbody.innerHTML = filteredData
    .map((item, index) => {
      const originalIndex = podlegleData.indexOf(item);
      const rowClass = item.isClosed ? "closed-row" : "open-row";
      const paidClass = item.isPaid ? "paid-row" : "unpaid-row";

      // Формуємо текст для кнопки оплати
      const paymentButtonText = item.isPaid
        ? `💰 ${item.paymentDate || "Розраховано"}`
        : "💲 Не розраховано";

      return `
                <tr class="${rowClass} ${paidClass}" onclick="handleRowClick(${index})">
                    <td>
                        <button class="Bukhhalter-payment-btn ${
                          item.isPaid ? "paid" : "unpaid"
                        }" 
                                onclick="event.stopPropagation(); togglepodleglePaymentWithConfirmation(${originalIndex})" 
                                title="${
                                  item.isPaid
                                    ? `Розраховано ${item.paymentDate || ""}`
                                    : "Не розраховано"
                                }">
                            ${paymentButtonText}
                        </button>
                    </td>
                    <td>${formatDate(item.dateOpen)}</td>
                    <td>${formatDate(item.dateClose)}</td>
                    <td>${item.name || "-"}</td>
                    <td>
                     <button class="Bukhhalter-act-btn"
                             onclick="event.stopPropagation(); openActModal(${
                               Number(item.act) || 0
                             })"
                             title="Відкрити акт №${item.act}">
                       📋 ${item.act || "-"}
                     </button>
                   </td>

                    <td>${item.client || "-"}</td>
                    <td>${item.automobile || "-"}</td>
                    <td>${item.work || "-"}</td>
                    <td>${item.quantity || "-"}</td>
                    <td>${item.price ? formatNumber(item.price) : "-"}</td>
                    <td>${item.total ? formatNumber(item.total) : "-"}</td>
                    <td><button class="Bukhhalter-delete-btn" onclick="event.stopPropagation(); deleteRecord('podlegle', ${originalIndex})">🗑️</button></td>
                </tr>
            `;
    })
    .join("");
}

// Пошук даних в базі slyusars та заповнення таблиці РЕАЛЬНИМИ даними
// Пошук даних в базі slyusars та заповнення таблиці РЕАЛЬНИМИ даними
export function searchDataInDatabase(
  dateOpen: string,
  dateClose: string,
  selectedName: string
): void {
  podlegleData = [];

  if (slyusarsData.length === 0) {
    showNotification(
      "⚠️ Немає даних з бази slyusars. Спробуйте перезавантажити сторінку.",
      "warning"
    );
    updatepodlegleTable();
    updateTotalSum();
    return;
  }

  // Зберігаємо параметри пошуку для подальшого використання
  lastSearchDateOpen = dateOpen;
  lastSearchDateClose = dateClose;

  // Визначаємо, чи це пошук за всіма співробітниками
  const isSearchForAllEmployees = !selectedName;
  if (isSearchForAllEmployees) {
    hasDataForAllEmployees = true;
  }

  // Отримуємо поточну дату для порівняння
  const getCurrentDateForComparison = (): string => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const currentDate = getCurrentDateForComparison();

  console.log(`🔍 Пошук в базі slyusars:`);
  console.log(`  - Початкова дата: ${dateOpen || "не вказана"}`);
  console.log(`  - Кінцева дата: ${dateClose || "не вказана"}`);
  console.log(`  - ПІБ: ${selectedName || "всі"}`);
  console.log(`  - Поточна дата: ${currentDate}`);

  slyusarsData.forEach((slyusar) => {
    // Фільтр по імені якщо вказано
    if (selectedName && slyusar.Name !== selectedName) {
      return;
    }

    // Перебираємо всю історію слюсаря
    Object.keys(slyusar.Історія).forEach((date) => {
      let shouldInclude = false;

      // Логіка фільтрації дат:
      if (!dateOpen && !dateClose) {
        // Якщо немає початкової і кінцевої дати - виводимо все
        shouldInclude = true;
      } else if (dateOpen && !dateClose) {
        // Якщо є лише початкова - шукаємо від початкової до теперішньої
        shouldInclude = date >= dateOpen && date <= currentDate;
      } else if (!dateOpen && dateClose) {
        // Якщо є лише кінцева - шукаємо все що до кінцевої включно
        shouldInclude = date <= dateClose;
      } else if (dateOpen && dateClose) {
        // Якщо є обидві дати - стандартний діапазон
        shouldInclude = date >= dateOpen && date <= dateClose;
      }

      if (shouldInclude) {
        // Перебираємо всі записи за цю дату
        slyusar.Історія[date].forEach((record) => {
          // Перебираємо всі роботи в записі
          record.Записи.forEach((entry) => {
            // Пропускаємо записи з нульовою кількістю
            if (entry.Кількість === 0) return;

            // Перевіряємо чи є ключ "Розраховано"
            const isPaid = !!entry.Розраховано;
            const paymentDate = entry.Розраховано || "";

            // Створюємо запис для таблиці підлеглих з РЕАЛЬНИМИ даними
            const podlegleRecord: PodlegleRecord = {
              dateOpen: date,
              dateClose: record.ДатаЗакриття || "",
              name: slyusar.Name,
              act: record.Акт,
              client: record.Клієнт || "",
              automobile: record.Автомобіль || "",
              work: entry.Робота,
              quantity: entry.Кількість,
              price: entry.Ціна,
              total: entry.Ціна * entry.Кількість,
              isClosed: record.ДатаЗакриття !== null,
              isPaid: isPaid,
              paymentDate: paymentDate,
            };
            podlegleData.push(podlegleRecord);
          });
        });
      }
    });
  });

  console.log(`📊 Знайдено ${podlegleData.length} записів в базі slyusars`);

  // Сортуємо дані по датах відкриття актів: нові зверху, старі знизу
  podlegleData.sort((a, b) => {
    // Перетворюємо дати в об'єкти Date для порівняння
    const dateA = new Date(a.dateOpen);
    const dateB = new Date(b.dateOpen);

    // Сортування за спаданням (нові дати зверху)
    return dateB.getTime() - dateA.getTime();
  });

  console.log(`🔄 Дані відсортовані по датах відкриття (нові зверху)`);

  const recordsCount = podlegleData.length;
  const filterMessage = selectedName ? ` для ${selectedName}` : "";

  // Формуємо повідомлення про застосовані фільтри дат
  let dateFilterMessage = "";
  if (!dateOpen && !dateClose) {
    dateFilterMessage = " (всі дати)";
  } else if (dateOpen && !dateClose) {
    dateFilterMessage = ` (з ${dateOpen} до сьогодні)`;
  } else if (!dateOpen && dateClose) {
    dateFilterMessage = ` (до ${dateClose} включно)`;
  } else if (dateOpen && dateClose) {
    dateFilterMessage = ` (з ${dateOpen} до ${dateClose})`;
  }

  showNotification(
    recordsCount > 0
      ? `✅ Знайдено ${recordsCount} записів${filterMessage}${dateFilterMessage}`
      : `ℹ️ Записів не знайдено за заданими критеріями${filterMessage}${dateFilterMessage}`,
    recordsCount > 0 ? "success" : "info"
  );

  updatepodlegleTable();
  updateTotalSum();
}

// Виправлені функції для перемикачів фільтрів

// Створення перемикача для фільтра статусу актів
export function createStatusToggle(): void {
  const toggle = byId<HTMLInputElement>("status-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент status-filter-toggle не знайдено в HTML");
    return;
  }

  // Додаємо детальне логування
  toggle.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    console.log("🔄 Зміна фільтра статусу актів:", value);

    switch (value) {
      case "0":
        currentStatusFilter = "closed";
        // console.log('📋 Встановлено фільтр: тільки закриті акти');
        break;
      case "1":
        currentStatusFilter = "open";
        // console.log('📋 Встановлено фільтр: тільки відкриті акти');
        break;
      case "2":
      default:
        currentStatusFilter = "all";
        //  console.log('📋 Встановлено фільтр: всі акти');
        break;
    }

    // Оновлюємо таблицю та суму
    updatepodlegleTable();
    updateTotalSum();

    //  console.log(`✅ Фільтр застосовано. Поточний статус: ${currentStatusFilter}`);
  });

  //  console.log('✅ Обробник статусу актів додано');
}

// Створення перемикача для фільтра виплат
export function createPaymentToggle(): void {
  const toggle = byId<HTMLInputElement>("payment-filter-toggle");

  if (!toggle) {
    console.error("❌ Елемент payment-filter-toggle не знайдено в HTML");
    return;
  }

  // Додаємо детальне логування
  toggle.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;

    //  console.log('💰 Зміна фільтра розрахунків:', value);

    switch (value) {
      case "0":
        currentPaymentFilter = "paid";
        //   console.log('💰 Встановлено фільтр: тільки розраховані');
        break;
      case "1":
        currentPaymentFilter = "unpaid";
        //    console.log('💰 Встановлено фільтр: тільки не розраховані');
        break;
      case "2":
      default:
        currentPaymentFilter = "all";
        //   console.log('💰 Встановлено фільтр: всі записи');
        break;
    }

    // Оновлюємо таблицю та суму
    updatepodlegleTable();
    updateTotalSum();

    console.log(
      `✅ Фільтр застосовано. Поточний розрахунок: ${currentPaymentFilter}`
    );
  });

  //console.log('✅ Обробник розрахунків додано');
}

// Функція для обробки додавання запису підлеглих
export function handlepodlegleAddRecord(): void {
  const dateOpen = byId<HTMLInputElement>(
    "Bukhhalter-podlegle-date-open"
  ).value;
  const dateClose = byId<HTMLInputElement>(
    "Bukhhalter-podlegle-date-close"
  ).value;
  const nameSelect = byId<HTMLSelectElement>("Bukhhalter-podlegle-name-select");
  const selectedName = nameSelect ? nameSelect.value : "";

  // Запускаємо пошук з будь-якими параметрами
  searchDataInDatabase(dateOpen, dateClose, selectedName);

  // Показуємо інформативне повідомлення про те, що саме шукаємо
  let searchInfo = "";
  if (!dateOpen && !dateClose) {
    searchInfo = "🔍 Завантажуємо всі записи";
  } else if (dateOpen && !dateClose) {
    searchInfo = `🔍 Пошук з ${dateOpen} до сьогодні`;
  } else if (!dateOpen && dateClose) {
    searchInfo = `🔍 Пошук всіх записів до ${dateClose}`;
  } else if (dateOpen && dateClose) {
    searchInfo = `🔍 Пошук в діапазоні ${dateOpen} - ${dateClose}`;
  }

  if (selectedName) {
    searchInfo += ` для ${selectedName}`;
  }

  console.log(searchInfo);
}
// Функція для видалення запису підлеглого
export function deletepodlegleRecord(index: number): void {
  podlegleData.splice(index, 1);
  updatepodlegleTable();
  showNotification("🗑️ Запис видалено", "info");
}

// =============================================================================
// ОНОВЛЕНА ФУНКЦІЯ ДЛЯ ПЕРЕМИКАННЯ ОПЛАТИ З ПІДТВЕРДЖЕННЯМ ПАРОЛЯ
// =============================================================================

/**
 * Функція для перемикання статусу виплати з підтвердженням пароля
 */
export async function togglepodleglePaymentWithConfirmation(
  index: number
): Promise<void> {
  if (!podlegleData[index]) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = podlegleData[index];

  // Перевіряємо рівень доступу користувача за допомогою hasFullAccess
  if (!hasFullAccess()) {
    showNotification("⚠️ У вас немає прав для зміни статусу оплати", "warning");
    return;
  }

  // Визначаємо дію для модального вікна
  const action = record.isPaid ? "unpay" : "pay";

  // Показуємо модальне вікно підтвердження
  const confirmed = await createPasswordConfirmationModal(action);

  if (!confirmed) {
    //console.log('Користувач скасував операцію');
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  // Якщо підтверджено, виконуємо зміну статусу оплати
  togglepodleglePayment(index);
}

// Оригінальна функція для перемикання статусу виплати підлеглому з збереженням в базу
export function togglepodleglePayment(index: number): void {
  if (!podlegleData[index]) {
    console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = podlegleData[index];
  //console.log(`🔄 Перемикання оплати для запису:`, record);

  // Якщо запис ще не оплачений, встановлюємо оплату з поточною датою
  if (!record.isPaid) {
    const currentDate = getCurrentDate();
    record.isPaid = true;
    record.paymentDate = currentDate;
    //console.log(`💰 Встановлюємо оплату: ${currentDate}`);

    // Знаходимо відповідний запис в slyusarsData та оновлюємо його
    const slyusar = slyusarsData.find((s) => s.Name === record.name);
    if (!slyusar) {
      console.error(`❌ Слюсаря ${record.name} не знайдено в slyusarsData`);
      showNotification(
        `⚠️ Помилка: слюсаря ${record.name} не знайдено в базі даних`,
        "error"
      );
      return;
    }

    if (!slyusar.Історія[record.dateOpen]) {
      console.error(
        `❌ Дата ${record.dateOpen} не знайдена в історії слюсаря ${record.name}`
      );
      showNotification(
        `⚠️ Помилка: дата ${record.dateOpen} не знайдена в історії`,
        "error"
      );
      return;
    }

    const actRecord = slyusar.Історія[record.dateOpen].find(
      (a) => a.Акт === record.act
    );
    if (!actRecord) {
      console.error(
        `❌ Акт ${record.act} не знайдений для дати ${record.dateOpen}`
      );
      showNotification(`⚠️ Помилка: акт ${record.act} не знайдений`, "error");
      return;
    }

    const workEntry = actRecord.Записи.find(
      (e) =>
        e.Робота === record.work &&
        e.Ціна === record.price &&
        e.Кількість === record.quantity
    );

    if (!workEntry) {
      console.error(`❌ Запис роботи не знайдений:`, {
        work: record.work,
        price: record.price,
        quantity: record.quantity,
      });
      showNotification(
        `⚠️ Помилка: запис роботи "${record.work}" не знайдений`,
        "error"
      );
      return;
    }

    workEntry.Розраховано = currentDate;
    //console.log(`✅ Встановлено розрахунок для ${record.name}, акт ${record.act}, робота "${record.work}": ${currentDate}`);
  } else {
    // Якщо запис оплачений, скасовуємо оплату
    record.isPaid = false;
    record.paymentDate = "";
    //console.log(`❌ Скасовуємо оплату`);

    // Видаляємо ключ "Розраховано" з slyusarsData
    const slyusar = slyusarsData.find((s) => s.Name === record.name);
    if (slyusar && slyusar.Історія[record.dateOpen]) {
      const actRecord = slyusar.Історія[record.dateOpen].find(
        (a) => a.Акт === record.act
      );
      if (actRecord) {
        const workEntry = actRecord.Записи.find(
          (e) =>
            e.Робота === record.work &&
            e.Ціна === record.price &&
            e.Кількість === record.quantity
        );
        if (workEntry) {
          delete workEntry.Розраховано;
          //console.log(`✅ Скасовано розрахунок для ${record.name}, акт ${record.act}, робота "${record.work}"`);
        }
      }
    }
  }

  // Зберігаємо зміни в базу даних
  //console.log(`💾 Зберігаємо зміни в базу даних...`);
  saveSlyusarsDataToDatabase()
    .then(() => {
      //console.log(`✅ Зміни успішно збережено`);
      updatepodlegleTable();
      showNotification(
        record.isPaid
          ? `💰 Розрахунок встановлено на ${record.paymentDate}`
          : "❌ Розрахунок скасовано",
        "success"
      );
    })
    .catch((error) => {
      console.error(`❌ Помилка збереження:`, error);
      showNotification("❌ Помилка збереження змін в базу даних", "error");
      // Відкатуємо зміни в інтерфейсі
      record.isPaid = !record.isPaid;
      record.paymentDate = record.isPaid ? getCurrentDate() : "";
      updatepodlegleTable();
    });
}

// =============================================================================
// ФУНКЦІЯ ДЛЯ КНОПКИ 💰 РОЗРАХУНОК
// =============================================================================

// Масовий розрахунок всіх актів
// Масовий розрахунок тільки відфільтрованих актів
export async function runMassPaymentCalculation(): Promise<void> {
  // Перевірка доступу
  if (!hasFullAccess()) {
    showNotification(
      "⚠️ У вас немає прав для виконання масового розрахунку",
      "warning"
    );
    return;
  }

  // Модалка для підтвердження пароля
  const confirmed = await createPasswordConfirmationModal("pay");
  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  // Отримуємо тільки відфільтровані дані, які зараз відображаються в таблиці
  const filteredData = getFilteredpodlegleData();

  if (filteredData.length === 0) {
    showNotification(
      "ℹ️ Немає записів для обробки в поточному фільтрі",
      "info"
    );
    return;
  }

  // Дата для розрахунку
  const currentDate = getCurrentDate();
  let updatedCount = 0;

  // Перебираємо тільки відфільтровані дані
  filteredData.forEach((record) => {
    if (!record.isPaid) {
      // Знаходимо індекс цього запису в оригінальному масиві podlegleData
      const originalIndex = podlegleData.findIndex(
        (item) =>
          item.dateOpen === record.dateOpen &&
          item.name === record.name &&
          item.act === record.act &&
          item.work === record.work &&
          item.price === record.price &&
          item.quantity === record.quantity
      );

      if (originalIndex !== -1) {
        // Оновлюємо запис в оригінальному масиві
        podlegleData[originalIndex].isPaid = true;
        podlegleData[originalIndex].paymentDate = currentDate;
        updatedCount++;

        // Оновлюємо також slyusarsData
        const slyusar = slyusarsData.find((s) => s.Name === record.name);
        if (slyusar && slyusar.Історія[record.dateOpen]) {
          const actRecord = slyusar.Історія[record.dateOpen].find(
            (a) => a.Акт === record.act
          );
          if (actRecord) {
            const workEntry = actRecord.Записи.find(
              (e) =>
                e.Робота === record.work &&
                e.Ціна === record.price &&
                e.Кількість === record.quantity
            );
            if (workEntry) {
              workEntry.Розраховано = currentDate;
            }
          }
        }
      }
    }
  });

  if (updatedCount === 0) {
    showNotification(
      "ℹ️ Усі записи в поточному фільтрі вже розраховані",
      "info"
    );
    return;
  }

  // Збереження в базу
  try {
    await saveSlyusarsDataToDatabase();
    updatepodlegleTable();
    showNotification(
      `✅ Масовий розрахунок виконано (${updatedCount} записів з відфільтрованих)`,
      "success"
    );
  } catch (error) {
    console.error("❌ Помилка масового розрахунку:", error);
    showNotification("❌ Помилка при збереженні змін у базу", "error");
  }
}

// Додаємо у глобальний контекст для HTML-кнопки
(window as any).runMassPaymentCalculation = runMassPaymentCalculation;

// =============================================================================
// ЕКСПОРТОВАНІ ФУНКЦІЇ ДЛЯ ГЛОБАЛЬНОГО ВИКОРИСТАННЯ
// =============================================================================

// Додаємо функції в глобальний контекст для використання в HTML onclick
(window as any).togglepodleglePaymentWithConfirmation =
  togglepodleglePaymentWithConfirmation;

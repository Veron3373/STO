// src/ts/roboha/bukhhalteriya/rosraxunok.ts
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../tablucya/users";

// Константи для повного доступу
const FULL_ACCESS_ALIASES = ["адміністратор", "full", "admin", "administrator"];

// Типи для даних
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
  paymentDate?: string;
}

interface SlyusarData {
  Name: string;
  Історія: {
    [date: string]: Array<{
      Акт: string;
      Записи: Array<{
        Ціна: number;
        Робота: string;
        Кількість: number;
        Розраховано?: string;
      }>;
      Клієнт?: string;
      Автомобіль?: string;
      СуммаРоботи: number;
      ДатаЗакриття: string | null;
    }>;
  };
}

/**
 * Отримання поточного рівня доступу користувача
 */
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

/**
 * Перевірка чи має користувач адміністратор доступ
 */
function hasFullAccess(): boolean {
  return FULL_ACCESS_ALIASES.includes(getCurrentAccessLevel());
}

/**
 * Отримання поточної дати у форматі DD.MM.YYYY
 */
function getCurrentDate(): string {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

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

    const modalContent = document.createElement("div");
    modalContent.className = "login-modal-content";

    // Плаваюча іконка
    const icon = document.createElement("span");
    icon.className = "login-modal-icon";
    icon.textContent = "🔐";

    const title = document.createElement("h3");
    title.className = "login-modal-title";
    title.textContent =
      action === "pay"
        ? "Підтвердження розрахунку"
        : "Підтвердження скасування";

    const description = document.createElement("p");
    description.className = "login-modal-subtitle";
    description.textContent = "Введіть пароль для підтвердження";

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "••••••••";
    input.className = "login-input";
    input.autocomplete = "current-password";

    const errorDiv = document.createElement("div");
    errorDiv.className = "login-error-message";
    errorDiv.style.display = "none";

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `display: flex; gap: 12px; justify-content: center; margin-top: 16px;`;

    // Скасувати — ЗЛІВА
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Скасувати";
    cancelButton.className = "login-button";
    cancelButton.style.cssText = `flex: 1; margin-top: 0; background: linear-gradient(135deg, #94a3b8 0%, #a1b0c4 100%); box-shadow: 0 3px 12px rgba(148, 163, 184, 0.25), 0 1px 3px rgba(0, 0, 0, 0.06);`;

    // Підтвердити — СПРАВА
    const confirmButton = document.createElement("button");
    confirmButton.textContent = "Підтвердити";
    confirmButton.className = "login-button";
    confirmButton.style.cssText = `flex: 1; margin-top: 0;`;

    // Shake-анімація помилки
    const showModalError = (message: string) => {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
      input.classList.remove("input-error");
      void input.offsetWidth;
      input.classList.add("input-error");
      setTimeout(() => input.classList.remove("input-error"), 600);
    };

    // Обробники подій
    confirmButton.addEventListener("click", async () => {
      const inputPassword = input.value.trim();
      if (!inputPassword) {
        showModalError("Введіть пароль");
        input.focus();
        return;
      }

      const savedData = getSavedUserDataFromLocalStorage();
      if (!savedData) {
        showModalError("Не знайдено дані користувача");
        return;
      }

      if (inputPassword === savedData.password) {
        // Анімація успіху
        icon.textContent = "✅";
        icon.classList.add("login-success-anim");
        title.textContent = "Підтверджено!";
        title.style.color = "#4ade80";
        input.classList.add("input-success");
        confirmButton.innerHTML = "✓ Успішно";
        confirmButton.style.background = "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";
        setTimeout(() => { modal.remove(); resolve(true); }, 500);
      } else {
        showModalError("Невірний пароль");
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

    const originalRemove = modal.remove;
    modal.remove = function () {
      document.removeEventListener("keydown", handleEscape);
      originalRemove.call(this);
    };

    buttonsContainer.appendChild(cancelButton);
    buttonsContainer.appendChild(confirmButton);

    modalContent.appendChild(icon);
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

/**
 * Збереження оновлених даних в базі slyusars
 */
async function saveSlyusarsDataToDatabase(
  slyusarsData: SlyusarData[]
): Promise<void> {
  try {
    showNotification("💾 Збереження змін в базу...", "info", 2000);

    // Беремо поточні записи з бази
    const { data: existingData, error: fetchError } = await supabase
      .from("slyusars")
      .select("*");

    if (fetchError) {
      // console.error("Помилка отримання даних:", fetchError);
      throw new Error(`Помилка отримання даних: ${fetchError.message}`);
    }

    // ✅ ВИПРАВЛЕНО: Додано правильний ключ slyusar_id
    const primaryKeyCandidates = ["slyusar_id", "id", "slyusars_id", "uid", "pk"];
    const detectPrimaryKey = (row: any): string | null => {
      if (!row) return null;
      for (const k of primaryKeyCandidates) if (k in row) return k;
      return null;
    };
    const primaryKey = detectPrimaryKey(existingData?.[0]);


    // ✅ ОПТИМІЗАЦІЯ: Збираємо всі оновлення в масив промісів
    const updatePromises: Promise<any>[] = [];

    for (const slyusar of slyusarsData) {
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
        // console.warn(`Не знайдено запис для слюсаря: ${slyusar.Name}`);
        continue;
      }

      // Оновлюємо запис
      if (primaryKey) {
        const updatePromise = (async () => {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .eq(primaryKey, target[primaryKey])
            .select();
          if (updErr) {
            // console.error(`Помилка оновлення ${slyusar.Name}:`, updErr);
            throw updErr;
          }
          return upd;
        })();

        updatePromises.push(updatePromise);
      } else {
        // fallback: оновлення за вмістом JSON
        const updatePromise = (async () => {
          const { data: upd, error: updErr } = await supabase
            .from("slyusars")
            .update({ data: slyusar })
            .contains("data", { Name: slyusar.Name })
            .select();
          if (updErr) {
            // console.error(`Помилка оновлення (fallback) ${slyusar.Name}:`, updErr);
            throw updErr;
          }
          return upd;
        })();

        updatePromises.push(updatePromise);
      }
    }

    // ✅ Чекаємо завершення ВСІХ оновлень
    await Promise.all(updatePromises);

    showNotification("✅ Дані успішно збережено в базу", "success");
  } catch (error) {
    // console.error("❌ Помилка збереження в базу slyusars:", error);
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

/**
 * Масовий розрахунок тільки відфільтрованих актів для підлеглих
 */
export async function runMassPaymentCalculationForPodlegle(
  filteredData: PodlegleRecord[],
  podlegleData: PodlegleRecord[],
  slyusarsData: SlyusarData[],
  updateTableCallback: () => void
): Promise<void> {
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
    await saveSlyusarsDataToDatabase(slyusarsData);
    updateTableCallback();
    showNotification(
      `✅ Масовий розрахунок виконано (${updatedCount} записів з відфільтрованих)`,
      "success"
    );
  } catch (error) {
    // console.error("❌ Помилка масового розрахунку:", error);
    showNotification("❌ Помилка при збереженні змін у базу", "error");
  }
}

/**
 * Функція для перемикання статусу виплати з підтвердженням пароля
 */
export async function togglePaymentWithConfirmation(
  index: number,
  данні: PodlegleRecord[],
  slyusarsData: SlyusarData[],
  updateTableCallback: () => void
): Promise<void> {
  if (!данні[index]) {
    // console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = данні[index];

  // Перевіряємо рівень доступу користувача
  if (!hasFullAccess()) {
    showNotification("⚠️ У вас немає прав для зміни статусу оплати", "warning");
    return;
  }

  // Визначаємо дію для модального вікна
  const action = record.isPaid ? "unpay" : "pay";

  // Показуємо модальне вікно підтвердження
  const confirmed = await createPasswordConfirmationModal(action);

  if (!confirmed) {
    showNotification("🚫 Операцію скасовано", "info");
    return;
  }

  // Виконуємо зміну статусу оплати
  await togglePayment(index, данні, slyusarsData, updateTableCallback);
}

/**
 * Функція для перемикання статусу виплати з збереженням в базу
 */
export async function togglePayment(
  index: number,
  данні: PodlegleRecord[],
  slyusarsData: SlyusarData[],
  updateTableCallback: () => void
): Promise<void> {
  if (!данні[index]) {
    // console.error(`Запис з індексом ${index} не знайдено`);
    showNotification("❌ Запис не знайдено", "error");
    return;
  }

  const record = данні[index];

  // Якщо запис ще не оплачений, встановлюємо оплату з поточною датою
  if (!record.isPaid) {
    const currentDate = getCurrentDate();
    record.isPaid = true;
    record.paymentDate = currentDate;

    // Знаходимо відповідний запис в slyusarsData та оновлюємо його
    const slyusar = slyusarsData.find((s) => s.Name === record.name);
    if (!slyusar) {
      // console.error(`❌ Слюсаря ${record.name} не знайдено в slyusarsData`);
      showNotification(
        `⚠️ Помилка: слюсаря ${record.name} не знайдено в базі даних`,
        "error"
      );
      return;
    }

    if (!slyusar.Історія[record.dateOpen]) {
      // console.error(
        // `❌ Дата ${record.dateOpen} не знайдена в історії слюсаря ${record.name}`
      // );
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
      // console.error(
        // `❌ Акт ${record.act} не знайдений для дати ${record.dateOpen}`
      // );
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
      // console.error(`❌ Запис роботи не знайдений:`, {
        // work: record.work,
        // price: record.price,
        // quantity: record.quantity,
      // });
      showNotification(
        `⚠️ Помилка: запис роботи "${record.work}" не знайдений`,
        "error"
      );
      return;
    }

    workEntry.Розраховано = currentDate;
  } else {
    // Якщо запис оплачений, скасовуємо оплату
    record.isPaid = false;
    record.paymentDate = "";

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
        }
      }
    }
  }

  // Зберігаємо зміни в базу даних
  try {
    await saveSlyusarsDataToDatabase(slyusarsData);
    updateTableCallback();
    showNotification(
      record.isPaid
        ? `💰 Розрахунок встановлено на ${record.paymentDate}`
        : "❌ Розрахунок скасовано",
      "success"
    );
  } catch (error) {
    // console.error(`❌ Помилка збереження:`, error);
    showNotification("❌ Помилка збереження змін в базу даних", "error");
    // Відкатуємо зміни в інтерфейсі
    record.isPaid = !record.isPaid;
    record.paymentDate = record.isPaid ? getCurrentDate() : "";
    updateTableCallback();
  }
}

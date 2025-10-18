// src/ts/roboha/zakaz_naraudy/inhi/vikno_vvody_parolu.ts
import { showNotification } from "./vspluvauhe_povidomlenna";
import { reopenActAndClearSlyusars } from "./save_work";
import { refreshActsTable } from "../../tablucya/tablucya";
import { supabase } from "../../../vxid/supabaseClient"; // Додаємо імпорт supabase
export const viknoVvodyParoluId = "vikno_vvody_parolu-modal";
const TARGET_USER_NAME = "Брацлавець Б. С."; // Ім'я користувача для пошуку
/** Створення DOM елемента модалки */
export function createViknoVvodyParolu(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = viknoVvodyParoluId;
  overlay.className = "vikno_vvody_parolu-overlay";
  overlay.style.display = "none";
  const modal = document.createElement("div");
  modal.className = "vikno_vvody_parolu-content modal-content-save";
  modal.innerHTML = `
    <p>Введіть пароль для відкриття акту:</p>
    <input type="password" id="password-input" placeholder="Пароль" class="password-input" style="padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 8px; width: calc(100% - 20px);">
    <div class="vikno_vvody_parolu-buttons save-buttons">
      <button id="password-confirm-btn" class="btn-save-confirm">Підтвердити</button>
      <button id="password-cancel-btn" class="btn-save-cancel">Скасувати</button>
    </div>
  `;
  overlay.appendChild(modal);
  return overlay;
}
/** Гарантовано підвісити модалку в DOM (якщо її ще нема) */
function ensureModalMounted(): HTMLElement {
  let el = document.getElementById(viknoVvodyParoluId);
  if (!el) {
    el = createViknoVvodyParolu();
    document.body.appendChild(el);
  }
  return el;
}
/** Функція для отримання пароля з бази даних */
async function getPasswordFromDatabase(): Promise<string | number | null> {
  try {
    console.log("🔍 Шукаємо користувача:", TARGET_USER_NAME);

    // Спочатку спробуємо через JSON запит
    const { data: singleData, error: singleError } = await supabase
      .from("slyusars")
      .select("data")
      .eq("data->>Name", TARGET_USER_NAME)
      .single();
    console.log("📊 Результат JSON запиту:", { singleData, singleError });
    if (
      !singleError &&
      singleData &&
      singleData.data &&
      singleData.data.Пароль !== undefined
    ) {
      console.log(
        "✅ Знайдено через JSON запит. Пароль:",
        singleData.data.Пароль,
        "Тип:",
        typeof singleData.data.Пароль
      );
      return singleData.data.Пароль;
    }
    // Якщо JSON запит не спрацював, отримуємо всі записи і шукаємо вручну
    console.log("🔄 JSON запит не спрацював, шукаємо вручну...");

    const { data: allData, error: allError } = await supabase
      .from("slyusars")
      .select("slyusar_id, data");
    if (allError) {
      console.error("❌ Помилка при запиті всіх slyusars:", allError.message);
      return null;
    }
    console.log("📋 Всі записи slyusars:", allData);
    // Шукаємо потрібного користувача вручну
    for (const record of allData || []) {
      console.log("🔍 Перевіряємо запис:", record);

      if (record.data && record.data.Name) {
        console.log("👤 Ім'я в записі:", `"${record.data.Name}"`);
        console.log("🎯 Шукане ім'я:", `"${TARGET_USER_NAME}"`);
        console.log("📏 Співпадають:", record.data.Name === TARGET_USER_NAME);

        if (record.data.Name === TARGET_USER_NAME) {
          console.log("✅ Знайшли користувача! Повні дані:", record.data);

          if (record.data.Пароль !== undefined) {
            return record.data.Пароль;
          } else {
            console.warn("⚠️ Поле 'Пароль' не знайдено в data");
            return null;
          }
        }
      }
    }
    console.warn(
      `⚠️ Користувач ${TARGET_USER_NAME} не знайдений серед записів`
    );
    return null;
  } catch (e) {
    console.error("💥 Виняток при отриманні пароля з БД:", e);
    return null;
  }
}
/** Функція для перевірки пароля */
async function verifyPassword(enteredPassword: string): Promise<boolean> {
  console.log("🔐 Почато перевірку пароля. Введено:", enteredPassword);

  const dbPassword = await getPasswordFromDatabase();

  if (dbPassword === null) {
    console.error("❌ Не вдалося отримати пароль з бази даних");
    return false;
  }
  // Порівнюємо введений пароль з паролем з БД
  // Перетворюємо обидва значення в рядки для порівняння
  const enteredStr = enteredPassword.toString().trim();
  const dbPasswordStr = dbPassword.toString().trim();

  console.log("🔍 Порівняння паролів:");
  console.log(" Введений:", `"${enteredStr}"`, "Довжина:", enteredStr.length);
  console.log(" З БД:", `"${dbPasswordStr}"`, "Довжина:", dbPasswordStr.length);
  console.log(" Співпадають:", enteredStr === dbPasswordStr);

  return enteredStr === dbPasswordStr;
}
/**
 * Показ модалки та безпосереднє ВІДКРИТТЯ АКТУ:
 * - перевіряє пароль з бази даних,
 * - виставляє acts.date_off = null,
 * - у slyusars.data.Історія для відповідного дня та Акту ставить "ДатаЗакриття" = null.
 * Повертає true, якщо відкрито; false — якщо скасовано або помилка/невірний пароль.
 */
export function showViknoVvodyParolu(actId: number): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = ensureModalMounted();
    modal.style.display = "flex";
    const passwordInput = document.getElementById(
      "password-input"
    ) as HTMLInputElement | null;
    const confirmBtn = document.getElementById(
      "password-confirm-btn"
    ) as HTMLButtonElement | null;
    const cancelBtn = document.getElementById(
      "password-cancel-btn"
    ) as HTMLButtonElement | null;
    if (!passwordInput || !confirmBtn || !cancelBtn) {
      console.error("Елементи модалки пароля не знайдені");
      modal.style.display = "none";
      return resolve(false);
    }
    // підготовка полів
    passwordInput.value = "";
    passwordInput.focus();
    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      passwordInput.removeEventListener("keypress", onKeyPress);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const tryOpen = async () => {
      confirmBtn.disabled = true;
      try {
        showNotification("Відкриваємо акт...", "info", 1200);
        await reopenActAndClearSlyusars(actId);
        await refreshActsTable();
        cleanup();
        resolve(true);
      } catch (e: any) {
        console.error(e);
        showNotification(
          "Помилка при відкритті акту: " + (e?.message || e),
          "error",
          2500
        );
        confirmBtn.disabled = false; // дозволяємо повторити
      }
    };
    const onConfirm = async () => {
      const entered = passwordInput.value;

      // Показуємо індикатор завантаження
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Перевіряємо...";

      try {
        const isPasswordCorrect = await verifyPassword(entered);

        if (isPasswordCorrect) {
          showNotification("Пароль вірний", "success", 800);
          await tryOpen();
        } else {
          showNotification("Невірний пароль", "error", 1500);
          passwordInput.value = "";
          passwordInput.focus();
          // модалка залишається відкрита
        }
      } catch (e) {
        console.error("Помилка при перевірці пароля:", e);
        showNotification("Помилка перевірки пароля", "error", 2000);
      } finally {
        // Відновлюємо кнопку
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Підтвердити";
      }
    };
    const onKeyPress = (ev: KeyboardEvent) => {
      if (ev.key === "Enter") onConfirm();
      if (ev.key === "Escape") onCancel();
    };
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    passwordInput.addEventListener("keypress", onKeyPress);
  });
}

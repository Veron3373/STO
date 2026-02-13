// src/ts/roboha/zakaz_naraudy/inhi/vikno_vvody_parolu.ts
import { showNotification } from "./vspluvauhe_povidomlenna";
import { reopenActAndClearSlyusars } from "./save_work";
import { refreshActsTable } from "../../tablucya/tablucya";
import {
  getSavedUserDataFromLocalStorage,
  saveUserDataToLocalStorage,
} from "../../tablucya/users"; // Додаємо імпорт для отримання та збереження даних поточного користувача

export const viknoVvodyParoluId = "vikno_vvody_parolu-modal-ActsOn";
/** Створення DOM елемента модалки */
export function createViknoVvodyParolu(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = viknoVvodyParoluId;
  overlay.className = "vikno_vvody_parolu-overlay-ActsOn";
  overlay.style.display = "none";
  const modal = document.createElement("div");
  modal.className =
    "vikno_vvody_parolu-content-ActsOn modal-content-save-ActsOn";
  modal.innerHTML = `
    <p>Введіть пароль для відкриття акту:</p>
    <input type="password" id="password-input-ActsOn" placeholder="Пароль" class="password-input-ActsOn" style="padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 8px; width: calc(100% - 20px);">
    <div class="vikno_vvody_parolu-buttons-ActsOn save-buttons-ActsOn">
      <button id="password-confirm-btn-ActsOn" class="btn-save-confirm-ActsOn">Підтвердити</button>
      <button id="password-cancel-btn-ActsOn" class="btn-save-cancel-ActsOn">Скасувати</button>
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
/** Функція для перевірки пароля поточного користувача */
async function verifyPassword(
  enteredPassword: string,
): Promise<{ isValid: boolean; slyusar_id: number | null }> {
  // Отримуємо дані поточного користувача з localStorage
  const currentUser = getSavedUserDataFromLocalStorage();

  if (!currentUser) {
    console.error(
      "❌ Не вдалося отримати дані поточного користувача з localStorage",
    );
    showNotification("❌ Помилка: користувач не авторизований", "error", 3000);
    return { isValid: false, slyusar_id: null };
  }

  // Отримуємо пароль поточного користувача
  const userPassword = currentUser.password;

  if (!userPassword) {
    console.error("❌ Пароль користувача не знайдено");
    showNotification(
      "❌ Помилка: пароль користувача не знайдено",
      "error",
      3000,
    );
    return { isValid: false, slyusar_id: null };
  }

  // Порівнюємо введений пароль з паролем з localStorage
  const enteredStr = enteredPassword.toString().trim();
  const userPasswordStr = userPassword.toString().trim();

  if (enteredStr === userPasswordStr) {
    return { isValid: true, slyusar_id: currentUser.slyusar_id };
  } else {
    return { isValid: false, slyusar_id: null };
  }
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
      "password-input-ActsOn",
    ) as HTMLInputElement | null;
    const confirmBtn = document.getElementById(
      "password-confirm-btn-ActsOn",
    ) as HTMLButtonElement | null;
    const cancelBtn = document.getElementById(
      "password-cancel-btn-ActsOn",
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
          2500,
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
        const { isValid, slyusar_id } = await verifyPassword(entered);

        if (isValid) {
          showNotification("Пароль вірний", "success", 800);

          // Зберігаємо slyusar_id в localStorage
          const currentUser = getSavedUserDataFromLocalStorage();
          if (currentUser && slyusar_id) {
            saveUserDataToLocalStorage(
              currentUser.name,
              currentUser.access,
              currentUser.password,
              slyusar_id,
            );
            console.log("✅ slyusar_id збережено в localStorage:", slyusar_id);
          }

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

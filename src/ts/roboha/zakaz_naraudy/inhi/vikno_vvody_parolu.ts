// src/ts/roboha/zakaz_naraudy/inhi/vikno_vvody_parolu.ts
import { showNotification } from "./vspluvauhe_povidomlenna";
import { reopenActAndClearSlyusars } from "./save_work";
import { refreshActsTable } from "../../tablucya/tablucya";
import {
  getSavedUserDataFromLocalStorage,
  saveUserDataToLocalStorage,
} from "../../tablucya/users";

export const viknoVvodyParoluId = "vikno_vvody_parolu-modal-ActsOn";

/** Створення DOM елемента модалки */
export function createViknoVvodyParolu(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = viknoVvodyParoluId;
  overlay.className = "login-modal";
  overlay.style.display = "none";

  const box = document.createElement("div");
  box.className = "login-modal-content";

  // Плаваюча іконка
  const icon = document.createElement("span");
  icon.className = "login-modal-icon";
  icon.id = "password-icon-ActsOn";
  icon.textContent = "🔓";

  const title = document.createElement("h3");
  title.className = "login-modal-title";
  title.id = "password-title-ActsOn";
  title.textContent = "Відкриття акту";

  const subtitle = document.createElement("p");
  subtitle.className = "login-modal-subtitle";
  subtitle.textContent = "Введіть пароль для підтвердження";

  const input = document.createElement("input");
  input.type = "password";
  input.id = "password-input-ActsOn";
  input.placeholder = "••••••••";
  input.className = "login-input";
  input.autocomplete = "current-password";

  const errorDiv = document.createElement("div");
  errorDiv.className = "login-error-message";
  errorDiv.id = "password-error-ActsOn";
  errorDiv.style.display = "none";

  const row = document.createElement("div");
  row.style.cssText =
    "display: flex; gap: 12px; justify-content: center; margin-top: 16px;";

  // Скасувати — ЗЛІВА
  const cancelBtn = document.createElement("button");
  cancelBtn.id = "password-cancel-btn-ActsOn";
  cancelBtn.textContent = "Скасувати";
  cancelBtn.className = "login-button";
  cancelBtn.style.cssText = `flex: 1; margin-top: 0; background: linear-gradient(135deg, #94a3b8 0%, #a1b0c4 100%); box-shadow: 0 3px 12px rgba(148,163,184,0.25), 0 1px 3px rgba(0,0,0,0.06);`;

  // Підтвердити — СПРАВА
  const confirmBtn = document.createElement("button");
  confirmBtn.id = "password-confirm-btn-ActsOn";
  confirmBtn.textContent = "Підтвердити";
  confirmBtn.className = "login-button";
  confirmBtn.style.cssText = `flex: 1; margin-top: 0;`;

  row.append(cancelBtn, confirmBtn);
  box.append(icon, title, subtitle, input, errorDiv, row);
  overlay.appendChild(box);
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
  const currentUser = getSavedUserDataFromLocalStorage();

  if (!currentUser) {
    console.error(
      "❌ Не вдалося отримати дані поточного користувача з localStorage",
    );
    showNotification("❌ Помилка: користувач не авторизований", "error", 3000);
    return { isValid: false, slyusar_id: null };
  }

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

  const enteredStr = enteredPassword.toString().trim();
  const userPasswordStr = userPassword.toString().trim();

  if (enteredStr === userPasswordStr) {
    return { isValid: true, slyusar_id: currentUser.slyusar_id };
  } else {
    return { isValid: false, slyusar_id: null };
  }
}

/** Shake-анімація помилки */
function showPasswordError(message: string) {
  const errorDiv = document.getElementById("password-error-ActsOn");
  const input = document.getElementById(
    "password-input-ActsOn",
  ) as HTMLInputElement | null;
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  }
  if (input) {
    input.classList.remove("input-error");
    void input.offsetWidth;
    input.classList.add("input-error");
    setTimeout(() => input.classList.remove("input-error"), 600);
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
    const errorDiv = document.getElementById("password-error-ActsOn");
    const icon = document.getElementById("password-icon-ActsOn");
    const title = document.getElementById("password-title-ActsOn");

    if (!passwordInput || !confirmBtn || !cancelBtn) {
      console.error("Елементи модалки пароля не знайдені");
      modal.style.display = "none";
      return resolve(false);
    }

    // Скидаємо стан до початкового
    passwordInput.value = "";
    passwordInput.classList.remove("input-error", "input-success");
    if (errorDiv) errorDiv.style.display = "none";
    if (icon) {
      icon.textContent = "🔓";
      icon.classList.remove("login-success-anim");
    }
    if (title) {
      title.textContent = "Відкриття акту";
      title.style.color = "";
    }
    confirmBtn.innerHTML = "Підтвердити";
    confirmBtn.style.background = "";
    confirmBtn.disabled = false;

    setTimeout(() => passwordInput.focus(), 100);

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
        confirmBtn.disabled = false;
      }
    };

    const onConfirm = async () => {
      const entered = passwordInput.value;

      confirmBtn.disabled = true;
      confirmBtn.textContent = "Перевіряємо...";

      try {
        const { isValid, slyusar_id } = await verifyPassword(entered);

        if (isValid) {
          // Анімація успіху
          if (icon) {
            icon.textContent = "✅";
            icon.classList.add("login-success-anim");
          }
          if (title) {
            title.textContent = "Підтверджено!";
            title.style.color = "#4ade80";
          }
          passwordInput.classList.add("input-success");
          confirmBtn.innerHTML = "✓ Успішно";
          confirmBtn.style.background =
            "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";

          // Зберігаємо slyusar_id в localStorage
          const currentUser = getSavedUserDataFromLocalStorage();
          if (currentUser && slyusar_id) {
            saveUserDataToLocalStorage(
              currentUser.name,
              currentUser.access,
              currentUser.password,
              slyusar_id,
            );
          }

          setTimeout(() => tryOpen(), 400);
        } else {
          showPasswordError("Невірний пароль");
          passwordInput.value = "";
          passwordInput.focus();
        }
      } catch (e) {
        console.error("Помилка при перевірці пароля:", e);
        showPasswordError("Помилка перевірки пароля");
      } finally {
        confirmBtn.disabled = false;
        if (confirmBtn.textContent === "Перевіряємо...") {
          confirmBtn.textContent = "Підтвердити";
        }
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

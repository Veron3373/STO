//src\ts\roboha\redahyvatu_klient_machuna\pidtverdutu_sberihannya_zakaz_naryad.ts
export const saveModalIdCreate = "save-prompt-modal-create";

import { getModalFormValues } from "./vikno_klient_machuna";
import { supabase } from "../../vxid/supabaseClient";
import { loadActsTable } from "../tablucya/tablucya";
import { modalOverlayId } from "./vikno_klient_machuna";

// Створення окремої модалки
export function createSaveModalCreate(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = saveModalIdCreate;
  overlay.className = "modal-create-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "modal-content-save";
  modal.innerHTML = `
    <p>Створити заказ наряд?</p>
    <div class="save-buttons">
      <button id="save-confirm-create" class="btn-save-confirm">Так</button>
      <button id="save-cancel-create" class="btn-save-cancel">Ні</button>
    </div>
  `;

  overlay.appendChild(modal);
  return overlay;
}

// Отримати поточну дату й час у форматі YYYY-MM-DD HH:mm:ss (локальний)
function getCurrentDateTimeLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Вспливаюче повідомлення
function showMessage(message: string, color: string) {
  const note = document.createElement("div");
  note.textContent = message;
  note.style.position = "fixed";
  note.style.bottom = "50%";
  note.style.left = "50%";
  note.style.transform = "translateX(-50%)";
  note.style.backgroundColor = color;
  note.style.color = "white";
  note.style.padding = "12px 24px";
  note.style.borderRadius = "8px";
  note.style.zIndex = "10001";
  note.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  note.style.fontSize = "16px";
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2500);
}

// Додавання запису до таблиці acts
async function createActInDatabase(
  clientId: number,
  carsId: number,
  reason: string = ""
): Promise<boolean> {
  try {
    const dateOn = getCurrentDateTimeLocal();

    const actData = {
      Фото: [],
      Деталі: [{ Сума: 0, Ціна: 0, Деталь: "", Магазин: "", Кількість: 0 }],
      Пробіг: 0,
      Роботи: [{ Сума: 0, Ціна: 0, Робота: "", Слюсар: "", Кількість: 0 }],
      "За деталі": 0,
      "За роботу": 0,
      Приймальник: "",
      Рекомендації: "",
      "Загальна сума": 0,
      "Причина звернення": reason,
      "Прибуток за деталі": 0,
      "Прибуток за роботу": 0,
    };
    const { error } = await supabase.from("acts").insert([
      {
        date_on: dateOn,
        client_id: clientId,
        cars_id: carsId,
        data: actData,
        avans: 0,
      },
    ]);

    if (error) {
      console.error("❌ Помилка: новий акт не створено", error.message);
      return false;
    }

    console.log("✅ Акт створено о", dateOn);
    return true;
  } catch (error: any) {
    console.error("❌ Помилка при створенні акту в Supabase:", error.message);
    return false;
  }
}

// Основна логіка створення заказ-наряду
export function showSaveModalCreate(): Promise<boolean> {
  return new Promise((resolve) => {
    let modal = document.getElementById(saveModalIdCreate) as HTMLDivElement | null;
    if (!modal) {
      modal = createSaveModalCreate();
      document.body.appendChild(modal);
    }

    modal.classList.add("active");
    modal.style.display = "flex";

    const confirmBtn = modal.querySelector("#save-confirm-create") as HTMLButtonElement;
    const cancelBtn = modal.querySelector("#save-cancel-create") as HTMLButtonElement;

    const cleanup = () => {
      modal!.classList.remove("active");
      modal!.style.display = "none";
      modal!.remove(); // створюємо свіжий екземпляр кожного разу
    };

    const onConfirm = async () => {
      try {
        const values = getModalFormValues();
        if (!values.client_id || !values.cars_id) {
          showMessage("❌ Не вистачає ID клієнта або авто", "#f44336");
          cleanup();
          return resolve(false);
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Створюємо...";

        let reason = "";
        const createActDataRaw = sessionStorage.getItem('createActData');
        if (createActDataRaw) {
          try {
            const parsed = JSON.parse(createActDataRaw);
            // Check if the current client matched the one for whom the comment was intended? 
            // For now assume yes as the user flow implies immediate creation.
            if (parsed.comment) reason = parsed.comment;
          } catch (e) { }
        }

        const success = await createActInDatabase(
          Number(values.client_id),
          Number(values.cars_id),
          reason
        );

        if (success) {
          sessionStorage.removeItem('createActData');
          showMessage("✅ Заказ наряд успішно створено", "#4caf50");
          cleanup();
          resolve(true);
          await loadActsTable();
          document.getElementById(modalOverlayId)?.remove();
        } else {
          showMessage("❌ Помилка при створенні заказ наряду", "#f44336");
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Так";
          resolve(false);
        }
      } catch (err: any) {
        console.error("🚨 Внутрішня помилка у onConfirm:", err?.message || err);
        showMessage("❌ Помилка при створенні заказ наряду", "#f44336");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Так";
        cleanup();
        resolve(false);
      }
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    // одноразові слухачі, щоб не плодити дублікати
    confirmBtn.addEventListener("click", onConfirm, { once: true });
    cancelBtn.addEventListener("click", onCancel, { once: true });
  });
}

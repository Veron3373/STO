export const savePromptModalId = "save-prompt-modal";
import { supabase } from "../../vxid/supabaseClient";
import { getModalFormValues, userConfirmation } from "./vikno_klient_machuna";

// Створює модальне вікно підтвердження збереження
export function createSavePromptModal(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = savePromptModalId;
  overlay.className = "modal-overlay-save";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "modal-content-save";
  modal.innerHTML = `
    <p>Зберегти зміни?</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>
  `;
  overlay.appendChild(modal);
  return overlay;
}

// Нормалізація імені для порівняння
function normalizeName(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Перевірка чи існує клієнт з таким ПІБ
async function checkClientExists(
  fullName: string,
  currentClientId?: string | null
): Promise<boolean> {
  try {
    const { data: clients, error } = await supabase
      .from("clients")
      .select("client_id, data");

    if (error) {
      console.error("❌ Помилка перевірки дублів:", error);
      return false;
    }

    const needle = normalizeName(fullName);
    for (const client of clients ?? []) {
      try {
        const data =
          typeof client.data === "string"
            ? JSON.parse(client.data)
            : client.data;
        const clientName = normalizeName(data?.ПІБ ?? "");

        // Якщо це той самий клієнт (редагування), пропускаємо
        if (currentClientId && client.client_id === currentClientId) {
          continue;
        }

        if (clientName && clientName === needle) {
          return true;
        }
      } catch {}
    }
    return false;
  } catch (error) {
    console.error("❌ Помилка при перевірці існування клієнта:", error);
    return false;
  }
}

// Показує модальне підтвердження з обіцянкою
export function showSavePromptModal(): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById(savePromptModalId);
    if (!modal) return resolve(false);

    modal.style.display = "flex";

    const confirmBtn = document.getElementById("save-confirm")!;
    const cancelBtn = document.getElementById("save-cancel")!;

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const showMessage = (message: string, color: string) => {
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
    };

    const onConfirm = async () => {
      // Перевіряємо на дублі ПІБ перед збереженням
      const values = getModalFormValues();

      // Якщо додаємо нового клієнта (userConfirmation === "yes")
      if (userConfirmation === "yes" && values.fullName) {
        const exists = await checkClientExists(values.fullName, null);
        if (exists) {
          showMessage(
            `⚠️ Клієнт "${values.fullName}" вже існує в базі`,
            "#ffc107"
          );
          // Не закриваємо модальне вікно, щоб користувач міг виправити
          return;
        }
      }

      cleanup();
      showMessage("✅ Дані успішно збережено", "#4caf50");
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      showMessage("✖ Скасовано користувачем", "#f44336");
      resolve(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// Видаляє авто з бази
async function deleteCarFromDatabase(carsId: string): Promise<void> {
  const { error } = await supabase.from("cars").delete().eq("cars_id", carsId);
  if (error) console.error("❌ Помилка видалення автомобіля:", error.message);
  else console.log("✅ Автомобіль успішно видалений");
}

// Додає авто до клієнта
async function addCarToDatabase(
  clientId: string,
  carData: any
): Promise<string | null> {
  const { data, error } = await supabase
    .from("cars")
    .insert({
      client_id: clientId,
      data: {
        Авто: carData.carModel,
        "Номер авто": carData.carNumber,
        Обʼєм: carData.engine,
        Пальне: carData.fuel,
        Vincode: carData.vin,
        Рік: carData.year,
        КодДВЗ: carData.carCode,
      },
    })
    .select("cars_id")
    .single();

  if (error) {
    console.error("❌ Помилка додавання автомобіля:", error.message);
    return null;
  } else {
    console.log("✅ Автомобіль успішно додано");
    return data?.cars_id || null;
  }
}

// Головна функція збереження (працює відповідно до ❌ ➕ 🔁)
export async function saveClientAndCarToDatabase(): Promise<{
  client_id: string | null;
  cars_id: string | null;
}> {
  const values = getModalFormValues();
  if (!values.fullName || !values.phone) {
    console.error("❌ Обов'язкові поля (ПІБ, Телефон) не заповнені");
    return { client_id: null, cars_id: null };
  }

  // ❌ Видалення автомобіля
  if (userConfirmation === "no" && values.cars_id) {
    await deleteCarFromDatabase(values.cars_id);
    return { client_id: values.client_id || null, cars_id: null };
  }

  // ➕ Створення нового автомобіля або зв'язування з існуючим клієнтом
  if (userConfirmation === "yes") {
    // Перевіряємо, чи існує клієнт із таким ПІБ
    const { data: existingClients, error: fetchError } = await supabase
      .from("clients")
      .select("client_id, data")
      .ilike("data->>ПІБ", `%${values.fullName.trim()}%`);

    if (fetchError) {
      console.error("❌ Помилка при пошуку клієнта:", fetchError.message);
      return { client_id: null, cars_id: null };
    }

    let finalClientId: string | null = null;
    let finalCarId: string | null = null;

    if (existingClients && existingClients.length > 0) {
      // Беремо першого співпадаючого клієнта
      const existingClient = existingClients[0];
      finalClientId = existingClient.client_id;
      finalCarId = await addCarToDatabase(finalClientId!, values);

      console.log(
        `✅ Автомобіль додано до існуючого клієнта (ID: ${finalClientId})`
      );
      return { client_id: finalClientId, cars_id: finalCarId };
    } else {
      // Якщо клієнта немає, створюємо нового
      const { data: insertedClient, error: insertClientError } = await supabase
        .from("clients")
        .insert({
          data: {
            ПІБ: values.fullName,
            Телефон: values.phone,
            Джерело: values.income,
            Додаткові: values.extra,
          },
        })
        .select("client_id")
        .single();

      if (insertClientError || !insertedClient?.client_id) {
        console.error(
          "❌ Не вдалося створити клієнта:",
          insertClientError?.message
        );
        return { client_id: null, cars_id: null };
      }

      finalClientId = insertedClient.client_id;
      finalCarId = await addCarToDatabase(finalClientId!, values);

      console.log(
        `✅ Створено нового клієнта (ID: ${finalClientId}) та додано автомобіль`
      );
      return { client_id: finalClientId, cars_id: finalCarId };
    }
  }

  // 🔁 Оновлення клієнта і автомобіля
  if (userConfirmation === null && values.client_id) {
    const { error: clientError } = await supabase
      .from("clients")
      .update({
        data: {
          ПІБ: values.fullName,
          Телефон: values.phone,
          Джерело: values.income,
          Додаткові: values.extra,
        },
      })
      .eq("client_id", values.client_id);

    if (clientError) {
      console.error("❌ Помилка оновлення клієнта:", clientError.message);
    } else {
      console.log("✅ Клієнт оновлений");
    }

    if (values.cars_id) {
      const { error: carError } = await supabase
        .from("cars")
        .update({
          data: {
            Авто: values.carModel,
            "Номер авто": values.carNumber,
            Обʼєм: values.engine,
            Пальне: values.fuel,
            Vincode: values.vin,
            Рік: values.year,
            КодДВЗ: values.carCode,
          },
        })
        .eq("cars_id", values.cars_id);

      if (carError) {
        console.error("❌ Помилка оновлення авто:", carError.message);
      } else {
        console.log("✅ Авто оновлено");
      }
    }
    return { client_id: values.client_id, cars_id: values.cars_id || null };
  }

  console.warn("⚠️ Незрозумілий стан або не вистачає ID. Дані не збережено.");
  return { client_id: null, cars_id: null };
}

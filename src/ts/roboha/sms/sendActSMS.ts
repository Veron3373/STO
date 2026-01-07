// src/ts/roboha/sms/sendActSMS.ts

import { supabase } from "../../vxid/supabaseClient";
import { sendSMS } from "./smsAPI";
import { generateSMSText } from "./smsConfig";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { showSmsConfirmModal } from "./vikno_sms_confirm";

/**
 * Відправка SMS при закритті акту
 * Перевіряє налаштування в таблиці settings (setting_id = 5)
 */
export async function sendActClosedSMS(
  actId: number,
  clientPhone: string,
  clientName: string,
  totalSum: number
): Promise<boolean> {
  try {
    // 1) Чи увімкнено SMS у settings (setting_id = 5)
    const { data: smsEnabledData } = await supabase
      .from("settings")
      .select("data")
      .eq("setting_id", 5)
      .maybeSingle();

    const smsEnabled =
      smsEnabledData?.data === true ||
      smsEnabledData?.data === "true" ||
      smsEnabledData?.data === 1;

    if (!smsEnabled) {
      console.log("ℹ️ SMS вимкнено в налаштуваннях (settings.setting_id = 5)");
      return false;
    }

    // 2) Якщо сума ≈ 0 — НЕ відправляємо SMS
    const sum = Number(totalSum);
    if (!Number.isFinite(sum) || Math.abs(sum) < 0.01) {
      console.log("ℹ️ totalSum = 0 => SMS не відправляємо");
      showNotification("ℹ️Сума = 0 грн. SMS не відправлено", "warning", 3000); // помаранчевим
      return false; // повертаємо false, щоб вище по коду знали: SMS не відправлялось
    }

    // 3) Формуємо повідомлення і відправляємо
    const message = generateSMSText(clientName, sum);

    showNotification("📤 Відправка SMS клієнту...", "info", 2000);

    const result = await sendSMS(clientPhone, message);

    if (result.success) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("acts")
        .update({ sms: now })
        .eq("act_id", actId);

      if (updateError) {
        console.error("❌ Помилка оновлення поля sms:", updateError);
        showNotification(
          "SMS відправлено, але не вдалося оновити дату в БД",
          "warning",
          3000
        );
        return true;
      }

      showNotification(`✅ SMS успішно відправлено на ${clientPhone}`, "success", 3000);
      return true;
    } else {
      showNotification(`❌ Помилка відправки SMS: ${result.error}`, "error", 4000);
      return false;
    }
  } catch (error: any) {
    console.error("💥 Критична помилка при відправці SMS:", error);
    showNotification(`❌ Критична помилка SMS: ${error.message}`, "error", 4000);
    return false;
  }
}

/**
 * Ручна відправка SMS при кліку на кнопку 📭/📨
 * Перевіряє налаштування в таблиці settings (setting_id = 4)
 */
export async function handleSmsButtonClick(actId: number): Promise<void> {
  try {
    // 1. Перевірка налаштування (setting_id = 4)
    const { data: settingData, error: settingError } = await supabase
      .from("settings")
      .select("data")
      .eq("setting_id", 4)
      .single();

    if (settingError) {
      console.error("Помилка перевірки налаштувань:", settingError);
      showNotification("Помилка перевірки налаштувань SMS", "error");
      return;
    }

    const isSmsEnabled =
      settingData?.data === true ||
      settingData?.data === "true" ||
      settingData?.data === 1;

    if (!isSmsEnabled) {
      showNotification("SMS відключені (див. Налаштування)", "warning");
      return;
    }

    // 2. Отримання даних про акт і клієнта
    const { data: act, error: actError } = await supabase
      .from("acts")
      .select("client_id, data")
      .eq("act_id", actId)
      .single();

    if (actError || !act) {
      showNotification("Не знайдено дані акту", "error");
      return;
    }

    const actData =
      typeof act.data === "string" ? JSON.parse(act.data) : act.data;
    const totalSum = actData?.["Загальна сума"] || 0;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("data")
      .eq("client_id", act.client_id)
      .single();

    if (clientError || !client) {
      showNotification("Не знайдено дані клієнта", "error");
      return;
    }

    const clientData =
      typeof client.data === "string" ? JSON.parse(client.data) : client.data;
    const clientPhone = clientData?.["Телефон"] || clientData?.phone || "";
    const clientName = clientData?.["ПІБ"] || clientData?.fio || "Клієнт";

    if (!clientPhone) {
      showNotification("У клієнта не вказано номер телефону", "warning");
      return;
    }

    // 3. Підтвердження відправки
    const confirmed = await showSmsConfirmModal(
      clientName,
      totalSum,
      clientPhone
    );

    if (!confirmed) {
      return;
    }

    // 4. Відправка
    showNotification("📤 Відправка SMS...", "info", 1500);
    const message = generateSMSText(clientName, totalSum);
    const result = await sendSMS(clientPhone, message);

    if (result.success) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("acts")
        .update({ sms: now })
        .eq("act_id", actId);

      if (updateError) {
        console.error("Помилка оновлення статусу SMS:", updateError);
      }

      showNotification(`✅ SMS успішно відправлено!`, "success", 3000);

      // Оновлюємо кнопку в інтерфейсі (якщо вона є)
      const btn = document.querySelector(`#sms-btn[data-act-id="${actId}"]`);
      if (btn) {
        btn.innerHTML = "📨";
        btn.setAttribute("title", now);
      }
    } else {
      showNotification(`❌ Помилка: ${result.error}`, "error", 4000);
    }

  } catch (error: any) {
    console.error("Помилка handleSmsButtonClick:", error);
    showNotification("Критична помилка при відправці SMS", "error");
  }
}

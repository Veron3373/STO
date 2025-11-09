// src/ts/roboha/sms/sendActSMS.ts

import { supabase } from "../../vxid/supabaseClient";
import { sendSMS } from "./smsAPI";
import { generateSMSText } from "./smsConfig";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

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

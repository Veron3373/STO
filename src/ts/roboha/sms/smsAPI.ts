// src/ts/roboha/sms/smsAPI.ts

import { formatPhoneForAPI } from "./smsConfig";
import { supabase } from "../../vxid/supabaseClient";

export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSMS(
  phone: string,
  message: string
): Promise<SMSSendResult> {
  try {
    const formattedPhone = formatPhoneForAPI(phone);

    if (!/^380\d{9}$/.test(formattedPhone)) {
      throw new Error(`Невірний формат номера: ${phone}`);
    }


    const { data, error } = await supabase.functions.invoke("smsclub-send", {
      body: { phone: formattedPhone, message },
    });

    // ← ДОДАНО: Детальне логування

    if (error) {
      console.error("❌ Помилка виклику Edge Function:", error);
      // ← ДОДАНО: Показуємо повну помилку
      return {
        success: false,
        error: `Edge Function error: ${JSON.stringify(error)}`,
      };
    }

    if (data?.success === false) {
      console.error("❌ Edge Function повернула помилку:", data.error);
      return {
        success: false,
        error: data.error || "Невідома помилка Edge Function",
      };
    }

    if (data?.result?.success_request) {
      return {
        success: true,
        messageId: data.result.success_request.id_sms?.[0],
      };
    }

    if (data?.result?.error_request) {
      console.error("❌ Помилка SMS API:", data.result.error_request);
      return {
        success: false,
        error: `SMS API: ${data.result.error_request.code} - ${data.result.error_request.info}`,
      };
    }

    console.error("⚠️ Неочікувана відповідь від API:", data);
    return {
      success: false,
      error: `Неочікувана відповідь: ${JSON.stringify(data)}`,
    };
  } catch (error: any) {
    console.error("💥 Критична помилка відправки SMS:", error);
    return {
      success: false,
      error: error.message || "Невідома помилка",
    };
  }
}

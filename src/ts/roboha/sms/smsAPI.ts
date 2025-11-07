// src/ts/roboha/sms/smsAPI.ts

import { getSMSConfig, formatPhoneForAPI } from "./smsConfig";

/**
 * Відповідь від SMS Club API
 */
interface SMSClubResponse {
  success_request?: {
    info: string;
    id_sms: string[];
  };
  error_request?: {
    code: string;
    info: string;
  };
}

/**
 * Результат відправки SMS
 */
export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Відправка SMS через SMS Club API
 */
export async function sendSMS(phone: string, message: string): Promise<SMSSendResult> {
  try {
    const config = await getSMSConfig();
    
    if (!config.token) {
      throw new Error("SMS токен не налаштовано");
    }

    const formattedPhone = formatPhoneForAPI(phone);
    
    // Валідація номера
    if (!/^380\d{9}$/.test(formattedPhone)) {
      throw new Error(`Невірний формат номера: ${phone}`);
    }

    // Формуємо запит до API
    const requestBody = {
      phone: [formattedPhone],
      message: message,
      src_addr: config.alphaName
    };

    console.log("📤 Відправка SMS:", { phone: formattedPhone, message });

    const response = await fetch("https://my.smsclub.mobi/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP помилка: ${response.status}`);
    }

    const result: SMSClubResponse = await response.json();

    if (result.success_request) {
      console.log("✅ SMS успішно відправлено:", result.success_request);
      return {
        success: true,
        messageId: result.success_request.id_sms[0]
      };
    }

    if (result.error_request) {
      console.error("❌ Помилка SMS API:", result.error_request);
      return {
        success: false,
        error: `${result.error_request.code}: ${result.error_request.info}`
      };
    }

    throw new Error("Невідома відповідь від API");

  } catch (error: any) {
    console.error("💥 Критична помилка відправки SMS:", error);
    return {
      success: false,
      error: error.message || "Невідома помилка"
    };
  }
}

/**
 * Перевірка статусу SMS (опціонально)
 */
export async function checkSMSStatus(messageId: string): Promise<string> {
  try {
    const config = await getSMSConfig();
    
    const response = await fetch(`https://my.smsclub.mobi/sms/status/${messageId}`, {
      headers: {
        "Authorization": `Bearer ${config.token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP помилка: ${response.status}`);
    }

    const result = await response.json();
    return result.status || "unknown";
  } catch (error: any) {
    console.error("❌ Помилка перевірки статусу SMS:", error);
    return "error";
  }
}
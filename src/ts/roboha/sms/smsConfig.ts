// src/ts/roboha/sms/smsConfig.ts

/**
 * Конфігурація SMS Club API
 */
export interface SMSConfig {
  token: string;
  alphaName: string;
}

/**
 * Отримання конфігурації з Supabase (таблиця sms, sms_id = 6)
 */
export async function getSMSConfig(): Promise<SMSConfig> {
  try {
    const { supabase } = await import("../../vxid/supabaseClient");
    
    const { data, error } = await supabase
      .from("sms")
      .select("data")
      .eq("sms_id", 6)
      .single();

    if (error) {
      console.error("Помилка завантаження налаштувань SMS:", error);
      throw error;
    }

    if (!data?.data) {
      throw new Error("Налаштування SMS не знайдено в базі даних");
    }

    const smsSettings = typeof data.data === "string" 
      ? JSON.parse(data.data) 
      : data.data;

    if (!smsSettings?.token) {
      throw new Error("SMS токен відсутній в налаштуваннях");
    }

    return {
      token: smsSettings.token,
      alphaName: smsSettings.alphaName || "REMONT"
    };
  } catch (err: any) {
    console.error("❌ Помилка завантаження SMS конфігурації:", err);
    throw new Error(`Не вдалося завантажити налаштування SMS: ${err.message}`);
  }
}

/**
 * Генерація тексту SMS повідомлення
 */
export function generateSMSText(actId: number, clientName: string, totalSum: number): string {
  return `Шановний(а) ${clientName}! Акт №${actId} закрито. Загальна сума: ${totalSum} грн. Дякуємо за довіру! B.S.Motorservice`;
}

/**
 * Форматування номера телефону для API (має бути у форматі 380XXXXXXXXX)
 */
export function formatPhoneForAPI(phone: string): string {
  // Видаляємо всі символи крім цифр
  let cleaned = phone.replace(/\D/g, "");
  
  // Якщо починається з 0 - замінюємо на 380
  if (cleaned.startsWith("0")) {
    cleaned = "380" + cleaned.substring(1);
  }
  
  // Якщо не починається з 380 - додаємо
  if (!cleaned.startsWith("380")) {
    cleaned = "380" + cleaned;
  }
  
  return cleaned;
}
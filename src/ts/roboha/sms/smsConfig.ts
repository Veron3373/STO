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

/* ===================== ІМ'Я У КЛИЧНОМУ ===================== */

/**
 * Дістає друге слово (ім’я) з ПІБ; якщо другого нема — перше.
 * Прибирає зайві пробіли та розділові.
 */
function extractFirstName(fullName: string): string {
  const cleaned = String(fullName || "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  const parts = cleaned.split(" ");
  const candidate = parts[1] ?? parts[0]; // 2-ге слово як ім'я, інакше 1-ше

  // зняти можливі лапки/дужки/дефіси на краях
  return candidate.replace(/^[("'–—\-]+|[)"'–—\-]+$/g, "");
}

/**
 * Дуже проста морфологія кличного для українських імен.
 * Покриває найтиповіші закінчення + словничок винятків.
 */
function toUAVocative(name: string): string {
  const n = String(name || "").trim();
  if (!n) return "";
  const low = n.toLowerCase();

  const dict: Record<string, string> = {
    "микола": "Миколо",
    "михайло": "Михайле",
    "ілья": "Ілле",
    "ілля": "Ілле",
    "любов": "Любове",
    "олег": "Олеже",
    "олеґ": "Олеже",
    "юрій": "Юрію",
    "андрій": "Андрію",
    "олексій": "Олексію",
    "сергій": "Сергію",
    "григорій": "Григорію",
    "олександр": "Олександре",
    "петро": "Петре",
    "дмитро": "Дмитре",
    "владислав": "Владиславе",
    "віктор": "Вікторе",
    "ігор": "Ігоре",
    "іван": "Іване",
    "алім": "Аліме",
    "марія": "Маріє",
    "наталія": "Наталіє",
    "ольга": "Ольго",
    "олена": "Олено",
  };
  if (dict[low]) return dict[low];

  // базові правила
  if (/[я]$/.test(low)) return n.slice(0, -1) + "є";   // Марія -> Маріє
  if (/[а]$/.test(low)) return n.slice(0, -1) + "о";   // Олена -> Олено
  if (/[й]$/.test(low)) return n.slice(0, -1) + "ю";   // Юрій -> Юрію
  if (/[о]$/.test(low)) return n.slice(0, -1) + "е";   // Петро -> Петре
  if (/[бвгґджзклмнпрстфхцчшщр]$/.test(low)) return n + "е"; // Віктор -> Вікторе

  return n; // як є
}

/* ===================== ГЕНЕРАЦІЯ ТЕКСТУ ===================== */

/**
 * Форматує суму: 600 -> "600", 600.5 -> "600.50" (без зайвих .00)
 */
function formatSum(sum: number): string {
  const n = Number(sum);
  if (!Number.isFinite(n)) return String(sum);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
}

/**
 * Генерація тексту SMS: тільки ім’я у кличному.
 * Приклад: "Аліме Ваше замовлення виконане. Сума: 600 грн. ..."
 */
export function generateSMSText(clientName: string, totalSum: number): string {
  const name = extractFirstName(clientName);
  const nameVoc = toUAVocative(name) || "Клієнте";
  return `${nameVoc} Ваше замовлення виконане. Сума: ${formatSum(totalSum)} грн. Дякуємо за довіру! Чекаємо на Вас в B.S.Motorservice!`;
}


/* ===================== ТЕЛЕФОН ===================== */

/**
 * Форматування номера телефону для API (має бути у форматі 380XXXXXXXXX)
 */
export function formatPhoneForAPI(phone: string): string {
  // Видаляємо всі символи крім цифр
  let cleaned = String(phone || "").replace(/\D/g, "");

  // Якщо починається з 0 - замінюємо на 380
  if (cleaned.startsWith("0")) cleaned = "380" + cleaned.substring(1);

  // Якщо не починається з 380 - додаємо
  if (!cleaned.startsWith("380")) cleaned = "380" + cleaned;

  return cleaned;
}

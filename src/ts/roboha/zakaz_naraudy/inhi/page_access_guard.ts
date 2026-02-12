// src/ts/roboha/zakaz_naraudy/inhi/page_access_guard.ts
/**
 * 🔐 Реал-тайм контроль доступу до сторінок
 * Перевіряє чи має користувач доступ до поточної сторінки
 * Якщо Адмін забрав доступ → редирект на main.html
 */

import { supabase } from "../../../vxid/supabaseClient";
import { userAccessLevel } from "../../tablucya/users";

/**
 * Мапа: сторінка → setting_id для кожної ролі
 * Бухгалтерія: Приймальник (4), Запчастист (2), Складовщик (немає прямого)
 * Планування: Приймальник (21), Слюсар (6), Запчастист (23), Складовщик (20)
 */
const PAGE_ACCESS_SETTINGS: Record<string, Record<string, number | null>> = {
  "bukhhalteriya.html": {
    Адміністратор: null, // завжди має доступ
    Приймальник: 4,
    Слюсар: null, // не має налаштування для бухгалтерії
    Запчастист: 2,
    Складовщик: null, // використовує інші налаштування (4,5,6,7,8)
  },
  "planyvannya.html": {
    Адміністратор: null, // завжди має доступ
    Приймальник: 21,
    Слюсар: 6,
    Запчастист: 23,
    Складовщик: 20,
  },
};

/**
 * Визначає поточну сторінку
 */
function getCurrentPageName(): string | null {
  const path = window.location.pathname;
  const filename = path.substring(path.lastIndexOf("/") + 1);
  return filename || null;
}

/**
 * Перевіряє чи має користувач доступ до поточної сторінки
 * @returns true - доступ дозволено, false - заборонено
 */
export async function checkCurrentPageAccess(): Promise<boolean> {
  const pageName = getCurrentPageName();
  
  // Якщо це не захищена сторінка - дозволяємо
  if (!pageName || !PAGE_ACCESS_SETTINGS[pageName]) {
    return true;
  }

  // Адміністратор завжди має доступ
  if (userAccessLevel === "Адміністратор") {
    return true;
  }

  // Перевіряємо чи роль існує в мапі
  const pageSettings = PAGE_ACCESS_SETTINGS[pageName];
  if (!pageSettings || !userAccessLevel) {
    return true;
  }

  const settingId = pageSettings[userAccessLevel];

  // Якщо для ролі немає налаштування - дозволяємо (стара логіка)
  if (settingId === null || settingId === undefined) {
    return true;
  }

  // Перевіряємо в БД
  try {
    const roleColumn = userAccessLevel; // "Приймальник", "Слюсар", "Запчастист", "Складовщик"
    
    if (!roleColumn) {
      return true;
    }
    
    const { data, error } = await supabase
      .from("settings")
      .select(`setting_id, "${roleColumn}"`)
      .eq("setting_id", settingId)
      .single();

    if (error) {
      console.error("❌ Помилка перевірки доступу:", error);
      return true; // На всяк випадок дозволяємо
    }

    const hasAccess = data && roleColumn in data ? !!(data as any)[roleColumn] : false;
    

    return hasAccess;
  } catch (err) {
    console.error("❌ Критична помилка перевірки:", err);
    return true; // Безпечно дозволяємо
  }
}

/**
 * Перевіряє доступ і редиректить якщо заборонено
 */
export async function enforcePageAccess(): Promise<void> {
  const hasAccess = await checkCurrentPageAccess();
  
  if (!hasAccess) {
    const pageName = getCurrentPageName();
    console.warn(`⛔ Доступ до ${pageName} для ${userAccessLevel} заборонено адміністратором`);
    
    alert(`⚠️ Адміністратор обмежив ваш доступ до цієї сторінки.\nВи будете перенаправлені на головну.`);
    
    // Редирект на main.html
    window.location.replace("main.html");
  }
}

/**
 * Отримати назву поточної сторінки (для тестування)
 */
export function getPageNameForDebug(): string | null {
  return getCurrentPageName();
}

// src/ts/roboha/zakaz_naraudy/inhi/slusar_notification_tracker.ts
// ============================================================================
// МОДУЛЬ ДЛЯ ЗАПИСУ PUSH-ПОВІДОМЛЕНЬ ПРО ЗАВЕРШЕННЯ РОБОТИ СЛЮСАРЕМ
// ============================================================================
// Призначення: Створювати повідомлення в slusar_complete_notifications,
//              коли Слюсар змінює slusarsOn на true/false
// ============================================================================

import { supabase } from "../../../vxid/supabaseClient";

/**
 * Записує повідомлення про завершення роботи Слюсарем
 *
 * @param actId - ID акту
 * @param actNumber - Номер акту (наприклад, "123")
 * @param slusarsOn - Нове значення (true = завершено, false = скасовано)
 * @param completedBySurname - Прізвище Слюсаря
 * @param completedByName - Повне ПІБ Слюсаря (опціонально)
 * @param pruimalnyk - ПІБ Приймальника з acts.pruimalnyk (для фільтрації)
 */
export async function recordSlusarCompletion(
  actId: number,
  actNumber: string,
  _slusarsOn: boolean,
  completedBySurname: string,
  completedByName?: string,
  pruimalnyk?: string
): Promise<void> {
  try {

    // Якщо slusarsOn = false (скасування), можна або не записувати,
    // або видаляти попередні повідомлення. Зараз записуємо завжди.

    const notificationData = {
      act_id: actId,
      act_number: actNumber,
      completed_by_surname: completedBySurname,
      completed_by_name: completedByName || null,
      pruimalnyk: pruimalnyk || null,
      viewed: false,
      delit: false,
      data: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("slusar_complete_notifications")
      .insert([notificationData]);

    if (error) {
      console.error(
        "❌ [SlusarNotification] Помилка запису повідомлення:",
        error
      );
      throw new Error(`Не вдалося записати повідомлення: ${error.message}`);
    }

  } catch (error) {
    console.error("❌ [SlusarNotification] Критична помилка:", error);
    throw error;
  }
}

/**
 * Видаляє (ховає) всі повідомлення для конкретного акту
 * Використовується при закритті акту (date_off != null)
 *
 * @param actId - ID акту
 */
export async function hideSlusarNotificationsForAct(
  actId: number
): Promise<void> {
  try {

    const { error } = await supabase
      .from("slusar_complete_notifications")
      .update({ delit: true })
      .eq("act_id", actId)
      .eq("delit", false); // Оновлюємо тільки ті, що ще не приховані

    if (error) {
      console.error(
        "❌ [SlusarNotification] Помилка приховування повідомлень:",
        error
      );
      // Не кидаємо помилку, бо це допоміжна операція
      return;
    }

  } catch (error) {
    console.error("❌ [SlusarNotification] Критична помилка:", error);
  }
}

/**
 * Отримує кількість непереглянутих повідомлень для поточного користувача
 *
 * @param userAccessLevel - Рівень доступу ("Адміністратор" / "Приймальник")
 * @param userName - ПІБ користувача (для Приймальника)
 * @returns Кількість непереглянутих повідомлень
 */
export async function getUnviewedSlusarNotificationsCount(
  userAccessLevel: string,
  userName?: string
): Promise<number> {
  try {
    let query = supabase
      .from("slusar_complete_notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("delit", false)
      .eq("viewed", false);

    // Фільтрація для Приймальника
    if (userAccessLevel === "Приймальник" && userName) {
      query = query.eq("pruimalnyk", userName);
    }

    const { count, error } = await query;

    if (error) {
      console.error(
        "❌ [SlusarNotification] Помилка підрахунку повідомлень:",
        error
      );
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error("❌ [SlusarNotification] Критична помилка:", error);
    return 0;
  }
}

/**
 * Позначає повідомлення як переглянуте
 *
 * @param notificationId - ID повідомлення
 */
export async function markSlusarNotificationAsViewed(
  notificationId: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from("slusar_complete_notifications")
      .update({ viewed: true })
      .eq("notification_id", notificationId);

    if (error) {
      console.error(
        "❌ [SlusarNotification] Помилка оновлення статусу:",
        error
      );
    }
  } catch (error) {
    console.error("❌ [SlusarNotification] Критична помилка:", error);
  }
}

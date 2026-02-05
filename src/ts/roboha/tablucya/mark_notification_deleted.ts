// ===== ФАЙЛ: src/ts/roboha/tablucya/mark_notification_deleted.ts =====

import { supabase } from "../../vxid/supabaseClient";
import type { ActNotificationPayload } from "./povidomlennya_tablucya";
import { userAccessLevel, getSavedUserDataFromLocalStorage } from "./users"; // ✅ Додано для перевірки ролі

/**
 * Позначає повідомлення як видалене в БД (встановлює delit = TRUE)
 * ЛОГІКА: Видалення дозволено ТІЛЬКИ Приймальнику, чий ПІБ = pruimalnyk
 * Адміністратор НЕ може видаляти записи!
 * @param notificationId - ID повідомлення з таблиці act_changes_notifications
 * @returns true якщо успішно, false якщо помилка або немає прав
 */
export async function markNotificationAsDeleted(
  notificationId: number
): Promise<boolean> {
  try {
    // ⚠️ КРИТИЧНО: Тільки Приймальник може видаляти записи
    if (userAccessLevel !== "Приймальник") {
      console.log(
        `⏭️ [markNotificationAsDeleted] ${userAccessLevel} не може видаляти записи - тільки Приймальник`
      );
      return false;
    }

    // Отримуємо ПІБ поточного Приймальника
    const userData = getSavedUserDataFromLocalStorage?.();
    const currentUserName = userData?.name;

    if (!currentUserName) {
      console.warn("⚠️ Не вдалося отримати ПІБ поточного користувача");
      return false;
    }

    console.log(
      `🗑️ Позначаємо повідомлення ${notificationId} як видалене (Приймальник: ${currentUserName})...`
    );

    // Спочатку перевіряємо, чи це повідомлення належить цьому Приймальнику
    const { data: notificationData, error: fetchError } = await supabase
      .from("act_changes_notifications")
      .select("pruimalnyk")
      .eq("notification_id", notificationId)
      .single();

    if (fetchError) {
      console.error("❌ Помилка отримання повідомлення:", fetchError);
      return false;
    }

    if (notificationData?.pruimalnyk !== currentUserName) {
      console.log(
        `⏭️ Повідомлення ${notificationId} не належить приймальнику ${currentUserName} (pruimalnyk: ${notificationData?.pruimalnyk})`
      );
      return false;
    }

    // Видаляємо тільки якщо pruimalnyk = ПІБ поточного Приймальника
    const { error } = await supabase
      .from("act_changes_notifications")
      .update({ delit: true }) // TRUE = видалене, не показувати
      .eq("notification_id", notificationId)
      .eq("pruimalnyk", currentUserName); // ✅ Додатковий захист

    if (error) {
      console.error(
        "❌ Помилка при позначенні повідомлення як видаленого:",
        error
      );
      return false;
    }

    console.log(
      `✅ Повідомлення ${notificationId} позначено як видалене (Приймальник: ${currentUserName})`
    );
    return true;
  } catch (err) {
    console.error("❌ Виняток при позначенні повідомлення:", err);
    return false;
  }
}

/**
 * Завантажує всі НЕвидалені повідомлення з БД (delit = FALSE)
 * і повертає їх у форматі ActNotificationPayload
 */
export async function loadUnseenNotifications(): Promise<
  ActNotificationPayload[]
> {
  try {
    console.log(
      "📥 Завантажуємо невидалені (delit = FALSE) повідомлення з БД..."
    );

    // ✅ Для Адміністратора - всі повідомлення
    if (userAccessLevel === "Адміністратор") {
      const { data, error } = await supabase
        .from("act_changes_notifications")
        .select("*")
        .eq("delit", false) // ✅ беремо тільки рядки, де delit = FALSE
        .order("data", { ascending: true }); // ✅ у тебе колонка часу називається data

      if (error) {
        console.error("❌ Помилка при завантаженні повідомлень:", error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log("ℹ️ Невидалених повідомлень не знайдено");
        return [];
      }

      console.log(
        `✅ Завантажено ${data.length} невидалених повідомлень (Адміністратор)`
      );

      // Конвертуємо дані з БД в формат ActNotificationPayload
      return data.map((row: any) => ({
        act_id: row.act_id,
        notification_id: row.notification_id,
        changed_by_surname: row.changed_by_surname || "Невідомо",
        item_name: row.item_name || "",
        dodav_vudaluv: row.dodav_vudaluv ?? true,
        created_at: row.data ?? row.created_at,
        pib: row.pib, // ✅ ПІБ
        auto: row.auto, // ✅ Авто
        pruimalnyk: row.pruimalnyk, // ✅ Приймальник
      }));
    }

    // ✅ Для Приймальника - фільтруємо по pruimalnyk
    if (userAccessLevel === "Приймальник") {
      // Отримуємо ПІБ поточного користувача через функцію
      const userData = getSavedUserDataFromLocalStorage();
      const currentUserName = userData?.name || null;

      if (!currentUserName) {
        console.warn("⚠️ Не вдалося отримати ПІБ поточного користувача");
        return [];
      }

      console.log(
        `📋 Фільтруємо повідомлення для приймальника: "${currentUserName}"`
      );

      const { data, error } = await supabase
        .from("act_changes_notifications")
        .select("*")
        .eq("delit", false)
        .eq("pruimalnyk", currentUserName) // ✅ Фільтр по приймальнику
        .order("data", { ascending: true });

      if (error) {
        console.error("❌ Помилка при завантаженні повідомлень:", error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log(`ℹ️ Повідомлень для ${currentUserName} не знайдено`);
        return [];
      }

      console.log(
        `✅ Завантажено ${data.length} повідомлень для ${currentUserName}`
      );

      // Конвертуємо дані з БД в формат ActNotificationPayload
      return data.map((row: any) => ({
        act_id: row.act_id,
        notification_id: row.notification_id,
        changed_by_surname: row.changed_by_surname || "Невідомо",
        item_name: row.item_name || "",
        dodav_vudaluv: row.dodav_vudaluv ?? true,
        created_at: row.data ?? row.created_at,
        pib: row.pib, // ✅ ПІБ
        auto: row.auto, // ✅ Авто
        pruimalnyk: row.pruimalnyk, // ✅ Приймальник
      }));
    }

    // ✅ Для інших ролей - немає повідомлень
    return [];
  } catch (err) {
    console.error("❌ Виняток при завантаженні повідомлень:", err);
    return [];
  }
}

/**
 * Видаляє всі повідомлення для конкретного акту при його закритті
 * Встановлює delit = TRUE для всіх записів з даним act_id
 *
 * @param actId - ID акту, для якого видаляємо повідомлення
 * @returns true якщо успішно, false якщо помилка
 */
export async function deleteActNotificationsOnClose(
  actId: number
): Promise<boolean> {
  try {
    console.log(
      `🗑️ [deleteActNotificationsOnClose] Позначаємо всі повідомлення для акту #${actId} як видалені (delit=true)...`
    );

    const { error, count } = await supabase
      .from("act_changes_notifications")
      .update({ delit: true })
      .eq("act_id", actId)
      .eq("delit", false); // тільки ті, що ще не помічені як видалені

    if (error) {
      console.error(
        `❌ [deleteActNotificationsOnClose] Помилка видалення повідомлень для акту #${actId}:`,
        error.message,
        error
      );
      return false;
    }

    console.log(
      `✅ [deleteActNotificationsOnClose] Повідомлення для акту #${actId} успішно позначені як видалені (count: ${count ?? 'N/A'})`
    );
    return true;
  } catch (err: any) {
    console.error(
      `❌ [deleteActNotificationsOnClose] Виняток при видаленні повідомлень для акту #${actId}:`,
      err?.message || err
    );
    return false;
  }
}

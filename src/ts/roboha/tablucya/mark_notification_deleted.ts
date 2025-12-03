// ===== ФАЙЛ: src/ts/roboha/tablucya/mark_notification_deleted.ts =====

import { supabase } from "../../vxid/supabaseClient";
import type { ActNotificationPayload } from "./povidomlennya_tablucya";

/**
 * Позначає повідомлення як видалене в БД (встановлює delit = TRUE)
 * @param notificationId - ID повідомлення з таблиці act_changes_notifications
 * @returns true якщо успішно, false якщо помилка
 */
export async function markNotificationAsDeleted(
    notificationId: number
): Promise<boolean> {
    try {
        console.log(`🗑️ Позначаємо повідомлення ${notificationId} як видалене...`);

        const { error } = await supabase
            .from("act_changes_notifications")
            .update({ delit: true }) // TRUE = видалене, не показувати
            .eq("notification_id", notificationId);

        if (error) {
            console.error("❌ Помилка при позначенні повідомлення як видаленого:", error);
            return false;
        }

        console.log(`✅ Повідомлення ${notificationId} позначено як видалене`);
        return true;
    } catch (err) {
        console.error("❌ Виняток при позначенні повідомлення:", err);
        return false;
    }
}

/**
 * Завантажує всі невидалені повідомлення з БД (delit = FALSE)
 * @returns Масив повідомлень або пустий масив при помилці
 */
export async function loadUnseenNotifications(): Promise<ActNotificationPayload[]> {
    try {
        console.log("📥 Завантажуємо невидалені повідомлення з БД...");

        // Вибираємо записи де delit = FALSE або delit = NULL (невидалені, показувати)
        // При кліку встановлюється delit = TRUE (видалене, не показувати)
        const { data, error } = await supabase
            .from("act_changes_notifications")
            .select("*")
            .or("delit.is.null,delit.eq.false") // NULL або FALSE = показувати
            .order("created_at", { ascending: true }); // від старіших до новіших

        if (error) {
            console.error("❌ Помилка при завантаженні повідомлень:", error);
            return [];
        }

        if (!data || data.length === 0) {
            console.log("ℹ️ Невидалених повідомлень не знайдено");
            return [];
        }

        console.log(`✅ Завантажено ${data.length} невидалених повідомлень`);

        // Конвертуємо дані з БД в формат ActNotificationPayload
        return data.map((row: any) => ({
            act_id: row.act_id,
            notification_id: row.notification_id,
            changed_by_surname: row.changed_by_surname || "Невідомо",
            item_name: row.item_name || "",
            dodav_vudaluv: row.dodav_vudaluv ?? true,
            created_at: row.created_at,
        }));
    } catch (err) {
        console.error("❌ Виняток при завантаженні повідомлень:", err);
        return [];
    }
}

// ===== ФАЙЛ: src/ts/roboha/zakaz_naraudy/inhi/act_realtime_subscription.ts =====

import { supabase } from "../../../vxid/supabaseClient";
import {
  showRealtimeActNotification,
  removeRealtimeNotification,
  loadAndShowExistingNotifications,
} from "../../tablucya/povidomlennya_tablucya";

let subscriptionChannel: any = null;

// 🔁 Фолбек: синхронізуємо DOM з реальною БД (видаляємо тости, яких вже немає в БД)
async function syncNotificationsWithDatabaseAfterDelete() {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;

  const toastElements = Array.from(
    container.querySelectorAll<HTMLElement>(".act-notification-toast")
  );
  if (!toastElements.length) return;

  // Унікальні notification_id з DOM
  const notificationIds = toastElements
    .map((t) => Number(t.getAttribute("data-id")))
    .filter((id) => !Number.isNaN(id));

  if (!notificationIds.length) return;

  const { data, error } = await supabase
    .from("act_changes_notifications")
    .select("notification_id")
    .in("notification_id", notificationIds)
    .eq("delit", false);

  if (error) {
    console.error("❌ Помилка при перевірці нотифікацій:", error);
    return;
  }

  const aliveNotificationIds = new Set<number>(
    (data || []).map((row: any) => row.notification_id)
  );

  // Для тих notification_id, яких вже немає в таблиці або delit=true, видаляємо тост
  notificationIds.forEach((notificationId) => {
    if (!aliveNotificationIds.has(notificationId)) {
      removeRealtimeNotification(notificationId);
    }
  });
}

export async function initActChangesSubscription(): Promise<void> {
  console.log("🔔 Ініціалізація Realtime підписки...");

  if (subscriptionChannel) {
    subscriptionChannel.unsubscribe();
  }

  subscriptionChannel = supabase
    .channel("act-changes")
    // INSERT → показати нове повідомлення
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "act_changes_notifications",
      },
      (payload) => {
        showRealtimeActNotification(payload.new as any);
      }
    )
    // DELETE → прибрати повідомлення
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "act_changes_notifications",
      },
      async (payload) => {
        console.log("🗑️ Отримано DELETE:", payload);

        const oldRow: any = payload.old || {};
        const deletedId: number | undefined =
          oldRow.notification_id ?? oldRow.id;

        if (deletedId != null) {
          // Є ID рядка → видаляємо тільки один конкретний тост
          console.log(`✅ DELETE з notification_id=${deletedId} → чистимо один тост.`);
          removeRealtimeNotification(deletedId);
        } else {
          // Нічого корисного в payload.old (типова історія без REPLICA IDENTITY FULL)
          console.warn(
            "⚠️ DELETE без notification_id → запускаємо синхронізацію з БД."
          );
          await syncNotificationsWithDatabaseAfterDelete();
        }
      }
    )
    .subscribe();

  // 📥 Завантажуємо існуючі повідомлення після підписки
  console.log("📥 Завантажуємо існуючі невидалені повідомлення...");
  await loadAndShowExistingNotifications();
}

export function unsubscribeFromActChanges(): void {
  if (subscriptionChannel) {
    subscriptionChannel.unsubscribe();
    subscriptionChannel = null;
  }
}


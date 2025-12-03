// ===== ФАЙЛ: src/ts/roboha/zakaz_naraudy/inhi/act_realtime_subscription.ts =====

import { supabase } from "../../../vxid/supabaseClient";
import {
  showRealtimeActNotification,
  removeNotificationsForAct,
  removeRealtimeNotification,
  loadAndShowExistingNotifications,
} from "../../tablucya/povidomlennya_tablucya";

let subscriptionChannel: any = null;

// 🔁 Фолбек: синхронізуємо DOM з реальною БД
async function syncNotificationsWithDatabaseAfterDelete() {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;

  const toastElements = Array.from(
    container.querySelectorAll<HTMLElement>(".act-notification-toast")
  );
  if (!toastElements.length) return;

  // Унікальні act_id з DOM
  const actIds = Array.from(
    new Set(
      toastElements
        .map((t) => Number(t.getAttribute("data-act-id")))
        .filter((id) => !Number.isNaN(id))
    )
  );

  if (!actIds.length) return;

  const { data, error } = await supabase
    .from("act_changes_notifications")
    .select("act_id")
    .in("act_id", actIds);

  if (error) {
    console.error("❌ Помилка при перевірці нотифікацій:", error);
    return;
  }

  const aliveActIds = new Set<number>((data || []).map((row: any) => row.act_id));

  // Для тих актів, яких вже немає в таблиці, чистимо всі тости
  actIds.forEach((actId) => {
    if (!aliveActIds.has(actId)) {
      removeNotificationsForAct(actId);
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
        const actId: number | undefined = oldRow.act_id;
        const deletedId: number | undefined =
          oldRow.notification_id ?? oldRow.id;

        if (actId != null) {
          // База дала act_id → видаляємо всі тости по цьому акту
          console.log(`✅ DELETE з act_id=${actId} → чистимо всі тости для акту.`);
          removeNotificationsForAct(actId);
        } else if (deletedId != null) {
          // Є тільки ID рядка → видаляємо один тост
          console.log(`✅ DELETE з notification_id=${deletedId} → чистимо один тост.`);
          removeRealtimeNotification(deletedId);
        } else {
          // Нічого корисного в payload.old (типова історія без REPLICA IDENTITY FULL)
          console.warn(
            "⚠️ DELETE без act_id та notification_id → запускаємо синхронізацію з БД."
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


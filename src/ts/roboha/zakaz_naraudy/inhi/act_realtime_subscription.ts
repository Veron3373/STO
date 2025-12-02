// ===== ФАЙЛ: src/ts/roboha/zakaz_naraudy/inhi/act_realtime_subscription.ts =====

import { supabase } from "../../../vxid/supabaseClient";
import { 
  showRealtimeActNotification, 
  removeNotificationsForAct,   
  removeRealtimeNotification
} from "../../tablucya/povidomlennya_tablucya"; 

let subscriptionChannel: any = null;

export function initActChangesSubscription(): void {
  console.log("🔔 Ініціалізація Realtime підписки...");

  if (subscriptionChannel) {
    subscriptionChannel.unsubscribe();
  }

  subscriptionChannel = supabase
    .channel("act-changes")

    // 1) Нові повідомлення по акту
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

    // 2) Видалення записів із основної таблиці
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "act_changes_notifications",
      },
      (payload) => {
        console.log("🗑️ DELETE з act_changes_notifications:", payload);

        const oldRow: any = payload.old || {};
        const actId: number | undefined = oldRow.act_id;
        const notifId: number | undefined =
          oldRow.notification_id ?? oldRow.id;

        if (actId != null) {
          // Якщо Realtime віддає act_id (REPLICA IDENTITY FULL) –
          // просто чистимо всі тости цього акту
          console.log(`✅ DELETE: очищаємо тости для Акту №${actId}`);
          removeNotificationsForAct(actId);
        } else if (notifId != null) {
          // fallback: видаляємо хоча б один конкретний тост
          console.log(`⚠️ DELETE без act_id, видаляємо тост id=${notifId}`);
          removeRealtimeNotification(notifId);
        } else {
          console.log("⚠️ DELETE без act_id і notification_id");
        }
      }
    )

    // 3) Перенесення в duplicate = акт відкрили і «прочитали» зміни
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "act_changes_notifications_duplicate",
      },
      (payload) => {
        const newRow: any = payload.new || {};
        const actId: number | undefined = newRow.act_id;

        if (actId != null) {
          console.log(
            `♻️ INSERT в act_changes_notifications_duplicate: Акт №${actId} відкритий, чистимо тости`
          );
          removeNotificationsForAct(actId);
        } else {
          console.log(
            "⚠️ INSERT в duplicate без act_id – нема що чистити на фронті"
          );
        }
      }
    )

    .subscribe();
}

export function unsubscribeFromActChanges(): void {
  if (subscriptionChannel) {
    subscriptionChannel.unsubscribe();
    subscriptionChannel = null;
  }
}

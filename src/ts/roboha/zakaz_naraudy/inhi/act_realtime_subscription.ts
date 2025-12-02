// ===== ФАЙЛ: src/ts/roboha/zakaz_naraudy/inhi/act_realtime_subscription.ts =====

import { supabase } from "../../../vxid/supabaseClient";
// Переконайся, що шлях правильний до файлу UI
import { 
  showRealtimeActNotification, 
  removeNotificationsForAct,   // <--- Імпортуємо нову функцію
  removeRealtimeNotification
} from "../../tablucya/povidomlennya_tablucya"; 

let subscriptionChannel: any = null;

export function initActChangesSubscription(): void {
    console.log('🔔 Ініціалізація Realtime підписки (INSERT + DELETE)...');

    if (subscriptionChannel) {
        subscriptionChannel.unsubscribe();
    }

    subscriptionChannel = supabase
        .channel('act-changes')
        .on(
            'postgres_changes',
            {
                event: '*', 
                schema: 'public',
                table: 'act_changes_notifications',
            },
            (payload) => {
                // 1. INSERT: Просто показуємо
                if (payload.eventType === 'INSERT') {
                    showRealtimeActNotification(payload.new as any);
                }

                // 2. DELETE: "Розумне" видалення
                if (payload.eventType === 'DELETE') {
                    // Отримуємо ID видаленого рядка
                    const deletedId = payload.old.id || payload.old.notification_id;
                    
                    if (deletedId) {
                        // ⚡ Спробуємо знайти цей елемент на екрані, поки він ще є
                        const container = document.getElementById("act-realtime-container");
                        const toast = container?.querySelector(`[data-id="${deletedId}"]`);

                        if (toast) {
                             // Отримуємо ID акту з атрибута елемента
                             const actIdAttr = toast.getAttribute('data-act-id');
                             
                             if (actIdAttr) {
                                 const actId = Number(actIdAttr);
                                 console.log(`🗑️ Видалення запису ID:${deletedId} спричинило очистку для Акту №${actId}`);
                                 
                                 // ✅ Видаляємо ВСІ повідомлення для цього акту
                                 removeNotificationsForAct(actId); 
                             } else {
                                 // Якщо атрибута немає (старий код), видаляємо точково
                                 removeRealtimeNotification(deletedId);
                             }
                        } else {
                            // Якщо елемента вже немає на екрані (або ми його не знайшли), 
                            // про всяк випадок пробуємо викликати точкове видалення
                             removeRealtimeNotification(deletedId);
                        }
                    }
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Підписка активна');
            }
        });
}

export function unsubscribeFromActChanges(): void {
    if (subscriptionChannel) {
        subscriptionChannel.unsubscribe();
        subscriptionChannel = null;
    }
}
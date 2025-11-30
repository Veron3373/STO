// src/ts/roboha/zakaz_naraudy/inhi/act_realtime_subscription.ts

import { supabase } from "../../../vxid/supabaseClient";
import { showActChangeNotification } from "./act_notifications";

interface ActChangeNotification {
    notification_id: number;
    act_id: number;
    act_number: string;
    change_type: 'added' | 'deleted';
    item_type: 'work' | 'detail';
    item_name: string;
    changed_by_surname: string;
    changed_at: string;
    viewed: boolean;
}

let subscriptionChannel: any = null;

/**
 * Ініціалізує Realtime підписку для Адміністратора
 * Коли Слюсар додає/видаляє дані, Адміністратор миттєво отримує сповіщення
 */
export function initActChangesSubscription(): void {
    console.log('🔔 Ініціалізація Realtime підписки для сповіщень про зміни актів...');

    // Якщо вже є активна підписка - закриваємо її
    if (subscriptionChannel) {
        subscriptionChannel.unsubscribe();
    }

    // Створюємо новий канал
    subscriptionChannel = supabase
        .channel('act-changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'act_changes_notifications',
            },
            (payload) => {
                console.log('📬 Отримано нову зміну в акті:', payload);

                const newChange = payload.new as ActChangeNotification;

                // Показуємо повідомлення
                showActChangeNotification([newChange]);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Підписка на зміни актів активна!');
            } else if (status === 'CLOSED') {
                console.log('❌ Підписка закрита');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ Помилка підписки на зміни актів');
            }
        });
}

/**
 * Відписується від сповіщень
 */
export function unsubscribeFromActChanges(): void {
    if (subscriptionChannel) {
        subscriptionChannel.unsubscribe();
        subscriptionChannel = null;
        console.log('🔕 Відписка від сповіщень про зміни актів');
    }
}

/**
 * Отримує всі непереглянуті зміни з бази даних
 * Використовується при завантаженні сторінки, щоб показати попередні зміни
 */
export async function fetchUnviewedActChanges(): Promise<ActChangeNotification[]> {
    const { data, error } = await supabase
        .from('act_changes_notifications')
        .select('*')
        .eq('viewed', false)
        .order('changed_at', { ascending: false });

    if (error) {
        console.error('❌ Помилка отримання непереглянутих змін:', error);
        return [];
    }

    return data || [];
}

/**
 * Позначає всі зміни для акту як переглянуті
 */
export async function markActChangesAsViewed(actId: number): Promise<void> {
    const { error } = await supabase
        .from('act_changes_notifications')
        .update({ viewed: true })
        .eq('act_id', actId);

    if (error) {
        console.error('❌ Помилка позначення змін як переглянутих:', error);
        throw error;
    }

    console.log(`✅ Зміни для акту #${actId} позначено як переглянуті`);
}

/**
 * Видаляє всі переглянуті зміни для акту
 */
export async function deleteViewedActChanges(actId: number): Promise<void> {
    const { error } = await supabase
        .from('act_changes_notifications')
        .delete()
        .eq('act_id', actId)
        .eq('viewed', true);

    if (error) {
        console.error('❌ Помилка видалення переглянутих змін:', error);
        throw error;
    }

    console.log(`🗑️ Переглянуті зміни для акту #${actId} видалено`);
}

// Модуль для блокування акту через Supabase Realtime Presence API
// БЕЗ запису в базу даних - все в реальному часі!
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "./inhi/vspluvauhe_povidomlenna";
import { userName as currentUserName } from "../tablucya/users";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Зберігаємо канал для можливості очищення
let presenceChannel: RealtimeChannel | null = null;
let currentActId: number | null = null;

// Список користувачів які зараз мають відкритий акт
let activeUsers: Map<string, { userName: string; joinedAt: string }> = new Map();

/**
 * Встановлює Presence для акту - приєднується до каналу та відстежує інших користувачів
 * @param actId - ID акту
 * @returns true якщо успішно приєднався, false якщо акт вже відкритий іншим користувачем
 */
export async function joinActPresence(actId: number): Promise<{ success: boolean; lockedBy?: string }> {
    try {
        currentActId = actId;

        // Очищаємо попередній канал якщо є
        await leaveActPresence();

        console.log(`📡 Приєднання до Presence каналу для акту ${actId}`);

        // Створюємо унікальний канал для цього акту
        presenceChannel = supabase.channel(`act_presence_${actId}`, {
            config: {
                presence: {
                    key: currentUserName || "unknown", // Унікальний ключ для кожного користувача
                },
            },
        });

        // Підписуємось на зміни presence
        presenceChannel
            .on("presence", { event: "sync" }, () => {
                const state = presenceChannel!.presenceState();
                console.log("🔄 Presence sync:", state);

                // Оновлюємо список активних користувачів
                activeUsers.clear();
                Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
                    if (presences && presences.length > 0) {
                        const presence = presences[0];
                        activeUsers.set(key, {
                            userName: presence.userName,
                            joinedAt: presence.joinedAt,
                        });
                    }
                });

                console.log("👥 Активні користувачі:", Array.from(activeUsers.keys()));
                updateUIBasedOnPresence();
            })
            .on("presence", { event: "join" }, ({ key, newPresences }) => {
                console.log(`👋 Користувач приєднався: ${key}`, newPresences);
            })
            .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
                console.log(`👋 Користувач вийшов: ${key}`, leftPresences);
            });

        // Підписуємось на канал
        await presenceChannel.subscribe(async (status) => {
            console.log(`📡 Статус підписки act_presence_${actId}:`, status);

            if (status === "SUBSCRIBED") {
                // Відправляємо свій presence
                const presenceStatus = await presenceChannel!.track({
                    userName: currentUserName,
                    joinedAt: new Date().toISOString(),
                    actId: actId,
                });

                console.log("✅ Presence відправлено:", presenceStatus);
            }
        });

        // Чекаємо трохи щоб отримати поточний стан
        await new Promise(resolve => setTimeout(resolve, 500));

        // Перевіряємо чи є інші користувачі
        const otherUsers = Array.from(activeUsers.keys()).filter(key => key !== currentUserName);

        if (otherUsers.length > 0) {
            const lockedBy = otherUsers[0];
            console.warn(`⚠️ Акт ${actId} вже відкритий користувачем: ${lockedBy}`);
            return { success: false, lockedBy };
        }

        console.log(`✅ Успішно приєднано до Presence акту ${actId}`);
        return { success: true };

    } catch (error) {
        console.error("Критична помилка при приєднанні до Presence:", error);
        return { success: true }; // Дозволяємо відкрити у випадку помилки
    }
}

/**
 * Виходить з Presence каналу - автоматично сповіщає інших користувачів
 */
export async function leaveActPresence(): Promise<void> {
    if (presenceChannel) {
        try {
            console.log(`🚪 Вихід з Presence каналу для акту ${currentActId}`);

            // Untrack presence
            await presenceChannel.untrack();

            // Відписуємось від каналу
            await supabase.removeChannel(presenceChannel);

            presenceChannel = null;
            currentActId = null;
            activeUsers.clear();

            console.log("✅ Успішно вийшли з Presence");
        } catch (error) {
            console.error("Помилка при виході з Presence:", error);
        }
    }
}

/**
 * Оновлює UI в залежності від presence стану
 */
function updateUIBasedOnPresence(): void {
    const otherUsers = Array.from(activeUsers.entries()).filter(([key]) => key !== currentUserName);

    if (otherUsers.length > 0) {
        // Є інші користувачі - треба визначити хто був першим

        if (!currentUserName) {
            console.error("❌ Неможливо визначити пріоритет: currentUserName відсутній");
            return;
        }

        // Отримуємо час приєднання поточного користувача
        const currentUserData = activeUsers.get(currentUserName);
        if (!currentUserData) {
            console.warn("⚠️ Не знайдено дані поточного користувача");
            return;
        }

        const currentUserJoinedAt = new Date(currentUserData.joinedAt).getTime();

        // Перевіряємо чи є хтось хто приєднався раніше
        const earlierUsers = otherUsers.filter(([_, userData]) => {
            const otherUserJoinedAt = new Date(userData.joinedAt).getTime();
            return otherUserJoinedAt < currentUserJoinedAt;
        });

        if (earlierUsers.length > 0) {
            // Є користувачі які приєдналися раніше - МИ другі, блокуємо себе
            const firstUser = earlierUsers[0];
            const lockedBy = firstUser[1].userName;
            console.log(`⚠️ Ми приєдналися другими. Акт вже відкритий користувачем: ${lockedBy}`);
            setLockedUI(lockedBy);
        } else {
            // Ми приєдналися першими - інші мають бути заблоковані, ми ні
            console.log("✅ Ми приєдналися першими. Акт доступний для редагування.");
            setUnlockedUI();
        }
    } else {
        // Немає інших користувачів - розблоковуємо
        console.log("✅ Немає інших користувачів. Акт доступний для редагування.");
        setUnlockedUI();
    }
}

/**
 * Встановлює UI в режим блокування (червоний header, заблокована кнопка збереження)
 * @param lockedBy - ПІБ користувача, який відкрив акт
 */
function setLockedUI(lockedBy: string): void {
    // Змінюємо колір header на червоний
    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
    if (header) {
        header.style.backgroundColor = "#8B0000"; // Темно-червоний
    }

    // Блокуємо кнопку збереження
    const saveButton = document.getElementById("save-act-data") as HTMLButtonElement;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.style.opacity = "0.5";
        saveButton.style.cursor = "not-allowed";
        saveButton.title = `Акт відкритий користувачем: ${lockedBy}`;
    }

    // Змінюємо колір кнопок в header на червоний
    const headerButtons = document.querySelectorAll(".zakaz_narayd-header-buttons .status-lock-icon");
    headerButtons.forEach((btn) => {
        (btn as HTMLElement).style.backgroundColor = "#8B0000";
    });

    // Показуємо повідомлення
    showNotification(`⚠️ Акт відкритий користувачем: ${lockedBy}. Редагування заблоковано.`, "warning", 5000);
}

/**
 * Встановлює UI в режим розблокування (зелений header, активна кнопка збереження)
 */
function setUnlockedUI(): void {
    // Відновлюємо колір header
    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
    if (header) {
        header.style.backgroundColor = "#1c4a28"; // Оригінальний зелений
    }

    // Розблоковуємо кнопку збереження
    const saveButton = document.getElementById("save-act-data") as HTMLButtonElement;
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.style.opacity = "1";
        saveButton.style.cursor = "pointer";
        saveButton.title = "Зберегти зміни";
    }

    // Відновлюємо колір кнопок в header
    const headerButtons = document.querySelectorAll(".zakaz_narayd-header-buttons .status-lock-icon");
    headerButtons.forEach((btn) => {
        (btn as HTMLElement).style.backgroundColor = "";
    });

    // Показуємо повідомлення тільки якщо були інші користувачі
    if (activeUsers.size > 1) {
        showNotification("✅ Акт розблоковано. Редагування дозволено.", "success", 3000);
    }
}

/**
 * Отримує список активних користувачів в акті
 */
export function getActiveUsers(): string[] {
    return Array.from(activeUsers.keys());
}

/**
 * Перевіряє чи акт заблоковано іншим користувачем
 */
export function isActLocked(): boolean {
    const otherUsers = Array.from(activeUsers.keys()).filter(key => key !== currentUserName);
    return otherUsers.length > 0;
}

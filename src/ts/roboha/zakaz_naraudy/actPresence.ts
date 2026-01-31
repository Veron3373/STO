// src/ts/roboha/zakaz_naraudy/actPresence.ts
import { supabase } from "../../vxid/supabaseClient";
import { userName as currentUserName } from "../tablucya/users";
import { showNotification } from "./inhi/vspluvauhe_povidomlenna";

// Типи для Presence
interface ActPresenceState {
    actId: number;
    userName: string;
    openedAt: string;
}

// Канал для Presence
let presenceChannel: any = null;

/**
 * Підписується на присутність користувачів для конкретного акту
 * @param actId - ID акту
 * @returns об'єкт з інформацією про блокування
 */
export async function subscribeToActPresence(actId: number): Promise<{
    isLocked: boolean;
    lockedBy: string | null;
}> {
    // Відписуємося від попереднього каналу, якщо він існує
    if (presenceChannel) {
        await unsubscribeFromActPresence();
    }



    // Створюємо канал для конкретного акту
    const channelName = `act_presence_${actId}`;
    presenceChannel = supabase.channel(channelName, {
        config: {
            presence: {
                key: currentUserName || "Unknown",
            },
        },
    });

    // Об'єкт для зберігання результату
    let presenceResult = {
        isLocked: false,
        lockedBy: null as string | null,
    };

    // Підписуємося на зміни присутності
    presenceChannel
        .on("presence", { event: "sync" }, () => {
            const state = presenceChannel.presenceState();
            console.log("🔄 Presence sync:", state);

            // Перевіряємо, чи хтось інший вже відкрив акт
            const users = Object.keys(state);
            const otherUsers = users.filter((user) => user !== currentUserName);

            if (otherUsers.length > 0) {
                // Акт заблокований іншим користувачем
                const lockedByUser = otherUsers[0];
                presenceResult.isLocked = true;
                presenceResult.lockedBy = lockedByUser;

                // Блокуємо інтерфейс
                lockActInterface(lockedByUser);
            } else {
                // Акт розблокований
                presenceResult.isLocked = false;
                presenceResult.lockedBy = null;

                // Розблокуємо інтерфейс
                unlockActInterface();
            }
        })
        .on("presence", { event: "join" }, ({ key, newPresences }: { key: string; newPresences: any }) => {
            console.log("👋 User joined:", key, newPresences);

            // Якщо приєднався інший користувач (не поточний)
            if (key !== currentUserName) {
                lockActInterface(key);
            }
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }: { key: string; leftPresences: any }) => {
            console.log("👋 User left:", key, leftPresences);

            // Якщо вийшов інший користувач, перевіряємо чи є ще хтось
            const state = presenceChannel.presenceState();
            const users = Object.keys(state);
            const otherUsers = users.filter((user) => user !== currentUserName);

            if (otherUsers.length === 0) {
                // Більше немає інших користувачів - розблокуємо
                unlockActInterface();
            }
        })
        .subscribe(async (status: string) => {
            if (status === "SUBSCRIBED") {
                // Відправляємо свою присутність
                const presenceData: ActPresenceState = {
                    actId: actId,
                    userName: currentUserName || "Unknown",
                    openedAt: new Date().toISOString(),
                };

                await presenceChannel.track(presenceData);
                console.log("✅ Subscribed to act presence:", actId);
            }
        });

    // Чекаємо трохи, щоб отримати початковий стан
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Перевіряємо стан після підписки
    const state = presenceChannel.presenceState();
    const users = Object.keys(state);
    const otherUsers = users.filter((user) => user !== currentUserName);

    if (otherUsers.length > 0) {
        presenceResult.isLocked = true;
        presenceResult.lockedBy = otherUsers[0];
    }

    return presenceResult;
}

/**
 * Відписується від присутності акту
 */
export async function unsubscribeFromActPresence(): Promise<void> {
    if (presenceChannel) {
        await presenceChannel.untrack();
        await supabase.removeChannel(presenceChannel);
        presenceChannel = null;
        console.log("✅ Unsubscribed from act presence");
    }
}

/**
 * Блокує інтерфейс акту
 * @param lockedByUser - ім'я користувача, який заблокував акт
 */
function lockActInterface(lockedByUser: string): void {
    console.log(`🔒 Locking interface. Act is opened by: ${lockedByUser}`);

    // Показуємо повідомлення
    showNotification(
        `⚠️ Даний акт відкритий користувачем: ${lockedByUser}`,
        "warning",
        5000
    );

    // Блокуємо кнопку "Зберегти зміни"
    const saveButton = document.getElementById("save-act-data") as HTMLButtonElement;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.style.opacity = "0.5";
        saveButton.style.cursor = "not-allowed";
        saveButton.title = `Акт редагується користувачем: ${lockedByUser}`;
    }

    // Змінюємо колір header на червоний
    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
    if (header) {
        header.style.backgroundColor = "#dc3545"; // Червоний колір
        header.setAttribute("data-locked", "true");
    }

    // Блокуємо кнопки в header
    const headerButtons = [
        "status-lock-btn",
        "print-act-button",
        "sms-btn",
        "create-act-btn",
    ];

    headerButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId) as HTMLButtonElement;
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
            btn.title = `Акт редагується користувачем: ${lockedByUser}`;
        }
    });

    // Блокуємо всі editable поля
    const editableElements = document.querySelectorAll(".editable");
    editableElements.forEach((el) => {
        (el as HTMLElement).contentEditable = "false";
        (el as HTMLElement).style.opacity = "0.7";
        (el as HTMLElement).style.cursor = "not-allowed";
    });
}

/**
 * Розблокує інтерфейс акту
 */
function unlockActInterface(): void {
    console.log("🔓 Unlocking interface");

    // Показуємо повідомлення
    showNotification("✅ Акт тепер доступний для редагування", "success", 3000);

    // Розблокуємо кнопку "Зберегти зміни"
    const saveButton = document.getElementById("save-act-data") as HTMLButtonElement;
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.style.opacity = "1";
        saveButton.style.cursor = "pointer";
        saveButton.title = "Зберегти зміни";
    }

    // Відновлюємо колір header
    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
    if (header) {
        const wasLocked = header.getAttribute("data-locked") === "true";
        if (wasLocked) {
            // Відновлюємо попередній колір (зелений)
            header.style.backgroundColor = "#1c4a28";
            header.removeAttribute("data-locked");
        }
    }

    // Розблокуємо кнопки в header
    const headerButtons = [
        "status-lock-btn",
        "print-act-button",
        "sms-btn",
        "create-act-btn",
    ];

    headerButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId) as HTMLButtonElement;
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.title = btn.id === "status-lock-btn" ? "" : btn.title;
        }
    });

    // Розблокуємо всі editable поля (якщо акт не закритий)
    const editableElements = document.querySelectorAll(".editable");
    editableElements.forEach((el) => {
        const element = el as HTMLElement;
        // Перевіряємо чи акт не закритий
        const modal = document.getElementById("zakaz_narayd-modal");
        const isActClosed = modal?.getAttribute("data-act-closed") === "true";

        if (!isActClosed) {
            element.contentEditable = "true";
            element.style.opacity = "1";
            element.style.cursor = "text";
        }
    });
}

/**
 * Перевіряє чи акт заблокований іншим користувачем
 * @returns true якщо акт заблокований
 */
export function isActLocked(): boolean {
    if (!presenceChannel) return false;

    const state = presenceChannel.presenceState();
    const users = Object.keys(state);
    const otherUsers = users.filter((user) => user !== currentUserName);

    return otherUsers.length > 0;
}

/**
 * Отримує ім'я користувача, який заблокував акт
 * @returns ім'я користувача або null
 */
export function getLockedByUser(): string | null {
    if (!presenceChannel) return null;

    const state = presenceChannel.presenceState();
    const users = Object.keys(state);
    const otherUsers = users.filter((user) => user !== currentUserName);

    return otherUsers.length > 0 ? otherUsers[0] : null;
}

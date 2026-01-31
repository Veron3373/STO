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
 * @param onUnlock - колбек, який викликається коли акт розблоковується (для оновлення даних)
 * @returns об'єкт з інформацією про блокування
 */
export async function subscribeToActPresence(
    actId: number,
    onUnlock?: () => void
): Promise<{
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

    // Об'єкт для зберігання результату (початкового)
    let presenceResult = {
        isLocked: false,
        lockedBy: null as string | null,
    };

    // Функція для обробки змін присутності
    const handlePresenceChange = () => {
        const state = presenceChannel.presenceState();
        console.log("🔄 Presence sync:", state);

        // Збираємо всіх користувачів з їх часом відкриття
        const allUsers: ActPresenceState[] = [];

        Object.keys(state).forEach((key) => {
            const presences = state[key] as ActPresenceState[];
            if (presences && presences.length > 0) {
                // Беремо перший запис для користувача (зазвичай один)
                // Але краще перебрати всі, якщо користувач відкрив у кількох вкладках
                presences.forEach((p) => {
                    if (p.userName && p.openedAt) {
                        allUsers.push(p);
                    }
                });
            }
        });

        // Якщо нікого немає (дивна ситуація, бо ми там маємо бути), виходимо
        if (allUsers.length === 0) return;

        // Сортуємо за часом відкриття (хто перший відкрив - той перший у масиві)
        allUsers.sort((a, b) => {
            const dateA = new Date(a.openedAt).getTime();
            const dateB = new Date(b.openedAt).getTime();
            return dateA - dateB;
        });

        console.log("👥 All users sorted by open time:", allUsers);

        // Визначаємо власника (перший у списку)
        const owner = allUsers[0];
        const ownerName = owner.userName;

        // Перевіряємо, чи ми є власником
        if (ownerName === currentUserName) {
            // Перевіряємо чи був заблокований (для виклику onUnlock)
            const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
            const wasLocked = header && header.hasAttribute("data-locked");

            // Ми - власник (або один з наших екземплярів - перший)
            // Розблокуємо інтерфейс, якщо він був заблокований
            unlockActInterface();

            if (wasLocked && onUnlock) {
                console.log("🔄 Calling onUnlock callback to refresh data");
                onUnlock();
            }
        } else {
            // Хтось інший відкрив раніше
            lockActInterface(ownerName);
        }
    };

    // Підписуємося на зміни присутності
    presenceChannel
        .on("presence", { event: "sync" }, handlePresenceChange)
        .on("presence", { event: "join" }, ({ key, newPresences }: { key: string; newPresences: any }) => {
            console.log("👋 User joined:", key, newPresences);
            handlePresenceChange(); // Викликаємо загальну логіку
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }: { key: string; leftPresences: any }) => {
            console.log("👋 User left:", key, leftPresences);
            handlePresenceChange(); // Викликаємо загальну логіку
        })
        .subscribe(async (status: string) => {
            if (status === "SUBSCRIBED") {
                // Відправляємо свою присутність з часом відкриття
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

    // Отримуємо початковий стан, щоб повернути результат
    // Але основна логіка буде в handlePresenceChange
    const state = presenceChannel.presenceState();
    const allUsers: ActPresenceState[] = [];
    Object.keys(state).forEach((key) => {
        const presences = state[key] as ActPresenceState[];
        if (presences && presences.length > 0) {
            presences.forEach((p) => {
                if (p.userName && p.openedAt) {
                    allUsers.push(p);
                }
            });
        }
    });

    if (allUsers.length > 0) {
        allUsers.sort((a, b) => {
            return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
        });
        const owner = allUsers[0];
        if (owner.userName !== currentUserName) {
            presenceResult.isLocked = true;
            presenceResult.lockedBy = owner.userName;
        }
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
    // Перевірка, щоб не спамити блокуванням, якщо вже заблоковано тим самим користувачем
    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
    if (header && header.getAttribute("data-locked-by") === lockedByUser) {
        return; // Вже заблоковано цим користувачем
    }

    console.log(`🔒 Locking interface. Act is opened by: ${lockedByUser}`);

    // Показуємо повідомлення
    showNotification(
        `⚠️ Даний акт редагується користувачем: ${lockedByUser}. Ви в режимі перегляду.`,
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
    if (header) {
        header.style.backgroundColor = "#dc3545"; // Червоний колір
        header.setAttribute("data-locked", "true");
        header.setAttribute("data-locked-by", lockedByUser);
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

    // Блокуємо кнопку "Додати рядок"
    const addRowBtn = document.getElementById("add-row-button") as HTMLButtonElement;
    if (addRowBtn) {
        addRowBtn.disabled = true;
        addRowBtn.style.opacity = "0.5";
        addRowBtn.style.cursor = "not-allowed";
        addRowBtn.title = `Акт редагується користувачем: ${lockedByUser}`;
    }

    // Блокуємо кнопки видалення рядків
    const deleteButtons = document.querySelectorAll(".delete-row-btn");
    deleteButtons.forEach((btn) => {
        const button = btn as HTMLButtonElement;
        button.disabled = true;
        button.style.opacity = "0.3";
        button.style.cursor = "not-allowed";
        button.style.pointerEvents = "none"; // Додатково блокуємо кліки
    });

    // Блокуємо всі editable поля та автодоповнення
    const editableSelectors = [".editable", ".editable-autocomplete"];
    editableSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
            (el as HTMLElement).contentEditable = "false";
            (el as HTMLElement).style.opacity = "0.7";
            (el as HTMLElement).style.cursor = "not-allowed";
        });
    });
}

/**
 * Розблокує інтерфейс акту
 */
function unlockActInterface(): void {
    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
    // Якщо не було заблоковано - нічого робити. Але краще перестрахуватися.
    if (header && !header.hasAttribute("data-locked")) {
        return;
    }

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
    if (header) {
        // Відновлюємо попередній колір (зелений)
        header.style.backgroundColor = "#1c4a28";
        header.removeAttribute("data-locked");
        header.removeAttribute("data-locked-by");
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

    // Розблокуємо кнопку "Додати рядок"
    const addRowBtn = document.getElementById("add-row-button") as HTMLButtonElement;
    if (addRowBtn) {
        addRowBtn.disabled = false;
        addRowBtn.style.opacity = "1";
        addRowBtn.style.cursor = "pointer";
        addRowBtn.title = "Додати рядок";
    }

    // Розблокуємо кнопки видалення рядків
    const deleteButtons = document.querySelectorAll(".delete-row-btn");
    deleteButtons.forEach((btn) => {
        const button = btn as HTMLButtonElement;
        button.disabled = false;
        button.style.opacity = "0.6"; // Повертаємо стандартну opacity
        button.style.cursor = "pointer";
        button.style.pointerEvents = "auto";
    });

    // Розблокуємо всі editable поля та автодоповнення (якщо акт не закритий)
    const editableSelectors = [".editable", ".editable-autocomplete"];
    editableSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
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
    });
}

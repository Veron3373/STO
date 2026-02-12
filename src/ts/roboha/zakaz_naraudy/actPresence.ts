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

// ✏️ Глобальний канал для відображення хто редагує акти в таблиці
let globalPresenceChannel: any = null;

// 🔐 Час відкриття акту поточним користувачем (фіксується один раз при підписці)
let myOpenedAt: string | null = null;

// 🔐 Прапорець: чи ми вже відправили свій track
let hasTrackedPresence: boolean = false;

// ⏰ Максимальний час "життя" присутності (2 години в мілісекундах)
// Присутності старші за цей час будуть ігноруватись як "застарілі"
const PRESENCE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * 🧹 Перевіряє чи присутність "застаріла" (старше PRESENCE_MAX_AGE_MS)
 */
function isPresenceStale(openedAt: string): boolean {
    const openedTime = new Date(openedAt).getTime();
    const now = Date.now();
    return (now - openedTime) > PRESENCE_MAX_AGE_MS;
}

// 🔐 Обробник для закриття сторінки - відписуємось від presence
function handlePageUnload(): void {
    if (presenceChannel) {
        // Використовуємо синхронний untrack через sendBeacon якщо можливо
        try {
            presenceChannel.untrack();
            supabase.removeChannel(presenceChannel);
            presenceChannel = null;
        } catch (err) {
            console.error("🔐 [beforeunload] Помилка відписки:", err);
        }
    }
    if (globalPresenceChannel) {
        try {
            globalPresenceChannel.untrack();
            supabase.removeChannel(globalPresenceChannel);
            globalPresenceChannel = null;
        } catch (err) {
            console.error("🔐 [beforeunload] Помилка відписки global:", err);
        }
    }
}

// 🔐 Реєструємо обробники для закриття сторінки
window.addEventListener("beforeunload", handlePageUnload);
window.addEventListener("pagehide", handlePageUnload);
// Також для випадку коли сторінка стає "прихованою" (мобільні браузери)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && presenceChannel) {
        // Не відписуємось повністю, але робимо untrack щоб сервер знав що ми "пішли"
        presenceChannel.untrack().catch(() => {});
    }
});

/**
 * Підписується на присутність користувачів для конкретного акту
 * @param actId - ID акту
 * @param onUnlock - колбек, який викликається коли акт розблоковується (для оновлення даних)
 * @returns об'єкт з інформацією про блокування
 */
export async function subscribeToActPresence(
    actId: number,
    onUnlock?: () => Promise<void> | void
): Promise<{
    isLocked: boolean;
    lockedBy: string | null;
}> {
    // Відписуємося від попереднього каналу, якщо він існує
    if (presenceChannel) {
        await unsubscribeFromActPresence();
    }

    // 🔐 Фіксуємо час відкриття акту ОДИН РАЗ при підписці
    myOpenedAt = new Date().toISOString();
    hasTrackedPresence = false; // 🔐 Скидаємо прапорець

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
        // Перевіряємо, чи канал ще існує
        if (!presenceChannel) {
            console.log("⚠️ [Presence] Канал вже відключений, пропускаємо обробку");
            return;
        }
        
        const state = presenceChannel.presenceState();

        // Збираємо всіх користувачів з їх часом відкриття
        const allUsers: ActPresenceState[] = [];

        Object.keys(state).forEach((key) => {
            const presences = state[key] as ActPresenceState[];
            if (presences && presences.length > 0) {
                // Беремо перший запис для користувача (зазвичай один)
                // Але краще перебрати всі, якщо користувач відкрив у кількох вкладках
                presences.forEach((p) => {
                    if (p.userName && p.openedAt) {
                        // 🧹 Ігноруємо "застарілі" присутності (старше 2 годин)
                        if (isPresenceStale(p.openedAt)) {
                            return;
                        }
                        allUsers.push(p);
                    }
                });
            }
        });

        // Якщо нікого немає (дивна ситуація, бо ми там маємо бути), виходимо
        if (allUsers.length === 0) {
            console.log("⚠️ [Presence] Порожній стан присутності - чекаємо синхронізації");
            return;
        }

        // 🔐 КРИТИЧНО: Якщо ми ще НЕ відправили track, але вже бачимо інших користувачів -
        // це 100% означає що вони були тут ДО нас! Блокуємо одразу.
        const otherUsersInChannel = allUsers.filter(u => u.userName !== currentUserName);
        if (!hasTrackedPresence && otherUsersInChannel.length > 0) {
            const firstOtherUser = otherUsersInChannel[0];
            lockActInterface(firstOtherUser.userName);
            presenceResult.isLocked = true;
            presenceResult.lockedBy = firstOtherUser.userName;
            return;
        }

        // Сортуємо за часом відкриття (хто перший відкрив - той перший у масиві)
        allUsers.sort((a, b) => {
            const dateA = new Date(a.openedAt).getTime();
            const dateB = new Date(b.openedAt).getTime();
            return dateA - dateB;
        });


        // Визначаємо власника (перший у списку)
        const owner = allUsers[0];
        const ownerName = owner.userName;

        // 🔐 КРИТИЧНО: Перевіряємо чи хтось відкрив РАНІШЕ нас (за нашим зафіксованим часом)
        // Це захищає від race condition, коли наш track може прийти раніше
        const someoneOpenedBeforeUs = allUsers.some(user => {
            if (user.userName === currentUserName) return false; // Пропускаємо себе
            const userOpenedAt = new Date(user.openedAt).getTime();
            const myOpenedAtTime = myOpenedAt ? new Date(myOpenedAt).getTime() : Date.now();
            return userOpenedAt < myOpenedAtTime;
        });

        // Знаходимо першого користувача, який відкрив раніше нас
        const firstUserBeforeUs = allUsers.find(user => {
            if (user.userName === currentUserName) return false;
            const userOpenedAt = new Date(user.openedAt).getTime();
            const myOpenedAtTime = myOpenedAt ? new Date(myOpenedAt).getTime() : Date.now();
            return userOpenedAt < myOpenedAtTime;
        });

        // Перевіряємо, чи ми є власником АБО ніхто не відкрив раніше нас
        if (ownerName === currentUserName && !someoneOpenedBeforeUs) {
            // Перевіряємо чи був заблокований (для виклику onUnlock)
            const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
            const wasLocked = header && header.hasAttribute("data-locked");

            // Ми - власник (або один з наших екземплярів - перший)
            // Розблокуємо інтерфейс, якщо він був заблокований
            unlockActInterface();

            if (wasLocked && onUnlock) {
                onUnlock();
            }
        } else if (someoneOpenedBeforeUs && firstUserBeforeUs) {
            // 🔐 Хтось відкрив РАНІШЕ нас - блокуємо
            lockActInterface(firstUserBeforeUs.userName);
            presenceResult.isLocked = true;
            presenceResult.lockedBy = firstUserBeforeUs.userName;
        } else if (ownerName !== currentUserName) {
            // Хтось інший є власником (за сортуванням)
            lockActInterface(ownerName);
            presenceResult.isLocked = true;
            presenceResult.lockedBy = ownerName;
        }
    };

    // Підписуємося на зміни присутності
    presenceChannel
        .on("presence", { event: "sync" }, handlePresenceChange)
        .on("presence", { event: "join" }, () => {
            handlePresenceChange(); // Викликаємо загальну логіку
        })
        .on("presence", { event: "leave" }, () => {
            handlePresenceChange(); // Викликаємо загальну логіку
        })
        .on("broadcast", { event: "act_saved" }, async (payload: any) => {
            
            // Отримуємо actId з payload (Supabase обгортає в payload.payload)
            const receivedActId = payload?.payload?.actId || payload?.actId || actId;

            // Перевіряємо, чи ми заблоковані (значить ми не той, хто зберіг)
            // Якщо ми власник - ми і так оновили дані при збереженні
            const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
            const isLocked = header && header.hasAttribute("data-locked");


            if (isLocked) {
                
                // ✅ Використовуємо "тихе" оновлення тільки таблиці без перезавантаження модалу
                try {
                    const { refreshActTableSilently } = await import("./modalMain");
                    await refreshActTableSilently(receivedActId);
                } catch (err) {
                    console.error("❌ Помилка тихого оновлення:", err);
                    // Fallback: використовуємо старий метод якщо щось пішло не так
                    if (onUnlock) {
                        await onUnlock();
                        handlePresenceChange();
                    }
                }
            } else {
            }
        })
        .subscribe(async (status: string) => {
            if (status === "SUBSCRIBED") {
                // 🔐 Відправляємо свою присутність з ФІКСОВАНИМ часом відкриття
                const presenceData: ActPresenceState = {
                    actId: actId,
                    userName: currentUserName || "Unknown",
                    openedAt: myOpenedAt!, // Використовуємо зафіксований час
                };

                await presenceChannel.track(presenceData);
                hasTrackedPresence = true; // 🔐 Відмічаємо що ми відправили свою присутність

                // ✏️ Також відправляємо на глобальний канал для відображення в таблиці
                await trackGlobalActPresence(actId);
            }
        });

    // 🔐 Чекаємо синхронізації з кількома спробами для надійності
    // presenceState() читає локальний кеш - це НЕ мережевий запит
    // Спроба 1: чекаємо 1000мс 
    await new Promise((resolve) => setTimeout(resolve, 1000));
    handlePresenceChange();
    
    // 🔐 Спроба 2: додаткова перевірка через 1500мс (на випадок повільної мережі)
    await new Promise((resolve) => setTimeout(resolve, 1500));
    handlePresenceChange();

    // Перевіряємо, чи канал ще існує перед фінальною обробкою
    if (!presenceChannel) {
        console.log("⚠️ [Presence] Канал вже відключений після очікування");
        return presenceResult;
    }

    // Отримуємо фінальний стан, щоб повернути результат
    const state = presenceChannel.presenceState();
    const allUsers: ActPresenceState[] = [];
    Object.keys(state).forEach((key) => {
        const presences = state[key] as ActPresenceState[];
        if (presences && presences.length > 0) {
            presences.forEach((p) => {
                if (p.userName && p.openedAt) {
                    // 🧹 Ігноруємо "застарілі" присутності (старше 2 годин)
                    if (isPresenceStale(p.openedAt)) {
                        return;
                    }
                    allUsers.push(p);
                }
            });
        }
    });

    if (allUsers.length > 0) {
        allUsers.sort((a, b) => {
            return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
        });
        
        // 🔐 Перевіряємо чи хтось відкрив раніше нас
        const someoneOpenedBeforeUs = allUsers.some(user => {
            if (user.userName === currentUserName) return false;
            const userOpenedAt = new Date(user.openedAt).getTime();
            const myOpenedAtTime = myOpenedAt ? new Date(myOpenedAt).getTime() : Date.now();
            return userOpenedAt < myOpenedAtTime;
        });
        
        const firstUserBeforeUs = allUsers.find(user => {
            if (user.userName === currentUserName) return false;
            const userOpenedAt = new Date(user.openedAt).getTime();
            const myOpenedAtTime = myOpenedAt ? new Date(myOpenedAt).getTime() : Date.now();
            return userOpenedAt < myOpenedAtTime;
        });
        
        if (someoneOpenedBeforeUs && firstUserBeforeUs) {
            presenceResult.isLocked = true;
            presenceResult.lockedBy = firstUserBeforeUs.userName;
        } else {
            const owner = allUsers[0];
            if (owner.userName !== currentUserName) {
                presenceResult.isLocked = true;
                presenceResult.lockedBy = owner.userName;
            }
        }
    }

    return presenceResult;
}

/**
 * Відправляє сповіщення всім учасникам, що акт збережено
 * @param actId - ID акту
 */
export async function notifyActSaved(actId: number): Promise<void> {
    if (presenceChannel) {
        await presenceChannel.send({
            type: 'broadcast',
            event: 'act_saved',
            payload: { actId }
        });
    }
}

/**
 * ✏️ Відстежує присутність в глобальному каналі (для відображення в таблиці)
 */
async function trackGlobalActPresence(actId: number): Promise<void> {
    // Створюємо канал, якщо ще не існує
    if (!globalPresenceChannel) {
        globalPresenceChannel = supabase.channel("global_acts_presence", {
            config: {
                presence: {
                    key: currentUserName || "Unknown",
                },
            },
        });

        await globalPresenceChannel.subscribe();
    }

    // 🔐 Відправляємо присутність з actId та ФІКСОВАНИМ часом відкриття
    const presenceData = {
        actId: actId,
        userName: currentUserName || "Unknown",
        openedAt: myOpenedAt || new Date().toISOString(), // Використовуємо зафіксований час
    };

    await globalPresenceChannel.track(presenceData);
}

/**
 * ✏️ Прибирає присутність з глобального каналу
 */
async function untrackGlobalActPresence(): Promise<void> {
    if (globalPresenceChannel) {
        await globalPresenceChannel.untrack();
    }
}

/**
 * Відписується від присутності акту
 */
export async function unsubscribeFromActPresence(): Promise<void> {
    if (presenceChannel) {
        await presenceChannel.untrack();
        await supabase.removeChannel(presenceChannel);
        presenceChannel = null;
    }
    
    // 🔐 Очищаємо зафіксований час відкриття
    myOpenedAt = null;
    hasTrackedPresence = false; // 🔐 Скидаємо прапорець
    
    // ✏️ Також прибираємо з глобального каналу
    await untrackGlobalActPresence();
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

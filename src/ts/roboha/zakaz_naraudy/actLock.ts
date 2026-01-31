// Модуль для блокування акту при відкритті іншим користувачем
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "./inhi/vspluvauhe_povidomlenna";
import { userName as currentUserName } from "../tablucya/users";

/**
 * Записує ПІБ користувача в act_on_off при відкритті акту
 * @param actId - ID акту
 * @returns true якщо успішно записано, false якщо акт вже відкритий іншим користувачем
 */
export async function lockAct(actId: number): Promise<{ success: boolean; lockedBy?: string }> {
    try {
        // Спочатку перевіряємо чи акт вже відкритий
        const { data: act, error: fetchError } = await supabase
            .from("acts")
            .select("act_on_off")
            .eq("act_id", actId)
            .single();

        if (fetchError) {
            console.error("Помилка перевірки блокування акту:", fetchError);
            return { success: true }; // Дозволяємо відкрити у випадку помилки
        }

        // Якщо act_on_off не пустий і це не поточний користувач
        if (act?.act_on_off && act.act_on_off.trim() !== "" && act.act_on_off !== currentUserName) {
            console.warn(`⚠️ Акт ${actId} вже відкритий користувачем: ${act.act_on_off}`);
            return { success: false, lockedBy: act.act_on_off };
        }

        // Записуємо ПІБ поточного користувача
        const { error: updateError } = await supabase
            .from("acts")
            .update({ act_on_off: currentUserName })
            .eq("act_id", actId);

        if (updateError) {
            console.error("Помилка запису блокування акту:", updateError);
            return { success: true }; // Дозволяємо відкрити у випадку помилки
        }

        console.log(`✅ Акт ${actId} заблоковано користувачем: ${currentUserName}`);
        return { success: true };
    } catch (error) {
        console.error("Критична помилка при блокуванні акту:", error);
        return { success: true }; // Дозволяємо відкрити у випадку помилки
    }
}

/**
 * Очищує act_on_off при закритті акту
 * @param actId - ID акту
 */
export async function unlockAct(actId: number): Promise<void> {
    try {
        // Перевіряємо чи це поточний користувач відкрив акт
        const { data: act, error: fetchError } = await supabase
            .from("acts")
            .select("act_on_off")
            .eq("act_id", actId)
            .single();

        if (fetchError) {
            console.error("Помилка перевірки блокування акту:", fetchError);
            return;
        }

        // Очищаємо тільки якщо це поточний користувач або поле пусте
        if (!act?.act_on_off || act.act_on_off === currentUserName) {
            const { error: updateError } = await supabase
                .from("acts")
                .update({ act_on_off: null })
                .eq("act_id", actId);

            if (updateError) {
                console.error("Помилка очищення блокування акту:", updateError);
                return;
            }

            console.log(`✅ Акт ${actId} розблоковано`);
        } else {
            console.warn(`⚠️ Акт ${actId} відкритий іншим користувачем: ${act.act_on_off}`);
        }
    } catch (error) {
        console.error("Критична помилка при розблокуванні акту:", error);
    }
}

// Зберігаємо ID поточного відкритого акту для очищення при beforeunload
let currentOpenActId: number | null = null;

/**
 * Встановлює обробник beforeunload для автоматичного очищення act_on_off
 * при закритті/перезавантаженні сторінки
 * @param actId - ID акту
 */
export function setupBeforeUnloadHandler(actId: number): void {
    currentOpenActId = actId;

    // Видаляємо попередній обробник якщо є
    window.removeEventListener("beforeunload", handleBeforeUnload);

    // Додаємо новий обробник
    window.addEventListener("beforeunload", handleBeforeUnload);

    console.log(`🔒 Встановлено beforeunload обробник для акту ${actId}`);
}

/**
 * Обробник beforeunload - очищає act_on_off при закритті сторінки
 */
function handleBeforeUnload(): void {
    if (currentOpenActId) {
        console.log(`🚪 Закриття сторінки - очищення act_on_off для акту ${currentOpenActId}`);

        // Використовуємо sendBeacon для надійної відправки при закритті сторінки
        // sendBeacon працює навіть коли сторінка вже закривається
        const url = `${(supabase as any).supabaseUrl}/rest/v1/acts?act_id=eq.${currentOpenActId}`;
        const headers = {
            "apikey": (supabase as any).supabaseKey,
            "Authorization": `Bearer ${(supabase as any).supabaseKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        };

        const blob = new Blob(
            [JSON.stringify({ act_on_off: null })],
            { type: "application/json" }
        );

        // Використовуємо fetch з keepalive для більшої надійності
        fetch(url, {
            method: "PATCH",
            headers: headers,
            body: blob,
            keepalive: true // Важливо! Дозволяє запиту завершитися навіть після закриття сторінки
        }).catch(err => console.error("Помилка очищення act_on_off:", err));
    }
}

/**
 * Очищає обробник beforeunload
 */
export function cleanupBeforeUnloadHandler(): void {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    currentOpenActId = null;
    console.log("🧹 Очищено beforeunload обробник");
}

/**
 * Встановлює UI в режим блокування (червоний header, заблокована кнопка збереження)
 * @param lockedBy - ПІБ користувача, який відкрив акт
 */
export function setLockedUI(lockedBy: string): void {
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
 * Також записує ПІБ поточного користувача в act_on_off для блокування акту
 */
export async function setUnlockedUI(): Promise<void> {
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

    // 🔒 ВАЖЛИВО: Записуємо ПІБ поточного користувача в act_on_off
    // Це робить поточного користувача власником блокування
    const modal = document.getElementById("zakaz_narayd-modal");
    const actId = modal?.getAttribute("data-act-id");

    if (actId) {
        try {
            const { error } = await supabase
                .from("acts")
                .update({ act_on_off: currentUserName })
                .eq("act_id", parseInt(actId));

            if (error) {
                console.error("Помилка запису act_on_off при розблокуванні:", error);
            } else {
                console.log(`✅ Акт ${actId} тепер заблоковано користувачем: ${currentUserName}`);
            }
        } catch (error) {
            console.error("Критична помилка при записі act_on_off:", error);
        }
    }

    // Показуємо повідомлення
    showNotification("✅ Акт розблоковано. Редагування дозволено.", "success", 3000);
}

// Зберігаємо підписку для можливості очищення
let actLockSubscription: any = null;

/**
 * Встановлює Realtime підписку на зміни act_on_off для поточного акту
 * Коли користувач №1 закриває акт, користувач №2 автоматично отримує розблокування
 * @param actId - ID акту
 */
export function setupActLockRealtimeSubscription(actId: number): void {
    // Очищаємо попередню підписку якщо є
    cleanupActLockSubscription();

    console.log(`📡 Встановлення Realtime підписки на act_on_off для акту ${actId}`);

    actLockSubscription = supabase
        .channel(`act_lock_${actId}`)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "acts",
                filter: `act_id=eq.${actId}`,
            },
            async (payload: any) => {
                console.log("🔔 Отримано зміну act_on_off:", payload);
                console.log("🔍 Деталі зміни:", {
                    old: payload.old?.act_on_off,
                    new: payload.new?.act_on_off,
                    currentUser: currentUserName
                });

                const newActOnOff = payload.new?.act_on_off;
                const oldActOnOff = payload.old?.act_on_off;

                // Якщо act_on_off очистився (став null або пустим) - розблоковуємо
                if (oldActOnOff && (!newActOnOff || newActOnOff.trim() === "")) {
                    console.log("✅ Акт розблоковано іншим користувачем - автоматично блокуємо для себе");
                    await setUnlockedUI();
                }
                // Якщо act_on_off змінився на іншого користувача - блокуємо
                else if (newActOnOff && newActOnOff.trim() !== "" && newActOnOff !== currentUserName) {
                    // Перевіряємо чи це зміна з пустого на заповнене або зміна користувача
                    if (!oldActOnOff || oldActOnOff !== newActOnOff) {
                        console.log(`⚠️ Акт заблоковано користувачем: ${newActOnOff}`);
                        setLockedUI(newActOnOff);
                    }
                }
                // Якщо act_on_off змінився на поточного користувача - розблоковуємо UI
                else if (newActOnOff === currentUserName && oldActOnOff !== currentUserName) {
                    console.log("✅ Акт тепер заблоковано нами - розблоковуємо UI");
                    // Тут не викликаємо setUnlockedUI бо це призведе до повторного запису
                    // Просто оновлюємо UI
                    const header = document.querySelector(".zakaz_narayd-header") as HTMLElement;
                    if (header) {
                        header.style.backgroundColor = "#1c4a28";
                    }
                    const saveButton = document.getElementById("save-act-data") as HTMLButtonElement;
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.style.opacity = "1";
                        saveButton.style.cursor = "pointer";
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log(`📡 Статус підписки act_lock_${actId}:`, status);
        });
}

/**
 * Очищає Realtime підписку на act_on_off
 */
export function cleanupActLockSubscription(): void {
    if (actLockSubscription) {
        console.log("🧹 Очищення Realtime підписки на act_on_off");
        supabase.removeChannel(actLockSubscription);
        actLockSubscription = null;
    }
}

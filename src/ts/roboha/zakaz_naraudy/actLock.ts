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
 */
export function setUnlockedUI(): void {
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

    // Показуємо повідомлення
    showNotification("✅ Акт розблоковано. Редагування дозволено.", "success", 3000);
}

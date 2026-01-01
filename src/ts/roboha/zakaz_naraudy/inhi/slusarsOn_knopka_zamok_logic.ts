/**
 * 💛 Додаткова логіка для кнопки замка (knopka_zamok.ts)
 *
 * ⚠️ ВАЖЛИВО: ЦЕЙ ФАЙЛ - ШАБЛОН / ПРИКЛАД КОДУ!
 * Не використовуйте його як окремий модуль!
 *
 * 📝 Інструкція:
 * Скопіюйте код з цього файлу і вставте його в:
 * src/ts/roboha/zakaz_naraudy/inhi/knopka_zamok.ts
 *
 * ℹ️ Помилки TypeScript в цьому файлі - це нормально,
 * оскільки імпорти вказані для іншого файлу (knopka_zamok.ts).
 */

import { supabase } from "../../vxid/supabaseClient";
import { userAccessLevel, canSlusarCompleteTasks } from "../../tablucya/users";
import { showSlusarConfirm } from "./vikno_slusar_confirm";
import { refreshActsTable } from "../../tablucya/tablucya"; // Якщо є така функція
import { showNotification } from "../../tablucya/povidomlennya_tablucya"; // Якщо є така функція

// ======================================
// Цей код вставити НА ПОЧАТКУ обробника кліку кнопки замка (до інших перевірок)
// ======================================
/*

btn.addEventListener("click", async () => {
  btn.disabled = true;

  // 🔵 СПЕЦІАЛЬНА ЛОГІКА ДЛЯ СЛЮСАРЯ - НЕ ЗАКРИВАТИ АКТ, А ЗАПИСУВАТИ slusarsOn
  if (userAccessLevel === "Слюсар") {
    // Перевірка права через settings (setting_id = 3)
    let canToggleSlusarsOn = false;
    try {
      canToggleSlusarsOn = await canSlusarCompleteTasks();
    } catch (err) {
      console.error("Помилка перевірки прав Слюсаря:", err);
    }

    if (!canToggleSlusarsOn) {
      showNotification(
        "❌ У вас немає права для цієї функції. Зверніться до адміністратора.",
        "warning",
        4000
      );
      btn.disabled = false;
      return;
    }

    // Отримання поточного стану slusarsOn
    const { data: actData, error: actFetchError } = await supabase
      .from("acts")
      .select("slusarsOn")
      .eq("act_id", actId)
      .single();

    if (actFetchError) {
      console.error("Помилка отримання slusarsOn:", actFetchError);
      showNotification("Помилка перевірки стану акту", "error");
      btn.disabled = false;
      return;
    }

    const currentSlusarsOn = actData?.slusarsOn === true;

    // 🎨 КРАСИВЕ МОДАЛЬНЕ ВІКНО ЗАМІСТЬ window.confirm()
    let confirmed = false;
    if (!currentSlusarsOn) {
      confirmed = await showSlusarConfirm("Підтвердити виконання всіх робіт?");
    } else {
      confirmed = await showSlusarConfirm("Відмінити завершення робіт?");
    }

    if (!confirmed) {
      showNotification("Скасовано", "warning");
      btn.disabled = false;
      return;
    }

    // Запис в базу даних
    const newSlusarsOn = !currentSlusarsOn;
    const { error: updateError } = await supabase
      .from("acts")
      .update({ slusarsOn: newSlusarsOn })
      .eq("act_id", actId);

    if (updateError) {
      console.error("Помилка оновлення slusarsOn:", updateError);
      showNotification("Помилка збереження", "error");
      btn.disabled = false;
      return;
    }

    // Оновлення UI
    const header = document.querySelector(".zakaz_narayd-header");
    if (header) {
      if (newSlusarsOn) {
        header.classList.add("zakaz_narayd-header-slusar-on");
      } else {
        header.classList.remove("zakaz_narayd-header-slusar-on");
      }
    }

    // Оновлення таблиці актів (якщо є така функція)
    if (typeof refreshActsTable === "function") {
      refreshActsTable();
    }

    showNotification(
      newSlusarsOn ? "✅ Роботи завершено" : "✅ Завершення робіт відмінено",
      "success",
      2000
    );
    btn.disabled = false;
    return; // ⚠️ ВАЖЛИВО: виходимо з функції, не закриваємо акт
  }

  // ✅ ТУТ ПРОДОВЖУЄТЬСЯ СТАРА ЛОГІКА ДЛЯ ІНШИХ РОЛЕЙ (Приймальник, Адміністратор, тощо)
  // ... решта коду обробки кліку ...

*/

// ======================================
// В коді закриття акту (де встановлюється date_off) додати автоматичне скидання slusarsOn:
// ======================================
/*
  // ✅ АВТОМАТИЧНЕ СКИДАННЯ slusarsOn ПРИ ЗАКРИТТІ АКТУ
  // Коли будь-яка інша роль закриває акт (записує date_off),
  // система автоматично встановлює slusarsOn = false
  if (isOpen && !newIsOpen) {
    // Закриваємо акт
    const { error: updateError } = await supabase
      .from("acts")
      .update({
        date_off: new Date().toISOString(),
        slusarsOn: false, // ← АВТОМАТИЧНЕ СКИДАННЯ
      })
      .eq("act_id", actId);

    // ... решта коду закриття
  }
*/

export {};

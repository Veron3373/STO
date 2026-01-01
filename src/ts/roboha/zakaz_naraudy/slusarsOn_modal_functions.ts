/**
 * 💛 Додаткові функції для підтримки slusarsOn в modalMain.ts
 *
 * ⚠️ ВАЖЛИВО: ЦЕЙ ФАЙЛ - ШАБЛОН / ПРИКЛАД КОДУ!
 * Не використовуйте його як окремий модуль!
 *
 * 📝 Інструкція:
 * Скопіюйте код з цього файлу і вставте його в:
 * src/ts/roboha/zakaz_naraudy/modalMain.ts
 *
 * ℹ️ Помилки TypeScript в цьому файлі - це нормально,
 * оскільки імпорти вказані для іншого файлу (modalMain.ts).
 */

import { supabase } from "../../vxid/supabaseClient";
import {
  userAccessLevel,
  userName as currentUserName,
} from "../tablucya/users";

/**
 * 💛 Підписка на зміни slusarsOn для конкретного акту в модальному вікні
 * ✨ НОВИНКА: Для Приймальника показує тільки якщо pruimalnyk === currentUserName
 */
function subscribeToSlusarsOnForModal(
  actId: number,
  actPruimalnyk: string
): void {
  if ((window as any).slusarsOnChannel) {
    supabase.removeChannel((window as any).slusarsOnChannel);
    (window as any).slusarsOnChannel = null;
  }

  // ✅ ФІЛЬТРАЦІЯ: Для Приймальника підписуємось тільки якщо це його акт
  if (userAccessLevel === "Приймальник") {
    if (actPruimalnyk !== currentUserName) {
      console.log(
        `⏭️ Акт ${actId} не для поточного приймальника (${currentUserName} != ${actPruimalnyk}), не підписуємось`
      );
      return; // Не підписуємось
    }
  }

  console.log(`📡 Підписка на зміни slusarsOn для акту ${actId}...`);

  (window as any).slusarsOnChannel = supabase
    .channel(`slusars-on-modal-${actId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "acts",
        filter: `act_id=eq.${actId}`,
      },
      (payload) => {
        console.log("📡 [Realtime UPDATE] Акт оновлено:", payload.new);
        const updatedAct = payload.new;

        if (updatedAct && updatedAct.slusarsOn !== undefined) {
          const slusarsOn = updatedAct.slusarsOn;
          const isClosed = !!updatedAct.date_off;

          // Оновлення заголовка (тільки для відкритих актів)
          const header = document.querySelector(".zakaz_narayd-header");
          if (header) {
            if (slusarsOn && !isClosed) {
              header.classList.add("zakaz_narayd-header-slusar-on");
            } else {
              header.classList.remove("zakaz_narayd-header-slusar-on");
            }
          }
        }
      }
    )
    .subscribe();
}

// ======================================
// В функції де рендериться HTML акту (modalMain.ts) додати:
// ======================================
/*
    const showLockButton = canShowLockButton;

    // 💛 ПЕРЕВІРКА slusarsOn ДЛЯ ФАРБУВАННЯ ЗАГОЛОВКА (ТІЛЬКИ ДЛЯ ВІДКРИТИХ АКТІВ)
    // ✨ НОВИНКА: Для Приймальника показувати тільки якщо pruimalnyk === currentUserName
    const isClosed = !!act.date_off;
    const shouldShowSlusarsOn = act.slusarsOn === true && !isClosed &&
      (userAccessLevel === "Адміністратор" || 
       (userAccessLevel === "Приймальник" && act.pruimalnyk === currentUserName));
    
    const headerClass = shouldShowSlusarsOn
      ? 'zakaz_narayd-header zakaz_narayd-header-slusar-on'
      : 'zakaz_narayd-header';

    body.innerHTML = `
      <div class="${headerClass}">
        <div class="zakaz_narayd-header-info">
          <h1>Shlif service</h1>
          ...
*/

// ======================================
// Після відкриття акту додати виклик (з передачею pruimalnyk):
// ======================================
/*
  // 💛 Підписка на зміни slusarsOn (тільки для Приймальника його актів та Адміністратора)
  subscribeToSlusarsOnForModal(actId, act.pruimalnyk);
*/

export { subscribeToSlusarsOnForModal };

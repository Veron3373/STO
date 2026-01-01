/**
 * 💛 Додаткові функції для підтримки slusarsOn в tablucya.ts
 * ⚠️ ЦЕЙ ФАЙЛ - ЦЕ ШАБЛОН! НЕ ВИКОРИСТОВУЙТЕ ЙОГО ЯК МОДУЛЬ!
 *
 * Інструкція: Скопіюйте код нижче і вставте його в файл:
 * src/ts/roboha/tablucya/tablucya.ts
 *
 * ВАЖЛИВО: Додайте ці імпорти на початку файлу tablucya.ts:
 *
 * import { supabase } from "../../vxid/supabaseClient";
 * import { userAccessLevel, userName as currentUserName } from "./users";
 */

/**
 * 💛 Підписка на зміни slusarsOn в реальному часі для Приймальника та Адміністратора
 * ⚠️ БЕЗ ФІЛЬТРА - щоб ловити зміни і на true, і на false!
 * ✨ НОВИНКА: Для Приймальника показує тільки його акти (де pruimalnyk === currentUserName)
 */
function subscribeToSlusarsOnChanges() {
  // Тільки для Приймальника та Адміністратора
  if (userAccessLevel !== "Приймальник" && userAccessLevel !== "Адміністратор")
    return;

  console.log("📡 Підключення до Realtime змін slusarsOn...");

  supabase
    .channel("slusars-on-changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "acts",
        // ⚠️ БЕЗ ФІЛЬТРА filter: "slusarsOn=eq.true" - ловимо ВСІ зміни!
      },
      (payload) => {
        console.log("📡 [Realtime UPDATE] slusarsOn змінено:", payload.new);
        const updatedAct = payload.new;
        if (updatedAct && updatedAct.act_id) {
          const actId = Number(updatedAct.act_id);
          const slusarsOn = updatedAct.slusarsOn;
          const isClosed = !!updatedAct.date_off;
          const pruimalnyk = updatedAct.pruimalnyk; // ✨ Хто є Приймальником для цього акту

          // ✅ ФІЛЬТРАЦІЯ: Для Приймальника показуємо тільки його акти
          if (userAccessLevel === "Приймальник") {
            if (pruimalnyk !== currentUserName) {
              console.log(
                `⏭️ Акт ${actId} не для поточного приймальника (${currentUserName} != ${pruimalnyk})`
              );
              return; // Пропускаємо
            }
          }

          // Оновлення рядка в таблиці (з урахуванням статусу акту)
          updateRowSlusarsOnInDom(actId, slusarsOn, isClosed);
        }
      }
    )
    .subscribe();
}

/**
 * 💛 Оновлює рядок таблиці за actId, додаючи/видаляючи клас row-slusar-on
 */
function updateRowSlusarsOnInDom(
  actId: number,
  slusarsOn: boolean,
  isClosed: boolean
) {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table"
  );
  if (!table) return;

  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    const firstCell = row.querySelector("td");
    if (firstCell) {
      const cellText = firstCell.textContent || "";
      const cellActId = parseInt(cellText.replace(/\D/g, ""));

      if (cellActId === actId) {
        // Додаємо клас тільки якщо slusarsOn=true І акт відкритий
        if (slusarsOn && !isClosed) {
          row.classList.add("row-slusar-on");
        } else {
          row.classList.remove("row-slusar-on");
        }
      }
    }
  });
}

// ======================================
// В функції renderActsRows додати перед row.appendChild:
// ======================================
/*
    row.classList.add(isClosed ? "row-closed" : "row-open");

    // 💛 ПЕРЕВІРКА slusarsOn ДЛЯ ЗОЛОТИСТОГО ФАРБУВАННЯ (ТІЛЬКИ ДЛЯ ВІДКРИТИХ АКТІВ)
    // ✨ НОВИНКА: Для Приймальника показувати тільки якщо pruimalnyk === currentUserName
    const shouldShowSlusarsOn = act.slusarsOn === true && !isClosed &&
      (userAccessLevel === "Адміністратор" || 
       (userAccessLevel === "Приймальник" && act.pruimalnyk === currentUserName));
    
    if (shouldShowSlusarsOn) {
      row.classList.add("row-slusar-on");
    }

    // ПЕРЕВІРКА ПІДСВІТКИ (СИНЯ РУЧКА)
    if (act.act_id && modifiedActIds.has(Number(act.act_id))) {
      row.classList.add("act-modified-blue-pen");
    }
*/

// ======================================
// В кінці initTable або після завантаження таблиці додати виклик:
// ======================================
/*
  // 💛 АКТИВУЄМО REALTIME ПІДПИСКУ НА ЗМІНИ slusarsOn
  subscribeToSlusarsOnChanges();
*/

export { subscribeToSlusarsOnChanges, updateRowSlusarsOnInDom };

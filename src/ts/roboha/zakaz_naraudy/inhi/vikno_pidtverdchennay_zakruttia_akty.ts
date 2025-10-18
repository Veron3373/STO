// src/ts/roboha/zakaz_naraudy/inhi/vikno_pidtverdchennay_zakruttia_akty.ts
import { showNotification } from "./vspluvauhe_povidomlenna";
import { closeActAndMarkSlyusars } from "./save_work";
import { refreshActsTable } from "../../tablucya/tablucya";
import { ACT_ITEMS_TABLE_CONTAINER_ID } from "../globalCache";
import { userAccessLevel } from "../../tablucya/users";

export const viknoPidtverdchennayZakruttiaAktyId =
  "vikno_pidtverdchennay_zakruttia_akty-modal";

/** Створення DOM елемента модалки */
export function createViknoPidtverdchennayZakruttiaAkty(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = viknoPidtverdchennayZakruttiaAktyId;
  overlay.className = "vikno_pidtverdchennay_zakruttia_akty-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "vikno_pidtverdchennay_zakruttia_akty-content";
  modal.innerHTML = `
    <p id="vikno_pidtverdchennay_zakruttia_akty-message">Підтвердити закриття акту?</p>
    <div class="vikno_pidtverdchennay_zakruttia_akty-buttons save-buttons">
      <button id="vikno_pidtverdchennay_zakruttia_akty-confirm" class="vikno_pidtverdchennay_zakruttia_akty-confirm-btn btn-save-confirm">Так</button>
      <button id="vikno_pidtverdchennay_zakruttia_akty-cancel" class="vikno_pidtverdchennay_zakruttia_akty-cancel-btn btn-save-cancel">Ні</button>
    </div>
  `;
  overlay.appendChild(modal);
  return overlay;
}

/** Гарантовано підвісити модалку в DOM (якщо її ще нема) */
function ensureModalMounted(): HTMLElement {
  let el = document.getElementById(viknoPidtverdchennayZakruttiaAktyId);
  if (!el) {
    el = createViknoPidtverdchennayZakruttiaAkty();
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Перевірка наявності попереджень (трикутників) у таблиці акту
 * Повертає true якщо помилок немає, false якщо є попередження
 */
function checkForWarnings(): boolean {
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return true;

  // Перевіряємо наявність трикутників попередження про кількість
  const qtyWarnings = container.querySelectorAll(
    '.qty-cell[data-warn="1"]'
  );
  
  // Перевіряємо наявність трикутників попередження про ціну
  const priceWarnings = container.querySelectorAll(
    '.price-cell[data-warnprice="1"]'
  );

  // Якщо є будь-які попередження - повертаємо false
  const pomulka = qtyWarnings.length === 0 && priceWarnings.length === 0;
  
  if (!pomulka) {
    console.warn(
      `Знайдено попередження: кількість=${qtyWarnings.length}, ціна=${priceWarnings.length}`
    );
  }

  return pomulka;
}

/**
 * Показ модалки та безпосереднє ЗАКРИТТЯ АКТУ:
 * - виставляє acts.date_off = now,
 * - у slyusars.data.Історія для відповідного дня та Акту ставить "ДатаЗакриття" = сьогодні.
 * Повертає true, якщо закрито; false — якщо скасовано або помилка.
 */
export function showViknoPidtverdchennayZakruttiaAkty(
  actId: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = ensureModalMounted();
    
    // Перевіряємо наявність попереджень
    const pomulka = checkForWarnings();
    const isAdmin = userAccessLevel === "Адміністратор";

    // Якщо є помилки і користувач не адміністратор - блокуємо закриття
    if (!pomulka && !isAdmin) {
      showNotification(
        `Неможливо закрити акт: є попередження про перевищення кількості або низьку ціну. Виправте помилки або зверніться до адміністратора. (Ваш доступ: ${userAccessLevel})`,
        "error",
        5000
      );
      return resolve(false);
    }

    // Змінюємо текст повідомлення залежно від наявності попереджень
    const messageEl = modal.querySelector(
      "#vikno_pidtverdchennay_zakruttia_akty-message"
    ) as HTMLParagraphElement | null;
    
    if (messageEl) {
      if (!pomulka && isAdmin) {
        messageEl.innerHTML = `
          <strong style="color: #ff9800;">⚠️ Увага!</strong><br>
          Виявлено попередження про перевищення кількості або низьку ціну.<br>
          Ви впевнені, що хочете закрити акт?
        `;
      } else {
        messageEl.textContent = "Підтвердити закриття акту?";
      }
    }

    modal.style.display = "flex";

    const confirmBtn = document.getElementById(
      "vikno_pidtverdchennay_zakruttia_akty-confirm"
    ) as HTMLButtonElement | null;
    const cancelBtn = document.getElementById(
      "vikno_pidtverdchennay_zakruttia_akty-cancel"
    ) as HTMLButtonElement | null;

    if (!confirmBtn || !cancelBtn) {
      console.error("Кнопки підтвердження/скасування не знайдені");
      modal.style.display = "none";
      return resolve(false);
    }

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = async () => {
      confirmBtn.disabled = true;
      try {
        showNotification("Закриваємо акт...", "info", 1200);
        await closeActAndMarkSlyusars(actId);
        await refreshActsTable();
        cleanup();
        
        // Додаткове повідомлення якщо акт закрито з попередженнями
        if (!pomulka && isAdmin) {
          showNotification(
            "Акт закрито (з попередженнями)",
            "warning",
            2500
          );
        } else {
          showNotification("Акт успішно закрито", "success", 2000);
        }
        
        resolve(true);
      } catch (e: any) {
        console.error(e);
        showNotification(
          "Помилка при закритті акту: " + (e?.message || e),
          "error",
          2500
        );
        confirmBtn.disabled = false;
        // не закриваємо модалку, щоб можна було повторити
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}
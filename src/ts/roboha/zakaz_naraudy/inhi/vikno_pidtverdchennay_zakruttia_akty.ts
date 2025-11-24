// src/ts/roboha/zakaz_naraudy/inhi/vikno_pidtverdchennay_zakruttia_akty.ts

import { showNotification } from "./vspluvauhe_povidomlenna";
import { closeActAndMarkSlyusars } from "./save_work";
import { refreshActsTable } from "../../tablucya/tablucya";
import { ACT_ITEMS_TABLE_CONTAINER_ID } from "../globalCache";
import { userAccessLevel } from "../../tablucya/users";
import { sendActClosedSMS } from "../../sms/sendActSMS";
import { supabase } from "../../../vxid/supabaseClient";

export const viknoPidtverdchennayZakruttiaAktyId =
  "vikno_pidtverdchennay_zakruttia_akty-modal";

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

function ensureModalMounted(): HTMLElement {
  let el = document.getElementById(viknoPidtverdchennayZakruttiaAktyId);
  if (!el) {
    el = createViknoPidtverdchennayZakruttiaAkty();
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Перевірка наявності попереджень у таблиці акту
 * Повертає true якщо помилок немає, false якщо є попередження
 */
function checkForWarnings(): boolean {
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return true;

  const qtyWarnings = container.querySelectorAll('.qty-cell[data-warn="1"]');
  const priceWarnings = container.querySelectorAll('.price-cell[data-warnprice="1"]');
  const slyusarSumWarnings = container.querySelectorAll('.slyusar-sum-cell[data-warnzp="1"]');

  const pomulka = 
    qtyWarnings.length === 0 && 
    priceWarnings.length === 0 && 
    slyusarSumWarnings.length === 0;
  
  if (!pomulka) {
    console.warn(
      `Знайдено попередження: кількість=${qtyWarnings.length}, ціна=${priceWarnings.length}, зарплата=${slyusarSumWarnings.length}`
    );
  }

  return pomulka;
}

/**
 * Показ модалки підтвердження та закриття акту з відправкою SMS
 * ТЕПЕР:
 *  - не блокує закриття при попередженнях для не-адміністратора
 *  - завжди показує попередження, якщо вони є
 *  - дає користувачу вибрати: закривати чи ні
 */
export function showViknoPidtverdchennayZakruttiaAkty(
  actId: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = ensureModalMounted();

    // Перевіряємо, чи є попередження в таблиці
    const pomulka = checkForWarnings(); // true = без попереджень
    const hasWarnings = !pomulka;

    const messageEl = modal.querySelector(
      "#vikno_pidtverdchennay_zakruttia_akty-message"
    ) as HTMLParagraphElement | null;

    if (messageEl) {
      if (hasWarnings) {
        // Є попередження — показуємо розширений текст
        messageEl.innerHTML = `
          <strong style="color: #ff9800;">⚠️ Увага!</strong><br>
          Виявлено попередження про перевищення кількості, надто низьку ціну
          або зарплату більшу ніж сума роботи.<br>
          Ви впевнені, що хочете закрити акт №${actId}?<br>
          <span style="font-size: 0.9em; opacity: 0.8;">
            Ваш доступ: ${userAccessLevel || "Невідомо"}
          </span>
        `;
      } else {
        // Попереджень немає — стандартний текст
        messageEl.textContent = `Підтвердити закриття акту №${actId}?`;
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

        // Основне закриття акту + розмітка слюсарів
        await closeActAndMarkSlyusars(actId);

        // Отримання даних для SMS
        const { data: act, error: actError } = await supabase
          .from("acts")
          .select("client_id, data")
          .eq("act_id", actId)
          .single();

        if (!actError && act) {
          const { data: client } = await supabase
            .from("clients")
            .select("data")
            .eq("client_id", act.client_id)
            .single();

          const clientData =
            typeof client?.data === "string"
              ? JSON.parse(client.data)
              : client?.data;

          const actData =
            typeof act.data === "string" ? JSON.parse(act.data) : act.data;

          const clientPhone =
            clientData?.["Телефон"] || clientData?.phone || "";
          const clientName =
            clientData?.["ПІБ"] || clientData?.fio || "Клієнт";
          const totalSum = actData?.["Загальна сума"] || 0;

          if (clientPhone) {
            // Відправка SMS (асинхронно, не блокуємо UI)
            sendActClosedSMS(actId, clientPhone, clientName, totalSum).catch(
              (err) => {
                console.error("Помилка відправки SMS:", err);
              }
            );
          } else {
            console.warn("⚠️ Номер телефону клієнта не знайдено");
          }
        }

        await refreshActsTable();
        cleanup();

        if (hasWarnings) {
          showNotification("Акт закрито (з попередженнями)", "warning", 2500);
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
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

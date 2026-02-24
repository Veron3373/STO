// src/ts/roboha/zakaz_naraudy/inhi/faktura.ts

import {
  renderInvoicePreviewModal,
  getCurrentActDataFromDOM,
} from "./fakturaRaxunok";
import { renderActPreviewModal } from "./fakturaAct";
import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";

export const MODAL_ACT_RAXUNOK_ID = "modal-act-raxunok";


/* --- Модальне вікно вибору (Рахунок або Акт) --- */

export function createModalActRaxunok(): HTMLElement {
  const modal = document.createElement("div");
  modal.id = MODAL_ACT_RAXUNOK_ID;
  modal.className = "act-raxunok-overlay hidden";
  modal.innerHTML = `
    <div class="act-raxunok-content">
      <button class="act-raxunok-close" id="act-raxunok-close">✕</button>
      <div class="act-raxunok-header"><h2>Оберіть тип документа</h2></div>
      <div class="act-raxunok-buttons">
        <button class="act-raxunok-btn act-raxunok-btn-invoice" id="create-raxunok-btn">
          <span class="btn-icon">🧾</span>
          <span class="btn-text">Рахунок</span>
          <span class="btn-description">Попередній рахунок</span>
        </button>
        <button class="act-raxunok-btn act-raxunok-btn-act" id="create-act-only-btn">
          <span class="btn-icon">📋</span>
          <span class="btn-text">Акт</span>
          <span class="btn-description">Акт виконаних робіт</span>
        </button>
      </div>
    </div>
  `;
  return modal;
}

export function openModalActRaxunok(): void {
  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  if (!modal) return;
  modal.classList.remove("hidden");
}

export function closeModalActRaxunok(): void {
  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  if (modal) modal.classList.add("hidden");
}

export function initModalActRaxunokHandlers(): void {
  const closeBtn = document.getElementById("act-raxunok-close");
  closeBtn?.addEventListener("click", closeModalActRaxunok);

  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModalActRaxunok();
  });

  // Кнопка "Рахунок"
  const raxunokBtn = document.getElementById("create-raxunok-btn");
  raxunokBtn?.addEventListener("click", async () => {
    try {
      const actData = getCurrentActDataFromDOM();
      if (!actData) {
        showNotification("Помилка: дані акту не знайдено", "error");
        return;
      }

      await renderInvoicePreviewModal(actData);
      closeModalActRaxunok();
    } catch (error) {
      console.error(error);
      showNotification("Помилка при створенні рахунку", "error");
    }
  });

  // Кнопка "Акт" - ЗМІНЕНО
  const actBtn = document.getElementById("create-act-only-btn");
  actBtn?.addEventListener("click", async () => {
    try {
      // 1. Отримуємо поточні дані з DOM
      const actData = getCurrentActDataFromDOM();
      if (!actData) {
        showNotification("Помилка: дані акту не знайдено", "error");
        return;
      }

      // 2. Отримуємо ID акту з DOM
      const actNumberSpan = document.getElementById("act-number");
      const extractedActId = actNumberSpan
        ? parseInt(actNumberSpan.innerText.trim())
        : 0;

      // Ініціалізуємо змінні в об'єкті actData
      actData.realActId = extractedActId;
      actData.foundFakturaId = null;
      actData.foundContrAgentRaxunok = null; // Нове поле
      actData.foundContrAgentRaxunokData = null; // Нове поле

      // 3. Якщо ID валідний, робимо розширений запит до БД
      if (extractedActId > 0) {
        const { data: dbData, error } = await supabase
          .from("acts")
          // 👇 ДОДАЛИ НОВІ ПОЛЯ В SELECT
          .select("faktura_id, contrAgent_raxunok, contrAgent_raxunok_data")
          .eq("act_id", extractedActId)
          .single();

        if (error) {
          console.error("❌ Помилка пошуку в БД acts:", error);
        } else if (dbData) {
          // 4. Записуємо отримані дані
          actData.foundFakturaId = dbData.faktura_id;
          actData.foundContrAgentRaxunok = dbData.contrAgent_raxunok; // Зберігаємо номер
          actData.foundContrAgentRaxunokData = dbData.contrAgent_raxunok_data; // Зберігаємо дату

        }
      }

      // 5. Викликаємо рендер
      await renderActPreviewModal(actData);

      closeModalActRaxunok();
    } catch (error) {
      console.error(error);
      showNotification("Помилка при створенні акту", "error");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModalActRaxunok();
  });
}

export function initCreateActRaxunokButton(): void {
  const createActBtn = document.getElementById("create-act-btn");
  if (!createActBtn) return;

  const newBtn = createActBtn.cloneNode(true) as HTMLElement;
  createActBtn.parentNode?.replaceChild(newBtn, createActBtn);

  newBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    openModalActRaxunok();
  });
}

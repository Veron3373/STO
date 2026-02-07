// ===== ФАЙЛ: src/ts/roboha/planyvannya/planyvannya_realtime.ts =====
// Realtime підписка на зміни в таблиці post_arxiv
// Автоматично оновлює календар планувальника для всіх підключених користувачів

import "../../../scss/robocha/planyvannya/_planyvannya_realtime.scss";
import { supabase } from "../../vxid/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

let postArxivChannel: RealtimeChannel | null = null;

// ── Debounce для оновлення блоків ──
// Якщо прилетить 5 подій за 300мс — оновимо лише 1 раз
let refreshDebounceTimer: number | null = null;
const REFRESH_DEBOUNCE_MS = 300;

function debouncedRefreshPlanner(): void {

  if (refreshDebounceTimer !== null) {

    window.clearTimeout(refreshDebounceTimer);
  }
  refreshDebounceTimer = window.setTimeout(() => {
    refreshDebounceTimer = null;
    if (typeof (window as any).refreshPlannerCalendar === "function") {
      (window as any).refreshPlannerCalendar();
    } else {
    }
  }, REFRESH_DEBOUNCE_MS);
}

// ── Toast-повідомлення про зміни ──

const TOAST_CONTAINER_ID = "planyvannya-realtime-toasts";
let toastAutoHideTimers: Map<string, number> = new Map();

function getOrCreateToastContainer(): HTMLElement {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = TOAST_CONTAINER_ID;
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Отримує ПІБ поточного користувача з localStorage
 */
function getCurrentUserName(): string | null {
  try {
    const stored = localStorage.getItem("userAuthData");
    if (!stored) return null;
    const data = JSON.parse(stored);
    return data.Name || null;
  } catch {
    return null;
  }
}



/**
 * Парсить ПІБ клієнта з поля client_id (формат: "ПІБ|||Телефон" або число)
 */
function parseClientName(clientId: string | number | null): string {
  if (!clientId) return "";
  const str = String(clientId);
  if (str.includes("|||")) return str.split("|||")[0] || "";
  return "";
}

/**
 * Парсить дані авто з поля cars_id (формат: "Модель|||Номер" або число)
 */
function parseCarInfo(carsId: string | number | null): string {
  if (!carsId) return "";
  const str = String(carsId);
  if (str.includes("|||")) {
    const parts = str.split("|||");
    return [parts[0], parts[1]].filter(Boolean).join(" ");
  }
  return "";
}



/**
 * Отримує ім'я слюсаря по ID з Supabase
 */
async function getSlyusarName(id: number | string): Promise<string> {
  if (!id) return "Невідомий";
  try {
    const { data } = await supabase
      .from("slyusars")
      .select("data")
      .eq("slyusar_id", id)
      .single();

    if (data && data.data && data.data.Name) {
      return data.data.Name;
    }
  } catch (e) {
    console.error("Error fetching slyusar name:", e);
  }
  return String(id);
}

const START_HOUR = 8;
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) + START_HOUR;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Показує toast-повідомлення про зміну в планувальнику
 */
async function showRealtimeToast(
  type: "insert" | "update" | "delete",
  record: any,
  _oldRecord?: any
): Promise<void> {
  const container = getOrCreateToastContainer();
  const toastId = `prt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const icons: Record<string, string> = {
    insert: "📌",
    update: "✏️",
    delete: "🗑️",
  };
  const labels: Record<string, string> = {
    insert: "Нове бронювання",
    update: "Змінено бронювання",
    delete: "Видалено бронювання",
  };
  const colors: Record<string, string> = {
    insert: "#10b981",
    update: "#f59e0b",
    delete: "#ef4444",
  };

  const statusColors: Record<string, string> = {
    "Запланований": "#e6a700",
    "В роботі": "#2e7d32",
    "Відремонтований": "#757575",
    "Не приїхав": "#e53935",
  };

  let slyusarHtml = "";
  let timeHtml = "";
  let statusHtml = "";

  // Отримуємо поточні (нові) значення
  const newSlyusarId = String(record.slyusar_id);
  const newName = await getSlyusarName(newSlyusarId);

  const dateOn = new Date(record.data_on);
  const dateOff = new Date(record.data_off);
  const newStartMins = (dateOn.getUTCHours() - START_HOUR) * 60 + dateOn.getUTCMinutes();
  const newEndMins = (dateOff.getUTCHours() - START_HOUR) * 60 + dateOff.getUTCMinutes();
  const newTimeStr = `${minutesToTime(newStartMins)} - ${minutesToTime(newEndMins)}`;
  const newStatus = record.status || "Запланований";

  // Default display values
  slyusarHtml = `<span class="prt-value">${newName}</span>`;
  timeHtml = `<span class="prt-value">${newTimeStr}</span>`;
  statusHtml = `<span class="prt-value">${newStatus}</span>`;

  // 🕵️‍♂️ Логіка порівняння для UPDATE (визначаємо чи були зміни)
  if (type === "update") {
    const block = document.querySelector(
      `.post-reservation-block[data-post-arxiv-id="${record.post_arxiv_id}"]`
    ) as HTMLElement;

    if (block) {
      // --- Перевірка зміни СЛЮСАРЯ ---
      const oldSlyusarId = block.dataset.slyusarId;
      if (oldSlyusarId && oldSlyusarId !== newSlyusarId) {
        const oldName = await getSlyusarName(oldSlyusarId);
        slyusarHtml = `<span class="prt-value">Заміна <span style="color: #ef4444; font-weight: bold;">${oldName}</span> ➝ <span style="color: #10b981; font-weight: bold;">${newName}</span></span>`;
      }

      // --- Перевірка зміни ЧАСУ ---
      const oldStartMins = parseInt(block.dataset.start || "0");
      const oldEndMins = parseInt(block.dataset.end || "0");

      if (Math.abs(oldStartMins - newStartMins) > 1 || Math.abs(oldEndMins - newEndMins) > 1) {
        const oldTimeStr = `${minutesToTime(oldStartMins)} - ${minutesToTime(oldEndMins)}`;
        timeHtml = `<span class="prt-value">Заміна <span style="color: #ef4444; font-weight: bold;">${oldTimeStr}</span> ➝ <span style="color: #10b981; font-weight: bold;">${newTimeStr}</span></span>`;
      }

      // --- Перевірка зміни СТАТУСУ ---
      const oldStatus = block.dataset.status || "Запланований";
      if (oldStatus !== newStatus) {
        const oldColor = statusColors[oldStatus] || "#ccc";
        const newColor = statusColors[newStatus] || "#ccc";

        statusHtml = `<span class="prt-value">Заміна <span style="background-color: ${oldColor}; color: white; padding: 2px 8px; border-radius: 50px; font-weight: bold;">${oldStatus}</span> ➝ <span style="background-color: ${newColor}; color: white; padding: 2px 8px; border-radius: 50px; font-weight: bold;">${newStatus}</span></span>`;
      }
    }
  }

  const clientName = parseClientName(record.client_id);
  const carInfo = parseCarInfo(record.cars_id);

  const changedBy = record.xto_zapusav || "Невідомо";

  const toast = document.createElement("div");
  toast.className = "planyvannya-realtime-toast";
  toast.id = toastId;
  toast.style.borderLeftColor = colors[type];

  toast.innerHTML = `
    <div class="prt-header">
      <span class="prt-icon">${icons[type]}</span>
      <span class="prt-label" style="color: ${colors[type]}">${labels[type]}</span>
      <button class="prt-close" title="Закрити">&times;</button>
    </div>
    ${clientName ? `<div class="prt-row"><span class="prt-emoji">👤</span><span class="prt-value">${clientName}</span></div>` : ""}
    ${carInfo ? `<div class="prt-row"><span class="prt-emoji">🚗</span><span class="prt-value">${carInfo}</span></div>` : ""}
    <div class="prt-row" style="margin-top: 4px;"><span class="prt-emoji">👨‍🔧</span>${slyusarHtml}</div>
    <div class="prt-row" style="margin-top: 4px;"><span class="prt-emoji">🕐</span>${timeHtml}</div>
    <div class="prt-row" style="margin-top: 4px;"><span class="prt-emoji">📋</span>${statusHtml}</div>
    <div class="prt-footer">
      <span class="prt-who">${changedBy}</span>
    </div>
  `;

  // Закриття по кнопці
  toast.querySelector(".prt-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    removeToast(toast, toastId);
  });

  container.appendChild(toast);

  // Анімація появи
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("prt-show");
    });
  });

  // Автоматичне зникнення через 8 секунд
  const timer = window.setTimeout(() => {
    removeToast(toast, toastId);
  }, 8000);
  toastAutoHideTimers.set(toastId, timer);

  // Зупиняємо таймер при hover
  toast.addEventListener("mouseenter", () => {
    const t = toastAutoHideTimers.get(toastId);
    if (t) {
      window.clearTimeout(t);
      toastAutoHideTimers.delete(toastId);
    }
  });

  // Відновлюємо таймер після mouseleave
  toast.addEventListener("mouseleave", () => {
    const newTimer = window.setTimeout(() => {
      removeToast(toast, toastId);
    }, 4000);
    toastAutoHideTimers.set(toastId, newTimer);
  });

  // Звук нотифікації
  playRealtimeSound(type);
}

function removeToast(toast: HTMLElement, toastId: string): void {
  if (toast.classList.contains("prt-removing")) return;
  toast.classList.add("prt-removing");
  toast.classList.remove("prt-show");

  const timer = toastAutoHideTimers.get(toastId);
  if (timer) {
    window.clearTimeout(timer);
    toastAutoHideTimers.delete(toastId);
  }

  setTimeout(() => {
    toast.remove();
  }, 400);
}

/**
 * Простий звук нотифікації
 */
function playRealtimeSound(type: "insert" | "update" | "delete"): void {
  try {
    const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;

    const ctx = new AudioCtxClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    const freqs: Record<string, number> = { insert: 880, update: 660, delete: 440 };
    osc.frequency.setValueAtTime(freqs[type] || 660, ctx.currentTime);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // ігноруємо
  }
}

// ── Оновлення індикаторів зайнятості ──

function refreshOccupancyForRecord(record: any): void {
  if (!record?.data_on) return;
  const dateStr = record.data_on.split("T")[0];
  if (dateStr && typeof (window as any).refreshOccupancyIndicatorsForDates === "function") {
    setTimeout(() => (window as any).refreshOccupancyIndicatorsForDates([dateStr]), 200);
  }
}

// ── Головна функція підписки ──

/**
 * Ініціалізація Realtime підписки на зміни в post_arxiv.
 * Слухає INSERT / UPDATE / DELETE і автоматично оновлює
 * календар планувальника для ВСІХ користувачів.
 */
export function initPostArxivRealtimeSubscription(): void {
  // Робимо доступним глобально для налагодження
  (window as any).restartRealtime = initPostArxivRealtimeSubscription;


  // Перевіряємо чи ми на сторінці планувальника
  if (!document.getElementById("postSchedulerWrapper")) {

    return;
  }



  // Відписуємось від існуючого каналу, якщо є
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
  }

  const currentUserName = getCurrentUserName();


  // Генеруємо унікальну назву каналу, щоб уникнути конфліктів
  const channelId = `post-arxiv-changes-${Date.now()}`;


  // Використовуємо окремі handler-и для кожного типу подій, як у працюючому act_changes_notifications
  postArxivChannel = supabase
    .channel(channelId)
    // 🟢 INSERT
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        try {
          const record = payload.new as any;


          // Toast тільки для ЧУЖИХ змін
          if (!currentUserName || record?.xto_zapusav !== currentUserName) {
            showRealtimeToast("insert", record);
          } else {
          }

          debouncedRefreshPlanner();
          refreshOccupancyForRecord(record);
        } catch (err) {
        }
      }
    )
    // 🟡 UPDATE
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        try {
          const record = payload.new as any;
          const oldRecord = payload.old as any;


          if (!currentUserName || record?.xto_zapusav !== currentUserName) {
            showRealtimeToast("update", record, oldRecord);
          } else {
          }

          debouncedRefreshPlanner();
          refreshOccupancyForRecord(record);
          if (oldRecord?.data_on) {
            refreshOccupancyForRecord(oldRecord);
          }
        } catch (err) {
        }
      }
    )
    // 🔴 DELETE
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        try {
          const oldRecord = payload.old as any;

          // Знаходимо блок в DOM перед видаленням, щоб отримати всі дані
          let enrichedRecord = { ...oldRecord };

          if (oldRecord?.post_arxiv_id) {
            const block = document.querySelector(
              `.post-reservation-block[data-post-arxiv-id="${oldRecord.post_arxiv_id}"]`
            ) as HTMLElement;

            if (block) {
              // Отримуємо дані з DOM-елемента
              const clientName = block.dataset.clientName || "";
              const carModel = block.dataset.carModel || "";
              const carNumber = block.dataset.carNumber || "";

              // Формуємо client_id та cars_id у форматі "ПІБ|||Телефон" та "Модель|||Номер"
              enrichedRecord.client_id = clientName ? `${clientName}|||${block.dataset.clientPhone || ""}` : "";
              enrichedRecord.cars_id = carModel ? `${carModel}|||${carNumber}` : "";
              enrichedRecord.slyusar_id = block.dataset.slyusarId || "";
              enrichedRecord.status = block.dataset.status || "Запланований";
              enrichedRecord.xto_zapusav = block.dataset.xtoZapusav || "Невідомо";

              // Відновлюємо дати з хвилин
              const startMins = parseInt(block.dataset.start || "0");
              const endMins = parseInt(block.dataset.end || "0");

              // Отримуємо поточну дату з заголовку
              const headerEl = document.getElementById("postHeaderDateDisplay");
              let currentDate = new Date().toISOString().split("T")[0]; // fallback

              if (headerEl) {
                const text = headerEl.textContent;
                const months: Record<string, string> = {
                  "січня": "01", "лютого": "02", "березня": "03", "квітня": "04",
                  "травня": "05", "червня": "06", "липня": "07", "серпня": "08",
                  "вересня": "09", "жовтня": "10", "листопада": "11", "грудня": "12"
                };
                const match = text?.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
                if (match) {
                  const day = match[1].padStart(2, "0");
                  const monthName = match[2].toLowerCase();
                  const year = match[3];
                  const month = months[monthName];
                  if (month) {
                    currentDate = `${year}-${month}-${day}`;
                  }
                }
              }

              // Конвертуємо хвилини назад в UTC час
              const startHour = Math.floor(startMins / 60) + START_HOUR;
              const startMin = startMins % 60;
              const endHour = Math.floor(endMins / 60) + START_HOUR;
              const endMin = endMins % 60;

              enrichedRecord.data_on = `${currentDate}T${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`;
              enrichedRecord.data_off = `${currentDate}T${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`;

              // Тепер видаляємо блок
              block.remove();
            }
          }

          // Показуємо toast про видалення ТІЛЬКИ для ЧУЖИХ змін
          if (!currentUserName || enrichedRecord?.xto_zapusav !== currentUserName) {
            showRealtimeToast("delete", enrichedRecord);
          }

          debouncedRefreshPlanner();

          if (enrichedRecord?.data_on) {
            refreshOccupancyForRecord(enrichedRecord);
          }
        } catch (err) {
        }
      }
    )
    .subscribe((status) => {

      if (status === "SUBSCRIBED") {
      } else if (status === "CHANNEL_ERROR") {
      } else if (status === "TIMED_OUT") {
      } else if (status === "CLOSED") {
      }
    });
}

/**
 * Відписка від каналу
 */
export function unsubscribeFromPostArxivRealtime(): void {
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;

  }
}

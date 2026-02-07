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
 * Форматує час із timestamp для toast
 */
function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
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
    delete: "❌",
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

  let changesHtml = "";

  // 🕵️‍♂️ Логіка порівняння для UPDATE
  if (type === "update") {
    // Спробуємо знайти старий блок в DOM для отримання попередніх значень
    const block = document.querySelector(
      `.post-reservation-block[data-post-arxiv-id="${record.post_arxiv_id}"]`
    ) as HTMLElement;

    if (block) {
      // --- Перевірка зміни СЛЮСАРЯ ---
      const oldSlyusarId = block.dataset.slyusarId;
      const newSlyusarId = String(record.slyusar_id);

      if (oldSlyusarId && oldSlyusarId !== newSlyusarId) {
        // Отримуємо імена
        const oldName = await getSlyusarName(oldSlyusarId);
        const newName = await getSlyusarName(newSlyusarId);

        changesHtml += `
          <div class="prt-row" style="margin-top: 4px;">
            <span class="prt-emoji">👨‍🔧</span>
            <span class="prt-value">
              Заміна слюсаря з <span style="color: #ef4444; font-weight: bold;">${oldName}</span> 
              на <span style="color: #10b981; font-weight: bold;">${newName}</span>
            </span>
          </div>
        `;
      }

      // --- Перевірка зміни ЧАСУ ---
      const oldStartMins = parseInt(block.dataset.start || "0");
      const oldEndMins = parseInt(block.dataset.end || "0");

      // Новий час (парсимо з ISO)
      const dateOn = new Date(record.data_on);
      const dateOff = new Date(record.data_off);

      const newStartMins = (dateOn.getUTCHours() - START_HOUR) * 60 + dateOn.getUTCMinutes();
      const newEndMins = (dateOff.getUTCHours() - START_HOUR) * 60 + dateOff.getUTCMinutes();

      // Порівнюємо (допускаємо похибку пари хвилин або точне співпадіння)
      if (Math.abs(oldStartMins - newStartMins) > 1 || Math.abs(oldEndMins - newEndMins) > 1) {
        const oldTimeStr = `${minutesToTime(oldStartMins)} - ${minutesToTime(oldEndMins)}`;
        const newTimeStr = `${minutesToTime(newStartMins)} - ${minutesToTime(newEndMins)}`;

        changesHtml += `
          <div class="prt-row" style="margin-top: 4px;">
            <span class="prt-emoji">🕒</span>
            <span class="prt-value">
              Зміна з <span style="color: #ef4444; font-weight: bold;">${oldTimeStr}</span> 
              на <span style="color: #10b981; font-weight: bold;">${newTimeStr}</span>
            </span>
          </div>
        `;
      }
    }
  }

  const clientName = parseClientName(record.client_id);
  const carInfo = parseCarInfo(record.cars_id);
  const timeOn = record.data_on ? formatTime(record.data_on) : "";
  const timeOff = record.data_off ? formatTime(record.data_off) : "";

  // Якщо ми показали детальну зміну часу, стандартний timeRange можна не показувати або залишити
  // Залишимо як базову інфу
  const timeRange = timeOn && timeOff ? `${timeOn} – ${timeOff}` : "";

  const changedBy = record.xto_zapusav || "Невідомо";
  const status = record.status || "";

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
    ${changesHtml} <!-- Сюди вставляємо наші зміни -->
    ${(!changesHtml && clientName) ? `<div class="prt-row"><span class="prt-emoji">👤</span><span class="prt-value">${clientName}</span></div>` : ""}
    ${(!changesHtml && carInfo) ? `<div class="prt-row"><span class="prt-emoji">🚗</span><span class="prt-value">${carInfo}</span></div>` : ""}
    ${(!changesHtml && timeRange) ? `<div class="prt-row"><span class="prt-emoji">🕐</span><span class="prt-value">${timeRange}</span></div>` : ""}
    ${(!changesHtml && status) ? `<div class="prt-row"><span class="prt-emoji">📋</span><span class="prt-value">${status}</span></div>` : ""}
    ${(changesHtml) ? `<div class="prt-row" style="margin-top:5px; border-top:1px solid #eee; padding-top:5px;"><span class="prt-value" style="font-size:11px; color:#888;">${clientName} • ${carInfo}</span></div>` : ""}
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


          // Показуємо toast про видалення
          showRealtimeToast("delete", oldRecord);

          // Видаляємо блок з DOM, якщо є
          if (oldRecord?.post_arxiv_id) {
            const block = document.querySelector(
              `.post-reservation-block[data-post-arxiv-id="${oldRecord.post_arxiv_id}"]`
            );
            if (block) {
              block.remove();
            }
          }

          debouncedRefreshPlanner();

          if (oldRecord?.data_on) {
            refreshOccupancyForRecord(oldRecord);
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

// ===== ФАЙЛ: src/ts/roboha/planyvannya/planyvannya_realtime.ts =====
// Realtime підписка на зміни в таблиці post_arxiv
// Автоматично оновлює календар планувальника для всіх підключених користувачів

import "../../../scss/robocha/planyvannya/_planyvannya_realtime.scss";
import { supabase } from "../../vxid/supabaseClient";

let postArxivChannel: any = null;

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
 * Отримує поточну дату з заголовку планувальника (YYYY-MM-DD)
 */
function getCurrentDateFromHeader(): string | null {
  const headerEl = document.getElementById("postHeaderDateDisplay");
  if (!headerEl || !headerEl.textContent) return null;

  const months: Record<string, string> = {
    січня: "01", лютого: "02", березня: "03", квітня: "04",
    травня: "05", червня: "06", липня: "07", серпня: "08",
    вересня: "09", жовтня: "10", листопада: "11", грудня: "12",
  };

  const match = headerEl.textContent.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (!match) return null;

  const day = match[1].padStart(2, "0");
  const month = months[match[2].toLowerCase()];
  const year = match[3];

  return month ? `${year}-${month}-${day}` : null;
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
 * Показує toast-повідомлення про зміну в планувальнику
 */
function showRealtimeToast(
  type: "insert" | "update" | "delete",
  record: any
): void {
  const container = getOrCreateToastContainer();
  const toastId = `planyvannya-toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

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

  const clientName = parseClientName(record.client_id);
  const carInfo = parseCarInfo(record.cars_id);
  const timeOn = record.data_on ? formatTime(record.data_on) : "";
  const timeOff = record.data_off ? formatTime(record.data_off) : "";
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
    ${clientName ? `<div class="prt-row"><span class="prt-emoji">👤</span><span class="prt-value">${clientName}</span></div>` : ""}
    ${carInfo ? `<div class="prt-row"><span class="prt-emoji">🚗</span><span class="prt-value">${carInfo}</span></div>` : ""}
    ${timeRange ? `<div class="prt-row"><span class="prt-emoji">🕐</span><span class="prt-value">${timeRange}</span></div>` : ""}
    ${status ? `<div class="prt-row"><span class="prt-emoji">📋</span><span class="prt-value">${status}</span></div>` : ""}
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

  // Зупиняємо таймер якщо hover
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
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
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

// ── Головна функція підписки ──

/**
 * Перевіряє, чи зміна стосується поточної дати в планувальнику
 */
function isRecordForCurrentDate(record: any): boolean {
  const currentDate = getCurrentDateFromHeader();
  if (!currentDate || !record.data_on) return false;

  const recordDate = record.data_on.split("T")[0];
  return recordDate === currentDate;
}

/**
 * Оновлює блоки планувальника: очищає і перезавантажує
 */
function refreshPlannerBlocks(): void {
  if (typeof (window as any).refreshPlannerCalendar === "function") {
    (window as any).refreshPlannerCalendar();
  }
}

/**
 * Ініціалізація Realtime підписки на зміни в post_arxiv
 */
export function initPostArxivRealtimeSubscription(): void {
  console.log("📡 Ініціалізація Realtime підписки на post_arxiv...");

  // Відписуємось від існуючого каналу, якщо є
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
  }

  const currentUserName = getCurrentUserName();

  postArxivChannel = supabase
    .channel("post-arxiv-realtime")

    // ── INSERT: нове бронювання ──
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        console.log("📌 [Realtime] INSERT в post_arxiv:", payload.new);

        const record = payload.new as any;

        // Не показуємо toast для власних змін
        if (currentUserName && record.xto_zapusav === currentUserName) {
          // Але все одно оновлюємо блоки — може з'явитись в іншому часі
          if (isRecordForCurrentDate(record)) {
            refreshPlannerBlocks();
          }
          return;
        }

        // Показуємо toast
        showRealtimeToast("insert", record);

        // Оновлюємо блоки, якщо зміна стосується поточної дати
        if (isRecordForCurrentDate(record)) {
          refreshPlannerBlocks();
        }

        // Оновлюємо індикатори зайнятості
        refreshOccupancyForRecord(record);
      }
    )

    // ── UPDATE: зміна бронювання ──
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        console.log("✏️ [Realtime] UPDATE в post_arxiv:", payload.new);

        const record = payload.new as any;
        const oldRecord = payload.old as any;

        // Не показуємо toast для власних змін
        if (currentUserName && record.xto_zapusav === currentUserName) {
          if (isRecordForCurrentDate(record)) {
            refreshPlannerBlocks();
          }
          return;
        }

        // Показуємо toast
        showRealtimeToast("update", record);

        // Оновлюємо блоки для поточної дати
        if (isRecordForCurrentDate(record) || isRecordForCurrentDate(oldRecord || {})) {
          refreshPlannerBlocks();
        }

        // Оновлюємо індикатори зайнятості
        refreshOccupancyForRecord(record);
        if (oldRecord?.data_on) {
          refreshOccupancyForRecord(oldRecord);
        }
      }
    )

    // ── DELETE: видалення бронювання ──
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        console.log("🗑️ [Realtime] DELETE в post_arxiv:", payload.old);

        const oldRecord = payload.old as any;

        // При DELETE Supabase повертає тільки primary key (якщо нема REPLICA IDENTITY FULL)
        // Тому ми просто перезавантажуємо блоки для безпеки
        if (oldRecord.post_arxiv_id) {
          // Видаляємо блок з DOM напряму за post_arxiv_id
          const block = document.querySelector(
            `.post-reservation-block[data-post-arxiv-id="${oldRecord.post_arxiv_id}"]`
          );

          if (block) {
            // Показуємо toast лише якщо блок видно (тобто дата збігається)
            showRealtimeToast("delete", oldRecord);
            block.remove();
          } else {
            // Якщо блок не знайдений в DOM — можливо інша дата, просто ігноруємо
            // або перезавантажуємо на всяк випадок
            showRealtimeToast("delete", oldRecord);
          }

          // Фолбек: перезавантажуємо всі блоки
          refreshPlannerBlocks();
        } else {
          // Нема ID — перезавантажуємо все
          refreshPlannerBlocks();
        }

        // Оновлюємо індикатори зайнятості
        if (oldRecord?.data_on) {
          refreshOccupancyForRecord(oldRecord);
        } else {
          // Якщо дати нема в payload — оновлюємо для поточної дати
          const currentDate = getCurrentDateFromHeader();
          if (currentDate && typeof (window as any).refreshOccupancyIndicatorsForDates === "function") {
            setTimeout(() => (window as any).refreshOccupancyIndicatorsForDates([currentDate]), 200);
          }
        }
      }
    )

    .subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        console.log("✅ Realtime підписка на post_arxiv активна");
      } else if (status === "CHANNEL_ERROR") {
        console.error("❌ Помилка Realtime підписки на post_arxiv");
      }
    });
}

/**
 * Оновлює індикатори зайнятості для дати запису
 */
function refreshOccupancyForRecord(record: any): void {
  if (!record?.data_on) return;
  const dateStr = record.data_on.split("T")[0];
  if (dateStr && typeof (window as any).refreshOccupancyIndicatorsForDates === "function") {
    setTimeout(() => (window as any).refreshOccupancyIndicatorsForDates([dateStr]), 200);
  }
}

/**
 * Відписка від каналу (використовується при виході зі сторінки)
 */
export function unsubscribeFromPostArxivRealtime(): void {
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
    console.log("🔌 Realtime підписка на post_arxiv відключена");
  }
}

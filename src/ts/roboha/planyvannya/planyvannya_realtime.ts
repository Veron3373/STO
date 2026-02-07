// ===== ФАЙЛ: src/ts/roboha/planyvannya/planyvannya_realtime.ts =====
// Realtime підписка на зміни в таблиці post_arxiv
// Автоматично оновлює календар планувальника для всіх підключених користувачів

import "../../../scss/robocha/planyvannya/_planyvannya_realtime.scss";
import { supabase } from "../../vxid/supabaseClient";

let postArxivChannel: any = null;

// ── Debounce для оновлення блоків ──
// Якщо прилетить 5 подій за 200мс — оновимо лише 1 раз
let refreshDebounceTimer: number | null = null;
const REFRESH_DEBOUNCE_MS = 300;

function debouncedRefreshPlanner(): void {
  if (refreshDebounceTimer !== null) {
    window.clearTimeout(refreshDebounceTimer);
  }
  refreshDebounceTimer = window.setTimeout(() => {
    refreshDebounceTimer = null;
    console.log("🔄 [Realtime] Оновлюю блоки планувальника...");
    if (typeof (window as any).refreshPlannerCalendar === "function") {
      (window as any).refreshPlannerCalendar();
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
 * Показує toast-повідомлення про зміну в планувальнику
 */
function showRealtimeToast(
  type: "insert" | "update" | "delete",
  record: any
): void {
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
  console.log("📡 [Realtime] Ініціалізація підписки на post_arxiv...");

  // Відписуємось від існуючого каналу, якщо є
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
  }

  const currentUserName = getCurrentUserName();
  console.log("📡 [Realtime] Поточний користувач:", currentUserName || "невідомо");

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

        // Toast тільки для ЧУЖИХ змін
        if (!currentUserName || record.xto_zapusav !== currentUserName) {
          showRealtimeToast("insert", record);
        }

        // Оновлюємо блоки ЗАВЖДИ (і для себе, і для інших)
        debouncedRefreshPlanner();
        refreshOccupancyForRecord(record);
      }
    )

    // ── UPDATE: зміна бронювання (час, статус, ПІБ тощо) ──
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

        // Toast тільки для ЧУЖИХ змін
        if (!currentUserName || record.xto_zapusav !== currentUserName) {
          showRealtimeToast("update", record);
        }

        // Оновлюємо блоки ЗАВЖДИ
        debouncedRefreshPlanner();
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

        // Показуємо toast (при DELETE нема xto_zapusav, показуємо завжди)
        showRealtimeToast("delete", oldRecord);

        // Видаляємо блок з DOM, якщо є
        if (oldRecord.post_arxiv_id) {
          const block = document.querySelector(
            `.post-reservation-block[data-post-arxiv-id="${oldRecord.post_arxiv_id}"]`
          );
          if (block) block.remove();
        }

        // Оновлюємо блоки ЗАВЖДИ
        debouncedRefreshPlanner();

        if (oldRecord?.data_on) {
          refreshOccupancyForRecord(oldRecord);
        }
      }
    )

    .subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        console.log("✅ [Realtime] Підписка на post_arxiv АКТИВНА! Зміни будуть транслюватися автоматично.");
      } else if (status === "CHANNEL_ERROR") {
        console.error("❌ [Realtime] ПОМИЛКА підписки на post_arxiv! Перевірте чи ввімкнено Realtime для таблиці в Supabase.");
      } else if (status === "TIMED_OUT") {
        console.warn("⏱️ [Realtime] Таймаут підписки на post_arxiv. Спроба перепідключення...");
      } else {
        console.log("📡 [Realtime] Статус підписки:", status);
      }
    });
}

/**
 * Відписка від каналу (використовується при виході зі сторінки)
 */
export function unsubscribeFromPostArxivRealtime(): void {
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
    console.log("🔌 [Realtime] Підписка на post_arxiv відключена");
  }
}

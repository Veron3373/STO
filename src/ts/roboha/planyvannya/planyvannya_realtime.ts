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
    console.log("🔄 [PostArxiv Realtime] Оновлюю блоки планувальника...");
    if (typeof (window as any).refreshPlannerCalendar === "function") {
      (window as any).refreshPlannerCalendar();
    } else {
      console.warn("⚠️ [PostArxiv Realtime] refreshPlannerCalendar не знайдено!");
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
  // Перевіряємо чи ми на сторінці планувальника
  if (!document.getElementById("postSchedulerWrapper")) {
    console.log("📡 [PostArxiv Realtime] Не на сторінці планувальника — підписку не ініціалізуємо");
    return;
  }

  console.log("📡 [PostArxiv Realtime] Ініціалізація підписки на post_arxiv...");

  // Відписуємось від існуючого каналу, якщо є
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
  }

  const currentUserName = getCurrentUserName();
  console.log("📡 [PostArxiv Realtime] Поточний користувач:", currentUserName || "невідомо");

  // Використовуємо один handler для всіх типів подій, як у працюючому Realtime по складу
  postArxivChannel = supabase
    .channel("post-arxiv-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "post_arxiv",
      },
      (payload) => {
        const eventType = payload.eventType;
        const record = payload.new as any;
        const oldRecord = payload.old as any;

        console.log(`📡 [PostArxiv Realtime] Подія ${eventType}:`, {
          new: record,
          old: oldRecord,
        });

        if (eventType === "INSERT") {
          console.log(`✅ [PostArxiv Realtime] INSERT - Новий запис:`, record);
          // Toast тільки для ЧУЖИХ змін
          if (!currentUserName || record?.xto_zapusav !== currentUserName) {
            console.log(`📨 [PostArxiv Realtime] Показуємо toast для INSERT від ${record?.xto_zapusav}`);
            showRealtimeToast("insert", record);
          } else {
            console.log(`🔇 [PostArxiv Realtime] Пропускаємо toast - це власна зміна`);
          }

          debouncedRefreshPlanner();
          refreshOccupancyForRecord(record);
        } else if (eventType === "UPDATE") {
          console.log(`✅ [PostArxiv Realtime] UPDATE - Оновлено запис:`, record);
          if (!currentUserName || record?.xto_zapusav !== currentUserName) {
            console.log(`📨 [PostArxiv Realtime] Показуємо toast для UPDATE від ${record?.xto_zapusav}`);
            showRealtimeToast("update", record);
          } else {
            console.log(`🔇 [PostArxiv Realtime] Пропускаємо toast - це власна зміна`);
          }

          debouncedRefreshPlanner();
          refreshOccupancyForRecord(record);
          if (oldRecord?.data_on) {
            refreshOccupancyForRecord(oldRecord);
          }
        } else if (eventType === "DELETE") {
          console.log(`✅ [PostArxiv Realtime] DELETE - Видалено запис:`, oldRecord);
          // Показуємо toast про видалення
          showRealtimeToast("delete", oldRecord);

          // Видаляємо блок з DOM, якщо є
          if (oldRecord?.post_arxiv_id) {
            const block = document.querySelector(
              `.post-reservation-block[data-post-arxiv-id="${oldRecord.post_arxiv_id}"]`
            );
            if (block) {
              console.log(`🗑️ [PostArxiv Realtime] Видаляємо блок з DOM`);
              block.remove();
            }
          }

          debouncedRefreshPlanner();

          if (oldRecord?.data_on) {
            refreshOccupancyForRecord(oldRecord);
          }
        }
      }
    )
    .subscribe((status) => {
      console.log("📡 [PostArxiv Realtime] Статус каналу:", status);
      
      if (status === "SUBSCRIBED") {
        console.log("✅ [PostArxiv Realtime] Підписка активна! Очікуємо події від Supabase...");
      } else if (status === "CHANNEL_ERROR") {
        console.error("❌ [PostArxiv Realtime] Помилка каналу! Перевірте:");
        console.error("   1. Чи увімкнений Realtime для таблиці post_arxiv");
        console.error("   2. Чи правильно налаштовані RLS політики");
        console.error("   3. Чи є доступ до таблиці");
      } else if (status === "TIMED_OUT") {
        console.error("⏱️ [PostArxiv Realtime] Час очікування вичерпано");
      } else if (status === "CLOSED") {
        console.warn("🔌 [PostArxiv Realtime] Канал закрито");
      }
    });

  console.log("✅ [PostArxiv Realtime] Підписка створена! Очікуємо події від Supabase...");
}

/**
 * Відписка від каналу
 */
export function unsubscribeFromPostArxivRealtime(): void {
  if (postArxivChannel) {
    postArxivChannel.unsubscribe();
    postArxivChannel = null;
    console.log("🔌 [PostArxiv Realtime] Підписка відключена");
  }
}

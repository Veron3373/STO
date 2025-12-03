// ===== ФАЙЛ: src/ts/roboha/tablucya/povidomlennya_tablucya.ts =====

import { markNotificationAsDeleted, loadUnseenNotifications } from "./mark_notification_deleted";

export interface ActNotificationPayload {
  act_id: number;              // номер акту (обов'язковий)
  notification_id?: number;    // pk з таблиці act_changes_notifications
  id?: number;                 // запасне поле, якщо прийде під іменем id
  changed_by_surname: string;  // хто змінив
  item_name: string;           // що змінено (робота/деталь)
  dodav_vudaluv: boolean;      // true = додано, false = видалено
  created_at?: string;         // timestamp з БД
  data?: string;               // запасне поле, якщо час прийде сюди
}

// ==========================
//     ЗВУКОВІ ЕФЕКТИ
// ==========================

let globalAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!globalAudioContext) {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      globalAudioContext = new AudioContextClass();
    }
    return globalAudioContext;
  } catch (_e) {
    return null;
  }
}

function playNotificationSound(isAdded: boolean) {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      isAdded ? 880 : 440,
      audioCtx.currentTime
    );

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + 0.1
    );

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (_e) {
    // ігноруємо
  }
}


// ==========================
//   ГРУПУВАННЯ ЗВУКІВ (DEBOUNCE)
// ==========================

let soundBurstTimeout: number | null = null;
let lastBurstIsAdded: boolean | null = null;

// за який час вважаємо, що це "одна пачка"
const SOUND_BURST_DELAY = 200; // мс

function scheduleNotificationSound(isAdded: boolean) {
  // запам'ятовуємо тип останньої нотифікації (додано / видалено)
  lastBurstIsAdded = isAdded;

  // якщо таймер уже був – скасовуємо, бо прилетіло ще одне
  if (soundBurstTimeout !== null) {
    window.clearTimeout(soundBurstTimeout);
  }

  // ставимо новий таймер – якщо за 200мс більше нічого не прийде,
  // граємо звук саме для останнього isAdded
  soundBurstTimeout = window.setTimeout(() => {
    if (lastBurstIsAdded !== null) {
      playNotificationSound(lastBurstIsAdded);
    }
    soundBurstTimeout = null;
    lastBurstIsAdded = null;
  }, SOUND_BURST_DELAY);
}


function playCloseSound() {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(600, t);
    oscillator.frequency.exponentialRampToValueAtTime(300, t + 0.15);

    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.1, t + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    oscillator.start(t);
    oscillator.stop(t + 0.15);
  } catch (_e) {
    // ігноруємо
  }
}

// ==========================
//      ХЕЛПЕРИ ДЛЯ DOM
// ==========================

function formatTimeOnly(dateStr?: string): string {
  if (!dateStr) {
    return new Date().toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const date = new Date(dateStr);
  return date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reindexBadges() {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;

  const toasts = Array.from(
    container.querySelectorAll(".act-notification-toast:not(.closing)")
  );

  // 1 - найстаріше, більше число - найновіше (через column-reverse візуально зверху вниз)
  toasts.reverse().forEach((toast, index) => {
    const badge = toast.querySelector(
      ".notification-count-badge"
    ) as HTMLElement | null;
    if (badge) badge.textContent = (index + 1).toString();
  });
}

// ==========================
//    ЛОГІКА ХОВЕРА СТЕКА
// ==========================

let hoverAnimationInitialized = false;
let hoverTimeouts: number[] = [];
let isStackExpanded = false;

function clearHoverTimeouts() {
  hoverTimeouts.forEach((id) => window.clearTimeout(id));
  hoverTimeouts = [];
}

function initHoverAnimation(container: HTMLElement) {
  if (hoverAnimationInitialized) return;
  hoverAnimationInitialized = true;

  container.addEventListener("mouseenter", () => {
    expandStack(container);
  });

  container.addEventListener("mouseleave", () => {
    collapseStack(container);
  });
}

// Розгортання: спочатку перший тост (0.7 → 1.0), потім інші по одному знизу вгору
function expandStack(container: HTMLElement) {
  if (isStackExpanded) return;
  isStackExpanded = true;
  clearHoverTimeouts();

  const toasts = Array.from(
    container.querySelectorAll(".act-notification-toast")
  ) as HTMLElement[];

  if (!toasts.length) return;

  const first = toasts[0]; // перший у DOM (внизу візуально через column-reverse)
  const FIRST_DURATION = 40; // скільки розкривається перший
  const STEP_DELAY = 15; // затримка між появою наступних

  // 1. перший – збільшуємо
  first.classList.add("toast-expanded");

  // 2. після його розкриття показуємо інші по одному
  const startOthersId = window.setTimeout(() => {
    for (let i = 1; i < toasts.length; i++) {
      const toast = toasts[i];
      const id = window.setTimeout(() => {
        toast.classList.add("stack-visible");
      }, STEP_DELAY * (i - 1));
      hoverTimeouts.push(id);
    }
  }, FIRST_DURATION);

  hoverTimeouts.push(startOthersId);
}

// Згортання: спочатку інші зверху вниз, потім перший (1.0 → 0.7)
function collapseStack(container: HTMLElement) {
  if (!isStackExpanded) return;
  isStackExpanded = false;
  clearHoverTimeouts();

  const toasts = Array.from(
    container.querySelectorAll(".act-notification-toast")
  ) as HTMLElement[];

  if (!toasts.length) return;

  const first = toasts[0];
  const STEP_DELAY = 15;
  const HIDE_DURATION = 40;

  // 1. ховаємо всі, крім першого, зверху вниз (візуально: останній у DOM → перший)
  let order = 0;
  for (let i = toasts.length - 1; i >= 1; i--, order++) {
    const toast = toasts[i];
    const id = window.setTimeout(() => {
      toast.classList.add("stack-hiding");
      toast.classList.remove("stack-visible");

      const endId = window.setTimeout(() => {
        toast.classList.remove("stack-hiding");
        // після цього лишається базовий стан: display:none для не-першого
      }, HIDE_DURATION);

      hoverTimeouts.push(endId);
    }, STEP_DELAY * order);
    hoverTimeouts.push(id);
  }

  // 2. після того, як всі інші сховалися – повертаємо перший у режим мініатюри
  const totalDelay =
    STEP_DELAY * Math.max(0, toasts.length - 1) + HIDE_DURATION;

  const firstId = window.setTimeout(() => {
    first.classList.remove("toast-expanded");
    first.classList.remove("stack-visible");
    first.classList.remove("stack-hiding");
  }, totalDelay);

  hoverTimeouts.push(firstId);
}


// ==========================
//   КОНТЕЙНЕР НОТИФІКАЦІЙ
// ==========================

function getOrCreateContainer(): HTMLElement {
  let container = document.getElementById("act-realtime-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "act-realtime-container";
    document.body.appendChild(container);
  }

  // ініціалізація логіки ховера (один раз)
  initHoverAnimation(container);

  return container;
}

// ==========================
//      ГОЛОВНІ ФУНКЦІЇ
// ==========================

export function showRealtimeActNotification(
  payload: ActNotificationPayload
): void {
  const container = getOrCreateContainer();

  // унікальний ID для HTML (беремо з БД, якщо є)
  const dbId =
    payload.notification_id || payload.id || Date.now() + Math.random();

  // якщо така нотифікація вже є – не дублюємо
  if (container.querySelector(`[data-id="${dbId}"]`)) return;

  const isAdded = payload.dodav_vudaluv;
  const icon = isAdded ? "✅" : "❌";
  const actionText = isAdded ? "Додано" : "Видалено";
  const typeClass = isAdded ? "type-added" : "type-deleted";
  const timeString = formatTimeOnly(payload.created_at || payload.data);

  const toast = document.createElement("div");
  // додаємо службовий клас incoming для анімації "прильоту"
  toast.className = `act-notification-toast incoming ${typeClass}`;

  // зберігаємо id та act_id у data-атрибути
  toast.setAttribute("data-id", String(dbId));
  toast.setAttribute("data-act-id", String(payload.act_id));

  toast.innerHTML = `
    <div class="toast-header-row">
      <div class="header-left">
        <span class="act-id">Акт №${payload.act_id}</span>
        <span class="status-text">${actionText}</span>
      </div>
      <div class="notification-count-badge">...</div>
    </div>
    <div class="toast-meta-row">
      <span class="meta-time-oval">${timeString}</span>
      <span class="user-surname">${payload.changed_by_surname || "Користувач"}</span>
    </div>
    <div class="toast-body-row">
      <span class="item-icon">${icon}</span>
      <span class="item-name">${payload.item_name}</span>
    </div>
  `;

  // додаємо на початок DOM (через column-reverse – буде найнижче візуально)
  container.prepend(toast);
  scheduleNotificationSound(isAdded);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // перший елемент завжди маленький, решта – сховані (через SCSS)
      toast.classList.add("show");
      reindexBadges();

      // після завершення "прильоту" прибираємо службовий клас
      window.setTimeout(() => {
        toast.classList.remove("incoming");
      }, 700);

      // при ховері скролимо так, щоб нове було видно
      if (container.matches(":hover")) {
        toast.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });
  });

  // клік по картці – закрити її та позначити як видалене в БД
  toast.addEventListener("click", async (e) => {
    e.stopPropagation();
    playCloseSound();

    // Позначаємо повідомлення як видалене в БД перед видаленням з DOM
    if (dbId && typeof dbId === 'number') {
      await markNotificationAsDeleted(dbId);
    }

    removeToastElement(toast);
  });
}

/**
 * Видалити ВСІ нотифікації по конкретному act_id
 * (викликається при DELETE з Realtime або при відкритті акту)
 */
export function removeNotificationsForAct(actId: number): void {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;

  const toasts = container.querySelectorAll<HTMLElement>(
    `.act-notification-toast[data-act-id="${actId}"]`
  );

  if (toasts.length > 0) {
    console.log(`🧹 Видаляємо всі нотифікації для Акту №${actId}`);
    toasts.forEach((toast) => {
      if (!toast.classList.contains("closing")) {
        removeToastElement(toast);
      }
    });
  }
}

/**
 * Видалити конкретну нотифікацію по її notification_id
 */
export function removeRealtimeNotification(dbId: number): void {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;

  const toast = container.querySelector<HTMLElement>(
    `.act-notification-toast[data-id="${dbId}"]`
  );
  if (toast) {
    removeToastElement(toast);
  }
}

// ==========================
//     ДОПОМІЖНЕ ВИДАЛЕННЯ
// ==========================

function removeToastElement(toast: HTMLElement) {
  toast.classList.add("closing");

  requestAnimationFrame(() => reindexBadges());

  // даємо часу спочатку поїхати вправо, потім плавно "опустити" стек
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
      requestAnimationFrame(() => reindexBadges());
    }
  }, 400);
}

// ==========================
//  ЗАВАНТАЖЕННЯ ІСНУЮЧИХ ПОВІДОМЛЕНЬ
// ==========================

/**
 * Завантажує та відображає всі невидалені повідомлення з БД
 * Викликається при ініціалізації сторінки або поверненні з іншої сторінки
 */
export async function loadAndShowExistingNotifications(): Promise<void> {
  console.log("📥 Завантажуємо існуючі повідомлення...");

  const notifications = await loadUnseenNotifications();

  if (notifications.length === 0) {
    console.log("ℹ️ Немає невидалених повідомлень для відображення");
    return;
  }

  console.log(`📢 Відображаємо ${notifications.length} збережених повідомлень`);

  // Показуємо кожне повідомлення (від старіших до новіших)
  notifications.forEach((notification) => {
    showRealtimeActNotification(notification);
  });
}

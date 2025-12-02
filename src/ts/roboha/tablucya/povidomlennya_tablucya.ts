// ===== ФАЙЛ: src/ts/roboha/tablucya/povidomlennya_tablucya.ts =====

export interface ActNotificationPayload {
  act_id: number;          // ⚡ ГОЛОВНЕ ПОЛЕ (Обов'язкове)
  notification_id?: number; // Зробив необов'язковим (?) щоб виправити помилку TS
  id?: number;             
  changed_by_surname: string;
  item_name: string;
  dodav_vudaluv: boolean;
  created_at?: string;
  data?: string; 
}

// --- ЗВУКОВІ ЕФЕКТИ ---
let globalAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!globalAudioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      globalAudioContext = new AudioContextClass();
    }
    return globalAudioContext;
  } catch (e) { return null; }
}

function playNotificationSound(isAdded: boolean) {
    try {
        const audioCtx = getAudioContext();
        if (!audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(isAdded ? 880 : 440, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
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
    } catch (e) {}
}

function getOrCreateContainer(): HTMLElement {
  let container = document.getElementById("act-realtime-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "act-realtime-container";
    document.body.appendChild(container);
  }
  return container;
}

function formatTimeOnly(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(dateStr);
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function reindexBadges() {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;
  const toasts = Array.from(container.querySelectorAll('.act-notification-toast:not(.closing)'));
  toasts.reverse().forEach((toast, index) => {
    const badge = toast.querySelector('.notification-count-badge');
    if (badge) badge.textContent = (index + 1).toString();
  });
}

// --- ГОЛОВНІ ФУНКЦІЇ ---

export function showRealtimeActNotification(payload: ActNotificationPayload): void {
  const container = getOrCreateContainer();
  
  // Формуємо хоч якийсь унікальний ID для HTML елемента
  const dbId = payload.notification_id || payload.id || Date.now() + Math.random();

  // ⚡ ГОЛОВНЕ: Шукаємо по ACT_ID, щоб не дублювати, якщо це те саме оновлення
  // (Але якщо треба показувати всі дії по черзі, цю перевірку можна спростити)
  if (container.querySelector(`[data-id="${dbId}"]`)) return;

  const isAdded = payload.dodav_vudaluv;
  const icon = isAdded ? "✅" : "❌";
  const actionText = isAdded ? "Додано" : "Видалено";
  const typeClass = isAdded ? "type-added" : "type-deleted";
  const timeString = formatTimeOnly(payload.created_at || payload.data);

  const toast = document.createElement("div");
  toast.className = `act-notification-toast ${typeClass}`;
  
  // Зберігаємо ID
  toast.setAttribute("data-id", dbId.toString());
  // ⚡ Зберігаємо act_id для пошуку
  toast.setAttribute("data-act-id", payload.act_id.toString());

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

  container.prepend(toast);
  playNotificationSound(isAdded);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("show");
      reindexBadges();
      if (container.matches(':hover')) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  toast.addEventListener("click", (e) => {
      e.stopPropagation();
      playCloseSound();
      removeToastElement(toast);
  });
}

/** * ⚡ ФУНКЦІЯ ВИДАЛЕННЯ ПО ACT_ID
 * Шукає всі повідомлення з таким номером акту і видаляє їх
 */
export function removeNotificationsForAct(actId: number): void {
    const container = document.getElementById("act-realtime-container");
    if (!container) return;

    // Шукаємо по атрибуту data-act-id
    const toasts = container.querySelectorAll(`.act-notification-toast[data-act-id="${actId}"]`);
    
    if (toasts.length > 0) {
        console.log(`🧹 Видаляємо все для Акту №${actId}`);
        toasts.forEach(toast => {
            if (!toast.classList.contains('closing')) {
                removeToastElement(toast as HTMLElement);
            }
        });
    }
}

/** * Допоміжна функція для видалення одного конкретного повідомлення (якщо треба)
 */
export function removeRealtimeNotification(dbId: number): void {
    const container = document.getElementById("act-realtime-container");
    if (!container) return;
    const toast = container.querySelector(`.act-notification-toast[data-id="${dbId}"]`);
    if (toast) removeToastElement(toast as HTMLElement);
}

function removeToastElement(toast: HTMLElement) {
    toast.classList.add("closing");
    requestAnimationFrame(() => reindexBadges());
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
        requestAnimationFrame(() => reindexBadges());
      }
    }, 500);
}
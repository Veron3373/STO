// ===== ФАЙЛ: src/ts/roboha/tablucya/act_notifications_ui.ts =====

interface ActNotificationPayload {
  act_id: number;
  changed_by_surname: string;
  item_name: string;
  dodav_vudaluv: boolean;
  created_at?: string;
  notification_count?: number;
}

// --- ЗВУКИ (SOUND FX) ---

function playNotificationSound(isAdded: boolean) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine';
    // 880Hz (A5) для додавання, 440Hz (A4) для видалення
    oscillator.frequency.setValueAtTime(isAdded ? 880 : 440, audioCtx.currentTime); 
    
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.warn("Audio Context blocked or not supported", e);
  }
}

function playCloseSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    const t = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = "sine";
    // Звук "падання" частоти (blip)
    oscillator.frequency.setValueAtTime(600, t);
    oscillator.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.1, t + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    
    oscillator.start(t);
    oscillator.stop(t + 0.15);
  } catch (e) {}
}

// --- ЛОГІКА UI ---

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
    const date = dateStr ? new Date(dateStr) : new Date();
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Перераховує (оновлює) цифри на всіх видимих картках
 * Щоб завжди було по порядку: 1, 2, 3...
 */
function reindexBadges() {
  const container = document.getElementById("act-realtime-container");
  if (!container) return;

  // Знаходимо всі картки (навіть приховані CSS-ом, але не ті, що видаляються)
  const toasts = container.querySelectorAll('.act-notification-toast:not(.closing)');
  
  toasts.forEach((toast, index) => {
    const badge = toast.querySelector('.notification-count-badge');
    if (badge) {
      // Індекс починається з 0, тому пишемо index + 1
      badge.textContent = (index + 1).toString();
    }
  });
}

export function showRealtimeActNotification(payload: ActNotificationPayload): void {
  const container = getOrCreateContainer();

  const isAdded = payload.dodav_vudaluv;
  const icon = isAdded ? "✅" : "❌";
  const actionText = isAdded ? "Додано" : "Видалено";
  const typeClass = isAdded ? "type-added" : "type-deleted";
  const timeString = formatTimeOnly(payload.created_at);

  const toast = document.createElement("div");
  toast.className = `act-notification-toast ${typeClass}`;
  
  // Спочатку ставимо "..." або 0, воно миттєво оновиться функцією reindexBadges
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
       <span class="user-surname">${payload.changed_by_surname || "Невідомо"}</span>
    </div>

    <div class="toast-body-row">
      <span class="item-icon">${icon}</span>
      <span class="item-name">${payload.item_name}</span>
    </div>
  `;

  container.appendChild(toast);

  // Чекаємо, поки DOM оновиться, потім показуємо і перераховуємо
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("show");
      reindexBadges(); 
      // Прокрутка вниз контейнера, якщо він розгорнутий
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  });

  const closeToast = (e?: Event) => {
    if(e) {
        e.stopPropagation();
        // ПРОГРАЄМО ЗВУК ЗАКРИТТЯ
        playCloseSound();
    }
    
    // Додаємо клас для анімації виходу
    toast.classList.add("closing");
    
    // Одразу перераховуємо решту, ігноруючи цей (.closing)
    requestAnimationFrame(() => {
      reindexBadges();
    });

    // Чекаємо завершення анімації (400мс + запас)
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
        // Для надійності перерахуємо ще раз після повного видалення
        requestAnimationFrame(() => {
          reindexBadges();
        });
      }
    }, 450);
  };

  toast.addEventListener("click", closeToast);
  
  // ПРОГРАЄМО ЗВУК ПОЯВИ
  playNotificationSound(isAdded);
}
// ===== ФАЙЛ: src/ts/roboha/tablucya/act_notifications_ui.ts =====

interface ActNotificationPayload {
  act_id: number;
  changed_by_surname: string;
  item_name: string;
  dodav_vudaluv: boolean; // true = додав, false = видалив
  created_at?: string;
}

/**
 * Створює контейнер для повідомлень, якщо його ще немає
 */
function getOrCreateContainer(): HTMLElement {
  let container = document.getElementById("act-realtime-container");
  
  if (!container) {
    container = document.createElement("div");
    container.id = "act-realtime-container";
    // Стилі тепер підтягуються з SCSS (#act-realtime-container)
    document.body.appendChild(container);
  }
  
  return container;
}

/**
 * Основна функція показу повідомлення
 */
export function showRealtimeActNotification(payload: ActNotificationPayload): void {
  const container = getOrCreateContainer();

  const isAdded = payload.dodav_vudaluv;
  const icon = isAdded ? "✅" : "❌";
  const actionText = isAdded ? "Додано" : "Видалено";
  
  // Визначаємо тип для класу (зелений чи червоний)
  const typeClass = isAdded ? "type-added" : "type-deleted";

  // Створення елемента
  const toast = document.createElement("div");
  toast.className = `act-notification-toast ${typeClass}`;
  
  // HTML структура, яка відповідає вашому новому SCSS
  toast.innerHTML = `
    <div class="toast-header">
      <div class="toast-header-left">
        <span class="act-id">Акт №${payload.act_id}</span>
        <span class="status-text">${actionText}</span>
      </div>
      <span class="user-surname">${payload.changed_by_surname || "Невідомо"}</span>
    </div>

    <div class="toast-body">
      <span class="item-icon">${icon}</span>
      <span class="item-name">${payload.item_name}</span>
    </div>
  `;

  // Додаємо в контейнер
  container.appendChild(toast);

  // Запуск анімації появи (додаємо клас .show через мить)
  requestAnimationFrame(() => {
    toast.classList.add("show");
    
    // Автоскрол вниз до нового повідомлення
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  });

  // Логіка закриття
  const closeToast = (e?: Event) => {
    if(e) e.stopPropagation();

    // Запускаємо анімацію виходу (клас .closing в SCSS тікає вправо)
    toast.classList.remove("show");
    toast.classList.add("closing");
    
    // Чекаємо завершення анімації (400мс як в CSS) і видаляємо
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 400);
  };

  // Закриття при кліку
  toast.addEventListener("click", closeToast);

  // Звуковий сигнал (без змін)
  playNotificationSound(isAdded);
}

/**
 * Допоміжна функція для звуку (виніс окремо для чистоти)
 */
function playNotificationSound(isAdded: boolean) {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  } catch (e) {
    // Тихо ігноруємо помилки аудіо
  }
}
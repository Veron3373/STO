// src/ts/roboha/zakaz_naraudy/inhi/settings_realtime_init.ts
/**
 * Автоматична ініціалізація підписки на зміни settings
 * при завантаженні сторінки для всіх користувачів
 */

import { initializeSettingsSubscription } from "./settings_subscription";

// Ініціалізуємо підписку автоматично при імпорті модуля
initializeSettingsSubscription();

// Відключаємо підписку при закритті/перезавантаженні сторінки
window.addEventListener("beforeunload", () => {
  // Підписка автоматично закриється при закритті сторінки
});

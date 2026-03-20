import "./roboha/tablucya/tablucya";
import "./roboha/tablucya/perevirka_avtoruzacii";

// 📱 Реєстрація Service Worker для PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => {
      // console.log('SW registered');
    }).catch(() => {
      // console.log('SW registration failed');
    });
  });
}
import "./roboha/redahyvatu_klient_machuna/vikno_klient_machuna";
import "./roboha/dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import "./roboha/nalachtuvannay/nalachtuvannay";
import "./roboha/bukhhalteriya/bukhhalteriya";
import "./roboha/dodatu_inchi_bazu/vikno_pidtverdchennay_inchi_bazu";
import "./roboha/dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import "./roboha/redahyvatu_klient_machuna/vikno_klient_machuna";
import "./roboha/redahyvatu_klient_machuna/pidtverdutu_sberihannya_zakaz_naryad";
import "./roboha/redahyvatu_klient_machuna/pidtverdutu_sberihannya_PIB_avto";
import "./roboha/zakaz_naraudy/inhi/vikno_vvody_parolu";
import "./roboha/bukhhalteriya/rosraxunok";
import "./roboha/bukhhalteriya/prubutok";
import "./roboha/zakaz_naraudy/inhi/fakturaRaxunok";
import "./roboha/zakaz_naraudy/inhi/fakturaAct";
import "./roboha/zakaz_naraudy/inhi/act_change_tracker";
import "./roboha/zakaz_naraudy/inhi/act_changes_highlighter";
import "./roboha/zakaz_naraudy/inhi/act_notifications";
import "./roboha/tablucya/povidomlennya_tablucya";
import "./roboha/zakaz_naraudy/inhi/act_realtime_subscription";
import "./roboha/zakaz_naraudy/inhi/settings_realtime_init";
import "./vxid/url_obfuscator";
import "./roboha/planyvannya/planyvannya";
import "./roboha/planyvannya/planyvannya_post";

// 🤖 AI Chat — ініціалізація кнопки в меню (якщо aiChatEnabled = true)
import { initAIChatButton } from "./roboha/ai/aiChat";

// 💡 initAIChatButton() викликається в initializeActsSystem() після завантаження налаштувань.
// Додатковий fallback на випадок повільної мережі:
setTimeout(() => {
  initAIChatButton();
}, 5000);

// 🔔 Перевірка нагадувань Атласа (polling кожні 15 сек + precision timer)
import {
  initReminderChecker,
  setOnRemindersTriggered,
} from "./roboha/ai/aiReminderChecker";
import { initPlannerTab } from "./roboha/ai/aiPlanner";

// Запускаємо після повної ініціалізації всіх модулів
setTimeout(() => {
  initReminderChecker();

  // Коли нагадування спрацювало — оновити UI планувальника (якщо відкритий)
  setOnRemindersTriggered(() => {
    const plannerPanel = document.querySelector(
      ".ai-chat-panel-planner",
    ) as HTMLElement | null;
    if (plannerPanel && !plannerPanel.classList.contains("hidden")) {
      initPlannerTab(plannerPanel);
    }
  });
}, 4000);

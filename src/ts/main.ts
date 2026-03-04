import "./roboha/tablucya/tablucya";
import "./roboha/tablucya/perevirka_avtoruzacii";
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

// Запускаємо після того як система авторизується і меню стає видимим
document.addEventListener("aiChatReady", () => {
  initAIChatButton();
});

// Fallback: якщо подія не спрацювала — спробуємо через 2 секунди
setTimeout(() => {
  initAIChatButton();
}, 2000);

// 🔔 Перевірка нагадувань Атласа (polling кожні 60 сек)
import { initReminderChecker } from "./roboha/ai/aiReminderChecker";

// Запускаємо після повної ініціалізації всіх модулів
setTimeout(() => {
  initReminderChecker();
}, 4000);

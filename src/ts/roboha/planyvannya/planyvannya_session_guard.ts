// src/ts/roboha/planyvannya/planyvannya_session_guard.ts
// 🔐 ПЕРЕВІРКА GOOGLE СЕСІЇ для planyvannya.html

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";
import { isEmailAllowed } from "../../../../constants";

console.log("🔒 [Планування] Перевірка Google сесії...");

async function checkPlanningSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      console.warn("⛔ [Планування] Немає Google сесії");
      window.location.replace("https://veron3373.github.io/STO/index.html");
      return;
    }

    const email = session.user.email;

    if (!isEmailAllowed(email)) {
      console.warn("⛔ [Планування] Email не в whitelist:", email);
      alert(`Доступ заборонено для ${email}`);
      await supabase.auth.signOut();
      window.location.replace("https://veron3373.github.io/STO/");
      return;
    }

    console.log("✅ [Планування] Google сесія підтверджена:", email);

    // Змінюємо URL для безпеки
    obfuscateCurrentUrl();
  } catch (err) {
    console.error("❌ [Планування] Помилка перевірки:", err);
    window.location.replace("https://veron3373.github.io/STO/index.html");
  }
}

// Запускаємо перевірку ЗАРАЗ
checkPlanningSession();

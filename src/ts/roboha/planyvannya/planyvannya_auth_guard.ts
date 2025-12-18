// src/ts/roboha/planyvannya/planyvannya_auth_guard.ts
// 🔐 ПОВНИЙ ЗАХИСТ сторінки planyvannya.html

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";
import { isEmailAllowed } from "../../../../constants";

console.log("🔒 [Планування] Перевірка доступу...");

async function checkPlanningAccess(): Promise<void> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      console.warn("⛔ [Планування] Немає Google сесії");
      alert("Необхідна авторизація");
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

    console.log("✅ [Планування] Доступ дозволено:", email);

    // Змінюємо URL
    obfuscateCurrentUrl();

    // Показуємо сторінку
    document.body.classList.add("auth-verified");
  } catch (err) {
    console.error("❌ [Планування] Помилка перевірки:", err);
    window.location.replace("https://veron3373.github.io/STO/index.html");
  }
}

// Запускаємо перевірку
checkPlanningAccess();

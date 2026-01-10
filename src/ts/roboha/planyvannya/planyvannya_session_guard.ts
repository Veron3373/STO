// src/ts/roboha/planyvannya/planyvannya_session_guard.ts
// 🔐 ПЕРЕВІРКА GOOGLE СЕСІЇ для planyvannya.html

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";

console.log("🔒 [Планування] Перевірка Google сесії...");

// Перевірка email через базу даних whitelist
async function isEmailAllowed(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const { data, error } = await supabase
      .from("whitelist")
      .select("email")
      .eq("email", email.toLowerCase())
      .single();
    if (error?.code === "PGRST116") return false;
    if (error) {
      console.error("❌ Помилка whitelist:", error);
      return false;
    }
    return !!data;
  } catch (err) {
    console.error("❌ Виняток whitelist:", err);
    return false;
  }
}

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
    const allowed = await isEmailAllowed(email);

    if (!allowed) {
      console.warn("⛔ [Планування] Email не в whitelist:", email);
      await supabase.auth.signOut();
      window.location.replace("https://veron3373.github.io/STO/index.html");
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

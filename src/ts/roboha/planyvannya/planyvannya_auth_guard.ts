// src/ts/roboha/planyvannya/planyvannya_auth_guard.ts
// 🔐 ПОВНИЙ ЗАХИСТ сторінки planyvannya.html

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";
import { enforcePageAccess } from "../zakaz_naraudy/inhi/page_access_guard";

console.log("🔒 [Планування] Перевірка доступу...");

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

async function checkPlanningAccess(): Promise<void> {
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

    console.log("✅ [Планування] Доступ дозволено:", email);

    // Змінюємо URL
    obfuscateCurrentUrl();

    // 🔐 Перевіряємо доступ до сторінки на основі налаштувань
    await enforcePageAccess();

    // Показуємо сторінку
    document.body.classList.add("auth-verified");
  } catch (err) {
    console.error("❌ [Планування] Помилка перевірки:", err);
    window.location.replace("https://veron3373.github.io/STO/index.html");
  }
}

// Запускаємо перевірку
checkPlanningAccess();

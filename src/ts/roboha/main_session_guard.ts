// src/ts/roboha/main_session_guard.ts
// 🔐 ПЕРЕВІРКА GOOGLE СЕСІЇ для main.html

import { supabase } from "../vxid/supabaseClient";
import { getGitUrl, getFallbackUrl } from "../utils/gitUtils";
import { initUrlUpdater } from "../utils/urlUpdater";

console.log("🔒 [Main] Перевірка Google сесії...");

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

async function checkMainPageSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      console.warn("⛔ [Main] Немає Google сесії");
      alert("Сесія закінчилась. Увійдіть знову.");
      const indexUrl = await getGitUrl("index.html");
      window.location.replace(indexUrl);
      return;
    }

    const email = session.user.email;
    const allowed = await isEmailAllowed(email);

    if (!allowed) {
      console.warn("⛔ [Main] Email не в whitelist:", email);
      await supabase.auth.signOut();
      const baseUrl = await getGitUrl();
      window.location.replace(baseUrl);
      return;
    }

    console.log("✅ [Main] Доступ дозволено:", email);
    
    // Оновлюємо посилання на сторінці
    initUrlUpdater();
  } catch (err) {
    console.error("❌ [Main] Помилка перевірки:", err);
    // У разі помилки використовуємо fallback URL
    const fallbackUrl = await getFallbackUrl("index.html");
    window.location.replace(fallbackUrl);
  }
}

// Запускаємо перевірку
checkMainPageSession();

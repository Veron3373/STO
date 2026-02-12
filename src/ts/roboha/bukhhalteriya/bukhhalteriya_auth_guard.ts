// src/ts/roboha/bukhhalteriya/bukhhalteriya_auth_guard.ts
// Захист сторінки bukhhalteriya.html від неавторизованого доступу

import { supabase } from "../../vxid/supabaseClient";
import { getGitUrl } from "../../utils/gitUtils";
import { initUrlUpdater } from "../../utils/urlUpdater";
// import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";
import { enforcePageAccess } from "../zakaz_naraudy/inhi/page_access_guard";

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

async function checkAuthOnPageLoad(): Promise<void> {

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    console.warn("⛔ Доступ заблоковано. Немає сесії.");
    const mainUrl = await getGitUrl("main.html");
    window.location.replace(mainUrl);
    return;
  }

  // ✅ Перевірка email в whitelist
  const allowed = await isEmailAllowed(session.user.email);
  if (!allowed) {
    console.warn("⛔ Email не в whitelist:", session.user.email);
    await supabase.auth.signOut();
    const baseUrl = await getGitUrl();
    window.location.replace(baseUrl);
    return;
  }


  // Оновлюємо посилання на сторінці
  initUrlUpdater();

  // 👇 ЗАПУСКАЄМО ЗМІНУ URL ТУТ (коли вхід успішний)
  // obfuscateCurrentUrl();

  // 🔐 Перевіряємо доступ до сторінки на основі налаштувань
  await enforcePageAccess();

  // Показуємо сторінку
  document.body.classList.add("auth-verified");
}

checkAuthOnPageLoad();

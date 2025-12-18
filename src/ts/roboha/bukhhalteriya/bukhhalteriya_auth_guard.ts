// src/ts/roboha/bukhhalteriya/bukhhalteriya_auth_guard.ts
// Захист сторінки bukhhalteriya.html від неавторизованого доступу

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";
import { isEmailAllowed } from "../../../../constants";

async function checkAuthOnPageLoad(): Promise<void> {
  console.log("🔒 Перевірка авторизації...");

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    console.warn("⛔ Доступ заблоковано. Немає сесії.");
    window.location.href = "https://veron3373.github.io/STO/main.html";
    return;
  }

  // ✅ Перевірка email в whitelist
  if (!isEmailAllowed(session.user.email)) {
    console.warn("⛔ Email не в whitelist:", session.user.email);
    await supabase.auth.signOut();
    window.location.href = "https://veron3373.github.io/STO/";
    return;
  }

  console.log("✅ Авторизовано:", session.user.email);

  // 👇 ЗАПУСКАЄМО ЗМІНУ URL ТУТ (коли вхід успішний)
  obfuscateCurrentUrl();

  // Показуємо контент
  const container = document.querySelector(
    ".Bukhhalter-container"
  ) as HTMLElement;
  if (container) {
    container.style.display = "block";
    container.style.visibility = "visible";
  }
}

checkAuthOnPageLoad();

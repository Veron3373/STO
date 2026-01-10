// src/ts/roboha/bukhhalteriya/bukhhalteriya_auth_guard.ts
// Захист сторінки bukhhalteriya.html від неавторизованого доступу

import { supabase } from "../../vxid/supabaseClient";
import { obfuscateCurrentUrl } from "../../vxid/url_obfuscator";
import { isEmailAllowed } from "../../../../constants";
import { enforcePageAccess } from "../zakaz_naraudy/inhi/page_access_guard";

async function checkAuthOnPageLoad(): Promise<void> {
  console.log("🔒 Перевірка авторизації...");

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    console.warn("⛔ Доступ заблоковано. Немає сесії.");
    window.location.replace(
      "https://shlifservice24-lang.github.io/Shlif_service/main.html"
    );
    return;
  }

  // ✅ Перевірка email в whitelist
  if (!isEmailAllowed(session.user.email)) {
    console.warn("⛔ Email не в whitelist:", session.user.email);
    await supabase.auth.signOut();
    window.location.replace(
      "https://shlifservice24-lang.github.io/Shlif_service/"
    );
    return;
  }

  console.log("✅ Авторизовано:", session.user.email);

  // 👇 ЗАПУСКАЄМО ЗМІНУ URL ТУТ (коли вхід успішний)
  obfuscateCurrentUrl();

  // 🔐 Перевіряємо доступ до сторінки на основі налаштувань
  await enforcePageAccess();

  // Показуємо сторінку
  document.body.classList.add("auth-verified");
}

checkAuthOnPageLoad();

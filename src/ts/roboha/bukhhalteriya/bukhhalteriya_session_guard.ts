// src/ts/roboha/bukhhalteriya/bukhhalteriya_session_guard.ts
// 🔐 ПЕРЕВІРКА GOOGLE СЕСІЇ для bukhhalteriya.html (БЕЗ блокування модалки пароля)

import { supabase } from "../../vxid/supabaseClient";

console.log("🔒 [Бухгалтерія] Перевірка Google сесії...");

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

async function checkGoogleSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      console.warn("⛔ [Бухгалтерія] Немає Google сесії");
      window.location.replace(
        "https://shlifservice24-lang.github.io/Shlif_service/index.html"
      );
      return;
    }

    const email = session.user.email;
    const allowed = await isEmailAllowed(email);

    if (!allowed) {
      console.warn("⛔ [Бухгалтерія] Email не в whitelist:", email);
      alert(`Доступ заборонено для ${email}`);
      await supabase.auth.signOut();
      window.location.replace(
        "https://shlifservice24-lang.github.io/Shlif_service/"
      );
      return;
    }

    console.log("✅ [Бухгалтерія] Google сесія підтверджена:", email);
    // Дозволяємо завантаження сторінки - модалка пароля покаже users.ts
  } catch (err) {
    console.error("❌ [Бухгалтерія] Помилка перевірки:", err);
    window.location.replace(
      "https://shlifservice24-lang.github.io/Shlif_service/index.html"
    );
  }
}

// Запускаємо перевірку ЗАРАЗ
checkGoogleSession();

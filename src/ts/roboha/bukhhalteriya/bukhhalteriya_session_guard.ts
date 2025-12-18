// src/ts/roboha/bukhhalteriya/bukhhalteriya_session_guard.ts
// 🔐 ПЕРЕВІРКА GOOGLE СЕСІЇ для bukhhalteriya.html (БЕЗ блокування модалки пароля)

import { supabase } from "../../vxid/supabaseClient";
import { isEmailAllowed } from "../../../../constants";

console.log("🔒 [Бухгалтерія] Перевірка Google сесії...");

async function checkGoogleSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      console.warn("⛔ [Бухгалтерія] Немає Google сесії");
      alert("Авторизація відсутня. Перенаправлення на сторінку входу.");
      window.location.replace("https://veron3373.github.io/STO/index.html");
      return;
    }

    const email = session.user.email;

    if (!isEmailAllowed(email)) {
      console.warn("⛔ [Бухгалтерія] Email не в whitelist:", email);
      alert(`Доступ заборонено для ${email}`);
      await supabase.auth.signOut();
      window.location.replace("https://veron3373.github.io/STO/");
      return;
    }

    console.log("✅ [Бухгалтерія] Google сесія підтверджена:", email);
    // Дозволяємо завантаження сторінки - модалка пароля покаже users.ts
  } catch (err) {
    console.error("❌ [Бухгалтерія] Помилка перевірки:", err);
    window.location.replace("https://veron3373.github.io/STO/index.html");
  }
}

// Запускаємо перевірку ЗАРАЗ
checkGoogleSession();

// src/js/login.ts
import { supabase } from "./supabaseClient";
import { isEmailAllowed } from "../../../constants";

// 🚪 Вхід через Google
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://veron3373.github.io/STO/",
    },
  });

  if (error) {
    console.error("Помилка входу:", error);
  } else {
    console.log("✅ Вхід через Google ініційовано");
  }
}

// 🔍 Перевірка дозволеного доступу (БЕЗ запиту до БД whitelist)
supabase.auth.onAuthStateChange(async (_event, session) => {
  const user = session?.user;

  if (user) {
    try {
      // Перевіряємо email на клієнті (без запиту до БД)
      if (isEmailAllowed(user.email)) {
        console.log("✅ Email дозволено:", user.email);
        window.location.href = "/STO/main.html";
      } else {
        console.warn("⛔ Email не в whitelist:", user.email);
        alert("Ваш email не дозволено для входу.");
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Помилка перевірки доступу:", err);
    }
  }
});

// 🧠 Прив’язка до кнопки
document.addEventListener("DOMContentLoaded", () => {
  const loginButton = document.getElementById("login");
  if (loginButton) {
    loginButton.addEventListener("click", () => {
      signInWithGoogle();
    });
  }
});

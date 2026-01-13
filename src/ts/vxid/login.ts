// src/ts/vxid/login.ts
// 🔐 СИСТЕМА ВХОДУ: Google OAuth + Whitelist перевірка
import { supabase } from "./supabaseClient";

console.log("🔒 Ініціалізація системи входу...");

// 🔍 Перевірка email через базу даних whitelist
async function isEmailAllowed(email: string | undefined): Promise<boolean> {
  if (!email) return false;

  try {
    // Перевіряємо чи є email в whitelist (завдяки RLS побачимо тільки свій email)
    const { data, error } = await supabase
      .from("whitelist")
      .select("email")
      .eq("email", email.toLowerCase())
      .single();

    if (error) {
      // Якщо помилка "не знайдено" - це нормально, email не в whitelist
      if (error.code === "PGRST116") {
        console.warn("⛔ Email не знайдено в whitelist:", email);
        return false;
      }
      // Інші помилки логуємо
      console.error("❌ Помилка перевірки whitelist:", error);
      return false;
    }

    // Якщо data існує - email в whitelist
    return !!data;
  } catch (err) {
    console.error("❌ Виняток при перевірці whitelist:", err);
    return false;
  }
}

// 🚪 Вхід через Google OAuth
export async function signInWithGoogle() {
  console.log("🔑 Запуск Google OAuth...");

  // 🔥 ВИПРАВЛЕНО ДЛЯ VERCEL:
  // Ми просто беремо "origin" (корінь сайту).
  // На локалхості це буде "http://localhost:5173"
  // На Vercel це буде "https://sto-gray.vercel.app"
  // Ніяких зайвих "/" чи перевірок GitHub більше не треба.
  const redirectUrl = window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (error) {
    console.error("❌ Помилка Google OAuth:", error);
  } else {
    console.log("✅ Google OAuth ініційовано");
  }
}

// 🔍 Перевірка сесії при завантаженні сторінки
async function checkExistingSession() {
  console.log("🔍 Перевірка існуючої сесії...");

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("❌ Помилка отримання сесії:", error);
    return;
  }

  if (session?.user) {
    console.log("👤 Знайдено сесію:", session.user.email);
    await handleAuthenticatedUser(session.user);
  } else {
    console.log("✉️ Немає активної сесії");
  }
}

// 🔐 Обробка автентифікованого користувача
async function handleAuthenticatedUser(user: any) {
  const email = user.email;

  const allowed = await isEmailAllowed(email);
  if (!allowed) {
    console.warn("⛔ Email НЕ в whitelist:", email);
    await supabase.auth.signOut();
    // 🔥 Якщо вхід заборонено - кидаємо на головну (корінь)
    window.location.href = "/";
    return;
  }

  console.log("✅ Email дозволено:", email);
  
  // 🔥 Перевіряємо, де ми зараз, щоб не перезавантажувати сторінку вічно
  if (!window.location.pathname.includes("main.html")) {
      console.log("➡️ Перенаправлення на main.html");
      window.location.href = "/main.html";
  }
}

// 🎯 Відстеження змін авторизації
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log("🔔 Auth event:", event);

  if (event === "SIGNED_IN" && session?.user) {
    await handleAuthenticatedUser(session.user);
  } else if (event === "SIGNED_OUT") {
    console.log("🚪 Користувач вийшов");
  }
});

// 🧠 Ініціалізація при завантаженні - перевірка сесії
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM завантажено");

  // Перевіряємо чи вже є сесія
  await checkExistingSession();
});
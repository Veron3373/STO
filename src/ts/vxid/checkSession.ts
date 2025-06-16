// src/ts/vxid/checkSession.ts
import { supabase } from "./supabaseClient";

export async function requireAuth() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    console.warn("❌ Немає сесії або помилка:", error);
    // Перенаправлення на сторінку входу
    window.location.href = "/STO/index.html"; // <-- ПЕРЕВІРЕНО
    return null;
  }

  console.log("✅ Сесія підтверджена:", session.user.email);
  return session;
}
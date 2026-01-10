// src/ts/vxid/checkSession.ts
import { supabase } from "./supabaseClient";

export async function requireAuth() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (!session || error) {
    if (window.location.pathname !== "/index.html") {
      console.warn("⛔ Сесія відсутня або помилка:", error);
      window.location.href = "/index.html";
    }
    return;
  }

  console.log("✅ Сесія підтверджена:", session.user.email);
  return session;
}

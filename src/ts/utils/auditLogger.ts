import { supabase } from "../vxid/supabaseClient";

export async function logAction(
  action: string,
  actId: number | null,
  details: any = {}
): Promise<void> {
  try {
    // Отримуємо дані користувача з localStorage
    const storedData = localStorage.getItem("userAuthData");
    if (!storedData) {
      // console.warn("⚠️ Спроба логування без авторизації");
      return;
    }

    const userData = JSON.parse(storedData);
    const userLogin = userData?.Name || "Невідомо";
    const userRole = userData?.["Доступ"] || "Невідомо";

    const { error } = await supabase
      .from("audit_logs")
      .insert({
        user_login: userLogin,
        user_role: userRole,
        action,
        act_id: actId,
        details,
      });

    if (error) {
      // console.error("❌ Помилка при записі логу:", error.message);
    }
  } catch (err) {
    // console.error("❌ Помилка логування дії:", err);
  }
}

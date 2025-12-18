// constants.ts - Константи для всього проекту

/**
 * Whitelist email адреси, які мають доступ до системи
 * Ці адреси також захищені на рівні RLS політик Supabase
 */
export const ALLOWED_EMAILS = [
  "veron3373v@gmail.com",
  "bsbraclavec@gmail.com",
] as const;

/**
 * Перевірка чи email користувача в whitelist
 */
export function isEmailAllowed(email: string | undefined): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  return ALLOWED_EMAILS.some((allowed) => allowed.toLowerCase() === emailLower);
}

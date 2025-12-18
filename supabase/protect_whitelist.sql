-- ==========================================
-- ЗАХИСТ ТАБЛИЦІ WHITELIST
-- ==========================================
-- Виконайте цей SQL в Supabase Dashboard > SQL Editor
-- або видаліть таблицю whitelist, якщо вона більше не потрібна

BEGIN;

-- Варіант 1: ЗАХИСТИТИ таблицю whitelist через RLS
-- (Якщо ви хочете зберегти таблицю для майбутнього)

-- 1. Увімкнути RLS на таблиці whitelist
ALTER TABLE IF EXISTS public.whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whitelist FORCE ROW LEVEL SECURITY;

-- 2. Видалити всі існуючі політики
DROP POLICY IF EXISTS "anon_read_whitelist" ON public.whitelist;
DROP POLICY IF EXISTS "authenticated_read_whitelist" ON public.whitelist;

-- 3. Заборонити ВСІ операції для anon та authenticated
CREATE POLICY "deny_all_whitelist" 
  ON public.whitelist
  FOR ALL 
  TO authenticated, anon
  USING (false);

-- Тепер таблиця whitelist ПОВНІСТЮ ЗАХИЩЕНА
-- Доступ тільки через service_role ключ

COMMIT;

-- ==========================================
-- Варіант 2: ВИДАЛИТИ таблицю whitelist
-- (Рекомендовано, тому що перевірка тепер в коді)
-- ==========================================

-- Розкоментуйте наступний рядок, якщо хочете видалити таблицю:
-- DROP TABLE IF EXISTS public.whitelist CASCADE;

-- ==========================================
-- ПЕРЕВІРКА
-- ==========================================

-- Перевірте чи RLS увімкнено
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'whitelist';

-- Перевірте політики
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'whitelist'
ORDER BY policyname;

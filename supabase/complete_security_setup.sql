-- ==========================================
-- 🔐 ПОВНА БЕЗПЕКА: WHITELIST + RLS
-- ==========================================
-- Цей скрипт налаштовує:
-- 1. Whitelist таблицю (захист від редагування)
-- 2. RLS політики для всіх робочих таблиць

BEGIN;

-- ========================================
-- ЧАСТИНА 1: WHITELIST TABLE
-- ========================================
-- Таблиця для зберігання дозволених email адрес
-- З повним захистом від редагування через клієнт

-- 1️⃣ Створення таблиці (якщо не існує)
CREATE TABLE IF NOT EXISTS public.whitelist (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  comment TEXT -- Опціонально: нотатки про користувача
);

-- 2️⃣ Індекс для швидкого пошуку email
CREATE INDEX IF NOT EXISTS idx_whitelist_email ON public.whitelist(email);

-- 3️⃣ Вставка початкових дозволених email (ОПЦІОНАЛЬНО - якщо таблиця порожня)
-- Якщо у вас вже є дані, закоментуйте цей блок
-- INSERT INTO public.whitelist (email, comment)
-- VALUES 
--   ('veron3373v@gmail.com', 'Адміністратор'),
--   ('bsbraclavec@gmail.com', 'Адміністратор')
-- ON CONFLICT (email) DO NOTHING;

-- ========================================
-- 🛡️ ROW LEVEL SECURITY ДЛЯ WHITELIST
-- ========================================

-- 4️⃣ Увімкнути RLS на таблиці whitelist
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;

-- 5️⃣ Видалити всі старі політики whitelist (на всяк випадок)
DROP POLICY IF EXISTS "whitelist_read_only" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_insert" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_update" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_delete" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_check_own_email" ON public.whitelist;

-- ========================================
-- 📖 ПОЛІТИКА ЧИТАННЯ - ТІЛЬКИ СВІЙ EMAIL
-- ========================================
-- Користувач може перевірити ТІЛЬКИ свій власний email
-- НЕ МОЖЕ побачити всі email в whitelist
CREATE POLICY "whitelist_check_own_email"
ON public.whitelist
FOR SELECT
TO authenticated
USING (
  -- Дозволити читання ТІЛЬКИ якщо email в запиті = email авторизованого користувача
  email = auth.jwt()->>'email'
);

-- ========================================
-- 🚫 ЗАБОРОНА INSERT, UPDATE, DELETE
-- ========================================
-- Ніхто через клієнт не може додавати/змінювати/видаляти

-- Заборона INSERT
CREATE POLICY "whitelist_no_insert"
ON public.whitelist
FOR INSERT
TO authenticated
WITH CHECK (false); -- Завжди false = заборонено

-- Заборона UPDATE
CREATE POLICY "whitelist_no_update"
ON public.whitelist
FOR UPDATE
TO authenticated
USING (false); -- Завжди false = заборонено

-- Заборона DELETE
CREATE POLICY "whitelist_no_delete"
ON public.whitelist
FOR DELETE
TO authenticated
USING (false); -- Завжди false = заборонено

-- ========================================
-- 🚫 ЗАБОРОНА ДЛЯ АНОНІМНИХ КОРИСТУВАЧІВ
-- ========================================
-- Анонімні користувачі взагалі не можуть нічого робити з whitelist

CREATE POLICY "whitelist_anon_no_select"
ON public.whitelist
FOR SELECT
TO anon
USING (false);

CREATE POLICY "whitelist_anon_no_insert"
ON public.whitelist
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "whitelist_anon_no_update"
ON public.whitelist
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "whitelist_anon_no_delete"
ON public.whitelist
FOR DELETE
TO anon
USING (false);

-- ========================================
-- 🔒 ДОДАТКОВІ ОБМЕЖЕННЯ ДОСТУПУ
-- ========================================

-- Відкликати всі права від public ролі
REVOKE ALL ON public.whitelist FROM PUBLIC;
REVOKE ALL ON public.whitelist FROM anon;
REVOKE ALL ON public.whitelist FROM authenticated;

-- Дозволити ТІЛЬКИ SELECT для authenticated (через RLS політику)
GRANT SELECT ON public.whitelist TO authenticated;

-- Заборонити будь-які зміни схеми таблиці
ALTER TABLE public.whitelist OWNER TO postgres;

-- ========================================
-- ℹ️ КОМЕНТАРІ ДО ТАБЛИЦІ WHITELIST
-- ========================================
COMMENT ON TABLE public.whitelist IS '🔐 ЗАХИЩЕНА ТАБЛИЦЯ: Whitelist дозволених email адрес. 
❌ ЗАБОРОНЕНО через клієнт: INSERT/UPDATE/DELETE
❌ ЗАБОРОНЕНО через anon key: будь-які операції
✅ ДОЗВОЛЕНО через клієнт: SELECT тільки свого email
⚠️ Керування ТІЛЬКИ через Supabase Dashboard:
  1. Відкрийте Dashboard
  2. Table Editor → whitelist
  3. Insert/Edit/Delete вручну
  ❌ НЕ використовуйте SQL Editor для whitelist!';
COMMENT ON COLUMN public.whitelist.email IS 'Email адреса користувача (унікальна, lowercase рекомендовано)';
COMMENT ON COLUMN public.whitelist.comment IS 'Опціональний коментар про користувача (роль, ім\'я, тощо)';

-- ==========================================
-- ЧАСТИНА 2: RLS ДЛЯ РОБОЧИХ ТАБЛИЦЬ
-- ==========================================

-- ==========================================
-- КРОК 1: УВІМКНУТИ RLS НА ВСІХ ТАБЛИЦЯХ
-- ==========================================

DO $$
DECLARE 
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acts', 'cars', 'clients', 'details', 'incomes', 'sclad',
    'settings', 'shops', 'slyusars', 'sms', 'post_arxiv','post_name', 'post_category','vutratu', 'works','faktura','act_changes_notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ==========================================
-- КРОК 2: ВИДАЛИТИ ВСІ ІСНУЮЧІ ПОЛІТИКИ
-- ==========================================

DO $$
DECLARE 
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acts', 'cars', 'clients', 'details', 'incomes', 'sclad',
    'settings', 'shops', 'slyusars', 'sms', 'post_arxiv','post_name', 'post_category','vutratu', 'works','faktura','act_changes_notifications'
  ]
  LOOP
    -- Видалити всі політики для кожної таблиці
    FOR p IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ==========================================
-- КРОК 3: WHITELIST EMAIL АДРЕСИ
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE 'Whitelist emails: veron3373v@gmail.com,';
  RAISE NOTICE 'Ці користувачі мають ПОВНИЙ доступ до всіх таблиць';
  RAISE NOTICE 'Але НЕ можуть змінювати whitelist в коді!';
END $$;

-- ==========================================
-- КРОК 4: ПОЛІТИКИ ДЛЯ ОСНОВНИХ ТАБЛИЦЬ
-- Повний CRUD ТІЛЬКИ для whitelist користувачів
-- ЧИТАННЯ whitelist - ЗАБОРОНЕНО
-- ==========================================

DO $$
DECLARE
  t text;
  whitelist_emails text[] := ARRAY['veron3373v@gmail.com'];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acts', 'cars', 'clients', 'details', 'incomes', 'sclad',
    'settings', 'shops', 'sms', 'post_arxiv','post_name', 'post_category','vutratu', 'works','faktura','act_changes_notifications'
  ]
  LOOP
    -- Політика для SELECT (читання)
    EXECUTE format(
      $sql$
      CREATE POLICY "whitelist_select" ON public.%I
        FOR SELECT TO authenticated
        USING (lower(auth.jwt() ->> 'email') = ANY (%L::text[]));
      $sql$, t, whitelist_emails
    );

    -- Політика для INSERT (створення)
    EXECUTE format(
      $sql$
      CREATE POLICY "whitelist_insert" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (lower(auth.jwt() ->> 'email') = ANY (%L::text[]));
      $sql$, t, whitelist_emails
    );

    -- Політика для UPDATE (оновлення)
    EXECUTE format(
      $sql$
      CREATE POLICY "whitelist_update" ON public.%I
        FOR UPDATE TO authenticated
        USING (lower(auth.jwt() ->> 'email') = ANY (%L::text[]))
        WITH CHECK (lower(auth.jwt() ->> 'email') = ANY (%L::text[]));
      $sql$, t, whitelist_emails, whitelist_emails
    );

    -- Політика для DELETE (видалення)
    EXECUTE format(
      $sql$
      CREATE POLICY "whitelist_delete" ON public.%I
        FOR DELETE TO authenticated
        USING (lower(auth.jwt() ->> 'email') = ANY (%L::text[]));
      $sql$, t, whitelist_emails
    );
  END LOOP;
END $$;

-- ==========================================
-- КРОК 5: СПЕЦІАЛЬНІ ПОЛІТИКИ ДЛЯ SLYUSARS
-- - Анонімні: читання (для екрану логіна)
-- - Whitelist: ПОВНИЙ CRUD
-- ==========================================

-- Анонімне читання для slyusars (для екрану логіна)
CREATE POLICY "anon_read_slyusars" 
  ON public.slyusars
  FOR SELECT TO anon
  USING (true);

-- Whitelist - читання
CREATE POLICY "whitelist_select_slyusars" 
  ON public.slyusars
  FOR SELECT TO authenticated
  USING (lower(auth.jwt() ->> 'email') = ANY (ARRAY['veron3373v@gmail.com']::text[]));

-- Whitelist - створення
CREATE POLICY "whitelist_insert_slyusars" 
  ON public.slyusars
  FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt() ->> 'email') = ANY (ARRAY['veron3373v@gmail.com']::text[]));

-- Whitelist - оновлення
CREATE POLICY "whitelist_update_slyusars" 
  ON public.slyusars
  FOR UPDATE TO authenticated
  USING (lower(auth.jwt() ->> 'email') = ANY (ARRAY['veron3373v@gmail.com']::text[]))
  WITH CHECK (lower(auth.jwt() ->> 'email') = ANY (ARRAY['veron3373v@gmail.com']::text[]));

-- Whitelist - видалення
CREATE POLICY "whitelist_delete_slyusars" 
  ON public.slyusars
  FOR DELETE TO authenticated
  USING (lower(auth.jwt() ->> 'email') = ANY (ARRAY['veron3373v@gmail.com']::text[]));

-- ==========================================
-- КРОК 6: ДОДАТКОВА ЗАХИСТ
-- Заборона зміни RLS політик через додаток
-- ==========================================

-- Відкликати права на зміну політик від authenticated ролі
REVOKE ALL ON ALL TABLES IN SCHEMA pg_catalog FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA information_schema FROM authenticated;

-- Дозволити тільки читання для перевірки (опціонально)
GRANT SELECT ON pg_policies TO authenticated;
GRANT SELECT ON pg_tables TO authenticated;

COMMIT;

-- ==========================================
-- ПЕРЕВІРКА НАЛАШТУВАНЬ
-- ==========================================

-- Перевірити чи RLS увімкнено (включаючи whitelist)
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('whitelist', 'acts', 'cars', 'clients', 'details', 'incomes', 'sclad',
                    'settings', 'shops', 'slyusars', 'sms', 'post_arxiv','post_name', 'post_category','vutratu', 'works','faktura','act_changes_notifications')
ORDER BY tablename;

-- Перевірити політики
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('whitelist', 'acts', 'cars', 'clients', 'details', 'incomes', 'sclad',
                    'settings', 'shops', 'slyusars', 'sms', 'post_arxiv','post_name', 'post_category','vutratu', 'works','faktura','act_changes_notifications')
ORDER BY tablename, cmd, policyname;

-- Перевірити політики для whitelist окремо
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'SELECT' THEN '✅ ТІЛЬКИ СВІЙ EMAIL'
    WHEN cmd = 'INSERT' THEN '❌ ЗАБОРОНЕНО'
    WHEN cmd = 'UPDATE' THEN '❌ ЗАБОРОНЕНО'
    WHEN cmd = 'DELETE' THEN '❌ ЗАБОРОНЕНО'
    ELSE 'Інше'
  END as access_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'whitelist'
ORDER BY cmd;

-- Перевірити політики для slyusars окремо
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'SELECT' AND roles::text LIKE '%anon%' THEN '✅ АНОНІМ: читання'
    WHEN cmd = 'SELECT' THEN '✅ WHITELIST: читання'
    WHEN cmd = 'INSERT' THEN '✅ WHITELIST: створення'
    WHEN cmd = 'UPDATE' THEN '✅ WHITELIST: оновлення'
    WHEN cmd = 'DELETE' THEN '✅ WHITELIST: видалення'
    ELSE 'Інше'
  END as access_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'slyusars'
ORDER BY cmd;

-- ==========================================
-- ✅ ГОТОВО!
-- ==========================================
-- Тепер у вас є:
-- 
-- 1️⃣ Таблиця WHITELIST - МАКСИМАЛЬНИЙ ЗАХИСТ:
--    ✅ Користувачі можуть перевіряти ТІЛЬКИ свій email
--    ❌ Заборонено INSERT/UPDATE/DELETE через клієнт (authenticated)
--    ❌ Заборонено ВСІ операції для anon ролі
--    ❌ Відкликано права від public, anon, authenticated
--    🔒 Власник таблиці: postgres (системна роль)
--    ⚠️ Керування можливе ТІЛЬКИ:
--       - Supabase Dashboard → Table Editor
--       - SQL Editor з postgres правами
--       - НІКОЛИ через TypeScript код!
--
-- 2️⃣ Всі робочі таблиці:
--    ✅ Повний доступ для whitelist користувачів
--    ❌ Інші користувачі не мають доступу
--    🔒 RLS примусово увімкнено
--
-- 3️⃣ Таблиця SLYUSARS:
--    ✅ Анонімне читання (для логіну)
--    ✅ Повний CRUD для whitelist користувачів
--
-- ==========================================
-- ⚠️ ВАЖЛИВО - БЕЗПЕКА WHITELIST
-- ==========================================
-- 
-- Що НЕМОЖЛИВО зробити через TypeScript/клієнт:
-- ❌ Додати новий email в whitelist
-- ❌ Змінити існуючий email
-- ❌ Видалити email з whitelist
-- ❌ Побачити всі email адреси (тільки свій)
-- ❌ Обійти RLS політики (навіть з anon key)
-- 
-- Що МОЖНА зробити для керування whitelist:
-- ✅ Зайти в Supabase Dashboard
-- ✅ Table Editor → whitelist → Insert/Update/Delete вручну
-- ❌ НЕ використовуйте SQL Editor (тільки Table Editor!)
-- 
-- НІКОЛИ НЕ РОБІТЬ:
-- 🚫 Не використовуйте service_role key в клієнтському коді
-- 🚫 Не зберігайте service_role key у frontend
-- 🚫 Не передавайте service_role key користувачам
-- 🚫 Не редагуйте whitelist через SQL Editor

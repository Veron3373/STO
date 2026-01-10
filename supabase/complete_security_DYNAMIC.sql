-- ==========================================
-- 🔐 ПОВНА БЕЗПЕКА: ДИНАМІЧНИЙ WHITELIST + RLS
-- ==========================================
-- Цей скрипт налаштовує:
-- 1. Whitelist таблицю (захист від редагування через клієнт)
-- 2. RLS політики з ДИНАМІЧНОЮ перевіркою whitelist
-- 3. Повний CRUD доступ для користувачів з whitelist
-- 
-- ⚡ КЛЮЧОВА ПЕРЕВАГА:
-- Додали новий email в whitelist через Dashboard → працює ОДРАЗУ!
-- НЕ потрібно перезапускати SQL скрипт!

BEGIN;

-- ==============================================================================
-- 🟢 КРОК 1: СТВОРЕННЯ ТА ЗАХИСТ ТАБЛИЦІ WHITELIST
-- ==============================================================================

-- 1. Створення таблиці
CREATE TABLE IF NOT EXISTS public.whitelist (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    comment TEXT
);

-- 2. Індекс для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_whitelist_email ON public.whitelist(email);

-- 3. Увімкнення RLS
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;

-- 4. Очищення старих політик
DROP POLICY IF EXISTS "whitelist_read_own" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_read_only" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_check_own_email" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_insert" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_update" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_delete" ON public.whitelist;

-- 5. Політика: Користувач бачить ТІЛЬКИ свій запис
CREATE POLICY "whitelist_read_own"
ON public.whitelist
FOR SELECT
TO authenticated
USING (email = auth.jwt()->>'email');

-- 6. Заборона редагування через клієнт (тільки через Dashboard)
CREATE POLICY "whitelist_no_insert"
ON public.whitelist
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "whitelist_no_update"
ON public.whitelist
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "whitelist_no_delete"
ON public.whitelist
FOR DELETE
TO authenticated
USING (false);

-- 7. Додаткові обмеження доступу
REVOKE ALL ON public.whitelist FROM PUBLIC;
REVOKE ALL ON public.whitelist FROM anon;
REVOKE ALL ON public.whitelist FROM authenticated;

-- Дозволити ТІЛЬКИ SELECT для authenticated (через RLS політику)
GRANT SELECT ON public.whitelist TO authenticated;

-- Власник таблиці: postgres (системна роль)
ALTER TABLE public.whitelist OWNER TO postgres;

-- 8. Коментарі
COMMENT ON TABLE public.whitelist IS '🔐 ЗАХИЩЕНА ТАБЛИЦЯ: Whitelist дозволених email адрес. 
❌ ЗАБОРОНЕНО через клієнт: INSERT/UPDATE/DELETE
✅ ДОЗВОЛЕНО через клієнт: SELECT тільки свого email
⚠️ Керування ТІЛЬКИ через Supabase Dashboard:
  1. Відкрийте Dashboard
  2. Table Editor → whitelist
  3. Insert/Edit/Delete вручну
  ❌ НЕ використовуйте SQL Editor для whitelist!';
COMMENT ON COLUMN public.whitelist.email IS 'Email адреса користувача (унікальна, lowercase рекомендовано)';
COMMENT ON COLUMN public.whitelist.comment IS 'Опціональний коментар про користувача (роль, ім\'я, тощо)';

-- ==============================================================================
-- 🟡 КРОК 2: НАЛАШТУВАННЯ RLS ДЛЯ ВСІХ РОБОЧИХ ТАБЛИЦЬ
-- ==============================================================================

DO $$
DECLARE 
    t text;
    p record;
    -- Список всіх ваших таблиць
    tables_list text[] := ARRAY[
        'acts', 'cars', 'clients', 'details', 'incomes', 'sclad',
        'settings', 'shops', 'sms', 'post_arxiv','post_name', 
        'post_category','vutratu', 'works','faktura','act_changes_notifications'
    ];
BEGIN
    FOREACH t IN ARRAY tables_list
    LOOP
        -- 1. Увімкнути RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
        
        -- 2. Видалити всі старі політики
        FOR p IN 
          SELECT policyname 
          FROM pg_policies 
          WHERE schemaname = 'public' AND tablename = t
        LOOP
          EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p.policyname, t);
        END LOOP;

        -- 3. Створити нові політики з ДИНАМІЧНОЮ перевіркою whitelist
        -- ⚡ EXISTS запит перевіряє таблицю whitelist при кожному запиті
        -- Додали email → працює одразу, без перезапуску SQL!
        
        -- SELECT
        EXECUTE format(
            'CREATE POLICY "allow_all_for_whitelisted_select" ON public.%I
             FOR SELECT TO authenticated
             USING ( EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>''email'') );', t
        );

        -- INSERT
        EXECUTE format(
            'CREATE POLICY "allow_all_for_whitelisted_insert" ON public.%I
             FOR INSERT TO authenticated
             WITH CHECK ( EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>''email'') );', t
        );

        -- UPDATE
        EXECUTE format(
            'CREATE POLICY "allow_all_for_whitelisted_update" ON public.%I
             FOR UPDATE TO authenticated
             USING ( EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>''email'') );', t
        );

        -- DELETE
        EXECUTE format(
            'CREATE POLICY "allow_all_for_whitelisted_delete" ON public.%I
             FOR DELETE TO authenticated
             USING ( EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>''email'') );', t
        );
    END LOOP;
END $$;

-- ==============================================================================
-- 🔵 КРОК 3: СПЕЦІАЛЬНІ ПРАВА ДЛЯ ТАБЛИЦІ "SLYUSARS"
-- ==============================================================================

ALTER TABLE public.slyusars ENABLE ROW LEVEL SECURITY;

-- Видалити старі політики
DROP POLICY IF EXISTS "anon_read_slyusars" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_select_slyusars" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_insert_slyusars" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_update_slyusars" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_delete_slyusars" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_modify_slyusars_insert" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_modify_slyusars_update" ON public.slyusars;
DROP POLICY IF EXISTS "whitelist_modify_slyusars_delete" ON public.slyusars;

-- Читати можуть ВСІ (потрібно для логіну)
CREATE POLICY "anon_read_slyusars"
ON public.slyusars
FOR SELECT
TO anon, authenticated
USING (true);

-- Редагувати тільки користувачі з whitelist (динамічна перевірка)
CREATE POLICY "whitelist_modify_slyusars_insert"
ON public.slyusars
FOR INSERT
TO authenticated 
WITH CHECK (EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>'email'));

CREATE POLICY "whitelist_modify_slyusars_update"
ON public.slyusars
FOR UPDATE
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>'email'));

CREATE POLICY "whitelist_modify_slyusars_delete"
ON public.slyusars
FOR DELETE
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.whitelist WHERE email = auth.jwt()->>'email'));

-- ==============================================================================
-- 🔒 КРОК 4: ДОДАТКОВИЙ ЗАХИСТ
-- ==============================================================================

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
    WHEN cmd = 'SELECT' AND roles::text LIKE '%anon%' THEN '✅ ВСІМ: читання'
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
--    ❌ Заборонено INSERT/UPDATE/DELETE через клієнт
--    🔒 Власник таблиці: postgres
--    ⚠️ Керування ТІЛЬКИ через Table Editor в Dashboard
--
-- 2️⃣ Всі робочі таблиці - ДИНАМІЧНА ПЕРЕВІРКА:
--    ⚡ EXISTS (SELECT 1 FROM whitelist ...) - перевірка при кожному запиті
--    ✅ Повний CRUD для користувачів з whitelist
--    ❌ Інші користувачі не мають доступу
--    🔒 RLS примусово увімкнено
--    💡 Додали новий email в whitelist → працює ОДРАЗУ, без перезапуску SQL!
--
-- 3️⃣ Таблиця SLYUSARS:
--    ✅ Читання: для всіх (потрібно для логіну)
--    ✅ Редагування: тільки для whitelist користувачів
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
--
-- ==========================================
-- ⚡ КЛЮЧОВА ПЕРЕВАГА НОВОЇ ВЕРСІЇ:
-- ==========================================
--
-- СТАРИЙ СПОСІБ (неправильно):
-- whitelist_emails text[] := ARRAY['email@gmail.com'];
-- ❌ Жорстко закодовано
-- ❌ Додали новий email → треба перезапускати весь SQL!
--
-- НОВИЙ СПОСІБ (правильно):
-- EXISTS (SELECT 1 FROM public.whitelist WHERE email = ...)
-- ✅ Динамічна перевірка
-- ✅ Додали email в Dashboard → працює ОДРАЗУ!
-- ✅ Немає жодних затримок

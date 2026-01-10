-- ========================================
-- 🛡️ WHITELIST RLS - НАЛАШТУВАННЯ БЕЗПЕКИ
-- ========================================
-- Цей скрипт налаштовує Row Level Security (RLS)
-- для існуючої таблиці whitelist
-- БЕЗ видалення даних!

-- ========================================
-- 🛡️ ROW LEVEL SECURITY (RLS) ПОЛІТИКИ
-- ========================================

-- 1️⃣ Увімкнути RLS на таблиці
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;

-- 2️⃣ Видалити старі політики (якщо є)
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
  -- Дозволити читання ТІЛЬКИ якщо email = email авторизованого користувача
  email = auth.jwt()->>'email'
);

-- ========================================
-- 🚫 ЗАБОРОНА INSERT, UPDATE, DELETE
-- ========================================
-- Ніхто через клієнт не може додавати/змінювати/видаляти

-- Заборона INSERT (додавання)
CREATE POLICY "whitelist_no_insert"
ON public.whitelist
FOR INSERT
TO authenticated
WITH CHECK (false); -- Завжди false = заборонено

-- Заборона UPDATE (редагування)
CREATE POLICY "whitelist_no_update"
ON public.whitelist
FOR UPDATE
TO authenticated
USING (false); -- Завжди false = заборонено

-- Заборона DELETE (видалення)
CREATE POLICY "whitelist_no_delete"
ON public.whitelist
FOR DELETE
TO authenticated
USING (false); -- Завжди false = заборонено

-- ========================================
-- ℹ️ КОМЕНТАРІ ДО ТАБЛИЦІ
-- ========================================
COMMENT ON TABLE public.whitelist IS 'Whitelist дозволених email адрес. Захищено RLS: тільки читання власного email, заборонено INSERT/UPDATE/DELETE через клієнт.';
COMMENT ON COLUMN public.whitelist.email IS 'Email адреса користувача (унікальна)';

-- ========================================
-- ✅ ГОТОВО!
-- ========================================
-- Тепер таблиця whitelist захищена:
-- ✅ Користувачі можуть перевіряти ТІЛЬКИ свій email
-- ❌ Заборонено INSERT (додавання)
-- ❌ Заборонено UPDATE (редагування)
-- ❌ Заборонено DELETE (видалення)
-- 
-- ⚠️ Керування whitelist можливе ТІЛЬКИ:
-- - Через SQL Editor в Supabase Dashboard
-- - Через Table Editor (ручне додавання/видалення)
-- 
-- 💡 Ваші дані в таблиці НЕ будуть видалені!

-- ========================================
-- 🔐 WHITELIST TABLE - ЗАХИЩЕНА ТАБЛИЦЯ
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
-- 🛡️ ROW LEVEL SECURITY (RLS) ПОЛІТИКИ
-- ========================================

-- 4️⃣ Увімкнути RLS на таблиці
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;

-- 5️⃣ Видалити всі старі політики (на всяк випадок)
DROP POLICY IF EXISTS "whitelist_read_only" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_insert" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_update" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_no_delete" ON public.whitelist;
DROP POLICY IF EXISTS "whitelist_check_own_email" ON public.whitelist;

-- ========================================
-- 📖 ПОЛІТИКА ЧИТАННЯ - ТІЛЬКИ СВІЙ EMAIL
-- ========================================
-- Користувач може перевірити ТІЛьКИ свій власний email
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
-- ℹ️ КОМЕНТАРІ ДО ТАБЛИЦІ
-- ========================================
COMMENT ON TABLE public.whitelist IS 'Whitelist дозволених email адрес. Захищено RLS: тільки читання власного email, заборонено INSERT/UPDATE/DELETE через клієнт.';
COMMENT ON COLUMN public.whitelist.email IS 'Email адреса користувача (унікальна)';
COMMENT ON COLUMN public.whitelist.comment IS 'Опціональний коментар про користувача';

-- ========================================
-- ✅ ГОТОВО!
-- ========================================
-- Тепер таблиця whitelist:
-- ✅ Дозволяє користувачам перевіряти ТІЛЬКИ свій email (SELECT WHERE email = їх email)
-- ❌ Заборонено INSERT через клієнт
-- ❌ Заборонено UPDATE через клієнт
-- ❌ Заборонено DELETE через клієнт
-- 
-- Керування whitelist можливе ТІЛЬКИ:
-- - Через SQL Editor в Supabase Dashboard
-- - Через Database схему (SQL запити від адміністратора)
-- - Через API з Service Role Key (НЕ anon key)

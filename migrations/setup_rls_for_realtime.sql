-- ================================================
-- НАЛАШТУВАННЯ RLS ДЛЯ REALTIME
-- ================================================
-- Row Level Security може блокувати Realtime події
-- Цей SQL налаштовує правильні політики
-- ================================================

-- 1️⃣ Перевірка поточного стану RLS
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'post_arxiv';

-- 2️⃣ Перевірка існуючих політик
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'post_arxiv';

-- ================================================
-- ВАРІАНТ 1: Вимкнути RLS (НЕБЕЗПЕЧНО для продакшн!)
-- ================================================
-- Використовуйте тільки для тестування!
-- ALTER TABLE post_arxiv DISABLE ROW LEVEL SECURITY;

-- ================================================
-- ВАРІАНТ 2: Налаштувати правильні політики (РЕКОМЕНДОВАНО)
-- ================================================

-- Спочатку видаляємо старі політики якщо є
DROP POLICY IF EXISTS "Enable read access for all users" ON post_arxiv;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON post_arxiv;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON post_arxiv;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON post_arxiv;

-- Увімкнути RLS
ALTER TABLE post_arxiv ENABLE ROW LEVEL SECURITY;

-- Політика для SELECT (читання) - дозволити всім автентифікованим
CREATE POLICY "Enable read access for authenticated users"
ON post_arxiv
FOR SELECT
TO authenticated
USING (true);

-- Політика для INSERT (створення) - дозволити всім автентифікованим
CREATE POLICY "Enable insert for authenticated users"
ON post_arxiv
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Політика для UPDATE (оновлення) - дозволити всім автентифікованим
CREATE POLICY "Enable update for authenticated users"
ON post_arxiv
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Політика для DELETE (видалення) - дозволити всім автентифікованим
CREATE POLICY "Enable delete for authenticated users"
ON post_arxiv
FOR DELETE
TO authenticated
USING (true);

-- ================================================
-- ВАЖЛИВО ДЛЯ REALTIME!
-- ================================================
-- Для Realtime потрібно також дозволити доступ для 'anon' ролі
-- якщо ви використовуєте anon ключ

-- Політика для SELECT для anon
CREATE POLICY "Enable read access for anon users"
ON post_arxiv
FOR SELECT
TO anon
USING (true);

-- ================================================
-- 3️⃣ Перевірка що політики створені
-- ================================================
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename = 'post_arxiv';

-- ================================================
-- 4️⃣ Тестування доступу
-- ================================================
-- Спробуйте виконати SELECT від імені поточного користувача
SELECT COUNT(*) FROM post_arxiv;

-- ================================================
-- ПРИМІТКИ:
-- ================================================
-- 1. Якщо RLS увімкнений, але політик немає - доступ заборонений
-- 2. Realtime працює від імені того ж користувача що і запити
-- 3. Якщо ви використовуєте service_role ключ - RLS ігнорується
-- 4. Якщо ви використовуєте anon ключ - потрібні політики для anon
-- ================================================

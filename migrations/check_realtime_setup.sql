-- ================================================
-- ПЕРЕВІРКА НАЛАШТУВАНЬ REALTIME ДЛЯ POST_ARXIV
-- ================================================
-- Виконайте цей SQL в Supabase SQL Editor
-- для перевірки чи правильно налаштований Realtime
-- ================================================

-- 1️⃣ Перевірка чи таблиця post_arxiv існує
SELECT 
  table_name,
  table_schema
FROM information_schema.tables
WHERE table_name = 'post_arxiv';

-- 2️⃣ Перевірка структури таблиці post_arxiv
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'post_arxiv'
ORDER BY ordinal_position;

-- 3️⃣ Перевірка чи таблиця в публікації Realtime
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE tablename = 'post_arxiv'
  AND pubname = 'supabase_realtime';

-- 4️⃣ Перевірка REPLICA IDENTITY
SELECT 
  relname AS table_name,
  CASE relreplident
    WHEN 'd' THEN 'DEFAULT (primary key)'
    WHEN 'n' THEN 'NOTHING'
    WHEN 'f' THEN 'FULL (всі колонки)'
    WHEN 'i' THEN 'INDEX'
  END AS replica_identity
FROM pg_class
WHERE relname = 'post_arxiv';

-- 5️⃣ Перевірка чи є поле xto_zapusav
SELECT 
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'post_arxiv'
  AND column_name = 'xto_zapusav';

-- 6️⃣ Перевірка останніх записів (чи заповнюється xto_zapusav)
SELECT 
  post_arxiv_id,
  client_id,
  data_on,
  data_off,
  xto_zapusav,
  created_at
FROM post_arxiv
ORDER BY created_at DESC
LIMIT 10;

-- ================================================
-- ОЧІКУВАНІ РЕЗУЛЬТАТИ:
-- ================================================
-- 1️⃣ Має повернути: post_arxiv | public
-- 2️⃣ Має показати всі колонки включно з xto_zapusav
-- 3️⃣ Має повернути: public | post_arxiv | supabase_realtime
-- 4️⃣ Має бути: FULL (всі колонки)
-- 5️⃣ Має повернути: xto_zapusav | text або character varying
-- 6️⃣ Має показати записи з заповненим xto_zapusav
-- ================================================

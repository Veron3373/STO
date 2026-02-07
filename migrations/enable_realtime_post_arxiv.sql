-- ===========================================
-- МІГРАЦІЯ: Ввімкнення Realtime для post_arxiv
-- ===========================================
-- Цей SQL потрібно виконати в Supabase SQL Editor
-- щоб Realtime працював для таблиці post_arxiv
-- ===========================================

-- 1. Додати таблицю post_arxiv до публікації Realtime
-- (якщо вже додана — помилка буде ігноруватися)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE post_arxiv;
  RAISE NOTICE 'Таблицю post_arxiv додано до supabase_realtime';
EXCEPTION 
  WHEN duplicate_object THEN
    RAISE NOTICE 'Таблиця post_arxiv вже в публікації supabase_realtime';
END $$;

-- 2. Встановити REPLICA IDENTITY FULL
-- Це потрібно щоб при DELETE і UPDATE приходили ВСІ поля,
-- а не тільки primary key
ALTER TABLE post_arxiv REPLICA IDENTITY FULL;

-- 3. Перевірка — переглянути які таблиці зараз в публікації
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

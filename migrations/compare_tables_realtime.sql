-- ==================================================
-- ПОРІВНЯННЯ ТАБЛИЦЬ: post_arxiv VS act_changes_notifications
-- ==================================================

-- 1. Перевірка публікації Realtime (мають бути ОБИДВІ таблиці)
SELECT 
    tablename, 
    pubname 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('post_arxiv', 'act_changes_notifications');

-- 2. Перевірка REPLICA IDENTITY (має бути FULL для обох)
SELECT 
    relname as table_name, 
    CASE relreplident
        WHEN 'd' THEN 'DEFAULT'
        WHEN 'n' THEN 'NOTHING'
        WHEN 'f' THEN 'FULL (Потрібно для Realtime)'
        WHEN 'i' THEN 'INDEX'
    END as replica_identity
FROM pg_class 
WHERE relname IN ('post_arxiv', 'act_changes_notifications');

-- 3. Перевірка RLS (чи увімкнено)
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('post_arxiv', 'act_changes_notifications');

-- 4. Перевірка політик (найважливіше!)
SELECT 
    tablename,
    policyname,
    cmd as operation,
    roles,
    qual as using_expression,
    with_check
FROM pg_policies
WHERE tablename IN ('post_arxiv', 'act_changes_notifications')
ORDER BY tablename, cmd;

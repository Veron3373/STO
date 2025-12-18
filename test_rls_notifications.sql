-- ==========================================
-- ТЕСТУВАННЯ RLS ПОЛІТИКИ ДЛЯ act_changes_notifications
-- ==========================================

-- 1. Перевірити чи RLS увімкнено
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'act_changes_notifications';

-- 2. Перевірити всі політики
SELECT 
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'act_changes_notifications'
ORDER BY cmd, policyname;

-- 3. Перевірити структуру таблиці
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'act_changes_notifications'
ORDER BY ordinal_position;

-- 4. Тестовий INSERT (виконайте від імені вашого користувача)
-- Розкоментуйте для тесту:
/*
INSERT INTO act_changes_notifications (
  act_id,
  item_name,
  cina,
  kilkist,
  zarplata,
  dodav_vudaluv,
  changed_by_surname,
  delit,
  data
) VALUES (
  999999,
  'ТЕСТ',
  100,
  1,
  0,
  true,
  'TEST USER',
  false,
  NOW()
);
*/

-- 5. Перевірити чи є записи
SELECT COUNT(*) as total_records
FROM act_changes_notifications;

-- 6. Показати останні 5 записів
SELECT 
  notification_id,
  act_id,
  item_name,
  changed_by_surname,
  dodav_vudaluv,
  delit,
  data,
  pib,
  auto
FROM act_changes_notifications
ORDER BY data DESC
LIMIT 5;

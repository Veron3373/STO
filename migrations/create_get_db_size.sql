-- =============================================================
-- 📊 RPC-функція для моніторингу розміру бази даних
-- Виконати ОДИН РАЗ у Supabase SQL Editor (Dashboard → SQL Editor)
-- =============================================================

CREATE OR REPLACE FUNCTION get_db_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database());
$$;

-- Дозволити виклик для anon та authenticated ролей
GRANT EXECUTE ON FUNCTION get_db_size() TO anon, authenticated;

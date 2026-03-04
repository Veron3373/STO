-- ============================================================
-- 004_atlas_telegram_and_conditions.sql
-- 🔔 Атлас — Telegram інтеграція + перевірка умов
-- ============================================================

-- ────────────────────────────────────────
-- 1. RPC: execute_condition_query
-- Безпечне виконання SELECT-запитів для conditional нагадувань
-- Повертає кількість рядків (0 = умова НЕ виконана)
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION execute_condition_query(query_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_count INTEGER := 0;
BEGIN
  -- Безпека: дозволяємо тільки SELECT
  IF query_text IS NULL OR TRIM(query_text) = '' THEN
    RETURN 0;
  END IF;

  -- Перевірка: тільки SELECT (без INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE)
  IF NOT (UPPER(TRIM(query_text)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Дозволені тільки SELECT-запити';
  END IF;

  -- Перевірка на заборонені ключові слова
  IF UPPER(query_text) ~ '(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)' THEN
    RAISE EXCEPTION 'Запит містить заборонені операції';
  END IF;

  -- Виконати запит і порахувати рядки
  EXECUTE 'SELECT COUNT(*) FROM (' || query_text || ') AS _cq' INTO row_count;

  RETURN COALESCE(row_count, 0);
EXCEPTION
  WHEN OTHERS THEN
    -- Логувати помилку, але не зламати систему
    RAISE WARNING 'execute_condition_query error: %', SQLERRM;
    RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_condition_query(TEXT) TO authenticated;

COMMENT ON FUNCTION execute_condition_query(TEXT) IS 
  '🔍 Безпечне виконання SELECT для conditional нагадувань Атласа. Повертає кількість рядків.';

-- ────────────────────────────────────────
-- 2. RPC: get_telegram_link_status
-- Перевіряє чи користувач прив'язав Telegram
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_telegram_link_status(p_slyusar_id BIGINT)
RETURNS TABLE (
  is_linked    BOOLEAN,
  is_active    BOOLEAN,
  telegram_username TEXT,
  linked_at    TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    TRUE AS is_linked,
    t.is_active,
    t.telegram_username,
    t.linked_at
  FROM atlas_telegram_users t
  WHERE t.slyusar_id = p_slyusar_id

  UNION ALL

  SELECT FALSE, FALSE, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM atlas_telegram_users WHERE slyusar_id = p_slyusar_id
  )

  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_telegram_link_status(BIGINT) TO authenticated;

-- ────────────────────────────────────────
-- ГОТОВО ✅
-- ────────────────────────────────────────

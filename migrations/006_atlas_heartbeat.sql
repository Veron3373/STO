-- ============================================================
-- 006_atlas_heartbeat.sql
-- 💓 Heartbeat — гібридна клієнт/сервер обробка нагадувань
-- Клієнт кожні 30с оновлює heartbeat.
-- Сервер (pg_cron) перевіряє: якщо heartbeat свіжий — пропускає.
-- ============================================================

-- ────────────────────────────────────────
-- 1. Таблиця heartbeat (одна строка)
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_app_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slyusar_id INTEGER
);

-- Вставити початковий рядок (дуже стара дата = "неактивний")
INSERT INTO atlas_app_heartbeat (id, last_seen_at)
VALUES (1, '2000-01-01'::timestamptz)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────
-- 2. RPC: оновити heartbeat (клієнт кожні 30с)
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_app_heartbeat(p_slyusar_id INTEGER DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE atlas_app_heartbeat
  SET last_seen_at = NOW(),
      slyusar_id = COALESCE(p_slyusar_id, slyusar_id)
  WHERE id = 1;
END;
$$;

-- ────────────────────────────────────────
-- 3. RPC: перевірити чи клієнт живий (сервер)
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_client_alive(threshold_seconds INTEGER DEFAULT 75)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM atlas_app_heartbeat
    WHERE id = 1
    AND last_seen_at > NOW() - make_interval(secs => threshold_seconds)
  );
END;
$$;

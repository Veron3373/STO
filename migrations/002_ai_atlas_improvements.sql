-- ============================================================
-- 002_ai_atlas_improvements.sql
-- 🧠 AI Атлас — Покращення структури БД
-- Нові таблиці: recommendations, feedback, purchase_requests
-- Нові поля: sclad.min_quantity, sclad.return_reason
-- Нові поля в JSONB settings.data
-- ============================================================

-- ────────────────────────────────────────
-- 1. ТАБЛИЦЯ sclad — нові поля
-- ────────────────────────────────────────

-- Мінімальний залишок для автоматичного замовлення
ALTER TABLE sclad
  ADD COLUMN IF NOT EXISTS min_quantity NUMERIC DEFAULT 0;

-- Причина повернення (якщо деталь повернуто)
ALTER TABLE sclad
  ADD COLUMN IF NOT EXISTS return_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN sclad.min_quantity IS 'Мінімальний залишок. Якщо quantity < min_quantity → потрібне замовлення';
COMMENT ON COLUMN sclad.return_reason IS 'Причина повернення деталі (якщо було повернення)';

-- ────────────────────────────────────────
-- 2. ТАБЛИЦЯ recommendations
-- Рекомендації клієнтам (нагадування про ТО, заміну тощо)
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendations (
  recommendation_id BIGSERIAL PRIMARY KEY,
  act_id BIGINT REFERENCES acts(act_id) ON DELETE SET NULL,
  client_id BIGINT REFERENCES clients(client_id) ON DELETE CASCADE,
  date_recommended TIMESTAMPTZ DEFAULT NOW(),
  date_to_remind TIMESTAMPTZ,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done', 'cancelled')),
  created_by TEXT DEFAULT NULL,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recommendations_client ON recommendations(client_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_remind ON recommendations(date_to_remind)
  WHERE status = 'pending';

COMMENT ON TABLE recommendations IS 'Рекомендації та нагадування для клієнтів (ТО, заміна деталей тощо)';

-- ────────────────────────────────────────
-- 3. ТАБЛИЦЯ feedback
-- Зворотний зв'язок від клієнтів
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(client_id) ON DELETE CASCADE,
  act_id BIGINT REFERENCES acts(act_id) ON DELETE SET NULL,
  rating NUMERIC CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_feedback_client ON feedback(client_id);
CREATE INDEX IF NOT EXISTS idx_feedback_act ON feedback(act_id);
CREATE INDEX IF NOT EXISTS idx_feedback_date ON feedback(date);

COMMENT ON TABLE feedback IS 'Зворотний зв''язок та оцінки від клієнтів після обслуговування';

-- ────────────────────────────────────────
-- 4. ТАБЛИЦЯ purchase_requests
-- Заявки на закупівлю запчастин
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_requests (
  request_id BIGSERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ DEFAULT NOW(),
  supplier_id BIGINT REFERENCES shops(shop_id) ON DELETE SET NULL,
  details JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'ordered', 'received', 'cancelled')),
  total_amount NUMERIC DEFAULT 0,
  notes TEXT DEFAULT NULL,
  created_by TEXT DEFAULT NULL,
  date_ordered TIMESTAMPTZ DEFAULT NULL,
  date_received TIMESTAMPTZ DEFAULT NULL,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_supplier ON purchase_requests(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_date ON purchase_requests(date_created);

COMMENT ON TABLE purchase_requests IS 'Заявки на закупівлю запчастин у постачальників';
COMMENT ON COLUMN purchase_requests.details IS 'Масив деталей: [{sclad_id, name, article, quantity, price}]';

-- ────────────────────────────────────────
-- 5. RLS (Row Level Security) для нових таблиць
-- ────────────────────────────────────────

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

-- Політики доступу — authenticated може все (як і для інших таблиць)
CREATE POLICY "recommendations_all" ON recommendations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "feedback_all" ON feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "purchase_requests_all" ON purchase_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────
-- 6. RPC функція: Перевірка низьких залишків на складі
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TABLE (
  sclad_id BIGINT,
  article TEXT,
  name TEXT,
  quantity NUMERIC,
  min_quantity NUMERIC,
  deficit NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    s.sclad_id,
    COALESCE(s.part_number, '—') AS article,
    COALESCE(s.name, '—') AS name,
    COALESCE(s.kilkist_on, 0) - COALESCE(s.kilkist_off, 0) AS quantity,
    COALESCE(s.min_quantity, 0) AS min_quantity,
    COALESCE(s.min_quantity, 0) - (COALESCE(s.kilkist_on, 0) - COALESCE(s.kilkist_off, 0)) AS deficit
  FROM sclad s
  WHERE s.min_quantity IS NOT NULL
    AND s.min_quantity > 0
    AND (COALESCE(s.kilkist_on, 0) - COALESCE(s.kilkist_off, 0)) < s.min_quantity
  ORDER BY deficit DESC;
$$;

GRANT EXECUTE ON FUNCTION check_low_stock() TO authenticated;

-- ────────────────────────────────────────
-- 7. RPC функція: Довго відкриті акти
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_long_open_acts(threshold_days INTEGER DEFAULT 14)
RETURNS TABLE (
  act_id BIGINT,
  date_on TIMESTAMPTZ,
  days_open INTEGER,
  client_name TEXT,
  car TEXT,
  slusar TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    a.act_id,
    a.date_on,
    EXTRACT(DAY FROM NOW() - a.date_on)::INTEGER AS days_open,
    COALESCE(a.data->>'ПІБ', '—') AS client_name,
    COALESCE(a.data->>'Марка', '') || ' ' || COALESCE(a.data->>'Модель', '') AS car,
    COALESCE(a.data->>'Слюсар', '—') AS slusar
  FROM acts a
  WHERE a.date_off IS NULL
    AND a.date_on < NOW() - (threshold_days || ' days')::INTERVAL
  ORDER BY a.date_on ASC;
$$;

GRANT EXECUTE ON FUNCTION check_long_open_acts(INTEGER) TO authenticated;

-- ────────────────────────────────────────
-- 8. RPC функція: Рекомендації до відправки
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pending_reminders()
RETURNS TABLE (
  recommendation_id BIGINT,
  client_id BIGINT,
  client_name TEXT,
  client_phone TEXT,
  text TEXT,
  date_to_remind TIMESTAMPTZ,
  act_id BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.recommendation_id,
    r.client_id,
    COALESCE(c.data->>'ПІБ', '—') AS client_name,
    COALESCE(c.data->>'Телефон', '') AS client_phone,
    r.text,
    r.date_to_remind,
    r.act_id
  FROM recommendations r
  LEFT JOIN clients c ON c.client_id = r.client_id
  WHERE r.status = 'pending'
    AND r.date_to_remind <= NOW()
  ORDER BY r.date_to_remind ASC;
$$;

GRANT EXECUTE ON FUNCTION get_pending_reminders() TO authenticated;

-- ────────────────────────────────────────
-- 9. RPC функція: Статистика клієнта (VIP визначення)
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_client_stats(p_client_id BIGINT)
RETURNS TABLE (
  total_acts BIGINT,
  total_revenue NUMERIC,
  first_visit TIMESTAMPTZ,
  last_visit TIMESTAMPTZ,
  avg_check NUMERIC,
  vip_level TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH stats AS (
    SELECT
      COUNT(*) AS total_acts,
      COALESCE(SUM(
        COALESCE((a.data->>'СумаРобіт')::numeric, 0) +
        COALESCE((a.data->>'СумаДеталей')::numeric, 0)
      ), 0) AS total_revenue,
      MIN(a.date_on) AS first_visit,
      MAX(a.date_on) AS last_visit
    FROM acts a
    WHERE a.client_id = p_client_id
  )
  SELECT
    s.total_acts,
    s.total_revenue,
    s.first_visit,
    s.last_visit,
    CASE WHEN s.total_acts > 0
      THEN ROUND(s.total_revenue / s.total_acts, 2)
      ELSE 0
    END AS avg_check,
    CASE
      WHEN s.total_revenue >= 100000 THEN '💎 VIP'
      WHEN s.total_revenue >= 30000 THEN '⭐ Постійний'
      WHEN s.total_acts >= 3 THEN '🔄 Повторний'
      ELSE '🆕 Новий'
    END AS vip_level
  FROM stats s;
$$;

GRANT EXECUTE ON FUNCTION get_client_stats(BIGINT) TO authenticated;

-- ────────────────────────────────────────
-- ГОТОВО
-- ────────────────────────────────────────

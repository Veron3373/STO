-- ============================================================
-- 003_atlas_reminders.sql
-- 🔔 Атлас — Система планування та нагадувань
-- Таблиці: atlas_reminders, atlas_reminder_logs
-- RPC-функції для обробки нагадувань
-- ============================================================

-- ────────────────────────────────────────
-- 1. ТАБЛИЦЯ atlas_reminders
-- Основна таблиця нагадувань та запланованих задач
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_reminders (
  reminder_id    BIGSERIAL PRIMARY KEY,

  -- Хто створив
  created_by     BIGINT REFERENCES slyusars(slyusar_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Текст та опис
  title          TEXT NOT NULL,                          -- Коротка назва: "Розрахувати слюсарів"
  description    TEXT DEFAULT NULL,                      -- Детальний опис (необов'язково)

  -- Тип нагадування
  reminder_type  TEXT NOT NULL DEFAULT 'once'
    CHECK (reminder_type IN (
      'once',           -- Одноразове (конкретна дата/час)
      'recurring',      -- Повторюване (за cron/правилом)
      'conditional'     -- Умовне (перевіряє БД і спрацьовує якщо є результати)
    )),

  -- Розклад
  -- Для 'once': конкретна дата/час
  trigger_at     TIMESTAMPTZ DEFAULT NULL,
  -- Для 'recurring': правило повторення (JSON)
  -- Приклади:
  --   {"type":"daily","time":"09:00"}
  --   {"type":"weekly","days":["mon","wed","fri"],"time":"08:30"}
  --   {"type":"monthly","day":15,"time":"10:00"}
  --   {"type":"interval","hours":4}
  schedule       JSONB DEFAULT NULL,

  -- Для 'conditional': SQL-запит який перевіряє умову
  -- Якщо повертає рядки → нагадування спрацьовує
  -- Приклад: SELECT act_id, data->>'ПІБ' FROM acts WHERE date_off IS NULL AND date_on < NOW() - INTERVAL '21 days'
  condition_query TEXT DEFAULT NULL,
  -- Як часто перевіряти умову
  condition_check_interval TEXT DEFAULT '1 hour',

  -- Адресати
  -- 'self' = тільки я, 'all' = всі, 'mechanics' = всі слюсарі,
  -- або JSON масив конкретних slyusar_id: [1, 5, 12]
  recipients     JSONB DEFAULT '"self"'::jsonb,

  -- Канал доставки
  channel        TEXT NOT NULL DEFAULT 'app'
    CHECK (channel IN (
      'app',            -- Тільки в додатку (toast/popup)
      'telegram',       -- Тільки Telegram
      'both'            -- І в додатку, і в Telegram
    )),

  -- Пріоритет
  priority       TEXT DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Статус
  status         TEXT DEFAULT 'active'
    CHECK (status IN (
      'active',         -- Активне, чекає на спрацювання
      'paused',         -- На паузі (тимчасово вимкнене)
      'completed',      -- Завершене (для одноразових після спрацювання)
      'cancelled'       -- Скасоване
    )),

  -- Трекінг
  last_triggered_at  TIMESTAMPTZ DEFAULT NULL,  -- Коли останній раз спрацювало
  next_trigger_at    TIMESTAMPTZ DEFAULT NULL,  -- Коли наступне спрацювання
  trigger_count      INTEGER DEFAULT 0,         -- Скільки разів спрацювало

  -- Додаткові дані (теги, кольори, іконки тощо)
  -- Приклад: {"color":"#FF5733","icon":"🔧","tags":["фінанси","слюсарі"]}
  meta           JSONB DEFAULT '{}'::jsonb
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_reminders_status
  ON atlas_reminders(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reminders_next_trigger
  ON atlas_reminders(next_trigger_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reminders_created_by
  ON atlas_reminders(created_by);

CREATE INDEX IF NOT EXISTS idx_reminders_type
  ON atlas_reminders(reminder_type);

COMMENT ON TABLE atlas_reminders IS '🔔 Система нагадувань Атласа: одноразові, повторювані та умовні нагадування';

-- ────────────────────────────────────────
-- 2. ТАБЛИЦЯ atlas_reminder_logs
-- Журнал доставки нагадувань
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_reminder_logs (
  log_id         BIGSERIAL PRIMARY KEY,
  reminder_id    BIGINT NOT NULL REFERENCES atlas_reminders(reminder_id) ON DELETE CASCADE,

  -- Кому відправлено
  recipient_id   BIGINT REFERENCES slyusars(slyusar_id) ON DELETE SET NULL,
  recipient_name TEXT DEFAULT NULL,

  -- Як відправлено
  channel        TEXT NOT NULL CHECK (channel IN ('app', 'telegram')),

  -- Текст який було відправлено (може включати результат condition_query)
  message_text   TEXT NOT NULL,

  -- Статус доставки
  delivery_status TEXT DEFAULT 'sent'
    CHECK (delivery_status IN (
      'sent',           -- Відправлено
      'delivered',      -- Доставлено (для Telegram)
      'read',           -- Прочитано (для app)
      'failed',         -- Помилка відправки
      'dismissed'       -- Відхилено користувачем
    )),

  -- Час подій
  sent_at        TIMESTAMPTZ DEFAULT NOW(),
  delivered_at   TIMESTAMPTZ DEFAULT NULL,
  read_at        TIMESTAMPTZ DEFAULT NULL,

  -- Дані умовного запиту (якщо conditional — що знайшлося)
  condition_data JSONB DEFAULT NULL,

  -- Помилка (якщо failed)
  error_message  TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_reminder
  ON atlas_reminder_logs(reminder_id);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_recipient
  ON atlas_reminder_logs(recipient_id);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_status
  ON atlas_reminder_logs(delivery_status)
  WHERE delivery_status IN ('sent', 'delivered');

CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent
  ON atlas_reminder_logs(sent_at DESC);

COMMENT ON TABLE atlas_reminder_logs IS '📋 Журнал доставки нагадувань: хто, коли, через який канал';

-- ────────────────────────────────────────
-- 3. ТАБЛИЦЯ atlas_telegram_users
-- Прив'язка Telegram-акаунтів до слюсарів
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_telegram_users (
  id             BIGSERIAL PRIMARY KEY,
  slyusar_id     BIGINT NOT NULL UNIQUE REFERENCES slyusars(slyusar_id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT DEFAULT NULL,
  linked_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active      BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_slyusar
  ON atlas_telegram_users(slyusar_id);

CREATE INDEX IF NOT EXISTS idx_telegram_users_chat
  ON atlas_telegram_users(telegram_chat_id);

COMMENT ON TABLE atlas_telegram_users IS '🔗 Зв''язок Telegram акаунтів з працівниками СТО';

-- ────────────────────────────────────────
-- 4. RLS (Row Level Security)
-- ────────────────────────────────────────

ALTER TABLE atlas_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_telegram_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_reminders_all" ON atlas_reminders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "atlas_reminder_logs_all" ON atlas_reminder_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "atlas_telegram_users_all" ON atlas_telegram_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────
-- 5. RPC: Отримати активні нагадування які потрібно доставити
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_due_reminders()
RETURNS TABLE (
  reminder_id    BIGINT,
  title          TEXT,
  description    TEXT,
  reminder_type  TEXT,
  recipients     JSONB,
  channel        TEXT,
  priority       TEXT,
  condition_query TEXT,
  schedule       JSONB,
  trigger_count  INTEGER,
  created_by     BIGINT,
  creator_name   TEXT,
  meta           JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.reminder_id,
    r.title,
    r.description,
    r.reminder_type,
    r.recipients,
    r.channel,
    r.priority,
    r.condition_query,
    r.schedule,
    r.trigger_count,
    r.created_by,
    COALESCE(s.data->>'Name', '—') AS creator_name,
    r.meta
  FROM atlas_reminders r
  LEFT JOIN slyusars s ON s.slyusar_id = r.created_by
  WHERE r.status = 'active'
    AND r.next_trigger_at IS NOT NULL
    AND r.next_trigger_at <= NOW()
  ORDER BY
    CASE r.priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low'    THEN 4
    END,
    r.next_trigger_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_due_reminders() TO authenticated;

-- ────────────────────────────────────────
-- 6. RPC: Отримати всі нагадування для користувача
-- (створені ним або де він є адресатом)
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_reminders(p_slyusar_id BIGINT)
RETURNS TABLE (
  reminder_id    BIGINT,
  title          TEXT,
  description    TEXT,
  reminder_type  TEXT,
  trigger_at     TIMESTAMPTZ,
  schedule       JSONB,
  recipients     JSONB,
  channel        TEXT,
  priority       TEXT,
  status         TEXT,
  created_at     TIMESTAMPTZ,
  next_trigger_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  trigger_count  INTEGER,
  creator_name   TEXT,
  is_mine        BOOLEAN,
  meta           JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.reminder_id,
    r.title,
    r.description,
    r.reminder_type,
    r.trigger_at,
    r.schedule,
    r.recipients,
    r.channel,
    r.priority,
    r.status,
    r.created_at,
    r.next_trigger_at,
    r.last_triggered_at,
    r.trigger_count,
    COALESCE(s.data->>'Name', '—') AS creator_name,
    (r.created_by = p_slyusar_id) AS is_mine,
    r.meta
  FROM atlas_reminders r
  LEFT JOIN slyusars s ON s.slyusar_id = r.created_by
  WHERE r.status IN ('active', 'paused')
    AND (
      r.created_by = p_slyusar_id
      OR r.recipients = '"all"'::jsonb
      OR r.recipients = '"mechanics"'::jsonb
      OR r.recipients = '"self"'::jsonb AND r.created_by = p_slyusar_id
      OR r.recipients @> to_jsonb(p_slyusar_id)
    )
  ORDER BY
    r.status ASC,
    CASE r.priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low'    THEN 4
    END,
    COALESCE(r.next_trigger_at, r.trigger_at, r.created_at) ASC;
$$;

GRANT EXECUTE ON FUNCTION get_my_reminders(BIGINT) TO authenticated;

-- ────────────────────────────────────────
-- 7. RPC: Позначити нагадування як спрацьоване
-- (оновлює trigger_count, last_triggered_at, обчислює next_trigger_at)
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_reminder(p_reminder_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_type TEXT;
  v_schedule JSONB;
  v_next TIMESTAMPTZ;
BEGIN
  SELECT reminder_type, schedule
  INTO v_type, v_schedule
  FROM atlas_reminders
  WHERE reminder_id = p_reminder_id;

  IF v_type = 'once' THEN
    -- Одноразове — завершити
    UPDATE atlas_reminders SET
      status = 'completed',
      last_triggered_at = NOW(),
      trigger_count = trigger_count + 1,
      next_trigger_at = NULL,
      updated_at = NOW()
    WHERE reminder_id = p_reminder_id;

  ELSIF v_type IN ('recurring', 'conditional') THEN
    -- Обчислити наступний trigger
    v_next := NULL;

    IF v_schedule IS NOT NULL THEN
      IF v_schedule->>'type' = 'daily' THEN
        v_next := (CURRENT_DATE + 1)::TIMESTAMPTZ
                  + (COALESCE(v_schedule->>'time', '09:00'))::TIME;

      ELSIF v_schedule->>'type' = 'weekly' THEN
        -- Наступний день з масиву days
        v_next := NOW() + INTERVAL '1 day';
        -- Спрощено: +7 днів від зараз (точніший розрахунок — на клієнті)
        v_next := NOW() + INTERVAL '7 days';

      ELSIF v_schedule->>'type' = 'monthly' THEN
        v_next := (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::DATE
                  + (COALESCE((v_schedule->>'day')::INT - 1, 0)) * INTERVAL '1 day'
                  + (COALESCE(v_schedule->>'time', '09:00'))::TIME;

      ELSIF v_schedule->>'type' = 'interval' THEN
        v_next := NOW() + (COALESCE((v_schedule->>'hours')::INT, 1)) * INTERVAL '1 hour';
      END IF;
    ELSE
      -- Якщо немає schedule для conditional — перевіряти щогодини
      v_next := NOW() + INTERVAL '1 hour';
    END IF;

    UPDATE atlas_reminders SET
      last_triggered_at = NOW(),
      trigger_count = trigger_count + 1,
      next_trigger_at = v_next,
      updated_at = NOW()
    WHERE reminder_id = p_reminder_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION trigger_reminder(BIGINT) TO authenticated;

-- ────────────────────────────────────────
-- 8. Тригер: auto-update updated_at
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_reminder_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reminder_updated ON atlas_reminders;
CREATE TRIGGER trg_reminder_updated
  BEFORE UPDATE ON atlas_reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_reminder_timestamp();

-- ────────────────────────────────────────
-- 9. Додати atlas_reminders до білого списку AI
--    (це потрібно оновити в коді aiDatabaseQuery.ts)
-- ────────────────────────────────────────
-- НОТАТКА: В файлі aiDatabaseQuery.ts додати:
--   'atlas_reminders', 'atlas_reminder_logs', 'atlas_telegram_users'
-- до масиву дозволених таблиць

-- ────────────────────────────────────────
-- ГОТОВО ✅
-- ────────────────────────────────────────

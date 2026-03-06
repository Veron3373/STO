-- ═══════════════════════════════════════════════════════════════
-- 008: Додати 'callback' в CHECK constraint delivery_status
-- Потрібно бо telegram-bot записує callback-відповіді
-- ═══════════════════════════════════════════════════════════════

-- Видалити старий constraint
ALTER TABLE atlas_reminder_logs
  DROP CONSTRAINT IF EXISTS atlas_reminder_logs_delivery_status_check;

-- Створити новий з 'callback'
ALTER TABLE atlas_reminder_logs
  ADD CONSTRAINT atlas_reminder_logs_delivery_status_check
  CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed', 'dismissed', 'callback'));

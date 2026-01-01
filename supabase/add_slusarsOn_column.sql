-- Додавання колонки slusarsOn в таблицю acts
-- Позначка що Слюсар завершив всі роботи (не закриває акт)

ALTER TABLE acts
ADD COLUMN IF NOT EXISTS "slusarsOn" BOOLEAN DEFAULT false;

COMMENT ON COLUMN acts."slusarsOn" IS 'Позначка що Слюсар завершив всі роботи (не закриває акт)';

CREATE INDEX IF NOT EXISTS idx_acts_slusarsOn ON acts("slusarsOn");

-- Перевірка створеної колонки
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'acts' AND column_name = 'slusarsOn';

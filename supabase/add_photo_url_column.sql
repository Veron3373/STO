-- Міграція: Додаємо окрему колонку photo_url для надійного збереження посилання на Google Drive
-- Це виправляє проблему race condition при оновленні JSON поля data

-- 1. Додаємо нову колонку
ALTER TABLE acts ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Мігруємо існуючі дані з JSON в нову колонку
UPDATE acts 
SET photo_url = (data->>'Фото')::jsonb->>0
WHERE data->>'Фото' IS NOT NULL 
  AND (data->>'Фото')::jsonb->>0 IS NOT NULL
  AND photo_url IS NULL;

-- Альтернативний варіант якщо Фото - це просто текст, а не масив:
-- UPDATE acts 
-- SET photo_url = data->>'Фото'
-- WHERE data->>'Фото' IS NOT NULL 
--   AND photo_url IS NULL;

-- 3. Перевірка результату
SELECT act_id, photo_url, data->>'Фото' as old_photo 
FROM acts 
WHERE photo_url IS NOT NULL 
LIMIT 10;

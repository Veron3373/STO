-- Міграція: Додаємо окрему колонку photo_url для надійного збереження посилання на Google Drive
-- Це виправляє проблему race condition при оновленні JSON поля data

-- 1. Додаємо нову колонку (якщо ще не існує)
ALTER TABLE acts ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Мігруємо існуючі дані з JSON в нову колонку photo_url
-- Беремо перший елемент масиву Фото: data->'Фото'->>0
UPDATE acts 
SET photo_url = data->'Фото'->>0
WHERE data->'Фото' IS NOT NULL 
  AND jsonb_array_length(data->'Фото') > 0
  AND data->'Фото'->>0 IS NOT NULL
  AND (photo_url IS NULL OR photo_url = '');

-- 3. Перевірка: скільки записів мігровано
SELECT 
  COUNT(*) FILTER (WHERE photo_url IS NOT NULL) as migrated_count,
  COUNT(*) FILTER (WHERE data->'Фото' IS NOT NULL AND jsonb_array_length(data->'Фото') > 0) as had_photo_in_json
FROM acts;

-- 4. Видаляємо ключ 'Фото' з JSON поля data (ТІЛЬКИ після успішної міграції!)
-- ВАЖЛИВО: Спочатку переконайтесь що крок 2 виконався успішно!
UPDATE acts 
SET data = data - 'Фото'
WHERE data ? 'Фото'
  AND photo_url IS NOT NULL;

-- 5. Фінальна перевірка
SELECT 
  act_id, 
  photo_url,
  data->'Фото' as old_photo_field_should_be_null
FROM acts 
WHERE photo_url IS NOT NULL 
LIMIT 10;

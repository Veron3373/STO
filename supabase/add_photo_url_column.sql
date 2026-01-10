-- Міграція: Додаємо окрему колонку photo_url для надійного збереження посилання на Google Drive
-- Це виправляє проблему race condition при оновленні JSON поля data

-- =====================================================
-- КРОК 1: Додаємо нову колонку (якщо ще не існує)
-- =====================================================
ALTER TABLE acts ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- =====================================================
-- КРОК 2: Мігруємо існуючі дані з JSON в нову колонку photo_url
-- Беремо перший елемент масиву Фото: data->'Фото'->>0
-- =====================================================
UPDATE acts 
SET photo_url = data->'Фото'->>0
WHERE data->'Фото' IS NOT NULL 
  AND jsonb_typeof(data->'Фото') = 'array'
  AND jsonb_array_length(data->'Фото') > 0
  AND data->'Фото'->>0 IS NOT NULL
  AND data->'Фото'->>0 != ''
  AND (photo_url IS NULL OR photo_url = '');

-- =====================================================
-- КРОК 3: Перевірка - скільки записів мігровано
-- =====================================================
SELECT 
  COUNT(*) FILTER (WHERE photo_url IS NOT NULL AND photo_url != '') as migrated_count,
  COUNT(*) FILTER (WHERE data ? 'Фото') as had_photo_key,
  COUNT(*) as total_acts
FROM acts;

-- =====================================================
-- КРОК 4: Видаляємо ключ 'Фото' з JSON поля data (ТІЛЬКИ після успішної міграції!)
-- ВАЖЛИВО: Спочатку переконайтесь що крок 2 виконався успішно!
-- =====================================================
UPDATE acts 
SET data = data - 'Фото'
WHERE data ? 'Фото';

-- =====================================================
-- КРОК 5: Фінальна перевірка
-- =====================================================
SELECT 
  act_id, 
  photo_url,
  data ? 'Фото' as still_has_photo_key
FROM acts 
WHERE photo_url IS NOT NULL AND photo_url != ''
LIMIT 10;

-- Перевірка що ключ Фото видалено з усіх записів
SELECT COUNT(*) as records_with_photo_key FROM acts WHERE data ? 'Фото';

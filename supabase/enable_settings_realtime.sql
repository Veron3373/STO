-- ============================================================================
-- НАЛАШТУВАННЯ REAL-TIME ПІДПИСКИ НА ЗМІНИ В ТАБЛИЦІ SETTINGS
-- ============================================================================
-- Призначення: Дозволити real-time оновлення налаштувань для всіх користувачів
--              без необхідності перезавантаження сторінки
-- ============================================================================

-- 1️⃣ Увімкнути Row Level Security для таблиці settings (якщо ще не увімкнено)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 2️⃣ Створити політику для читання settings всіма автентифікованими користувачами
-- Дозволяє всім авторизованим користувачам читати налаштування
DROP POLICY IF EXISTS "Дозволити читання settings всім автентифікованим" ON public.settings;

CREATE POLICY "Дозволити читання settings всім автентифікованим"
ON public.settings
FOR SELECT
TO authenticated
USING (true);

-- 3️⃣ Створити політику для оновлення settings тільки адміністраторами
-- (Опціонально - якщо потрібно обмежити зміни тільки адміністраторами)
DROP POLICY IF EXISTS "Дозволити зміну settings тільки адміністраторам" ON public.settings;

CREATE POLICY "Дозволити зміну settings тільки адміністраторам"
ON public.settings
FOR UPDATE
TO authenticated
USING (
  -- Перевірка що користувач має роль адміністратора
  -- Тут потрібно адаптувати умову під вашу структуру users
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_id = auth.uid()
    AND users.role = 'Адміністратор'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_id = auth.uid()
    AND users.role = 'Адміністратор'
  )
);

-- 4️⃣ Увімкнути Realtime для таблиці settings
-- Дозволяє підписуватись на зміни в таблиці через Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;

-- 5️⃣ Створити функцію для логування змін в settings (опціонально, для аудиту)
CREATE OR REPLACE FUNCTION public.log_settings_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Можна додати логування в окрему таблицю для аудиту
  RAISE NOTICE 'Settings changed: setting_id=%, column changed by user=%', 
    NEW.setting_id, 
    auth.uid();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6️⃣ Створити тригер для логування змін (опціонально)
DROP TRIGGER IF EXISTS settings_change_log ON public.settings;

CREATE TRIGGER settings_change_log
  AFTER UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_settings_changes();

-- ============================================================================
-- ПЕРЕВІРКА НАЛАШТУВАНЬ
-- ============================================================================

-- Перевірити чи увімкнено RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'settings';

-- Перевірити політики
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'settings';

-- Перевірити чи таблиця включена в публікацію
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'settings';

-- ============================================================================
-- ПРИМІТКИ
-- ============================================================================
-- 
-- 1. Після виконання цього скрипту, клієнтський код зможе підписатися на зміни:
--    ```typescript
--    const channel = supabase
--      .channel('settings-changes')
--      .on('postgres_changes', 
--        { event: '*', schema: 'public', table: 'settings' },
--        (payload) => console.log('Change received!', payload)
--      )
--      .subscribe();
--    ```
--
-- 2. RLS політики забезпечують безпеку:
--    - Читати можуть всі автентифіковані користувачі
--    - Змінювати можуть тільки адміністратори
--
-- 3. Функція log_settings_changes можна розширити для збереження історії змін
--
-- ============================================================================

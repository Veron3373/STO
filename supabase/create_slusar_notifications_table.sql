-- ============================================================================
-- ТАБЛИЦЯ ДЛЯ PUSH-ПОВІДОМЛЕНЬ ПРО ЗАВЕРШЕННЯ РОБОТИ СЛЮСАРЕМ
-- ============================================================================
-- Створюється аналогічно до act_changes_notifications
-- Призначення: Повідомляти Адміністраторів та конкретного Приймальника,
--              коли Слюсар відмічає роботу як завершену (slusarsOn = true)
-- ============================================================================

-- 1️⃣ Створення таблиці
CREATE TABLE IF NOT EXISTS public.slusar_complete_notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    
    -- Інформація про акт
    act_id INTEGER NOT NULL,
    act_number TEXT NOT NULL,
    
    -- Хто завершив роботу
    completed_by_surname TEXT NOT NULL,
    completed_by_name TEXT,  -- повне ПІБ (опціонально)
    
    -- Для кого це повідомлення (фільтр)
    pruimalnyk TEXT,  -- ПІБ приймальника з таблиці acts
    
    -- Статус повідомлення
    viewed BOOLEAN DEFAULT false,  -- чи переглянуте
    delit BOOLEAN DEFAULT false,   -- чи видалене (приховане)
    
    -- Метадані
    data TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Індекси для швидкого пошуку
    CONSTRAINT fk_act FOREIGN KEY (act_id) REFERENCES acts(id) ON DELETE CASCADE
);

-- 2️⃣ Створення індексів для оптимізації
CREATE INDEX IF NOT EXISTS idx_slusar_notifications_act_id 
    ON public.slusar_complete_notifications(act_id);

CREATE INDEX IF NOT EXISTS idx_slusar_notifications_pruimalnyk 
    ON public.slusar_complete_notifications(pruimalnyk) 
    WHERE delit = false;

CREATE INDEX IF NOT EXISTS idx_slusar_notifications_viewed 
    ON public.slusar_complete_notifications(viewed) 
    WHERE delit = false;

CREATE INDEX IF NOT EXISTS idx_slusar_notifications_delit 
    ON public.slusar_complete_notifications(delit);

-- 3️⃣ Увімкнення Row Level Security (RLS)
ALTER TABLE public.slusar_complete_notifications ENABLE ROW LEVEL SECURITY;

-- 4️⃣ Політики доступу
-- Адміністратори бачать всі повідомлення
CREATE POLICY "Адміністратори можуть читати всі повідомлення"
    ON public.slusar_complete_notifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.name = (SELECT auth.jwt() ->> 'name')
            AND users.setting_id = 1  -- Адміністратор
        )
    );

-- Приймальники бачать тільки свої повідомлення
CREATE POLICY "Приймальники можуть читати свої повідомлення"
    ON public.slusar_complete_notifications
    FOR SELECT
    USING (
        pruimalnyk = (SELECT auth.jwt() ->> 'name')
        AND EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.name = (SELECT auth.jwt() ->> 'name')
            AND users.setting_id = 2  -- Приймальник
        )
    );

-- Слюсарі можуть створювати повідомлення
CREATE POLICY "Слюсарі можуть створювати повідомлення"
    ON public.slusar_complete_notifications
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.name = (SELECT auth.jwt() ->> 'name')
            AND users.setting_id = 3  -- Слюсар
        )
    );

-- Адміністратори можуть оновлювати повідомлення (помічати як переглянуте/видалене)
CREATE POLICY "Адміністратори можуть оновлювати повідомлення"
    ON public.slusar_complete_notifications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.name = (SELECT auth.jwt() ->> 'name')
            AND users.setting_id = 1  -- Адміністратор
        )
    );

-- Приймальники можуть оновлювати свої повідомлення
CREATE POLICY "Приймальники можуть оновлювати свої повідомлення"
    ON public.slusar_complete_notifications
    FOR UPDATE
    USING (
        pruimalnyk = (SELECT auth.jwt() ->> 'name')
        AND EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.name = (SELECT auth.jwt() ->> 'name')
            AND users.setting_id = 2  -- Приймальник
        )
    );

-- 5️⃣ Коментарі
COMMENT ON TABLE public.slusar_complete_notifications IS 
'Таблиця push-повідомлень про завершення робіт Слюсарем. Видима Адміністраторам та конкретному Приймальнику.';

COMMENT ON COLUMN public.slusar_complete_notifications.notification_id IS 
'Унікальний ID повідомлення (автоінкремент)';

COMMENT ON COLUMN public.slusar_complete_notifications.act_id IS 
'ID акту, в якому Слюсар завершив роботу';

COMMENT ON COLUMN public.slusar_complete_notifications.completed_by_surname IS 
'Прізвище Слюсаря, який завершив роботу';

COMMENT ON COLUMN public.slusar_complete_notifications.pruimalnyk IS 
'ПІБ Приймальника, для якого призначене повідомлення (з acts.pruimalnyk)';

COMMENT ON COLUMN public.slusar_complete_notifications.viewed IS 
'Чи переглянуте повідомлення користувачем';

COMMENT ON COLUMN public.slusar_complete_notifications.delit IS 
'Чи приховане повідомлення (м''яке видалення)';

-- ============================================================================
-- ГОТОВО! Виконайте цей скрипт в SQL Editor Supabase Dashboard
-- ============================================================================

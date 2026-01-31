-- Додаємо стовпець act_on_off для зберігання ПІБ користувача, який відкрив акт
-- Це дозволяє блокувати акт від одночасного редагування кількома користувачами

-- Перевіряємо чи стовпець вже існує перед додаванням
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'acts' 
        AND column_name = 'act_on_off'
    ) THEN
        ALTER TABLE acts ADD COLUMN act_on_off TEXT;
        COMMENT ON COLUMN acts.act_on_off IS 'ПІБ користувача, який відкрив акт для редагування';
    END IF;
END $$;

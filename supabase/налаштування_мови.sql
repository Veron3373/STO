-- Додавання налаштування мови інтерфейсу
-- setting_id = 6: Мова інтерфейсу (uk - українська, en - англійська)
-- Типове значення: "uk" (українська)

INSERT INTO settings (setting_id, data, description)
VALUES (6, 'uk', 'Мова інтерфейсу: uk (українська) або en (англійська)')
ON CONFLICT (setting_id) 
DO UPDATE SET 
  data = 'uk',
  description = 'Мова інтерфейсу: uk (українська) або en (англійська)';

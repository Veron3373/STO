// ПРИКЛАД: Як додати нову кнопку з автоматичним оновленням

/**
 * Приклад додавання нової кнопки "Архів" для Приймальника
 * яка буде автоматично показуватись/приховуватись при зміні налаштувань
 */

// ========== КРОК 1: Додати налаштування в БД ==========

// В Supabase SQL Editor виконати:
/*
INSERT INTO public.settings (setting_id, data, "Приймальник", "Слюсар", "Запчастист", "Складовщик")
VALUES (22, false, false, false, false, false);
*/

// ========== КРОК 2: Оновити мапінг в settings_subscription.ts ==========

/*
const SETTING_COLUMN_MAP: Record<number, string> = {
  // ... існуючі
  22: "Приймальник",  // Нове налаштування для кнопки Архів
};
*/

// ========== КРОК 3: Додати функцію оновлення UI в settings_subscription.ts ==========

/*
function updateArchiveButtonVisibility(): void {
  // Читаємо стан з globalCache або напряму з БД
  // Для прикладу припустимо що додали в globalCache
  const showArchive = globalCache.settings.showArchive;
  
  // Знаходимо кнопку
  const archiveButton = document.querySelector('[data-action="open-archive"]');
  
  if (archiveButton) {
    (archiveButton as HTMLElement).style.display = showArchive ? '' : 'none';
  }
}

// Додати виклик в updateUIBasedOnSettings():
function updateUIBasedOnSettings(): void {
  updatePibMagazinVisibility();
  updateCatalogVisibility();
  updateZarplataVisibility();
  updateSMSButtonVisibility();
  updateActModalButtons();
  updateArchiveButtonVisibility(); // <- НОВИЙ ВИКЛИК
  
  console.log("🔄 UI оновлено відповідно до нових налаштувань");
}
*/

// ========== КРОК 4: Оновити завантаження settings в globalCache.ts ==========

/*
// В функції loadGlobalData() додати:
const settingArchive = settingsRows?.find((s: any) => s.setting_id === 22);

globalCache.settings = {
  showPibMagazin: !!settingShop?.data,
  showCatalog: !!settingCatalog?.data,
  showZarplata: !!settingZarplata?.data,
  showSMS: !!settingSMS?.data,
  showArchive: !!settingArchive?.data, // <- ДОДАТИ
  preferredLanguage: "uk",
  saveMargins: true,
};
*/

// ========== КРОК 5: Оновити інтерфейс GlobalDataCache в globalCache.ts ==========

/*
export interface GlobalDataCache {
  // ... існуючі поля
  settings: {
    showPibMagazin: boolean;
    showCatalog: boolean;
    showZarplata: boolean;
    showSMS: boolean;
    showArchive: boolean; // <- ДОДАТИ
    preferredLanguage: "uk" | "en";
    saveMargins: boolean;
  };
  // ... інші поля
}
*/

// ========== КРОК 6: Додати toggle в налаштування для Адміністратора ==========

/*
// В nalachtuvannay.ts додати в SETTINGS:
const SETTINGS = {
  1: { id: "toggle-shop", label: "ПІБ _ Магазин", class: "_shop" },
  2: { id: "toggle-receiver", label: "Каталог", class: "_receiver" },
  3: { id: "toggle-zarplata", label: "Зарплата", class: "_zarplata" },
  4: { id: "percentage-value", label: "Націнка на запчастина", class: "_percentage" },
  5: { id: "toggle-sms", label: "SMS", class: "_sms" },
  6: { id: "toggle-archive", label: "Архів", class: "_archive" }, // <- ДОДАТИ
};

// І в функції saveSettings() додати збереження:
const checkbox6 = modal.querySelector("#toggle-archive") as HTMLInputElement;
const { error: error6 } = await supabase
  .from("settings")
  .update({ [column]: checkbox6?.checked ?? false })
  .eq("setting_id", 22);
if (error6) throw error6;
*/

// ========== КРОК 7: Додати toggle для ролі Приймальник ==========

/*
// В nalachtuvannay.ts в ROLE_SETTINGS додати:
const ROLE_SETTINGS = {
  Приймальник: [
    { id: 1, label: "Налаштування" },
    { divider: true },
    // ... існуючі
    { id: 22, label: "Архів 📁" }, // <- ДОДАТИ
  ],
  // ... інші ролі
};
*/

// ========== ГОТОВО! ==========

/*
Тепер:

1. Адміністратор може включати/вимикати кнопку Архів для Приймальника
2. При зміні налаштування Приймальник миттєво побачить/не побачить кнопку
3. Без перезавантаження сторінки!

Тестування:

Вкладка 1 (Адміністратор):
1. Налаштування
2. Вибрати роль "Приймальник"
3. Включити "Архів 📁"
4. Натиснути ОК

Вкладка 2 (Приймальник):
- Побачить повідомлення "Налаштування оновлено адміністратором"
- Кнопка Архів з'явиться автоматично
*/

// ========== ДОДАТКОВІ МОЖЛИВОСТІ ==========

/*
1. Додати анімацію появи/зникнення:

function updateArchiveButtonVisibility(): void {
  const showArchive = globalCache.settings.showArchive;
  const archiveButton = document.querySelector('[data-action="open-archive"]');
  
  if (archiveButton) {
    if (showArchive) {
      archiveButton.classList.remove('hidden');
      archiveButton.classList.add('fade-in');
    } else {
      archiveButton.classList.add('fade-out');
      setTimeout(() => {
        archiveButton.classList.add('hidden');
        archiveButton.classList.remove('fade-out');
      }, 300);
    }
  }
}

2. Додати логування для аудиту:

async function handleSettingsChange(payload: any): Promise<void> {
  // ... існуючий код
  
  // Логування в окрему таблицю
  await supabase.from('settings_audit_log').insert({
    user_id: auth.uid(),
    setting_id: settingId,
    changed_column: changedColumn,
    old_value: oldRecord[changedColumn],
    new_value: newRecord[changedColumn],
    timestamp: new Date().toISOString()
  });
}

3. Додати підтвердження для критичних змін:

async function handleSettingsChange(payload: any): Promise<void> {
  // ... існуючий код
  
  // Якщо це критична зміна - показати модальне вікно
  if (settingId === 4 && !newRecord['Приймальник']) {
    const confirmed = await showConfirmDialog(
      'Адміністратор приховав доступ до Бухгалтерії. Продовжити роботу?'
    );
    
    if (!confirmed) {
      // Перезавантажити сторінку або вийти
      window.location.reload();
    }
  }
}
*/

export {};

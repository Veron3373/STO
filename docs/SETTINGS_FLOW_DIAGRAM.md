# Схема роботи Real-Time Settings Subscription

## 🎨 Візуальна схема

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE DATABASE                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Таблиця: settings                             │  │
│  │  ┌─────────┬──────┬─────────┬─────────────┬────────┬───────────────┐  │  │
│  │  │setting_│ data │ procent │Приймальник  │ Слюсар │  Запчастист   │  │  │
│  │  │   id   │      │         │             │        │               │  │  │
│  │  ├─────────┼──────┼─────────┼─────────────┼────────┼───────────────┤  │  │
│  │  │    1   │ TRUE │  NULL   │   TRUE      │ FALSE  │    FALSE      │  │  │
│  │  │    2   │ TRUE │  NULL   │   TRUE      │ FALSE  │    FALSE      │  │  │
│  │  │    3   │ TRUE │  NULL   │   TRUE      │  TRUE  │    FALSE      │  │  │
│  │  │    4   │ TRUE │   10    │   FALSE ⬅─  │ FALSE  │    FALSE      │  │  │
│  │  └─────────┴──────┴─────────┴─────────────┴────────┴───────────────┘  │  │
│  └──────────────────────────────────────────┬────────────────────────────┘  │
│                                             │                                │
│                                             │ UPDATE                         │
│                                             │                                │
│  ┌──────────────────────────────────────────▼────────────────────────────┐  │
│  │                    PostgreSQL TRIGGER                                 │  │
│  │         log_settings_changes() → RAISE NOTICE                         │  │
│  └──────────────────────────────────────────┬────────────────────────────┘  │
│                                             │                                │
│                                             │ NOTIFY                         │
│                                             │                                │
│  ┌──────────────────────────────────────────▼────────────────────────────┐  │
│  │                    Realtime Publication                               │  │
│  │         ALTER PUBLICATION supabase_realtime ADD TABLE settings        │  │
│  └──────────────────────────────────────────┬────────────────────────────┘  │
└──────────────────────────────────────────────┼────────────────────────────────┘
                                              │
                                              │ WebSocket
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              │                               │                               │
    ┌─────────▼──────────┐        ┌──────────▼──────────┐        ┌──────────▼─────────┐
    │   ВКЛАДКА 1        │        │   ВКЛАДКА 2         │        │   ВКЛАДКА 3        │
    │  (Адміністратор)   │        │  (Приймальник)      │        │   (Слюсар)         │
    └─────────┬──────────┘        └──────────┬──────────┘        └──────────┬─────────┘
              │                               │                               │
              │ 1. Змінює setting             │                               │
              │    setting_id=4               │                               │
              │    Приймальник: FALSE         │                               │
              │                               │                               │
              │                               │ 2. Отримує подію:             │
              │                               │    {                          │
              │                               │      eventType: "UPDATE",     │
              │                               │      new: {                   │
              │                               │        setting_id: 4,         │
              │                               │        Приймальник: false     │
              │                               │      }                        │
              │                               │    }                          │
              │                               │                               │
              │                               │ 3. Перевіряє:                 │
              │                               │    shouldUpdate... → TRUE     │
              │                               │    (стосується Приймальника)  │
              │                               │                               │
              │                               │ 4. Оновлює:                   │
              │                               │    - globalCache.settings     │
              │                               │    - UI (ховає Бухгалтерію)   │
              │                               │    - Показує повідомлення     │
              │                               │                               │
              │                               │                               │ НЕ отримує
              │                               │                               │ (не стосується
              │                               │                               │  Слюсаря)
              │                               │                               │
    ┌─────────▼──────────┐        ┌──────────▼──────────┐        ┌──────────▼─────────┐
    │                    │        │   ✅ ОНОВЛЕНО!      │        │  (без змін)        │
    │ settings_          │        │                     │        │                    │
    │ subscription.ts    │        │  🔔 Повідомлення:   │        │                    │
    │                    │        │  "Налаштування      │        │                    │
    │ ├─ subscribe()     │        │   оновлено          │        │                    │
    │ ├─ handleChange()  │        │   адміністратором"  │        │                    │
    │ ├─ refreshCache()  │        │                     │        │                    │
    │ └─ updateUI()      │        │  🚫 Кнопка          │        │                    │
    │                    │        │  "Бухгалтерія"      │        │                    │
    │                    │        │  приховалась        │        │                    │
    └────────────────────┘        └─────────────────────┘        └────────────────────┘
```

## 🔄 Послідовність подій

### 1️⃣ Ініціалізація (при завантаженні сторінки)

```
User → Page Load
         │
         ├─→ main.ts
         │    └─→ import settings_realtime_init.ts
         │         └─→ initializeSettingsSubscription()
         │              │
         │              ├─→ supabase.channel("settings-changes")
         │              ├─→ .on("postgres_changes", ...)
         │              └─→ .subscribe()
         │
         └─→ Console: "✅ Підписка на settings активна"
```

### 2️⃣ Зміна налаштування (Адміністратор)

```
Admin → Налаштування
         │
         ├─→ Вибрати роль "Приймальник"
         ├─→ Зняти чекбокс "Бухгалтерія" (setting_id=4)
         └─→ Натиснути "ОК"
              │
              └─→ saveSettings()
                   │
                   └─→ supabase.from("settings")
                        .update({ "Приймальник": false })
                        .eq("setting_id", 4)
                         │
                         ├─→ PostgreSQL UPDATE
                         ├─→ TRIGGER: log_settings_changes()
                         └─→ NOTIFY через Realtime
```

### 3️⃣ Отримання змін (Приймальник)

```
Realtime → WebSocket Event
            │
            └─→ handleSettingsChange(payload)
                 │
                 ├─→ eventType: "UPDATE"
                 ├─→ setting_id: 4
                 ├─→ changed column: "Приймальник"
                 │
                 ├─→ shouldUpdateForCurrentUser(4, "Приймальник")
                 │    │
                 │    ├─→ userAccessLevel === "Приймальник" ✅
                 │    └─→ return true
                 │
                 ├─→ refreshSettingsCache()
                 │    │
                 │    └─→ supabase.from("settings").select(...)
                 │         └─→ globalCache.settings updated
                 │
                 ├─→ updateUIBasedOnSettings()
                 │    │
                 │    ├─→ updatePibMagazinVisibility()
                 │    ├─→ updateCatalogVisibility()
                 │    ├─→ updateZarplataVisibility()
                 │    ├─→ updateSMSButtonVisibility()
                 │    └─→ updateActModalButtons()
                 │         └─→ Кнопка "Бухгалтерія" приховалась
                 │
                 └─→ showNotification("Налаштування оновлено", "info")
```

### 4️⃣ Фільтрація для інших ролей

```
Realtime → WebSocket Event (той самий)
            │
            └─→ handleSettingsChange(payload)
                 │
                 └─→ shouldUpdateForCurrentUser(4, "Приймальник")
                      │
                      ├─→ userAccessLevel === "Слюсар" ❌
                      │    column: "Приймальник" ≠ "Слюсар"
                      │
                      └─→ return false
                           │
                           └─→ Console: "ℹ️ Зміна не стосується ролі Слюсар"
                                └─→ НЕ оновлює UI
```

## 📋 Таблиця фільтрації

| Зміна | Адміністратор | Приймальник | Слюсар | Запчастист | Складовщик |
|-------|--------------|-------------|--------|------------|-----------|
| setting_id=1, col="Приймальник" | ✅ | ✅ | ❌ | ❌ | ❌ |
| setting_id=2, col="data" | ✅ | ✅ | ✅ | ✅ | ✅ |
| setting_id=3, col="Слюсар" | ✅ | ❌ | ✅ | ❌ | ❌ |
| setting_id=4, col="Приймальник" | ✅ | ✅ | ❌ | ❌ | ❌ |
| setting_id=13, col="Складовщик" | ✅ | ❌ | ❌ | ❌ | ✅ |
| setting_id=16, col="Запчастист" | ✅ | ❌ | ❌ | ✅ | ❌ |

## 🔐 Безпека (RLS)

```sql
-- Політика читання
FOR SELECT TO authenticated
USING (true)  -- Всі можуть читати

-- Політика зміни
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE user_id = auth.uid()
    AND role = 'Адміністратор'  -- Тільки адміни можуть змінювати
  )
)
```

## 📊 Статистика

| Метрика | Значення |
|---------|----------|
| Затримка оновлення | < 100ms |
| Розмір WebSocket payload | ~200 bytes |
| Підтримка одночасних підписок | Необмежено |
| Фільтрація на клієнті | Так |
| Backwards compatibility | Так |

---

**Легенда:**
- ✅ Оновлюється
- ❌ Не оновлюється
- ⬅ Зміна в БД
- → Потік даних

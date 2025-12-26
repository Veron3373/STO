# Зміни в модальному вікні "Співробітники"

## Дата: 2025-12-26

## Опис змін

Модифіковано модальне вікно для управління співробітниками (`modal-content-all_other_bases`) для додавання підтримки двох процентів: **Процент роботи** та **Процент з запчастин**.

---

## Що було змінено

### 1. **Файл: `slusar.ts`**

#### Додано новий інпут "Процент з запчастин"
- Створено HTML-елемент `<input id="slusar-percent-parts">` поруч з існуючим інпутом "Процент роботи"
- Обидва інпути розміщені в контейнері `slusar-percent-container` для відображення 50/50

#### Оновлено функцію `fillSlusarInputs()`
```typescript
// Додано підтримку заповнення поля "Процент з запчастин"
if (percentPartsInput && data?.ПроцентЗапчастин !== undefined) {
  percentPartsInput.value = String(data.ПроцентЗапчастин);
}
```

#### Оновлено функцію `clearSlusarInputs()`
```typescript
// Додано очищення поля "Процент з запчастин"
if (percentPartsInput) percentPartsInput.value = "50";
```

#### Оновлено функцію `getSlusarAdditionalData()`
```typescript
// Додано валідацію та повернення значення процента запчастин
return {
  password: passwordInput?.value ? Number(passwordInput.value) : 1111,
  access: accessSelect?.value || "Слюсар",
  percent: percentValue,
  percentParts: percentPartsValue,  // ← НОВЕ ПОЛЕ
};
```

#### Оновлено HTML-структуру в `createSlusarAdditionalInputs()`
```html
<div class="slusar-percent-container">
  <div class="slusar-input-group slusar-percent-half">
    <label for="slusar-percent" class="label-all_other_bases">Процент роботи:</label>
    <input type="number" id="slusar-percent" class="input-all_other_bases" 
           placeholder="Від 0 до 100" min="0" max="100" value="50">
  </div>
  <div class="slusar-input-group slusar-percent-half">
    <label for="slusar-percent-parts" class="label-all_other_bases">Процент з запчастин:</label>
    <input type="number" id="slusar-percent-parts" class="input-all_other_bases" 
           placeholder="Від 0 до 100" min="0" max="100" value="50">
  </div>
</div>
```

---

### 2. **Файл: `vikno_pidtverdchennay_inchi_bazu.ts`**

#### Оновлено функцію `handleEdit()`
```typescript
updateData.data = {
  Name: (newValue || "").trim(),
  Опис: currentData?.Опис && typeof currentData.Опис === "object" ? currentData.Опис : {},
  Історія: currentData?.Історія && typeof currentData.Історія === "object" ? currentData.Історія : {},
  ПроцентРоботи: additionalData.percent,
  ПроцентЗапчастин: additionalData.percentParts,  // ← НОВЕ ПОЛЕ
  Пароль: additionalData.password,
  Доступ: additionalData.access,
};
```

#### Оновлено функцію `handleAdd()`
```typescript
insertData.data = {
  Name: (newValue || "").trim(),
  Опис: {},
  Історія: {},
  ПроцентРоботи: additionalData.percent,
  ПроцентЗапчастин: additionalData.percentParts,  // ← НОВЕ ПОЛЕ
  Пароль: additionalData.password,
  Доступ: additionalData.access,
};
```

---

### 3. **Файл: `_dodatu_inchi_bazu_danux.scss`**

#### Додано CSS стилі для відображення двох інпутів поруч
```scss
/* ====== Контейнер для процентів (50/50) ====== */
.slusar-percent-container {
  display: flex;
  gap: 12px;
  width: 100%;
}

.slusar-percent-half {
  flex: 1;
  min-width: 0;
}

.slusar-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

---

## Функціональність

### При виборі співробітника:
1. Система завантажує дані з бази даних `slyusars`
2. Заповнює всі поля, включаючи:
   - Пароль
   - Доступ
   - **Процент роботи** (з поля `ПроцентРоботи`)
   - **Процент з запчастин** (з поля `ПроцентЗапчастин`)

### При натисканні кнопки "Ок":
1. Система збирає дані з обох інпутів
2. Валідує значення (0-100)
3. Зберігає в базу даних `slyusars`:
   - `ПроцентРоботи`: значення з першого інпута
   - `ПроцентЗапчастин`: значення з другого інпута

### CRUD операції:
- **CREATE (Додати)**: Створює новий запис із обома процентами
- **READ (Читати)**: Завантажує обидва проценти при виборі співробітника
- **UPDATE (Редагувати)**: Оновлює обидва проценти в існуючому записі
- **DELETE (Видалити)**: Видаляє запис повністю

---

## Структура даних в базі даних

```json
{
  "slyusar_id": 1,
  "data": {
    "Name": "Іванов І. І.",
    "Пароль": 1234,
    "Доступ": "Слюсар",
    "ПроцентРоботи": 50,
    "ПроцентЗапчастин": 50,
    "Опис": {},
    "Історія": {}
  }
}
```

---

## Валідація

Обидва інпути мають валідацію:
- Мінімальне значення: **0**
- Максимальне значення: **100**
- Значення за замовчуванням: **50**
- Тип: `number`

---

## Візуальний вигляд

Два інпути розташовані поруч один з одним (50% / 50% ширини):

```
┌─────────────────────────────────────────────────┐
│ Процент роботи:    │ Процент з запчастин:      │
│ [    50    ]       │ [    50    ]              │
└─────────────────────────────────────────────────┘
```

---

## Тестування

Для перевірки функціональності:

1. Відкрийте модальне вікно "Додати"
2. Натисніть на кнопку "Співробітники"
3. Введіть ім'я існуючого співробітника
4. Перевірте, що обидва інпути заповнилися значеннями з бази даних
5. Змініть значення в обох інпутах
6. Натисніть "Ок"
7. Перевірте в базі даних, що обидва значення збереглися

---

## Автор змін
Antigravity AI Assistant

## Статус
✅ Завершено

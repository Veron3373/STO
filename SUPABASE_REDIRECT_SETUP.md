# 🔧 Налаштування Redirect URLs в Supabase

## ✅ Виправлення виконано в коді

Оновлено файл `src/ts/vxid/login.ts`:
- Додано функцію `getRedirectUrl()`, яка **автоматично визначає** поточний домен
- Тепер код сам розуміє, де він виконується (GitHub / Vercel / localhost)
- Додано параметри OAuth: `access_type: 'offline'` і `prompt: 'consent'`

## 📋 Налаштування Supabase Dashboard

### Крок 1: Відкрити налаштування
1. Перейдіть до вашого проекту в [Supabase Dashboard](https://app.supabase.com/)
2. Натисніть **Authentication** → **URL Configuration**

### Крок 2: Site URL
```
https://veron3373.github.io/STO/
```

### Крок 3: Redirect URLs (список всіх дозволених)
```
https://veron3373.github.io/STO/main.html
https://stobraclavec.vercel.app/main.html
http://localhost:5173/main.html
```

### Крок 4: Зберегти
Натисніть **"Save"** внизу сторінки

---

## 🔍 Налаштування Google Cloud Console

### Крок 1: Відкрити налаштування
1. Відкрийте [Google Cloud Console](https://console.cloud.google.com/)
2. Перейдіть до **APIs & Services** → **Credentials**
3. Знайдіть ваш OAuth 2.0 Client ID і натисніть на нього

---

### Крок 2: Authorized JavaScript origins
**Повинно бути саме це:**
```
http://localhost
http://localhost:5000
https://stobraclavec.vercel.app
https://veron3373.github.io
```

---

### Крок 3: Authorized redirect URIs
**Повинно бути саме це:**
```
https://veron3373.github.io/STO/main.html
https://stobraclavec.vercel.app/main.html
https://eksifjzzscqsufwcbsx.supabase.co/auth/v1/callback
```

---

### Крок 4: Authorized domains
**Повинно бути саме це:**
```
stobraclavec.vercel.app
veron3373.github.io
uhqusavtxfksnajggva.supabase.co
```

---

### Крок 5: Зберегти
Натисніть кнопку **"Save"** після всіх змін

---

## 🎯 Як це працює тепер

| Де відкрито сайт | Куди перенаправить після входу |
|------------------|--------------------------------|
| `https://veron3373.github.io/STO/` | `https://veron3373.github.io/STO/main.html` |
| `https://stobraclavec.vercel.app/` | `https://stobraclavec.vercel.app/main.html` |
| `http://localhost:5173/` | `http://localhost:5173/main.html` |

---

## 🚀 Після налаштування

1. Збережіть зміни в Supabase
2. Задеплойте проект:
   - Для GitHub: `deploy-STO-Veron.ps1`
   - Для Vercel: `deploy-vercel.ps1`
   - Для обох: `deploy-all.ps1`

3. Протестуйте вхід на обох платформах

---

## ⚙️ Вимкнення автоматичного деплою на Vercel

Щоб Vercel **НЕ білдив автоматично** при кожному push в GitHub:

### Спосіб 1: Через Vercel Dashboard (Рекомендовано)

1. Відкрийте [Vercel Dashboard](https://vercel.com/dashboard)
2. Виберіть проект **stobraclavec**
3. Перейдіть в **Settings** → **Git**
4. Знайдіть розділ **"Ignored Build Step"**
5. Увімкніть опцію і додайте команду:
   ```bash
   git diff HEAD^ HEAD --quiet
   ```
   Або просто виставте:
   ```bash
   exit 1
   ```
   Це зупинить автоматичні білди

### Спосіб 2: Вимкнути Production Branch auto-deploy

1. У **Settings** → **Git**
2. Розділ **"Production Branch"**
3. Зніміть галочку з **"Automatically deploy all changes from..."**

### Спосіб 3: Додати умову білду (Альтернатива)

1. У **Settings** → **Git** → **Ignored Build Step**
2. Додайте команду:
   ```bash
   git diff HEAD^ HEAD --quiet
   ```
3. Це зробить так, що Vercel не буде автоматично білдити при кожному пуші в GitHub

### Результат:
- ✅ GitHub Pages буде автоматично деплоїтись через скрипт `deploy-STO-Veron.ps1`
- ✅ Vercel деплоїться ТІЛЬКИ вручну через скрипт `deploy-vercel.ps1`

---

## 📝 Примітки

- Зміни в Supabase застосовуються миттєво
- Зміни в Google Cloud можуть зайняти кілька хвилин
- Якщо проблема залишається, очистіть кеш браузера та cookies

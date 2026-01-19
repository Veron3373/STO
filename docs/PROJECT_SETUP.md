# 📋 ІНСТРУКЦІЯ З НАЛАШТУВАННЯ НОВОГО ПРОЕКТУ

> **Щоб перенести цей проект на інший акаунт (Google, Supabase, Vercel), потрібно змінити лише 2 файли!**

---

## 🚀 ШВИДКИЙ СТАРТ

### Крок 1: Конфігураційний файл
Відкрий **[src/config/project.config.ts](src/config/project.config.ts)** і зміни:

```typescript
// 🏢 ІНФОРМАЦІЯ ПРО ПРОЕКТ
export const PROJECT_INFO = {
  name: "your-project-name",      // ← Назва для Vercel
  displayName: "Ваш Проект",      // ← Назва для UI
};

// 🌐 URL-АДРЕСИ ДЕПЛОЮ
export const DEPLOY_URLS = {
  vercel: "your-project.vercel.app",     // ← Ваш Vercel домен
  githubUsername: "your-username",        // ← Ваш GitHub username
  githubRepo: "your-repo",                // ← Назва репозиторію
};

// 👥 GIT АКАУНТИ (для deploy скриптів)
export const GIT_ACCOUNTS = [
  { name: "Your Name", email: "your@email.com", username: "YourUsername" },
];
```

### Крок 2: Environment Variables
Скопіюй **[.env.example](.env.example)** як `.env` та `.env.local`, заповни:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_KEY=your_supabase_anon_key
VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
```

### Крок 3: Build & Deploy
```bash
npm install
npm run build
npm run deploy  # або ./deploy-vercel.ps1
```

---

## 🔧 ДЕТАЛЬНЕ НАЛАШТУВАННЯ СЕРВІСІВ

### 🔐 Supabase

1. Створи проект на [supabase.com](https://supabase.com)
2. Скопіюй з **Settings → API**:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_KEY`

3. Налаштуй **Authentication → URL Configuration**:
   - **Site URL**: `https://your-project.vercel.app`
   - **Redirect URLs** (додай всі):
     ```
     http://localhost:5173/main.html
     http://localhost:5173/index.html
     https://your-project.vercel.app/main.html
     https://your-project.vercel.app/index.html
     https://your-username.github.io/your-repo/main.html
     https://your-username.github.io/your-repo/index.html
     ```

4. Увімкни **Google Provider** в **Authentication → Providers**

---

### 🔑 Google Cloud Console

1. Відкрий [console.cloud.google.com](https://console.cloud.google.com)
2. Створи проект або обери існуючий
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Тип: **Web application**

5. **Authorized JavaScript origins**:
   ```
   http://localhost:5173
   https://your-project.vercel.app
   https://your-username.github.io
   ```

6. **Authorized redirect URIs**:
   ```
   http://localhost:5173/main.html
   https://your-project.vercel.app/main.html
   https://your-username.github.io/your-repo/main.html
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```

7. Скопіюй **Client ID** → `VITE_GOOGLE_CLIENT_ID`

---

### ▲ Vercel

1. Імпортуй репозиторій на [vercel.com](https://vercel.com)
2. **Settings → Environment Variables**, додай:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_KEY`
   - `VITE_GOOGLE_CLIENT_ID`

3. Передеплой проект

---

## 📁 СТРУКТУРА КОНФІГУРАЦІЇ

```
📦 project/
├── 📄 .env.example          # Шаблон (комітиться)
├── 📄 .env                   # Локальні змінні (НЕ комітити!)
├── 📄 .env.local             # Локальні змінні (НЕ комітити!)
├── 📁 src/
│   └── 📁 config/
│       └── 📄 project.config.ts  # ← ГОЛОВНИЙ КОНФІГ
```

---

## 🛠️ ДОПОМІЖНІ ФУНКЦІЇ

В консолі браузера можна викликати:

```javascript
// Показати всю конфігурацію
import config from './src/config/project.config';
config.printFullConfig();

// Показати що вписати в Google Cloud Console
config.printGoogleCloudConfig();

// Показати що вписати в Supabase
config.printSupabaseConfig();
```

---

## ✅ ЧЕКЛІСТ ПЕРЕНОСУ

- [ ] Змінено `PROJECT_INFO` в `project.config.ts`
- [ ] Змінено `DEPLOY_URLS` в `project.config.ts`
- [ ] Створено `.env` з новими ключами
- [ ] Налаштовано Supabase проект
- [ ] Налаштовано Google OAuth
- [ ] Додано Environment Variables в Vercel
- [ ] Протестовано локально (`npm run dev`)
- [ ] Задеплоєно (`npm run build && vercel --prod`)

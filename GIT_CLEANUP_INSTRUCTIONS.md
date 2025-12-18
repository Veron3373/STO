# 🔒 ІНСТРУКЦІЯ: Очистка .env з Git історії

## ⚠️ ВАЖЛИВО!

Виконайте цю інструкцію **ТІЛЬКИ ЯКЩО** файл `.env` був закомічений в Git раніше.

## Крок 1: Перевірка чи .env в історії

Відкрийте термінал і виконайте:

```powershell
cd "d:\Alim\Проект\Бодя СТО\stoBraclavecGIT"
git log --all --oneline --full-history -- .env
```

**Якщо команда НЕ показує жодних комітів** - ВСЕ ДОБРЕ! `.env` не потрапив в Git.  
**Якщо показує коміти** - переходьте до Кроку 2.

---

## Крок 2: Видалення .env з Git історії (Windows)

### Спосіб 1: Використання git filter-repo (РЕКОМЕНДОВАНО)

```powershell
# Встановіть git-filter-repo (якщо не встановлено)
pip install git-filter-repo

# Створіть бекап (на всяк випадок)
cd ..
git clone stoBraclavecGIT stoBraclavecGIT-backup
cd stoBraclavecGIT

# Видаліть .env з історії
git filter-repo --path .env --invert-paths --force

# Додайте remote знову (filter-repo видаляє його)
git remote add origin https://github.com/Veron3373/STO.git

# Примусово запуште зміни
git push origin --force --all
```

### Спосіб 2: Використання BFG Repo-Cleaner

```powershell
# Завантажте BFG з https://rtyley.github.io/bfg-repo-cleaner/
# Покладіть bfg.jar в папку проекту

# Створіть бекап
cd ..
git clone stoBraclavecGIT stoBraclavecGIT-backup
cd stoBraclavecGIT

# Видаліть .env
java -jar bfg.jar --delete-files .env

# Очистіть історію
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Примусово запуште зміни
git push origin --force --all
```

### Спосіб 3: Використання git filter-branch (СТАРИЙ)

```powershell
# Створіть бекап
cd ..
git clone stoBraclavecGIT stoBraclavecGIT-backup
cd stoBraclavecGIT

# Видаліть .env з історії
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .env" --prune-empty --tag-name-filter cat -- --all

# Очистіть ref і logs
Remove-Item -Recurse -Force .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Примусово запуште зміни
git push origin --force --all
git push origin --force --tags
```

---

## Крок 3: Перевірка що .env видалено

```powershell
# Перевірте історію знову
git log --all --oneline --full-history -- .env

# Має бути порожньо!
```

---

## Крок 4: Перегенерація ключів Supabase

1. Відкрийте **Supabase Dashboard**: https://supabase.com/dashboard
2. Оберіть ваш проект
3. Перейдіть до **Settings** > **API**
4. Знайдіть розділ **Project API keys**
5. Натисніть **Reset** біля `anon` ключа
6. Скопіюйте НОВИЙ ключ
7. Замініть в `.env`:

```env
VITE_SUPABASE_URL=https://eksifjzzszcqsufwcbsx.supabase.co
VITE_SUPABASE_KEY=<ВАШ_НОВИЙ_КЛЮЧ_ТУТ>
```

8. Перевірте що `.env` в `.gitignore`:

```bash
# Відкрийте .gitignore і переконайтеся що є:
.env
.env.local
```

---

## Крок 5: Закомітьте зміни коду (БЕЗ .env)

```powershell
# Додайте ТІЛЬКИ зміни коду
git add constants.ts
git add src/ts/vxid/login.ts
git add src/ts/roboha/bukhhalteriya/bukhhalteriya_auth_guard.ts
git add src/ts/roboha/planyvannya/planyvannya_auth_guard.ts
git add bukhhalteriya.html
git add planyvannya.html
git add supabase/protect_whitelist.sql
git add .gitignore

# Закомітьте
git commit -m "🔒 Виправлено критичні вразливості безпеки

- Додано перевірку whitelist в коді (без запиту до БД)
- Додано захист auth_guard файлів
- Додано CSP та anti-cache headers в HTML
- Створено SQL скрипт для захисту таблиці whitelist"

# Запуште
git push origin main
```

---

## ✅ Результат

Після виконання всіх кроків:

- ✅ `.env` файл видалено з Git історії
- ✅ Старі ключі замінено на нові
- ✅ Код захищено від несанкціонованого доступу
- ✅ RLS політики працюють ідеально
- ✅ Система безпечна!

---

## 🆘 Якщо щось пішло не так

**Проблема 1:** "fatal: no such ref"

```powershell
# Перевірте назву гілки
git branch -a
# Використайте правильну назву замість 'main'
```

**Проблема 2:** "Updates were rejected"

```powershell
# Переконайтеся що маєте права на force push
git push origin --force main
```

**Проблема 3:** "python/java не знайдено"

```powershell
# Використайте filter-branch (Спосіб 3)
```

---

## 📞 Підтримка

Якщо виникли проблеми - напишіть в issues або консультуйтеся з документацією:

- Git filter-repo: https://github.com/newren/git-filter-repo
- BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/

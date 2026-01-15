@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Auto Deploy to GitHub ^& Vercel
echo ========================================
echo.

echo [1/5] Adding all changes...
git add -A

echo [2/5] Committing changes...
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set mydate=%%c-%%b-%%a
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set mytime=%%a:%%b
git commit -m "deploy: %mydate% %mytime% - auto sync"

echo [3/5] Pushing to main branch...
git push origin main
if errorlevel 1 (
    echo Push to main failed!
    pause
    exit /b 1
)

echo [4/5] Syncing gh-pages with main...
git checkout gh-pages
git reset --hard main
git push origin gh-pages --force
git checkout main

echo [5/5] Done!
echo.
echo ========================================
echo   Successfully deployed to:
echo   - GitHub Pages
echo   - Vercel (auto-deploy in 1-2 min)
echo ========================================
echo.
pause

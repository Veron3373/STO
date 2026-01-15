$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

Write-Host "========================================"
Write-Host "  Auto Deploy: Checking & Publishing"
Write-Host "========================================"
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

# 1. Build & Check
Write-Host "[1/4] Building & CSS/TS Checking..."
# Використовуємо npm run build, який у вас запускає "tsc -b && vite build"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ BUILD FAILED! Fixing required before deploy." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build Success!" -ForegroundColor Green

# 2. Git Commit & Push (Source Code -> Vercel)
Write-Host "[2/4] Saving source code to GitHub (main)..."
git add -A
git commit -m "deploy: $timestamp"
# Ігноруємо помилку, якщо немає змін для коміту
if ($LASTEXITCODE -ne 0) { Write-Host "No changes to commit (skipping commit step)" }

Write-Host "Pushing to main..."
git push origin main
if ($LASTEXITCODE -ne 0) { 
    Write-Host "❌ Push failed!" -ForegroundColor Red
    exit 1 
}

# 3. Deploy to GitHub Pages (Dist folder)
Write-Host "[3/4] Deploying to GitHub Pages..."
# Використовуємо ваш існуючий скрипт, який правильний для React
npm run deploy
if ($LASTEXITCODE -ne 0) { 
    Write-Host "❌ GitHub Pages deploy failed!" -ForegroundColor Red
    exit 1 
}

Write-Host "[4/4] DONE!"
Write-Host ""
Write-Host "========================================"
Write-Host "  ✅ ALL SYSTEMS GO"
Write-Host "  - GitHub Pages: https://veron3373.github.io/STO/"
Write-Host "  - Vercel: https://stobraclavec.vercel.app"
Write-Host "========================================"

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

Write-Host "========================================"
Write-Host "  🚀 Auto Deploy Setup for Vercel"
Write-Host "  Project: sto"
Write-Host "  Domain: stobraclavec.vercel.app"
Write-Host "========================================"
Write-Host ""

# Функция для проверки и установки зависимостей
function Ensure-ToolInstalled {
    param([string]$Command, [string]$InstallScript)
    
    $tool = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $tool) {
        Write-Host "Устанавливаем $Command..."
        Invoke-Expression $InstallScript
        if ($LASTEXITCODE -ne 0) { 
            Write-Host "❌ Не удалось установить $Command!"; 
            exit 1 
        }
    }
}

Write-Host "[1/6] Проверяем инструменты..."
Ensure-ToolInstalled "vercel" "npm install -g vercel"
Ensure-ToolInstalled "npm" "Write-Host 'Установите Node.js'; exit 1"

Write-Host "[2/6] Проверяем авторизацию Vercel..."
$vercelAuth = vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Требуется авторизация в Vercel..."
    vercel login
    if ($LASTEXITCODE -ne 0) { 
        Write-Host "❌ Авторизация не удалась!"; 
        exit 1 
    }
}

Write-Host "[3/6] Связываем проект с Vercel..."
# Проверяем, есть ли уже связь с проектом
if (-not (Test-Path ".vercel")) {
    Write-Host "Настраиваем связь с существующим проектом..."
    # Связываем с существующим проектом
    vercel link --yes --project sto
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Проект не найден, создаём новый..."
        vercel --yes --name sto
    }
} else {
    Write-Host "✅ Проект уже связан с Vercel"
}

Write-Host "[4/6] Устанавливаем зависимости..."
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Установка зависимостей не удалась!"; exit 1 }

Write-Host "[5/6] Собираем проект..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Сборка не удалась!"; exit 1 }

Write-Host "[6/6] Развёртываем на Vercel..."
vercel --prod --yes
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉========================================🎉"
    Write-Host "  ✅ УСПЕШНО РАЗВЁРНУТО!"
    Write-Host "  🌐 Основной сайт: https://stobraclavec.vercel.app"
    Write-Host "  📊 Deployment: https://sto-2bqhski7r-veron3373s-projects.vercel.app"
    Write-Host "  ⚡ Следующий деплой: npm run vercel"
    Write-Host "🎉========================================🎉"
    
    # Автоматически открываем сайт в браузере
    Write-Host "Открываем сайт в браузере..."
    Start-Process "https://stobraclavec.vercel.app"
} else {
    Write-Host "❌ Развёртывание не удалось!"
    exit 1
}

Write-Host ""
Write-Host "💡 Для быстрого развёртывания в будущем используйте:"
Write-Host "   npm run vercel"
Write-Host "   или"  
Write-Host "   powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"deploy-vercel.ps1`""
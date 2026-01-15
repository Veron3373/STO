$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

Write-Host "========================================"
Write-Host "  Auto Deploy to GitHub & Vercel"
Write-Host "========================================"
Write-Host ""

# Отримати поточну дату і час
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

Write-Host "[1/5] Adding all changes..."
git add -A

Write-Host "[2/5] Committing changes..."
git commit -m "deploy: $timestamp - auto sync all changes"
if ($LASTEXITCODE -ne 0) { 
    Write-Host "Nothing to commit or commit failed"
}

Write-Host "[3/5] Pushing to main branch..."
git push origin main
if ($LASTEXITCODE -ne 0) { 
    Write-Host "Push to main failed!"
    exit 1 
}

Write-Host "[4/5] Syncing gh-pages with main..."
git checkout gh-pages
git reset --hard main
git push origin gh-pages --force
git checkout main

if ($LASTEXITCODE -ne 0) { 
    Write-Host "gh-pages sync failed!"
    exit 1 
}

Write-Host "[5/5] Done!"
Write-Host ""
Write-Host "========================================"
Write-Host "  Successfully deployed to:"
Write-Host "  - GitHub Pages: https://veron3373.github.io/STO/"
Write-Host "  - Vercel: https://stobraclavec.vercel.app"
Write-Host "========================================"
Write-Host ""
Write-Host "Vercel will auto-deploy in 1-2 minutes..."
Write-Host "GitHub Pages will auto-deploy in 1-2 minutes..."

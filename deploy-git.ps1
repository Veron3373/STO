$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

Write-Host "========================================"
Write-Host "  Deploy to Vercel via GitHub"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/3] Adding files..."
git add -A

Write-Host "[2/3] Committing..."
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "deploy: $timestamp"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing to commit or commit failed"
}

Write-Host "[3/3] Pushing to GitHub..."
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Done! Vercel will auto-deploy"
    Write-Host "  https://stobraclavec.vercel.app"
    Write-Host "========================================"
} else {
    Write-Host "Push failed!"
    exit 1
}

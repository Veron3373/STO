$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

Write-Host "========================================"
Write-Host "  Deploy to Vercel - stobraclavec.vercel.app"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/3] Building..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!"; exit 1 }

Write-Host "[2/3] Deploying to Vercel..."
vercel --prod --yes

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Done! https://stobraclavec.vercel.app"
    Write-Host "========================================"
    Start-Process "https://stobraclavec.vercel.app"
} else {
    Write-Host "Deploy failed!"
    exit 1
}

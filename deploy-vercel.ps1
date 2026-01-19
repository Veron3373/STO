$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

# Set console encoding for Ukrainian
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================"
Write-Host "  Deploy to Vercel - stobraclavec.vercel.app"
Write-Host "========================================"
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════════
# VERCEL ACCOUNT SELECTION
# ═══════════════════════════════════════════════════════════════════════════════

$vercelAccounts = @(
    @{ Name = "Veron3373 (Main)"; Team = ""; Scope = "" },
    @{ Name = "Account 2"; Team = "team-name-2"; Scope = "--scope=team-name-2" },
    @{ Name = "Account 3"; Team = "team-name-3"; Scope = "--scope=team-name-3" },
    @{ Name = "Account 4"; Team = "team-name-4"; Scope = "--scope=team-name-4" },
    @{ Name = "Account 5"; Team = "team-name-5"; Scope = "--scope=team-name-5" }
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Select Vercel account for deploy:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

for ($i = 0; $i -lt $vercelAccounts.Count; $i++) {
    $acc = $vercelAccounts[$i]
    Write-Host "  [$($i + 1)] $($acc.Name)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  [0] Use current logged in account" -ForegroundColor Gray
Write-Host "  [L] Login to different Vercel account" -ForegroundColor Magenta
Write-Host ""

$choice = Read-Host "Your choice (0-5 or L)"

$vercelScope = ""

if ($choice -eq "L" -or $choice -eq "l") {
    Write-Host ""
    Write-Host "Opening Vercel login..." -ForegroundColor Cyan
    vercel logout
    vercel login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Login failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Logged in successfully!" -ForegroundColor Green
} elseif ($choice -match "^[1-5]$") {
    $selected = $vercelAccounts[[int]$choice - 1]
    Write-Host ""
    Write-Host "Selected: $($selected.Name)" -ForegroundColor Green
    $vercelScope = $selected.Scope
} elseif ($choice -eq "0") {
    Write-Host ""
    Write-Host "Using current Vercel account" -ForegroundColor Green
} else {
    Write-Host "Invalid choice! Cancelled." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================"

Write-Host "[1/3] Building for Vercel (base: /)..."
npm run build:vercel
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!"; exit 1 }

Write-Host "[2/3] Deploying to Vercel..."
if ($vercelScope -ne "") {
    vercel --prod --yes $vercelScope
} else {
    vercel --prod --yes
}

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

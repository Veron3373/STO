# Deploy to GitHub Pages AND Vercel
$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY TO GITHUB PAGES + VERCEL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Root: " (Get-Location) -ForegroundColor Yellow
Write-Host ""

# Git info
Write-Host "User: " -NoNewline -ForegroundColor Cyan
git config user.name
git config user.email

Write-Host "Remote: " -NoNewline -ForegroundColor Cyan
git remote get-url origin

git remote -v

Write-Host ""

# Git operations
Write-Host "Git status:" -ForegroundColor Cyan
git status

Write-Host ""
Write-Host "Adding all changes..." -ForegroundColor Cyan
git add .

Write-Host ""
Write-Host "Committing..." -ForegroundColor Cyan
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

Write-Host ""
Write-Host "Pushing to GitHub (main branch)..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILDING PROJECT" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

npm run build

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  DEPLOYING TO GITHUB PAGES" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# GitHub Pages deploy - simplified
git checkout gh-pages
git pull origin gh-pages --rebase
Copy-Item -Path "dist\*" -Destination "." -Recurse -Force
git add .
git commit -m "GitHub Pages deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin gh-pages --force
git checkout main

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  DEPLOYING TO VERCEL" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

vercel --prod --yes --force

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "GitHub Pages: https://Veron3373.github.io/STO/" -ForegroundColor Cyan
Write-Host "Vercel:       https://stobraclavec.vercel.app" -ForegroundColor Cyan
Write-Host ""

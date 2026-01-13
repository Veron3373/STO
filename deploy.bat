@echo off
echo ===========================================
echo   🚀 Быстрое развёртывание на Vercel
echo ===========================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-vercel.ps1"
pause
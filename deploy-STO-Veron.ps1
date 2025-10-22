param([string]$Token = "")

$ErrorActionPreference = "Stop"

function Info($m){ Write-Host $m }
function Fail($m){ Write-Host $m; exit 1 }

$Root = $PSScriptRoot
if (-not (Test-Path -LiteralPath $Root)) { Fail "Script folder not found." }
Set-Location -LiteralPath $Root

$OWNER      = "Veron3373"
$REPO       = "STO"
$USER_NAME  = "Veron3373"
$USER_EMAIL = "veron3373@gmail.com"
$REMOTE     = "https://github.com/$OWNER/$REPO.git"

Info "Root:  $Root"
Info "User:  $USER_NAME <$USER_EMAIL>"
Info "Remote: $REMOTE"

git -C $Root config user.name  "$USER_NAME"  | Out-Null
git -C $Root config user.email "$USER_EMAIL" | Out-Null

git -C $Root remote set-url origin $REMOTE
git -C $Root remote -v

try { Remove-Item -Recurse -Force "$Root\node_modules\.cache\gh-pages" -ErrorAction SilentlyContinue } catch {}
try { "protocol=https`nhost=github.com`n" | git credential-manager erase | Out-Null } catch {}

if ($Token -ne "") {
  $env:GH_TOKEN = $Token
  $env:GITHUB_TOKEN = $Token
  Info "Using PAT from -Token"
}

$dirty = git -C $Root status --porcelain
if ($dirty) {
  git -C $Root add -A
  git -C $Root commit -m ("deploy: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) | Out-Null
}

git -C $Root branch -M main | Out-Null
git -C $Root push -u origin main

npm --prefix $Root run build
npx --yes gh-pages -d "$Root\dist" --no-history --repo $REMOTE

Write-Host ("Done. URL: https://{0}.github.io/{1}/" -f $OWNER,$REPO)

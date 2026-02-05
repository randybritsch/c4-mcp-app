# Simplified deployment - clone from GitHub on NAS

$NAS_USER = "randybritsch"
$NAS_HOST = "192.168.1.237"
$GITHUB_REPO = "https://github.com/randybritsch/c4-mcp-app.git"
$NAS_DIR = "/volume1/web/c4-mcp-app"
$NAS_SECRETS_DIR = "/volume1/web/c4-mcp-app-secrets"
$NAS_BACKEND_ENV = "$NAS_SECRETS_DIR/backend.env"
$NODE_PATH = "/volume1/@appstore/Node.js_v22/usr/local/bin/node"
$NPM_CMD = "/volume1/@appstore/Node.js_v22/usr/local/lib/node_modules/npm/bin/npm-cli.js"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "C4 Voice Control - Deploy from GitHub" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Install Git Server on your Synology:" -ForegroundColor Yellow
Write-Host "  1. Open Package Center" -ForegroundColor Gray
Write-Host "  2. Search for 'Git Server'" -ForegroundColor Gray
Write-Host "  3. Click Install" -ForegroundColor Gray
Write-Host ""
$continue = Read-Host "Have you installed Git Server? (yes/no)"

if ($continue -ne "yes") {
    Write-Host "Please install Git Server first, then run this script again." -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "[1/4] Cloning repository from GitHub..." -ForegroundColor Green
Write-Host "  Note: Repository must be public or you'll be prompted for GitHub credentials" -ForegroundColor Gray
ssh "${NAS_USER}@${NAS_HOST}" "set -e; mkdir -p /volume1/web; mkdir -p $NAS_SECRETS_DIR; \
    if [ -f $NAS_DIR/backend/.env ]; then cp $NAS_DIR/backend/.env $NAS_BACKEND_ENV && chmod 600 $NAS_BACKEND_ENV && echo 'Preserved existing backend/.env'; fi; \
    cd /volume1/web && rm -rf c4-mcp-app && GIT_TERMINAL_PROMPT=0 git clone $GITHUB_REPO 2>&1 || echo 'Clone failed - repository may be private'"

Write-Host "[2/4] Installing backend dependencies..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "cd $NAS_DIR/backend && $NODE_PATH $NPM_CMD install --production"

Write-Host "[3/4] Setting up .env..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "set -e; cd $NAS_DIR/backend; \
    if [ -f $NAS_BACKEND_ENV ]; then cp $NAS_BACKEND_ENV .env && chmod 600 .env && echo 'Restored backend/.env from secrets'; \
    elif [ -f .env ]; then echo 'backend/.env exists; leaving as-is'; \
    else cp .env.example .env && chmod 600 .env && echo 'Created backend/.env from .env.example (edit required)'; fi"

Write-Host "[4/4] Creating log directory..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "mkdir -p /tmp/c4-mcp-app-logs"

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT: Edit .env file with your API keys:" -ForegroundColor Yellow
Write-Host "  ssh $NAS_USER@$NAS_HOST" -ForegroundColor Gray
Write-Host "  cd $NAS_DIR/backend" -ForegroundColor Gray
Write-Host "  nano .env" -ForegroundColor Gray
Write-Host ""

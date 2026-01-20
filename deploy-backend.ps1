# C4 Voice Control - Backend Deployment Script for Synology DS218+
# PowerShell version

$ErrorActionPreference = "Stop"

# Configuration
$NAS_USER = "randybritsch"
$NAS_HOST = "192.168.1.237"
$NAS_BACKEND_DIR = "/volume1/web/c4-mcp-app/backend"
$NAS_LOG_DIR = "/var/log/c4-mcp-app"
$LOCAL_BACKEND_DIR = ".\backend"
$NODE_PATH = "/volume1/@appstore/Node.js_v22/usr/local/bin/node"
$NPM_PATH = "/volume1/@appstore/Node.js_v22/usr/local/lib/node_modules/npm/bin/npm"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "C4 Voice Control - Backend Deployment" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we have what we need
if (!(Test-Path $LOCAL_BACKEND_DIR)) {
    Write-Host "❌ Backend directory not found: $LOCAL_BACKEND_DIR" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Deployment Summary:" -ForegroundColor Yellow
Write-Host "  NAS: $NAS_USER@$NAS_HOST" -ForegroundColor Gray
Write-Host "  Target: $NAS_BACKEND_DIR" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  You will be prompted for your NAS password multiple times." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to continue or Ctrl+C to cancel"

# Step 1: Create directories
Write-Host "[1/6] Creating directories on NAS..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "mkdir -p $NAS_BACKEND_DIR && sudo mkdir -p $NAS_LOG_DIR && sudo chown ${NAS_USER}:users $NAS_LOG_DIR"

# Step 2: Copy files using SFTP-compatible method
Write-Host "[2/6] Copying backend files to NAS..." -ForegroundColor Green
$tempArchive = "backend-deploy.tar.gz"
Write-Host "  Creating archive..." -ForegroundColor Gray
tar -czf $tempArchive -C $LOCAL_BACKEND_DIR .
Write-Host "  Uploading archive..." -ForegroundColor Gray
scp $tempArchive "${NAS_USER}@${NAS_HOST}:${NAS_BACKEND_DIR}/"
Write-Host "  Extracting on NAS..." -ForegroundColor Gray
ssh "${NAS_USER}@${NAS_HOST}" "cd $NAS_BACKEND_DIR && tar -xzf $tempArchive && rm $tempArchive"
Remove-Item $tempArchive
Write-Host "  ✓ Files deployed" -ForegroundColor Gray

# Step 3: Remove node_modules and .env if they were copied
Write-Host "[3/6] Cleaning up..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "cd $NAS_BACKEND_DIR && rm -rf node_modules .env *.log"

# Step 4: Install dependencies
Write-Host "[4/6] Installing Node.js dependencies (this may take 2-3 minutes)..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "cd $NAS_BACKEND_DIR && $NODE_PATH $NPM_PATH install --production"

# Step 5: Setup .env
Write-Host "[5/6] Creating .env template..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "cd $NAS_BACKEND_DIR && cp .env.example .env && chmod 600 .env"

# Step 6: Test Node.js
Write-Host "[6/6] Verifying installation..." -ForegroundColor Green
ssh "${NAS_USER}@${NAS_HOST}" "cd $NAS_BACKEND_DIR && $NODE_PATH --version && ls -la src/server.js"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✅ Backend deployment complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Configure .env file with your API keys:" -ForegroundColor White
Write-Host "   ssh $NAS_USER@$NAS_HOST" -ForegroundColor Gray
Write-Host "   cd $NAS_BACKEND_DIR" -ForegroundColor Gray
Write-Host "   nano .env" -ForegroundColor Gray
Write-Host "   (See backend/ENV_SETUP_GUIDE.md for detailed instructions)" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the backend manually:" -ForegroundColor White
Write-Host "   ssh $NAS_USER@$NAS_HOST" -ForegroundColor Gray
Write-Host "   cd $NAS_BACKEND_DIR" -ForegroundColor Gray
Write-Host "   $NODE_PATH src/server.js" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Set up Task Scheduler for auto-start:" -ForegroundColor White
Write-Host "   - Open Synology DSM → Control Panel → Task Scheduler" -ForegroundColor Gray
Write-Host "   - Create → Triggered Task → User-defined script" -ForegroundColor Gray
Write-Host "   - See DEPLOYMENT_CHECKLIST.md for full configuration" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Check logs:" -ForegroundColor White
Write-Host "   ssh $NAS_USER@$NAS_HOST 'tail -f $NAS_LOG_DIR/backend.log'" -ForegroundColor Gray
Write-Host ""

#!/bin/bash

# C4 Voice Control - Backend Deployment Script for Synology DS218+
# This script deploys the backend to your Synology NAS

set -e  # Exit on any error

# Configuration
NAS_USER="randybritsch"
NAS_HOST="192.168.1.237"
NAS_BACKEND_DIR="/volume1/web/c4-mcp-app/backend"
NAS_LOG_DIR="/var/log/c4-mcp-app"
LOCAL_BACKEND_DIR="./backend"

echo "========================================="
echo "C4 Voice Control - Backend Deployment"
echo "========================================="
echo ""

# Step 1: Create directories on NAS
echo "[1/6] Creating directories on NAS..."
ssh ${NAS_USER}@${NAS_HOST} "sudo mkdir -p ${NAS_BACKEND_DIR} ${NAS_LOG_DIR} && sudo chown ${NAS_USER}:users ${NAS_BACKEND_DIR} ${NAS_LOG_DIR}"

# Step 2: Deploy backend files
echo "[2/6] Deploying backend files via rsync..."
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='*.log' \
  ${LOCAL_BACKEND_DIR}/ ${NAS_USER}@${NAS_HOST}:${NAS_BACKEND_DIR}/

# Step 3: Install dependencies
echo "[3/6] Installing Node.js dependencies..."
ssh ${NAS_USER}@${NAS_HOST} "cd ${NAS_BACKEND_DIR} && npm install --production"

# Step 4: Setup .env file
echo "[4/6] Setting up .env file..."
ssh ${NAS_USER}@${NAS_HOST} "cd ${NAS_BACKEND_DIR} && cp .env.example .env && chmod 600 .env"

# Step 5: Test health check
echo "[5/6] Testing health check script..."
ssh ${NAS_USER}@${NAS_HOST} "cd ${NAS_BACKEND_DIR} && node scripts/health-check.js || echo 'Health check will work once server is running'"

# Step 6: Display next steps
echo ""
echo "========================================="
echo "✅ Backend deployment complete!"
echo "========================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Edit .env file with your API keys:"
echo "   ssh ${NAS_USER}@${NAS_HOST}"
echo "   cd ${NAS_BACKEND_DIR}"
echo "   nano .env"
echo ""
echo "2. Test manual start:"
echo "   node src/server.js"
echo ""
echo "3. Configure Task Scheduler in DSM:"
echo "   - Control Panel → Task Scheduler → Create → Triggered Task → User-defined script"
echo "   - Task name: C4 Voice Backend"
echo "   - User: ${NAS_USER}"
echo "   - Event: Boot-up"
echo "   - Run command:"
echo "     cd ${NAS_BACKEND_DIR} && node src/server.js >> ${NAS_LOG_DIR}/backend.log 2>&1"
echo ""
echo "4. Check deployment guide: DEPLOYMENT_CHECKLIST.md"
echo ""


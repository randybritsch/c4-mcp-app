#!/bin/bash
# Synology DS218+ Deployment Script for Backend Service

echo "=== C4-MCP-App Backend Deployment ==="

# Configuration
APP_DIR="/volume1/web/c4-mcp-app/backend"
NODE_BIN="/var/packages/Node.js_v22/target/usr/local/bin/node"
LOG_DIR="/var/log/c4-mcp-app"
PID_FILE="/var/run/c4-mcp-app.pid"

# Create directories if they don't exist
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"

# Step 1: Copy backend files
echo "Step 1: Deploying backend files..."
rsync -av --exclude='node_modules' --exclude='.env' ./backend/ "$APP_DIR/"

# Step 2: Install dependencies
echo "Step 2: Installing dependencies..."
cd "$APP_DIR" || exit 1
"$NODE_BIN" /var/packages/Node.js_v22/target/usr/local/bin/npm install --production

# Step 3: Setup environment
echo "Step 3: Configuring environment..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "⚠ Created .env file from template. Please edit with your API keys!"
fi

# Step 4: Test health
echo "Step 4: Testing backend service..."
"$NODE_BIN" "$APP_DIR/scripts/health-check.js"

# Step 5: Setup systemd-style service (using Task Scheduler)
echo "Step 5: Backend deployment complete!"
echo ""
echo "Next steps:"
echo "1. Edit $APP_DIR/.env with your API keys"
echo "2. In Synology DSM, go to Control Panel > Task Scheduler"
echo "3. Create > Triggered Task > User-defined script"
echo "4. Name: C4-MCP-App Backend"
echo "5. User: root"
echo "6. Event: Boot-up"
echo "7. Script:"
echo "   $NODE_BIN $APP_DIR/src/server.js >> $LOG_DIR/backend.log 2>&1 &"
echo "   echo \$! > $PID_FILE"
echo ""
echo "To start manually:"
echo "  $NODE_BIN $APP_DIR/src/server.js"

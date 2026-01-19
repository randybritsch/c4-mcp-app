#!/bin/bash
# Synology DS218+ Deployment Script for Frontend PWA

echo "=== C4-MCP-App Frontend Deployment ==="

# Configuration
WEB_DIR="/volume1/web/c4-voice"

# Create web directory if it doesn't exist
mkdir -p "$WEB_DIR"

# Step 1: Copy frontend files
echo "Step 1: Deploying frontend files..."
rsync -av ./frontend/ "$WEB_DIR/"

# Step 2: Set permissions
echo "Step 2: Setting permissions..."
chown -R http:http "$WEB_DIR"
chmod -R 755 "$WEB_DIR"

# Step 3: Configuration reminder
echo "Step 3: Frontend deployment complete!"
echo ""
echo "Next steps:"
echo "1. In Synology DSM, go to Control Panel > Web Services > Web Station"
echo "2. Enable Web Station if not already enabled"
echo "3. Create a new web portal:"
echo "   - Portal Type: Name-based"
echo "   - Hostname: c4-voice.local (or your domain)"
echo "   - Port: 80 (HTTP) or 443 (HTTPS)"
echo "   - Document Root: $WEB_DIR"
echo "   - Backend Server: (none needed - static files)"
echo ""
echo "4. For HTTPS (recommended):"
echo "   - Control Panel > Security > Certificate"
echo "   - Add certificate (Let's Encrypt or import)"
echo "   - Assign to c4-voice web portal"
echo ""
echo "5. Update frontend configuration:"
echo "   - Edit $WEB_DIR/js/config.js"
echo "   - Set API_URL to your backend server URL"
echo "   - Set WS_URL to your WebSocket server URL"
echo ""
echo "6. Access your PWA at:"
echo "   http://c4-voice.local (or your domain)"

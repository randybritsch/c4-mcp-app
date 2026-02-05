# Manual Setup Commands for Synology NAS
# Run these commands one by one in your SSH session

# 1. SSH into your NAS
ssh randybritsch@192.168.1.237

# 2. Navigate to backend directory
cd /volume1/web/c4-mcp-app/backend

# 3. Install dependencies (using new syntax)
/volume1/@appstore/Node.js_v22/usr/local/bin/node /volume1/@appstore/Node.js_v22/usr/local/lib/node_modules/npm/bin/npm-cli.js install --omit=dev

# 4. Copy .env template
test -f .env || cp .env.example .env
chmod 600 .env

# 5. Edit .env with your API keys
nano .env

# Required values in .env:
#   JWT_SECRET - Generate with: openssl rand -hex 64
#   STT_PROVIDER - google or azure
#   GOOGLE_STT_API_KEY or AZURE_STT_KEY + AZURE_STT_REGION
#   LLM_PROVIDER - openai or anthropic
#   OPENAI_API_KEY or ANTHROPIC_API_KEY
#   MCP_HOST - Your Control4 Director IP
#   MCP_PORT - Usually 9000

# 6. Test the backend
/volume1/@appstore/Node.js_v22/usr/local/bin/node src/server.js

# Expected output:
#   {"level":"info","message":"Server starting on port 3000..."}
#   {"level":"info","message":"HTTP server listening on port 3000"}

# 7. Test health endpoint (in another terminal)
curl http://localhost:3000/api/v1/health

# Should return: {"status":"ok",...}

# 8. Stop the server (Ctrl+C) and set up Task Scheduler in DSM

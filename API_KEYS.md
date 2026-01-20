# API Keys Setup Guide

## Required API Keys

To enable full functionality, you'll need API keys for:

### 1. Speech-to-Text (STT)

**Option A: Google Cloud Speech-to-Text** (Recommended)
- Visit: https://console.cloud.google.com/
- Create a new project or select existing
- Enable **Cloud Speech-to-Text API**
- Go to **APIs & Services** > **Credentials**
- Click **Create Credentials** > **API Key**
- Copy the API key
- (Optional) Click **Restrict Key** > Select **Cloud Speech-to-Text API**

**Option B: Azure Speech Service**
- Visit: https://portal.azure.com/
- Create **Speech Service** resource
- Copy **Key 1** and **Region**

### 2. Large Language Model (LLM)

**Option A: OpenAI GPT-4** (Recommended)
- Visit: https://platform.openai.com/
- Sign up / Log in
- Go to **API Keys** (left sidebar)
- Click **Create new secret key**
- Copy the key immediately (you won't see it again)
- Set usage limits: **Settings** > **Billing** > **Usage limits**

**Option B: Anthropic Claude**
- Visit: https://console.anthropic.com/
- Sign up / Log in
- Go to **API Keys**
- Click **Create Key**
- Copy the key

### 3. Control4 Director (Optional for testing)

You'll need:
- **Control4 Director IP**: Find in Composer or check your router's DHCP table
- **MCP Port**: Default is 9000 (verify in Composer)

## Adding Keys to .env

SSH into your NAS:
```bash
ssh randybritsch@192.168.1.237
cd /volume1/web/c4-mcp-app/backend
vi .env
```

Or use echo commands (easier):
```bash
ssh randybritsch@192.168.1.237 << 'EOF'
cd /volume1/web/c4-mcp-app/backend

# Backup current .env
cp .env .env.backup

# Add Google STT (replace YOUR_KEY_HERE)
sed -i 's/#STT_PROVIDER=google/STT_PROVIDER=google/' .env
sed -i 's/#GOOGLE_STT_API_KEY=your_key_here/GOOGLE_STT_API_KEY=YOUR_KEY_HERE/' .env

# Add OpenAI (replace YOUR_KEY_HERE)
sed -i 's/#LLM_PROVIDER=openai/LLM_PROVIDER=openai/' .env
sed -i 's/#OPENAI_API_KEY=your_key_here/OPENAI_API_KEY=YOUR_KEY_HERE/' .env

# Add Control4 (replace IP and port if needed)
sed -i 's/#MCP_HOST=192.168.1.100/MCP_HOST=192.168.1.XXX/' .env
sed -i 's/#MCP_PORT=9000/MCP_PORT=9000/' .env

# Restart server
pkill -f 'node src/server.js'
sleep 2
/volume1/@appstore/Node.js_v22/usr/local/bin/node src/server.js >> /tmp/c4-mcp-app-logs/backend.log 2>&1 &
EOF
```

## Manual .env Configuration

Edit `/volume1/web/c4-mcp-app/backend/.env` to look like this:

```env
# Node.js Environment
NODE_ENV=production
PORT=3001

# Authentication
JWT_SECRET=0c0b083346be6a8845344fc802db8bd4884ff03f468d751050e4f66d2297fa59a311e6996979806035efb29e83df6ee8025bb61307c62c5fd7a85a8e16f3c5b0

# Logging
LOG_LEVEL=info

# Speech-to-Text
STT_PROVIDER=google
GOOGLE_STT_API_KEY=YOUR_GOOGLE_API_KEY_HERE

# LLM
LLM_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

# Control4 MCP
MCP_HOST=192.168.1.XXX
MCP_PORT=9000
```

## Verify Configuration

After adding keys and restarting:

```bash
# Check server logs
ssh randybritsch@192.168.1.237 "tail -20 /tmp/c4-mcp-app-logs/backend.log"

# Test health endpoint
curl http://192.168.1.237:3001/api/v1/health
```

## Cost Estimates

- **Google STT**: ~$0.006 per 15 seconds of audio ($0.024/minute)
- **OpenAI GPT-4**: ~$0.03 per 1K input tokens, ~$0.06 per 1K output
- **Anthropic Claude 3 Opus**: ~$0.015 per 1K input tokens, ~$0.075 per 1K output

Typical voice command cost: ~$0.01-0.05 per command

## Security Notes

- Never commit API keys to GitHub
- .env file is in .gitignore (protected)
- Set usage limits on all API accounts
- Monitor billing dashboards regularly
- Rotate keys if compromised

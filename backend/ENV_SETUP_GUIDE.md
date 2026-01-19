# Production Environment Configuration Guide

## Quick Start

1. Copy the template: `cp .env.example .env`
2. Edit `.env` with your actual credentials (see sections below)
3. **Never commit `.env` to version control** (already in `.gitignore`)

---

## Required Environment Variables

### 1. Node.js Environment

```bash
NODE_ENV=production
PORT=3000
```

**Notes:**
- `NODE_ENV=production` enables optimizations and disables debug logging
- `PORT=3000` is the default; change if port 3000 is already in use on your Synology

---

### 2. JWT Secret (Authentication)

```bash
JWT_SECRET=<GENERATE-A-SECURE-256-BIT-KEY>
```

**How to generate a secure JWT secret:**

**Option 1 - Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Option 2 - Using PowerShell:**
```powershell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Option 3 - Using OpenSSL:**
```bash
openssl rand -hex 64
```

**Example output (DO NOT USE THIS, generate your own):**
```
JWT_SECRET=a7f3c9e2b8d4a1f6e9c3b7d2a5e8f1c4b9d6a3e7f2c5b8d1a4e7f3c6b9d2a5e8
```

---

### 3. Logging

```bash
LOG_LEVEL=info
```

**Valid levels (from most to least verbose):**
- `debug` - Development/troubleshooting (very verbose)
- `info` - Production default (normal operations)
- `warn` - Warnings only
- `error` - Errors only

**Recommendation:** Use `info` for production, `debug` for initial deployment testing

---

### 4. Speech-to-Text (STT) Configuration

#### Option A: Google Cloud Speech-to-Text (Recommended)

```bash
STT_PROVIDER=google
GOOGLE_STT_API_KEY=<YOUR-GOOGLE-API-KEY>
```

**How to get Google STT API Key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable "Cloud Speech-to-Text API"
4. Go to "APIs & Services" → "Credentials"
5. Click "Create Credentials" → "API Key"
6. Copy the generated API key
7. **Restrict the key:** Click "Edit API key" → Set application restrictions and API restrictions to "Cloud Speech-to-Text API"

**Pricing (as of 2026):**
- First 60 minutes/month: FREE
- Beyond: ~$0.006 per 15 seconds
- Typical usage: ~4 seconds per command = ~$0.0016 per command

#### Option B: Azure Cognitive Services Speech

```bash
STT_PROVIDER=azure
AZURE_STT_KEY=<YOUR-AZURE-KEY>
AZURE_STT_REGION=<YOUR-REGION>  # e.g., eastus, westus2, westeurope
```

**How to get Azure STT credentials:**
1. Go to [Azure Portal](https://portal.azure.com/)
2. Create "Speech Service" resource
3. Copy "Key 1" or "Key 2" from "Keys and Endpoint" section
4. Copy "Location/Region" value
5. Paste both into `.env`

**Pricing (as of 2026):**
- First 5 hours/month: FREE
- Beyond: ~$1 per hour
- Typical usage: ~4 seconds per command = ~$0.0011 per command

---

### 5. LLM (Intent Parsing) Configuration

#### Option A: OpenAI GPT-4 (Recommended)

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-<YOUR-OPENAI-API-KEY>
```

**How to get OpenAI API Key:**
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to "API keys" section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-proj-` or `sk-`)
6. **Set usage limits** in your OpenAI account to avoid unexpected charges

**Pricing (as of 2026 - GPT-4 Turbo):**
- Input: ~$0.01 per 1K tokens
- Output: ~$0.03 per 1K tokens
- Typical usage: ~50 input tokens + 50 output tokens = ~$0.002 per command

#### Option B: Anthropic Claude

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-<YOUR-ANTHROPIC-API-KEY>
```

**How to get Anthropic API Key:**
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Go to "API Keys" section
4. Create new API key
5. Copy the key (starts with `sk-ant-`)

**Pricing (as of 2026 - Claude 3 Haiku):**
- Input: ~$0.00025 per 1K tokens
- Output: ~$0.00125 per 1K tokens
- Typical usage: ~50 input tokens + 50 output tokens = ~$0.00009 per command

---

### 6. Control4 MCP Configuration

```bash
MCP_HOST=192.168.1.100  # Replace with your Control4 Director IP
MCP_PORT=9000           # Default MCP port (verify with your Control4 system)
```

**How to find your Control4 Director IP:**
1. Open Control4 Composer software
2. Go to "System Design" → "Properties"
3. Note the Director IP address
4. **OR** Check your router's DHCP client list for "Control4-Director" or similar

**Note:** MCP protocol implementation is a placeholder. You'll need to:
1. Verify the actual Control4 MCP protocol specification
2. Update `backend/src/services/mcp-client.js` with real protocol
3. Test with your actual Control4 system

---

## Complete .env Example

```bash
# Node.js
NODE_ENV=production
PORT=3000

# Authentication
JWT_SECRET=a7f3c9e2b8d4a1f6e9c3b7d2a5e8f1c4b9d6a3e7f2c5b8d1a4e7f3c6b9d2a5e8

# Logging
LOG_LEVEL=info

# Speech-to-Text (choose one)
STT_PROVIDER=google
GOOGLE_STT_API_KEY=AIzaSyC1x2y3z4a5b6c7d8e9f0g1h2i3j4k5l6m

# LLM Intent Parsing (choose one)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890

# Control4 MCP
MCP_HOST=192.168.1.100
MCP_PORT=9000
```

---

## Verification Steps

After configuring `.env`:

### 1. Test Backend Startup
```bash
cd backend
npm start
```

**Expected output:**
```
{"level":"info","message":"Server starting on port 3000..."}
{"level":"info","message":"HTTP server listening on port 3000"}
{"level":"info","message":"WebSocket server initialized"}
```

### 2. Test Health Endpoint
```bash
curl http://localhost:3000/api/v1/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-19T...",
  "uptime": 12.345,
  "memory": { "rss": 45678901, "heapUsed": 23456789, "external": 1234567 }
}
```

### 3. Test API Key Validity

**Google STT:**
```bash
curl "https://speech.googleapis.com/v1/speech:recognize?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config":{"encoding":"LINEAR16","sampleRateHertz":16000,"languageCode":"en-US"},"audio":{"content":""}}'
```

**OpenAI:**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Security Best Practices

1. **Never commit `.env` to Git** - already in `.gitignore`
2. **Restrict API keys** to only required services (IP restrictions, API restrictions)
3. **Set spending limits** in cloud provider dashboards
4. **Rotate keys** every 90 days for production systems
5. **Use separate keys** for development and production
6. **Monitor usage** regularly in cloud provider dashboards
7. **Store backups** of `.env` in a secure password manager (1Password, Bitwarden, etc.)

---

## Estimated Monthly Costs

Based on **100 voice commands per day** (3000/month):

| Service | Provider | Cost/Command | Monthly Total |
|---------|----------|--------------|---------------|
| STT | Google | $0.0016 | ~$4.80 |
| STT | Azure | $0.0011 | ~$3.30 |
| LLM | OpenAI GPT-4 | $0.0020 | ~$6.00 |
| LLM | Anthropic Claude | $0.0001 | ~$0.30 |

**Recommended combination:** Google STT + Anthropic Claude = **~$5.10/month**  
**Alternative:** Azure STT + Anthropic Claude = **~$3.60/month** (most cost-effective)

---

## Troubleshooting

### "Invalid API key" errors
- Verify key is copied correctly (no spaces, complete string)
- Check API is enabled in cloud provider dashboard
- Verify spending limits haven't been exceeded
- Try regenerating the key

### "MCP connection timeout"
- Verify Control4 Director IP is correct
- Check Director is powered on and network-accessible
- Verify port 9000 is not blocked by firewall
- Test with `telnet 192.168.1.100 9000` from Synology

### "Permission denied" on Synology
- Verify `.env` file permissions: `chmod 600 .env`
- Ensure file owner is correct: `chown <username> .env`

---

## Next Steps

Once `.env` is configured:

1. ✅ Test backend startup
2. ✅ Verify health endpoint
3. ✅ Test API connectivity
4. 📝 Proceed to deployment (see [ops/runbook.md](../docs/ops/runbook.md))
5. 📝 Run end-to-end voice command test

**Keep this guide handy** for updating credentials or troubleshooting API issues.

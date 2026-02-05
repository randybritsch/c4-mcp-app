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

**Option A: OpenAI** (Recommended)
- Visit: https://platform.openai.com/
- Sign up / Log in
- Go to **API Keys** (left sidebar)
- Click **Create new secret key**
- Copy the key immediately (you won't see it again)
- Set usage limits: **Settings** > **Billing** > **Usage limits**

Model note:
- This project is tested/stabilized with `gpt-4o-mini`.

**Option B: Anthropic Claude**

Note: The current `c4-mcp-app` backend does not yet implement Anthropic (`LLM_PROVIDER=anthropic` will fail). Keep this section only if you plan to add Anthropic support.
- Visit: https://console.anthropic.com/
- Sign up / Log in
- Go to **API Keys**
- Click **Create Key**
- Copy the key

### 3. Control4 (via c4-mcp)

This app talks to your Control4 system through the `c4-mcp` HTTP server.

You'll need:
- **c4-mcp base URL**: e.g. `http://192.168.1.237:3334` (NAS/LAN)

## Adding Keys to .env

Where you set env vars depends on how you're running the backend:

- **Synology Container Manager (Compose project):** set variables in the compose project environment, or via `env_file` pointing at a stable secrets file outside any repo checkout (recommended).
- **Native Node.js process (legacy):** set variables in `backend/.env` and restart the Node process.

### Container Manager (recommended)

Recommended pattern:
- Keep a dedicated secrets file (example): `/volume1/dockerc4-mcp/c4-voice-secrets/backend.env`
- Reference it from Compose using `env_file:`
- Lock it down (example): `chmod 400 backend.env`

In DSM **Container Manager → Projects → (your compose project, e.g. `c4-voice`)**, add/update backend environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-4o-mini`
- `STT_PROVIDER=google` and `GOOGLE_STT_API_KEY` (if using Google STT)
- `C4_MCP_BASE_URL=http://<NAS_IP>:3334`

Then **Rebuild/Recreate** the backend container.

### Native Node.js (legacy)

SSH into your NAS and edit `.env`:

```bash
ssh <user>@<NAS_IP>
cd /volume1/web/c4-mcp-app/backend
vi .env
```

## Manual .env Configuration (legacy native Node)

Edit `/volume1/web/c4-mcp-app/backend/.env` to look like this:

```env
# Node.js Environment
NODE_ENV=production
PORT=3002

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
OPENAI_MODEL=gpt-4o-mini

# Control4 (via c4-mcp HTTP server)
C4_MCP_BASE_URL=http://192.168.1.237:3334
C4_MCP_TIMEOUT_MS=8000
```

## Verify Configuration

After adding keys and restarting:

```bash
# Check server logs
ssh randybritsch@192.168.1.237 "tail -20 /tmp/c4-mcp-app-logs/backend.log"

# Test health endpoint
curl http://192.168.1.237:3002/api/v1/health
```

## Cost Estimates

- **Google STT**: ~$0.006 per 15 seconds of audio ($0.024/minute)
- OpenAI pricing varies by model; `gpt-4o-mini` is typically much cheaper than GPT-4-class models.

Typical voice command cost: ~$0.01-0.05 per command

## Security Notes

- Never commit API keys to GitHub
- .env file is in .gitignore (protected)
- Set usage limits on all API accounts
- Monitor billing dashboards regularly
- Rotate keys if compromised

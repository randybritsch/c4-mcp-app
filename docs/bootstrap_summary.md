# PROJECT BOOTSTRAP SUMMARY

**Last Updated:** January 20, 2026  
**Status:** ✅ DEPLOYED - Production Running

---

## Purpose

Voice-controlled smart home interface for Control4 automation via Progressive Web App, running on Synology DS218+ NAS without Docker.

---

## Architecture Overview

- **Frontend:** PWA deployed at http://192.168.1.237 via Web Station (HTML5/CSS3/JS + MediaRecorder API + WebSocket + Service Workers)
- **Backend:** Node.js v22 Express service running at http://192.168.1.237:3001 (<65MB RAM, auto-starts via Task Scheduler)
- **Cloud AI:** Google/Azure STT for speech-to-text, OpenAI GPT-4/Anthropic Claude for intent parsing (APIs configured, keys pending)
- **Control4 Bridge:** MCP client configured for Director at 192.168.1.142:9000 (protocol implementation pending)
- **Deployment:** Synology-native tools—Web Station (PWA), Task Scheduler (backend auto-start), nginx (reverse proxy)
- **Production Ready:** Backend responding to health checks, frontend accessible, all infrastructure configured

---

## Key Modules & Roles

- **PWA Frontend** (`/frontend`): MediaRecorder voice capture, WebSocket streaming, Service Worker offline support, responsive UI
- **Backend Service** (`/backend/src`): Express REST API, WebSocket server, JWT auth, Winston logging, correlation middleware
- **STT Service** (`/backend/src/services/stt.js`): Google/Azure API integration, audio format validation, retry logic
- **LLM Service** (`/backend/src/services/llm.js`): OpenAI/Anthropic intent parsing, structured JSON output, prompt engineering
- **MCP Client** (`/backend/src/services/mcp.js`): Control4 Director communication (placeholder - protocol needs implementation)
- **Health Check** (`/backend/src/routes/health.js`): System status monitoring, uptime tracking, memory metrics

---

## Data & Contracts (Top 5)

1. **Voice Request:** `{ audioChunks: [Blob], timestamp: ISO8601, sessionId: UUID }`
2. **STT Response:** `{ transcript: string, confidence: 0.0-1.0 }`
3. **Intent Object:** `{ action: string, target: string, value?: any, room?: string }`
4. **MCP Command:** `{ command: string, deviceId: string, parameters: {}, timestamp: ISO8601 }`
5. **Health Status:** `{ status: "healthy", timestamp: ISO8601, uptime: seconds, memoryUsage: {}, nodeVersion: string }`

---

## APIs (Key Endpoints)

- **Health:** `GET http://192.168.1.237:3001/api/v1/health` (✅ responding)
- **Voice:** `POST /api/v1/voice` (audio processing endpoint)
- **WebSocket:** `ws://192.168.1.237:3001/ws` (real-time streaming)
- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/token`
- **Rate Limits:** 100 req/15min per IP (REST), 10 concurrent WebSocket connections, 30s heartbeat

---

## Coding Conventions (AI Must Follow)

- **Node.js:** v22 in production, code compatible with v18+, **pure JavaScript only—NO native addons**
- **Config:** Environment-based via `/backend/src/config/index.js`, reads from `.env` with dotenv
- **Async:** Always `async/await`, structured error handling with try-catch
- **Errors:** Winston JSON logging with correlation IDs, levels: `error|warn|info|debug`
- **Testing:** Jest + Supertest, 6/6 tests passing, mock external APIs
- **Security:** Helmet, CORS, rate limiting, JWT with 7-day expiry, no secrets in code
- **Deployment:** Task Scheduler for auto-start, health checks for monitoring, logs in `/tmp/c4-mcp-app-logs/`

---

## Current Priorities (Top 5)

1. **Acquire API Keys:** Google Cloud STT API key, OpenAI API key (see [API_KEYS.md](../API_KEYS.md))
2. **Test Voice Pipeline:** Record audio in PWA → verify STT transcription → confirm LLM intent parsing
3. **Implement Control4 Protocol:** Research MCP protocol documentation, implement real Control4 integration (current: placeholder)
4. **SSL Certificate:** Configure Let's Encrypt via DSM for HTTPS/WSS access
5. **Mobile Testing:** Test PWA installation, offline functionality, WebSocket reconnection on various devices

---

## Open Risks/Unknowns (Top 5)

1. **Control4 MCP Protocol:** Current implementation is placeholder - requires official Control4 protocol documentation and DriverWorks SDK access
2. **API Costs:** Google STT (~$0.024/min) + OpenAI GPT-4 (~$0.03/1K tokens) = ~$0.01-0.05 per command; need usage monitoring and limits
3. **NAS Performance:** Backend using ~65MB RAM (✅ within budget), but no load testing with concurrent users yet
4. **Network Reliability:** WebSocket reconnection logic untested, NAT traversal may cause dropouts in some router configurations
5. **Audio Compatibility:** Browser MediaRecorder codec support varies (WebM Opus vs AAC); cloud STT compatibility needs validation

---

## Full Documentation Links

- **Project Overview:** [docs/project_overview.md](project_overview.md) (762 lines, ✅ updated 2026-01-20)
- **Deployment Guide:** [DEPLOYMENT_COMPLETE.md](../DEPLOYMENT_COMPLETE.md) (full setup summary)
- **Task Scheduler Setup:** [TASK_SCHEDULER_SETUP.md](../TASK_SCHEDULER_SETUP.md) (auto-start configuration)
- **API Keys Guide:** [API_KEYS.md](../API_KEYS.md) (Google/OpenAI/Control4 setup)
- **Architecture:** [docs/architecture.md](architecture.md)
- **API Reference:** [docs/api/endpoints.md](api/endpoints.md)
- **Operations:** [docs/ops/runbook.md](ops/runbook.md)
- **GitHub Repository:** https://github.com/randybritsch/c4-mcp-app

---

## Quick Status Check

```bash
# Backend health
curl http://192.168.1.237:3001/api/v1/health

# Frontend
http://192.168.1.237

# Server logs
ssh randybritsch@192.168.1.237 "tail -f /tmp/c4-mcp-app-logs/backend.log"

# Process status
ssh randybritsch@192.168.1.237 "ps aux | grep 'node src/server.js'"
```

---

**Word Count:** ~650 words  
**Use Case:** Paste this summary into new chat sessions to instantly restore project context with current deployment status.

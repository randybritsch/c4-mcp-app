# PROJECT BOOTSTRAP SUMMARY

**Last Updated:** January 19, 2026

---

## Purpose

Voice-controlled smart home interface for Control4 automation via Progressive Web App, running on Synology DS218+ NAS without Docker.

---

## Architecture Overview

- **Frontend:** PWA (HTML5/CSS3/JS) with MediaRecorder API, WebSocket, Service Workers for offline support
- **Backend:** Node.js v22 Express/Fastify service orchestrating STT→LLM→MCP pipeline (<256MB RAM, stateless)
- **Cloud AI:** Google/Azure STT for speech-to-text, OpenAI GPT-4/Anthropic Claude for intent parsing (no local LLM)
- **Control4 Bridge:** MCP (Model Context Protocol) translates structured commands to Control4 Director API
- **Deployment:** Synology-native tools only—Web Station (PWA), Task Scheduler (backend), Reverse Proxy (HTTPS/WSS), Let's Encrypt (SSL)
- **No Docker:** Runs directly on DSM due to DS218+ resource constraints (2GB RAM, dual-core Realtek RTD1296)

---

## Key Modules & Roles

- **PWA Frontend** (`/frontend`): Captures voice via MediaRecorder, streams to backend via WebSocket, displays responses, offline-first UX
- **Backend Service** (`/backend/src`): Receives audio, calls STT API, sends transcript to LLM for intent parsing, translates to MCP commands, sends to Control4
- **Cloud STT Module** (external): Google Speech-to-Text or Azure Cognitive Services converts audio→text
- **Cloud LLM Module** (external): OpenAI/Anthropic parses natural language intent→structured JSON commands
- **MCP Client** (`/backend/src/mcp-client.js`): Communicates with Control4 Director via Model Context Protocol

---

## Data & Contracts (Top 5)

1. **Voice Request:** `{ audioChunks: [Blob], timestamp: ISO8601, sessionId: UUID }`
2. **STT Response:** `{ transcript: string, confidence: 0.0-1.0 }`
3. **Intent Object:** `{ action: string, target: string, value?: any, room?: string }`
4. **MCP Command:** `{ command: string, deviceId: string, parameters: {}, timestamp: ISO8601 }`
5. **Error Response:** `{ error: { code: string, message: string, details?: {} } }`

---

## APIs (Key Endpoints)

- **REST:** `POST /api/v1/voice/process` (sync audio→response), `GET /api/v1/health`, `POST /api/v1/auth/token`
- **WebSocket:** `wss://[DOMAIN]/ws` (streaming: client→`audio-chunk`, server→`transcript-partial|command-confirmed|error`)
- **Rate Limits:** 60 req/min per IP (REST), 10 concurrent WebSocket connections
- **Auth:** JWT tokens (7-day expiry), optional device fingerprinting

---

## Coding Conventions (AI Must Follow)

- **Node.js:** Use v22 (production), write code compatible with Node.js 18+, **pure JavaScript only—NO native addons**
- **Dependencies:** Verify pure JS before installing (avoid `bcrypt`, `sqlite3`, `sharp`, `node-sass`—use `bcryptjs`, `jimp`, `sass`)
- **Async:** Always use `async/await`, never bare Promises or callbacks
- **Errors:** Structured errors with codes (`USER_INPUT_ERROR`, `STT_TIMEOUT`), log with correlation IDs
- **Logging:** Winston JSON format, levels: `error|warn|info|debug`, include `timestamp|level|correlationId|message|context`
- **Testing:** Jest for unit/integration, 80%+ coverage target, mock all external APIs (STT/LLM/MCP)
- **Security:** Helmet middleware, CORS whitelist, rate limiting, JWT validation, no secrets in code (use `.env`)

---

## Current Priorities (Top 5)

1. **Complete Backend Implementation:** Build Express server with `/api/v1/voice/process` endpoint, WebSocket server, STT/LLM integration
2. **PWA Voice Capture UI:** Create HTML/CSS interface with record button, MediaRecorder implementation, WebSocket client
3. **MCP Client Development:** Implement MCP protocol client to communicate with Control4 Director
4. **Deployment Scripts:** Create Synology Task Scheduler scripts, Web Station config, reverse proxy rules, SSL setup
5. **Testing Harness:** Build Jest test suite with mocks for cloud APIs, integration tests for full pipeline

---

## Open Risks/Unknowns (Top 5)

1. **Control4 MCP API Availability:** Confirm Control4 Director supports MCP protocol; fallback to HTTP API or custom bridge if unavailable
2. **DS218+ Performance:** 2GB RAM may struggle with concurrent users (>5); need real-world load testing, implement aggressive rate limiting
3. **Cloud API Latency:** STT+LLM roundtrip may exceed 2-3s; implement streaming responses, optimistic UI updates, timeout fallbacks
4. **WebSocket Stability:** NAT traversal, router timeouts may drop connections; implement exponential backoff reconnect, resume session logic
5. **Audio Format Compatibility:** Browser MediaRecorder codecs vary (WebM Opus vs AAC); verify Google/Azure STT support, implement transcoding if needed

---

## Full Documentation Links

- **Single Source of Truth:** [docs/project_overview.md](project_overview.md) (14 sections, 500+ lines)
- **Architecture Deep-Dive:** [docs/architecture.md](architecture.md) (diagrams, tradeoffs)
- **Module Specs:** [docs/modules/pwa-frontend.md](modules/pwa-frontend.md), [docs/modules/backend-service.md](modules/backend-service.md), [docs/modules/backend-package.md](modules/backend-package.md)
- **API Documentation:** [docs/api/endpoints.md](api/endpoints.md) (REST + WebSocket)
- **Data Contracts:** [docs/data/contracts.md](data/contracts.md) (JSON schemas, versioning)
- **Operational Runbook:** [docs/ops/runbook.md](ops/runbook.md) (deployment, monitoring, troubleshooting)
- **Roadmap:** [docs/roadmap.md](roadmap.md) (8-week plan, milestones, risks)
- **Glossary:** [docs/glossary.md](glossary.md) (60+ terms)

---

**Word Count:** ~620 words  
**Use Case:** Paste this summary into new chat sessions to instantly restore project context without re-reading full documentation.

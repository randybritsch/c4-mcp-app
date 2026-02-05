# Project Overview: C4-MCP-App

**Version:** 1.0.0  
**Last Updated:** February 5, 2026  
**Status:** ✅ DEPLOYED - Running in Production

---

## 1. Executive Summary {#executive-summary}

C4-MCP-App is a lightweight, phone-based smart home control interface that enables voice and text interaction with Control4 home automation systems. The system consists of a Progressive Web App (PWA) frontend that communicates with an AI-powered backend service running on a Synology NAS. The backend interprets natural language commands via cloud-based AI services and translates them into deterministic `c4-mcp` tool calls for Control4 integration.

Reference deployment uses **Synology Container Manager (Docker Compose)** for repeatability, while keeping runtime/resource usage small.

---

## 2. Architecture {#architecture}

### 2.1 Logical Architecture

```
┌─────────────────┐
│  Mobile Phone   │
│    (Browser)    │
│      PWA        │
└────────┬────────┘
         │ HTTPS/WSS
         │
┌────────▼────────────────────────────────────┐
│       Synology DS218+ NAS                   │
│  ┌─────────────────────────────────────┐   │
│  │   Reverse Proxy (HTTPS/WSS)         │   │
│  │   - Let's Encrypt SSL               │   │
│  │   - Route: / → PWA                  │   │
│  │   - Route: /api/* → Backend         │   │
│  └──────────┬──────────────┬───────────┘   │
│             │              │                │
│  ┌──────────▼────────┐  ┌──▼─────────────┐ │
│  │   Web Station     │  │  Backend Service│ │
│  │   (PWA Host)      │  │   (Node.js)    │ │
│  └───────────────────┘  └──┬──────────────┘ │
│                            │                │
└────────────────────────────┼────────────────┘
                             │ HTTP (tool calls)
                             │
                ┌────────────▼───────────┐
                │   MCP Server           │
                │   (Control4 Bridge)    │
                └────────────┬───────────┘
                             │ Control4 API
                             │
                ┌────────────▼───────────┐
                │   Control4 System      │
                │   (Home Automation)    │
                └────────────────────────┘
```

### 2.2 Runtime Components

| Component | Technology | Runs On | Purpose |
|-----------|-----------|---------|---------|
| PWA Frontend | HTML5/CSS3/JavaScript | Mobile Browser | User interface, voice input (MediaRecorder + WAV fallback), status display |
| Backend Service | Node.js (Express) | Synology DS218+ | Intent parsing, `c4-mcp` coordination, API gateway |
| Static Hosting (Optional) | Web Station / local server | LAN device | Hosts the frontend files (often run locally for mic permissions) |
| Reverse Proxy | Synology DSM | DS218+ | HTTPS termination, routing, WebSocket support |
| MCP Server | `c4-mcp` (HTTP) | Synology (container) | Control4 integration bridge |
| Cloud LLM | Gemini (current; locked system prompt) / OpenAI (optional) | Cloud | Natural language understanding |
| Cloud STT | Google/Azure/etc | Cloud | Speech-to-text conversion |

### 2.3 Data Flow

1. **User Input Flow:**
   - User taps/holds button in PWA → records audio
  - Audio sent via WebSocket streaming (or posted as base64 to `POST /api/v1/voice/process`)
   - Backend forwards to cloud STT service → text transcript
   - Text sent to cloud LLM with Control4 context → intent + parameters
  - Backend translates intent to a `c4-mcp` tool call (HTTP)
  - Tool call executed via `c4-mcp`
   - Response streamed back via WebSocket to PWA

  Notes:
  - Backend may run deterministic preflight resolution (inventory lookup) to inject stable IDs (e.g., `room_id`) when there is exactly one match; otherwise it requests clarification.
  - Locked system prompt integrity is enforced at backend startup (SHA-256 check) to prevent accidental prompt drift.

2. **Text Input Flow:**
   - User types in PWA chat interface
  - Text sent via HTTPS POST to `POST /api/v1/voice/process-text`
   - Backend sends to cloud LLM → intent + parameters
   - (Same as above from intent extraction onward)

### 2.4 External Dependencies

- **Cloud STT Provider** (Google Speech-to-Text, Azure Speech, or AWS Transcribe)
- **Cloud LLM Provider** (Gemini current; prompt-locked; provider-swappable)
- **MCP Server** (`c4-mcp` HTTP server)
- **Let's Encrypt** (SSL certificates via Synology DSM)
- **Public DNS** (for HTTPS access)

---

## 3. Directory Structure {#directory-structure}

```
c4-mcp-app/
├── docs/                          # Project documentation
│   ├── project_overview.md        # This file
│   ├── architecture.md            # Detailed architecture diagrams
│   ├── api/                       # API documentation
│   │   └── endpoints.md           # REST and WebSocket API specs
│   ├── data/                      # Data contracts
│   │   └── contracts.md           # Message schemas, MCP payloads
│   ├── modules/                   # Module specifications
│   │   ├── README.md              # Module documentation guide
│   │   ├── pwa.md                 # PWA frontend module
│   │   ├── backend.md             # Backend service module
│   │   └── mcp-client.md          # MCP client module
│   ├── ops/                       # Operations
│   │   └── runbook.md             # Deployment, monitoring, troubleshooting
│   ├── roadmap.md                 # Feature roadmap and milestones
│   ├── glossary.md                # Terms and abbreviations
│   ├── bootstrap_summary.md       # Quick context reload
│   └── prompts.md                 # AI prompt templates
│
├── frontend/                      # PWA application (IMPLEMENTED ✅)
│   ├── index.html                 # Main PWA entry point
│   ├── manifest.json              # PWA manifest
│   ├── service-worker.js          # Offline support, caching
│   ├── css/                       # Stylesheets
│   │   └── style.css              # Main styles with dark theme
│   ├── js/                        # JavaScript modules
│   │   ├── app.js                 # Main application logic
│   │   ├── voice.js               # Voice capture (MediaRecorder + WAV fallback)
│   │   ├── websocket.js           # WebSocket client with reconnection
│   │   └── config.js              # Configuration and device ID
│   ├── icons/                     # PWA icons (need to generate)
│   │   └── README.md              # Icon generation instructions
│   └── README.md                  # Frontend documentation
│
├── backend/                       # Backend service (IMPLEMENTED ✅)
│   ├── src/                       # Source code
│   │   ├── server.js              # HTTP/WebSocket server
│   │   ├── app.js                 # Express app configuration
│   │   ├── websocket.js           # WebSocket server
│   │   ├── config/
│   │   │   └── index.js           # Configuration management
│   │   ├── routes/                # API routes
│   │   │   ├── health.js          # Health check
│   │   │   ├── auth.js            # JWT authentication
│   │   │   ├── voice.js           # Voice processing
│   │   │   └── routes.test.js     # Jest tests
│   │   ├── services/              # Business logic
│   │   │   ├── stt.js             # Google/Azure STT
│   │   │   ├── llm.js             # OpenAI LLM
│   │   │   ├── mcp-client.js      # `c4-mcp` HTTP client
│   │   │   └── voice-processor.js # Pipeline orchestration
│   │   ├── middleware/            # Express middleware
│   │   │   ├── auth.js            # JWT validation
│   │   │   └── errorHandler.js    # Error handling
│   │   └── utils/                 # Utilities
│   │       ├── logger.js          # Winston logging
│   │       └── errors.js          # Structured errors
│   ├── scripts/                   # Utility scripts
│   │   ├── health-check.js        # Health monitoring (Node.js)
│   │   └── health-check.sh        # Health monitoring (Shell)
│   ├── package.json               # Dependencies (pure JS only)
│   ├── .env.example               # Environment template
│   ├── .eslintrc.json             # Linting rules
│   ├── jest.config.js             # Test config
│   └── README.md                  # Backend docs
│
├── scripts/                       # Deployment scripts (IMPLEMENTED ✅)
│   ├── deploy-backend.sh          # Synology backend deployment
│   ├── deploy-frontend.sh         # Synology frontend deployment
│   └── README.md                  # Deployment instructions
│
├── .gitignore                     # Git ignore rules
├── README.md                      # Project README with quick start
└── LICENSE                        # License file
```

---

## 4. Module Inventory {#modules}

### 4.1 PWA Frontend Module

| Property | Value |
|----------|-------|
| **Name** | PWA Frontend |
| **Purpose** | Mobile-optimized user interface for voice/text interaction |
| **Inputs** | User voice (audio), user text, WebSocket messages |
| **Outputs** | HTTP/HTTPS requests, WebSocket messages, UI updates |
| **Boundaries** | Runs in mobile browser sandbox; no direct Control4 access |
| **Upstream** | User interaction |
| **Downstream** | Backend Service API |
| **Key Technologies** | Vanilla JS/React/Vue, MediaRecorder API, WebAudio (WAV fallback), WebSocket API, Service Workers |

### 4.2 Backend Service Module

| Property | Value |
|----------|-------|
| **Name** | Backend Service |
| **Purpose** | API gateway, intent parsing, MCP command translation |
| **Inputs** | HTTP requests (voice audio, chat text), WebSocket connections |
| **Outputs** | HTTP responses, WebSocket messages, MCP commands |
| **Boundaries** | Runs on DS218+ as persistent process; no GPU or heavy ML |
| **Upstream** | PWA Frontend, Cloud STT, Cloud LLM |
| **Downstream** | MCP Server |
| **Key Technologies** | Node.js (Express), WebSocket library |

### 4.3 MCP Client Module

| Property | Value |
|----------|-------|
| **Name** | MCP Client |
| **Purpose** | Translate intents to `c4-mcp` HTTP tool calls for Control4 |
| **Inputs** | Structured tool plans (`{ tool, args }`), correlationId, and a stable session id (deviceId) |
| **Outputs** | `c4-mcp` tool call responses, ambiguity/clarification candidates |
| **Boundaries** | Stateless command translator; no business logic |
| **Upstream** | Backend Service (LLM output) |
| **Downstream** | MCP Server |
| **Key Technologies** | HTTP fetch client, JSON serialization |

### 4.4 Cloud Integration Module

| Property | Value |
|----------|-------|
| **Name** | Cloud Integration |
| **Purpose** | Interface with external STT and LLM APIs |
| **Inputs** | Audio blobs (for STT), text prompts (for LLM) |
| **Outputs** | Transcribed text, parsed intents with parameters |
| **Boundaries** | External API calls; must handle rate limits and failures |
| **Upstream** | Backend Service |
| **Downstream** | Cloud providers (Google/OpenAI/etc) |
| **Key Technologies** | HTTP clients, API SDKs, retry logic |

### 4.5 Authentication Module

| Property | Value |
|----------|-------|
| **Name** | Authentication |
| **Purpose** | Secure access to backend APIs |
| **Inputs** | Auth tokens, device IDs, passkeys |
| **Outputs** | Session tokens, auth validation results |
| **Boundaries** | Home-grade security; not enterprise SSO |
| **Upstream** | PWA Frontend |
| **Downstream** | All Backend Service endpoints |
| **Key Technologies** | JWT, device fingerprinting, or simple token auth |

---

## 5. Data & Schemas {#data}

### 5.1 Key Data Structures

**Voice Input Request:**
```json
{
  "audioData": "base64-encoded-audio-blob",
  "format": "webm",
  "sampleRateHertz": 48000
}
```

**Chat Input Request:**
```json
{
  "transcript": "Turn on the living room lights"
}
```

**Intent Object (LLM Output):**
```json
{
  "tool": "c4_room_lights_set",
  "args": {
    "room_name": "Living Room",
    "state": "on"
  }
}
```

**MCP Tool Call (Backend → c4-mcp HTTP):**
```json
{
  "kind": "tool",
  "name": "c4_room_lights_set",
  "args": {
    "room_name": "Living Room",
    "state": "on"
  }
}
```

Session context is provided to `c4-mcp` via the `X-Session-Id` request header (the backend uses the deviceId) so follow-ups can be resolved using tools like `c4_lights_set_last`, `c4_tv_off_last`, and `c4_tv_remote_last`.

For clarification retries, the backend should prefer stable identifiers (e.g., `room_id`) when available rather than re-sending the original ambiguous `room_name`.

**WebSocket Response Stream:**
```json
{
  "type": "connected|processing|transcript|intent|command-complete|remote-context|clarification-required|error",
  "stage": "transcription|intent-parsing|executing",
  "correlationId": "c-...",
  "message": "...",
  "timestamp": "2026-01-19T10:30:01Z"
}
```

### 5.2 Versioning Strategy

- **API Versioning:** URL-based (`/api/v1/*`)
- **Schema Versioning:** Backward-compatible additions; breaking changes require new major version
- **`c4-mcp` contract:** Follow the tool names/args exposed by `c4-mcp` (`/mcp/list`, `/mcp/call`)

---

## 6. API Surface {#api}

### 6.1 REST Endpoints

| Method | Path | Purpose | Auth Required |
|--------|------|---------|---------------|
| POST | `/api/v1/auth/token` | Get a device JWT | No |
| GET | `/api/v1/health` | Health check | No |
| GET | `/api/v1/health/mcp` | Backend → `c4-mcp` connectivity | No |
| POST | `/api/v1/voice/process` | Process a voice audio payload | Yes |
| POST | `/api/v1/voice/process-text` | Process a text command | Yes |

### 6.2 WebSocket Endpoint

| Path | Purpose | Auth Required |
|------|---------|---------------|
| `/ws` | Bidirectional streaming for real-time updates + clarification loop | Yes (query param `token=...`) |

### 6.3 Authentication

- **Method:** Device-based tokens or JWT
- **Token Delivery:** HTTP-only cookie or Bearer token in header
- **Token Expiry:** 30 days (configurable)
- **Renewal:** Automatic refresh or explicit re-auth

### 6.4 Example Request/Response

**POST `/api/v1/voice/process-text`**
```json
Request:
{
  "transcript": "Turn on the basement lights"
}

Response:
{
  "transcript": "Turn on the basement lights",
  "plan": { "tool": "c4_room_lights_set", "args": { "room_name": "Basement", "state": "on" } },
  "command": { "success": true },
  "timestamp": "2026-01-23T12:34:56.000Z"
}
```

---

## 7. Decision Log (ADR-Style) {#decisions}

### ADR-001: Containerized Deployment (Compose)
- **Context:** Need reliable repeatable deployment on the NAS
- **Decision:** Use Synology Container Manager (Docker Compose) as the reference deployment
- **Rationale:** Repeatability, easy rebuild/recreate, clean dependency boundaries
- **Consequences:** Requires Container Manager; container logging/ops conventions apply

### ADR-002: Cloud-Based AI Services
- **Context:** DS218+ cannot run local LLMs or heavy ML workloads
- **Decision:** Use cloud STT (Google/Azure) and a cloud LLM (Gemini current with a locked system prompt; OpenAI optional)
- **Rationale:** Offload compute to cloud; NAS only coordinates
- **Consequences:** Network dependency, API costs, latency ~500-1500ms

### ADR-003: PWA Over Native Apps
- **Context:** Need mobile interface for iOS and Android
- **Decision:** Build Progressive Web App (PWA)
- **Rationale:** Single codebase, no app store approval, easy updates, works on all devices
- **Consequences:** Limited OS integration, requires HTTPS

### ADR-004: WebSocket for Streaming Responses
- **Context:** Need real-time feedback during command execution
- **Decision:** Use WebSocket for bidirectional streaming
- **Rationale:** Low latency, persistent connection, better UX than polling
- **Consequences:** Requires reverse proxy WebSocket support (Synology DSM supports this)

### ADR-005: Node.js for Backend (Tentative)
- **Context:** Need lightweight backend service on DS218+
- **Decision:** Use Node.js over Python for the backend service
- **Rationale:** Lower memory footprint, better async I/O, faster startup
- **Consequences:** Keep service boundaries strict (backend orchestrates; `c4-mcp` owns Control4 integration)

### ADR-006: Home-Grade Security
- **Context:** Private home use, not enterprise
- **Decision:** HTTPS + simple token auth + action logging
- **Rationale:** Balance security and complexity; avoid OAuth/SAML overhead
- **Consequences:** Not suitable for multi-tenant or public deployment

### ADR-007: Keep MCP Strict; Normalize at the Boundary
- **Context:** `c4-mcp` enforces strict tool schemas; schema-invalid calls can fail fast.
- **Decision:** Keep `c4-mcp` strict; implement argument normalization + best-effort preflight/fallback in the backend boundary.
- **Rationale:** Prevent avoidable runtime errors (e.g., missing required args) without weakening the MCP contract.
- **Consequences:** The backend must treat tool schemas as authoritative (`/mcp/list`) and maintain tests for normalization/fallback paths.

---

## 8. Non-Functional Requirements {#nfr}

### 8.1 Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Voice command latency | < 3 seconds (end-to-end) | Includes cloud STT + LLM + MCP execution |
| Text command latency | < 2 seconds | Includes LLM + MCP execution |
| WebSocket latency | < 100ms | Local network only |
| PWA load time | < 2 seconds | On 4G/5G connection |
| Backend memory usage | < 256MB | DS218+ has 2GB RAM total |
| Backend CPU usage | < 20% average | Dual-core Realtek RTD1296 CPU |

### 8.2 Security

- **HTTPS Only:** All traffic encrypted via Let's Encrypt
- **Authentication:** Token-based or passkey-based
- **Authorization:** Single-user or family-based (simple role model)
- **Action Logging:** All commands logged with timestamp, user, device
- **Confirmation Required:** For high-risk actions (locks, garage, alarm)
- **API Rate Limiting:** Prevent abuse (e.g., 60 requests/minute per device)

### 8.3 Scalability

- **User Concurrency:** 1-5 concurrent users (home environment)
- **Device Count:** Support up to 50 Control4 devices
- **Historical Logs:** Retain 90 days of action logs

### 8.4 Reliability

- **Uptime Target:** 99% (home-grade, not enterprise SLA)
- **Graceful Degradation:** If cloud APIs fail, show clear error; don't crash
- **Retry Logic:** Automatic retry for transient cloud API failures
- **Health Monitoring:** `/api/v1/health` endpoint for uptime checks

### 8.5 Observability

- **Logging:** Structured JSON logs with levels (DEBUG, INFO, WARN, ERROR)
- **Metrics:** Basic metrics (request count, latency, error rate)
- **Dashboards:** Optional simple dashboard (e.g., Grafana Lite or text logs)
- **Alerts:** Email/push notification for critical errors (optional)

---

## 9. Testing Strategy {#testing}

### 9.1 Unit Tests

- **Coverage Goal:** 70% for backend services
- **Framework:** Jest (Node.js) or pytest (Python)
- **Focus Areas:** Intent parsing, MCP command translation, error handling

### 9.2 Integration Tests

- **Coverage:** API endpoints, WebSocket connections, MCP integration
- **Environment:** Local dev environment with mock MCP server
- **Tools:** Supertest (Node.js) or httpx (Python), WebSocket test client

### 9.3 End-to-End Tests

- **Coverage:** Full user flows (voice command → Control4 action)
- **Environment:** Staging environment with real MCP server (if available)
- **Tools:** Playwright or Cypress for PWA testing

### 9.4 Manual Testing

- **Device Testing:** Test PWA on iOS Safari, Android Chrome
- **Voice Input:** Test in noisy environments, different accents
- **Network Conditions:** Test on slow/unreliable networks

### 9.5 Performance Testing

- **Load Testing:** Simulate 5 concurrent users
- **Memory Profiling:** Ensure backend stays under 256MB
- **Latency Testing:** Measure end-to-end command execution time

---

## 10. Operational Runbook {#ops}

### 10.1 Environments

| Environment | Purpose | Access |
|-------------|---------|--------|
| Development | Local laptop | `http://localhost:3000` |
| Staging | DS218+ test instance | `https://staging.home.local` |
| Production | DS218+ production | `https://home.yourdomain.com` |

### 10.2 Deployment Steps (Synology DS218+)

1. **Enable Web Station:**
   - Open DSM → Web Station → Enable Web Station
  - Create virtual host for PWA (document root: `/volume1/web`)

2. **Deploy PWA:**
  - Upload `frontend/` contents to `/volume1/web`
   - Verify access: `http://<NAS_IP>:80`

3. **Install Backend Dependencies:**
   - SSH to NAS: `ssh admin@<NAS_IP>`
   - Install Node.js via Synology Package Center or manual install
   - Navigate to backend: `cd /volume1/apps/c4-mcp-app/backend`
  - Install dependencies: `npm install`

4. **Configure Environment Variables:**
   - Create `.env` only if missing (avoid overwriting an existing file):
     - `test -f .env || cp .env.example .env`
   - Set STT provider keys (`GOOGLE_STT_API_KEY` / `AZURE_STT_KEY` / `AZURE_STT_REGION`), `OPENAI_API_KEY`, and `C4_MCP_BASE_URL` (+ `C4_MCP_TIMEOUT_MS`)

  If deploying via **Synology Container Manager (Compose)**, prefer an `env_file` that points at a stable secrets file outside any repo checkout (recommended) and skip the Task Scheduler/native process steps below.

5. **Create Startup Script:**
   - Save to `/volume1/apps/c4-mcp-app/scripts/start-backend.sh`:
     ```bash
     #!/bin/bash
     cd /volume1/apps/c4-mcp-app/backend
     /usr/local/bin/node src/server.js >> /var/log/c4-mcp-app.log 2>&1
     ```
   - Make executable: `chmod +x start-backend.sh`

6. **Configure Task Scheduler:**
   - Open DSM → Control Panel → Task Scheduler
   - Create → Triggered Task → User-defined script
   - Event: Boot-up
   - Script: `/volume1/apps/c4-mcp-app/scripts/start-backend.sh`

7. **Configure Reverse Proxy:**
   - Open DSM → Control Panel → Login Portal → Advanced → Reverse Proxy
   - Create rules:
     - Source: `https://home.yourdomain.com/` → Destination: `http://localhost:80` (PWA)
     - Source: `https://home.yourdomain.com/api/*` → Destination: `http://localhost:3002` (Backend)
   - Enable WebSocket support for `/ws`

8. **Configure Let's Encrypt:**
   - Open DSM → Control Panel → Security → Certificate
   - Add → Add new certificate → Get certificate from Let's Encrypt
   - Domain: `home.yourdomain.com`
   - Apply certificate to reverse proxy

9. **Verify Deployment:**
   - Access PWA: `https://home.yourdomain.com`
   - Check health: `https://home.yourdomain.com/api/v1/health`
   - Monitor logs: `tail -f /var/log/c4-mcp-app.log`

### 10.3 Secrets Management

- **Compose (recommended):** store secrets in a stable external env file referenced via `env_file` (e.g., `/volume1/dockerc4-mcp/c4-voice-secrets/backend.env`).
  - Restrict permissions (example): `chmod 400 backend.env`
  - Keep this file outside any repo checkout so deploys can't overwrite it.
- **Legacy native Node:** store secrets in `backend/.env` on the NAS.
  - Restrict permissions: `chmod 600 .env`
- Never commit secrets files to Git.

### 10.4 Configuration

- **Backend Port:** 3002 (configurable in env)
- **WebSocket Port:** Same as backend (3002)
- **Log Level:** `INFO` (production), `DEBUG` (development)
- **Session Timeout:** 30 days

### 10.5 Alerts & Monitoring

- **Health Check:** Cron job pings `/api/v1/health` every 5 minutes
- **Log Monitoring:** Script checks for ERROR-level logs; sends email if found
- **Disk Space:** Monitor `/volume1/apps/c4-mcp-app/` for log file growth

### 10.6 SLIs/SLOs

| SLI | Target (SLO) | Measurement |
|-----|--------------|-------------|
| API availability | 99% uptime | Health check endpoint |
| Command success rate | 95% | Successful MCP executions / total commands |
| P95 latency (voice) | < 3 seconds | Time from audio upload to execution complete |
| P95 latency (text) | < 2 seconds | Time from text submit to execution complete |

---

## 11. Coding Conventions {#conventions}

### 11.1 Language & Style

- **JavaScript:** ES6+ (Node.js 18+ compatible), ESLint (Airbnb style), Prettier for formatting
- **Node.js Version:** v22 (Synology), code compatible with v18+
- **Dependencies:** Avoid native addons; use pure JavaScript packages
- **Python:** Python 3.9+, PEP 8, Black for formatting, type hints (if needed)
- **HTML/CSS:** BEM naming convention, mobile-first responsive design

### 11.2 Directory Naming

- Use lowercase with hyphens: `mcp-client/`, `error-handler.js`
- Avoid abbreviations unless widely understood (e.g., `api/` is OK, `mcp/` is OK)

### 11.3 File Naming

- **Frontend:** `kebab-case.js` (e.g., `audio-recorder.js`)
- **Backend:** `kebab-case.js` or `snake_case.py` (e.g., `stt-service.js`, `llm_service.py`)
- **Config:** `kebab-case.json` or `UPPERCASE.env` (e.g., `.env`)

### 11.4 Error Handling

- **Backend:** Use structured error objects with `code`, `message`, `details`
- **Frontend:** Display user-friendly messages; log details to console
- **Logging:** Include request ID for traceability

### 11.5 Logging

- **Levels:** DEBUG, INFO, WARN, ERROR
- **Format:** Structured JSON logs
- **Fields:** `timestamp`, `level`, `message`, `request_id`, `user_id`, `action`
- **Example:**
  ```json
  {
    "timestamp": "2026-01-19T10:30:00Z",
    "level": "INFO",
    "message": "Voice command processed",
    "request_id": "req-xyz789",
    "device_id": "mobile-abc123",
    "action": "turn_on",
    "device": "living_room_lights",
    "latency_ms": 1523
  }
  ```

### 11.6 Testing

- **Test File Naming:** `module-name.test.js` or `test_module_name.py`
- **Test Structure:** Arrange-Act-Assert pattern
- **Mocking:** Use `jest.mock()` or `unittest.mock` for external dependencies

### 11.7 Git Conventions

- **Branches:** `main`, `dev`, `feature/<name>`, `fix/<name>`
- **Commit Messages:** 
  ```
  type(scope): subject
  
  body (optional)
  ```
  Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **PR Template:** Include What/Why/How, test results, screenshots (for UI changes)

---

## 12. Current Risks/Unknowns and Assumptions {#risks}

### 12.1 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | DS218+ CPU/RAM insufficient | Medium | High | Monitor resource usage; optimize backend; consider external hosting if needed |
| R2 | Cloud API rate limits | Medium | Medium | Implement caching; add retry logic; budget for API costs |
| R3 | MCP server compatibility issues | High | High | Early integration testing; document MCP server version requirements |
| R4 | Voice input poor quality in noisy environments | Medium | Medium | Add noise cancellation preprocessing or choose better STT provider |
| R5 | Let's Encrypt certificate renewal failure | Low | Medium | Automate renewal checks; set up alert |
| R6 | WebSocket connection drops | Medium | Medium | Implement reconnection logic with exponential backoff |
| R7 | HTTPS access outside home network | Medium | Low | Document VPN setup or use Synology QuickConnect |

### 12.2 Unknowns

- **Cloud STT accuracy and latency:** Real-world performance varies by device, mic, and environment
- **Cloud LLM variability:** Rare edge cases where the model proposes incorrect or incomplete tool args
- **Reverse proxy behavior under load:** WebSocket upgrades/timeouts vary by DSM configuration and networks
- **Cloud API costs:** Exact cost per command depends on usage patterns and model/provider

### 12.3 Assumptions

- User has basic technical knowledge (can SSH, edit config files)
- MCP server is already running and accessible on local network
- Home network has reliable internet connection (for cloud APIs)
- User's phone has modern browser (iOS Safari 14+, Android Chrome 90+)
- User accepts ~1-3 second latency for voice commands
- User has registered domain name (for Let's Encrypt HTTPS)

---

## 13. Roadmap {#roadmap}

### 13.1 Short-Term (0–2 Weeks)

- [x] Initialize project repository and documentation
- [x] Design REST API contract and WebSocket protocol
- [x] Create basic PWA shell (HTML, CSS, JS scaffolding)
- [x] Implement backend service scaffold (Node.js)
- [x] Integrate cloud STT API
- [x] Integrate cloud LLM API
- [x] Create MCP client module
- [ ] Implement voice input in PWA (MediaRecorder + WAV fallback)
- [x] Implement voice input in PWA (MediaRecorder + WAV fallback)
- [x] Deploy MVP to Synology DS218+ (Container Manager / Compose)

### 13.2 Mid-Term (2–8 Weeks)

- [ ] Refactor toward a more “typical MCP” app layout (clearer domain modules, smaller files, stricter contracts) without breaking the existing external API/WS protocol. Start from current known-good HEAD; tag/branch a refactor baseline first for rollback/diffing; refactor in small slices and keep Jest + ESLint green after each slice.
- [ ] Add device discovery and status endpoints
- [ ] Implement confirmation flow for high-risk actions (locks, garage)
- [ ] Add action logging and history view in PWA
- [ ] Add push notifications for device status changes
- [ ] Optimize voice recognition for home-specific vocabulary
- [ ] Create admin panel for configuration
- [ ] Add telemetry and performance monitoring
- [ ] Implement scheduled commands (automations)

### 13.4 Long-Term (2+ Months)

- [ ] Add support for custom voice commands (user-defined phrases)
- [ ] Implement multi-user support (family accounts)
- [ ] Add dashboard for device status and history
- [ ] Optimize voice recognition for home-specific vocabulary
- [ ] Add push notifications for device status changes
- [ ] Implement scheduled commands (automations)
- [ ] Create admin panel for configuration
- [ ] Add telemetry and performance monitoring
- [ ] Write user documentation and setup guide
- [ ] Explore offline fallback (local STT/LLM if possible)

---

## 14. Glossary {#glossary}

| Term | Definition |
|------|------------|
| **PWA** | Progressive Web App; web application that works like a native app |
| **MCP** | Model Context Protocol; protocol for integrating AI models with tools/APIs |
| **Control4** | Home automation system for controlling lights, thermostats, AV, etc. |
| **DS218+** | Synology DiskStation 218+; 2-bay NAS with Realtek RTD1296 CPU, 2GB RAM |
| **DSM** | DiskStation Manager; Synology's NAS operating system |
| **Web Station** | Synology package for hosting websites on NAS |
| **Task Scheduler** | Synology DSM tool for running scripts on schedule or boot |
| **Reverse Proxy** | Synology DSM feature for routing HTTPS traffic to internal services |
| **Let's Encrypt** | Free, automated certificate authority for HTTPS certificates |
| **STT** | Speech-to-Text; converts audio to text (e.g., Google Speech-to-Text) |
| **LLM** | Large Language Model; AI for natural language understanding (e.g., `gpt-4o-mini`) |
| **WebSocket** | Protocol for bidirectional, real-time communication over HTTP |
| **JWT** | JSON Web Token; standard for secure token-based authentication |
| **Intent** | Parsed user command (action + device + parameters) |
| **ADR** | Architecture Decision Record; documents key technical decisions |
| **SLI** | Service Level Indicator; measurable metric (e.g., latency, uptime) |
| **SLO** | Service Level Objective; target value for SLI (e.g., 99% uptime) |
| **P95** | 95th percentile; metric excludes worst 5% of values |
| **API Gateway** | Backend service that routes/transforms requests to other services |
| **Device ID** | Unique identifier for user's phone or browser |
| **Session Token** | Short-lived credential for authenticated requests |
| **Push-to-Talk** | Hold button to record audio; release to send |

---

## Document Control

**Maintained by:** Randy Britsch  
**Review Frequency:** After each major feature or architecture change  
**Update Process:** Use Prompt E (Diff-Based Update) from [prompts.md](prompts.md)  
**Related Documents:**
- [Architecture Details](architecture.md)
- [API Specifications](api/endpoints.md)
- [Operations Runbook](ops/runbook.md)
- [Bootstrap Summary](bootstrap_summary.md)
- [Task Scheduler Setup](../TASK_SCHEDULER_SETUP.md)
- [API Keys Guide](../API_KEYS.md)
- [Deployment Complete](../DEPLOYMENT_COMPLETE.md)

**Change History:**
- 2026-01-19: Initial creation (v1.0.0)
- 2026-01-19: Implementation complete - Full application built
  - Backend: Node.js v22 with Express, WebSocket, STT/LLM/MCP services
  - Frontend: PWA with voice recording, Service Worker, offline support
  - Infrastructure: JWT auth, Winston logging, Jest testing (6 tests passing)
  - Deployment: Synology scripts, health checks, comprehensive documentation
  - Status: Ready for production deployment
- 2026-01-20: Production deployment completed
  - (Legacy) Native DSM deployment notes (Web Station/Task Scheduler)

- 2026-01-23: Reference deployment updated
  - **Deployment**: Synology Container Manager (Compose project)
  - **Backend**: `http://<NAS_IP>:3002`
  - **Control4 bridge**: `c4-mcp` via `C4_MCP_BASE_URL` (e.g., `http://<NAS_IP>:3333`)
  - **LLM**: OpenAI; tested with `gpt-4o-mini`
  - **Feature**: interactive ambiguity clarification loop (`clarification-required` / `clarification-choice`)

- 2026-01-26: Baseline stabilization
  - **Clarification**: prefer stable IDs (e.g., `room_id`) on retry to reduce repeated prompts
  - **Quality**: Jest tests + lint kept green; ignore rules updated to avoid committing NAS staging/snapshots
  - **Ops**: runbook refined for NAS debugging workflows

---

*This document is a living artifact. Keep it updated as the system evolves.*

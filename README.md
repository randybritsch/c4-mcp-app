# C4-MCP-App - Voice-Controlled Smart Home Interface

Voice-controlled smart home interface for Control4 automation via a Progressive Web App (PWA) + Node.js backend, typically deployed on a Synology NAS and calling the `c4-mcp` HTTP server.

## Non-negotiable rules

1) **`c4-mcp` must always be decoupled from `c4-mcp-app`.**
  - The boundary is HTTP only (`C4_MCP_BASE_URL`), with no shared code.

2) **Gemini (the AI) makes the decisions; `c4-mcp` executes.**
  - The backend interprets user commands (intent → tool selection → args) using Gemini.
  - The backend then calls `c4-mcp` tools to carry out the plan.

## Project Structure

```
c4-mcp-app/
├── backend/                 # Node.js backend service
│   ├── src/
│   │   ├── config/         # Configuration management
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic (STT, LLM, MCP)
│   │   ├── utils/          # Utilities (logger, errors)
│   │   ├── app.js          # Express app setup
│   │   ├── server.js       # Server entry point
│   │   └── websocket.js    # WebSocket server
│   ├── scripts/            # Deployment and utility scripts
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── frontend/                # PWA frontend
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript modules
│   ├── icons/              # PWA icons (generate these)
│   ├── index.html
│   ├── manifest.json       # PWA manifest
│   └── service-worker.js   # Service worker
│
├── docs/                    # Comprehensive documentation
│   ├── architecture.md
│   ├── project_overview.md
│   ├── bootstrap_summary.md
│   ├── conventions_guardrails.md
│   ├── modules/
│   ├── api/
│   ├── data/
│   ├── ops/
│   └── ...
│
└── scripts/                 # Deployment scripts
    ├── deploy-backend.sh
    └── deploy-frontend.sh
```

## Quick Start

### Prerequisites

- **Synology DS218+** with DSM 7.x
- **Node.js v22** (install via Synology Package Center)
- **API Keys:**
  - Google Cloud STT API or Azure Speech Services
  - OpenAI API (tested with `gpt-4o-mini`)
  - Control4 MCP (c4-mcp) configured and reachable

### Backend Setup

```bash
cd backend
npm install
# First run only (avoid overwriting an existing .env)
test -f .env || cp .env.example .env
# Edit .env with your API keys / endpoints
npm start
```

### Frontend Setup

Simply copy the frontend files to your Synology Web Station directory:

```bash
# See scripts/deploy-frontend.sh for detailed instructions
```

### Development Mode

```bash
# Backend (with auto-reload)
cd backend
npm run dev

# Frontend
# Serve frontend/ directory with any static file server
# or open index.html directly in browser
```

## Testing

```bash
cd backend
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Deployment to Synology DS218+

See detailed deployment instructions:
- [Backend Deployment](scripts/deploy-backend.sh)
- [Frontend Deployment](scripts/deploy-frontend.sh)
- [Operational Runbook](docs/ops/runbook.md)

Notes:

- The current reference deployment uses **Synology Container Manager** with a Docker Compose project (see `compose.nas.yaml`).
- The backend talks to `c4-mcp` as a separate HTTP service via `C4_MCP_BASE_URL` (no shared code required).
- Typical LAN ports in this setup:
  - Backend: `http://<NAS_IP>:3002`
  - c4-mcp: `http://<NAS_IP>:3334`

## API Documentation

- **REST API:** See [docs/api/endpoints.md](docs/api/endpoints.md)
- **WebSocket:** Real-time streaming voice commands at `/ws?token=...`
- **Authentication:** JWT tokens (set `JWT_EXPIRY=never` for non-expiring)

## Architecture

- **Frontend:** PWA with MediaRecorder API for voice capture
- **Backend:** Node.js Express service orchestrating:
  1. Speech-to-Text (Google/Azure)
  2. Intent Parsing (OpenAI; tested with `gpt-4o-mini`)
  3. Command Execution (Control4 MCP via `c4-mcp` HTTP)
- **Disambiguation UX:** when Control4 name resolution is ambiguous (e.g., multiple “Basement” rooms), the UI prompts for a choice and retries deterministically.
- **Deployment:** Synology Container Manager (Docker Compose) is the reference setup; native process deployment is also possible.

## Key Features

✅ Voice-controlled smart home commands  
✅ Real-time WebSocket streaming  
✅ Offline-first PWA with Service Worker  
✅ JWT authentication  
✅ Structured logging with Winston  
✅ Comprehensive error handling  
✅ Interactive disambiguation (“Which Basement?”)  
✅ Rate limiting and security  
✅ 80%+ test coverage  

## Documentation

Complete documentation is available in the `/docs` folder:

- [Project Overview](docs/project_overview.md) - Single source of truth (14 sections)
- [Architecture](docs/architecture.md) - Component diagrams and tradeoffs
- [Bootstrap Summary](docs/bootstrap_summary.md) - Quick context reload
- [Conventions & Guardrails](docs/conventions_guardrails.md) - Coding standards
- [Modules](docs/modules/) - Detailed module specifications
- [API Reference](docs/api/endpoints.md) - Complete API documentation
- [Operational Runbook](docs/ops/runbook.md) - Deployment and monitoring

## Contributing

This is a personal project for Control4 home automation. See [docs/conventions_guardrails.md](docs/conventions_guardrails.md) for coding standards.

## License

MIT

## Author

Randy Britsch

---

**Tech Stack:** Node.js v22, Express.js, WebSocket, PWA (HTML/CSS/JS), Google/Azure STT, OpenAI (`gpt-4o-mini`), Control4 MCP (`c4-mcp`)  
**Platform:** Synology DS218+ (2GB RAM, dual-core Realtek RTD1296)  
**Deployment:** Synology Container Manager (Docker Compose). Native Synology tools (Web Station / Task Scheduler) are legacy.

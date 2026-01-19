# C4-MCP-App - Voice-Controlled Smart Home Interface

Voice-controlled smart home interface for Control4 automation via Progressive Web App, running on Synology DS218+ NAS.

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
  - OpenAI API or Anthropic API
  - Control4 MCP credentials

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys
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

## API Documentation

- **REST API:** See [docs/api/endpoints.md](docs/api/endpoints.md)
- **WebSocket:** Real-time streaming voice commands
- **Authentication:** JWT tokens (7-day expiry)

## Architecture

- **Frontend:** PWA with MediaRecorder API for voice capture
- **Backend:** Node.js Express service orchestrating:
  1. Speech-to-Text (Google/Azure)
  2. Intent Parsing (OpenAI GPT-4/Anthropic Claude)
  3. Command Execution (Control4 MCP)
- **Deployment:** Synology-native (no Docker required)

## Key Features

✅ Voice-controlled smart home commands  
✅ Real-time WebSocket streaming  
✅ Offline-first PWA with Service Worker  
✅ JWT authentication  
✅ Structured logging with Winston  
✅ Comprehensive error handling  
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

**Tech Stack:** Node.js v22, Express.js, WebSocket, PWA (HTML5/CSS3/JS), Google STT, OpenAI GPT-4, Control4 MCP  
**Platform:** Synology DS218+ (2GB RAM, dual-core Realtek RTD1296)  
**Deployment:** Native Synology tools (Web Station, Task Scheduler, Reverse Proxy)

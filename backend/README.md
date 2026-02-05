# C4-MCP-App Backend

Backend service for voice-controlled smart home Control4 automation.

## Quick Start

### Prerequisites
- Node.js v18+ (v22 recommended for production on Synology DS218+)
- npm or pnpm

### Installation

```bash
cd backend
npm install
```

### Configuration

```bash
test -f .env || cp .env.example .env
# Edit .env with your API keys and configuration
```

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Linting & Formatting

```bash
npm run lint          # Lint and fix
npm run format        # Format code
```

## API Endpoints

- `GET /api/v1/health` - Health check
- `POST /api/v1/auth/token` - Get JWT token
- `POST /api/v1/voice/process` - Process voice command (sync)
- `WS /ws` - WebSocket for streaming voice commands

See [/docs/api/endpoints.md](../docs/api/endpoints.md) for full API documentation.

## Architecture

See [/docs/architecture.md](../docs/architecture.md) and [/docs/modules/backend-service.md](../docs/modules/backend-service.md) for detailed architecture documentation.

## Deployment

See [/docs/ops/runbook.md](../docs/ops/runbook.md) for Synology DS218+ deployment instructions.

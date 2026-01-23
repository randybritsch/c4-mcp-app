# NAS Docker Stack (c4-mcp + backend)

This repo includes a Synology Container Manager-ready stack that runs:
- `c4-mcp` HTTP server on port `3334` (host) → `3333` (container)
- `c4-mcp-app` backend on port `3002` (host) → `3000` (container)

## Files
- `compose.nas.yaml` — compose stack definition
- `backend/Dockerfile` — backend container build (build from local repo checkout)
- `nas/c4-mcp/` — c4-mcp container wrapper + config mount (installs `c4-mcp` from its own GitHub repo)
- `nas/backend/.env.example` — backend environment template
- `nas/backend/Dockerfile.githubzip` — backend build that pulls source from GitHub zip (useful when only the compose project exists on the NAS)

## Configure
1. Copy `nas/backend/.env.example` to `nas/backend/.env` and fill in API keys.
2. Copy your `c4-mcp` Control4 credentials config to `nas/c4-mcp/config/config.json`.
	- This file is local to the NAS project folder and should never be committed to Git.

## Run
In Container Manager, import the project and start it.

## Verify
- Backend health: `http://<NAS-IP>:3002/api/v1/health`
- Backend MCP health: `http://<NAS-IP>:3002/api/v1/health/mcp`
- c4-mcp tools: `http://<NAS-IP>:3334/mcp/list`

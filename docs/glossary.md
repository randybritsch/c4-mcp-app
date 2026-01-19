# Glossary

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

> [← Back to Project Overview](../project_overview.md)

---

## Table of Contents

- [General Terms](#general)
- [Architecture & Infrastructure](#architecture)
- [Technologies & Standards](#technologies)
- [Performance & Monitoring](#performance)
- [Security & Authentication](#security)
- [Home Automation](#home-automation)

---

## General Terms {#general}

### C4-MCP-App

The name of this project. A phone-based smart home interface that uses a Progressive Web App to control Control4 devices via natural language commands, coordinated through an MCP server.

### PWA (Progressive Web App)

A web application that uses modern web capabilities to deliver an app-like experience to users. Can be installed on a device's home screen, works offline (via Service Worker), and is responsive across devices.

### Backend Service

The Node.js server application running on the Synology DS218+ that orchestrates speech-to-text, natural language understanding, and MCP command execution. Acts as the API gateway between the PWA frontend and external services.

### Frontend

The user-facing Progressive Web App (PWA) that runs in a mobile browser. Provides the chat interface, voice input, and displays status updates.

---

## Architecture & Infrastructure {#architecture}

### Synology DS218+

A 2-bay Network Attached Storage (NAS) device with a dual-core Realtek RTD1296 CPU (1.4 GHz) and 2GB RAM. Used as the hosting platform for both the PWA static files and the backend service.

### DSM (DiskStation Manager)

Synology's Linux-based operating system for NAS devices. Provides Web Station, Reverse Proxy, Task Scheduler, and other management tools.

### Web Station

A Synology DSM package for hosting websites and web applications. Used to serve the PWA static files (HTML, CSS, JavaScript).

### Reverse Proxy

A Synology DSM feature that routes incoming HTTPS requests to internal services. Configured to:
- Route `/` to Web Station (PWA)
- Route `/api/*` to Backend Service (port 3001)
- Terminate SSL/TLS (Let's Encrypt certificates)
- Support WebSocket connections

### Task Scheduler

A Synology DSM tool for running scripts on a schedule or at system boot. Used to automatically start the backend service when the NAS boots.

### Let's Encrypt

A free, automated Certificate Authority that provides SSL/TLS certificates for HTTPS. Integrated with Synology DSM for easy certificate management and auto-renewal.

---

## Technologies & Standards {#technologies}

### MCP (Model Context Protocol)

A protocol for integrating AI models with external tools and APIs. In this project, the MCP server acts as a bridge between our backend service and the Control4 home automation system.

### Control4

A home automation platform that controls lighting, climate, security, audio/video, and other smart home devices. Commands are sent via the MCP server.

### STT (Speech-to-Text)

The process of converting spoken audio into text. This project uses cloud-based STT services like Google Speech-to-Text or Azure Speech.

### LLM (Large Language Model)

A type of AI model (e.g., GPT-4, Claude) trained on massive text datasets. Used to understand natural language commands and extract structured intents (action, device, parameters).

### WebSocket

A communication protocol (RFC 6455) that provides full-duplex communication over a single TCP connection. Used for real-time, bidirectional streaming between the PWA and backend service.

### REST (Representational State Transfer)

An architectural style for building web APIs. This project uses RESTful HTTP endpoints (GET, POST) for stateless request/response interactions.

### JWT (JSON Web Token)

A compact, URL-safe token format (RFC 7519) for securely transmitting information between parties. Used for authentication in this project.

### UUID (Universally Unique Identifier)

A 128-bit identifier (e.g., `550e8400-e29b-41d4-a716-446655440000`). Used for device IDs to ensure uniqueness.

### Base64

An encoding scheme that converts binary data (e.g., audio) into ASCII text. Used to transmit audio files in JSON payloads.

### ISO 8601

An international standard for date and time formats (e.g., `2026-01-19T10:30:00Z`). Used for all timestamps in this project.

### Node.js

A JavaScript runtime built on Chrome's V8 engine. This project uses Node.js v22 (provided by Synology Package Center) with code written to be compatible with Node.js 18+ for portability. Used for the backend service due to its low memory footprint and async I/O capabilities.

**Version Strategy:** 
- Production: Node.js v22 (Synology official package)
- Development: Node.js 18+ recommended
- Code Compatibility: All code must work on Node.js 18+
- Dependencies: Pure JavaScript only; avoid native C++ addons

### Express.js / Fastify

Web frameworks for Node.js. Used to build the REST API and WebSocket server in the backend service.

---

## Performance & Monitoring {#performance}

### Latency

The time delay between a user action (e.g., submitting a voice command) and the system response (e.g., lights turn on). Target: <3 seconds for voice, <2 seconds for text.

### P95 (95th Percentile)

A statistical measure where 95% of values fall below the specified threshold. Used for latency targets (e.g., "P95 latency <3s" means 95% of commands complete in under 3 seconds).

### Throughput

The number of requests a system can handle per unit time (e.g., 10 requests/second). Target: 5 concurrent users for this project.

### SLI (Service Level Indicator)

A measurable metric that indicates the health of a service (e.g., uptime, error rate, latency). Used to track system performance.

### SLO (Service Level Objective)

A target value for an SLI (e.g., "99% uptime"). Defines the acceptable level of service quality.

### Health Check

An API endpoint (e.g., `/api/v1/health`) that returns the current status of a service. Used for monitoring and alerting.

### Observability

The ability to understand a system's internal state by examining its external outputs (logs, metrics, traces). Includes logging, monitoring, and debugging tools.

---

## Security & Authentication {#security}

### HTTPS (HTTP Secure)

An extension of HTTP that uses TLS/SSL encryption to secure communication between client and server. Required for this project to protect user commands and credentials.

### TLS/SSL (Transport Layer Security / Secure Sockets Layer)

Cryptographic protocols that provide secure communication over a network. Let's Encrypt provides SSL/TLS certificates for HTTPS.

### Authentication

The process of verifying a user's identity (e.g., via username/password or device token). This project uses JWT tokens for authentication.

### Authorization

The process of determining what actions an authenticated user is allowed to perform. (Not heavily used in this project, as it's single-user/family.)

### Token

A piece of data (e.g., JWT) that represents a user's authenticated session. Included in API requests to prove identity.

### Token Expiry

The time after which a token becomes invalid and must be renewed. Default: 30 days for this project.

### Session

A period of authenticated interaction between a user and the system. Managed via JWT tokens in this project.

### CORS (Cross-Origin Resource Sharing)

A browser security mechanism that controls which domains can make requests to an API. Configured in the backend to allow requests from the PWA.

---

## Home Automation {#home-automation}

### Smart Home

A residence equipped with devices (lights, thermostats, locks, etc.) that can be controlled remotely or automatically.

### Device

A physical smart home component (e.g., light bulb, thermostat, door lock) that can be controlled via the Control4 system.

### Scene

A predefined configuration of multiple devices (e.g., "Movie Night" dims lights, closes blinds, turns on AV). Not directly supported in MVP but could be added later.

### Zone / Room

A logical grouping of devices (e.g., "Living Room" includes lights, thermostat, AV receiver).

### Capability

A feature or action supported by a device (e.g., a light may support `on_off`, `dimming`, `color`).

### State

The current condition of a device (e.g., power: on/off, brightness: 80%, temperature: 72°F).

### Command

An instruction to change a device's state (e.g., "turn on", "set brightness to 50%").

### Intent

A parsed, structured representation of a user's command, extracted by the LLM. Contains `action`, `device`, and `parameters`.

**Example Intent:**
```json
{
  "action": "turn_on",
  "device": "living_room_lights",
  "parameters": { "brightness": 80 }
}
```

### Confirmation Flow

A safety mechanism that requires explicit user approval before executing high-risk commands (e.g., unlocking doors, opening garage, disarming alarm).

---

## Additional Terms

### API Gateway

A server that routes and transforms requests between clients (PWA) and backend services (STT, LLM, MCP). The backend service acts as an API gateway in this project.

### Payload

The data transmitted in an HTTP request or response body (typically JSON).

### Endpoint

A specific URL path on an API that performs a specific function (e.g., `/api/v1/voice`).

### Mock / Stub

A simulated version of a component used for testing (e.g., a mock MCP server that doesn't actually control devices).

### Graceful Degradation

A system's ability to continue operating (possibly with reduced functionality) when some components fail (e.g., if STT fails, show error but don't crash).

### Exponential Backoff

A retry strategy where the delay between retries increases exponentially (e.g., 2s, 4s, 8s). Used for WebSocket reconnection and API retries.

### Rollback

The process of reverting to a previous version of the system after a failed deployment.

### Hot Reload

Automatically restarting a service when code changes are detected (for development only).

### Uptime

The percentage of time a system is operational and available (e.g., 99% uptime = 7.2 hours downtime per month).

### Downtime

The period when a system is unavailable or not functioning correctly.

### Watchdog

A monitoring process that automatically restarts a service if it crashes or becomes unresponsive.

### Cron Job

A scheduled task that runs at specific times or intervals (e.g., health check every 5 minutes).

### Log Rotation

The process of archiving or deleting old log files to prevent disk space exhaustion.

### Environment Variable

A configuration value stored outside the code (e.g., API keys, server URLs). Loaded from a `.env` file in this project.

### Deployment

The process of uploading and starting a new version of the system on the target environment (e.g., Synology DS218+).

### Staging Environment

A pre-production environment used for testing before deploying to production.

### Production Environment

The live system used by end users (e.g., `https://home.yourdomain.com`).

### Localhost

The local computer or server (IP address `127.0.0.1`). Used for development and testing.

### Port

A numbered endpoint for network connections (e.g., port 3001 for backend service, port 443 for HTTPS).

---

## Acronyms Quick Reference

| Acronym | Full Term | Category |
|---------|-----------|----------|
| **ADR** | Architecture Decision Record | Documentation |
| **API** | Application Programming Interface | Technology |
| **CORS** | Cross-Origin Resource Sharing | Security |
| **CPU** | Central Processing Unit | Hardware |
| **DSM** | DiskStation Manager | Infrastructure |
| **E2E** | End-to-End | Testing |
| **HTTPS** | HTTP Secure | Security |
| **JWT** | JSON Web Token | Security |
| **LLM** | Large Language Model | AI/ML |
| **MCP** | Model Context Protocol | Protocol |
| **MVP** | Minimum Viable Product | Project Management |
| **NAS** | Network Attached Storage | Hardware |
| **PWA** | Progressive Web App | Technology |
| **RAM** | Random Access Memory | Hardware |
| **REST** | Representational State Transfer | Architecture |
| **SLI** | Service Level Indicator | Monitoring |
| **SLO** | Service Level Objective | Monitoring |
| **SSL** | Secure Sockets Layer | Security |
| **STT** | Speech-to-Text | AI/ML |
| **TLS** | Transport Layer Security | Security |
| **TTI** | Time to Interactive | Performance |
| **UI** | User Interface | Design |
| **URL** | Uniform Resource Locator | Technology |
| **UUID** | Universally Unique Identifier | Data |
| **WS** | WebSocket | Technology |
| **WSS** | WebSocket Secure | Technology |

---

## Related Documents

- [← Project Overview](../project_overview.md)
- [Architecture Details](../architecture.md)
- [API Endpoints](../api/endpoints.md)
- [Module Specifications](../modules/README.md)

---

**Maintained By:** Randy Britsch  
**Last Updated:** January 19, 2026  
**Total Terms:** 60+  

**How to Use This Glossary:**

1. **Reference During Development:** Look up unfamiliar terms or acronyms
2. **Onboarding:** Share with new team members for quick context
3. **Documentation:** Link to specific terms in other docs
4. **Communication:** Use consistent terminology in discussions and PRs

**Suggest New Terms:** If you encounter undefined terms, add them to this glossary via PR.

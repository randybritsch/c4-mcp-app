# Backend Package Configuration

**Project:** C4-MCP-App Backend  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

> [← Back to Backend Module](backend-service.md) | [← Project Overview](../project_overview.md)

---

## package.json

Complete `package.json` for the backend service:

```json
{
  "name": "c4-mcp-app-backend",
  "version": "1.0.0",
  "description": "Backend service for C4-MCP-App smart home control interface",
  "main": "src/server.js",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:health": "node scripts/health-check.js",
    "lint": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.js\""
  },
  "keywords": [
    "control4",
    "mcp",
    "smart-home",
    "voice-control",
    "home-automation"
  ],
  "author": "Randy Britsch",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "eslint": "^8.56.0",
    "eslint-config-airbnb-base": "^15.0.0",
    "eslint-plugin-import": "^2.29.1",
    "prettier": "^3.1.1",
    "supertest": "^6.3.3"
  }
}
```

---

## Dependency Selection Criteria

### ✅ Approved Dependencies (Pure JavaScript)

All dependencies listed above meet these criteria:

1. **Pure JavaScript:** No native C++ addons
2. **Well-Maintained:** Active development, recent updates
3. **Lightweight:** Minimal impact on DS218+ resources
4. **Node.js 18+ Compatible:** Works on Node.js 18.x through 22.x
5. **Battle-Tested:** Wide adoption, stable APIs

### ❌ Dependencies to Avoid

**Native Addons (Require Compilation):**
- `bcrypt` → Use `bcryptjs` (pure JS alternative)
- `sharp` → Use `jimp` or cloud image processing
- `sqlite3` → Use `better-sqlite3` only if absolutely needed (check compatibility)
- `node-sass` → Use `sass` (pure JS, Dart-based)
- `canvas` → Avoid or use cloud-based solution

**Heavy/Unnecessary:**
- `express-session` with stores → Use JWT (stateless)
- `passport` → Use simple JWT auth
- `sequelize`/`typeorm` → No database in MVP
- `axios` → Use native `fetch` (Node.js 18+ has it)

---

## Key Dependencies Explained

### Production Dependencies

#### express (^4.18.2)
- **Purpose:** Web framework for REST API
- **Why:** Mature, well-documented, low overhead
- **Alternatives:** Fastify (slightly faster, but Express is fine for <10 req/sec)

#### ws (^8.16.0)
- **Purpose:** WebSocket server
- **Why:** Pure JavaScript, fast, stable
- **Note:** No native dependencies

#### jsonwebtoken (^9.0.2)
- **Purpose:** JWT token creation and validation
- **Why:** Standard JWT library, widely used
- **Note:** Pure JavaScript implementation

#### dotenv (^16.3.1)
- **Purpose:** Load environment variables from `.env` file
- **Why:** Simple, zero dependencies
- **Usage:** `require('dotenv').config()`

#### winston (^3.11.0)
- **Purpose:** Structured logging
- **Why:** Flexible, supports multiple transports (file, console)
- **Configuration:**
  ```javascript
  const winston = require('winston');
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.File({ filename: '/var/log/c4-mcp-app.log' }),
      new winston.transports.Console()
    ]
  });
  ```

#### cors (^2.8.5)
- **Purpose:** Enable Cross-Origin Resource Sharing
- **Why:** Allow PWA (different origin) to call backend API
- **Configuration:**
  ```javascript
  const cors = require('cors');
  app.use(cors({ origin: '*' })); // Or restrict to specific domains
  ```

#### helmet (^7.1.0)
- **Purpose:** Security middleware (sets HTTP headers)
- **Why:** Protects against common vulnerabilities
- **Usage:** `app.use(helmet())`

#### express-rate-limit (^7.1.5)
- **Purpose:** Rate limiting to prevent abuse
- **Why:** Pure JavaScript, simple configuration
- **Configuration:**
  ```javascript
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60 // 60 requests per minute
  });
  app.use('/api/', limiter);
  ```

### Development Dependencies

#### jest (^29.7.0)
- **Purpose:** Testing framework
- **Why:** Fast, good mocking, built-in coverage
- **Usage:** `npm test`

#### eslint (^8.56.0) + eslint-config-airbnb-base
- **Purpose:** Code linting (enforce style rules)
- **Why:** Catch errors, enforce consistency
- **Configuration:** Create `.eslintrc.json`:
  ```json
  {
    "extends": "airbnb-base",
    "env": {
      "node": true,
      "jest": true
    },
    "rules": {
      "no-console": "off"
    }
  }
  ```

#### prettier (^3.1.1)
- **Purpose:** Code formatting
- **Why:** Automatic formatting, zero config
- **Usage:** `npm run format`

#### supertest (^6.3.3)
- **Purpose:** HTTP assertion library for testing Express APIs
- **Why:** Works well with Jest, simple syntax
- **Example:**
  ```javascript
  const request = require('supertest');
  const app = require('./src/server');
  
  test('GET /api/v1/health returns 200', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
  });
  ```

---

## Cloud SDK Integration

### Google Speech-to-Text

**Option 1: Official SDK (Has Native Dependencies - Avoid)**
```bash
# ❌ DO NOT USE: @google-cloud/speech has native dependencies
npm install @google-cloud/speech
```

**Option 2: REST API via fetch (Recommended)**
```javascript
// ✅ USE THIS: Pure JavaScript, no dependencies
async function transcribeAudio(audioBase64) {
  const response = await fetch(
    `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.STT_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'en-US'
        },
        audio: { content: audioBase64 }
      })
    }
  );
  return response.json();
}
```

### OpenAI API

**Option 1: Official SDK (Pure JavaScript - Safe to Use)**
```bash
# ✅ SAFE: openai SDK is pure JavaScript
npm install openai
```

**Option 2: REST API via fetch (Also Valid)**
```javascript
// ✅ ALSO VALID: Direct REST API call
async function parseIntent(transcript) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Parse Control4 commands...' },
        { role: 'user', content: transcript }
      ]
    })
  });
  return response.json();
}
```

**Recommendation:** Use official `openai` SDK if it's pure JS (check before installing). Otherwise, use fetch.

---

## Installation Instructions

### Initial Setup

```bash
cd backend/
npm install --production
```

### Verify No Native Dependencies

After installation, check for native addons:

```bash
# Check for .node files (native addons)
find node_modules -name "*.node" -type f

# If any .node files found, investigate which package added them
# and replace with pure JavaScript alternative
```

### Development Setup

```bash
cd backend/
npm install  # Includes dev dependencies
```

---

## Dependency Update Strategy

### Regular Updates (Monthly)

```bash
# Check for outdated packages
npm outdated

# Update patch and minor versions (safe)
npm update

# Test thoroughly after update
npm test
```

### Major Version Updates (Quarterly)

```bash
# Check for major updates
npm outdated

# Update one package at a time
npm install express@latest

# Test extensively
npm test
npm run test:coverage

# Deploy to staging first
```

### Security Audits (Weekly)

```bash
# Check for vulnerabilities
npm audit

# Fix automatically (if possible)
npm audit fix

# Review breaking changes before applying
npm audit fix --force  # Use with caution
```

---

## Alternative Package Managers

### Using pnpm (Optional, More Efficient)

If disk space is a concern on DS218+:

```bash
# Install pnpm globally
npm install -g pnpm

# Install dependencies (uses hard links, saves space)
pnpm install --prod

# pnpm is also pure JavaScript, safe to use
```

### Using yarn (Optional)

```bash
# Install yarn
npm install -g yarn

# Install dependencies
yarn install --production
```

**Recommendation:** Stick with `npm` (comes with Node.js) unless you have specific needs.

---

## Related Documents

- [← Backend Service Module](backend-service.md)
- [← Project Overview](../project_overview.md)
- [Operational Runbook](../ops/runbook.md)

---

**Maintained By:** Randy Britsch  
**Last Updated:** January 19, 2026  
**Node.js Compatibility:** 18.x, 20.x, 22.x

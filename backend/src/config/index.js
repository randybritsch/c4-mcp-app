require('dotenv').config();

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  trustProxy: /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY || '').trim()),

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiry: process.env.JWT_EXPIRY || '7d',
  },

  // Speech-to-Text
  stt: {
    provider: process.env.STT_PROVIDER || 'google',
    timeoutMs: parseInt(process.env.STT_TIMEOUT_MS, 10) || 15000,
    google: {
      apiKey: process.env.GOOGLE_STT_API_KEY,
    },
    azure: {
      key: process.env.AZURE_STT_KEY,
      region: process.env.AZURE_STT_REGION || 'eastus',
    },
  },

  // LLM
  llm: {
    provider: process.env.LLM_PROVIDER || 'openai',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS, 10) || 15000,
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229',
    },
  },

  // Optional known scenes list for better LLM recommendations.
  // Configure via SCENE_NAMES (CSV) or SCENE_NAMES_JSON (JSON array of strings).
  scenes: {
    names: (() => {
      const rawJson = String(process.env.SCENE_NAMES_JSON || '').trim();
      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed)) {
            return parsed.map((s) => String(s).trim()).filter(Boolean);
          }
        } catch {
          // ignore
        }
      }

      const rawCsv = String(process.env.SCENE_NAMES || '').trim();
      if (!rawCsv) return [];
      return rawCsv
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    })(),
  },

  // Control4 MCP
  control4: {
    // This backend talks to the c4-mcp HTTP server (not directly to Director).
    // Example: http://192.168.1.50:3333 (NAS/LAN)
    mcpBaseUrl:
      process.env.C4_MCP_BASE_URL
      || process.env.MCP_BASE_URL
      || 'http://127.0.0.1:3333',
    timeoutMs: parseInt(process.env.C4_MCP_TIMEOUT_MS, 10) || 8000,

    // Back-compat env vars (unused by default):
    host: process.env.CONTROL4_HOST,
    port: process.env.CONTROL4_PORT ? parseInt(process.env.CONTROL4_PORT, 10) : undefined,
    apiKey: process.env.CONTROL4_API_KEY,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 60,
  },

  // WebSocket
  websocket: {
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS, 10) || 10,
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 30000,
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};

module.exports = config;

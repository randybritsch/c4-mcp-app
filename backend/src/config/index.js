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
    whisper: {
      // Local Whisper HTTP service (recommended):
      // - Default resolves via docker-compose service name "whisper"
      // - Endpoint expected: POST {baseUrl}/v1/audio/transcriptions (OpenAI-compatible)
      baseUrl:
        (process.env.WHISPER_BASE_URL
          || process.env.STT_WHISPER_BASE_URL
          || 'http://whisper:9000')
          .replace(/\/+$/, ''),
      apiKey: process.env.WHISPER_API_KEY || process.env.STT_WHISPER_API_KEY,
      model: process.env.WHISPER_MODEL || 'base.en',
      language: process.env.WHISPER_LANGUAGE || 'en',
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
    // If enabled, the backend may fall back to a small heuristic parser when the LLM is unavailable.
    // Default is off to preserve the "Gemini decides" contract.
    allowHeuristicsFallback: /^(1|true|yes)$/i.test(String(process.env.LLM_ALLOW_HEURISTICS_FALLBACK || '').trim()),
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    google: {
      // Gemini API key (Google AI Studio). This is NOT the same as GOOGLE_STT_API_KEY.
      apiKey: process.env.GOOGLE_GEMINI_API_KEY,
      // Example models: gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash
      model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash',
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

  // Multi-step “mood” recommendations (non-scene fallback).
  // If enabled, the backend can ask a follow-up (room selection) and then execute a small plan
  // like dimming lights and optionally starting music.
  mood: {
    enabled: /^(1|true|yes)$/i.test(String(process.env.MOOD_PLANS_ENABLED || '').trim()),
    defaultLightLevel: (() => {
      const n = Number(process.env.MOOD_DEFAULT_LIGHT_LEVEL);
      if (!Number.isFinite(n)) return 25;
      return Math.max(0, Math.min(100, Math.round(n)));
    })(),
    music: {
      defaultSourceName: String(
        process.env.MOOD_MUSIC_SOURCE_NAME
          || process.env.DEFAULT_MUSIC_SOURCE_NAME
          || '',
      ).trim(),
      enabled: /^(1|true|yes)$/i.test(String(process.env.MOOD_MUSIC_ENABLED || '').trim()),
    },
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
    // Optional debug/automation hook: allow sending a transcript directly over WS
    // (bypasses STT). Off by default.
    textCommandsEnabled: /^(1|true|yes)$/i.test(String(process.env.WS_TEXT_COMMANDS_ENABLED || '').trim()),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};

module.exports = config;

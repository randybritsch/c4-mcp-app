const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { initWebSocketServer } = require('./websocket');
const { assertLockedGeminiPromptIntegrity } = require('./utils/locked-gemini-prompt');

// Hard fail on startup if the canonical Gemini prompt is missing/modified.
// This prevents accidental edits from silently changing runtime behavior.
try {
  const info = assertLockedGeminiPromptIntegrity();
  logger.info('Locked Gemini prompt verified', info);
} catch (err) {
  logger.error('Locked Gemini prompt verification failed; refusing to start', {
    code: err?.code,
    message: String(err?.message || err),
    details: err?.details,
  });
  process.exit(1);
}

const server = http.createServer(app);

// Initialize WebSocket server
initWebSocketServer(server);

// Start server
server.listen(config.port, config.host, () => {
  logger.info('Server started', {
    port: config.port,
    host: config.host,
    env: config.env,
    nodeVersion: process.version,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

module.exports = server;

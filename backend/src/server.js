const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { initWebSocketServer } = require('./websocket');

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

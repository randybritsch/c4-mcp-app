const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');
const logger = require('./utils/logger');
const { transcribeAudio } = require('./services/stt');
const { parseIntent } = require('./services/llm');
const mcpClient = require('./services/mcp-client');
const roomAliases = require('./services/room-aliases');
const wsMessages = require('./services/ws-messages');
const wsAudioPipeline = require('./services/ws-audio-pipeline');
const wsClarification = require('./services/ws-clarification');
const wsRouter = require('./services/ws-router');
const wsConnection = require('./services/ws-connection');
const { generateCorrelationId } = require('./utils/errors');

let wss = null;
let connectionManager = null;

/**
 * Initialize WebSocket server
 */
function initWebSocketServer(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  connectionManager = wsConnection.createConnectionManager({
    config,
    jwt,
    logger,
    generateCorrelationId,
    wsMessages,
    wsRouter,
    routerDeps: {
      logger,
      wsMessages,
      wsAudioPipeline,
      wsClarification,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    },
  });

  logger.info('WebSocket server initialized', { path: '/ws' });

  wss.on('connection', connectionManager.handleConnection);

  // Heartbeat to detect broken connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        logger.warn('Terminating inactive WebSocket connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, config.websocket.heartbeatInterval);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
}

module.exports = {
  initWebSocketServer,
};

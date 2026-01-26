function createConnectionManager({
  config,
  jwt,
  logger,
  generateCorrelationId,
  wsMessages,
  wsRouter,
  routerDeps,
} = {}) {
  if (!config || !jwt || !logger || !generateCorrelationId || !wsMessages || !wsRouter || !routerDeps) {
    throw new Error('ws-connection: missing dependencies');
  }

  const activeConnections = new Map();

  function handleClose(ws) {
    if (!ws || !ws.correlationId) return;

    activeConnections.delete(ws.correlationId);

    logger.info('WebSocket connection closed', {
      correlationId: ws.correlationId,
      activeConnections: activeConnections.size,
    });
  }

  function handleConnection(ws, req) {
    const correlationId = generateCorrelationId();

    // Check max connections
    if (activeConnections.size >= config.websocket.maxConnections) {
      logger.warn('Max WebSocket connections reached', {
        correlationId,
        maxConnections: config.websocket.maxConnections,
      });
      ws.close(1008, 'Maximum connections reached');
      return;
    }

    // Authenticate
    const token = new URL(req.url, 'ws://localhost').searchParams.get('token');
    if (!token) {
      logger.warn('WebSocket connection rejected: missing token', { correlationId });
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      const user = jwt.verify(token, config.jwt.secret);
      ws.user = user;
      ws.correlationId = correlationId;
      ws.isAlive = true;
      ws.audioChunks = [];

      activeConnections.set(correlationId, ws);

      logger.info('WebSocket connection established', {
        correlationId,
        deviceId: user.deviceId,
        activeConnections: activeConnections.size,
      });

      wsMessages.sendConnected(ws, correlationId);

      // Handle pong responses
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages
      ws.on('message', (data) => wsRouter.handleMessage(ws, data, routerDeps));

      // Handle connection close
      ws.on('close', () => handleClose(ws));

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', {
          correlationId: ws.correlationId,
          error: error.message,
        });
      });
    } catch (error) {
      logger.warn('WebSocket authentication failed', {
        correlationId,
        error: error.message,
      });
      ws.close(1008, 'Invalid token');
    }
  }

  return {
    handleConnection,
    handleClose,
    getActiveConnectionCount: () => activeConnections.size,
  };
}

module.exports = {
  createConnectionManager,
};

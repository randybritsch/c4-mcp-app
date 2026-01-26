const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('./config');
const logger = require('./utils/logger');
const { generateCorrelationId } = require('./utils/errors');
const { transcribeAudio } = require('./services/stt');
const { parseIntent } = require('./services/llm');
const mcpClient = require('./services/mcp-client');

let wss = null;
const activeConnections = new Map();

// Per-client room alias cache:
// After a user clarifies an ambiguous room query (e.g. "Basement"), remember the chosen room_id
// so future commands can skip repeated clarification for the same query.
// Keyed by a best-effort stable client key (deviceId/sub/id/email). In-memory only.
const roomAliasesByClientKey = new Map();

function normalizeRoomQuery(value) {
  return (value || '').toString().trim().toLowerCase();
}

function getClientKey(ws) {
  if (!ws) return null;
  const user = ws.user && typeof ws.user === 'object' ? ws.user : null;
  const rawKey = user?.deviceId || user?.sub || user?.id || user?.email;
  if (!rawKey) return null;
  return String(rawKey);
}

function getClientRoomAliases(clientKey) {
  if (!clientKey) return null;
  const key = String(clientKey);
  let aliases = roomAliasesByClientKey.get(key);
  if (!aliases) {
    aliases = new Map();
    roomAliasesByClientKey.set(key, aliases);
  }
  return aliases;
}

/**
 * Initialize WebSocket server
 */
function initWebSocketServer(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  logger.info('WebSocket server initialized', { path: '/ws' });

  wss.on('connection', handleConnection);

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

/**
 * Handle new WebSocket connection
 */
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

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      correlationId,
      message: 'WebSocket connection established',
    }));

    // Handle pong responses
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data) => handleMessage(ws, data));

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

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(ws, data) {
  try {
    const message = JSON.parse(data.toString());

    logger.debug('WebSocket message received', {
      correlationId: ws.correlationId,
      type: message.type,
    });

    switch (message.type) {
      case 'audio-start':
        ws.audioChunks = [];
        ws.audioFormat = message.format ? String(message.format) : 'webm';
        ws.audioSampleRateHertz = Number.isFinite(Number(message.sampleRateHertz))
          ? Number(message.sampleRateHertz)
          : null;
        ws.send(JSON.stringify({
          type: 'audio-ready',
          message: 'Ready to receive audio',
        }));
        break;

      case 'audio-chunk':
        ws.audioChunks.push(message.data);
        break;

      case 'audio-end':
        await processAudioStream(ws);
        break;

      case 'clarification-choice':
        await handleClarificationChoice(ws, message);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`,
        }));
    }
  } catch (error) {
    logger.error('Error handling WebSocket message', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    ws.send(JSON.stringify({
      type: 'error',
      code: 'MESSAGE_PARSE_ERROR',
      message: error.message,
    }));
  }
}

async function handleClarificationChoice(ws, message) {
  if (!ws.pendingClarification) {
    ws.send(
      JSON.stringify({
        type: 'error',
        code: 'NO_PENDING_CLARIFICATION',
        message: 'No pending clarification. Please try again.',
      }),
    );
    return;
  }

  const { intent, transcript, clarification } = ws.pendingClarification;
  const idx = Number(message.choiceIndex);
  const candidates = (clarification && Array.isArray(clarification.candidates)) ? clarification.candidates : [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
    ws.send(
      JSON.stringify({
        type: 'error',
        code: 'INVALID_CHOICE',
        message: 'Invalid choice index',
      }),
    );
    return;
  }

  const choice = candidates[idx];

  // Remember room clarifications per-device so repeated commands like
  // "Turn on the basement Roku" don't keep asking which "Basement".
  try {
    const kind = clarification && clarification.kind ? String(clarification.kind) : '';
    const query = clarification && clarification.query ? String(clarification.query) : '';
    const normalizedQuery = normalizeRoomQuery(query);
    const clientKey = getClientKey(ws);

    const isRoomKind = kind === 'room' || kind.endsWith('_room') || kind.includes('room');
    const roomId = choice && choice.room_id !== null && choice.room_id !== undefined ? Number(choice.room_id) : null;

    if (isRoomKind && normalizedQuery && clientKey && Number.isFinite(roomId)) {
      const aliases = getClientRoomAliases(clientKey);
      if (aliases) {
        const aliasValue = {
          room_id: roomId,
          room_name: choice.name ? String(choice.name) : null,
        };

        // Store for the clarification query.
        aliases.set(normalizedQuery, aliasValue);

        // Also store for the intent's room_name if it differs (helps with slight prompt variations).
        const intentRoomName = intent && intent.args && typeof intent.args === 'object' ? intent.args.room_name : null;
        const normalizedIntentRoom = normalizeRoomQuery(intentRoomName);
        if (normalizedIntentRoom && normalizedIntentRoom !== normalizedQuery) {
          aliases.set(normalizedIntentRoom, aliasValue);
        }

        logger.info('Stored room alias', {
          correlationId: ws.correlationId,
          clientKey,
          kind,
          query: normalizedQuery,
          room_id: roomId,
          room_name: aliasValue.room_name,
        });
      }
    } else if (isRoomKind && normalizedQuery && !clientKey) {
      logger.debug('Room alias not stored (no stable client key)', {
        correlationId: ws.correlationId,
        kind,
        query: normalizedQuery,
      });
    }
  } catch (e) {
    // Best-effort only; do not block the command flow.
  }

  ws.send(
    JSON.stringify({
      type: 'processing',
      stage: 'executing',
    }),
  );

  const refinedIntent = mcpClient.buildRefinedIntentFromChoice(intent, choice);
  if (!refinedIntent) {
    ws.send(
      JSON.stringify({
        type: 'error',
        code: 'CLARIFICATION_BUILD_FAILED',
        message: 'Could not build refined command',
      }),
    );
    ws.pendingClarification = null;
    return;
  }

  const mcpResult = await mcpClient.sendCommand(refinedIntent, ws.correlationId, ws.user?.deviceId);
  if (mcpResult && mcpResult.clarification) {
    ws.pendingClarification = {
      transcript,
      intent: refinedIntent,
      clarification: mcpResult.clarification,
    };
    ws.send(
      JSON.stringify({
        type: 'clarification-required',
        transcript,
        intent: refinedIntent,
        clarification: mcpResult.clarification,
      }),
    );
    return;
  }

  if (!mcpResult || mcpResult.success !== true) {
    ws.send(
      JSON.stringify({
        type: 'error',
        code: 'COMMAND_FAILED',
        message: 'Command failed',
        details: mcpResult,
      }),
    );
    ws.pendingClarification = null;
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'command-complete',
      result: mcpResult,
      transcript,
      intent: refinedIntent,
    }),
  );
  ws.pendingClarification = null;
}

/**
 * Process accumulated audio stream
 */
async function processAudioStream(ws) {
  if (!ws.audioChunks || ws.audioChunks.length === 0) {
    ws.send(JSON.stringify({
      type: 'error',
      code: 'NO_AUDIO_DATA',
      message: 'No audio data received',
    }));
    return;
  }

  try {
    // Combine audio chunks
    const audioData = ws.audioChunks.join('');

    logger.info('Processing audio stream', {
      correlationId: ws.correlationId,
      chunks: ws.audioChunks.length,
      totalSize: audioData.length,
    });

    // Step 1: Transcription
    ws.send(JSON.stringify({
      type: 'processing',
      stage: 'transcription',
    }));

    const format = ws.audioFormat ? String(ws.audioFormat) : 'webm';
    const sampleRateHertz = Number.isFinite(Number(ws.audioSampleRateHertz))
      ? Number(ws.audioSampleRateHertz)
      : undefined;
    const sttResult = await transcribeAudio(audioData, format, ws.correlationId, sampleRateHertz);

    ws.send(JSON.stringify({
      type: 'transcript',
      transcript: sttResult.transcript,
      confidence: sttResult.confidence,
    }));

    // Step 2: Intent parsing
    ws.send(JSON.stringify({
      type: 'processing',
      stage: 'intent-parsing',
    }));

    const intent = await parseIntent(sttResult.transcript, ws.correlationId);

    // Best-effort room aliasing: if the user previously clarified an ambiguous room query
    // (e.g. "Basement" -> room_id 455), reuse that selection for future commands.
    try {
      const tool = intent && typeof intent === 'object' ? String(intent.tool || '') : '';
      const args = intent && typeof intent === 'object' && intent.args && typeof intent.args === 'object'
        ? intent.args
        : null;
      const clientKey = getClientKey(ws);

      if (tool === 'c4_tv_watch_by_name' && args && !('room_id' in args)) {
        const query = typeof args.room_name === 'string' ? args.room_name : null;
        const normalizedQuery = normalizeRoomQuery(query);
        const aliases = getClientRoomAliases(clientKey);
        const alias = aliases && normalizedQuery ? aliases.get(normalizedQuery) : null;
        if (alias && Number.isFinite(Number(alias.room_id))) {
          args.room_id = Number(alias.room_id);

          logger.info('Applied room alias', {
            correlationId: ws.correlationId,
            clientKey,
            tool,
            query: normalizedQuery,
            room_id: Number(alias.room_id),
          });
        }
      }
    } catch (e) {
      // Best-effort only.
    }

    ws.send(JSON.stringify({
      type: 'intent',
      intent,
    }));

    // Step 3: Execute command
    ws.send(JSON.stringify({
      type: 'processing',
      stage: 'executing',
    }));

    const mcpResult = await mcpClient.sendCommand(intent, ws.correlationId, ws.user?.deviceId);

    if (mcpResult && mcpResult.clarification) {
      ws.pendingClarification = {
        transcript: sttResult.transcript,
        intent,
        clarification: mcpResult.clarification,
      };

      ws.send(
        JSON.stringify({
          type: 'clarification-required',
          transcript: sttResult.transcript,
          intent,
          clarification: mcpResult.clarification,
        }),
      );
      ws.audioChunks = [];
      return;
    }

    if (!mcpResult || mcpResult.success !== true) {
      const errorMessage = mcpResult && mcpResult.result && mcpResult.result.error
        ? mcpResult.result.error
        : 'Command failed';
      throw new Error(errorMessage);
    }

    ws.send(JSON.stringify({
      type: 'command-complete',
      result: mcpResult,
      transcript: sttResult.transcript,
      intent,
    }));

    // Clear audio chunks
    ws.audioChunks = [];
  } catch (error) {
    logger.error('Error processing audio stream', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    ws.send(JSON.stringify({
      type: 'error',
      code: error.code || 'PROCESSING_ERROR',
      message: error.message,
    }));

    ws.audioChunks = [];
  }
}

/**
 * Handle WebSocket close
 */
function handleClose(ws) {
  activeConnections.delete(ws.correlationId);

  logger.info('WebSocket connection closed', {
    correlationId: ws.correlationId,
    activeConnections: activeConnections.size,
  });
}

module.exports = {
  initWebSocketServer,
};

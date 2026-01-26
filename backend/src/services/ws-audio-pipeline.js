const shouldAutoResolveRoomGroup = (transcript, originalIntent, clarification) => {
  if (!transcript || typeof transcript !== 'string') return false;
  if (!clarification || typeof clarification !== 'object') return false;
  if (String(clarification.kind || '') !== 'room') return false;
  if (!Array.isArray(clarification.candidates) || clarification.candidates.length === 0) return false;

  // Only auto-resolve for lights-by-room commands (safe bulk operation).
  if (!originalIntent || typeof originalIntent !== 'object') return false;
  if (String(originalIntent.tool || '') !== 'c4_room_lights_set') return false;

  // Heuristics: user asked for a bulk operation ("all"/"every") AND mentions lights.
  // Keep this conservative to avoid surprising fan-out on unrelated commands.
  const t = transcript.toLowerCase();
  const wantsAll = /\b(all|every|everything)\b/.test(t);
  const mentionsLights = /\b(lights?|lamps?)\b/.test(t);
  if (!wantsAll || !mentionsLights) return false;

  // Safety cap: avoid blasting too many rooms without explicit confirmation.
  if (clarification.candidates.length > 12) return false;

  return true;
};

const detectMoodRequest = (transcript, config) => {
  if (!transcript || typeof transcript !== 'string') return null;
  const t = transcript.toLowerCase();

  // Keep this conservative; only trigger on explicit mood/vibe phrasing.
  const moodHit = /(\bromantic\b|\bcozy\b|\bcosy\b|\brelax\b|\brelaxed\b|\bchill\b|\bparty\b|\bmood\b|\bvibe\b|\bdate\s*night\b|\bmovie\s*night\b|\bset\s+the\s+mood\b)/i.test(t);
  if (!moodHit) return null;

  // Rough presets.
  const presets = [
    { re: /romantic|date\s*night|set\s+the\s+mood/i, level: 20, label: 'romantic' },
    { re: /movie\s*night/i, level: 15, label: 'movie' },
    { re: /party/i, level: 70, label: 'party' },
    { re: /cozy|cosy/i, level: 35, label: 'cozy' },
    { re: /relax|relaxed|chill/i, level: 25, label: 'relax' },
  ];

  const matched = presets.find((p) => p.re.test(transcript));
  const defaultLevel = Number.isFinite(Number(config?.mood?.defaultLightLevel))
    ? Number(config.mood.defaultLightLevel)
    : 25;

  return {
    kind: matched ? matched.label : 'mood',
    lightLevel: matched ? matched.level : defaultLevel,
  };
};

const buildRoomCandidatesFromListRooms = async (mcpClient, correlationId, sessionId) => {
  const resp = await mcpClient.sendCommand({ tool: 'c4_list_rooms', args: {} }, correlationId, sessionId);
  const rooms = resp?.result?.result?.rooms || resp?.result?.rooms;
  if (!Array.isArray(rooms) || rooms.length === 0) return [];

  return rooms
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const name = r.name || r.room_name || r.roomName || r.title;
      const roomId = r.room_id !== undefined ? r.room_id
        : r.id !== undefined ? r.id
          : r.roomId !== undefined ? r.roomId
            : null;
      return {
        name: name ? String(name) : null,
        room_id: roomId !== null && roomId !== undefined ? Number(roomId) : null,
      };
    })
    .filter((c) => c && c.name)
    .slice(0, 12);
};

const executeRoomGroup = async (mcpClient, intent, clarification, correlationId, sessionId) => {
  const perRoomResults = [];
  for (const choice of clarification.candidates) {
    const refinedIntent = mcpClient.buildRefinedIntentFromChoice(intent, choice);
    if (!refinedIntent) continue;

    // eslint-disable-next-line no-await-in-loop
    const r = await mcpClient.sendCommand(refinedIntent, correlationId, sessionId);

    perRoomResults.push({
      room_name: choice && choice.name ? String(choice.name) : null,
      room_id: choice && choice.room_id !== undefined && choice.room_id !== null ? Number(choice.room_id) : null,
      intent: refinedIntent,
      result: r,
    });
  }

  const anyFailed = perRoomResults.some((x) => !x.result || x.result.success !== true);
  return {
    success: !anyFailed,
    tool: String(intent.tool || 'c4_room_lights_set'),
    args: intent.args || {},
    aggregate: {
      kind: 'room-group',
      query: clarification.query || (intent.args && intent.args.room_name) || null,
      count: perRoomResults.length,
    },
    results: perRoomResults,
    timestamp: new Date().toISOString(),
  };
};

async function processTranscript(ws, transcript, {
  logger,
  wsMessages,
  parseIntent,
  mcpClient,
  roomAliases,
} = {}) {
  const config = require('../config');
  const { buildMoodPlan } = require('./pending-plans');

  if (!ws || !wsMessages || !logger || !parseIntent || !mcpClient || !roomAliases) {
    throw new Error('ws-audio-pipeline: missing dependencies');
  }

  try {
    const safeTranscript = (typeof transcript === 'string') ? transcript : '';

    // Mood / vibe requests: ask a follow-up question rather than forcing a scene.
    // This is opt-in via config to preserve existing behavior unless explicitly enabled.
    if (config?.mood?.enabled) {
      const mood = detectMoodRequest(safeTranscript, config);
      if (mood) {
        wsMessages.sendProcessing(ws, 'intent-parsing');

        const candidates = await buildRoomCandidatesFromListRooms(mcpClient, ws.correlationId, ws.user?.deviceId);
        if (!candidates.length) {
          wsMessages.sendError(ws, {
            code: 'MOOD_NO_ROOMS',
            message: 'I can help set the mood, but I could not list rooms right now.',
          });
          ws.audioChunks = [];
          return;
        }

        const wantsMusic = Boolean(config?.mood?.music?.enabled)
          && Boolean(String(config?.mood?.music?.defaultSourceName || '').trim());

        const prompt = wantsMusic
          ? 'Would you like me to dim the lights and put on some music? Which room?'
          : 'Would you like me to dim the lights? Which room?';

        const intentForChoice = {
          tool: 'c4_room_lights_set',
          args: { level: Math.max(0, Math.min(100, Math.round(Number(mood.lightLevel) || 25))) },
        };

        const clarification = {
          kind: 'room',
          query: null,
          prompt,
          candidates,
        };

        ws.pendingClarification = {
          transcript: safeTranscript,
          intent: intentForChoice,
          clarification,
          plan: buildMoodPlan({
            mood: mood.kind,
            lightsLevel: intentForChoice.args.level,
            musicSourceName: wantsMusic ? String(config.mood.music.defaultSourceName).trim() : '',
          }),
        };

        wsMessages.sendClarificationRequired(ws, safeTranscript, intentForChoice, clarification);
        ws.audioChunks = [];
        return;
      }
    }

    // Step 2: Intent parsing
    wsMessages.sendProcessing(ws, 'intent-parsing');

    const intent = await parseIntent(safeTranscript, ws.correlationId);

    const { executePlannedCommand } = require('./command-orchestrator');

    wsMessages.sendIntent(ws, intent);

    // Step 3: Execute command
    wsMessages.sendProcessing(ws, 'executing');

    const { command: mcpResult } = await executePlannedCommand(intent, {
      correlationId: ws.correlationId,
      sessionId: ws.user?.deviceId,
      mcpClient,
      logger,
      ws,
      roomAliases,
    });

    if (mcpResult && mcpResult.clarification) {
      if (shouldAutoResolveRoomGroup(safeTranscript, intent, mcpResult.clarification)) {
        wsMessages.sendProcessing(ws, 'executing');

        const aggregateResult = await executeRoomGroup(
          mcpClient,
          intent,
          mcpResult.clarification,
          ws.correlationId,
          ws.user?.deviceId,
        );

        wsMessages.sendCommandComplete(ws, aggregateResult, safeTranscript, intent);
        ws.pendingClarification = null;
        ws.audioChunks = [];
        return;
      }

      ws.pendingClarification = {
        transcript: safeTranscript,
        intent,
        clarification: mcpResult.clarification,
      };

      wsMessages.sendClarificationRequired(ws, safeTranscript, intent, mcpResult.clarification);
      ws.audioChunks = [];
      return;
    }

    if (!mcpResult || mcpResult.success !== true) {
      const errorMessage = mcpResult && mcpResult.result && mcpResult.result.error
        ? mcpResult.result.error
        : 'Command failed';
      throw new Error(errorMessage);
    }

    wsMessages.sendCommandComplete(ws, mcpResult, safeTranscript, intent);

    ws.audioChunks = [];
  } catch (error) {
    logger.error('Error processing transcript', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    wsMessages.sendError(ws, {
      code: 'PROCESSING_ERROR',
      message: error.message,
    });

    ws.audioChunks = [];
  }
}

async function processAudioStream(ws, {
  logger,
  wsMessages,
  transcribeAudio,
  parseIntent,
  mcpClient,
  roomAliases,
} = {}) {
  if (!ws || !wsMessages || !logger || !transcribeAudio || !parseIntent || !mcpClient || !roomAliases) {
    throw new Error('ws-audio-pipeline: missing dependencies');
  }

  if (!ws || !wsMessages || !logger || !transcribeAudio || !parseIntent || !mcpClient || !roomAliases) {
    throw new Error('ws-audio-pipeline: missing dependencies');
  }

  if (!ws.audioChunks || ws.audioChunks.length === 0) {
    wsMessages.sendError(ws, { code: 'NO_AUDIO_DATA', message: 'No audio data received' });
    return;
  }

  try {
    const audioData = ws.audioChunks.join('');

    logger.info('Processing audio stream', {
      correlationId: ws.correlationId,
      chunks: ws.audioChunks.length,
      totalSize: audioData.length,
    });

    // Step 1: Transcription
    wsMessages.sendProcessing(ws, 'transcription');

    const format = ws.audioFormat ? String(ws.audioFormat) : 'webm';
    const sampleRateHertz = Number.isFinite(Number(ws.audioSampleRateHertz))
      ? Number(ws.audioSampleRateHertz)
      : undefined;
    const sttResult = await transcribeAudio(audioData, format, ws.correlationId, sampleRateHertz);

    wsMessages.sendTranscript(ws, sttResult.transcript, sttResult.confidence);
    await processTranscript(ws, sttResult.transcript, {
      logger,
      wsMessages,
      parseIntent,
      mcpClient,
      roomAliases,
    });
  } catch (error) {
    logger.error('Error processing audio stream', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    wsMessages.sendError(ws, {
      code: error.code || 'PROCESSING_ERROR',
      message: error.message,
    });

    ws.audioChunks = [];
  }
}

module.exports = {
  processAudioStream,
  processTranscript,
};

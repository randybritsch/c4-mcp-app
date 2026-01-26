async function processAudioStream(ws, {
  logger,
  wsMessages,
  transcribeAudio,
  parseIntent,
  mcpClient,
  roomAliases,
} = {}) {
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

  const executeRoomGroup = async (intent, clarification, correlationId, sessionId) => {
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

    // Step 2: Intent parsing
    wsMessages.sendProcessing(ws, 'intent-parsing');

    const intent = await parseIntent(sttResult.transcript, ws.correlationId);

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
      if (shouldAutoResolveRoomGroup(sttResult.transcript, intent, mcpResult.clarification)) {
        wsMessages.sendProcessing(ws, 'executing');

        const aggregateResult = await executeRoomGroup(
          intent,
          mcpResult.clarification,
          ws.correlationId,
          ws.user?.deviceId,
        );

        wsMessages.sendCommandComplete(ws, aggregateResult, sttResult.transcript, intent);
        ws.pendingClarification = null;
        ws.audioChunks = [];
        return;
      }

      ws.pendingClarification = {
        transcript: sttResult.transcript,
        intent,
        clarification: mcpResult.clarification,
      };

      wsMessages.sendClarificationRequired(ws, sttResult.transcript, intent, mcpResult.clarification);
      ws.audioChunks = [];
      return;
    }

    if (!mcpResult || mcpResult.success !== true) {
      const errorMessage = mcpResult && mcpResult.result && mcpResult.result.error
        ? mcpResult.result.error
        : 'Command failed';
      throw new Error(errorMessage);
    }

    wsMessages.sendCommandComplete(ws, mcpResult, sttResult.transcript, intent);

    ws.audioChunks = [];
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
};

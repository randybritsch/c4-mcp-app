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

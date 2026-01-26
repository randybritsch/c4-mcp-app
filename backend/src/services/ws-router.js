async function handleMessage(ws, data, {
  logger,
  wsMessages,
  wsAudioPipeline,
  wsClarification,
  transcribeAudio,
  parseIntent,
  mcpClient,
  roomAliases,
} = {}) {
  if (!ws || !data || !logger || !wsMessages || !wsAudioPipeline || !wsClarification) return;

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
        wsMessages.sendAudioReady(ws);
        break;

      case 'audio-chunk':
        if (!ws.audioChunks) ws.audioChunks = [];
        if (typeof message.data !== 'string') {
          wsMessages.sendError(ws, {
            code: 'INVALID_AUDIO_CHUNK',
            message: 'audio-chunk data must be a base64 string',
          });
          break;
        }
        ws.audioChunks.push(message.data);
        break;

      case 'audio-end':
        await wsAudioPipeline.processAudioStream(ws, {
          logger,
          wsMessages,
          transcribeAudio,
          parseIntent,
          mcpClient,
          roomAliases,
        });
        break;

      case 'clarification-choice':
        await wsClarification.handleClarificationChoice(ws, message, {
          logger,
          wsMessages,
          mcpClient,
          roomAliases,
        });
        break;

      case 'ping':
        wsMessages.sendPong(ws);
        break;

      default:
        wsMessages.sendError(ws, { message: `Unknown message type: ${message.type}` });
    }
  } catch (error) {
    logger.error('Error handling WebSocket message', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    wsMessages.sendError(ws, { code: 'MESSAGE_PARSE_ERROR', message: error.message });
  }
}

module.exports = {
  handleMessage,
};

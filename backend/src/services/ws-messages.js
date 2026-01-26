function sendJson(ws, payload) {
  if (!ws) return;

  if (ws.readyState !== 1) return;

  try {
    ws.send(JSON.stringify(payload));
  } catch (e) {
    // Ignore send failures (e.g., socket closed mid-send).
  }
}

function sendConnected(ws, correlationId) {
  sendJson(ws, {
    type: 'connected',
    correlationId,
    message: 'WebSocket connection established',
  });
}

function sendAudioReady(ws) {
  sendJson(ws, {
    type: 'audio-ready',
    message: 'Ready to receive audio',
  });
}

function sendProcessing(ws, stage) {
  sendJson(ws, {
    type: 'processing',
    stage,
  });
}

function sendPong(ws) {
  sendJson(ws, { type: 'pong' });
}

function sendTranscript(ws, transcript, confidence) {
  sendJson(ws, {
    type: 'transcript',
    transcript,
    confidence,
  });
}

function sendIntent(ws, intent) {
  sendJson(ws, {
    type: 'intent',
    intent,
  });
}

function sendClarificationRequired(ws, transcript, intent, clarification) {
  sendJson(ws, {
    type: 'clarification-required',
    transcript,
    intent,
    clarification,
  });
}

function sendCommandComplete(ws, result, transcript, intent) {
  sendJson(ws, {
    type: 'command-complete',
    result,
    transcript,
    intent,
  });
}

function sendError(ws, { code, message, details } = {}) {
  const payload = {
    type: 'error',
    message,
  };

  if (code) payload.code = code;
  if (details !== undefined) payload.details = details;

  sendJson(ws, payload);
}

module.exports = {
  sendJson,
  sendConnected,
  sendAudioReady,
  sendProcessing,
  sendPong,
  sendTranscript,
  sendIntent,
  sendClarificationRequired,
  sendCommandComplete,
  sendError,
};

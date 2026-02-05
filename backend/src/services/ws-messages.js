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

function sendRoomContext(ws, room, source) {
  if (!room || typeof room !== 'object') return;
  const roomName = room.room_name || room.name || room.roomName;
  if (!roomName) return;

  const roomId = room.room_id !== undefined ? room.room_id
    : room.roomId !== undefined ? room.roomId
      : room.id !== undefined ? room.id
        : null;

  const payload = {
    type: 'room-context',
    room: {
      room_name: String(roomName),
      room_id: roomId !== null && roomId !== undefined ? Number(roomId) : null,
    },
    updatedAt: room.updatedAt || new Date().toISOString(),
  };

  if (source) payload.source = String(source);

  sendJson(ws, payload);
}

function sendRemoteContext(ws, remote, source) {
  if (!remote || typeof remote !== 'object') return;

  const payload = {
    type: 'remote-context',
    remote: {
      active: Boolean(remote.active),
      kind: remote.kind ? String(remote.kind) : null,
      label: remote.label ? String(remote.label) : null,
      room: remote.room && typeof remote.room === 'object' ? remote.room : undefined,
      device: remote.device && typeof remote.device === 'object' ? remote.device : undefined,
      updatedAt: remote.updatedAt || new Date().toISOString(),
    },
  };

  if (source) payload.source = String(source);

  sendJson(ws, payload);
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
  sendRoomContext,
  sendRemoteContext,
  sendError,
};

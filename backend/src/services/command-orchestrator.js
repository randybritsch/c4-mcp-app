function applyRoomAliasesToIntentBestEffort({
  ws,
  intent,
  logger,
  roomAliases,
} = {}) {
  if (!ws || !intent || !logger || !roomAliases) return;

  try {
    roomAliases.applyRoomAliasToIntent({ ws, intent, logger });
  } catch (e) {
    // Best-effort only.
  }
}

function applyCurrentRoomToIntentBestEffort({
  ws,
  intent,
  logger,
} = {}) {
  if (!ws || !intent || !logger) return;
  if (!ws.currentRoom || typeof ws.currentRoom !== 'object') return;

  const roomId = ws.currentRoom.room_id;
  const roomName = ws.currentRoom.room_name ? String(ws.currentRoom.room_name).trim() : '';

  try {
    if (!intent || typeof intent !== 'object') return;
    const tool = String(intent.tool || '');
    if (!tool) return;

    const args = (intent.args && typeof intent.args === 'object') ? intent.args : {};
    intent.args = args;

    // Only apply when the plan does not specify any room already.
    const hasRoomId = args.room_id !== undefined && args.room_id !== null && String(args.room_id).trim() !== '';
    const hasRoomName = typeof args.room_name === 'string' && args.room_name.trim() !== '';
    if (hasRoomId || hasRoomName) return;

    // Some MCP tools require a room_name argument (not optional). When we have it,
    // this should always come from the current-room context.
    const roomNameRequiredTools = new Set([
      'c4_tv_watch_by_name',
      'c4_room_listen_by_name',
    ]);

    if (roomNameRequiredTools.has(tool)) {
      if (!roomName) return;
      args.room_name = roomName;
      if (roomId !== null && roomId !== undefined) {
        args.room_id = String(roomId);
      }
      return;
    }

    // Room-scoped tools that should default to the current room when available.
    const roomScopedTools = new Set([
      'c4_room_lights_set',
      'c4_tv_watch',
      'c4_tv_off',
      'c4_tv_remote',
      'c4_room_watch_status',
      'c4_room_listen_status',
      'c4_room_now_playing',
      'c4_room_list_video_devices',
      'c4_room_list_commands',
      'c4_room_send_command',
      'c4_room_off',
      'c4_room_listen',
      'c4_room_select_video_device',
      'c4_room_select_audio_device',
    ]);

    if (!roomScopedTools.has(tool)) return;

    if (roomId === null || roomId === undefined) return;

    // Prefer stable id and keep contract: for tools that accept exactly one of room_id/room_name,
    // injecting room_id alone is safest.
    args.room_id = String(roomId);
    if (args.room_name !== undefined) delete args.room_name;
  } catch (e) {
    // Best-effort only.
  }
}

async function executePlannedCommand(plan, {
  correlationId,
  sessionId,
  mcpClient,
  logger,
  ws,
  roomAliases,
} = {}) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('command-orchestrator: plan is required');
  }
  if (!mcpClient) {
    throw new Error('command-orchestrator: mcpClient is required');
  }

  // Optional best-effort enrichment.
  if (ws && logger) {
    applyCurrentRoomToIntentBestEffort({ ws, intent: plan, logger });
  }
  if (ws && roomAliases && logger) {
    applyRoomAliasesToIntentBestEffort({
      ws, intent: plan, logger, roomAliases,
    });
  }

  const command = await mcpClient.sendCommand(plan, correlationId, sessionId);

  return {
    plan,
    command,
  };
}

module.exports = {
  executePlannedCommand,
};

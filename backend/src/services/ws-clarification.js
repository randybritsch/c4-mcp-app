async function handleClarificationChoice(ws, message, {
  logger,
  wsMessages,
  mcpClient,
  roomAliases,
} = {}) {
  const bestEffortEmitRemoteContext = (intent, mcpResult) => {
    if (!ws || !wsMessages || !intent) return;
    if (!mcpResult || mcpResult.success !== true) return;

    const tool = String(intent.tool || '');
    const args = (intent.args && typeof intent.args === 'object') ? intent.args : {};

    const enables = new Set([
      'c4_tv_watch',
      'c4_tv_watch_by_name',
      'c4_media_watch_launch_app',
      'c4_media_watch_launch_app_by_name',
      // Room-scoped watch equivalent (commonly used by Gemini plans).
      'c4_room_select_video_device',

      // If the plan uses remote tools directly (e.g., power/mute/volume),
      // the UI should still show the remote panel.
      'c4_tv_remote',
      'c4_tv_remote_last',
      'c4_media_remote',
      'c4_media_remote_sequence',
    ]);
    const disables = new Set([
      'c4_tv_off',
      'c4_tv_off_last',
      'c4_room_off',
    ]);

    if (disables.has(tool)) {
      ws.remoteContext = {
        active: false,
        kind: 'tv',
        label: null,
        updatedAt: new Date().toISOString(),
      };
      if (typeof wsMessages.sendRemoteContext === 'function') {
        wsMessages.sendRemoteContext(ws, ws.remoteContext, 'off');
      }
      return;
    }

    if (!enables.has(tool)) return;

    const _extractMediaDeviceIdBestEffort = () => {
      try {
        if (tool === 'c4_media_watch_launch_app' || tool === 'c4_media_watch_launch_app_by_name') {
          const id = args.device_id !== undefined && args.device_id !== null ? String(args.device_id).trim() : '';
          return id || null;
        }

        if (tool === 'c4_media_remote' || tool === 'c4_media_remote_sequence') {
          const id = args.device_id !== undefined && args.device_id !== null ? String(args.device_id).trim() : '';
          return id || null;
        }

        if (tool === 'c4_tv_watch') {
          const id = args.source_device_id !== undefined && args.source_device_id !== null ? String(args.source_device_id).trim() : '';
          return id || null;
        }

        if (tool === 'c4_tv_watch_by_name') {
          // sendCommand wraps the raw MCP tool payload under `mcpResult.result.result`.
          // Accept both shapes defensively.
          const payload = (mcpResult && mcpResult.result && mcpResult.result.result && typeof mcpResult.result.result === 'object')
            ? mcpResult.result.result
            : (mcpResult && mcpResult.result && typeof mcpResult.result === 'object')
              ? mcpResult.result
              : null;

          const plannedId = payload?.planned?.source_device_id;
          if (plannedId !== undefined && plannedId !== null && String(plannedId).trim()) return String(plannedId).trim();

          const resolvedId = payload?.resolve_source?.device_id;
          if (resolvedId !== undefined && resolvedId !== null && String(resolvedId).trim()) return String(resolvedId).trim();

          const argId = args.source_device_id !== undefined && args.source_device_id !== null ? String(args.source_device_id).trim() : '';
          return argId || null;
        }
      } catch {
        // Best-effort only.
      }
      return null;
    };

    const mediaDeviceId = _extractMediaDeviceIdBestEffort();

    const roomName = (ws.currentRoom && ws.currentRoom.room_name) ? String(ws.currentRoom.room_name).trim() : '';
    const sourceName = (typeof args.source_device_name === 'string') ? args.source_device_name.trim() : '';
    const videoName = (typeof args.video_device_name === 'string') ? args.video_device_name.trim() : '';
    const deviceName = (typeof args.device_name === 'string') ? args.device_name.trim() : '';
    const app = (typeof args.app === 'string') ? args.app.trim() : '';
    const parts = [];
    if (roomName) parts.push(roomName);
    if (sourceName) parts.push(sourceName);
    else if (videoName) parts.push(videoName);
    else if (deviceName) parts.push(deviceName);
    if (app) parts.push(app);

    ws.remoteContext = {
      active: true,
      kind: mediaDeviceId ? 'media' : 'tv',
      label: parts.length ? parts.join(' — ') : null,
      media_device_id: mediaDeviceId,
      room: ws.currentRoom && typeof ws.currentRoom === 'object'
        ? {
          room_id: ws.currentRoom.room_id !== undefined && ws.currentRoom.room_id !== null ? Number(ws.currentRoom.room_id) : null,
          room_name: ws.currentRoom.room_name ? String(ws.currentRoom.room_name) : null,
        }
        : undefined,
      updatedAt: new Date().toISOString(),
    };

    if (typeof wsMessages.sendRemoteContext === 'function') {
      wsMessages.sendRemoteContext(ws, ws.remoteContext, 'watch');
    }
  };

  const { isMoodPlan, isPresencePlan } = require('./pending-plans');
  const { buildRoomPresenceReport } = require('./room-presence');
  if (!ws || !wsMessages || !mcpClient || !roomAliases) {
    throw new Error('ws-clarification: missing dependencies');
  }

  if (!ws.pendingClarification) {
    wsMessages.sendError(ws, {
      code: 'NO_PENDING_CLARIFICATION',
      message: 'No pending clarification. Please try again.',
    });
    return;
  }

  const { intent, transcript, clarification } = ws.pendingClarification;
  const idx = Number(message.choiceIndex);
  const candidates = (clarification && Array.isArray(clarification.candidates)) ? clarification.candidates : [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
    wsMessages.sendError(ws, { code: 'INVALID_CHOICE', message: 'Invalid choice index' });
    return;
  }

  const choice = candidates[idx];
  const pendingPlan = ws.pendingClarification && ws.pendingClarification.plan
    ? ws.pendingClarification.plan
    : null;

  // Presence/report plans are room-selection only (no "refined intent" execution).
  if (isPresencePlan(pendingPlan)) {
    wsMessages.sendProcessing(ws, 'executing');

    // Store best-effort current room on the ws connection for future features.
    ws.currentRoom = {
      room_id: choice && choice.room_id !== undefined && choice.room_id !== null ? Number(choice.room_id) : null,
      room_name: choice && choice.name ? String(choice.name) : null,
      updatedAt: new Date().toISOString(),
    };

    if (typeof wsMessages.sendRoomContext === 'function') {
      wsMessages.sendRoomContext(ws, ws.currentRoom, 'presence');
    }

    const report = await buildRoomPresenceReport(mcpClient, choice, ws.correlationId, ws.user?.deviceId);
    wsMessages.sendCommandComplete(ws, report, transcript, { tool: 'c4_room_presence', args: { room_id: ws.currentRoom.room_id } });
    ws.pendingClarification = null;
    return;
  }

  // For any room clarification, treat the selected room as the active room context.
  if (clarification && String(clarification.kind || '') === 'room' && choice && choice.name) {
    ws.currentRoom = {
      room_id: choice && choice.room_id !== undefined && choice.room_id !== null ? Number(choice.room_id) : null,
      room_name: String(choice.name),
      updatedAt: new Date().toISOString(),
    };
    if (typeof wsMessages.sendRoomContext === 'function') {
      wsMessages.sendRoomContext(ws, ws.currentRoom, 'clarification');
    }
  }

  // Remember room clarifications per-device so repeated commands like
  // "Turn on the basement Roku" don't keep asking which "Basement".
  try {
    roomAliases.storeRoomAliasFromClarification({
      ws,
      intent,
      clarification,
      choice,
      logger,
    });
  } catch (e) {
    // Best-effort only; do not block the command flow.
  }

  wsMessages.sendProcessing(ws, 'executing');

  const refinedIntent = mcpClient.buildRefinedIntentFromChoice(intent, choice);
  if (!refinedIntent) {
    wsMessages.sendError(ws, {
      code: 'CLARIFICATION_BUILD_FAILED',
      message: 'Could not build refined command',
    });
    ws.pendingClarification = null;
    return;
  }

  // Defensive: ensure room clarifications actually scope the follow-up call.
  // This prevents loops where the follow-up retries the same ambiguous query.
  if (String(refinedIntent.tool || '') === 'c4_room_presence_report' && choice && typeof choice === 'object') {
    refinedIntent.args = (refinedIntent.args && typeof refinedIntent.args === 'object') ? { ...refinedIntent.args } : {};
    if (choice.name) refinedIntent.args.room_name = String(choice.name);
    if (choice.room_id !== undefined && choice.room_id !== null && String(choice.room_id).trim() !== '') {
      refinedIntent.args.room_id = Number(choice.room_id);
    }
  }

  const mcpResult = await mcpClient.sendCommand(refinedIntent, ws.correlationId, ws.user?.deviceId);
  if (mcpResult && mcpResult.clarification) {
    ws.pendingClarification = {
      transcript,
      intent: refinedIntent,
      clarification: mcpResult.clarification,
    };
    wsMessages.sendClarificationRequired(ws, transcript, refinedIntent, mcpResult.clarification);
    return;
  }

  if (!mcpResult || mcpResult.success !== true) {
    wsMessages.sendError(ws, {
      code: 'COMMAND_FAILED',
      message: 'Command failed',
      details: mcpResult,
    });
    ws.pendingClarification = null;
    return;
  }

  bestEffortEmitRemoteContext(refinedIntent, mcpResult);

  // Optional multi-step plan after clarification.
  if (isMoodPlan(pendingPlan)) {
    // Mood plans are explicitly room-based.
    if (choice && choice.name) {
      ws.currentRoom = {
        room_id: choice && choice.room_id !== undefined && choice.room_id !== null ? Number(choice.room_id) : null,
        room_name: String(choice.name),
        updatedAt: new Date().toISOString(),
      };
      if (typeof wsMessages.sendRoomContext === 'function') {
        wsMessages.sendRoomContext(ws, ws.currentRoom, 'mood');
      }
    }

    let musicResult = null;
    const musicSource = pendingPlan.music && pendingPlan.music.source_device_name
      ? String(pendingPlan.music.source_device_name).trim()
      : '';

    if (musicSource) {
      const listenIntentTemplate = {
        tool: 'c4_room_listen_by_name',
        args: {
          source_device_name: musicSource,
        },
      };

      const listenIntent = mcpClient.buildRefinedIntentFromChoice(listenIntentTemplate, choice);
      if (listenIntent) {
        try {
          musicResult = await mcpClient.sendCommand(listenIntent, ws.correlationId, ws.user?.deviceId);
        } catch (e) {
          musicResult = {
            success: false,
            tool: 'c4_room_listen_by_name',
            args: listenIntent.args,
            result: { ok: false, error: e && e.message ? e.message : String(e) },
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    const aggregate = {
      success: true,
      aggregate: {
        kind: 'mood-plan',
        mood: pendingPlan.mood || 'mood',
        room_name: choice && choice.name ? String(choice.name) : null,
        room_id: choice && choice.room_id !== undefined && choice.room_id !== null ? Number(choice.room_id) : null,
        lights_level: pendingPlan.lights && pendingPlan.lights.level !== undefined ? pendingPlan.lights.level : null,
        music_source: musicSource || null,
      },
      results: {
        lights: mcpResult,
        music: musicResult,
      },
      warnings: (
        musicSource
        && musicResult
        && musicResult.success !== true
      ) ? ['Music did not start (see results.music).'] : [],
      timestamp: new Date().toISOString(),
    };

    wsMessages.sendCommandComplete(ws, aggregate, transcript, refinedIntent);
    ws.pendingClarification = null;
    return;
  }

  wsMessages.sendCommandComplete(ws, mcpResult, transcript, refinedIntent);
  ws.pendingClarification = null;
}

module.exports = {
  handleClarificationChoice,
};

async function handleClarificationChoice(ws, message, {
  logger,
  wsMessages,
  mcpClient,
  roomAliases,
} = {}) {
  const { isMoodPlan } = require('./pending-plans');
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

  // Optional multi-step plan after clarification.
  if (isMoodPlan(pendingPlan)) {
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

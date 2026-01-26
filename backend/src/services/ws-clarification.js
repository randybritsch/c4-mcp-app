async function handleClarificationChoice(ws, message, {
  logger,
  wsMessages,
  mcpClient,
  roomAliases,
} = {}) {
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

  wsMessages.sendCommandComplete(ws, mcpResult, transcript, refinedIntent);
  ws.pendingClarification = null;
}

module.exports = {
  handleClarificationChoice,
};

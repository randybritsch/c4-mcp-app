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

// Room alias cache:
// After a user clarifies an ambiguous room query (e.g. "Basement"), remember the chosen room_id
// so future commands can skip repeated clarification for the same query.
// Keyed by a best-effort stable client key (deviceId/sub/id/email). In-memory only.

const roomAliasesByClientKey = new Map();

function normalizeRoomQuery(value) {
  return (value || '').toString().trim().toLowerCase();
}

function getClientKeyFromWs(ws) {
  if (!ws) return null;
  const user = ws.user && typeof ws.user === 'object' ? ws.user : null;
  const rawKey = user?.deviceId || user?.sub || user?.id || user?.email;
  if (!rawKey) return null;
  return String(rawKey);
}

function getClientRoomAliases(clientKey) {
  if (!clientKey) return null;
  const key = String(clientKey);
  let aliases = roomAliasesByClientKey.get(key);
  if (!aliases) {
    aliases = new Map();
    roomAliasesByClientKey.set(key, aliases);
  }
  return aliases;
}

function storeRoomAliasFromClarification({
  ws,
  intent,
  clarification,
  choice,
  logger,
}) {
  // Best-effort only; callers should wrap if they need hard guarantees.
  const kind = clarification && clarification.kind ? String(clarification.kind) : '';
  const query = clarification && clarification.query ? String(clarification.query) : '';
  const normalizedQuery = normalizeRoomQuery(query);
  const clientKey = getClientKeyFromWs(ws);

  const isRoomKind = kind === 'room' || kind.endsWith('_room') || kind.includes('room');
  const roomId = choice && choice.room_id !== null && choice.room_id !== undefined ? Number(choice.room_id) : null;

  if (!isRoomKind || !normalizedQuery) return;

  if (!clientKey) {
    if (logger && logger.debug) {
      logger.debug('Room alias not stored (no stable client key)', {
        correlationId: ws?.correlationId,
        kind,
        query: normalizedQuery,
      });
    }
    return;
  }

  if (!Number.isFinite(roomId)) return;

  const aliases = getClientRoomAliases(clientKey);
  if (!aliases) return;

  const aliasValue = {
    room_id: roomId,
    room_name: choice && choice.name ? String(choice.name) : null,
  };

  // Store for the clarification query.
  aliases.set(normalizedQuery, aliasValue);

  // Also store for the intent's room_name if it differs (helps with slight prompt variations).
  const intentRoomName = intent && intent.args && typeof intent.args === 'object' ? intent.args.room_name : null;
  const normalizedIntentRoom = normalizeRoomQuery(intentRoomName);
  if (normalizedIntentRoom && normalizedIntentRoom !== normalizedQuery) {
    aliases.set(normalizedIntentRoom, aliasValue);
  }

  if (logger && logger.info) {
    logger.info('Stored room alias', {
      correlationId: ws?.correlationId,
      clientKey,
      kind,
      query: normalizedQuery,
      room_id: roomId,
      room_name: aliasValue.room_name,
    });
  }
}

function applyRoomAliasToIntent({ ws, intent, logger }) {
  const tool = intent && typeof intent === 'object' ? String(intent.tool || '') : '';
  const args = intent && typeof intent === 'object' && intent.args && typeof intent.args === 'object'
    ? intent.args
    : null;
  const clientKey = getClientKeyFromWs(ws);

  if (!args) return;
  if (!clientKey) return;

  // Only apply to the one known-hot path for now.
  if (tool !== 'c4_tv_watch_by_name') return;
  if ('room_id' in args) return;

  const query = typeof args.room_name === 'string' ? args.room_name : null;
  const normalizedQuery = normalizeRoomQuery(query);
  const aliases = getClientRoomAliases(clientKey);
  const alias = aliases && normalizedQuery ? aliases.get(normalizedQuery) : null;

  if (alias && Number.isFinite(Number(alias.room_id))) {
    args.room_id = Number(alias.room_id);

    if (logger && logger.info) {
      logger.info('Applied room alias', {
        correlationId: ws?.correlationId,
        clientKey,
        tool,
        query: normalizedQuery,
        room_id: Number(alias.room_id),
      });
    }
  }
}

module.exports = {
  normalizeRoomQuery,
  getClientKeyFromWs,
  getClientRoomAliases,
  storeRoomAliasFromClarification,
  applyRoomAliasToIntent,
};

const shouldAutoResolveRoomGroup = (transcript, originalIntent, clarification) => {
  if (!transcript || typeof transcript !== 'string') return false;
  if (!clarification || typeof clarification !== 'object') return false;
  if (String(clarification.kind || '') !== 'room') return false;
  if (!Array.isArray(clarification.candidates) || clarification.candidates.length === 0) return false;

  // Only auto-resolve for lights-by-room commands (safe bulk operation).
  if (!originalIntent || typeof originalIntent !== 'object') return false;
  if (String(originalIntent.tool || '') !== 'c4_room_lights_set') return false;

  // Heuristics: user asked for a bulk operation ("all"/"every") AND mentions lights.
  // Keep this conservative to avoid surprising fan-out on unrelated commands.
  const t = transcript.toLowerCase();
  const wantsAll = /\b(all|every|everything)\b/.test(t);
  const mentionsLights = /\b(lights?|lamps?)\b/.test(t);
  if (!wantsAll || !mentionsLights) return false;

  // Safety cap: avoid blasting too many rooms without explicit confirmation.
  if (clarification.candidates.length > 12) return false;

  return true;
};

const buildRoomCandidatesFromListRooms = async (mcpClient, correlationId, sessionId) => {
  const resp = await mcpClient.sendCommand({ tool: 'c4_list_rooms', args: {} }, correlationId, sessionId);
  const rooms = resp?.result?.result?.rooms || resp?.result?.rooms;
  if (!Array.isArray(rooms) || rooms.length === 0) return [];

  return rooms
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const name = r.name || r.room_name || r.roomName || r.title;
      const roomId = r.room_id !== undefined ? r.room_id
        : r.id !== undefined ? r.id
          : r.roomId !== undefined ? r.roomId
            : null;
      return {
        name: name ? String(name) : null,
        room_id: roomId !== null && roomId !== undefined ? Number(roomId) : null,
      };
    })
    .filter((c) => c && c.name)
    .slice(0, 12);
};

const executeRoomGroup = async (mcpClient, intent, clarification, correlationId, sessionId) => {
  const perRoomResults = [];
  for (const choice of clarification.candidates) {
    const refinedIntent = mcpClient.buildRefinedIntentFromChoice(intent, choice);
    if (!refinedIntent) continue;

    // eslint-disable-next-line no-await-in-loop
    const r = await mcpClient.sendCommand(refinedIntent, correlationId, sessionId);

    perRoomResults.push({
      room_name: choice && choice.name ? String(choice.name) : null,
      room_id: choice && choice.room_id !== undefined && choice.room_id !== null ? Number(choice.room_id) : null,
      intent: refinedIntent,
      result: r,
    });
  }

  const anyFailed = perRoomResults.some((x) => !x.result || x.result.success !== true);
  return {
    success: !anyFailed,
    tool: String(intent.tool || 'c4_room_lights_set'),
    args: intent.args || {},
    aggregate: {
      kind: 'room-group',
      query: clarification.query || (intent.args && intent.args.room_name) || null,
      count: perRoomResults.length,
    },
    results: perRoomResults,
    timestamp: new Date().toISOString(),
  };
};

const _roomIdToNameCache = {
  loadedAtMs: 0,
  byId: new Map(),
};

const _findFirstArrayByKey = (value, key, maxDepth = 6) => {
  const needle = String(key);
  const visited = new Set();

  function walk(node, depth) {
    if (!node || depth < 0) return null;
    if (typeof node !== 'object') return null;
    if (visited.has(node)) return null;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth - 1);
        if (found) return found;
      }
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(node, needle) && Array.isArray(node[needle])) {
      return node[needle];
    }

    for (const v of Object.values(node)) {
      const found = walk(v, depth - 1);
      if (found) return found;
    }

    return null;
  }

  return walk(value, maxDepth);
};

const _extractDevicesFromFindDevicesResult = (resp) => {
  const matches = resp?.result?.matches
    || resp?.result?.result?.matches
    || resp?.result?.result?.result?.matches;

  if (Array.isArray(matches)) return matches;

  const devices = resp?.result?.devices
    || resp?.result?.result?.devices
    || resp?.result?.result
    || resp?.result?.result?.result
    || resp?.result?.result?.result?.devices;

  if (Array.isArray(devices)) return devices;

  const deepMatches = _findFirstArrayByKey(resp, 'matches', 7);
  if (Array.isArray(deepMatches)) return deepMatches;

  const deepDevices = _findFirstArrayByKey(resp, 'devices', 7);
  return Array.isArray(deepDevices) ? deepDevices : [];
};

const _normalizeRoomName = (name) => (name || '').toString().trim();

const _extractRoomFromDevice = (device) => {
  if (!device || typeof device !== 'object') return null;

  const roomName =
    device.room_name
    || device.roomName
    || (device.room && typeof device.room === 'object' ? (device.room.name || device.room.room_name || device.room.roomName) : null)
    || null;

  const roomId = (device.room_id !== undefined && device.room_id !== null)
    ? Number(device.room_id)
    : (device.roomId !== undefined && device.roomId !== null)
      ? Number(device.roomId)
      : (device.room && typeof device.room === 'object' && device.room.room_id !== undefined && device.room.room_id !== null)
        ? Number(device.room.room_id)
        : null;

  const normalizedName = _normalizeRoomName(roomName);
  const normalizedId = Number.isFinite(roomId) ? roomId : null;

  if (!normalizedName && normalizedId === null) return null;
  return {
    room_name: normalizedName || null,
    room_id: normalizedId,
  };
};

const _extractDeviceName = (device) => {
  if (!device || typeof device !== 'object') return '';
  const name = device.name || device.device_name || device.title || device.label;
  return (name || '').toString().trim();
};

const _pickBestDeviceByName = (devices, queryName) => {
  const q = (queryName || '').toString().trim().toLowerCase();
  if (!q) return null;
  const list = Array.isArray(devices) ? devices : [];

  const exact = list.find((d) => _extractDeviceName(d).toLowerCase() === q);
  if (exact) return exact;

  const includes = list.find((d) => _extractDeviceName(d).toLowerCase().includes(q));
  if (includes) return includes;

  return list.length ? list[0] : null;
};

const _refreshRoomIdToNameCacheIfNeeded = async (mcpClient, correlationId, sessionId) => {
  const now = Date.now();
  const maxAgeMs = 15 * 60 * 1000;
  if (_roomIdToNameCache.byId.size > 0 && (now - _roomIdToNameCache.loadedAtMs) < maxAgeMs) return;

  const resp = await mcpClient.sendCommand({ tool: 'c4_list_rooms', args: {} }, correlationId, sessionId);
  const rooms = resp?.result?.rooms
    || resp?.result?.result?.rooms
    || resp?.result?.result
    || resp?.result?.result?.result;

  const roomList = Array.isArray(rooms) ? rooms : (_findFirstArrayByKey(resp, 'rooms', 7) || []);
  if (!Array.isArray(roomList) || roomList.length === 0) return;

  const next = new Map();
  for (const r of roomList) {
    if (!r || typeof r !== 'object') continue;
    const name = r.name || r.room_name || r.roomName || r.title;
    const id = (r.room_id !== undefined && r.room_id !== null) ? Number(r.room_id)
      : (r.roomId !== undefined && r.roomId !== null) ? Number(r.roomId)
        : (r.id !== undefined && r.id !== null) ? Number(r.id)
          : null;
    if (!Number.isFinite(id)) continue;
    const n = _normalizeRoomName(name);
    if (!n) continue;
    next.set(id, n);
  }

  if (next.size > 0) {
    _roomIdToNameCache.byId = next;
    _roomIdToNameCache.loadedAtMs = now;
  }
};

const _resolveRoomNameByIdBestEffort = async (mcpClient, correlationId, sessionId, roomId) => {
  const id = Number(roomId);
  if (!Number.isFinite(id)) return null;
  try {
    await _refreshRoomIdToNameCacheIfNeeded(mcpClient, correlationId, sessionId);
    return _roomIdToNameCache.byId.get(id) || null;
  } catch {
    return null;
  }
};

const _bestEffortEmitRoomContext = async (ws, transcript, {
  wsMessages,
  mcpClient,
  correlationId,
  sessionId,
  intent,
  mcpResult,
} = {}) => {
  if (!ws || !wsMessages || !mcpClient || !intent) return;

  const args = (intent.args && typeof intent.args === 'object') ? intent.args : {};
  const tool = String(intent.tool || '');

  // Special-case: presence report returns a resolved room object; prefer it over intent args.
  if (tool === 'c4_room_presence_report' && mcpResult) {
    try {
      const room = mcpResult?.result?.result?.room || null;
      const roomId = room && room.room_id !== undefined && room.room_id !== null ? Number(room.room_id) : null;
      const roomName = room && room.room_name ? String(room.room_name).trim() : '';

      if (roomName || Number.isFinite(roomId)) {
        ws.currentRoom = {
          room_id: Number.isFinite(roomId) ? roomId : null,
          room_name: roomName || null,
          updatedAt: new Date().toISOString(),
        };
        if (typeof wsMessages.sendRoomContext === 'function') {
          wsMessages.sendRoomContext(ws, ws.currentRoom, 'result');
        }
        return;
      }
    } catch {
      // Best-effort only.
    }
  }

  // 1) Prefer explicit room_name from intent.
  const explicitRoomName = typeof args.room_name === 'string' ? args.room_name.trim() : '';
  const explicitRoomId = (args.room_id !== undefined && args.room_id !== null && String(args.room_id).trim() !== '')
    ? Number(args.room_id)
    : null;

  if (explicitRoomName) {
    ws.currentRoom = {
      room_id: Number.isFinite(explicitRoomId) ? explicitRoomId : null,
      room_name: explicitRoomName,
      updatedAt: new Date().toISOString(),
    };
    if (typeof wsMessages.sendRoomContext === 'function') {
      wsMessages.sendRoomContext(ws, ws.currentRoom, 'intent');
    }
    return;
  }

  // 2) If we only have room_id, resolve a display name via c4_list_rooms (cached).
  if (Number.isFinite(explicitRoomId)) {
    const existingRoomName = ws.currentRoom && typeof ws.currentRoom === 'object'
      && ws.currentRoom.room_id !== undefined
      && ws.currentRoom.room_id !== null
      && Number(ws.currentRoom.room_id) === explicitRoomId
      && ws.currentRoom.room_name
      ? String(ws.currentRoom.room_name).trim()
      : '';

    if (existingRoomName) {
      ws.currentRoom = {
        room_id: explicitRoomId,
        room_name: existingRoomName,
        updatedAt: new Date().toISOString(),
      };
      if (typeof wsMessages.sendRoomContext === 'function') {
        wsMessages.sendRoomContext(ws, ws.currentRoom, 'intent');
      }
      return;
    }

    const resolvedName = await _resolveRoomNameByIdBestEffort(mcpClient, correlationId, sessionId, explicitRoomId);
    if (resolvedName) {
      ws.currentRoom = {
        room_id: explicitRoomId,
        room_name: resolvedName,
        updatedAt: new Date().toISOString(),
      };
      if (typeof wsMessages.sendRoomContext === 'function') {
        wsMessages.sendRoomContext(ws, ws.currentRoom, 'intent');
      }
      return;
    }
  }

  // 2.5) If the executed tool result already contains a resolved room, use it.
  // This is common for device-by-name tools (e.g. lights) and is more reliable than
  // a second lookup when the tool already did the resolution.
  const resolveFromResult = (r) => {
    if (!r || typeof r !== 'object') return null;

    const resolve = r?.result?.resolve
      || r?.result?.result?.resolve
      || r?.resolve
      || null;

    const roomName = resolve && resolve.room_name ? String(resolve.room_name).trim() : '';
    const roomIdRaw = resolve && resolve.room_id !== undefined && resolve.room_id !== null
      ? resolve.room_id
      : null;
    const roomId = roomIdRaw !== null && String(roomIdRaw).trim() !== '' ? Number(roomIdRaw) : null;

    if (roomName || Number.isFinite(roomId)) {
      return {
        room_name: roomName || null,
        room_id: Number.isFinite(roomId) ? roomId : null,
      };
    }

    // Fallback: some tools may return room fields directly.
    const directRoomName = r?.result?.room_name ? String(r.result.room_name).trim() : '';
    const directRoomIdRaw = (r?.result?.room_id !== undefined && r?.result?.room_id !== null)
      ? r.result.room_id
      : null;
    const directRoomId = directRoomIdRaw !== null && String(directRoomIdRaw).trim() !== ''
      ? Number(directRoomIdRaw)
      : null;

    if (directRoomName || Number.isFinite(directRoomId)) {
      return {
        room_name: directRoomName || null,
        room_id: Number.isFinite(directRoomId) ? directRoomId : null,
      };
    }

    return null;
  };

  const roomFromMcp = resolveFromResult(mcpResult);
  if (roomFromMcp) {
    const roomName = roomFromMcp.room_name ? String(roomFromMcp.room_name).trim() : '';
    const roomId = roomFromMcp.room_id !== null && roomFromMcp.room_id !== undefined
      ? Number(roomFromMcp.room_id)
      : null;

    if (roomName) {
      ws.currentRoom = {
        room_id: Number.isFinite(roomId) ? roomId : null,
        room_name: roomName,
        updatedAt: new Date().toISOString(),
      };
      if (typeof wsMessages.sendRoomContext === 'function') {
        wsMessages.sendRoomContext(ws, ws.currentRoom, 'result');
      }
      return;
    }

    if (Number.isFinite(roomId)) {
      const resolvedName = await _resolveRoomNameByIdBestEffort(mcpClient, correlationId, sessionId, roomId);
      if (resolvedName) {
        ws.currentRoom = {
          room_id: roomId,
          room_name: resolvedName,
          updatedAt: new Date().toISOString(),
        };
        if (typeof wsMessages.sendRoomContext === 'function') {
          wsMessages.sendRoomContext(ws, ws.currentRoom, 'result');
        }
      }
      return;
    }
  }

  // If the tool returned a clarification, the command hasn't actually executed.
  // Avoid making additional lookups (which can be wrong/noisy) and wait until
  // we have a resolved command result.
  if (mcpResult && mcpResult.clarification) return;

  // 3) Device-by-name tools: resolve the device's room via c4_find_devices.
  const deviceByNameTools = new Set([
    'c4_light_set_by_name',
    'c4_light_toggle_by_name',
    'c4_light_set_level_by_name',
    'c4_tv_watch_by_name',
    'c4_room_listen_by_name',
  ]);

  if (!deviceByNameTools.has(tool)) return;

  const deviceName = typeof args.device_name === 'string'
    ? args.device_name.trim()
    : (typeof args.source_device_name === 'string' ? args.source_device_name.trim() : '');
  if (!deviceName) return;

  let category = null;
  if (tool.startsWith('c4_light_')) category = 'lights';

  try {
    const findArgs = {
      search: deviceName,
      limit: 8,
      include_raw: false,
    };
    if (category) findArgs.category = category;

    const resp = await mcpClient.sendCommand({ tool: 'c4_find_devices', args: findArgs }, correlationId, sessionId);
    const devices = _extractDevicesFromFindDevicesResult(resp);
    const best = _pickBestDeviceByName(devices, deviceName);
    const room = best ? _extractRoomFromDevice(best) : null;

    const roomName = room && room.room_name ? String(room.room_name).trim() : '';
    const roomId = room && room.room_id !== null && room.room_id !== undefined ? Number(room.room_id) : null;

    if (roomName) {
      ws.currentRoom = {
        room_id: Number.isFinite(roomId) ? roomId : null,
        room_name: roomName,
        updatedAt: new Date().toISOString(),
      };
      if (typeof wsMessages.sendRoomContext === 'function') {
        wsMessages.sendRoomContext(ws, ws.currentRoom, 'device');
      }
      return;
    }

    if (Number.isFinite(roomId)) {
      const resolvedName = await _resolveRoomNameByIdBestEffort(mcpClient, correlationId, sessionId, roomId);
      if (resolvedName) {
        ws.currentRoom = {
          room_id: roomId,
          room_name: resolvedName,
          updatedAt: new Date().toISOString(),
        };
        if (typeof wsMessages.sendRoomContext === 'function') {
          wsMessages.sendRoomContext(ws, ws.currentRoom, 'device');
        }
      }
    }
  } catch {
    // Best-effort only.
  }
};

const _bestEffortPickClarificationChoiceIndex = (ws, clarification) => {
  if (!ws || !clarification || typeof clarification !== 'object') return null;
  if (!ws.currentRoom || typeof ws.currentRoom !== 'object') return null;

  const candidates = Array.isArray(clarification.candidates) ? clarification.candidates : [];
  if (!candidates.length) return null;

  const currentRoomId = ws.currentRoom.room_id !== undefined && ws.currentRoom.room_id !== null
    ? Number(ws.currentRoom.room_id)
    : null;
  const currentRoomName = ws.currentRoom.room_name ? String(ws.currentRoom.room_name).trim().toLowerCase() : '';

  const isSameRoom = (c) => {
    if (!c || typeof c !== 'object') return false;
    if (Number.isFinite(currentRoomId) && c.room_id !== undefined && c.room_id !== null) {
      return Number(c.room_id) === currentRoomId;
    }
    if (currentRoomName && c.room_name) {
      return String(c.room_name).trim().toLowerCase() === currentRoomName;
    }
    return false;
  };

  const inRoom = candidates
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => isSameRoom(c));

  if (!inRoom.length) return null;

  // If there is exactly one candidate in the current room, it's usually the right one.
  if (inRoom.length === 1) return inRoom[0].idx;

  // Otherwise, prefer the highest score among in-room candidates when the margin is clear.
  const scored = inRoom
    .map(({ c, idx }) => ({ idx, score: (c && c.score !== null && c.score !== undefined) ? Number(c.score) : null }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => Number(b.score) - Number(a.score));

  if (scored.length >= 2) {
    const margin = Number(scored[0].score) - Number(scored[1].score);
    if (margin >= 10) return scored[0].idx;
  }
  if (scored.length === 1) return scored[0].idx;

  // Fall back to first in-room.
  return inRoom[0].idx;
};

const _sortClarificationCandidatesInPlaceBestEffort = (ws, clarification) => {
  if (!ws || !clarification || typeof clarification !== 'object') return;
  if (!ws.currentRoom || typeof ws.currentRoom !== 'object') return;
  if (!Array.isArray(clarification.candidates) || clarification.candidates.length < 2) return;

  const currentRoomId = ws.currentRoom.room_id !== undefined && ws.currentRoom.room_id !== null
    ? Number(ws.currentRoom.room_id)
    : null;
  const currentRoomName = ws.currentRoom.room_name ? String(ws.currentRoom.room_name).trim().toLowerCase() : '';

  const roomBoost = (c) => {
    if (!c || typeof c !== 'object') return 0;
    if (Number.isFinite(currentRoomId) && c.room_id !== undefined && c.room_id !== null && Number(c.room_id) === currentRoomId) return 1000;
    if (currentRoomName && c.room_name && String(c.room_name).trim().toLowerCase() === currentRoomName) return 1000;
    return 0;
  };

  clarification.candidates.sort((a, b) => {
    const aBoost = roomBoost(a);
    const bBoost = roomBoost(b);
    if (aBoost !== bBoost) return bBoost - aBoost;

    const aScore = (a && a.score !== null && a.score !== undefined) ? Number(a.score) : null;
    const bScore = (b && b.score !== null && b.score !== undefined) ? Number(b.score) : null;
    if (Number.isFinite(aScore) && Number.isFinite(bScore) && aScore !== bScore) return Number(bScore) - Number(aScore);
    return 0;
  });
};

const _bestEffortPreflightRoomNameRequiredTools = async (ws, transcript, {
  wsMessages,
  mcpClient,
  intent,
  correlationId,
  sessionId,
} = {}) => {
  if (!ws || !wsMessages || !mcpClient || !intent) return { didHandle: false };

  const tool = String(intent.tool || '');
  const args = (intent.args && typeof intent.args === 'object') ? intent.args : {};
  intent.args = args;

  const roomNameRequiredTools = new Set([
    'c4_tv_watch_by_name',
    'c4_room_listen_by_name',
  ]);

  if (!roomNameRequiredTools.has(tool)) return { didHandle: false };

  const hasRoomName = typeof args.room_name === 'string' && args.room_name.trim() !== '';
  const hasRoomId = args.room_id !== undefined && args.room_id !== null && String(args.room_id).trim() !== '';
  if (hasRoomName) return { didHandle: false };
  if (hasRoomId) return { didHandle: false };

  // If we have a current room, command-orchestrator will inject it. No need to do more here.
  if (ws.currentRoom && typeof ws.currentRoom === 'object' && ws.currentRoom.room_name) {
    return { didHandle: false };
  }

  const queryName = (typeof args.source_device_name === 'string' && args.source_device_name.trim())
    ? args.source_device_name.trim()
    : (typeof args.device_name === 'string' && args.device_name.trim() ? args.device_name.trim() : '');

  // Best-effort deterministic disambiguation: if the named device exists in exactly one room,
  // inject room_id and proceed without asking the user.
  if (tool === 'c4_tv_watch_by_name' && queryName) {
    try {
      const findResp = await mcpClient.sendCommand({
        tool: 'c4_find_devices',
        args: {
          query: queryName,
        },
      }, correlationId, sessionId);

      const devices = _extractDevicesFromFindDevicesResult(findResp);
      const q = queryName.toLowerCase();
      const exact = devices.filter((d) => _extractDeviceName(d).toLowerCase() === q);
      const candidates = exact.length ? exact : devices.filter((d) => _extractDeviceName(d).toLowerCase().includes(q));

      const roomIds = new Set();
      for (const d of candidates) {
        const room = _extractRoomFromDevice(d);
        if (room && Number.isFinite(room.room_id)) roomIds.add(Number(room.room_id));
      }

      if (roomIds.size === 1) {
        const [onlyRoomId] = Array.from(roomIds);
        args.room_id = String(onlyRoomId);
        if (args.room_name !== undefined) delete args.room_name;
        return { didHandle: false };
      }
    } catch {
      // Best-effort only. Fall through to asking user.
    }
  }

  // Gemini should decide ambiguity. If we don't have a room, ask the user explicitly
  // (best-effort populate options via c4_list_rooms).
  let roomCandidates = [];
  try {
    roomCandidates = await buildRoomCandidatesFromListRooms(mcpClient, correlationId, sessionId);
  } catch {
    roomCandidates = [];
  }

  const clarification = {
    kind: 'room',
    query: queryName || null,
    prompt: queryName ? `Which room should I use for ${queryName}?` : 'Which room should I use?',
    candidates: roomCandidates,
  };
  ws.pendingClarification = { transcript, intent, clarification };
  wsMessages.sendClarificationRequired(ws, transcript, intent, clarification);
  return { didHandle: true };
};

async function processTranscript(ws, transcript, {
  logger,
  wsMessages,
  parseIntent,
  mcpClient,
  roomAliases,
} = {}) {
  const config = require('../config');

  if (!ws || !wsMessages || !logger || !parseIntent || !mcpClient || !roomAliases) {
    throw new Error('ws-audio-pipeline: missing dependencies');
  }

  try {
    const safeTranscript = (typeof transcript === 'string') ? transcript : '';

    // Step 2: Intent parsing (Gemini decides)
    wsMessages.sendProcessing(ws, 'intent-parsing');

    const toolCatalog = (mcpClient && typeof mcpClient.getAllowedToolCatalogForLlm === 'function')
      ? await mcpClient.getAllowedToolCatalogForLlm(ws.correlationId)
      : null;

    const intent = await parseIntent(safeTranscript, ws.correlationId, {
      toolCatalog,
      context: {
        currentRoom: ws.currentRoom && typeof ws.currentRoom === 'object'
          ? {
            room_id: ws.currentRoom.room_id !== undefined && ws.currentRoom.room_id !== null
              ? Number(ws.currentRoom.room_id)
              : null,
            room_name: ws.currentRoom.room_name ? String(ws.currentRoom.room_name) : null,
          }
          : null,
      },
    });

    const { executePlannedCommand } = require('./command-orchestrator');

    wsMessages.sendIntent(ws, intent);

    // Preflight: some tools require room_name; avoid calling MCP in a way that will 500.
    const preflight = await _bestEffortPreflightRoomNameRequiredTools(ws, safeTranscript, {
      wsMessages,
      mcpClient,
      intent,
      correlationId: ws.correlationId,
      sessionId: ws.user?.deviceId,
    });
    if (preflight && preflight.didHandle) {
      ws.audioChunks = [];
      return;
    }

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

    // Special-case: when the AI requests available video sources, convert the result
    // into a clarification prompt so the user can pick the source.
    if (intent && intent.tool === 'c4_room_list_video_devices') {
      const rawDevices = mcpResult?.result?.result?.devices || mcpResult?.result?.devices;
      const devices = Array.isArray(rawDevices) ? rawDevices : [];

      const roomId = (intent.args && intent.args.room_id !== undefined && intent.args.room_id !== null)
        ? String(intent.args.room_id)
        : (ws.currentRoom && ws.currentRoom.room_id !== undefined && ws.currentRoom.room_id !== null)
          ? String(ws.currentRoom.room_id)
          : '';

      const candidates = devices
        .map((d) => {
          if (!d || typeof d !== 'object') return null;
          const name = d.name || d.label || d.display || d.displayName;
          const id = d.deviceId !== undefined ? d.deviceId
            : d.device_id !== undefined ? d.device_id
              : d.id !== undefined ? d.id
                : null;

          if (!name || id === null || id === undefined) return null;
          return {
            name: String(name),
            device_id: String(id),
            room_id: roomId ? Number(roomId) : null,
          };
        })
        .filter((c) => c && c.name)
        .slice(0, 12);

      if (!candidates.length) {
        wsMessages.sendError(ws, {
          code: 'NO_TV_SOURCES',
          message: 'I could not find any TV/video sources for this room.',
        });
        ws.audioChunks = [];
        return;
      }

      if (candidates.length === 1 && roomId) {
        const only = candidates[0];
        const watchIntent = {
          tool: 'c4_tv_watch',
          args: {
            room_id: String(roomId),
            source_device_id: String(only.device_id),
          },
        };

        wsMessages.sendProcessing(ws, 'executing');
        wsMessages.sendIntent(ws, watchIntent);

        const { command: rerun } = await executePlannedCommand(watchIntent, {
          correlationId: ws.correlationId,
          sessionId: ws.user?.deviceId,
          mcpClient,
          logger,
          ws,
          roomAliases,
        });

        if (!rerun || rerun.success !== true) {
          const errorMessage = rerun && rerun.result && rerun.result.error
            ? rerun.result.error
            : 'Command failed';
          throw new Error(errorMessage);
        }

        wsMessages.sendCommandComplete(ws, rerun, safeTranscript, watchIntent);
        ws.audioChunks = [];
        return;
      }

      const promptRoom = ws.currentRoom && ws.currentRoom.room_name ? String(ws.currentRoom.room_name) : 'this room';
      const clarification = {
        kind: 'device',
        query: null,
        prompt: `Which source should I turn on in ${promptRoom}?`,
        candidates,
      };

      const intentForChoice = {
        tool: 'c4_tv_watch',
        args: roomId ? { room_id: String(roomId) } : {},
      };

      ws.pendingClarification = {
        transcript: safeTranscript,
        intent: intentForChoice,
        clarification,
      };

      wsMessages.sendClarificationRequired(ws, safeTranscript, intentForChoice, clarification);
      ws.audioChunks = [];
      return;
    }

    // Best-effort: update the UI room context based on intent args (room_id/room_name)
    // or, for device-by-name tools, the target device's room.
    await _bestEffortEmitRoomContext(ws, safeTranscript, {
      wsMessages,
      mcpClient,
      correlationId: ws.correlationId,
      sessionId: ws.user?.deviceId,
      intent,
      mcpResult,
    });

    if (mcpResult && mcpResult.clarification) {
      // Best-effort: keep UI choices friendly by sorting candidates, but do NOT auto-select.
      try {
        _sortClarificationCandidatesInPlaceBestEffort(ws, mcpResult.clarification);
      } catch {
        // Best-effort only.
      }

      ws.pendingClarification = {
        transcript: safeTranscript,
        intent,
        clarification: mcpResult.clarification,
      };

      wsMessages.sendClarificationRequired(ws, safeTranscript, intent, mcpResult.clarification);
      ws.audioChunks = [];
      return;
    }

    if (!mcpResult || mcpResult.success !== true) {
      const errorMessage = mcpResult && mcpResult.result && mcpResult.result.error
        ? mcpResult.result.error
        : 'Command failed';
      throw new Error(errorMessage);
    }

    wsMessages.sendCommandComplete(ws, mcpResult, safeTranscript, intent);

    ws.audioChunks = [];
  } catch (error) {
    logger.error('Error processing transcript', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    wsMessages.sendError(ws, {
      code: 'PROCESSING_ERROR',
      message: error.message,
    });

    ws.audioChunks = [];
  }
}

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
    await processTranscript(ws, sttResult.transcript, {
      logger,
      wsMessages,
      parseIntent,
      mcpClient,
      roomAliases,
    });
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
  processTranscript,
};

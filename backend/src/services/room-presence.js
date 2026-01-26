function _safeString(x) {
  if (x === null || x === undefined) return '';
  return String(x);
}

function _extractRoomsFromFindRoomsResult(resp) {
  const rooms = resp?.result?.result?.rooms
    || resp?.result?.rooms
    || resp?.result?.result?.result?.rooms
    || resp?.result?.result?.result?.result?.rooms;

  return Array.isArray(rooms) ? rooms : [];
}

function _normalizeRoomCandidates(rooms, limit = 12) {
  return (rooms || [])
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const name = r.name || r.room_name || r.roomName || r.title || r.roomName;
      const roomId = (r.room_id !== undefined && r.room_id !== null) ? r.room_id
        : (r.roomId !== undefined && r.roomId !== null) ? r.roomId
          : (r.id !== undefined && r.id !== null) ? r.id
            : null;

      return {
        name: name ? String(name) : null,
        room_id: roomId !== null && roomId !== undefined ? Number(roomId) : null,
      };
    })
    .filter((c) => c && c.name)
    .slice(0, limit);
}

function _extractDevicesFromFindDevicesResult(resp) {
  const devices = resp?.result?.devices
    || resp?.result?.result?.devices
    || resp?.result?.result
    || resp?.result?.result?.result
    || resp?.result?.result?.result?.devices;

  return Array.isArray(devices) ? devices : [];
}

function _normalizeDeviceCandidates(devices, limit = 20) {
  return (devices || [])
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const name = d.name || d.device_name || d.title;
      const deviceId = (d.device_id !== undefined && d.device_id !== null) ? d.device_id
        : (d.id !== undefined && d.id !== null) ? d.id
          : (d.deviceId !== undefined && d.deviceId !== null) ? d.deviceId
            : null;

      return {
        name: name ? String(name) : null,
        device_id: deviceId !== null && deviceId !== undefined ? String(deviceId) : null,
      };
    })
    .filter((c) => c && c.name && c.device_id)
    .slice(0, limit);
}

async function findRoomCandidatesByName(mcpClient, query, correlationId, sessionId) {
  const resp = await mcpClient.sendCommand({
    tool: 'c4_find_rooms',
    args: { search: _safeString(query), limit: 12, include_raw: false },
  }, correlationId, sessionId);

  const rooms = _extractRoomsFromFindRoomsResult(resp);
  return _normalizeRoomCandidates(rooms, 12);
}

async function buildRoomPresenceReport(mcpClient, roomChoice, correlationId, sessionId) {
  const roomId = roomChoice && roomChoice.room_id !== undefined && roomChoice.room_id !== null
    ? Number(roomChoice.room_id)
    : null;
  const roomName = roomChoice && roomChoice.name ? String(roomChoice.name) : null;

  // Do the read-only status calls in parallel to keep this snappy over slow gateways.
  const [watchStatus, listenStatus, nowPlaying, lightsFound] = await Promise.all([
    mcpClient.sendCommand(
      { tool: 'c4_room_watch_status', args: { room_id: String(roomId) } },
      correlationId,
      sessionId,
    ),
    mcpClient.sendCommand(
      { tool: 'c4_room_listen_status', args: { room_id: String(roomId) } },
      correlationId,
      sessionId,
    ),
    mcpClient.sendCommand(
      { tool: 'c4_room_now_playing', args: { room_id: String(roomId), max_sources: 30 } },
      correlationId,
      sessionId,
    ),
    mcpClient.sendCommand(
      { tool: 'c4_find_devices', args: { category: 'lights', room_id: String(roomId), limit: 25, include_raw: false } },
      correlationId,
      sessionId,
    ),
  ]);

  const lightDevices = _normalizeDeviceCandidates(_extractDevicesFromFindDevicesResult(lightsFound), 25);

  const sampleLimit = Math.min(lightDevices.length, 6);
  const lightSamples = await Promise.all(
    lightDevices
      .slice(0, sampleLimit)
      .map(async (d) => {
        const levelResp = await mcpClient.sendCommand(
          { tool: 'c4_light_get_level', args: { device_id: String(d.device_id) } },
          correlationId,
          sessionId,
        );

        const level = levelResp?.result?.level !== undefined
          ? Number(levelResp.result.level)
          : (levelResp?.result?.result?.level !== undefined ? Number(levelResp.result.result.level) : null);

        return {
          name: d.name,
          device_id: d.device_id,
          level: Number.isFinite(level) ? level : null,
          raw: levelResp,
        };
      }),
  );

  const lightsOn = lightSamples.filter((l) => Number.isFinite(Number(l.level)) && Number(l.level) > 0);

  const topOn = lightsOn
    .slice(0, 6)
    .map((l) => `${l.name}${Number.isFinite(Number(l.level)) ? ` (${Math.round(Number(l.level))}%)` : ''}`);

  // Very lightweight now-playing summary (best-effort).
  const np = nowPlaying?.result;
  const normalized = np?.normalized || np?.result?.normalized || np?.result?.result?.normalized || null;
  const title = normalized && (normalized.title || normalized.track || normalized.name) ? _safeString(normalized.title || normalized.track || normalized.name) : '';
  const artist = normalized && (normalized.artist || normalized.subtitle) ? _safeString(normalized.artist || normalized.subtitle) : '';
  const source = normalized && (normalized.source || normalized.source_name || normalized.app) ? _safeString(normalized.source || normalized.source_name || normalized.app) : '';
  const nowPlayingSummary = title
    ? `Now playing: ${title}${artist ? ` — ${artist}` : ''}${source ? ` (${source})` : ''}`
    : '';

  const lightsSummary = lightDevices.length
    ? `${lightsOn.length} light(s) on${topOn.length ? `: ${topOn.join(', ')}` : ''}`
    : 'No lights found';

  const summary = `${roomName || 'Room'}: ${lightsSummary}${nowPlayingSummary ? `. ${nowPlayingSummary}` : ''}`;

  return {
    success: true,
    message: summary,
    aggregate: {
      kind: 'room-presence',
      room_name: roomName,
      room_id: roomId,
      lights_found: lightDevices.length,
      lights_sampled: lightSamples.length,
      lights_on: lightsOn.length,
      summary,
    },
    results: {
      lights: {
        discovered: lightsFound,
        sampled: lightSamples,
      },
      media: {
        watch_status: watchStatus,
        listen_status: listenStatus,
        now_playing: nowPlaying,
      },
    },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  findRoomCandidatesByName,
  buildRoomPresenceReport,
};

const mcpClient = require('./mcp-client');

describe('MCPClient.buildRefinedIntentFromChoice', () => {
  test('c4_room_lights_set prefers room_id and removes room_name', () => {
    const originalIntent = {
      tool: 'c4_room_lights_set',
      args: {
        room_name: 'Basement',
        state: 'off',
      },
    };

    const choice = {
      name: 'Basement Stairs',
      room_id: 455,
    };

    const refined = mcpClient.buildRefinedIntentFromChoice(originalIntent, choice);

    expect(refined).toEqual({
      tool: 'c4_room_lights_set',
      args: {
        state: 'off',
        require_unique: true,
        include_candidates: true,
        room_id: 455,
      },
    });
  });

  test('c4_room_lights_set falls back to room_name when room_id is missing', () => {
    const originalIntent = {
      tool: 'c4_room_lights_set',
      args: {
        room_id: 455,
        state: 'on',
      },
    };

    const choice = {
      name: 'Basement Stairs',
      room_id: null,
    };

    const refined = mcpClient.buildRefinedIntentFromChoice(originalIntent, choice);

    expect(refined).toEqual({
      tool: 'c4_room_lights_set',
      args: {
        state: 'on',
        require_unique: true,
        include_candidates: true,
        room_name: 'Basement Stairs',
      },
    });
  });

  test('c4_scene_activate_by_name uses choice.name as scene_name', () => {
    const originalIntent = {
      tool: 'c4_scene_activate_by_name',
      args: {
        scene_name: 'Romantic',
      },
    };

    const choice = {
      name: 'Movie Time',
    };

    const refined = mcpClient.buildRefinedIntentFromChoice(originalIntent, choice);

    expect(refined).toEqual({
      tool: 'c4_scene_activate_by_name',
      args: {
        scene_name: 'Movie Time',
        require_unique: true,
        include_candidates: true,
      },
    });
  });

  test('c4_scene_set_state_by_name uses choice.name as scene_name', () => {
    const originalIntent = {
      tool: 'c4_scene_set_state_by_name',
      args: {
        scene_name: 'Relax',
        state: 'on',
      },
    };

    const choice = {
      name: 'Romantic',
    };

    const refined = mcpClient.buildRefinedIntentFromChoice(originalIntent, choice);

    expect(refined).toEqual({
      tool: 'c4_scene_set_state_by_name',
      args: {
        state: 'on',
        scene_name: 'Romantic',
        require_unique: true,
        include_candidates: true,
      },
    });
  });

  test('c4_room_listen_by_name keeps source_device_name when clarifying room', () => {
    const originalIntent = {
      tool: 'c4_room_listen_by_name',
      args: {
        source_device_name: 'Spotify',
      },
    };

    const choice = {
      name: 'Family Room',
      room_id: 101,
      device_id: null,
    };

    const refined = mcpClient.buildRefinedIntentFromChoice(originalIntent, choice);

    expect(refined).toEqual({
      tool: 'c4_room_listen_by_name',
      args: {
        source_device_name: 'Spotify',
        require_unique: true,
        include_candidates: true,
        room_id: 101,
        room_name: 'Family Room',
      },
    });
  });

  test('c4_room_listen_by_name uses choice.name as source_device_name for device candidate', () => {
    const originalIntent = {
      tool: 'c4_room_listen_by_name',
      args: {
        room_name: 'Family Room',
        source_device_name: 'Spotify',
      },
    };

    const choice = {
      name: 'Pandora',
      device_id: 'dev-123',
    };

    const refined = mcpClient.buildRefinedIntentFromChoice(originalIntent, choice);

    expect(refined).toEqual({
      tool: 'c4_room_listen_by_name',
      args: {
        room_name: 'Family Room',
        source_device_name: 'Pandora',
        require_unique: true,
        include_candidates: true,
      },
    });
  });

  test('c4_room_presence_report prefers room_id for room candidate', () => {
    const refined = mcpClient.buildRefinedIntentFromChoice(
      { tool: 'c4_room_presence_report', args: { room_name: 'Basement' } },
      { name: 'Basement Stairs', room_id: 455 },
    );

    expect(refined).toEqual({
      tool: 'c4_room_presence_report',
      args: {
        room_name: 'Basement Stairs',
        room_id: 455,
        require_unique: true,
        include_candidates: true,
      },
    });
  });
});

describe('MCPClient.sendCommand arg normalization', () => {
  test('normalizes c4_tv_watch_by_name room -> room_name and device_name -> source_device_name', async () => {
    const client = new mcpClient.constructor();
    // Bypass allowlist + HTTP call and just inspect what sendCommand would pass into callTool.
    client._assertToolAllowed = () => {};
    client.callTool = jest.fn().mockResolvedValue({ result: { ok: true } });

    await client.sendCommand({
      tool: 'c4_tv_watch_by_name',
      args: { room: 'Basement', device_name: 'Roku' },
    }, 'corr-1', 'sess-1');

    expect(client.callTool).toHaveBeenCalledWith(
      'c4_tv_watch_by_name',
      { room_name: 'Basement', source_device_name: 'Roku' },
      'corr-1',
      'sess-1',
    );
  });

  test('strips include_candidates for c4_room_presence_report to avoid MCP schema 500', async () => {
    const client = new mcpClient.constructor();
    client._assertToolAllowed = () => {};
    client.callTool = jest.fn().mockResolvedValue({ result: { ok: true } });

    await client.sendCommand({
      tool: 'c4_room_presence_report',
      args: { room_name: 'Basement', include_candidates: true, require_unique: true },
    }, 'corr-2', 'sess-2');

    expect(client.callTool).toHaveBeenCalledWith(
      'c4_room_presence_report',
      { room_name: 'Basement' },
      'corr-2',
      'sess-2',
    );
  });
});

describe('MCPClient._extractAmbiguity', () => {
  test('prefers device_name, adds room-aware label, and filters low-score noise for device ambiguity', () => {
    const toolResp = {
      result: {
        ok: false,
        error: 'Ambiguous',
        details: {
          error: 'ambiguous',
          matches: [
            {
              name: 'TV',
              device_name: 'Apple TV',
              room_name: 'Family Room',
              room_id: 6,
              device_id: '2119',
              score: 100,
            },
            {
              name: 'Plex',
              device_name: 'Plex',
              room_name: 'TV Room',
              room_id: 8,
              device_id: '1888',
              score: 35,
            },
          ],
        },
      },
    };

    const clarification = mcpClient._extractAmbiguity(
      'c4_tv_watch_by_name',
      { source_device_name: 'Apple TV' },
      toolResp,
    );

    expect(clarification.kind).toBe('device');
    expect(clarification.query).toBe('Apple TV');
    expect(clarification.candidates).toEqual([
      {
        name: 'Apple TV',
        label: 'Family Room — Apple TV',
        room_id: 6,
        room_name: 'Family Room',
        device_name: 'Apple TV',
        device_id: '2119',
        score: 100,
      },
    ]);
  });

  test('extracts room ambiguity from c4_room_presence_report (inner.error=ambiguous)', () => {
    const toolResp = {
      result: {
        ok: false,
        error: 'ambiguous',
        details: {
          matches: [
            { name: 'TV Room', room_id: 101, room_name: 'TV Room' },
            { name: 'Basement Gym', room_id: 202, room_name: 'Basement Gym' },
          ],
        },
      },
    };

    const clarification = mcpClient._extractAmbiguity(
      'c4_room_presence_report',
      { room_name: 'Basement' },
      toolResp,
    );

    expect(clarification).toMatchObject({
      kind: 'room',
      query: 'Basement',
    });
    expect(Array.isArray(clarification.candidates)).toBe(true);
    expect(clarification.candidates.map((c) => c.name)).toEqual(['TV Room', 'Basement Gym']);
    expect(clarification.candidates[0]).toMatchObject({ room_id: 101, room_name: 'TV Room' });
  });

  test('extracts room ambiguity from c4_room_presence_report (matches on inner)', () => {
    const toolResp = {
      result: {
        ok: false,
        error: 'ambiguous',
        details: "Multiple rooms could match 'Basement' (prefix match).",
        candidates: [
          { name: 'Basement Stairs', room_id: 455, score: 83 },
          { name: 'Basement Bathroom', room_id: 402, score: 81 },
        ],
        matches: [
          { name: 'Basement Stairs', room_id: 455, score: 83 },
          { name: 'Basement Bathroom', room_id: 402, score: 81 },
        ],
      },
    };

    const clarification = mcpClient._extractAmbiguity(
      'c4_room_presence_report',
      { room_name: 'Basement' },
      toolResp,
    );

    expect(clarification).toMatchObject({
      kind: 'room',
      query: 'Basement',
    });
    expect(clarification.message).toContain('Multiple rooms could match');
    expect(clarification.candidates.map((c) => c.name)).toEqual(['Basement Stairs', 'Basement Bathroom']);
  });
});

describe('MCPClient.sendCommand', () => {
  test('normalizes c4_tv_watch_by_name device_name -> source_device_name and strips device_name', async () => {
    const originalCallTool = mcpClient.callTool;
    mcpClient.callTool = jest.fn().mockResolvedValue({ result: { ok: true } });

    try {
      const intent = {
        tool: 'c4_tv_watch_by_name',
        args: {
          room_name: 'Basement',
          device_name: 'Roku',
        },
      };

      const resp = await mcpClient.sendCommand(intent, 'corr-1', 'sess-1');

      expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
      expect(mcpClient.callTool).toHaveBeenCalledWith(
        'c4_tv_watch_by_name',
        {
          room_name: 'Basement',
          source_device_name: 'Roku',
        },
        'corr-1',
        'sess-1',
      );
      expect(resp.success).toBe(true);
      expect(resp.args).toEqual({ room_name: 'Basement', source_device_name: 'Roku' });
    } finally {
      mcpClient.callTool = originalCallTool;
    }
  });

  test('normalizes c4_tv_watch_by_name video_device_name -> source_device_name and strips video_device_name', async () => {
    const originalCallTool = mcpClient.callTool;
    mcpClient.callTool = jest.fn().mockResolvedValue({ result: { ok: true } });

    try {
      const intent = {
        tool: 'c4_tv_watch_by_name',
        args: {
          room_name: 'Basement',
          video_device_name: 'Roku',
        },
      };

      const resp = await mcpClient.sendCommand(intent, 'corr-2', 'sess-2');

      expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
      expect(mcpClient.callTool).toHaveBeenCalledWith(
        'c4_tv_watch_by_name',
        {
          room_name: 'Basement',
          source_device_name: 'Roku',
        },
        'corr-2',
        'sess-2',
      );
      expect(resp.success).toBe(true);
      expect(resp.args).toEqual({ room_name: 'Basement', source_device_name: 'Roku' });
    } finally {
      mcpClient.callTool = originalCallTool;
    }
  });
});

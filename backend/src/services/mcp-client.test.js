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
        include_candidates: false,
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
        include_candidates: false,
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
        include_candidates: false,
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
        include_candidates: false,
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
        include_candidates: false,
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
        include_candidates: false,
      },
    });
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
});

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
});

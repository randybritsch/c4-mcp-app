const roomAliases = require('./room-aliases');

describe('room-aliases.applyRoomAliasToIntent', () => {
  test('rewrites ambiguous "Basement" to default "TV Room" for c4_tv_watch_by_name', () => {
    const ws = { correlationId: 'corr-1' };
    const logger = { info: jest.fn() };

    const intent = {
      tool: 'c4_tv_watch_by_name',
      args: {
        room_name: 'Basement',
        source_device_name: 'Roku',
      },
    };

    roomAliases.applyRoomAliasToIntent({ ws, intent, logger });

    expect(intent.args.room_name).toBe('TV Room');
  });

  test('does not rewrite when room_id is already present', () => {
    const ws = { correlationId: 'corr-1' };
    const logger = { info: jest.fn() };

    const intent = {
      tool: 'c4_tv_watch_by_name',
      args: {
        room_id: 123,
        room_name: 'Basement',
        source_device_name: 'Roku',
      },
    };

    roomAliases.applyRoomAliasToIntent({ ws, intent, logger });

    expect(intent.args.room_name).toBe('Basement');
  });

  test('does not rewrite other tools (conservative default mapping)', () => {
    const ws = { correlationId: 'corr-1' };
    const logger = { info: jest.fn() };

    const intent = {
      tool: 'c4_room_lights_set',
      args: {
        room_name: 'Basement',
        state: 'on',
      },
    };

    roomAliases.applyRoomAliasToIntent({ ws, intent, logger });

    expect(intent.args.room_name).toBe('Basement');
  });
});

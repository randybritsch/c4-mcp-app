function loadProcessAudioStreamWithEnv(env) {
  const prev = { ...process.env };
  Object.assign(process.env, env || {});
  jest.resetModules();
  // eslint-disable-next-line global-require
  const { processAudioStream } = require('./ws-audio-pipeline');

  const restore = () => {
    process.env = prev;
    jest.resetModules();
  };

  return { processAudioStream, restore };
}

function makeWs() {
  return {
    correlationId: 'corr-1',
    user: { deviceId: 'device-1' },
    audioChunks: ['abc'],
    audioFormat: 'webm',
    audioSampleRateHertz: 48000,
    pendingClarification: null,
  };
}

describe('ws-audio-pipeline room-group auto-resolution', () => {
  test('does not auto-resolve room ambiguity; asks the user to choose', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on all the lights in the basement',
      confidence: 0.9,
    });

    const intent = {
      tool: 'c4_room_lights_set',
      args: { room_name: 'Basement', state: 'on' },
    };

    const parseIntent = jest.fn().mockResolvedValue(intent);

    const clarification = {
      kind: 'room',
      query: 'Basement',
      candidates: [
        { name: 'Basement Stairs', room_id: 455 },
        { name: 'Basement Bathroom', room_id: 456 },
      ],
    };

    const mcpClient = {
      sendCommand: jest
        .fn()
        // First call returns ambiguity
        .mockResolvedValueOnce({ clarification }),
      buildRefinedIntentFromChoice: jest.fn((orig, choice) => ({
        tool: orig.tool,
        args: {
          state: orig.args.state,
          require_unique: true,
          include_candidates: false,
          room_id: choice.room_id,
        },
      })),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);

    // sendCommand called only for the initial attempt
    expect(mcpClient.sendCommand).toHaveBeenCalledTimes(1);
  });
});

describe('ws-audio-pipeline mood recommendation', () => {
  test('delegates mood interpretation to parseIntent/LLM', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: 'true',
      MOOD_MUSIC_ENABLED: 'true',
      MOOD_MUSIC_SOURCE_NAME: 'Spotify',
    });

    const ws = makeWs();

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: "I'm in a romantic mood",
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_scene_activate_by_name',
      args: { scene_name: 'Romantic' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: true }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendClarificationRequired).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).toHaveBeenCalledTimes(1);

    restore();
  });
});

describe('ws-audio-pipeline room presence ("I\'m in <room>")', () => {
  test('unique match returns command-complete from c4_room_presence_report (Gemini decides)', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: "I'm in the Master Bedroom",
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_room_presence_report',
      args: { room_name: 'Master Bedroom' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({
        success: true,
        tool: 'c4_room_presence_report',
        args: { room_name: 'Master Bedroom' },
        result: {
          result: {
            room: { room_id: 123, room_name: 'Master Bedroom' },
            watch_status: { ok: true },
            listen_status: { ok: true },
            now_playing: { ok: true },
          },
        },
        timestamp: new Date().toISOString(),
      }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendClarificationRequired).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).toHaveBeenCalledTimes(1);

    expect(ws.currentRoom).toEqual(expect.objectContaining({ room_id: 123, room_name: 'Master Bedroom' }));

    const [_wsArg, result, transcript, intent] = wsMessages.sendCommandComplete.mock.calls[0];
    expect(transcript).toBe("I'm in the Master Bedroom");
    expect(intent).toEqual({ tool: 'c4_room_presence_report', args: { room_name: 'Master Bedroom' } });
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  test('ambiguous match triggers clarification-required (Gemini decides)', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: "I'm in the Basement",
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_room_presence_report',
      args: { room_name: 'Basement' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({
        success: false,
        tool: 'c4_room_presence_report',
        args: { room_name: 'Basement' },
        clarification: {
          kind: 'room',
          query: 'Basement',
          prompt: 'Which room are you in?',
          candidates: [
            { name: 'Basement Bathroom', room_id: 456 },
            { name: 'Basement Stairs', room_id: 455 },
          ],
        },
      }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);

    const [_wsArg, transcript, intent, clarification] = wsMessages.sendClarificationRequired.mock.calls[0];
    expect(transcript).toBe("I'm in the Basement");
    expect(intent).toEqual({ tool: 'c4_room_presence_report', args: { room_name: 'Basement' } });
    expect(clarification).toEqual(
      expect.objectContaining({
        kind: 'room',
        query: 'Basement',
        prompt: expect.stringContaining('Which room'),
        candidates: expect.any(Array),
      }),
    );

    expect(ws.pendingClarification).toEqual(
      expect.objectContaining({
        transcript: "I'm in the Basement",
        intent: { tool: 'c4_room_presence_report', args: { room_name: 'Basement' } },
      }),
    );
  });
});

describe('ws-audio-pipeline room_name-required tool preflight', () => {
  test('auto-resolves room when device uniquely maps to one room', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();
    ws.currentRoom = null;

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendRoomContext: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on the Apple TV',
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_tv_watch_by_name',
      args: { source_device_name: 'Apple TV' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockImplementation((intent) => {
        if (intent.tool === 'c4_find_devices') {
          return Promise.resolve({
            success: true,
            result: {
              result: {
                matches: [
                  {
                    name: 'Apple TV',
                    device_id: '2119',
                    room_id: 6,
                    room_name: 'Family Room',
                  },
                ],
              },
            },
          });
        }
        if (intent.tool === 'c4_list_rooms') {
          return Promise.resolve({
            success: true,
            result: { result: { rooms: [{ name: 'Family Room', id: 6 }, { name: 'Basement', id: 7 }] } },
          });
        }
        if (intent.tool === 'c4_tv_watch_by_name') {
          expect(intent.args.room_id).toBe('6');
          return Promise.resolve({ success: true, result: { ok: true } });
        }

        return Promise.resolve({ success: false, result: { error: `Unexpected tool: ${intent.tool}` } });
      }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(wsMessages.sendClarificationRequired).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).toHaveBeenCalledTimes(1);

    const toolsCalled = mcpClient.sendCommand.mock.calls.map((c) => c[0]?.tool);
    expect(toolsCalled).toContain('c4_find_devices');
    expect(toolsCalled).toContain('c4_tv_watch_by_name');
  });

  test('falls back to room clarification and populates candidates from c4_list_rooms when device room is not uniquely resolvable', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();
    ws.currentRoom = null;

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendRoomContext: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on the Apple TV',
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_tv_watch_by_name',
      args: { source_device_name: 'Apple TV' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockImplementation((intent) => {
        if (intent.tool === 'c4_find_devices') {
          return Promise.resolve({
            success: true,
            result: {
              result: {
                matches: [
                  { name: 'Apple TV', device_id: '2119', room_id: 6, room_name: 'Family Room' },
                  { name: 'Apple TV', device_id: '9999', room_id: 7, room_name: 'Basement' },
                ],
              },
            },
          });
        }
        if (intent.tool === 'c4_list_rooms') {
          return Promise.resolve({
            success: true,
            result: { result: { rooms: [{ name: 'Family Room', id: 6 }, { name: 'Basement', id: 7 }] } },
          });
        }
        if (intent.tool === 'c4_tv_watch_by_name') {
          return Promise.resolve({ success: false, result: { error: 'Should not call watch without room' } });
        }
        return Promise.resolve({ success: false, result: { error: `Unexpected tool: ${intent.tool}` } });
      }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);
    const clarification = wsMessages.sendClarificationRequired.mock.calls[0][3];
    expect(clarification.kind).toBe('room');
    expect(Array.isArray(clarification.candidates)).toBe(true);
    expect(clarification.candidates.length).toBeGreaterThan(0);

    const toolsCalled = mcpClient.sendCommand.mock.calls.map((c) => c[0]?.tool);
    expect(toolsCalled).toContain('c4_find_devices');
    expect(toolsCalled).toContain('c4_list_rooms');
    expect(toolsCalled).not.toContain('c4_tv_watch_by_name');
  });

  test('requires explicit room selection when device appears in multiple rooms', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();
    ws.currentRoom = null;

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendRoomContext: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on the Apple TV',
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_tv_watch_by_name',
      args: { source_device_name: 'Apple TV' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockImplementation((intent) => {
        if (intent.tool === 'c4_find_devices') {
          return Promise.resolve({
            success: true,
            result: {
              result: {
                matches: [
                  { name: 'Apple TV', device_id: '2119', room_id: 6, room_name: 'Family Room' },
                  { name: 'Apple TV', device_id: '9999', room_id: 7, room_name: 'Basement' },
                ],
              },
            },
          });
        }
        if (intent.tool === 'c4_list_rooms') {
          return Promise.resolve({
            success: true,
            result: { result: { rooms: [{ name: 'Family Room', id: 6 }, { name: 'Basement', id: 7 }] } },
          });
        }

        if (intent.tool === 'c4_tv_watch_by_name') {
          return Promise.resolve({ success: false, result: { error: 'Should not call watch without room' } });
        }

        return Promise.resolve({ success: false, result: { error: `Unexpected tool: ${intent.tool}` } });
      }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();

    const toolsCalled = mcpClient.sendCommand.mock.calls.map((c) => c[0]?.tool);
    expect(toolsCalled).toContain('c4_find_devices');
    expect(toolsCalled).toContain('c4_list_rooms');
    expect(toolsCalled).not.toContain('c4_tv_watch_by_name');
  });
});

describe('ws-audio-pipeline current-room biased ambiguity resolution', () => {
  test('does not auto-resolve TV device ambiguity; asks the user to choose', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = {
      ...makeWs(),
      currentRoom: { room_id: 6, room_name: 'Family Room' },
    };

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendRoomContext: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on the Apple TV',
      confidence: 0.9,
    });

    const intent = {
      tool: 'c4_tv_watch_by_name',
      args: { source_device_name: 'Apple TV' },
    };

    const parseIntent = jest.fn().mockResolvedValue(intent);

    const clarification = {
      kind: 'device',
      query: 'Apple TV',
      candidates: [
        { name: 'Basement Apple TV', room_id: 9, room_name: 'Basement', device_id: 'd-9', score: 95 },
        { name: 'Family Room Apple TV', room_id: 6, room_name: 'Family Room', device_id: 'd-6', score: 70 },
        { name: 'Kitchen Apple TV', room_id: 10, room_name: 'Kitchen', device_id: 'd-10', score: 90 },
      ],
    };

    const mcpClient = {
      sendCommand: jest
        .fn()
        .mockResolvedValueOnce({ clarification }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);
    expect(mcpClient.buildRefinedIntentFromChoice).not.toHaveBeenCalled();
    expect(mcpClient.sendCommand).toHaveBeenCalledTimes(1);
  });

  test('does not auto-resolve light device ambiguity; asks the user to choose', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = {
      ...makeWs(),
      currentRoom: { room_id: 6, room_name: 'Family Room' },
    };

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendRoomContext: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn off the lamp',
      confidence: 0.9,
    });

    const intent = {
      tool: 'c4_light_set_by_name',
      args: { device_name: 'Lamp', state: 'off' },
    };

    const parseIntent = jest.fn().mockResolvedValue(intent);

    const clarification = {
      kind: 'light',
      query: 'Lamp',
      candidates: [
        { name: 'Basement Lamp', room_id: 9, room_name: 'Basement', score: 90 },
        { name: 'Family Room Lamp', room_id: 6, room_name: 'Family Room', score: 75 },
      ],
    };

    const mcpClient = {
      sendCommand: jest
        .fn()
        .mockResolvedValueOnce({ clarification }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);
    expect(mcpClient.buildRefinedIntentFromChoice).not.toHaveBeenCalled();
    expect(mcpClient.sendCommand).toHaveBeenCalledTimes(1);
  });
});

describe('ws-audio-pipeline current-room shorthands', () => {
  test('"Turn on the lights" is interpreted by parseIntent using ws.currentRoom context', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();
    ws.currentRoom = { room_id: 1664, room_name: 'Basement Far Bedroom', updatedAt: new Date().toISOString() };

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on the lights',
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_room_lights_set',
      args: { room_id: '1664', state: 'on' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({
        success: true,
        tool: 'c4_room_lights_set',
        args: { room_id: '1664', state: 'on' },
        result: { ok: true },
        timestamp: new Date().toISOString(),
      }),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendClarificationRequired).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).toHaveBeenCalledTimes(1);

    expect(mcpClient.sendCommand).toHaveBeenCalledWith(
      { tool: 'c4_room_lights_set', args: { room_id: '1664', state: 'on' } },
      'corr-1',
      'device-1',
    );
  });

  test('"Turn off the far bedroom light" emits room-context via device room lookup', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendRoomContext: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn off the far bedroom light',
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_light_set_by_name',
      args: { device_name: 'Far Bedroom Light', state: 'off' },
    });

    const mcpClient = {
      sendCommand: jest
        .fn()
        // 1) execute the actual light command
        .mockResolvedValueOnce({
          success: true,
          tool: 'c4_light_set_by_name',
          args: { device_name: 'Far Bedroom Light', state: 'off' },
          result: { ok: true },
          timestamp: new Date().toISOString(),
        })
        // 2) best-effort room context: find the device so we can extract room
        .mockResolvedValueOnce({
          result: {
            devices: [
              { name: 'Far Bedroom Light', room_name: 'Far Bedroom', room_id: 123 },
            ],
          },
        }),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(wsMessages.sendRoomContext).toHaveBeenCalledTimes(1);
    expect(ws.currentRoom).toEqual(
      expect.objectContaining({ room_name: 'Far Bedroom', room_id: 123 }),
    );
  });

  test('"Turn on the TV" prompts for source when multiple video devices exist', async () => {
    const { processAudioStream, restore } = loadProcessAudioStreamWithEnv({
      MOOD_PLANS_ENABLED: '',
      MOOD_MUSIC_ENABLED: '',
      MOOD_MUSIC_SOURCE_NAME: '',
    });

    const ws = makeWs();
    ws.currentRoom = { room_id: 200, room_name: 'Family Room', updatedAt: new Date().toISOString() };

    const wsMessages = {
      sendError: jest.fn(),
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendCommandComplete: jest.fn(),
    };

    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const transcribeAudio = jest.fn().mockResolvedValue({
      transcript: 'Turn on the TV',
      confidence: 0.9,
    });

    const parseIntent = jest.fn().mockResolvedValue({
      tool: 'c4_room_list_video_devices',
      args: { room_id: '200' },
    });

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({
        success: true,
        result: {
          result: {
            devices: [
              { name: 'Roku', deviceId: 10 },
              { name: 'Apple TV', deviceId: 11 },
            ],
          },
        },
      }),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = {
      applyRoomAliasToIntent: jest.fn(),
    };

    await processAudioStream(ws, {
      logger,
      wsMessages,
      transcribeAudio,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    restore();

    expect(parseIntent).toHaveBeenCalledTimes(1);
    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);

    const [_wsArg, transcript, intent, clarification] = wsMessages.sendClarificationRequired.mock.calls[0];
    expect(transcript).toBe('Turn on the TV');
    expect(intent).toEqual({ tool: 'c4_tv_watch', args: { room_id: '200' } });
    expect(clarification).toEqual(
      expect.objectContaining({
        kind: 'device',
        prompt: expect.stringContaining('Which source'),
        candidates: expect.any(Array),
      }),
    );

    expect(ws.pendingClarification).toEqual(
      expect.objectContaining({
        transcript: 'Turn on the TV',
        intent: { tool: 'c4_tv_watch', args: { room_id: '200' } },
      }),
    );

    expect(mcpClient.sendCommand).toHaveBeenCalledWith(
      { tool: 'c4_room_list_video_devices', args: { room_id: '200' } },
      'corr-1',
      'device-1',
    );
  });
});

describe('ws-audio-pipeline TV follow-up controls use current room', () => {
  test('uses room-scoped TV remote intent from parseIntent', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const wsMessages = {
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendRoomContext: jest.fn(),
      sendError: jest.fn(),
    };

    const parseIntent = jest.fn(async () => ({ tool: 'c4_tv_remote', args: { button: 'mute', room_id: '6' } }));

    const mcpClient = {
      sendCommand: jest.fn(async (intent) => ({ success: true, tool: intent.tool, args: intent.args, result: { ok: true, result: { ok: true } } })),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = { applyRoomAliasToIntent: jest.fn() };

    const ws = {
      correlationId: 'corr-1',
      user: { deviceId: 'dev-1' },
      audioChunks: [],
      currentRoom: { room_id: 6, room_name: 'Family Room' },
    };

    const { processTranscript } = require('./ws-audio-pipeline');
    await processTranscript(ws, 'Mute the volume', {
      logger,
      wsMessages,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    const calls = mcpClient.sendCommand.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const first = calls[0][0];
    expect(first).toEqual({ tool: 'c4_tv_remote', args: { button: 'mute', room_id: '6' } });
  });

  test('uses room-scoped TV off intent from parseIntent', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const wsMessages = {
      sendProcessing: jest.fn(),
      sendTranscript: jest.fn(),
      sendIntent: jest.fn(),
      sendCommandComplete: jest.fn(),
      sendClarificationRequired: jest.fn(),
      sendRoomContext: jest.fn(),
      sendError: jest.fn(),
    };

    const parseIntent = jest.fn(async () => ({ tool: 'c4_tv_off', args: { room_id: '6' } }));

    const mcpClient = {
      sendCommand: jest.fn(async (intent) => ({ success: true, tool: intent.tool, args: intent.args, result: { ok: true, result: { ok: true } } })),
      buildRefinedIntentFromChoice: jest.fn(),
    };

    const roomAliases = { applyRoomAliasToIntent: jest.fn() };

    const ws = {
      correlationId: 'corr-1',
      user: { deviceId: 'dev-1' },
      audioChunks: [],
      currentRoom: { room_id: 6, room_name: 'Family Room' },
    };

    const { processTranscript } = require('./ws-audio-pipeline');
    await processTranscript(ws, 'Turn off the TV', {
      logger,
      wsMessages,
      parseIntent,
      mcpClient,
      roomAliases,
    });

    const calls = mcpClient.sendCommand.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const first = calls[0][0];
    expect(first).toEqual({ tool: 'c4_tv_off', args: { room_id: '6' } });
  });
});

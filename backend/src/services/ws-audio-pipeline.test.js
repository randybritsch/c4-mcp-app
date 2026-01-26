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
  test('auto-resolves room ambiguity for bulk lights command and returns command-complete', async () => {
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
        .mockResolvedValueOnce({ clarification })
        // Per-room fanout calls
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true }),
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

    expect(wsMessages.sendClarificationRequired).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).toHaveBeenCalledTimes(1);

    const [wsArg, result] = wsMessages.sendCommandComplete.mock.calls[0];
    expect(wsArg).toBe(ws);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        aggregate: expect.objectContaining({ kind: 'room-group', count: 2 }),
        results: expect.any(Array),
      }),
    );

    // sendCommand called once for the initial attempt + once per candidate
    expect(mcpClient.sendCommand).toHaveBeenCalledTimes(3);
  });
});

describe('ws-audio-pipeline mood recommendation', () => {
  test('sends clarification-required with custom prompt and room candidates (no LLM parse)', async () => {
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

    const parseIntent = jest.fn();

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({
        success: true,
        result: {
          result: {
            rooms: [
              { name: 'Family Room', id: 101 },
              { name: 'Kitchen', id: 102 },
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

    expect(parseIntent).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);

    const [_wsArg, transcript, intent, clarification] = wsMessages.sendClarificationRequired.mock.calls[0];
    expect(transcript).toBe("I'm in a romantic mood");
    expect(intent).toEqual({
      tool: 'c4_room_lights_set',
      args: expect.objectContaining({ level: expect.any(Number) }),
    });
    expect(clarification).toEqual(
      expect.objectContaining({
        kind: 'room',
        prompt: expect.stringContaining('Which room'),
        candidates: [
          expect.objectContaining({ name: 'Family Room' }),
          expect.objectContaining({ name: 'Kitchen' }),
        ],
      }),
    );

    expect(ws.pendingClarification && ws.pendingClarification.plan).toEqual(
      expect.objectContaining({
        kind: 'mood',
        mood: 'romantic',
        lights: expect.any(Object),
        music: expect.objectContaining({ source_device_name: 'Spotify' }),
      }),
    );

    restore();
  });
});

describe('ws-audio-pipeline room presence ("I\'m in <room>")', () => {
  test('unique match returns command-complete with room-presence aggregate (no LLM parse)', async () => {
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

    const parseIntent = jest.fn();

    const mcpClient = {
      sendCommand: jest.fn().mockImplementation((intent) => {
        if (!intent || typeof intent !== 'object') throw new Error('missing intent');
        switch (intent.tool) {
          case 'c4_find_rooms':
            return Promise.resolve({
              success: true,
              result: { result: { rooms: [{ name: 'Master Bedroom', id: 123 }] } },
            });
          case 'c4_room_watch_status':
          case 'c4_room_listen_status':
          case 'c4_room_now_playing':
            return Promise.resolve({ success: true, result: {} });
          case 'c4_find_devices':
            return Promise.resolve({ success: true, result: { devices: [] } });
          default:
            throw new Error(`Unexpected tool call: ${intent.tool}`);
        }
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

    expect(parseIntent).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).toHaveBeenCalledTimes(1);

    const [_wsArg, result, transcript, intent] = wsMessages.sendCommandComplete.mock.calls[0];
    expect(transcript).toBe("I'm in the Master Bedroom");
    expect(intent).toEqual({ tool: 'c4_room_presence', args: { room_id: 123 } });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        aggregate: expect.objectContaining({ kind: 'room-presence', room_id: 123, room_name: 'Master Bedroom' }),
        message: expect.stringContaining('Master Bedroom'),
      }),
    );
  });

  test('ambiguous match triggers clarification-required and stores a presence plan', async () => {
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

    const parseIntent = jest.fn();

    const mcpClient = {
      sendCommand: jest.fn().mockResolvedValue({
        success: true,
        result: {
          result: {
            rooms: [
              { name: 'Basement Bathroom', id: 456 },
              { name: 'Basement Stairs', id: 455 },
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

    expect(parseIntent).not.toHaveBeenCalled();
    expect(wsMessages.sendCommandComplete).not.toHaveBeenCalled();
    expect(wsMessages.sendClarificationRequired).toHaveBeenCalledTimes(1);

    const [_wsArg, transcript, intent, clarification] = wsMessages.sendClarificationRequired.mock.calls[0];
    expect(transcript).toBe("I'm in the Basement");
    expect(intent).toEqual({ tool: 'c4_room_presence', args: { room_name: 'Basement' } });
    expect(clarification).toEqual(
      expect.objectContaining({
        kind: 'room',
        query: 'Basement',
        prompt: expect.stringContaining('Which room'),
        candidates: expect.any(Array),
      }),
    );

    expect(ws.pendingClarification && ws.pendingClarification.plan).toEqual(
      expect.objectContaining({ kind: 'presence', query: 'Basement' }),
    );
  });
});

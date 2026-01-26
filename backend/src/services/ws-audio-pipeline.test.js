const { processAudioStream } = require('./ws-audio-pipeline');

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

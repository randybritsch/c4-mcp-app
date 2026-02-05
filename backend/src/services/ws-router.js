async function handleMessage(ws, data, {
  logger,
  wsMessages,
  wsAudioPipeline,
  wsClarification,
  transcribeAudio,
  parseIntent,
  mcpClient,
  roomAliases,
} = {}) {
  if (!ws || !data || !logger || !wsMessages || !wsAudioPipeline || !wsClarification) return;

  try {
    const message = JSON.parse(data.toString());

    logger.debug('WebSocket message received', {
      correlationId: ws.correlationId,
      type: message.type,
    });

    switch (message.type) {
      case 'audio-start':
        ws.audioChunks = [];
        ws.audioFormat = message.format ? String(message.format) : 'webm';
        ws.audioSampleRateHertz = Number.isFinite(Number(message.sampleRateHertz))
          ? Number(message.sampleRateHertz)
          : null;
        wsMessages.sendAudioReady(ws);
        break;

      case 'audio-chunk':
        if (!ws.audioChunks) ws.audioChunks = [];
        if (typeof message.data !== 'string') {
          wsMessages.sendError(ws, {
            code: 'INVALID_AUDIO_CHUNK',
            message: 'audio-chunk data must be a base64 string',
          });
          break;
        }
        ws.audioChunks.push(message.data);
        break;

      case 'audio-end':
        await wsAudioPipeline.processAudioStream(ws, {
          logger,
          wsMessages,
          transcribeAudio,
          parseIntent,
          mcpClient,
          roomAliases,
        });
        break;

      case 'text-command': {
        const config = require('../config');
        if (!config?.websocket?.textCommandsEnabled) {
          wsMessages.sendError(ws, {
            code: 'TEXT_COMMANDS_DISABLED',
            message: 'text-command is disabled on this server',
          });
          break;
        }

        const transcript = message && typeof message.transcript === 'string'
          ? message.transcript
          : '';
        if (!transcript || transcript.trim().length === 0) {
          wsMessages.sendError(ws, {
            code: 'MISSING_TRANSCRIPT',
            message: 'text-command transcript must be a non-empty string',
          });
          break;
        }

        wsMessages.sendTranscript(ws, transcript, null);
        await wsAudioPipeline.processTranscript(ws, transcript, {
          logger,
          wsMessages,
          parseIntent,
          mcpClient,
          roomAliases,
        });
        break;
      }

      case 'clarification-choice':
        await wsClarification.handleClarificationChoice(ws, message, {
          logger,
          wsMessages,
          mcpClient,
          roomAliases,
        });
        break;

      case 'remote-control': {
        if (!mcpClient) {
          wsMessages.sendError(ws, { code: 'MISSING_MCP_CLIENT', message: 'MCP client not available' });
          break;
        }

        const button = message && typeof message.button === 'string' ? message.button.trim() : '';
        if (!button) {
          wsMessages.sendError(ws, { code: 'MISSING_REMOTE_BUTTON', message: 'remote-control button is required' });
          break;
        }

        wsMessages.sendProcessing(ws, 'executing');

        const isPowerOff = button === 'power_off' || button === 'off';

        const mediaDeviceIdRaw = ws && ws.remoteContext && ws.remoteContext.media_device_id !== undefined
          ? String(ws.remoteContext.media_device_id || '').trim()
          : '';
        const mediaDeviceId = mediaDeviceIdRaw || null;

        const _isMediaNavButton = (b) => {
          const x = String(b || '').trim().toLowerCase();
          return [
            'up', 'down', 'left', 'right',
            'enter', 'select',
            'back', 'home', 'menu',
            'playpause', 'rewind', 'fastforward',
          ].includes(x);
        };

        const _mapToMediaRemoteButton = (b) => {
          const x = String(b || '').trim().toLowerCase();
          if (x === 'enter') return 'select';
          return x;
        };

        const _buildTranscript = () => (isPowerOff ? 'Remote: turn off' : `Remote: ${button}`);

        const transcript = _buildTranscript();

        // Power is room-scoped (TV off), not device-scoped.
        const offIntent = { tool: 'c4_tv_off_last', args: { confirm_timeout_s: 6 } };
        const tvRemoteIntent = { tool: 'c4_tv_remote_last', args: { button } };
        const mediaRemoteIntent = (mediaDeviceId && _isMediaNavButton(button))
          ? { tool: 'c4_media_remote', args: { device_id: mediaDeviceId, button: _mapToMediaRemoteButton(button), press: 'Tap' } }
          : null;

        try {
          logger.info({
            event: 'remote-control',
            correlationId: ws?.correlationId,
            button,
            mediaDeviceId,
            isPowerOff,
            willPrefer: isPowerOff ? 'tv_off_last' : (mediaRemoteIntent ? 'media_remote' : 'tv_remote_last'),
          });
        } catch { /* ignore logging errors */ }

        try {
          let mcpResult = null;
          let intent = null;

          if (isPowerOff) {
            intent = offIntent;
            mcpResult = await mcpClient.sendCommand(intent, ws.correlationId, ws.user?.deviceId);
          } else if (mediaRemoteIntent) {
            // Prefer device-scoped media remote for AppleTV/Roku/etc.
            intent = mediaRemoteIntent;
            mcpResult = await mcpClient.sendCommand(intent, ws.correlationId, ws.user?.deviceId);

            // Fallback: room-level TV remote (volume/mute + installs without media remote support).
            if (!mcpResult || mcpResult.success !== true) {
              intent = tvRemoteIntent;
              mcpResult = await mcpClient.sendCommand(intent, ws.correlationId, ws.user?.deviceId);
            }
          } else {
            intent = tvRemoteIntent;
            mcpResult = await mcpClient.sendCommand(intent, ws.correlationId, ws.user?.deviceId);
          }

          try {
            logger.info({
              event: 'remote-control-result',
              correlationId: ws?.correlationId,
              tool: intent?.tool,
              success: mcpResult?.success,
            });
          } catch { /* ignore logging errors */ }

          if (!mcpResult || mcpResult.success !== true) {
            wsMessages.sendError(ws, {
              code: 'REMOTE_COMMAND_FAILED',
              message: 'Remote command failed',
              details: mcpResult,
            });
            break;
          }

          // If we successfully turned the TV off, update remote UI state.
          if (isPowerOff) {
            ws.remoteContext = {
              active: false,
              kind: 'tv',
              label: null,
              media_device_id: null,
              updatedAt: new Date().toISOString(),
            };
            if (typeof wsMessages.sendRemoteContext === 'function') {
              wsMessages.sendRemoteContext(ws, ws.remoteContext, 'off');
            }
          }

          wsMessages.sendCommandComplete(ws, mcpResult, transcript, intent);
        } catch (e) {
          wsMessages.sendError(ws, {
            code: 'REMOTE_COMMAND_ERROR',
            message: e && e.message ? e.message : String(e),
          });
        }

        break;
      }

      case 'ping':
        wsMessages.sendPong(ws);
        break;

      default:
        wsMessages.sendError(ws, { message: `Unknown message type: ${message.type}` });
    }
  } catch (error) {
    logger.error('Error handling WebSocket message', {
      correlationId: ws.correlationId,
      error: error.message,
    });

    wsMessages.sendError(ws, { code: 'MESSAGE_PARSE_ERROR', message: error.message });
  }
}

module.exports = {
  handleMessage,
};

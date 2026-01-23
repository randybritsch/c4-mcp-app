const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Transcribe audio using Google Speech-to-Text API
 */
async function transcribeWithGoogle(audioBase64, format) {
  const { apiKey } = config.stt.google;
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.STT_ERROR,
      'Google STT API key not configured',
      500,
    );
  }

  const encodingMap = {
    webm: 'WEBM_OPUS',
    ogg: 'OGG_OPUS',
    wav: 'LINEAR16',
  };

  const encoding = encodingMap[format.toLowerCase()] || 'WEBM_OPUS';

  try {
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz: 48000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
          },
          audio: { content: audioBase64 },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'STT API error');
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return {
        transcript: '',
        confidence: 0,
      };
    }

    const result = data.results[0];
    const alternative = result.alternatives[0];

    return {
      transcript: alternative.transcript,
      confidence: alternative.confidence || 0,
    };
  } catch (error) {
    logger.error('Google STT error', { error: error.message });
    throw new AppError(
      ErrorCodes.STT_ERROR,
      `Speech-to-text failed: ${error.message}`,
      500,
    );
  }
}

/**
 * Transcribe audio using Azure Speech-to-Text API
 */
async function transcribeWithAzure(_audioBase64, _format) {
  const { key, region } = config.stt.azure;
  if (!key || !region) {
    throw new AppError(
      ErrorCodes.STT_ERROR,
      'Azure STT credentials not configured',
      500,
    );
  }

  // Azure STT implementation would go here
  // For now, returning a placeholder
  throw new AppError(
    ErrorCodes.STT_ERROR,
    'Azure STT not yet implemented',
    501,
  );
}

/**
 * Transcribe audio using configured STT provider
 */
async function transcribeAudio(audioBase64, format, correlationId) {
  logger.info('Starting transcription', {
    correlationId,
    provider: config.stt.provider,
    format,
  });

  const startTime = Date.now();

  let result;
  if (config.stt.provider === 'google') {
    result = await transcribeWithGoogle(audioBase64, format);
  } else if (config.stt.provider === 'azure') {
    result = await transcribeWithAzure(audioBase64, format);
  } else {
    throw new AppError(
      ErrorCodes.STT_ERROR,
      `Unknown STT provider: ${config.stt.provider}`,
      500,
    );
  }

  const duration = Date.now() - startTime;

  logger.info('Transcription complete', {
    correlationId,
    duration,
    confidence: result.confidence,
    transcriptLength: result.transcript.length,
  });

  return result;
}

module.exports = {
  transcribeAudio,
};

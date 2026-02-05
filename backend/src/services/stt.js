const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

function estimateBase64DecodedBytesLength(base64) {
  if (!base64 || typeof base64 !== 'string') return 0;
  const s = base64.trim();
  const len = s.length;
  if (!len) return 0;

  // Base64 decoded size is ~ 3/4 the encoded length, minus padding.
  let padding = 0;
  if (s.endsWith('==')) padding = 2;
  else if (s.endsWith('=')) padding = 1;
  const decoded = Math.floor((len * 3) / 4) - padding;
  return decoded > 0 ? decoded : 0;
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs) || 0);

  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { resp, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Transcribe audio using a local Whisper HTTP service (OpenAI-compatible).
 *
 * Expected endpoint: POST {baseUrl}/v1/audio/transcriptions
 *
 * We send multipart/form-data with fields:
 * - file: audio bytes (webm/ogg/wav)
 * - model: whisper model name (service-dependent; default from config)
 * - language: optional language hint
 */
async function transcribeWithWhisper(audioBase64, format, correlationId) {
  const whisper = config?.stt?.whisper || {};
  // Accept either a root URL (preferred) or a URL ending in `/v1`.
  // Normalize to root so we don't accidentally call `/v1/v1/...`.
  const baseUrlRaw = String(whisper.baseUrl || '').trim().replace(/\/+$/, '');
  const baseUrl = baseUrlRaw
    // Common misconfigurations: people paste a full endpoint.
    // Normalize to service root so we always append `/v1/...` ourselves.
    .replace(/\/+v1\/+audio\/+transcriptions$/i, '')
    .replace(/\/+v1\/+audio\/+translations$/i, '')
    .replace(/\/+v1\/+audio$/i, '')
    .replace(/\/+v1$/i, '');
  const modelRaw = String(whisper.model || '').trim();
  const model = (() => {
    const m = modelRaw || 'Systran/faster-distil-whisper-small.en';
    const normalized = String(m).trim().replace(/\s+/g, ' ');
    const lower = normalized.toLowerCase();

    // Common legacy shorthand. Speaches expects repo-style model IDs.
    if (lower === 'base.en' || lower === 'base en' || lower === 'base_en' || lower === 'base') {
      return 'Systran/faster-distil-whisper-small.en';
    }

    return normalized;
  })();
  const language = String(whisper.language || '').trim();
  const apiKey = String(whisper.apiKey || '').trim();

  if (!baseUrl) {
    throw new AppError(
      ErrorCodes.STT_ERROR,
      'Whisper STT base URL not configured (set WHISPER_BASE_URL)',
      500,
    );
  }

  const formatLower = String(format || 'webm').toLowerCase();
  const mimeMap = {
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
  };
  const mime = mimeMap[formatLower] || 'application/octet-stream';
  const filename = `audio.${formatLower || 'webm'}`;

  const requestDebug = {
    provider: 'whisper',
    format: formatLower,
    mime,
    filename,
    baseUrl: baseUrlRaw,
    normalizedBaseUrl: baseUrl,
    model,
    language: language || null,
  };

  try {
    const url = `${baseUrl}/v1/audio/transcriptions`;
    const timeoutMs = config.stt.timeoutMs || 15000;

    const requestMeta = {
      ...requestDebug,
      url,
      method: 'POST',
      timeoutMs,
    };

    const audioBytes = Buffer.from(audioBase64, 'base64');
    requestMeta.audioBytesLength = audioBytes.length;

    const form = new FormData();
    form.append('model', model);
    if (language) form.append('language', language);
    form.append('file', new Blob([audioBytes], { type: mime }), filename);

    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const { resp, json: data } = await fetchJsonWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: form,
      },
      timeoutMs,
    );

    if (!resp.ok) {
      const responseSnippet = (() => {
        if (data === null || data === undefined) return null;
        if (typeof data === 'string') return data.slice(0, 1200);
        if (typeof data === 'object') {
          const raw = typeof data.raw === 'string' ? data.raw : null;
          if (raw) return raw.slice(0, 1200);
          try {
            return JSON.stringify(data).slice(0, 1200);
          } catch {
            return '[unserializable-json]';
          }
        }
        try {
          return String(data).slice(0, 1200);
        } catch {
          return '[unstringifiable]';
        }
      })();

      const messageFromBody = data && typeof data === 'object'
        ? (data.error?.message || data.message || data.detail)
        : null;
      const status = Number(resp.status);
      const statusPart = Number.isFinite(status) ? status : resp.status;
      const msg = messageFromBody
        ? `Whisper STT error (${statusPart}) at ${url}: ${messageFromBody}`
        : `Whisper STT error (${statusPart}) at ${url}`;

      throw new AppError(
        ErrorCodes.STT_ERROR,
        msg,
        502,
        {
          ...requestMeta,
          status: resp.status,
          statusText: resp.statusText,
          responseSnippet,
        },
      );
    }

    const transcript = (() => {
      if (data && typeof data === 'object') {
        if (typeof data.text === 'string') return data.text;
        if (typeof data.transcript === 'string') return data.transcript;
      }
      return '';
    })();

    return { transcript, confidence: 0 };
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Whisper STT error', {
        correlationId,
        error: error.message,
        ...requestDebug,
        ...(error.details && typeof error.details === 'object' ? error.details : {}),
      });
      throw error;
    }

    if (error && error.name === 'AbortError') {
      const timeoutMs = config.stt.timeoutMs || 15000;
      throw new AppError(
        ErrorCodes.STT_TIMEOUT,
        `Speech-to-text timed out after ${timeoutMs}ms`,
        504,
        { correlationId, timeoutMs, ...requestDebug },
      );
    }

    logger.error('Whisper STT error', {
      correlationId,
      error: error.message,
      ...requestDebug,
    });
    throw new AppError(
      ErrorCodes.STT_ERROR,
      `Speech-to-text failed: ${error.message}`,
      500,
      requestDebug,
    );
  }
}

/**
 * Transcribe audio using Google Speech-to-Text API
 */
async function transcribeWithGoogle(audioBase64, format, correlationId, sampleRateHertz) {
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
    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
    const timeoutMs = config.stt.timeoutMs || 15000;

    const { resp, json: data } = await fetchJsonWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz: Number.isFinite(Number(sampleRateHertz)) ? Number(sampleRateHertz) : 48000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
          },
          audio: { content: audioBase64 },
        }),
      },
      timeoutMs,
    );

    if (!resp.ok) {
      const message = data && typeof data === 'object' ? (data.error?.message || data.message) : null;
      throw new Error(message || 'STT API error');
    }

    const firstResult = data && data.results && Array.isArray(data.results) ? data.results[0] : null;
    const firstAlt = firstResult && Array.isArray(firstResult.alternatives) ? firstResult.alternatives[0] : null;

    const transcript = typeof firstAlt?.transcript === 'string' ? firstAlt.transcript : '';
    const confidenceRaw = firstAlt && typeof firstAlt.confidence !== 'undefined' ? Number(firstAlt.confidence) : 0;
    const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : 0;

    return { transcript, confidence };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutMs = config.stt.timeoutMs || 15000;
      throw new AppError(
        ErrorCodes.STT_TIMEOUT,
        `Speech-to-text timed out after ${timeoutMs}ms`,
        504,
        { correlationId, timeoutMs, provider: 'google' },
      );
    }

    logger.error('Google STT error', { correlationId, error: error.message });
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
async function transcribeAudio(audioBase64, format, correlationId, sampleRateHertz) {
  const audioBytesLength = estimateBase64DecodedBytesLength(audioBase64);

  logger.info('Starting transcription', {
    correlationId,
    provider: config.stt.provider,
    format,
    audioBytesLength,
  });

  const startTime = Date.now();

  let result;
  if (config.stt.provider === 'google') {
    result = await transcribeWithGoogle(audioBase64, format, correlationId, sampleRateHertz);
  } else if (config.stt.provider === 'whisper' || config.stt.provider === 'local_whisper') {
    result = await transcribeWithWhisper(audioBase64, format, correlationId);
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

  const normalizedTranscript = typeof result?.transcript === 'string' ? result.transcript : '';
  const normalizedConfidenceRaw = typeof result?.confidence !== 'undefined' ? Number(result.confidence) : 0;
  const normalizedConfidence = Number.isFinite(normalizedConfidenceRaw) ? normalizedConfidenceRaw : 0;

  logger.info('Transcription complete', {
    correlationId,
    duration,
    confidence: normalizedConfidence,
    transcriptLength: normalizedTranscript.length,
    audioBytesLength,
  });

  return {
    ...result,
    transcript: normalizedTranscript,
    confidence: normalizedConfidence,
  };
}

module.exports = {
  transcribeAudio,
};

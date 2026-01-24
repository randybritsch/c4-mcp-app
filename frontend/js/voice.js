// Voice recording and processing
class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;

    // Fallback recorder (for browsers without MediaRecorder, e.g. iOS Safari)
    this._fallback = {
      enabled: false,
      audioContext: null,
      source: null,
      processor: null,
      sampleRate: 48000,
      pcmChunks: [],
      totalSamples: 0,
    };

    // Auto-stop (voice activity detection) settings
    this.autoStopEnabled = true;
    this.vad = {
      audioContext: null,
      analyser: null,
      source: null,
      data: null,
      rafId: null,
      startedAtMs: 0,
      lastVoiceAtMs: 0,
      hasSpoken: false,
    };

    // Optional callback invoked right before an auto-stop triggers.
    // The UI can use this to update button state without needing to poll.
    this.onAutoStop = null;
  }

  _stopVad() {
    if (this.vad.rafId) {
      cancelAnimationFrame(this.vad.rafId);
      this.vad.rafId = null;
    }

    if (this.vad.source) {
      try {
        this.vad.source.disconnect();
      } catch {
        // ignore
      }
      this.vad.source = null;
    }

    if (this.vad.analyser) {
      try {
        this.vad.analyser.disconnect();
      } catch {
        // ignore
      }
      this.vad.analyser = null;
    }

    if (this.vad.audioContext) {
      try {
        this.vad.audioContext.close();
      } catch {
        // ignore
      }
      this.vad.audioContext = null;
    }

    this.vad.data = null;
    this.vad.startedAtMs = 0;
    this.vad.lastVoiceAtMs = 0;
    this.vad.hasSpoken = false;
  }

  _startVad() {
    if (!this.autoStopEnabled) return;
    if (!this.stream) return;

    // VAD tuning (simple RMS-based):
    // - detect speech when RMS crosses speechThreshold
    // - once speech has started, auto-stop after silenceMs of RMS below silenceThreshold
    const speechThreshold = 0.012;
    const silenceThreshold = 0.008;
    const silenceMs = 1200;
    const minRecordMs = 700;
    const requiresSpeechStart = true;

    this._stopVad();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    // Some browsers start the AudioContext in a suspended state until user gesture;
    // startRecording() is initiated by a click, but resume anyway to be safe.
    try {
      const p = ctx.resume && ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // ignore
    }
    const source = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const data = new Uint8Array(analyser.fftSize);

    source.connect(analyser);

    this.vad.audioContext = ctx;
    this.vad.source = source;
    this.vad.analyser = analyser;
    this.vad.data = data;
    this.vad.startedAtMs = Date.now();
    this.vad.lastVoiceAtMs = this.vad.startedAtMs;
    this.vad.hasSpoken = false;

    const computeRms = () => {
      analyser.getByteTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const centered = (data[i] - 128) / 128;
        sumSq += centered * centered;
      }
      return Math.sqrt(sumSq / data.length);
    };

    const tick = () => {
      if (!this.isRecording) return;

      const now = Date.now();
      const rms = computeRms();

      if (!this.vad.hasSpoken) {
        if (rms >= speechThreshold) {
          this.vad.hasSpoken = true;
          this.vad.lastVoiceAtMs = now;
          console.log('VAD: speech detected');
        }
      } else {
        if (rms >= silenceThreshold) {
          this.vad.lastVoiceAtMs = now;
        }

        const recordingLongEnough = (now - this.vad.startedAtMs) >= minRecordMs;
        const silenceLongEnough = (now - this.vad.lastVoiceAtMs) >= silenceMs;

        if (recordingLongEnough && silenceLongEnough) {
          try {
            if (typeof this.onAutoStop === 'function') {
              this.onAutoStop({ reason: 'silence', silenceMs, rms });
            }
          } catch {
            // ignore callback errors
          }
          console.log('VAD: auto-stop (silence)');
          this.stopRecording();
          return;
        }
      }

      // If we require the user to speak first, don't auto-stop while it's just ambient silence.
      if (!requiresSpeechStart && !this.vad.hasSpoken) {
        const recordingLongEnough = (now - this.vad.startedAtMs) >= minRecordMs;
        const silenceLongEnough = (now - this.vad.lastVoiceAtMs) >= silenceMs;
        if (recordingLongEnough && silenceLongEnough) {
          try {
            if (typeof this.onAutoStop === 'function') {
              this.onAutoStop({ reason: 'silence', silenceMs, rms });
            }
          } catch {
            // ignore
          }
          this.stopRecording();
          return;
        }
      }

      this.vad.rafId = requestAnimationFrame(tick);
    };

    this.vad.rafId = requestAnimationFrame(tick);
  }

  /**
   * Check if MediaRecorder is supported
   */
  isSupported() {
    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
    const hasWebAudio = typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined';
    return hasGetUserMedia && (hasMediaRecorder || hasWebAudio);
  }

  /**
   * Request microphone permission and initialize
   */
  async initialize() {
    if (!this.isSupported()) {
      throw new Error('MediaRecorder API not supported in this browser');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (typeof window.MediaRecorder !== 'undefined') {
        // Determine best supported format
        const mimeType = this.getSupportedMimeType();

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          this.handleRecordingStop();
        };

        console.log('VoiceRecorder initialized with', mimeType);
      } else {
        // WebAudio fallback (record PCM and encode WAV)
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx({ sampleRate: 48000 });
        // Some browsers start suspended; resume on user gesture.
        try {
          const p = ctx.resume && ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          // ignore
        }

        const source = ctx.createMediaStreamSource(this.stream);
        // ScriptProcessor is deprecated but still widely supported (including iOS Safari).
        const processor = ctx.createScriptProcessor(4096, 1, 1);

        this._fallback.enabled = true;
        this._fallback.audioContext = ctx;
        this._fallback.source = source;
        this._fallback.processor = processor;
        this._fallback.sampleRate = ctx.sampleRate || 48000;

        console.log('VoiceRecorder initialized with WebAudio fallback (wav)', this._fallback.sampleRate);
      }
    } catch (error) {
      console.error('Microphone access denied:', error);
      throw error;
    }
  }

  _inferFormatFromMimeType(mimeType) {
    const mt = (mimeType || '').toLowerCase();
    if (mt.includes('ogg')) return 'ogg';
    if (mt.includes('webm')) return 'webm';
    return 'webm';
  }

  _cleanupFallback() {
    const f = this._fallback;
    if (f.processor) {
      try { f.processor.disconnect(); } catch { /* ignore */ }
      f.processor = null;
    }
    if (f.source) {
      try { f.source.disconnect(); } catch { /* ignore */ }
      f.source = null;
    }
    if (f.audioContext) {
      try { f.audioContext.close(); } catch { /* ignore */ }
      f.audioContext = null;
    }
    f.enabled = false;
    f.pcmChunks = [];
    f.totalSamples = 0;
  }

  _encodeWavBase64(floatChunks, sampleRate) {
    const totalSamples = floatChunks.reduce((sum, arr) => sum + arr.length, 0);
    const pcm = new Int16Array(totalSamples);
    let offset = 0;

    floatChunks.forEach((chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        let s = chunk[i];
        if (s > 1) s = 1;
        if (s < -1) s = -1;
        pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    });

    const headerSize = 44;
    const dataSize = pcm.length * 2;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    const writeStr = (pos, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // format
    view.setUint16(22, 1, true); // channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let p = 44;
    for (let i = 0; i < pcm.length; i++) {
      view.setInt16(p, pcm[i], true);
      p += 2;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  /**
   * Get supported MIME type
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return ''; // Use default
  }

  /**
   * Start recording
   */
  async startRecording() {
    if (!this.mediaRecorder) {
      await this.initialize();
    }

    this.audioChunks = [];
    this.isRecording = true;

    const format = this._fallback.enabled
      ? 'wav'
      : this._inferFormatFromMimeType(this.mediaRecorder ? this.mediaRecorder.mimeType : '');

    // Send start signal with format metadata
    wsClient.send({
      type: 'audio-start',
      format,
      sampleRateHertz: this._fallback.enabled ? this._fallback.sampleRate : 48000,
    });

    if (this._fallback.enabled) {
      const f = this._fallback;
      f.pcmChunks = [];
      f.totalSamples = 0;

      f.processor.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        f.pcmChunks.push(copy);
        f.totalSamples += copy.length;
      };
      f.source.connect(f.processor);
      f.processor.connect(f.audioContext.destination);
    } else {
      // Start recording with 100ms chunks for streaming
      this.mediaRecorder.start(100);
    }

    // Start auto-stop detection after recording begins.
    this._startVad();

    console.log('Recording started');
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this._fallback.enabled) {
      // Stop fallback capture; finalize in handleRecordingStop.
      this.handleRecordingStop();
      return;
    }

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this._stopVad();
      console.log('Recording stopped');
    }
  }

  /**
   * Handle recording stop
   */
  async handleRecordingStop() {
    this._stopVad();

    if (this._fallback.enabled) {
      const f = this._fallback;
      if (!f.pcmChunks || f.pcmChunks.length === 0) {
        console.error('No audio recorded (fallback)');
        return;
      }

      const base64Audio = this._encodeWavBase64(f.pcmChunks, f.sampleRate || 48000);

      wsClient.send({ type: 'audio-chunk', data: base64Audio });
      wsClient.send({ type: 'audio-end' });

      // Reset fallback buffers
      f.pcmChunks = [];
      f.totalSamples = 0;
      return;
    }

    if (this.audioChunks.length === 0) {
      console.error('No audio recorded');
      return;
    }

    const mimeType = this.mediaRecorder ? this.mediaRecorder.mimeType : 'audio/webm';
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
    const base64Audio = await this.blobToBase64(audioBlob);

    wsClient.send({ type: 'audio-chunk', data: base64Audio });
    wsClient.send({ type: 'audio-end' });

    this.audioChunks = [];
  }

  /**
   * Convert blob to base64
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this._stopVad();
    this._cleanupFallback();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}

// Create global instance
const voiceRecorder = new VoiceRecorder();

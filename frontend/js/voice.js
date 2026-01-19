// Voice recording and processing
class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
  }

  /**
   * Check if MediaRecorder is supported
   */
  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
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
    } catch (error) {
      console.error('Microphone access denied:', error);
      throw error;
    }
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

    // Send start signal
    wsClient.send({ type: 'audio-start' });

    // Start recording with 100ms chunks for streaming
    this.mediaRecorder.start(100);

    console.log('Recording started');
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.isRecording = false;
      this.mediaRecorder.stop();
      console.log('Recording stopped');
    }
  }

  /**
   * Handle recording stop
   */
  async handleRecordingStop() {
    if (this.audioChunks.length === 0) {
      console.error('No audio recorded');
      return;
    }

    // Create audio blob
    const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });

    // Convert to base64
    const base64Audio = await this.blobToBase64(audioBlob);

    // Send to server via WebSocket
    wsClient.send({
      type: 'audio-chunk',
      data: base64Audio,
    });

    wsClient.send({
      type: 'audio-end',
    });

    // Clear chunks
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

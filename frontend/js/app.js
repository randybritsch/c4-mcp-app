// Main application logic
class App {
  constructor() {
    this.elements = {
      status: document.getElementById('status'),
      statusDot: document.querySelector('.status-dot'),
      statusText: document.querySelector('.status-text'),
      recordBtn: document.getElementById('recordBtn'),
      recordText: document.querySelector('.record-text'),
      statusMessage: document.getElementById('statusMessage'),
      transcriptContainer: document.getElementById('transcriptContainer'),
      transcript: document.getElementById('transcript'),
      commandLog: document.getElementById('commandLog'),
    };

    this.commandHistory = [];
    this.isRecording = false;
  }

  /**
   * Initialize application
   */
  async init() {
    console.log('Initializing C4-MCP-App...');

    // Check browser support
    if (!voiceRecorder.isSupported()) {
      this.showError('Your browser does not support voice recording');
      return;
    }

    // Setup event listeners
    this.setupEventListeners();

    // Connect to WebSocket
    try {
      await wsClient.connect();
      this.updateStatus('online', 'Connected');
      this.elements.recordBtn.disabled = false;
    } catch (error) {
      console.error('Failed to connect:', error);
      this.showError('Failed to connect to server');
      this.updateStatus('offline', 'Connection Failed');
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Record button
    this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());

    // WebSocket events
    wsClient.on('connected', () => {
      this.updateStatus('online', 'Connected');
      this.elements.recordBtn.disabled = false;
    });

    wsClient.on('disconnected', () => {
      this.updateStatus('offline', 'Disconnected');
      this.elements.recordBtn.disabled = true;
      this.showError('Connection lost. Reconnecting...');
    });

    wsClient.on('reconnect-failed', () => {
      this.showError('Could not reconnect to server');
    });

    wsClient.on('audio-ready', () => {
      console.log('Server ready to receive audio');
    });

    wsClient.on('processing', (message) => {
      this.updateStatusMessage(`Processing: ${message.stage}...`);
    });

    wsClient.on('transcript', (message) => {
      this.showTranscript(message.transcript);
    });

    wsClient.on('intent', (message) => {
      console.log('Intent parsed:', message.intent);
    });

    wsClient.on('command-complete', (message) => {
      this.handleCommandComplete(message);
    });

    wsClient.on('error', (message) => {
      this.showError(message.message || 'An error occurred');
      if (this.isRecording) {
        this.stopRecording();
      }
    });
  }

  /**
   * Toggle recording
   */
  async toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /**
   * Start recording
   */
  async startRecording() {
    try {
      await voiceRecorder.startRecording();
      this.isRecording = true;
      this.elements.recordBtn.classList.add('recording');
      this.elements.recordText.textContent = 'Recording...';
      this.updateStatusMessage('Listening...');
      this.hideTranscript();
    } catch (error) {
      this.showError('Could not access microphone: ' + error.message);
    }
  }

  /**
   * Stop recording
   */
  stopRecording() {
    voiceRecorder.stopRecording();
    this.isRecording = false;
    this.elements.recordBtn.classList.remove('recording');
    this.elements.recordText.textContent = 'Tap to Speak';
    this.updateStatusMessage('Processing...');
  }

  /**
   * Update connection status
   */
  updateStatus(status, text) {
    this.elements.statusDot.className = `status-dot ${status}`;
    this.elements.statusText.textContent = text;
  }

  /**
   * Update status message
   */
  updateStatusMessage(message) {
    this.elements.statusMessage.textContent = message;
    this.elements.statusMessage.className = 'status-message processing';
  }

  /**
   * Show transcript
   */
  showTranscript(text) {
    this.elements.transcript.textContent = text;
    this.elements.transcriptContainer.style.display = 'block';
  }

  /**
   * Hide transcript
   */
  hideTranscript() {
    this.elements.transcriptContainer.style.display = 'none';
  }

  /**
   * Show error message
   */
  showError(message) {
    this.elements.statusMessage.textContent = message;
    this.elements.statusMessage.className = 'status-message';
  }

  /**
   * Handle command complete
   */
  handleCommandComplete(message) {
    this.updateStatusMessage('Command executed successfully!');
    
    // Add to command history
    this.addToCommandLog({
      transcript: message.transcript,
      intent: message.intent,
      result: message.result,
      timestamp: new Date(),
      success: true,
    });

    // Clear status after delay
    setTimeout(() => {
      this.updateStatusMessage('');
    }, 3000);
  }

  /**
   * Add command to log
   */
  addToCommandLog(command) {
    this.commandHistory.unshift(command);
    if (this.commandHistory.length > 10) {
      this.commandHistory.pop();
    }

    this.renderCommandLog();
  }

  /**
   * Render command log
   */
  renderCommandLog() {
    if (this.commandHistory.length === 0) {
      this.elements.commandLog.innerHTML = '<div class="log-empty">No commands yet. Tap the microphone to start.</div>';
      return;
    }

    this.elements.commandLog.innerHTML = this.commandHistory
      .map(cmd => this.renderLogItem(cmd))
      .join('');
  }

  /**
   * Render single log item
   */
  renderLogItem(command) {
    const time = command.timestamp.toLocaleTimeString();
    const intentStr = JSON.stringify(command.intent);
    const statusClass = command.success ? 'success' : 'error';

    return `
      <div class="log-item ${statusClass}">
        <div class="log-item-header">
          <span>${time}</span>
          <span>${command.success ? '✓ Success' : '✗ Failed'}</span>
        </div>
        <div class="log-item-transcript">"${command.transcript}"</div>
        <div class="log-item-intent">${intentStr}</div>
      </div>
    `;
  }
}

// Initialize app when DOM is ready
const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

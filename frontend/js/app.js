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
      clarificationContainer: document.getElementById('clarificationContainer'),
      clarificationLabel: document.getElementById('clarificationLabel'),
      clarificationChoices: document.getElementById('clarificationChoices'),
      commandLog: document.getElementById('commandLog'),
    };

    this.commandHistory = [];
    this.isRecording = false;

    // When the recorder auto-stops (silence detected), update UI state.
    if (typeof voiceRecorder !== 'undefined') {
      voiceRecorder.onAutoStop = () => {
        this.handleAutoStop();
      };
    }

    this._executionTimeoutId = null;

    // Make multiline diagnostics readable.
    if (this.elements.statusMessage) {
      this.elements.statusMessage.style.whiteSpace = 'pre-wrap';
    }
  }

  _formatError(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err instanceof Error && err.message) return err.message;
    try { return JSON.stringify(err); } catch { return String(err); }
  }

  async _checkBackendHealth() {
    const url = `${CONFIG.API_URL}/api/v1/health`;
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      const text = await resp.text();
      if (!resp.ok) {
        const snippet = text ? text.slice(0, 300) : '';
        throw new Error(`Health not OK (${resp.status})${snippet ? `: ${snippet}` : ''}`);
      }
      return true;
    } catch (e) {
      const msg = this._formatError(e);
      throw new Error(`Health check failed for ${url}: ${msg}`);
    }
  }

  _clearExecutionTimeout() {
    if (this._executionTimeoutId) {
      clearTimeout(this._executionTimeoutId);
      this._executionTimeoutId = null;
    }
  }

  _startExecutionTimeout() {
    this._clearExecutionTimeout();
    // If we never receive command-complete / clarification-required / error,
    // avoid leaving the UI stuck in an "executing" state forever.
    this._executionTimeoutId = setTimeout(() => {
      this._executionTimeoutId = null;
      this.showError('Timed out while executing. Please try again.');
    }, 20000);
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
      this.updateStatusMessage('Connecting...');

      // Preflight: if this fails on iPhone, it's usually TLS/cert/DNS/port reachability.
      await this._checkBackendHealth();

      await wsClient.connect();
      this.updateStatus('online', 'Connected');
      this.elements.recordBtn.disabled = false;
    } catch (error) {
      console.error('Failed to connect:', error);
      const details = [
        `Failed to connect: ${this._formatError(error)}`,
        `API: ${CONFIG.API_URL}`,
        `WS: ${CONFIG.WS_URL}`,
      ].join('\n');
      this.showError(details);
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
      this._clearExecutionTimeout();
    });

    wsClient.on('reconnect-failed', () => {
      this.showError('Could not reconnect to server');
    });

    wsClient.on('audio-ready', () => {
      console.log('Server ready to receive audio');
    });

    wsClient.on('processing', (message) => {
      this.updateStatusMessage(`Processing: ${message.stage}...`);
      if (message.stage === 'executing') {
        this._startExecutionTimeout();
      }
    });

    wsClient.on('transcript', (message) => {
      this.showTranscript(message.transcript);
    });

    wsClient.on('intent', (message) => {
      console.log('Intent parsed:', message.intent);
    });

    wsClient.on('command-complete', (message) => {
      this._clearExecutionTimeout();
      this.handleCommandComplete(message);
    });

    wsClient.on('clarification-required', (message) => {
      this._clearExecutionTimeout();
      this.handleClarificationRequired(message);
    });

    wsClient.on('error', (message) => {
      this._clearExecutionTimeout();
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
   * Recorder finished automatically (silence detected).
   */
  handleAutoStop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.elements.recordBtn.classList.remove('recording');
    this.elements.recordText.textContent = 'Tap to Speak';
    this.updateStatusMessage('Processing...');
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

  hideClarification() {
    if (this.elements.clarificationContainer) {
      this.elements.clarificationContainer.style.display = 'none';
    }
    if (this.elements.clarificationChoices) {
      this.elements.clarificationChoices.innerHTML = '';
    }
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

    // Clear any pending clarification UI.
    this.hideClarification();
    
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

  handleClarificationRequired(message) {
    const clarification = message.clarification;
    if (!clarification || !Array.isArray(clarification.candidates) || clarification.candidates.length === 0) {
      this.showError('Need clarification, but no options were provided');
      return;
    }

    // Ensure transcript is visible.
    this.showTranscript(message.transcript || this.elements.transcript.textContent || '');

    const kind = clarification.kind || 'choice';
    const query = clarification.query ? ` "${clarification.query}"` : '';
    const label =
      kind === 'room'
        ? `Which room did you mean${query}?`
        : kind === 'light'
          ? `Which light did you mean${query}?`
          : `Which one did you mean${query}?`;

    if (this.elements.clarificationLabel) {
      this.elements.clarificationLabel.textContent = label;
    }

    if (!this.elements.clarificationChoices) {
      this.showError('Clarification UI not available');
      return;
    }

    this.elements.clarificationChoices.innerHTML = '';

    clarification.candidates.forEach((c, idx) => {
      const btn = document.createElement('button');
      btn.className = 'clarification-choice-btn';
      btn.type = 'button';
      btn.textContent = c.name;
      btn.addEventListener('click', () => {
        // Disable all buttons while executing.
        Array.from(this.elements.clarificationChoices.querySelectorAll('button')).forEach((b) => (b.disabled = true));
        this.updateStatusMessage('Executing...');
        wsClient.send({ type: 'clarification-choice', choiceIndex: idx });
      });
      this.elements.clarificationChoices.appendChild(btn);
    });

    this.elements.clarificationContainer.style.display = 'block';
    this.updateStatusMessage('Need clarification');
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

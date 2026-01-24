// WebSocket client
class WebSocketClient {
  constructor() {
    this.ws = null;
    this.token = null;
    this.connected = false;
    this.lastError = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.messageHandlers = new Map();
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    // Get authentication token first
    if (!this.token) {
      await this.authenticate();
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${CONFIG.WS_URL}?token=${this.token}`;
      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        const error = err instanceof Error ? err : new Error(String(err || 'WebSocket connection failed'));
        this.lastError = error;
        reject(error);
      };

      const connectTimeoutMs = 8000;
      const timeoutId = setTimeout(() => {
        fail(new Error(`WebSocket connect timeout after ${connectTimeoutMs}ms (${wsUrl})`));
        try { this.ws && this.ws.close(); } catch { /* ignore */ }
      }, connectTimeoutMs);

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (e) {
        clearTimeout(timeoutId);
        fail(e);
        return;
      }

      this.ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        // Note: browsers often provide a generic Event here.
        console.error('WebSocket error:', error);
        if (!settled) {
          clearTimeout(timeoutId);
          fail(new Error(`WebSocket error while connecting (${wsUrl})`));
          return;
        }
        this.lastError = error;
        this.emit('error', error);
      };

      this.ws.onclose = (evt) => {
        console.log('WebSocket disconnected');
        this.connected = false;
        if (!settled) {
          clearTimeout(timeoutId);
          fail(new Error(`WebSocket closed before open (code ${evt && evt.code}, reason ${evt && evt.reason})`));
          return;
        }
        this.emit('disconnected', evt);
        this.attemptReconnect();
      };
    });
  }

  /**
   * Authenticate and get JWT token
   */
  async authenticate() {
    try {
      const url = `${CONFIG.API_URL}/api/v1/auth/token`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: CONFIG.DEVICE_ID,
          deviceName: CONFIG.DEVICE_NAME,
        }),
      });

      if (!response.ok) {
        let body = '';
        try { body = await response.text(); } catch { /* ignore */ }
        throw new Error(`Authentication failed (${response.status})${body ? `: ${body}` : ''}`);
      }

      const data = await response.json();
      this.token = data.token;
      localStorage.setItem('authToken', this.token);
    } catch (error) {
      const url = `${CONFIG.API_URL}/api/v1/auth/token`;
      console.error('Authentication error:', error);
      const msg = error && error.message ? error.message : String(error);
      const wrapped = new Error(`Auth request failed to ${url}: ${msg}`);
      this.lastError = wrapped;
      throw wrapped;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect-failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return false;
    }

    this.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Handle incoming message
   */
  handleMessage(message) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }

    // Emit generic message event
    this.emit('message', message);
  }

  /**
   * Register message handler
   */
  on(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  /**
   * Emit event to handlers
   */
  emit(type, data) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
}

// Create global instance
const wsClient = new WebSocketClient();

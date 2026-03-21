class WebSocketManager {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectDelay = 1000;
    this.maxDelay = 30000;
    this.connected = false;
    this.statusListeners = [];
    this._reconnectTimer = null;
    this._shouldConnect = false;
  }

  connect() {
    this._shouldConnect = true;
    this._connect();
  }

  _connect() {
    if (!this._shouldConnect) return;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this._notifyStatus(true);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._notifyStatus(false);
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will handle reconnect
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type || msg.event;
        if (!type) return;
        const callbacks = this.listeners.get(type);
        if (callbacks) {
          callbacks.forEach(cb => {
            try { cb(msg.data || msg); } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* ignore malformed messages */ }
    };
  }

  _scheduleReconnect() {
    if (!this._shouldConnect) return;
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      this._connect();
    }, this.reconnectDelay);
  }

  disconnect() {
    this._shouldConnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._notifyStatus(false);
  }

  on(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  off(type, callback) {
    const set = this.listeners.get(type);
    if (set) set.delete(callback);
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  }

  _notifyStatus(connected) {
    this.statusListeners.forEach(cb => {
      try { cb(connected); } catch (e) { /* ignore */ }
    });
  }
}

export const wsManager = new WebSocketManager();

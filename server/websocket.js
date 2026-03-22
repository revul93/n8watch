'use strict';

const { WebSocketServer } = require('ws');

let _wss = null;

function initWebSocket(server) {
  _wss = new WebSocketServer({ server });

  _wss.on('connection', (ws) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });

    // Send a welcome message so clients know they're connected
    ws.send(JSON.stringify({ type: 'connected', data: { message: 'n8netwatch WebSocket connected' } }));
  });

  // Heartbeat to prune dead connections
  const heartbeat = setInterval(() => {
    _wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  _wss.on('close', () => clearInterval(heartbeat));

  console.log('[WS] WebSocket server initialized');
  return _wss;
}

function broadcast(type, data) {
  if (!_wss) return;
  const message = JSON.stringify({ type, data, ts: Date.now() });
  _wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message, (err) => {
        if (err) console.error('[WS] Send error:', err.message);
      });
    }
  });
}

module.exports = { initWebSocket, broadcast };

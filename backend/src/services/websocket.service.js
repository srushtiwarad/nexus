// ============================================================
// nexus/backend/src/services/websocket.service.js
// Real-time push notifications via WebSocket (ws library).
// Authenticates connections via JWT query param, rooms keyed
// by projectId so only relevant updates are pushed.
// ============================================================
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;

// Map<projectId, Set<WebSocket>>
const rooms = new Map();
// Map<userId, WebSocket>
const userSockets = new Map();

function initWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) return ws.close(4001, 'Missing token');

      let decoded;
      try {
        decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
      } catch {
        return ws.close(4001, 'Invalid token');
      }

      ws.userId = decoded.sub;
      ws.isAlive = true;
      userSockets.set(decoded.sub, ws);
      logger.debug(`WS connected: user ${decoded.sub}`);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'join' && msg.projectId) {
            joinRoom(ws, msg.projectId);
            ws.send(JSON.stringify({ type: 'joined', projectId: msg.projectId }));
          }
          if (msg.type === 'leave' && msg.projectId) {
            leaveRoom(ws, msg.projectId);
          }
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('close', () => {
        userSockets.delete(ws.userId);
        rooms.forEach((clients) => clients.delete(ws));
        logger.debug(`WS disconnected: user ${ws.userId}`);
      });

      ws.on('error', (err) => logger.error('WS error:', err.message));
    } catch (err) {
      logger.error('WS connection error:', err.message);
      ws.close(4000, 'Internal error');
    }
  });

  // Heartbeat to detect stale connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));
  logger.info('WebSocket server initialised');
}

function joinRoom(ws, projectId) {
  if (!rooms.has(projectId)) rooms.set(projectId, new Set());
  rooms.get(projectId).add(ws);
}

function leaveRoom(ws, projectId) {
  rooms.get(projectId)?.delete(ws);
}

// Broadcast an event to all sockets in a project room
function broadcastToProject(projectId, event) {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(event);
  room.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

// Push a notification to a specific user
function pushToUser(userId, event) {
  const ws = userSockets.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

module.exports = { initWebSocket, broadcastToProject, pushToUser };

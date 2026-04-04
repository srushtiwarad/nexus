// ============================================================
// nexus/backend/src/server.js
// Entry point — wires together all layers and starts HTTP +
// WebSocket server. All security middleware is applied here.
// ============================================================
require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initWebSocket } = require('./services/websocket.service');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await connectDB();
    await connectRedis();

    const server = http.createServer(app);
    initWebSocket(server);

    server.listen(PORT, () => {
      logger.info(`Nexus API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received – shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Startup failed:', err);
    process.exit(1);
  }
}

start();

// ============================================================
// nexus/backend/src/middleware/rateLimiter.js
// CUSTOM SECURITY LAYER — Multi-tier rate limiting backed by
// Redis for distributed enforcement across all instances.
// Supports 5000+ API hits per window across the cluster.
// ============================================================
const rateLimit = require('express-rate-limit');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

// ── Redis store adapter for express-rate-limit ────────────────
class RedisStore {
  constructor(prefix = 'rl:') {
    this.prefix = prefix;
  }

  key(ip) {
    return `${this.prefix}${ip}`;
  }

  async increment(ip) {
    const redis = getRedisClient();
    const key = this.key(ip);
    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);
    const [count, ttl] = await multi.exec();
    const hits = count[1];
    if (ttl[1] === -1) await redis.expire(key, 900); // 15 min window
    return { totalHits: hits, resetTime: new Date(Date.now() + (ttl[1] > 0 ? ttl[1] : 900) * 1000) };
  }

  async decrement(ip) {
    const redis = getRedisClient();
    await redis.decr(this.key(ip));
  }

  async resetKey(ip) {
    const redis = getRedisClient();
    await redis.del(this.key(ip));
  }
}

// ── Global limiter: 5000 req / 15 min per IP ─────────────────
// Handles the required 5000 API hits throughput requirement.
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:global:'),
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    logger.warn(`Rate limit hit: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// ── Auth limiter: 20 req / 15 min per IP (brute-force guard) ─
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:auth:'),
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    logger.warn(`Auth rate limit hit: ${req.ip}`);
    res.status(429).json({
      error: 'Too many authentication attempts. Try again in 15 minutes.',
    });
  },
});

// ── Write limiter: 200 req / 15 min per user (POST/PUT/PATCH) ─
const writeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:write:'),
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
});

// ── Custom per-route advanced limiter (sliding window) ───────
// More accurate than fixed-window; uses a sorted set in Redis.
async function slidingWindowLimiter({ limit, windowSec }) {
  return async (req, res, next) => {
    const redis = getRedisClient();
    const key = `rl:sw:${req.ip}:${req.path}`;
    const now = Date.now();
    const windowStart = now - windowSec * 1000;

    const multi = redis.multi();
    multi.zremrangebyscore(key, '-inf', windowStart);   // prune old
    multi.zadd(key, now, `${now}-${Math.random()}`);   // add current
    multi.zcard(key);                                   // count in window
    multi.expire(key, windowSec);
    const results = await multi.exec();
    const count = results[2][1];

    res.set('X-RateLimit-Limit', limit);
    res.set('X-RateLimit-Remaining', Math.max(0, limit - count));

    if (count > limit) {
      logger.warn(`Sliding window limit exceeded: ${req.ip} on ${req.path}`);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    next();
  };
}

module.exports = { globalRateLimiter, authRateLimiter, writeRateLimiter, slidingWindowLimiter };

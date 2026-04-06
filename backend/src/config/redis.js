// ============================================================
// nexus/backend/src/config/redis.js
// Redis client via ioredis. Used for: session data, rate limit
// counters, token blacklist, and task-queue pub/sub.
// ============================================================
const Redis = require('ioredis');
const logger = require('../utils/logger');

let client;

function createInMemoryRedis() {
  // Extremely small subset of Redis used by `rateLimiter.js`.
  const strings = new Map(); // key -> { value: number, expiresAtMs: number | null }
  const sortedSets = new Map(); // key -> { items: Array<{score:number, member:string}>, expiresAtMs }

  function now() {
    return Date.now();
  }

  function getStringEntry(key) {
    const entry = strings.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs != null && entry.expiresAtMs <= now()) {
      strings.delete(key);
      return null;
    }
    return entry;
  }

  function getSortedSetEntry(key) {
    const entry = sortedSets.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs != null && entry.expiresAtMs <= now()) {
      sortedSets.delete(key);
      return null;
    }
    return entry;
  }

  function ttlSecondsFor(entry) {
    if (!entry) return -2;
    if (entry.expiresAtMs == null) return -1;
    const msLeft = entry.expiresAtMs - now();
    if (msLeft <= 0) return -2;
    return Math.ceil(msLeft / 1000);
  }

  class Multi {
    constructor(redis) {
      this.redis = redis;
      this.ops = [];
    }

    incr(key) {
      this.ops.push({ op: 'incr', key });
      return this;
    }
    ttl(key) {
      this.ops.push({ op: 'ttl', key });
      return this;
    }
    decr(key) {
      this.ops.push({ op: 'decr', key });
      return this;
    }
    del(key) {
      this.ops.push({ op: 'del', key });
      return this;
    }
    expire(key, seconds) {
      this.ops.push({ op: 'expire', key, seconds });
      return this;
    }
    zremrangebyscore(key, min, max) {
      this.ops.push({ op: 'zremrangebyscore', key, min, max });
      return this;
    }
    zadd(key, score, member) {
      this.ops.push({ op: 'zadd', key, score, member });
      return this;
    }
    zcard(key) {
      this.ops.push({ op: 'zcard', key });
      return this;
    }

    async exec() {
      const results = [];
      for (const item of this.ops) {
        try {
          const value = this.redis._execOp(item);
          results.push([null, value]);
        } catch (err) {
          results.push([err, null]);
        }
      }
      return results;
    }
  }

  const redis = {
    multi() {
      return new Multi(redis);
    },
    async get(key) {
      const entry = getStringEntry(key);
      return entry ? String(entry.value) : null;
    },
    async set(key, value) {
      strings.set(key, { value: Number(value) || 0, expiresAtMs: null });
      return 'OK';
    },
    async incr(key) {
      const entry = getStringEntry(key) || { value: 0, expiresAtMs: null };
      entry.value += 1;
      strings.set(key, entry);
      return entry.value;
    },
    async decr(key) {
      const entry = getStringEntry(key) || { value: 0, expiresAtMs: null };
      entry.value -= 1;
      strings.set(key, entry);
      return entry.value;
    },
    async ttl(key) {
      const entry = getStringEntry(key);
      return ttlSecondsFor(entry);
    },
    async expire(key, seconds) {
      const entry = strings.get(key);
      if (entry) {
        entry.expiresAtMs = now() + seconds * 1000;
      }
      const zEntry = sortedSets.get(key);
      if (zEntry) {
        zEntry.expiresAtMs = now() + seconds * 1000;
      }
      return 1;
    },
    async del(key) {
      const existed = strings.delete(key) || sortedSets.delete(key);
      return existed ? 1 : 0;
    },

    _execOp(item) {
      switch (item.op) {
        case 'incr': {
          const entry = getStringEntry(item.key) || { value: 0, expiresAtMs: null };
          entry.value += 1;
          strings.set(item.key, entry);
          return entry.value;
        }
        case 'ttl': {
          return ttlSecondsFor(getStringEntry(item.key));
        }
        case 'decr': {
          const entry = getStringEntry(item.key) || { value: 0, expiresAtMs: null };
          entry.value -= 1;
          strings.set(item.key, entry);
          return entry.value;
        }
        case 'expire': {
          const entry = strings.get(item.key);
          if (entry) entry.expiresAtMs = now() + item.seconds * 1000;
          const zEntry = sortedSets.get(item.key);
          if (zEntry) zEntry.expiresAtMs = now() + item.seconds * 1000;
          return 1;
        }
        case 'del': {
          const ok = strings.delete(item.key) || sortedSets.delete(item.key);
          return ok ? 1 : 0;
        }
        case 'zremrangebyscore': {
          const entry = getSortedSetEntry(item.key);
          if (!entry) return 0;
          const max = item.max === '-inf' ? -Infinity : Number(item.max);
          // Keep items with score > max bound.
          const before = entry.items.length;
          entry.items = entry.items.filter((x) => x.score > max);
          const removed = before - entry.items.length;
          return removed;
        }
        case 'zadd': {
          const entry = getSortedSetEntry(item.key) || { items: [], expiresAtMs: null };
          entry.items.push({ score: Number(item.score), member: String(item.member) });
          sortedSets.set(item.key, entry);
          return 1;
        }
        case 'zcard': {
          const entry = getSortedSetEntry(item.key);
          return entry ? entry.items.length : 0;
        }
        default:
          throw new Error(`Unsupported in-memory redis op: ${item.op}`);
      }
    },
  };

  return redis;
}

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  ...(process.env.NODE_ENV === 'production' && { tls: {} }),
};

// Default to in-memory so the app can still boot if Redis is down.
client = createInMemoryRedis();

async function connectRedis() {
  if (process.env.SKIP_REDIS === 'true') {
    logger.info('SKIP_REDIS=true — using in-memory Redis fallback.');
    client = createInMemoryRedis();
    return;
  }

  const realClient = new Redis(redisConfig);
  client = realClient;

  // Prevent "Unhandled error event" if Redis is down.
  realClient.on('error', (err) => {
    if (client instanceof Redis) {
      logger.warn(`Redis connection error (${redisConfig.host}): ${err.message}. Falling back to in-memory.`);
      client.disconnect();
      client = createInMemoryRedis();
    }
  });

  realClient.on('reconnecting', () => logger.warn('Redis reconnecting…'));

  try {
    await new Promise((resolve, reject) => {
      // Short timeout for Redis connection to avoid blocking the app start too long
      const timeout = setTimeout(() => {
        realClient.disconnect();
        reject(new Error('Redis connection timeout'));
      }, 5000);

      realClient.once('ready', () => {
        clearTimeout(timeout);
        logger.info(`Redis connected: ${redisConfig.host}`);
        resolve();
      });

      realClient.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  } catch (err) {
    logger.warn(`Redis connection failed (${redisConfig.host}:${redisConfig.port}): ${err.message}. Using in-memory fallback.`);
    realClient.disconnect();
    client = createInMemoryRedis();
  }
}

function getRedisClient() {
  if (!client) throw new Error('Redis not initialised. Call connectRedis() first.');
  return client;
}

module.exports = { connectRedis, getRedisClient };

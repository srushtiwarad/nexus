// ============================================================
// nexus/backend/src/__tests__/rateLimiter.test.js
// Unit tests for the Redis-backed rate limiter.
// ============================================================

// Mock Redis before importing the limiter
const mockRedis = {
  multi: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  zadd: jest.fn(),
  zcard: jest.fn(),
  zremrangebyscore: jest.fn(),
};

let execResults = [[null, 1], [null, -1]]; // default: count=1, ttl=-1 (new key)

mockRedis.multi.mockReturnValue({
  incr: jest.fn().mockReturnThis(),
  ttl:  jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(execResults),
});

jest.mock('../config/redis', () => ({
  getRedisClient: () => mockRedis,
}));

// Import the RedisStore logic by extracting it (or test via the sliding window)
// Since RedisStore is defined inside the module, we test the behaviour
// through the sliding window which is exported.
const { slidingWindowLimiter } = require('../middleware/rateLimiter');

describe('slidingWindowLimiter', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { ip: '127.0.0.1', path: '/api/v1/test' };
    res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it('allows request within limit and sets rate limit headers', async () => {
    // Setup: 3 requests in window, limit is 10
    mockRedis.multi.mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd:             jest.fn().mockReturnThis(),
      zcard:            jest.fn().mockReturnThis(),
      expire:           jest.fn().mockReturnThis(),
      exec:             jest.fn().mockResolvedValue([
        [null, 0],  // zremrangebyscore
        [null, 1],  // zadd
        [null, 3],  // zcard → count = 3
        [null, 1],  // expire
      ]),
    });

    const limiter = await slidingWindowLimiter({ limit: 10, windowSec: 60 });
    await limiter(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', 7); // 10 - 3
  });

  it('blocks request exceeding the limit with 429', async () => {
    mockRedis.multi.mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd:             jest.fn().mockReturnThis(),
      zcard:            jest.fn().mockReturnThis(),
      expire:           jest.fn().mockReturnThis(),
      exec:             jest.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 11],  // count = 11 > limit 10
        [null, 1],
      ]),
    });

    const limiter = await slidingWindowLimiter({ limit: 10, windowSec: 60 });
    await limiter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded' });
  });

  it('sets X-RateLimit-Remaining to 0 when at or over limit', async () => {
    mockRedis.multi.mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd:             jest.fn().mockReturnThis(),
      zcard:            jest.fn().mockReturnThis(),
      expire:           jest.fn().mockReturnThis(),
      exec:             jest.fn().mockResolvedValue([
        [null, 0], [null, 1], [null, 15], [null, 1],
      ]),
    });

    const limiter = await slidingWindowLimiter({ limit: 10, windowSec: 60 });
    await limiter(req, res, next);

    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
  });
});

describe('Global rate limit configuration', () => {
  it('exports globalRateLimiter as a function', () => {
    const { globalRateLimiter } = require('../middleware/rateLimiter');
    expect(typeof globalRateLimiter).toBe('function');
  });

  it('exports authRateLimiter as a function', () => {
    const { authRateLimiter } = require('../middleware/rateLimiter');
    expect(typeof authRateLimiter).toBe('function');
  });

  it('exports writeRateLimiter as a function', () => {
    const { writeRateLimiter } = require('../middleware/rateLimiter');
    expect(typeof writeRateLimiter).toBe('function');
  });
});

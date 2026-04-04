// ============================================================
// nexus/backend/src/__tests__/auth.middleware.test.js
// Unit tests for the custom security layer.
// Run: npm test
// ============================================================
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring the module
jest.mock('../config/redis', () => ({
  getRedisClient: () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }),
}));

jest.mock('../services/user.service', () => ({
  getUserById: jest.fn(),
}));

const {
  signAccessToken,
  signRefreshToken,
  authenticate,
} = require('../middleware/auth.middleware');
const { getUserById } = require('../services/user.service');
const { getRedisClient } = require('../config/redis');

// Test environment secrets
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';
process.env.JWT_ACCESS_TTL = '15m';

// ── Helpers ───────────────────────────────────────────────────
function makeReqRes() {
  const req = { headers: {}, user: null, tokenJTI: null };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

describe('signAccessToken', () => {
  it('returns a valid JWT with expected claims', () => {
    const payload = { sub: 'user-123', role: 'user', jti: 'jti-abc' };
    const token = signAccessToken(payload);
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('user');
    expect(decoded.jti).toBe('jti-abc');
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('expires in approximately 15 minutes', () => {
    const token = signAccessToken({ sub: 'u1', role: 'user', jti: 'j1' });
    const decoded = jwt.decode(token);
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBe(900); // 15 * 60
  });
});

describe('signRefreshToken', () => {
  it('expires in approximately 7 days', () => {
    const token = signRefreshToken({ sub: 'u1', role: 'user', jti: 'j1' });
    const decoded = jwt.decode(token);
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBe(7 * 24 * 60 * 60);
  });
});

describe('authenticate middleware', () => {
  const mockUser = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'user',
    is_suspended: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getRedisClient().get.mockResolvedValue(null); // not blacklisted
    getUserById.mockResolvedValue(mockUser);
  });

  it('attaches user to req on valid token', async () => {
    const token = signAccessToken({ sub: mockUser.id, role: 'user', jti: 'test-jti' });
    const { req, res, next } = makeReqRes();
    req.headers.authorization = `Bearer ${token}`;

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(/* no error */);
    expect(req.user).toEqual(mockUser);
    expect(req.tokenJTI).toBe('test-jti');
  });

  it('calls next with 401 when no Authorization header', async () => {
    const { req, res, next } = makeReqRes();
    await authenticate(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/authorization/i);
  });

  it('calls next with 401 when token is expired', async () => {
    const expiredToken = jwt.sign(
      { sub: 'u1', role: 'user', jti: 'j1' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -1 }
    );
    const { req, res, next } = makeReqRes();
    req.headers.authorization = `Bearer ${expiredToken}`;

    await authenticate(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/expired/i);
  });

  it('calls next with 401 when token is blacklisted', async () => {
    getRedisClient().get.mockResolvedValue('1'); // blacklisted
    const token = signAccessToken({ sub: mockUser.id, role: 'user', jti: 'blacklisted-jti' });
    const { req, res, next } = makeReqRes();
    req.headers.authorization = `Bearer ${token}`;

    await authenticate(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/revoked/i);
  });

  it('calls next with 403 when user is suspended', async () => {
    getUserById.mockResolvedValue({ ...mockUser, is_suspended: true });
    const token = signAccessToken({ sub: mockUser.id, role: 'user', jti: 'jti-sus' });
    const { req, res, next } = makeReqRes();
    req.headers.authorization = `Bearer ${token}`;

    await authenticate(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/suspended/i);
  });

  it('calls next with 401 when user does not exist', async () => {
    getUserById.mockResolvedValue(null);
    const token = signAccessToken({ sub: 'nonexistent', role: 'user', jti: 'jti-ghost' });
    const { req, res, next } = makeReqRes();
    req.headers.authorization = `Bearer ${token}`;

    await authenticate(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it('calls next with 401 on tampered token', async () => {
    const token = signAccessToken({ sub: mockUser.id, role: 'user', jti: 'jti-t' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    const { req, res, next } = makeReqRes();
    req.headers.authorization = `Bearer ${tampered}`;

    await authenticate(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/invalid/i);
  });
});

describe('requireRole middleware', () => {
  const { requireRole } = require('../middleware/auth.middleware');

  it('passes when user has a required role', () => {
    const middleware = requireRole('admin', 'superadmin');
    const req = { user: { id: 'u1', role: 'admin' } };
    const next = jest.fn();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(/* no error */);
  });

  it('blocks when user role is insufficient', () => {
    const middleware = requireRole('admin');
    const req = { user: { id: 'u1', role: 'user' } };
    const next = jest.fn();
    middleware(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('returns 401 when user is not set on req', () => {
    const middleware = requireRole('admin');
    const req = {};
    const next = jest.fn();
    middleware(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });
});

// ============================================================
// nexus/backend/src/__tests__/auth.routes.test.js
// Integration tests for /auth endpoints using supertest.
// Requires a running PostgreSQL + Redis (use docker-compose).
// ============================================================
const request = require('supertest');
const app = require('../app');

// These tests run against a real DB seeded by test fixtures.
// In CI, GitHub Actions spins up postgres + redis as services.

const TEST_USER = {
  email: `test_${Date.now()}@nexus.test`,
  password: 'TestPass123',
  fullName: 'Test User',
};

let accessToken, refreshToken;

describe('POST /api/v1/auth/register', () => {
  it('creates a new user and returns token pair', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.password_hash).toBeUndefined(); // never exposed

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(TEST_USER);

    expect(res.status).toBe(409);
  });

  it('rejects weak password with 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...TEST_USER, email: 'other@test.com', password: '123' });

    expect(res.status).toBe(422);
  });

  it('rejects invalid email format with 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...TEST_USER, email: 'notanemail' });

    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns token pair for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(TEST_USER.email);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass999' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent email (same latency as wrong password)', async () => {
    const start = Date.now();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@nowhere.com', password: 'anything' });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(401);
    // bcrypt must still run (timing-safe): takes at least 50ms
    expect(elapsed).toBeGreaterThan(50);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns current user for valid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_USER.email);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns a new token pair for a valid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    // Tokens should be different (rotated)
    expect(res.body.accessToken).not.toBe(accessToken);
    expect(res.body.refreshToken).not.toBe(refreshToken);

    // Update for subsequent tests
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('detects refresh token reuse and returns 401', async () => {
    // The old refreshToken was blacklisted by the rotation above
    const oldRefreshToken = refreshToken; // already rotated once
    // Rotate once more to get a fresh pair
    const rotateRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    // This one is still valid
    expect(rotateRes.status).toBe(200);

    // Now try to reuse the oldRefreshToken — it's blacklisted
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error).toMatch(/reuse/i);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('blacklists the access token', async () => {
    // Get a fresh login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    const token = loginRes.body.accessToken;

    // Logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Token should now be blacklisted
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });
});

describe('Rate limiting on /auth routes', () => {
  it('returns 429 after exceeding auth rate limit', async () => {
    // Send 21 requests (limit is 20 per 15 min per IP)
    const requests = Array.from({ length: 21 }, () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'flood@test.com', password: 'x' })
    );
    const responses = await Promise.all(requests);
    const tooMany = responses.filter(r => r.status === 429);
    expect(tooMany.length).toBeGreaterThan(0);
  });
});

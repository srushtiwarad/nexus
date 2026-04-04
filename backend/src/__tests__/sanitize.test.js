// ============================================================
// nexus/backend/src/__tests__/sanitize.test.js
// Unit tests for the input sanitisation security layer.
// ============================================================
const { deepSanitize, sanitizeInputs } = require('../middleware/sanitize');

describe('deepSanitize', () => {
  it('strips XSS script tags from strings', () => {
    const result = deepSanitize('<script>alert("xss")</script>hello');
    expect(result).not.toContain('<script>');
    expect(result).toContain('hello');
  });

  it('sanitises nested object values', () => {
    const input = { name: '<img src=x onerror=alert(1)>', age: 30 };
    const result = deepSanitize(input);
    expect(result.name).not.toContain('onerror');
    expect(result.age).toBe(30);
  });

  it('sanitises arrays recursively', () => {
    const input = ['<script>bad()</script>', 'safe'];
    const result = deepSanitize(input);
    expect(result[0]).not.toContain('<script>');
    expect(result[1]).toBe('safe');
  });

  it('strips __proto__ keys to prevent prototype pollution', () => {
    const input = JSON.parse('{"__proto__": {"admin": true}, "name": "test"}');
    const result = deepSanitize(input);
    expect(result.__proto__).toBeUndefined();
    expect(result.name).toBe('test');
  });

  it('strips constructor keys', () => {
    const input = { constructor: { prototype: { isAdmin: true } }, value: 42 };
    const result = deepSanitize(input);
    expect(result.constructor).toBeUndefined();
    expect(result.value).toBe(42);
  });

  it('handles null and primitive passthrough', () => {
    expect(deepSanitize(null)).toBeNull();
    expect(deepSanitize(42)).toBe(42);
    expect(deepSanitize(true)).toBe(true);
  });

  it('does not mutate deeply nested objects beyond depth 10', () => {
    // Build a deeply nested object
    let obj = { value: 'deep' };
    for (let i = 0; i < 12; i++) obj = { nested: obj };
    // Should not throw or recurse infinitely
    expect(() => deepSanitize(obj)).not.toThrow();
  });
});

describe('sanitizeInputs middleware', () => {
  function makeReq(body = {}, query = {}, params = {}) {
    return { body, query, params, path: '/api/v1/projects' };
  }

  it('sanitises req.body and calls next', () => {
    const req = makeReq({ title: '<b>test</b>' });
    const next = jest.fn();
    sanitizeInputs(req, {}, next);
    expect(next).toHaveBeenCalledWith(/* no error */);
    expect(req.body.title).not.toContain('<b>');
  });

  it('blocks requests with SQL injection patterns and calls next with 400', () => {
    const req = makeReq({ email: "admin'--" });
    const next = jest.fn();
    sanitizeInputs(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/malicious/i);
  });

  it('blocks UNION SELECT injection', () => {
    const req = makeReq({ search: "' UNION SELECT password FROM users--" });
    const next = jest.fn();
    sanitizeInputs(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('sanitises req.query', () => {
    const req = makeReq({}, { q: '<script>x</script>' });
    const next = jest.fn();
    sanitizeInputs(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query.q).not.toContain('<script>');
  });

  it('passes clean data through without modification', () => {
    const req = makeReq({ name: 'Project Alpha', count: 5 });
    const next = jest.fn();
    sanitizeInputs(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.name).toBe('Project Alpha');
  });
});

// ============================================================
// nexus/backend/src/__tests__/task.routes.test.js
// Integration tests for task CRUD under project routes.
// ============================================================
const request = require('supertest');
const app = require('../app');

// These tests assume the auth tests have run (DB has test user).
// In isolation, create a fresh user per describe block.

let token, projectId, taskId;

beforeAll(async () => {
  // Register + login to get a token
  const email = `tasks_${Date.now()}@nexus.test`;
  await request(app).post('/api/v1/auth/register').send({
    email, password: 'TasksPass1', fullName: 'Tasks Tester',
  });
  const loginRes = await request(app).post('/api/v1/auth/login')
    .send({ email, password: 'TasksPass1' });
  token = loginRes.body.accessToken;

  // Create a team + project
  const teamRes = await request(app)
    .post('/api/v1/teams')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Team' });
  const teamId = teamRes.body.id;

  const projRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Project', teamId });
  projectId = projRes.body.id;
});

describe('POST /api/v1/projects/:pid/tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'First Task', priority: 'high', status: 'todo' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('First Task');
    expect(res.body.priority).toBe('high');
    expect(res.body.project_id).toBe(projectId);
    taskId = res.body.id;
  });

  it('rejects task creation without a title', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'low' });

    expect(res.status).toBe(422);
  });

  it('rejects invalid priority value', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad Priority', priority: 'super_urgent' });

    expect(res.status).toBe(422);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .send({ title: 'No Auth' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/projects/:pid/tasks', () => {
  it('lists tasks with pagination metadata', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/tasks?status=todo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    res.body.data.forEach(t => expect(t.status).toBe('todo'));
  });

  it('returns 400 for non-UUID projectId', async () => {
    const res = await request(app)
      .get('/api/v1/projects/not-a-uuid/tasks')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/projects/:pid/tasks/:taskId', () => {
  it('returns a single task', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
    expect(res.body.title).toBe('First Task');
  });

  it('returns 404 for nonexistent task', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/tasks/00000000-0000-4000-a000-000000000000`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/projects/:pid/tasks/:taskId', () => {
  it('updates task status', async () => {
    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('updates task title', async () => {
    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Task Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Task Title');
  });

  it('returns 400 when no valid fields provided', async () => {
    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unknown_field: 'value' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/projects/:pid/tasks/:taskId', () => {
  it('cancels the task (soft delete)', async () => {
    const res = await request(app)
      .delete(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`);

    // Owners are project admins, so can delete
    expect(res.status).toBe(200);

    // Verify it's now cancelled
    const getRes = await request(app)
      .get(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.status).toBe('cancelled');
  });
});

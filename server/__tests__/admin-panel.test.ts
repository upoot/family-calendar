import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import supertest from 'supertest';

let app: any, db: any, request: any;
let adminToken: string, adminId: number;
let userToken: string, userId: number;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-admin-panel';
  process.env.DB_PATH = '/tmp/test-admin-panel-' + process.pid + '.db';
  const mod = await import('../index.js');
  app = mod.app; db = mod.db;
  request = supertest(app);
});

beforeEach(async () => {
  db.exec('DELETE FROM events');
  db.exec('DELETE FROM members');
  db.exec('DELETE FROM family_users');
  db.exec('DELETE FROM families');
  db.exec('DELETE FROM users');

  const a = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'admin@test.com', password: 'password123', name: 'Admin' });
  adminToken = a.body.token;
  adminId = a.body.user.id;

  const u = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'user@test.com', password: 'password123', name: 'User' });
  userToken = u.body.token;
  userId = u.body.user.id;
});

// ── GET /api/families — owner info ──────────────────────────────────────────

describe('GET /api/families returns owner info', () => {
  it('includes owner object for admin', async () => {
    await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Family' });

    const res = await request.get('/api/families')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].owner).toBeDefined();
    expect(res.body[0].owner.name).toBe('Admin');
    expect(res.body[0].owner.email).toBe('admin@test.com');
  });
});

// ── POST /api/families — admin assignment ───────────────────────────────────

describe('POST /api/families with admin assignment', () => {
  it('assigns existing user as owner', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'Assigned Family', admin_user_id: userId });

    expect(res.status).toBe(201);
    expect(res.body.owner.id).toBe(userId);
    expect(res.body.owner.email).toBe('user@test.com');
  });

  it('creates new user and assigns as owner', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({
        name: 'New Admin Family',
        admin_user: { name: 'New Owner', email: 'newowner@test.com', password: 'password123' }
      });

    expect(res.status).toBe(201);
    expect(res.body.owner.email).toBe('newowner@test.com');
    expect(res.body.owner.name).toBe('New Owner');
  });

  it('rejects new admin user with short password', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({
        name: 'Fail Family',
        admin_user: { name: 'Bad', email: 'bad@test.com', password: 'short' }
      });

    expect(res.status).toBe(400);
  });

  it('rejects admin_user_id for non-existent user', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'Ghost Family', admin_user_id: 99999 });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/families — initial members ────────────────────────────────────

describe('POST /api/families with initial members', () => {
  it('creates family with members', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({
        name: 'Members Family',
        members: [
          { name: 'Alice', color: '#ff0000' },
          { name: 'Bob', color: '#00ff00' }
        ]
      });

    expect(res.status).toBe(201);
    const familyId = res.body.id;

    // Verify members were created
    const membersRes = await request.get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ familyId });
    expect(membersRes.status).toBe(200);
    expect(membersRes.body.length).toBe(2);
    expect(membersRes.body[0].name).toBe('Alice');
    expect(membersRes.body[1].name).toBe('Bob');
  });
});

// ── Superadmin CRUD ─────────────────────────────────────────────────────────

describe('GET /api/admin/superadmins', () => {
  it('returns list of superadmins', async () => {
    const res = await request.get('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].email).toBe('admin@test.com');
  });

  it('rejects non-superadmin', async () => {
    const res = await request.get('/api/admin/superadmins')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/superadmins', () => {
  it('promotes existing user to superadmin', async () => {
    const res = await request.post('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ user_id: userId });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@test.com');

    // Verify in list
    const list = await request.get('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.length).toBe(2);
  });

  it('creates new superadmin user', async () => {
    const res = await request.post('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'New SA', email: 'newsa@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newsa@test.com');
  });

  it('rejects promoting already superadmin', async () => {
    const res = await request.post('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ user_id: adminId });
    expect(res.status).toBe(409);
  });

  it('rejects non-superadmin caller', async () => {
    const res = await request.post('/api/admin/superadmins')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Content-Type', 'application/json')
      .send({ user_id: userId });
    expect(res.status).toBe(403);
  });

  it('rejects short password for new superadmin', async () => {
    const res = await request.post('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ email: 'x@test.com', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/superadmins/:id', () => {
  it('demotes superadmin to user', async () => {
    // First promote user
    await request.post('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ user_id: userId });

    const res = await request.delete(`/api/admin/superadmins/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify demoted
    const list = await request.get('/api/admin/superadmins')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.length).toBe(1);
  });

  it('cannot demote yourself', async () => {
    const res = await request.delete(`/api/admin/superadmins/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('yourself');
  });

  it('rejects demoting non-superadmin', async () => {
    const res = await request.delete(`/api/admin/superadmins/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects non-superadmin caller', async () => {
    const res = await request.delete(`/api/admin/superadmins/${adminId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

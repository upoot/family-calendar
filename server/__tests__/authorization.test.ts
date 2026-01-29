import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import supertest from 'supertest';

let app: any, db: any, request: any;
let adminToken: string, user1Token: string, user2Token: string;
let family1Id: number, family2Id: number;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-authorization';
  process.env.DB_PATH = '/tmp/test-authorization-' + process.pid + '.db';
  const mod = await import('../index.js');
  app = mod.app; db = mod.db;
  request = supertest(app);
});

beforeEach(async () => {
  db.exec('DELETE FROM events');
  db.exec('DELETE FROM categories WHERE family_id IS NOT NULL');
  db.exec('DELETE FROM members');
  db.exec('DELETE FROM family_users');
  db.exec('DELETE FROM families');
  db.exec('DELETE FROM users');

  // Admin (first user)
  const a = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'admin@test.com', password: 'password123', name: 'Admin' });
  adminToken = a.body.token;

  // User 1 creates family 1
  const u1 = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'user1@test.com', password: 'password123', name: 'User1' });
  user1Token = u1.body.token;

  const f1 = await request.post('/api/families')
    .set('Authorization', `Bearer ${user1Token}`)
    .send({ name: 'Family One' });
  family1Id = f1.body.id;

  // User 2 creates family 2
  const u2 = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'user2@test.com', password: 'password123', name: 'User2' });
  user2Token = u2.body.token;

  const f2 = await request.post('/api/families')
    .set('Authorization', `Bearer ${user2Token}`)
    .send({ name: 'Family Two' });
  family2Id = f2.body.id;
});

describe('Cross-family access', () => {
  it('user1 cannot access family2 members', async () => {
    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${user1Token}`)
      .query({ familyId: family2Id });
    expect(res.status).toBe(403);
  });

  it('user2 cannot access family1 members', async () => {
    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${user2Token}`)
      .query({ familyId: family1Id });
    expect(res.status).toBe(403);
  });

  it('user1 cannot create member in family2', async () => {
    const res = await request.post('/api/members')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'Intruder', color: '#000', family_id: family2Id });
    expect(res.status).toBe(403);
  });

  it('user1 cannot get events from family2', async () => {
    const res = await request.get('/api/events')
      .set('Authorization', `Bearer ${user1Token}`)
      .query({ week: '2024-01-01', familyId: family2Id });
    expect(res.status).toBe(403);
  });

  it('user1 cannot create events in family2', async () => {
    const res = await request.post('/api/events')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ member_id: 1, title: 'X', start_time: '10:00', end_time: '11:00', family_id: family2Id });
    expect(res.status).toBe(403);
  });

  it('user2 cannot update family1', async () => {
    const res = await request.put(`/api/families/${family1Id}`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('Admin access', () => {
  it('admin can access any family members', async () => {
    // Create a member in family1 first
    await request.post('/api/members')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'Alice', color: '#ff0000', family_id: family1Id });

    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ familyId: family1Id });
    expect(res.status).toBe(200);
  });

  it('admin can see all families', async () => {
    const res = await request.get('/api/families')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('non-admin cannot access admin routes', async () => {
    const res = await request.get('/api/admin/users')
      .set('Authorization', `Bearer ${user1Token}`);
    expect(res.status).toBe(403);
  });

  it('admin can access admin routes', async () => {
    const res = await request.get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('Invite flow', () => {
  it('user can join family via invite code', async () => {
    // Get invite code for family1
    const inv = await request.post(`/api/families/${family1Id}/invite`)
      .set('Authorization', `Bearer ${user1Token}`);
    const code = inv.body.invite_code;

    // User2 joins family1
    const join = await request.post(`/api/invite/${code}`)
      .set('Authorization', `Bearer ${user2Token}`);
    expect(join.status).toBe(200);

    // Now user2 can access family1 members
    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${user2Token}`)
      .query({ familyId: family1Id });
    expect(res.status).toBe(200);
  });

  it('invalid invite code returns 404', async () => {
    const res = await request.get('/api/invite/invalidcode');
    expect(res.status).toBe(404);
  });
});

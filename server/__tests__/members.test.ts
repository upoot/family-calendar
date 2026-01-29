import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { MemberSchema } from '../../shared/schemas.js';

let app: any, db: any, request: any;
let adminToken: string, userToken: string;
let familyId: number;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-members';
  process.env.DB_PATH = '/tmp/test-members-' + process.pid + '.db';
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

  const a = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'admin@test.com', password: 'password123', name: 'Admin' });
  adminToken = a.body.token;

  const u = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'user@test.com', password: 'password123', name: 'User' });
  userToken = u.body.token;

  const fam = await request.post('/api/families')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Family' });
  familyId = fam.body.id;
});

describe('POST /api/members', () => {
  it('owner creates a member', async () => {
    const res = await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alice', color: '#ff0000', family_id: familyId });
    expect(res.status).toBe(201);
    MemberSchema.parse(res.body);
    expect(res.body.name).toBe('Alice');
  });

  it('non-owner cannot create member', async () => {
    const res = await request.post('/api/members')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Bob', color: '#00ff00', family_id: familyId });
    expect(res.status).toBe(403);
  });

  it('rejects missing fields', async () => {
    const res = await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'No Color' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/members', () => {
  it('returns members for family', async () => {
    await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alice', color: '#ff0000', family_id: familyId });

    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ familyId });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    MemberSchema.parse(res.body[0]);
  });

  it('requires familyId', async () => {
    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('non-member cannot access', async () => {
    const res = await request.get('/api/members')
      .set('Authorization', `Bearer ${userToken}`)
      .query({ familyId });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/members/:id', () => {
  it('owner updates member', async () => {
    const m = await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alice', color: '#ff0000', family_id: familyId });

    const res = await request.put(`/api/members/${m.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alice Updated', color: '#0000ff' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice Updated');
  });
});

describe('PUT /api/members/reorder', () => {
  it('reorders members', async () => {
    const m1 = await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'A', color: '#ff0000', family_id: familyId });
    const m2 = await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'B', color: '#00ff00', family_id: familyId });

    const res = await request.put('/api/members/reorder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        family_id: familyId,
        order: [
          { id: m2.body.id, display_order: 1 },
          { id: m1.body.id, display_order: 2 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('B');
  });
});

describe('DELETE /api/members/:id', () => {
  it('owner deletes member', async () => {
    const m = await request.post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Me', color: '#ff0000', family_id: familyId });

    const res = await request.delete(`/api/members/${m.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for non-existent member', async () => {
    const res = await request.delete('/api/members/99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

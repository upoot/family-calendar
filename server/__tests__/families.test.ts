import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { FamilySchema, FamilyWithUsersSchema, ErrorSchema } from '../../shared/schemas.js';

let app: any, db: any, request: any;
let adminToken: string;
let userToken: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-families';
  process.env.DB_PATH = '/tmp/test-families-' + process.pid + '.db';
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

  // Register admin (first user)
  const a = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'admin@test.com', password: 'password123', name: 'Admin' });
  adminToken = a.body.token;

  // Register regular user
  const u = await request.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email: 'user@test.com', password: 'password123', name: 'User' });
  userToken = u.body.token;
});

describe('POST /api/families', () => {
  it('creates a family and makes creator owner', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'Test Family' });

    expect(res.status).toBe(201);
    FamilySchema.parse(res.body);
    expect(res.body.name).toBe('Test Family');
  });

  it('regular user can also create a family', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Content-Type', 'application/json')
      .send({ name: 'User Family' });

    expect(res.status).toBe(201);
  });

  it('rejects without name', async () => {
    const res = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated', async () => {
    const res = await request.post('/api/families')
      .set('Content-Type', 'application/json')
      .send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/families', () => {
  it('admin sees all families', async () => {
    await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fam1' });
    await request.post('/api/families')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Fam2' });

    const res = await request.get('/api/families')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('regular user sees only their families', async () => {
    await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'AdminFam' });
    await request.post('/api/families')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'UserFam' });

    const res = await request.get('/api/families')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('UserFam');
  });
});

describe('GET /api/families/:familyId', () => {
  it('returns family with users', async () => {
    const fam = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Detail Fam' });

    const res = await request.get(`/api/families/${fam.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    FamilyWithUsersSchema.parse(res.body);
    expect(res.body.users.length).toBeGreaterThan(0);
  });
});

describe('PUT /api/families/:familyId', () => {
  it('owner can update family name', async () => {
    const fam = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Old Name' });

    const res = await request.put(`/api/families/${fam.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('non-owner cannot update family', async () => {
    const fam = await request.post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Protected' });

    const res = await request.put(`/api/families/${fam.body.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

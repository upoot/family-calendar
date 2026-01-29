import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { AuthResponseSchema, LoginResponseSchema, MeResponseSchema, ErrorSchema } from '../../shared/schemas.js';

let app: any;
let db: any;
let request: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-auth';
  process.env.DB_PATH = '/tmp/test-auth-' + process.pid + '.db';
  const mod = await import('../index.js');
  app = mod.app;
  db = mod.db;
  request = supertest(app);
});

beforeEach(() => {
  db.exec('DELETE FROM events');
  db.exec('DELETE FROM members');
  db.exec('DELETE FROM family_users');
  db.exec('DELETE FROM families');
  db.exec('DELETE FROM users');
});

describe('POST /api/auth/register', () => {
  it('registers first user as admin', async () => {
    const res = await request
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'admin@test.com', password: 'password123', name: 'Admin' });
    
    expect(res.status).toBe(201);
    const parsed = AuthResponseSchema.parse(res.body);
    expect(parsed.user.role).toBe('superadmin');
    expect(parsed.user.email).toBe('admin@test.com');
    expect(parsed.token).toBeTruthy();
  });

  it('registers second user as regular user', async () => {
    await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'admin@test.com', password: 'password123', name: 'Admin' });
    
    const res = await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'user@test.com', password: 'password123', name: 'User' });
    
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
  });

  it('rejects duplicate email', async () => {
    await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'dup@test.com', password: 'password123', name: 'First' });
    
    const res = await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'dup@test.com', password: 'password123', name: 'Second' });
    
    expect(res.status).toBe(409);
    ErrorSchema.parse(res.body);
  });

  it('rejects missing fields', async () => {
    const res = await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'x@test.com' });
    
    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'x@test.com', password: 'short', name: 'X' });
    
    expect(res.status).toBe(400);
  });

  it('rejects non-JSON content type', async () => {
    const res = await request.post('/api/auth/register')
      .set('Content-Type', 'text/plain')
      .send('{}');
    
    expect(res.status).toBe(415);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'login@test.com', password: 'password123', name: 'Login User' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'login@test.com', password: 'password123' });
    
    expect(res.status).toBe(200);
    LoginResponseSchema.parse(res.body);
  });

  it('rejects wrong password', async () => {
    const res = await request.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'login@test.com', password: 'wrongpassword' });
    
    expect(res.status).toBe(401);
  });

  it('rejects non-existent user', async () => {
    const res = await request.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'nobody@test.com', password: 'password123' });
    
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user info with valid token', async () => {
    const reg = await request.post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'me@test.com', password: 'password123', name: 'Me User' });
    
    const res = await request.get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    
    expect(res.status).toBe(200);
    MeResponseSchema.parse(res.body);
    expect(res.body.email).toBe('me@test.com');
    expect(res.body.families).toBeInstanceOf(Array);
  });

  it('rejects without token', async () => {
    const res = await request.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request.get('/api/auth/me')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
  });
});

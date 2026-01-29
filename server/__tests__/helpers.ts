import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';

// We need to dynamically import the server module with a fresh DB each time.
// The server uses better-sqlite3 with a file path. We'll set env vars before import.

let app: any;
let db: any;
let request: supertest.SuperTest<supertest.Test>;

export async function setupTestServer() {
  // Set test env
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
  
  // Import the server - it uses ESM so we need dynamic import
  // But since the db path is hardcoded, we need a different approach.
  // We'll use supertest against the app directly.
  const mod = await import('../index.js');
  app = mod.app;
  db = mod.db;
  request = supertest(app);
  return { app, db, request };
}

export async function registerUser(request: any, data: { email: string; password: string; name: string }) {
  return request
    .post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send(data);
}

export async function loginUser(request: any, data: { email: string; password: string }) {
  return request
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send(data);
}

export async function createFamily(request: any, token: string, name: string) {
  return request
    .post('/api/families')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({ name });
}

export async function createMember(request: any, token: string, data: { name: string; color: string; family_id: number }) {
  return request
    .post('/api/members')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send(data);
}

export function cleanDb(db: any) {
  db.exec('DELETE FROM events');
  db.exec('DELETE FROM members');
  db.exec('DELETE FROM family_users');
  db.exec('DELETE FROM families');
  db.exec('DELETE FROM users');
}

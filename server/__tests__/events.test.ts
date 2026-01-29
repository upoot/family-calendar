import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { EventSchema } from '../../shared/schemas.js';

let app: any, db: any, request: any;
let adminToken: string;
let familyId: number;
let memberId: number;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-events';
  process.env.DB_PATH = '/tmp/test-events-' + process.pid + '.db';
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

  const fam = await request.post('/api/families')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Family' });
  familyId = fam.body.id;

  const mem = await request.post('/api/members')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Alice', color: '#ff0000', family_id: familyId });
  memberId = mem.body.id;
});

const today = new Date();
const monday = new Date(today);
monday.setDate(today.getDate() - today.getDay() + 1);
const mondayStr = monday.toISOString().slice(0, 10);

describe('POST /api/events', () => {
  it('creates an event', async () => {
    const res = await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId,
        title: 'Soccer Practice',
        start_time: '16:00',
        end_time: '17:30',
        date: mondayStr,
        family_id: familyId,
      });
    expect(res.status).toBe(201);
    EventSchema.parse(res.body);
    expect(res.body.title).toBe('Soccer Practice');
    expect(res.body.member_name).toBe('Alice');
  });

  it('rejects without family_id', async () => {
    const res = await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ member_id: memberId, title: 'X', start_time: '10:00', end_time: '11:00' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events', () => {
  it('returns events for a week', async () => {
    await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'Test', start_time: '10:00', end_time: '11:00',
        date: mondayStr, family_id: familyId,
      });

    const res = await request.get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ week: mondayStr, familyId });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    EventSchema.parse(res.body[0]);
  });

  it('includes recurring events', async () => {
    await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'Weekly', start_time: '09:00', end_time: '10:00',
        weekday: 1, is_recurring: true, family_id: familyId,
      });

    const res = await request.get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ week: mondayStr, familyId });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('requires week parameter', async () => {
    const res = await request.get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ familyId });
    expect(res.status).toBe(400);
  });

  it('requires familyId parameter', async () => {
    const res = await request.get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ week: mondayStr });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/events/:id', () => {
  it('updates an event', async () => {
    const ev = await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'Old', start_time: '10:00', end_time: '11:00',
        date: mondayStr, family_id: familyId,
      });

    const res = await request.put(`/api/events/${ev.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'Updated', start_time: '10:00', end_time: '12:00',
        date: mondayStr,
      });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
  });

  it('returns 404 for non-existent event', async () => {
    const res = await request.put('/api/events/99999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ member_id: memberId, title: 'X', start_time: '10:00', end_time: '11:00' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/events/:id', () => {
  it('patches event (drag)', async () => {
    const ev = await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'Drag Me', start_time: '10:00', end_time: '11:00',
        date: mondayStr, family_id: familyId,
      });

    const newDate = new Date(monday);
    newDate.setDate(newDate.getDate() + 1);
    const newDateStr = newDate.toISOString().slice(0, 10);

    const res = await request.patch(`/api/events/${ev.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: newDateStr });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(newDateStr);
  });

  it('rejects empty patch', async () => {
    const ev = await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'X', start_time: '10:00', end_time: '11:00',
        date: mondayStr, family_id: familyId,
      });

    const res = await request.patch(`/api/events/${ev.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/events/:id', () => {
  it('deletes an event', async () => {
    const ev = await request.post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        member_id: memberId, title: 'Delete Me', start_time: '10:00', end_time: '11:00',
        date: mondayStr, family_id: familyId,
      });

    const res = await request.delete(`/api/events/${ev.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for non-existent', async () => {
    const res = await request.delete('/api/events/99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

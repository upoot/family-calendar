import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'family-calendar-secret-change-me';
const db = new Database(join(__dirname, 'calendar.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    display_order INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id),
    category_id INTEGER REFERENCES categories(id),
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    date TEXT,
    weekday INTEGER,
    location TEXT,
    description TEXT,
    is_recurring BOOLEAN DEFAULT 0,
    ride_outbound TEXT,
    ride_return TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate: add ride columns (legacy)
try { db.exec(`ALTER TABLE events ADD COLUMN ride_outbound TEXT`); } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN ride_return TEXT`); } catch {}

// ── Multi-tenant migration ──────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    invite_code TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS family_users (
    user_id INTEGER NOT NULL REFERENCES users(id),
    family_id INTEGER NOT NULL REFERENCES families(id),
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (user_id, family_id)
  );
`);

// Add family_id to members and events
try { db.exec(`ALTER TABLE members ADD COLUMN family_id INTEGER REFERENCES families(id)`); } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN family_id INTEGER REFERENCES families(id)`); } catch {}

// ── Seed ────────────────────────────────────────────────────────────────────

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex');
}

// Seed admin user
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@family.cal');
let adminId;
if (!adminExists) {
  const hash = bcrypt.hashSync('admin', 10);
  const r = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)').run('admin@family.cal', hash, 'Admin', 'admin');
  adminId = r.lastInsertRowid;
} else {
  adminId = adminExists.id;
}

// Seed default family for existing data
const familyExists = db.prepare('SELECT id FROM families WHERE slug = ?').get('default');
let defaultFamilyId;
if (!familyExists) {
  const r = db.prepare('INSERT INTO families (name, slug, invite_code, created_by) VALUES (?, ?, ?, ?)').run('Perhe', 'default', generateInviteCode(), adminId);
  defaultFamilyId = r.lastInsertRowid;
  // Link admin to default family as owner
  db.prepare('INSERT OR IGNORE INTO family_users (user_id, family_id, role) VALUES (?, ?, ?)').run(adminId, defaultFamilyId, 'owner');
  // Migrate existing members & events to default family
  db.prepare('UPDATE members SET family_id = ? WHERE family_id IS NULL').run(defaultFamilyId);
  db.prepare('UPDATE events SET family_id = ? WHERE family_id IS NULL').run(defaultFamilyId);
} else {
  defaultFamilyId = familyExists.id;
}

// Seed members
const memberCount = db.prepare('SELECT COUNT(*) as c FROM members').get().c;
if (memberCount === 0) {
  const ins = db.prepare('INSERT INTO members (id, name, color, display_order, family_id) VALUES (?, ?, ?, ?, ?)');
  ins.run(1, 'Äiti', '#f472b6', 1, defaultFamilyId);
  ins.run(2, 'Aura', '#22d3ee', 2, defaultFamilyId);
  ins.run(3, 'Aino', '#fbbf24', 3, defaultFamilyId);
  ins.run(4, 'Isi', '#a78bfa', 4, defaultFamilyId);
}

const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
if (catCount === 0) {
  const ins = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
  ins.run('Harkat', '🏃');
  ins.run('Työ', '💼');
  ins.run('Koulu', '📚');
  ins.run('Sali', '💪');
  ins.run('Muu', '📌');
}

// ── Auth helpers ────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Not authenticated' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireFamily(req, res, next) {
  const familyId = parseInt(req.params.familyId || req.query.familyId);
  if (!familyId) return res.status(400).json({ error: 'family_id required' });
  // Admin can access any family
  if (req.user.role === 'admin') {
    req.familyId = familyId;
    return next();
  }
  const membership = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
  if (!membership) return res.status(403).json({ error: 'Not a member of this family' });
  req.familyRole = membership.role;
  req.familyId = familyId;
  next();
}

// ── Auth routes ─────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(email, hash, name);
  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(r.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken(user);
  const { password_hash, ...safe } = user;
  res.json({ token, user: safe });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const families = db.prepare(`
    SELECT f.*, fu.role as user_role FROM families f
    JOIN family_users fu ON f.id = fu.family_id
    WHERE fu.user_id = ?
  `).all(req.user.id);
  res.json({ ...user, families });
});

// ── Family routes ───────────────────────────────────────────────────────────

app.get('/api/families', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    res.json(db.prepare('SELECT * FROM families ORDER BY id').all());
  } else {
    res.json(db.prepare(`
      SELECT f.*, fu.role as user_role FROM families f
      JOIN family_users fu ON f.id = fu.family_id
      WHERE fu.user_id = ?
    `).all(req.user.id));
  }
});

app.post('/api/families', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const code = generateInviteCode();
  const r = db.prepare('INSERT INTO families (name, slug, invite_code, created_by) VALUES (?, ?, ?, ?)').run(name, slug + '-' + Date.now(), code, req.user.id);
  db.prepare('INSERT INTO family_users (user_id, family_id, role) VALUES (?, ?, ?)').run(req.user.id, r.lastInsertRowid, 'owner');
  res.status(201).json(db.prepare('SELECT * FROM families WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/families/:familyId', authMiddleware, requireFamily, (req, res) => {
  if (req.user.role !== 'admin' && req.familyRole !== 'owner') {
    return res.status(403).json({ error: 'Only owner can edit family' });
  }
  const { name } = req.body;
  if (name) db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name, req.familyId);
  res.json(db.prepare('SELECT * FROM families WHERE id = ?').get(req.familyId));
});

app.get('/api/families/:familyId', authMiddleware, requireFamily, (req, res) => {
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.familyId);
  if (!family) return res.status(404).json({ error: 'Not found' });
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, fu.role FROM users u
    JOIN family_users fu ON u.id = fu.user_id
    WHERE fu.family_id = ?
  `).all(req.familyId);
  res.json({ ...family, users });
});

app.post('/api/families/:familyId/invite', authMiddleware, requireFamily, (req, res) => {
  const family = db.prepare('SELECT invite_code FROM families WHERE id = ?').get(req.familyId);
  res.json({ invite_code: family.invite_code });
});

// ── Invite ──────────────────────────────────────────────────────────────────

app.get('/api/invite/:code', (req, res) => {
  const family = db.prepare('SELECT id, name, slug FROM families WHERE invite_code = ?').get(req.params.code);
  if (!family) return res.status(404).json({ error: 'Invalid invite code' });
  res.json(family);
});

app.post('/api/invite/:code', authMiddleware, (req, res) => {
  const family = db.prepare('SELECT id, name FROM families WHERE invite_code = ?').get(req.params.code);
  if (!family) return res.status(404).json({ error: 'Invalid invite code' });
  const existing = db.prepare('SELECT user_id FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, family.id);
  if (existing) return res.json({ message: 'Already a member', family_id: family.id });
  db.prepare('INSERT INTO family_users (user_id, family_id, role) VALUES (?, ?, ?)').run(req.user.id, family.id, 'member');
  res.json({ message: 'Joined family', family_id: family.id });
});

// ── Admin routes ────────────────────────────────────────────────────────────

app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY id').all());
});

app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM family_users WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/families/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM family_users WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM events WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM members WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM families WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Members (scoped by family) ──────────────────────────────────────────────

app.get('/api/members', authMiddleware, (req, res) => {
  const familyId = req.query.familyId;
  if (!familyId) return res.status(400).json({ error: 'familyId required' });
  // Check access
  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
    if (!m) return res.status(403).json({ error: 'No access' });
  }
  res.json(db.prepare('SELECT * FROM members WHERE family_id = ? ORDER BY display_order').all(familyId));
});

app.post('/api/members', authMiddleware, (req, res) => {
  const { name, color, family_id } = req.body;
  if (!name || !color || !family_id) return res.status(400).json({ error: 'name, color, family_id required' });
  // Check access
  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can add members' });
  }
  const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM members WHERE family_id = ?').get(family_id).m || 0;
  const r = db.prepare('INSERT INTO members (name, color, display_order, family_id) VALUES (?, ?, ?, ?)').run(name, color, maxOrder + 1, family_id);
  res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/members/reorder', authMiddleware, (req, res) => {
  const { family_id, order } = req.body; // order: [{id, display_order}]
  if (!family_id || !order) return res.status(400).json({ error: 'family_id and order required' });
  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can reorder members' });
  }
  const stmt = db.prepare('UPDATE members SET display_order = ? WHERE id = ? AND family_id = ?');
  const tx = db.transaction(() => {
    for (const item of order) {
      stmt.run(item.display_order, item.id, family_id);
    }
  });
  tx();
  res.json(db.prepare('SELECT * FROM members WHERE family_id = ? ORDER BY display_order').all(family_id));
});

app.put('/api/members/:id', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT family_id FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, member.family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can edit members' });
  }
  const { name, color } = req.body;
  if (name) db.prepare('UPDATE members SET name = ? WHERE id = ?').run(name, req.params.id);
  if (color) db.prepare('UPDATE members SET color = ? WHERE id = ?').run(color, req.params.id);
  res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id));
});

app.delete('/api/members/:id', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT family_id FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, member.family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can delete members' });
  }
  db.prepare('DELETE FROM events WHERE member_id = ?').run(req.params.id);
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Categories ──────────────────────────────────────────────────────────────

app.get('/api/categories', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY id').all());
});

// ── Events (scoped by family) ───────────────────────────────────────────────

app.get('/api/events', authMiddleware, (req, res) => {
  const { week, familyId } = req.query;
  if (!week) return res.status(400).json({ error: 'week parameter required' });
  if (!familyId) return res.status(400).json({ error: 'familyId required' });

  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

  const start = new Date(week);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const events = db.prepare(`
    SELECT e.*, m.name as member_name, m.color as member_color, c.name as category_name, c.icon as category_icon
    FROM events e
    JOIN members m ON e.member_id = m.id
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.family_id = ? AND (
      (e.is_recurring = 0 AND e.date BETWEEN ? AND ?)
      OR (e.is_recurring = 1)
    )
  `).all(familyId, startStr, endStr);

  res.json(events);
});

app.post('/api/events', authMiddleware, (req, res) => {
  const { member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring, ride_outbound, ride_return, family_id } = req.body;
  if (!family_id) return res.status(400).json({ error: 'family_id required' });

  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, family_id);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

  const result = db.prepare(`
    INSERT INTO events (member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring, ride_outbound, ride_return, family_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(member_id, category_id || null, title, start_time, end_time, date || null, weekday ?? null, location || null, description || null, is_recurring ? 1 : 0, ride_outbound || null, ride_return || null, family_id);

  const event = db.prepare(`
    SELECT e.*, m.name as member_name, m.color as member_color, c.name as category_name, c.icon as category_icon
    FROM events e JOIN members m ON e.member_id = m.id LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(event);
});

app.put('/api/events/:id', authMiddleware, (req, res) => {
  const { member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring, ride_outbound, ride_return } = req.body;
  const existing = db.prepare('SELECT family_id FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, existing.family_id);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

  db.prepare(`
    UPDATE events SET member_id=?, category_id=?, title=?, start_time=?, end_time=?, date=?, weekday=?, location=?, description=?, is_recurring=?, ride_outbound=?, ride_return=?, updated_at=datetime('now')
    WHERE id=?
  `).run(member_id, category_id || null, title, start_time, end_time, date || null, weekday ?? null, location || null, description || null, is_recurring ? 1 : 0, ride_outbound || null, ride_return || null, req.params.id);

  const event = db.prepare(`
    SELECT e.*, m.name as member_name, m.color as member_color, c.name as category_name, c.icon as category_icon
    FROM events e JOIN members m ON e.member_id = m.id LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);
  res.json(event);
});

app.patch('/api/events/:id', authMiddleware, (req, res) => {
  const { member_id, date, weekday } = req.body;
  const existing = db.prepare('SELECT family_id FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, existing.family_id);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

  const updates = [];
  const values = [];
  if (member_id !== undefined) { updates.push('member_id = ?'); values.push(member_id); }
  if (date !== undefined) { updates.push('date = ?'); values.push(date); }
  if (weekday !== undefined) { updates.push('weekday = ?'); values.push(weekday); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const event = db.prepare(`
    SELECT e.*, m.name as member_name, m.color as member_color, c.name as category_name, c.icon as category_icon
    FROM events e JOIN members m ON e.member_id = m.id LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);
  res.json(event);
});

app.delete('/api/events/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT family_id FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (req.user.role !== 'admin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, existing.family_id);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

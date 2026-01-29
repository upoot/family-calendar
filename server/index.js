import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── CORS — rajoita sallitut originit ────────────────────────────────────────
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// ── JWT-salaisuus — vaaditaan ympäristömuuttuja ─────────────────────────────
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is required in production');
    process.exit(1);
  }
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: JWT_SECRET not set — using random secret (tokens will invalidate on restart)');
}

// ── Rate limiting — estä brute-force-hyökkäykset ────────────────────────────
const authLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minuuttia
      max: 5, // max 5 yritystä per IP
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many attempts, please try again later' },
    });
const dbPath = process.env.DB_PATH || join(__dirname, 'calendar.db');
const db = new Database(dbPath);
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
    icon TEXT,
    family_id INTEGER REFERENCES families(id),
    display_order INTEGER DEFAULT 0
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
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
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

// Add family_id and display_order to categories
try { db.exec(`ALTER TABLE categories ADD COLUMN family_id INTEGER REFERENCES families(id)`); } catch {}
try { db.exec(`ALTER TABLE categories ADD COLUMN display_order INTEGER DEFAULT 0`); } catch {}

// Add user management columns
try { db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN created_by INTEGER REFERENCES users(id)`); } catch {}
try { db.exec(`ALTER TABLE members ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch {}

// Migrate old 'admin' role to 'superadmin'
try { db.exec(`UPDATE users SET role = 'superadmin' WHERE role = 'admin'`); } catch {}

// ── Seed ────────────────────────────────────────────────────────────────────

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex');
}

// ── Ensimmäinen käyttäjä saa admin-roolin automaattisesti ────────────────────
// Ei kovakoodattua admin-tiliä — ensimmäinen rekisteröityjä on admin

const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
if (catCount === 0) {
  const ins = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
  ins.run('Harkat', '🏃');
  ins.run('Työ', '💼');
  ins.run('Koulu', '📚');
  ins.run('Koe', '📝');
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
  if (req.user.role === 'superadmin') {
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

app.post('/api/auth/register', authLimiter, (req, res) => {
  // Tarkista Content-Type CSRF-suojauksena
  if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  // Salasanan vähimmäispituus
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  // Ensimmäinen käyttäjä saa admin-roolin
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const role = userCount === 0 ? 'superadmin' : 'user';
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)').run(email, hash, name, role);
  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(r.lastInsertRowid);
  if (role === 'superadmin') console.log(`✅ First user ${email} registered as superadmin`);
  const token = signToken(user);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  // Tarkista Content-Type CSRF-suojauksena
  if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken(user);
  const { password_hash, ...safe } = user;
  res.json({ token, user: safe });
});

// ── Change password ─────────────────────────────────────────────────────────

app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // If must_change_password, oldPassword is optional (temp password flow)
  if (!user.must_change_password) {
    if (!oldPassword || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, req.user.id);
  const token = signToken(user);
  res.json({ ok: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, must_change_password, created_at FROM users WHERE id = ?').get(req.user.id);
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
  if (req.user.role === 'superadmin') {
    const families = db.prepare('SELECT * FROM families ORDER BY id').all();
    // Attach owner info for each family
    const ownerStmt = db.prepare(`
      SELECT u.id, u.name, u.email FROM users u
      JOIN family_users fu ON u.id = fu.user_id
      WHERE fu.family_id = ? AND fu.role = 'owner'
      LIMIT 1
    `);
    for (const f of families) {
      const owner = ownerStmt.get(f.id);
      f.owner = owner || null;
    }
    res.json(families);
  } else {
    res.json(db.prepare(`
      SELECT f.*, fu.role as user_role FROM families f
      JOIN family_users fu ON f.id = fu.family_id
      WHERE fu.user_id = ?
    `).all(req.user.id));
  }
});

app.post('/api/families', authMiddleware, (req, res) => {
  const { name, admin_user_id, admin_user, members } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const code = generateInviteCode();

  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO families (name, slug, invite_code, created_by) VALUES (?, ?, ?, ?)').run(name, slug + '-' + Date.now(), code, req.user.id);
    const familyId = r.lastInsertRowid;

    let ownerId = req.user.id;

    // Assign admin: existing user or create new
    if (admin_user_id) {
      const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(admin_user_id);
      if (!existingUser) throw new Error('Admin user not found');
      ownerId = admin_user_id;
    } else if (admin_user && admin_user.email) {
      if (!admin_user.password || admin_user.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(admin_user.email);
      if (existing) throw new Error('Email already registered');
      const hash = bcrypt.hashSync(admin_user.password, 10);
      const u = db.prepare('INSERT INTO users (email, password_hash, name, role, must_change_password, created_by) VALUES (?, ?, ?, ?, 1, ?)').run(
        admin_user.email, hash, admin_user.name || admin_user.email, 'user', req.user.id
      );
      ownerId = u.lastInsertRowid;
    }

    db.prepare('INSERT INTO family_users (user_id, family_id, role) VALUES (?, ?, ?)').run(ownerId, familyId, 'owner');

    // If creator is different from owner, also add creator as member
    if (ownerId !== req.user.id) {
      try {
        db.prepare('INSERT INTO family_users (user_id, family_id, role) VALUES (?, ?, ?)').run(req.user.id, familyId, 'member');
      } catch (e) { /* already exists */ }
    }

    // Create initial members (swimlane members)
    if (members && Array.isArray(members)) {
      const memberStmt = db.prepare('INSERT INTO members (name, color, display_order, family_id) VALUES (?, ?, ?, ?)');
      members.forEach((m, i) => {
        if (m.name && m.color) {
          memberStmt.run(m.name, m.color, i + 1, familyId);
        }
      });
    }

    // Seed default categories for the new family
    const catSeed = db.prepare('INSERT INTO categories (name, icon, family_id, display_order) VALUES (?, ?, ?, ?)');
    const defaultCats = [['Harkat', '🏃', 1], ['Työ', '💼', 2], ['Koulu', '📚', 3], ['Koe', '📝', 4], ['Sali', '💪', 5], ['Muu', '📌', 6]];
    for (const [catName, catIcon, catOrder] of defaultCats) {
      catSeed.run(catName, catIcon, familyId, catOrder);
    }

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    // Attach owner info
    const owner = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(ownerId);
    family.owner = owner || null;
    return family;
  });

  try {
    const family = tx();
    res.status(201).json(family);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/families/:familyId', authMiddleware, requireFamily, (req, res) => {
  if (req.user.role !== 'superadmin' && req.familyRole !== 'owner') {
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

// ── Family user management ───────────────────────────────────────────────────

app.post('/api/families/:familyId/users', authMiddleware, requireFamily, (req, res) => {
  // Only family owner or superadmin can create users
  if (req.user.role !== 'superadmin' && req.familyRole !== 'owner') {
    return res.status(403).json({ error: 'Only family admin can create users' });
  }
  const { name, email, password, memberId } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (email, password_hash, name, role, must_change_password, created_by) VALUES (?, ?, ?, ?, 1, ?)').run(email, hash, name, 'user', req.user.id);
  const userId = r.lastInsertRowid;

  // Add to family
  db.prepare('INSERT INTO family_users (user_id, family_id, role) VALUES (?, ?, ?)').run(userId, req.familyId, 'member');

  // Link to member if specified
  if (memberId) {
    const member = db.prepare('SELECT id FROM members WHERE id = ? AND family_id = ?').get(memberId, req.familyId);
    if (member) {
      db.prepare('UPDATE members SET user_id = ? WHERE id = ?').run(userId, memberId);
    }
  }

  const user = db.prepare('SELECT id, email, name, role, must_change_password, created_at FROM users WHERE id = ?').get(userId);
  res.status(201).json(user);
});

app.get('/api/families/:familyId/users', authMiddleware, requireFamily, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, fu.role as family_role, u.must_change_password, u.created_at
    FROM users u
    JOIN family_users fu ON u.id = fu.user_id
    WHERE fu.family_id = ? AND u.role != 'superadmin'
    ORDER BY u.id
  `).all(req.familyId);
  
  // Also get members with their user_id links
  const members = db.prepare('SELECT id, name, color, user_id FROM members WHERE family_id = ?').all(req.familyId);
  
  res.json({ users, members });
});

// ── Admin routes ────────────────────────────────────────────────────────────

app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
  res.json(db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY id').all());
});

app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM family_users WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Superadmin management ───────────────────────────────────────────────────

app.get('/api/admin/superadmins', authMiddleware, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
  res.json(db.prepare("SELECT id, email, name, created_at FROM users WHERE role = 'superadmin' ORDER BY id").all());
});

app.post('/api/admin/superadmins', authMiddleware, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
  const { user_id, name, email, password } = req.body;

  if (user_id) {
    // Promote existing user
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'superadmin') return res.status(409).json({ error: 'Already a superadmin' });
    db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?").run(user_id);
    res.json(db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(user_id));
  } else if (email && password) {
    // Create new superadmin
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (email, password_hash, name, role, must_change_password, created_by) VALUES (?, ?, ?, ?, 1, ?)').run(
      email, hash, name || email, 'superadmin', req.user.id
    );
    res.status(201).json(db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(r.lastInsertRowid));
  } else {
    return res.status(400).json({ error: 'user_id or email+password required' });
  }
});

app.delete('/api/admin/superadmins/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot demote yourself' });
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'superadmin') return res.status(400).json({ error: 'User is not a superadmin' });
  db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(targetId);
  res.json({ ok: true });
});

app.delete('/api/admin/families/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM family_users WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE family_id = ?').run(req.params.id);
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
  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
    if (!m) return res.status(403).json({ error: 'No access' });
  }
  res.json(db.prepare('SELECT * FROM members WHERE family_id = ? ORDER BY display_order').all(familyId));
});

app.post('/api/members', authMiddleware, (req, res) => {
  const { name, color, family_id } = req.body;
  if (!name || !color || !family_id) return res.status(400).json({ error: 'name, color, family_id required' });
  // Check access
  if (req.user.role !== 'superadmin') {
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
  if (req.user.role !== 'superadmin') {
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
  if (req.user.role !== 'superadmin') {
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
  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, member.family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can delete members' });
  }
  db.prepare('DELETE FROM events WHERE member_id = ?').run(req.params.id);
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Categories (per-family) ──────────────────────────────────────────────────

app.get('/api/categories', authMiddleware, (req, res) => {
  const { familyId } = req.query;
  if (familyId) {
    // Check access
    if (req.user.role !== 'superadmin') {
      const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
      if (!m) return res.status(403).json({ error: 'No access' });
    }
    // If family has no own categories, migrate global defaults to family
    let familyCats = db.prepare('SELECT * FROM categories WHERE family_id = ? ORDER BY display_order, id').all(familyId);
    if (familyCats.length === 0) {
      const globals = db.prepare('SELECT name, icon FROM categories WHERE family_id IS NULL ORDER BY id').all();
      const seedCat = db.prepare('INSERT INTO categories (name, icon, family_id, display_order) VALUES (?, ?, ?, ?)');
      globals.forEach((g, i) => seedCat.run(g.name, g.icon, familyId, i + 1));
      familyCats = db.prepare('SELECT * FROM categories WHERE family_id = ? ORDER BY display_order, id').all(familyId);
    }
    return res.json(familyCats);
  }
  // No familyId — return all (backward compat)
  res.json(db.prepare('SELECT * FROM categories ORDER BY id').all());
});

app.post('/api/categories', authMiddleware, (req, res) => {
  const { name, icon, family_id } = req.body;
  if (!name || !family_id) return res.status(400).json({ error: 'name and family_id required' });
  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can manage categories' });
  }
  // If family has no categories yet, copy global defaults first
  const existingCats = db.prepare('SELECT COUNT(*) as c FROM categories WHERE family_id = ?').get(family_id).c;
  if (existingCats === 0) {
    const globals = db.prepare('SELECT name, icon FROM categories WHERE family_id IS NULL ORDER BY id').all();
    const seedCat = db.prepare('INSERT INTO categories (name, icon, family_id, display_order) VALUES (?, ?, ?, ?)');
    globals.forEach((g, i) => seedCat.run(g.name, g.icon, family_id, i + 1));
  }
  const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM categories WHERE family_id = ?').get(family_id).m || 0;
  const r = db.prepare('INSERT INTO categories (name, icon, family_id, display_order) VALUES (?, ?, ?, ?)').run(name, icon || '📌', family_id, maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/categories/:id', authMiddleware, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Not found' });
  if (!cat.family_id) return res.status(403).json({ error: 'Cannot edit global categories' });
  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, cat.family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can manage categories' });
  }
  const { name, icon } = req.body;
  if (name) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, req.params.id);
  if (icon) db.prepare('UPDATE categories SET icon = ? WHERE id = ?').run(icon, req.params.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Not found' });
  if (!cat.family_id) return res.status(403).json({ error: 'Cannot delete global categories' });
  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT role FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, cat.family_id);
    if (!m || m.role !== 'owner') return res.status(403).json({ error: 'Only owner can manage categories' });
  }
  // Check if any events use this category
  const eventCount = db.prepare('SELECT COUNT(*) as c FROM events WHERE category_id = ?').get(req.params.id).c;
  if (eventCount > 0) return res.status(409).json({ error: 'Category is in use by events', eventCount });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Events (scoped by family) ───────────────────────────────────────────────

app.get('/api/events', authMiddleware, (req, res) => {
  const { week, familyId } = req.query;
  if (!week) return res.status(400).json({ error: 'week parameter required' });
  if (!familyId) return res.status(400).json({ error: 'familyId required' });

  if (req.user.role !== 'superadmin') {
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

  if (req.user.role !== 'superadmin') {
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

  if (req.user.role !== 'superadmin') {
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

  if (req.user.role !== 'superadmin') {
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

  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, existing.family_id);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Copy week events ────────────────────────────────────────────────────────

app.post('/api/events/copy-week', authMiddleware, (req, res) => {
  const { familyId, sourceWeek, targetWeek } = req.body;
  if (!familyId || !sourceWeek || !targetWeek) {
    return res.status(400).json({ error: 'familyId, sourceWeek, targetWeek required' });
  }

  // Check family membership
  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
    if (!m) return res.status(403).json({ error: 'Not a member of this family' });
  }

  const sourceStart = new Date(sourceWeek);
  const sourceEnd = new Date(sourceStart);
  sourceEnd.setDate(sourceEnd.getDate() + 6);
  const sourceStartStr = sourceStart.toISOString().slice(0, 10);
  const sourceEndStr = sourceEnd.toISOString().slice(0, 10);

  // Get non-recurring events from source week
  const sourceEvents = db.prepare(`
    SELECT * FROM events
    WHERE family_id = ? AND is_recurring = 0 AND date BETWEEN ? AND ?
  `).all(familyId, sourceStartStr, sourceEndStr);

  let copied = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT INTO events (member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring, ride_outbound, ride_return, family_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);

  const checkDup = db.prepare(`
    SELECT 1 FROM events
    WHERE member_id = ? AND title = ? AND start_time = ? AND end_time = ? AND date = ? AND family_id = ?
  `);

  const tx = db.transaction(() => {
    for (const ev of sourceEvents) {
      // Calculate day offset from source monday
      const evDate = new Date(ev.date);
      const dayOffset = Math.round((evDate - sourceStart) / (1000 * 60 * 60 * 24));
      const targetDate = new Date(targetWeek);
      targetDate.setDate(targetDate.getDate() + dayOffset);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      // Check duplicate
      const dup = checkDup.get(ev.member_id, ev.title, ev.start_time, ev.end_time, targetDateStr, familyId);
      if (dup) {
        skipped++;
        continue;
      }

      insertStmt.run(
        ev.member_id, ev.category_id, ev.title, ev.start_time, ev.end_time,
        targetDateStr, ev.weekday, ev.location, ev.description,
        ev.ride_outbound, ev.ride_return, familyId
      );
      copied++;
    }
  });

  tx();
  res.json({ copied, skipped });
});

const PORT = process.env.PORT || 3001;

export { app, db };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

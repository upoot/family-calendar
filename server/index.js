import 'dotenv/config';
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
app.use(cors({ 
  origin: CORS_ORIGIN, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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

// ── Todos & Shopping ────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    assigned_to INTEGER REFERENCES members(id),
    week TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    name TEXT NOT NULL,
    category TEXT,
    checked INTEGER NOT NULL DEFAULT 0,
    added_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

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
  const { week, start, end, familyId } = req.query;
  if (!familyId) return res.status(400).json({ error: 'familyId required' });
  
  // Support both week (calendar) and start/end (timeline) queries
  let startStr, endStr;
  if (week) {
    const weekStart = new Date(week);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    startStr = weekStart.toISOString().slice(0, 10);
    endStr = weekEnd.toISOString().slice(0, 10);
  } else if (start && end) {
    startStr = start;
    endStr = end;
  } else {
    return res.status(400).json({ error: 'week or start+end parameters required' });
  }

  if (req.user.role !== 'superadmin') {
    const m = db.prepare('SELECT 1 FROM family_users WHERE user_id = ? AND family_id = ?').get(req.user.id, familyId);
    if (!m) return res.status(403).json({ error: 'No access' });
  }

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

// ── NL Parser ───────────────────────────────────────────────────────────────

const COMMANDS = {
  shop: ['kauppalist', 'ostoslist', 'kauppaan', 'ruokalist', 'buy', 'shop', 'grocery'],
  todo: ['todo', 'tehtävä', 'muista', 'muistutus', 'pitää', 'täytyy', 'task', 'hoida', 'tee ', 'tekis', 'tarvi'],
  cancel: ['peru', 'peruuta', 'cancel'],
  move: ['siirrä', 'vaihda', 'move', 'reschedule'],
  query: ['milloin', 'koska', 'onko', 'when', 'sopii', 'voisi', 'ehdi'],
  event: ['varaa', 'harkat', 'treeni', 'matsi', 'peli', 'koe', 'tentti', 'book'],
};

// Time-related words that hint at calendar events
const TIME_HINTS = /\b(klo|kello|\d{1,2}[:.]\d{2}|\d{1,2}\s*(am|pm)|maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai|monday|tuesday|wednesday|thursday|friday|saturday|sunday|huomenna|ylihuomenna|tomorrow|ensi\s+viiko)/i;

function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const matchesAny = (keywords) =>
    keywords.some(kw => words.some(w => w.startsWith(kw)) || lower.includes(kw));

  // Explicit prefix commands (highest priority)
  if (/^(kauppa|shop|osta)\s*:/i.test(text)) return 'add_shopping';
  if (/^(tehtävä|todo|task|muista)\s*:/i.test(text)) return 'add_todo';
  if (/^(varaa|event|tapahtuma)\s*:/i.test(text)) return 'create_event';

  // Keyword-based detection
  if (matchesAny(COMMANDS.shop)) return 'add_shopping';
  if (matchesAny(COMMANDS.cancel)) return 'cancel_event';
  if (matchesAny(COMMANDS.move)) return 'move_event';
  if (matchesAny(COMMANDS.query)) return 'query_availability';
  if (matchesAny(COMMANDS.event)) return 'create_event';

  // If it mentions a time/day, it's probably a calendar event
  if (TIME_HINTS.test(text)) return 'create_event';

  // Check todo keywords
  if (matchesAny(COMMANDS.todo)) return 'add_todo';

  // Default: if "lisää" + shopping context → shopping, otherwise todo
  if (lower.includes('lisää') || lower.includes('add')) {
    // Could be either — check for food/product words
    const foodWords = ['maito', 'leipä', 'juusto', 'kana', 'liha', 'banaani', 'omena', 'jogurtti', 'voi', 'kahvi', 'mehu', 'kala', 'peruna', 'tomaatti', 'kurkku', 'paprika', 'sipuli', 'kananmuna', 'riisi', 'pasta', 'jauheliha', 'kinkku', 'juoma', 'olut', 'vessapaperi', 'tiskiaine', 'pesuaine', 'shampoo', 'saippua', 'hammastahna'];
    if (foodWords.some(fw => lower.includes(fw))) return 'add_shopping';
  }

  // Fallback: treat as todo (most useful default for quick input)
  return 'add_todo';
}

function extractMember(text, members) {
  const lower = text.toLowerCase();
  // Check @mentions first
  const mentionMatch = text.match(/@(\w+)/);
  if (mentionMatch) {
    const name = mentionMatch[1].toLowerCase();
    const found = members.find(m => m.name.toLowerCase().startsWith(name));
    if (found) return found;
  }
  // Check full name mentions
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    if (lower.includes(m.name.toLowerCase())) return m;
  }
  return null;
}

function parseDateTime(text) {
  const lower = text.toLowerCase();
  const now = new Date();
  
  // Parse day
  let targetDate = new Date(now);
  const dayMap = {
    ma: 1, maanantai: 1, monday: 1,
    ti: 2, tiistai: 2, tuesday: 2,
    ke: 3, keskiviikko: 3, wednesday: 3,
    to: 4, torstai: 4, thursday: 4,
    pe: 5, perjantai: 5, friday: 5,
    la: 6, lauantai: 6, saturday: 6,
    su: 0, sunnuntai: 0, sunday: 0,
  };
  
  // Check for specific weekday
  for (const [key, targetDay] of Object.entries(dayMap)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(lower)) {
      const currentDay = now.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7; // Next occurrence
      targetDate.setDate(now.getDate() + diff);
      break;
    }
  }
  
  // Check for relative days
  if (/\b(huomenna|tomorrow)\b/i.test(lower)) {
    targetDate.setDate(now.getDate() + 1);
  } else if (/\b(ylihuomenna|overmorrow)\b/i.test(lower)) {
    targetDate.setDate(now.getDate() + 2);
  } else if (/\btänään|today\b/i.test(lower)) {
    targetDate = new Date(now);
  }
  
  const dateStr = targetDate.toISOString().split('T')[0];
  
  // Parse time
  let startTime = '09:00';
  let endTime = '10:00';
  
  // Match "klo 18" or "kello 18" or "18:00" or "18.00"
  const timeMatch = lower.match(/(?:klo|kello)?\s*(\d{1,2})[:.h]?(\d{2})?/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (hour >= 0 && hour <= 23) {
      startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      endTime = `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  
  return { date: dateStr, startTime, endTime };
}

app.post('/api/parse', authMiddleware, (req, res) => {
  const { text, familyId } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const fid = familyId || req.query.familyId;
  const members = fid
    ? db.prepare('SELECT * FROM members WHERE family_id = ?').all(fid)
    : [];

  const type = detectIntent(text);
  const member = extractMember(text, members);
  const dateTime = parseDateTime(text);

  // Strip explicit prefix (kauppa: xxx → xxx)
  let title = text.replace(/^(kauppa|shop|osta|tehtävä|todo|task|muista|varaa|event|tapahtuma)\s*:\s*/i, '');
  // Strip @mentions
  title = title.replace(/@\w+/g, '');
  if (member) title = title.replace(new RegExp(member.name, 'gi'), '');
  for (const keywords of Object.values(COMMANDS)) {
    for (const kw of keywords) {
      title = title.replace(new RegExp(`\\b${kw}\\S*`, 'gi'), '');
    }
  }
  // Strip day/time indicators
  title = title.replace(/\b(ma|ti|ke|to|pe|la|su|maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai|monday|tuesday|wednesday|thursday|friday|saturday|sunday|huomenna|ylihuomenna|tänään|tomorrow|today)\b/gi, '');
  title = title.replace(/(?:klo|kello)?\s*\d{1,2}[:.h]?\d{0,2}/gi, '');
  title = title.replace(/\s+/g, ' ').trim();

  res.json({ 
    type, 
    title, 
    memberId: member?.id, 
    memberName: member?.name, 
    date: dateTime.date,
    startTime: dateTime.startTime,
    endTime: dateTime.endTime,
    raw: text 
  });
});

// ── Todos ───────────────────────────────────────────────────────────────────

app.get('/api/families/:familyId/todos', authMiddleware, requireFamily, (req, res) => {
  const { week } = req.query;
  let items;
  if (week) {
    items = db.prepare('SELECT t.*, m.name as member_name, m.color as member_color FROM todos t LEFT JOIN members m ON t.assigned_to = m.id WHERE t.family_id = ? AND t.week = ? ORDER BY t.created_at').all(req.familyId, week);
  } else {
    items = db.prepare('SELECT t.*, m.name as member_name, m.color as member_color FROM todos t LEFT JOIN members m ON t.assigned_to = m.id WHERE t.family_id = ? ORDER BY t.created_at').all(req.familyId);
  }
  res.json(items);
});

app.post('/api/families/:familyId/todos', authMiddleware, requireFamily, (req, res) => {
  const { title, assignedTo, dueDate, week } = req.body;
  if (!title || !week) return res.status(400).json({ error: 'title and week required' });

  const result = db.prepare(
    'INSERT INTO todos (family_id, title, assigned_to, due_date, week, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.familyId, title, assignedTo || null, dueDate || null, week, req.user.id);

  const item = db.prepare('SELECT t.*, m.name as member_name, m.color as member_color FROM todos t LEFT JOIN members m ON t.assigned_to = m.id WHERE t.id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.patch('/api/families/:familyId/todos/:id', authMiddleware, requireFamily, (req, res) => {
  const { id } = req.params;
  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND family_id = ?').get(id, req.familyId);
  if (!todo) return res.status(404).json({ error: 'Not found' });

  const { title, done, assignedTo, dueDate } = req.body;
  if (title !== undefined) db.prepare('UPDATE todos SET title = ? WHERE id = ?').run(title, id);
  if (done !== undefined) db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(done ? 1 : 0, id);
  if (assignedTo !== undefined) db.prepare('UPDATE todos SET assigned_to = ? WHERE id = ?').run(assignedTo, id);
  if (dueDate !== undefined) db.prepare('UPDATE todos SET due_date = ? WHERE id = ?').run(dueDate, id);

  const updated = db.prepare('SELECT t.*, m.name as member_name, m.color as member_color FROM todos t LEFT JOIN members m ON t.assigned_to = m.id WHERE t.id = ?').get(id);
  res.json(updated);
});

app.delete('/api/families/:familyId/todos/:id', authMiddleware, requireFamily, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM todos WHERE id = ? AND family_id = ?').run(id, req.familyId);
  res.status(204).end();
});

// ── Shopping ────────────────────────────────────────────────────────────────

app.get('/api/families/:familyId/shopping', authMiddleware, requireFamily, (req, res) => {
  const items = db.prepare(
    'SELECT s.*, u.name as added_by_name FROM shopping_items s LEFT JOIN users u ON s.added_by = u.id WHERE s.family_id = ? ORDER BY s.checked, s.category, s.created_at'
  ).all(req.familyId);
  res.json(items);
});

app.post('/api/families/:familyId/shopping', authMiddleware, requireFamily, (req, res) => {
  const { name, category } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = db.prepare(
    'INSERT INTO shopping_items (family_id, name, category, added_by) VALUES (?, ?, ?, ?)'
  ).run(req.familyId, name, category || null, req.user.id);

  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.patch('/api/families/:familyId/shopping/:id', authMiddleware, requireFamily, (req, res) => {
  const { id } = req.params;
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND family_id = ?').get(id, req.familyId);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const { name, checked, category } = req.body;
  if (name !== undefined) db.prepare('UPDATE shopping_items SET name = ? WHERE id = ?').run(name, id);
  if (checked !== undefined) db.prepare('UPDATE shopping_items SET checked = ? WHERE id = ?').run(checked ? 1 : 0, id);
  if (category !== undefined) db.prepare('UPDATE shopping_items SET category = ? WHERE id = ?').run(category, id);

  const updated = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/families/:familyId/shopping/:id', authMiddleware, requireFamily, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM shopping_items WHERE id = ? AND family_id = ?').run(id, req.familyId);
  res.status(204).end();
});

app.delete('/api/families/:familyId/shopping', authMiddleware, requireFamily, (req, res) => {
  // Clear checked items
  db.prepare('DELETE FROM shopping_items WHERE family_id = ? AND checked = 1').run(req.familyId);
  res.status(204).end();
});

// ── Integrations ────────────────────────────────────────────────────────────

// Rate limiting: max 1 sync per 15 minutes per family per integration
function checkSyncRateLimit(familyId, integrationType) {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const recent = db.prepare(
    'SELECT COUNT(*) as count FROM integration_syncs WHERE family_id = ? AND integration_type = ? AND synced_at > ?'
  ).get(familyId, integrationType, fifteenMinutesAgo);
  
  return recent.count === 0;
}

function logSync(familyId, integrationType, eventCount, status, errorMessage = null) {
  db.prepare(
    'INSERT INTO integration_syncs (family_id, integration_type, event_count, status, error_message) VALUES (?, ?, ?, ?, ?)'
  ).run(familyId, integrationType, eventCount, status, errorMessage);
}

// GET integration settings (all members)
app.get('/api/families/:familyId/integrations/:type', authMiddleware, requireFamily, (req, res) => {
  const { type } = req.params;
  
  // Get all integrations for this family + type
  const integrations = db.prepare(`
    SELECT 
      integration_settings.id,
      integration_settings.member_id,
      integration_settings.integration_type,
      integration_settings.config,
      integration_settings.last_sync,
      members.name as member_name,
      members.color as member_color
    FROM integration_settings
    LEFT JOIN members ON integration_settings.member_id = members.id
    WHERE integration_settings.family_id = ? AND integration_settings.integration_type = ?
  `).all(req.familyId, type);
  
  // Get last sync status for each
  const withStatus = integrations.map(int => {
    const lastSync = db.prepare(
      'SELECT event_count, status, error_message, synced_at FROM integration_syncs WHERE family_id = ? AND integration_type = ? ORDER BY synced_at DESC LIMIT 1'
    ).get(req.familyId, type);
    
    return {
      ...int,
      config: int.config ? JSON.parse(int.config) : null,
      last_sync_status: lastSync
    };
  });
  
  res.json(withStatus);
});

// Save integration settings (per member)
app.post('/api/families/:familyId/integrations/:type', authMiddleware, requireFamily, (req, res) => {
  const { type } = req.params;
  const { member_id, config } = req.body;
  
  if (!member_id || !config) {
    return res.status(400).json({ error: 'member_id and config required' });
  }
  
  // Verify member belongs to family
  const member = db.prepare('SELECT id FROM members WHERE id = ? AND family_id = ?').get(member_id, req.familyId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }
  
  // Check if exists
  const existing = db.prepare(
    'SELECT id FROM integration_settings WHERE family_id = ? AND integration_type = ? AND member_id = ?'
  ).get(req.familyId, type, member_id);
  
  if (existing) {
    db.prepare(
      'UPDATE integration_settings SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(JSON.stringify(config), existing.id);
  } else {
    db.prepare(
      'INSERT INTO integration_settings (family_id, integration_type, member_id, config) VALUES (?, ?, ?, ?)'
    ).run(req.familyId, type, member_id, JSON.stringify(config));
  }
  
  res.json({ success: true });
});

// Delete integration
app.delete('/api/families/:familyId/integrations/:type/:memberId', authMiddleware, requireFamily, (req, res) => {
  const { type, memberId } = req.params;
  
  db.prepare(
    'DELETE FROM integration_settings WHERE family_id = ? AND integration_type = ? AND member_id = ?'
  ).run(req.familyId, type, parseInt(memberId));
  
  res.json({ success: true });
});

// Sync School exams

app.post('/api/families/:familyId/integrations/school/sync-poll', authMiddleware, requireFamily, async (req, res) => {
  const { memberId, url, username, password, simulate } = req.body;
  
  if (!memberId || !url || !username || !password) {
    return res.status(400).json({ error: 'memberId, url, username, password required' });
  }
  
  // Verify member
  const member = db.prepare('SELECT id, name FROM members WHERE id = ? AND family_id = ?').get(parseInt(memberId), req.familyId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }
  
  // Rate limit check
  if (!checkSyncRateLimit(req.familyId, 'school')) {
    return res.status(429).json({ error: 'Rate limit: max 1 sync per 15 minutes' });
  }
  // Collect logs from scraper (outside try so catch can access it)
  const collectedLogs = [];
  const onProgress = (step, status, message) => {
    const logEntry = {
      step,
      status,
      message,
      timestamp: new Date().toISOString()
    };
    collectedLogs.push(logEntry);
    console.log(`[Scraper Progress] [${step}] ${status}: ${message}`);
  };
  
  try {
    // Use mock scraper if simulation mode is enabled
    let scrapeSchoolExams;
    let actualUrl = url;
    let actualUsername = username;
    let actualPassword = password;
    
    if (simulate) {
      console.log('[School Sync] 🎭 SIMULATION MODE enabled - using mock scraper');
      const mock = await import('./integrations/school-scraper-mock.js');
      scrapeSchoolExams = mock.scrapeSchoolExamsMock;
      
      // Override with localhost mock service
      actualUrl = 'http://localhost:3002/exams/calendar';
      actualUsername = 'test.user';
      actualPassword = 'password123';
      
      console.log('[School Sync] Using mock URL:', actualUrl);
    } else {
      console.log('[School Sync] Running real scraper');
      const real = await import('./integrations/school-scraper.js');
      scrapeSchoolExams = real.scrapeSchoolExams;
    }
    
    const targetUrl = actualUrl;
    
    console.log('[School Sync] Target URL:', targetUrl);
    
    // Run scraper (blocking - returns when done)
    const { exams, cookies } = await scrapeSchoolExams(
      { username: actualUsername, password: actualPassword },
      { targetUrl, sessionCookies: null, onProgress }
    );
    
    // Get or create exam category
    let examCategory = db.prepare('SELECT id FROM categories WHERE name = ? AND family_id IS NULL').get('Koe');
    if (!examCategory) {
      const result = db.prepare('INSERT INTO categories (name, icon, family_id, display_order) VALUES (?, ?, NULL, 100)').run('Koe', '📝');
      examCategory = { id: result.lastInsertRowid };
    }
    
    // Save exams
    let addedCount = 0;
    for (const exam of exams) {
      // Check across ALL members in family (same exam can't exist twice)
      const existing = db.prepare('SELECT id FROM events WHERE family_id = ? AND title = ? AND date = ?').get(req.familyId, exam.title, exam.date);
      if (!existing) {
        db.prepare('INSERT INTO events (family_id, member_id, category_id, title, date, start_time, end_time, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?, 0)').run(req.familyId, member.id, examCategory.id, exam.title, exam.date, exam.time, exam.time);
        addedCount++;
      }
    }
    
    logSync(req.familyId, 'school', addedCount, 'success');
    
    res.json({ 
      success: true, 
      exams, 
      added: addedCount,
      total: exams.length,
      logs: collectedLogs
    });
  } catch (error) {
    console.error('[School sync error]', error);
    
    // Add error to collected logs
    collectedLogs.push({
      step: 'error',
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
    
    // Add stack trace as separate log entry for debugging
    if (error.stack) {
      collectedLogs.push({
        step: 'debug',
        status: 'error',
        message: `Stack trace:\n${error.stack}`,
        timestamp: new Date().toISOString()
      });
    }
    
    logSync(req.familyId, 'school', 0, 'error', error.message);
    res.status(500).json({ 
      error: error.message,
      logs: collectedLogs
    });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

export { app, db };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(join(__dirname, 'calendar.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed members
const memberCount = db.prepare('SELECT COUNT(*) as c FROM members').get().c;
if (memberCount === 0) {
  const ins = db.prepare('INSERT INTO members (id, name, color, display_order) VALUES (?, ?, ?, ?)');
  ins.run(1, 'Äiti', '#f472b6', 1);
  ins.run(2, 'Aura', '#22d3ee', 2);
  ins.run(3, 'Aino', '#fbbf24', 3);
  ins.run(4, 'Isi', '#a78bfa', 4);
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

// Routes
app.get('/api/members', (req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY display_order').all());
});

app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY id').all());
});

app.get('/api/events', (req, res) => {
  const { week } = req.query; // YYYY-MM-DD (Monday of the week)
  if (!week) return res.status(400).json({ error: 'week parameter required' });

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
    WHERE (e.is_recurring = 0 AND e.date BETWEEN ? AND ?)
       OR (e.is_recurring = 1)
  `).all(startStr, endStr);

  res.json(events);
});

app.post('/api/events', (req, res) => {
  const { member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring } = req.body;
  const result = db.prepare(`
    INSERT INTO events (member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(member_id, category_id || null, title, start_time, end_time, date || null, weekday ?? null, location || null, description || null, is_recurring ? 1 : 0);
  
  const event = db.prepare(`
    SELECT e.*, m.name as member_name, m.color as member_color, c.name as category_name, c.icon as category_icon
    FROM events e JOIN members m ON e.member_id = m.id LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(event);
});

app.put('/api/events/:id', (req, res) => {
  const { member_id, category_id, title, start_time, end_time, date, weekday, location, description, is_recurring } = req.body;
  db.prepare(`
    UPDATE events SET member_id=?, category_id=?, title=?, start_time=?, end_time=?, date=?, weekday=?, location=?, description=?, is_recurring=?, updated_at=datetime('now')
    WHERE id=?
  `).run(member_id, category_id || null, title, start_time, end_time, date || null, weekday ?? null, location || null, description || null, is_recurring ? 1 : 0, req.params.id);
  
  const event = db.prepare(`
    SELECT e.*, m.name as member_name, m.color as member_color, c.name as category_name, c.icon as category_icon
    FROM events e JOIN members m ON e.member_id = m.id LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);
  res.json(event);
});

// PATCH - partial update (for drag & drop)
app.patch('/api/events/:id', (req, res) => {
  const { member_id, date, weekday } = req.body;
  const updates = [];
  const values = [];
  
  if (member_id !== undefined) {
    updates.push('member_id = ?');
    values.push(member_id);
  }
  if (date !== undefined) {
    updates.push('date = ?');
    values.push(date);
  }
  if (weekday !== undefined) {
    updates.push('weekday = ?');
    values.push(weekday);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
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

app.delete('/api/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

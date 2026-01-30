import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'calendar.db'));

const migration = readFileSync(join(__dirname, 'migrations/007_integrations.sql'), 'utf-8');

try {
  db.exec(migration);
  console.log('✅ Migration 007_integrations.sql applied');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
}

db.close();

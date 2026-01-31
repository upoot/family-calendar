import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'calendar.db'));

const migrationFile = process.argv[2] || '007_integrations.sql';
const migration = readFileSync(join(__dirname, 'migrations', migrationFile), 'utf-8');

try {
  db.exec(migration);
  console.log(`✅ Migration ${migrationFile} applied`);
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
}

db.close();

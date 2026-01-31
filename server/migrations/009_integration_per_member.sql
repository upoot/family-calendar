-- Recreate integration_settings with member_id support
-- SQLite doesn't support DROP CONSTRAINT, so we recreate the table

CREATE TABLE integration_settings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  integration_type TEXT NOT NULL,
  member_id INTEGER,
  config JSON NOT NULL,
  session_data JSON,
  last_sync DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(family_id, integration_type, member_id)
);

-- Copy existing data (set member_id to NULL for old entries)
INSERT INTO integration_settings_new (id, family_id, integration_type, member_id, config, session_data, last_sync, created_at, updated_at)
SELECT id, family_id, integration_type, NULL, config, session_data, last_sync, created_at, updated_at
FROM integration_settings;

-- Drop old table
DROP TABLE integration_settings;

-- Rename new table
ALTER TABLE integration_settings_new RENAME TO integration_settings;

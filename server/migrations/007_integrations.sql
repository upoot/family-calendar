-- Integration settings and session storage
CREATE TABLE IF NOT EXISTS integration_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  integration_type TEXT NOT NULL, -- 'school', 's-kauppa', etc.
  config JSON NOT NULL, -- { baseUrl, username, etc. }
  session_data JSON, -- Stored cookies/tokens
  last_sync DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  UNIQUE(family_id, integration_type)
);

-- Rate limiting for integrations
CREATE TABLE IF NOT EXISTS integration_syncs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  integration_type TEXT NOT NULL,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success', -- 'success', 'error', 'rate_limited'
  error_message TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_syncs_family ON integration_syncs(family_id, integration_type, synced_at);

-- Add global "Koe" / "Exam" category if not exists
INSERT OR IGNORE INTO categories (id, name, icon, family_id, display_order)
VALUES (100, 'Koe', '📝', NULL, 100);

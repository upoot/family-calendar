-- Integration execution logs (step-by-step tracking)
CREATE TABLE IF NOT EXISTS integration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  integration_type TEXT NOT NULL,
  sync_id TEXT NOT NULL, -- UUID for this sync session
  step TEXT NOT NULL, -- 'auth', 'member_selection', 'navigate', 'find_future_exams', 'find_past_exams'
  status TEXT NOT NULL, -- 'started', 'success', 'error'
  message TEXT, -- Human-readable description
  error_detail TEXT, -- Stack trace or detailed error
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_sync ON integration_logs(sync_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_integration_logs_family ON integration_logs(family_id, timestamp DESC);

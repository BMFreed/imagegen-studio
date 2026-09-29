-- A confirmed graceful close durably hides each old staging session before its
-- assets are removed. The tombstone survives an interrupted cleanup or a late
-- manifest-first completion, while a reopened Project may use a new session id.
CREATE TABLE generation_staging_discarded_session (
  local_project_key TEXT NOT NULL,
  staging_session_id TEXT NOT NULL,
  discarded_at TEXT NOT NULL,
  PRIMARY KEY (local_project_key, staging_session_id)
) STRICT;

-- A receipt is reserved before publishing a candidate file. Its monotonically
-- increasing order makes a manifest-first crash replay safe for the seed cursor.
-- The receipt is intentionally independent of prunable queue history.
CREATE TABLE generation_candidate_receipt (
  completion_order INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL UNIQUE,
  queue_item_id TEXT NOT NULL UNIQUE,
  expected_status_sequence INTEGER NOT NULL CHECK (expected_status_sequence >= 0),
  local_project_key TEXT NOT NULL,
  canonical_project_path TEXT NOT NULL,
  staging_session_id TEXT NOT NULL,
  frozen_payload_sha256 TEXT NOT NULL,
  image_sha256 TEXT NOT NULL,
  image_byte_size INTEGER NOT NULL CHECK (image_byte_size > 0),
  actual_seed INTEGER NOT NULL CHECK (actual_seed BETWEEN 0 AND 4294967295),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed')),
  reserved_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE INDEX idx_generation_receipt_project
  ON generation_candidate_receipt(local_project_key, completion_order);

-- This operational cursor outlives both queue rows and candidate cleanup. The
-- portable .igs keeps a snapshot only when the user explicitly saves it.
CREATE TABLE generation_seed_cursor (
  local_project_key TEXT PRIMARY KEY,
  completion_order INTEGER NOT NULL CHECK (completion_order > 0),
  candidate_id TEXT NOT NULL,
  actual_seed INTEGER NOT NULL CHECK (actual_seed BETWEEN 0 AND 4294967295),
  updated_at TEXT NOT NULL
) STRICT;

-- Authoritative local Project lifecycle, independent of the rebuildable Home index.
-- A positive deleting row is the durable delete journal; absence never licenses purge.
CREATE TABLE project_file_lifecycle (
  local_project_key TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  workspace_directory_path TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  project_json TEXT NOT NULL CHECK (json_valid(project_json)),
  trash_id TEXT NOT NULL UNIQUE CHECK (length(trash_id) = 36),
  trashed_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('trashed', 'deleting')),
  delete_operation_id TEXT,
  delete_committed_at TEXT,
  deletion_error TEXT,
  parent_witness_json TEXT NOT NULL CHECK (json_valid(parent_witness_json)),
  file_witness_json TEXT NOT NULL CHECK (json_valid(file_witness_json)),
  file_missing INTEGER NOT NULL CHECK (file_missing IN (0, 1)),
  updated_at TEXT NOT NULL,
  CHECK ((state = 'trashed' AND delete_operation_id IS NULL AND delete_committed_at IS NULL)
      OR (state = 'deleting' AND length(delete_operation_id) = 36 AND delete_committed_at IS NOT NULL))
) STRICT;

CREATE INDEX idx_project_file_lifecycle_trash ON project_file_lifecycle(trashed_at DESC, local_project_key);

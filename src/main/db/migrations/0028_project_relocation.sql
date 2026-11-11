-- Stable local ownership follows an app-managed relocation without rewriting frozen inputs.
CREATE TABLE project_identity_binding (
  local_project_key TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  document_id TEXT NOT NULL
) STRICT;

-- A permanently deleted local identity is never granted again by legacy path hashing.
CREATE TABLE project_identity_retired_key (
  local_project_key TEXT PRIMARY KEY
) STRICT;

-- Positive durable move intent, independent of the rebuildable Home index/workspace FKs.
CREATE TABLE project_relocation (
  local_project_key TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  document_id TEXT NOT NULL,
  source_path TEXT NOT NULL UNIQUE,
  destination_path TEXT NOT NULL UNIQUE,
  source_workspace_id TEXT NOT NULL,
  target_workspace_id TEXT NOT NULL,
  source_parent_witness_json TEXT NOT NULL CHECK (json_valid(source_parent_witness_json)),
  target_parent_witness_json TEXT NOT NULL CHECK (json_valid(target_parent_witness_json)),
  source_witness_json TEXT NOT NULL CHECK (json_valid(source_witness_json)),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  project_json TEXT NOT NULL CHECK (json_valid(project_json)),
  state TEXT NOT NULL CHECK (state IN ('planned', 'moving', 'moved')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source_path <> destination_path)
) STRICT;

-- Adapt revision-checked Project name/document updates through the existing journal.
-- Rebuild solely to permit metadata Rename when the desired filename already exists
-- as this exact source path; Move still requires two distinct paths.
CREATE TABLE project_relocation_rename (
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
  operation_kind TEXT NOT NULL DEFAULT 'move' CHECK (operation_kind IN ('move', 'rename')),
  rename_json TEXT CHECK (rename_json IS NULL OR json_valid(rename_json)),
  target_witness_json TEXT CHECK (target_witness_json IS NULL OR json_valid(target_witness_json)),
  target_sha256 TEXT CHECK (target_sha256 IS NULL OR length(target_sha256) = 64),
  CHECK (operation_kind = 'rename' OR source_path <> destination_path),
  CHECK ((operation_kind = 'move' AND rename_json IS NULL) OR
         (operation_kind = 'rename' AND rename_json IS NOT NULL)),
  CHECK ((target_witness_json IS NULL) = (target_sha256 IS NULL))
) STRICT;

INSERT INTO project_relocation_rename (
  local_project_key, operation_id, document_id, source_path, destination_path,
  source_workspace_id, target_workspace_id, source_parent_witness_json,
  target_parent_witness_json, source_witness_json, source_sha256, project_json,
  state, error_message, created_at, updated_at
)
SELECT local_project_key, operation_id, document_id, source_path, destination_path,
       source_workspace_id, target_workspace_id, source_parent_witness_json,
       target_parent_witness_json, source_witness_json, source_sha256, project_json,
       state, error_message, created_at, updated_at
FROM project_relocation;

DROP TABLE project_relocation;
ALTER TABLE project_relocation_rename RENAME TO project_relocation;

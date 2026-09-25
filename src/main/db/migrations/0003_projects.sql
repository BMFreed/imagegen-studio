-- Home rows are a rebuildable index. The user-owned .igs remains the source of
-- truth for Project content, layers and embedded previews.
CREATE TABLE project_workspace (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  directory_path TEXT NOT NULL UNIQUE CHECK (length(directory_path) > 0),
  color TEXT NOT NULL CHECK (length(color) > 0),
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE project_index (
  local_project_key TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE CHECK (length(canonical_path) > 0),
  workspace_id TEXT NOT NULL REFERENCES project_workspace(id) ON DELETE RESTRICT,
  document_id TEXT,
  document_revision TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  search_name TEXT NOT NULL CHECK (length(search_name) > 0),
  bbox_width INTEGER CHECK (bbox_width IS NULL OR bbox_width > 0),
  bbox_height INTEGER CHECK (bbox_height IS NULL OR bbox_height > 0),
  preview_status TEXT CHECK (preview_status IN ('empty', 'rendered', 'unavailable')),
  file_health TEXT NOT NULL CHECK (file_health IN ('ready', 'missing', 'corrupt', 'unsupported_schema')),
  diagnostic_code TEXT,
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  file_mtime_ns TEXT,
  last_opened_at TEXT,
  trashed_at TEXT,
  indexed_at TEXT NOT NULL,
  CHECK (
    file_health != 'ready' OR
    (document_id IS NOT NULL AND document_revision IS NOT NULL AND
     bbox_width IS NOT NULL AND bbox_height IS NOT NULL AND
     preview_status IS NOT NULL AND file_size_bytes IS NOT NULL AND
     file_mtime_ns IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_project_index_workspace ON project_index(workspace_id, trashed_at, display_name);
CREATE INDEX idx_project_index_search ON project_index(search_name);
CREATE INDEX idx_project_index_recent ON project_index(last_opened_at DESC);

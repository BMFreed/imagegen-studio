-- Source metadata is descriptive. Only a verified local_model_file makes a
-- version installed; install jobs never create selectable catalog entries.
CREATE TABLE model_resource (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('civitai', 'supported_dependency')),
  source_key TEXT NOT NULL UNIQUE,
  civitai_model_id INTEGER UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('checkpoint', 'embedding', 'lora', 'qwen3_encoder', 'upscaler', 'vae')),
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  creator TEXT,
  description TEXT,
  preview_url TEXT,
  source_metadata_json TEXT NOT NULL CHECK (json_valid(source_metadata_json)),
  source_checked_at TEXT,
  default_version_id TEXT REFERENCES model_resource_version(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (source_kind = 'civitai' AND civitai_model_id IS NOT NULL) OR
    (source_kind = 'supported_dependency' AND civitai_model_id IS NULL)
  )
) STRICT;

CREATE TABLE model_resource_version (
  id TEXT PRIMARY KEY,
  model_resource_id TEXT NOT NULL REFERENCES model_resource(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL CHECK (length(version_name) > 0),
  civitai_model_version_id INTEGER,
  civitai_file_id INTEGER,
  source_revision TEXT,
  base_model_family TEXT CHECK (base_model_family IN ('illustrious', 'anima')),
  format TEXT NOT NULL CHECK (length(format) > 0),
  prediction_type TEXT CHECK (prediction_type IN ('epsilon', 'v_prediction', 'sample')),
  expected_sha256 TEXT CHECK (expected_sha256 IS NULL OR length(expected_sha256) = 64),
  source_metadata_json TEXT NOT NULL CHECK (json_valid(source_metadata_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((civitai_model_version_id IS NULL) = (civitai_file_id IS NULL)),
  UNIQUE (model_resource_id, civitai_model_version_id, civitai_file_id),
  UNIQUE (model_resource_id, source_revision, expected_sha256)
) STRICT;

CREATE TABLE local_model_file (
  id TEXT PRIMARY KEY,
  resource_version_id TEXT NOT NULL UNIQUE REFERENCES model_resource_version(id) ON DELETE CASCADE,
  -- Multiple exact source versions may share one content-addressed file.
  -- The repository checks that every row at this path has the same hash/size.
  managed_path TEXT NOT NULL,
  original_filename TEXT NOT NULL CHECK (length(original_filename) > 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('ready', 'missing', 'corrupt')),
  verified_at TEXT NOT NULL
) STRICT;

-- A referenced companion cannot be removed while an Anima checkpoint needs it.
CREATE TABLE model_version_dependency (
  checkpoint_version_id TEXT NOT NULL REFERENCES model_resource_version(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('qwen3_encoder', 'vae')),
  component_version_id TEXT NOT NULL REFERENCES model_resource_version(id) ON DELETE RESTRICT,
  PRIMARY KEY (checkpoint_version_id, role),
  CHECK (checkpoint_version_id != component_version_id)
) STRICT;

-- Persist source identities and a sanitized preview, never bearer tokens or
-- token-bearing download URLs. The install service resolves URLs in main.
CREATE TABLE model_install_job (
  id TEXT PRIMARY KEY,
  civitai_model_id INTEGER NOT NULL,
  civitai_model_version_id INTEGER NOT NULL,
  civitai_file_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'downloading', 'verifying', 'completed', 'failed', 'canceled')),
  bytes_downloaded INTEGER NOT NULL DEFAULT 0 CHECK (bytes_downloaded >= 0),
  total_bytes INTEGER CHECK (total_bytes IS NULL OR total_bytes >= 0),
  error_code TEXT,
  error_message TEXT,
  preview_payload_json TEXT NOT NULL CHECK (json_valid(preview_payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE model_install_artifact (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES model_install_job(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('primary', 'qwen3_encoder', 'vae')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('civitai_file', 'supported_dependency')),
  source_identity TEXT NOT NULL,
  expected_size_bytes INTEGER CHECK (expected_size_bytes IS NULL OR expected_size_bytes > 0),
  expected_sha256 TEXT CHECK (expected_sha256 IS NULL OR length(expected_sha256) = 64),
  downloaded_bytes INTEGER NOT NULL DEFAULT 0 CHECK (downloaded_bytes >= 0),
  status TEXT NOT NULL CHECK (status IN ('waiting', 'downloading', 'verifying', 'ready', 'failed', 'canceled')),
  temp_path TEXT,
  error_code TEXT,
  error_message TEXT,
  UNIQUE (job_id, role)
) STRICT;

CREATE INDEX idx_model_resource_version_resource ON model_resource_version(model_resource_id);
CREATE INDEX idx_model_file_sha256 ON local_model_file(sha256);
CREATE INDEX idx_model_file_managed_path ON local_model_file(managed_path);
CREATE INDEX idx_model_dependency_component ON model_version_dependency(component_version_id);
CREATE INDEX idx_model_install_job_status ON model_install_job(status, created_at);

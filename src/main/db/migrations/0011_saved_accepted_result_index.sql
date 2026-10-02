-- Rebuildable metadata of generated Raster Layers in verified saved .igs files.
-- The path and owning layer are the identity: portable copies may share document
-- and candidate IDs. No pixels, signed URLs or duplicate provenance live here.
CREATE TABLE project_accepted_result_index (
  local_project_key TEXT NOT NULL REFERENCES project_index(local_project_key) ON DELETE CASCADE,
  layer_id TEXT NOT NULL CHECK (length(layer_id) = 36),
  document_id TEXT NOT NULL CHECK (length(document_id) = 36),
  document_revision TEXT NOT NULL CHECK (length(document_revision) = 36),
  accepted_at TEXT NOT NULL CHECK (length(accepted_at) = 24),
  actual_seed INTEGER NOT NULL CHECK (actual_seed BETWEEN 0 AND 4294967295),
  output_width INTEGER NOT NULL CHECK (output_width BETWEEN 8 AND 2048),
  output_height INTEGER NOT NULL CHECK (output_height BETWEEN 8 AND 2048),
  model_file_sha256 TEXT NOT NULL CHECK
    (length(model_file_sha256) = 64 AND model_file_sha256 NOT GLOB '*[^0-9a-f]*'),
  model_name TEXT NOT NULL CHECK (length(model_name) > 0),
  model_version_name TEXT NOT NULL CHECK (length(model_version_name) > 0),
  layer_name TEXT NOT NULL CHECK (length(layer_name) > 0),
  asset_path TEXT NOT NULL CHECK (length(asset_path) > 0),
  asset_sha256 TEXT NOT NULL CHECK
    (length(asset_sha256) = 64 AND asset_sha256 NOT GLOB '*[^0-9a-f]*'),
  asset_bytes INTEGER NOT NULL CHECK (asset_bytes BETWEEN 1 AND 8589934592),
  asset_width INTEGER NOT NULL CHECK (asset_width BETWEEN 1 AND 32768),
  asset_height INTEGER NOT NULL CHECK (asset_height BETWEEN 1 AND 32768),
  PRIMARY KEY (local_project_key, layer_id)
) STRICT;

-- Stable local IDs may outlive an installation inside copied Project/Preset
-- references. This is identity only: no installed/restorable state, paths,
-- defaults, source payloads, previews, or weights survive hard removal here.
CREATE TABLE model_reference_identity (
  version_id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('civitai', 'supported_dependency')),
  source_key TEXT NOT NULL,
  civitai_model_id INTEGER,
  civitai_model_version_id INTEGER,
  civitai_file_id INTEGER,
  source_revision TEXT,
  type TEXT NOT NULL CHECK (type IN ('checkpoint', 'embedding', 'lora', 'qwen3_encoder', 'upscaler', 'vae')),
  base_model_family TEXT CHECK (base_model_family IN ('illustrious', 'anima')),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  CHECK (
    (source_kind = 'civitai' AND civitai_model_id IS NOT NULL
      AND civitai_model_version_id IS NOT NULL AND civitai_file_id IS NOT NULL
      AND source_revision IS NULL) OR
    (source_kind = 'supported_dependency' AND civitai_model_id IS NULL
      AND civitai_model_version_id IS NULL AND civitai_file_id IS NULL
      AND source_revision IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_model_reference_identity_source ON model_reference_identity(source_key, type, sha256, size_bytes);

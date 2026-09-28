-- A user choice belongs to exact Illustrious checkpoint bytes, not a CivitAI version or
-- project document. The repository permits writes only for installed Illustrious checkpoints.
-- Keeping this separate from model_resource_version.prediction_type preserves manifest evidence.
CREATE TABLE checkpoint_prediction_override (
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  prediction_type TEXT NOT NULL CHECK (prediction_type IN ('epsilon', 'v_prediction', 'sample')),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  PRIMARY KEY (sha256, size_bytes)
) STRICT;

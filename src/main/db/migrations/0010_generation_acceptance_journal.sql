-- An Add intent is durable before its document edit. Recovery can prove the
-- accepted assets/provenance before hiding exactly the captured staging sessions.
CREATE TABLE generation_acceptance_journal (
  local_project_key TEXT NOT NULL,
  document_id TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  canonical_project_path TEXT NOT NULL,
  payload_json TEXT NOT NULL
    CHECK (length(CAST(payload_json AS BLOB)) BETWEEN 1 AND 16777216),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (local_project_key, document_id)
) STRICT;

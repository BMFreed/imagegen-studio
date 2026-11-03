-- Preserve every ordinary and Smart attempt while admitting the private regional operation.
-- Public dispatch, Retry and accepted provenance remain closed to this operation.
CREATE TABLE generation_queue_item_expanded (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  local_project_key TEXT NOT NULL,
  canonical_project_path TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_revision TEXT NOT NULL,
  staging_session_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('illustrious-txt2img', 'illustrious-img2img', 'anima-txt2img', 'anima-img2img', 'illustrious-outpaint', 'anima-outpaint', 'illustrious-smart-patch', 'anima-smart-patch', 'illustrious-regional')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
  status_sequence INTEGER NOT NULL DEFAULT 0 CHECK (status_sequence >= 0),
  frozen_payload_json TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
) STRICT;

INSERT INTO generation_queue_item_expanded SELECT * FROM generation_queue_item;
DROP TABLE generation_queue_item;
ALTER TABLE generation_queue_item_expanded RENAME TO generation_queue_item;

CREATE INDEX idx_generation_queue_status ON generation_queue_item(status, created_at, id);
CREATE INDEX idx_generation_queue_project ON generation_queue_item(local_project_key, created_at, id);

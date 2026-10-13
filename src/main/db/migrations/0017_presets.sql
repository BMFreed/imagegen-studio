-- Presets are independent editable templates. Copied resource references remain
-- readable when models or Projects disappear; no model/Project cascade owns them.
CREATE TABLE presets (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  workflow_type TEXT NOT NULL CHECK (workflow_type IN ('txt2img', 'img2img', 'inpaint')),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(tags_json) AND json_type(tags_json) = 'array'
  ),
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  payload_json TEXT NOT NULL CHECK (
    json_valid(payload_json) AND json_type(payload_json) = 'object'
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  deleted_at TEXT CHECK (deleted_at IS NULL OR length(deleted_at) > 0)
) STRICT;

CREATE INDEX idx_presets_catalog ON presets(deleted_at, updated_at DESC, name, id);

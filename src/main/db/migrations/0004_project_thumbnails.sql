-- Derived Home metadata. The embedded .igs preview remains authoritative.
ALTER TABLE project_index ADD COLUMN preview_thumbnail_sha256 TEXT
  CHECK (preview_thumbnail_sha256 IS NULL OR
    (length(preview_thumbnail_sha256) = 64 AND preview_thumbnail_sha256 NOT GLOB '*[^0-9a-f]*'));

-- A scanned package identity prevents a cache entry from outliving its validated source.
ALTER TABLE project_index ADD COLUMN file_fingerprint TEXT;

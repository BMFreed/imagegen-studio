-- Seek global saved-result pages without materializing or sorting an unbounded
-- workspace catalog. Portable copies remain separate in the deterministic ties.
CREATE INDEX idx_project_accepted_result_catalog_order
  ON project_accepted_result_index(accepted_at DESC, local_project_key ASC, layer_id ASC);

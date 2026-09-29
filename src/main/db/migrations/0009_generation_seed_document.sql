-- The local path alone is not a Project identity: another .igs document can replace a file at
-- the same path. Legacy cursors are untrusted unless the completed receipt and still-retained
-- queue row prove which document produced the exact candidate/order/seed tuple.
ALTER TABLE generation_seed_cursor ADD COLUMN document_id TEXT;

UPDATE generation_seed_cursor AS cursor
SET document_id = (
  SELECT queue.document_id
  FROM generation_candidate_receipt AS receipt
  JOIN generation_queue_item AS queue ON queue.id = receipt.queue_item_id
  WHERE receipt.candidate_id = cursor.candidate_id
    AND receipt.local_project_key = cursor.local_project_key
    AND receipt.completion_order = cursor.completion_order
    AND receipt.actual_seed = cursor.actual_seed
    AND receipt.status = 'completed'
    AND queue.id = cursor.candidate_id
    AND queue.local_project_key = cursor.local_project_key
    AND queue.canonical_project_path = receipt.canonical_project_path
    AND queue.status = 'completed'
);

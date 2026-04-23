-- A2c-followup: outbox worker exponential backoff scheduling.
-- See ADR 0009 (outbox worker strategy).

ALTER TABLE "outbox_events"
  ADD COLUMN "next_attempt_at" TIMESTAMP(3);

-- Composite index for the worker hot-path query:
--   WHERE processed_at IS NULL
--     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
--   ORDER BY created_at
-- The pre-existing partial idx (`outbox_events_unprocessed_idx`) on
-- created_at WHERE processed_at IS NULL still helps; this composite
-- supports the new next_attempt_at predicate.
CREATE INDEX "outbox_events_processed_at_next_attempt_at_created_at_idx"
  ON "outbox_events" ("processed_at", "next_attempt_at", "created_at");

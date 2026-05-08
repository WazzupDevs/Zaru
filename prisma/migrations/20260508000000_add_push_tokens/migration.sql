-- A4e-3 — push notification completion. Adds the columns the listener +
-- update-push-token use case need.
--
-- User: optional Expo push token + the timestamp it was last set.
-- Listener reads expoPushToken to decide PUSH vs SMS fallback.
-- pushTokenUpdatedAt lets a future cleanup worker prune stale tokens
-- (Expo invalidates after ~6 months of inactivity).
ALTER TABLE "users"
  ADD COLUMN "expo_push_token" TEXT,
  ADD COLUMN "push_token_updated_at" TIMESTAMP(3);

-- Notification: snapshot of the push token at queue time. Mirrors the
-- recipient_phone column for SMS rows — stored on the notification (not
-- joined from users) so a post-hoc token rotation doesn't change replay
-- shape and the sender doesn't need a second DB hit.
ALTER TABLE "notifications"
  ADD COLUMN "recipient_push_token" TEXT;

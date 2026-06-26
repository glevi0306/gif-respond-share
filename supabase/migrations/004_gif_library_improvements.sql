-- ============================================================
-- 004_gif_library_improvements.sql
-- Adds favorite and usage-tracking columns to the gifs table.
-- These columns are used by the Library screen (Step 6).
-- Must run after 001_schema.sql.
-- ============================================================

ALTER TABLE gifs
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS times_used  integer NOT NULL DEFAULT 0;

-- Enable Postgres logical replication for real-time updates.
-- Required for Supabase Realtime subscriptions on these tables.
-- Run this once; it is idempotent (ADD TABLE is a no-op if already present).
ALTER TABLE questions REPLICA IDENTITY FULL;
ALTER TABLE answers   REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;

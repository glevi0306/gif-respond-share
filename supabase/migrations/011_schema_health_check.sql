-- ============================================================
-- 011_schema_health_check.sql
--
-- Fixes two schema gaps found during health check:
--
--   1. answers.created_at is missing from the live database.
--      It exists in 001_schema.sql but the project was provisioned
--      from an older version. Added with IF NOT EXISTS — safe no-op
--      if the column is already present; existing rows receive now()
--      as their timestamp.
--
--   2. supabase_realtime publication is empty.
--      Migrations 004 / 005 / 006 added these tables but the
--      publication appears to have been reset.
--      ALTER PUBLICATION … ADD TABLE has no IF NOT EXISTS clause,
--      so each table is guarded by a DO block that checks
--      pg_publication_tables first.
--      REPLICA IDENTITY FULL is required for UPDATE/DELETE events;
--      it is idempotent and safe to re-run.
-- ============================================================


-- ── 1. answers.created_at ────────────────────────────────────

ALTER TABLE answers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();


-- ── 2. Realtime — REPLICA IDENTITY ───────────────────────────
-- Idempotent: setting FULL when already FULL is a no-op.

ALTER TABLE questions   REPLICA IDENTITY FULL;
ALTER TABLE answers     REPLICA IDENTITY FULL;
ALTER TABLE reactions   REPLICA IDENTITY FULL;
ALTER TABLE direct_gifs REPLICA IDENTITY FULL;


-- ── 3. Realtime — publication membership ─────────────────────
-- Each DO block adds the table only when it is not already a member.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE questions;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'answers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE answers;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reactions;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'direct_gifs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE direct_gifs;
  END IF;
END $$;

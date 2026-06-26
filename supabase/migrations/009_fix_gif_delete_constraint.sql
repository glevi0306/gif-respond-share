-- ============================================================
-- 009_fix_gif_delete_constraint.sql
--
-- Root cause: answers.gif_id was NOT NULL REFERENCES gifs(id) ON DELETE RESTRICT.
-- This made it impossible to delete a gif row from the library if it had
-- ever been used as an answer — the storage file got deleted first, but the
-- DB delete was silently blocked, leaving orphaned rows with broken URLs.
--
-- Fix: make gif_id nullable and switch to ON DELETE SET NULL.
-- answers.gif_url is already denormalized (copied at insert time), so every
-- existing conversation continues displaying correctly via gif_url even after
-- gif_id becomes NULL.
-- ============================================================

ALTER TABLE answers ALTER COLUMN gif_id DROP NOT NULL;

ALTER TABLE answers DROP CONSTRAINT IF EXISTS answers_gif_id_fkey;

ALTER TABLE answers
  ADD CONSTRAINT answers_gif_id_fkey
  FOREIGN KEY (gif_id) REFERENCES gifs(id) ON DELETE SET NULL;

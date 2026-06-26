-- ============================================================
-- 010_reactions_direct_gif_support.sql
--
-- Extends the reactions table to support reactions on direct GIFs,
-- not just answer GIFs. Previously answer_id was NOT NULL, which
-- prevented reacting to peer-to-peer GIFs sent without a question.
--
-- Changes:
--   1. Drop the existing unique constraint (replaced by partial indexes)
--   2. Make answer_id nullable
--   3. Add direct_gif_id column (references direct_gifs)
--   4. Add check constraint: exactly one of (answer_id, direct_gif_id) must be set
--   5. Add partial unique indexes (one reaction per user per target)
-- ============================================================

-- 1. Drop existing named unique constraint
ALTER TABLE reactions DROP CONSTRAINT IF EXISTS reactions_answer_id_user_id_key;

-- 2. Make answer_id nullable (existing rows keep their value unchanged)
ALTER TABLE reactions ALTER COLUMN answer_id DROP NOT NULL;

-- 3. Add direct_gif_id column
ALTER TABLE reactions
  ADD COLUMN IF NOT EXISTS direct_gif_id UUID REFERENCES direct_gifs(id) ON DELETE CASCADE;

-- 4. Enforce exactly one target per row
ALTER TABLE reactions
  ADD CONSTRAINT reactions_exactly_one_target
  CHECK (
    (answer_id IS NOT NULL AND direct_gif_id IS NULL) OR
    (answer_id IS NULL     AND direct_gif_id IS NOT NULL)
  );

-- 5. Partial unique indexes — one reaction per user per GIF target
CREATE UNIQUE INDEX IF NOT EXISTS reactions_answer_user_unique
  ON reactions (answer_id, user_id) WHERE answer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reactions_direct_gif_user_unique
  ON reactions (direct_gif_id, user_id) WHERE direct_gif_id IS NOT NULL;

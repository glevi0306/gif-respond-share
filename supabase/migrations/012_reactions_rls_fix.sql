-- ============================================================
-- 012_reactions_rls_fix.sql
--
-- Root cause: the "Parties can view reactions" SELECT policy was
-- written before direct_gif_id was added (migration 010).
--
-- After migration 010, answer_id is nullable.  When a direct-gif
-- reaction is stored (answer_id IS NULL, direct_gif_id IS NOT NULL),
-- the existing policy evaluates:
--
--   a.id = reactions.answer_id  →  a.id = NULL  →  always FALSE
--
-- The EXISTS subquery never matches, so the policy denies SELECT for
-- every user except the reactor themselves (covered by the FOR ALL
-- "Users manage own reactions" policy).  Result: the GIF sender
-- never sees a reaction the receiver left on their direct GIF.
--
-- Fix: replace the policy with one that handles both cases.
-- ============================================================

DROP POLICY IF EXISTS "Parties can view reactions" ON reactions;

CREATE POLICY "Parties can view reactions" ON reactions
  FOR SELECT USING (
    -- Answer reactions: both the responder (GIF sender) and the asker can view
    (
      answer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM answers a
        JOIN questions q ON q.id = a.question_id
        WHERE a.id = reactions.answer_id
          AND (a.responder_id = auth.uid() OR q.from_id = auth.uid())
      )
    )
    OR
    -- Direct-gif reactions: both sender and receiver can view
    (
      direct_gif_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM direct_gifs dg
        WHERE dg.id = reactions.direct_gif_id
          AND (dg.sender_id = auth.uid() OR dg.receiver_id = auth.uid())
      )
    )
  );

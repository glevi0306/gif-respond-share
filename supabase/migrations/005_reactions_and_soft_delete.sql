-- Soft delete support for GIF answers
ALTER TABLE answers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Emoji reactions table
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (answer_id, user_id)
);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- Both conversation parties can view reactions on answers they're involved in
CREATE POLICY "Parties can view reactions" ON reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM answers a
      INNER JOIN questions q ON q.id = a.question_id
      WHERE a.id = reactions.answer_id
        AND (a.responder_id = auth.uid() OR q.from_id = auth.uid())
    )
  );

-- Users can manage only their own reactions
CREATE POLICY "Users manage own reactions" ON reactions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime so both parties see reaction changes instantly
ALTER PUBLICATION supabase_realtime ADD TABLE reactions;

-- Bug 2 fix: allow the responder to soft-delete (UPDATE) their own answer
CREATE POLICY "Responder can soft-delete own answer"
  ON answers FOR UPDATE
  USING (responder_id = auth.uid())
  WITH CHECK (responder_id = auth.uid());

-- Bug 4 fix: peer-to-peer direct GIF delivery (no question required)
CREATE TABLE IF NOT EXISTS direct_gifs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gif_id      UUID        REFERENCES gifs(id) ON DELETE SET NULL,
  gif_url     TEXT        NOT NULL,
  is_deleted  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE direct_gifs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties can view direct GIFs" ON direct_gifs
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Sender can insert direct GIFs" ON direct_gifs
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Sender can soft-delete own direct GIF" ON direct_gifs
  FOR UPDATE USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE direct_gifs;

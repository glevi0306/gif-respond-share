-- ============================================================
-- 001_schema.sql
-- Core tables, RLS policies, indexes, and storage buckets.
-- Run this first, before 002 and 003.
-- ============================================================


-- ── TABLES ───────────────────────────────────────────────────

-- profiles: one row per auth.users entry (created by trigger in 002)
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text        NOT NULL UNIQUE,
  avatar_emoji text        NOT NULL DEFAULT '🙂',
  bio          text        NOT NULL DEFAULT '',
  language     text        NOT NULL DEFAULT 'en'
                           CHECK (language IN ('en','hu','de','es','fr','it','pl','pt-BR')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- friendships: bidirectional friend relationship
-- user_id always initiates; friend_id receives the request
CREATE TABLE IF NOT EXISTS friendships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_unique     UNIQUE (user_id, friend_id),
  CONSTRAINT no_self_friend         CHECK  (user_id <> friend_id)
);

-- questions: one user asks another a text question
CREATE TABLE IF NOT EXISTS questions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text       text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  status     text        NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting','answered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_question       CHECK  (from_id <> to_id)
);

-- gifs: every GIF a user records goes here (personal library)
CREATE TABLE IF NOT EXISTS gifs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,         -- e.g. gifs/{user_id}/{uuid}.gif
  public_url   text        NOT NULL,
  category     text        CHECK (category IN ('funny','yes','no','celebration','wtf','tired','other')),
  duration_ms  int         NOT NULL DEFAULT 5000,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- answers: links a gif to a question; one answer per question
-- gif_url is denormalized so the asker can display it without touching the gifs table
CREATE TABLE IF NOT EXISTS answers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid        NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  responder_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gif_id       uuid        NOT NULL REFERENCES gifs(id) ON DELETE RESTRICT,
  gif_url      text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ── UPDATED_AT TRIGGER ────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── ROW LEVEL SECURITY ────────────────────────────────────────

ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers     ENABLE ROW LEVEL SECURITY;

-- profiles
-- INSERT is handled exclusively by the SECURITY DEFINER trigger in 002.
-- No user-facing INSERT policy is needed or safe here.
CREATE POLICY "Authenticated users can read any profile"
  ON profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE TO authenticated
  USING     (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can delete their own profile"
  ON profiles FOR DELETE TO authenticated
  USING (id = auth.uid());

-- friendships
CREATE POLICY "Users can view their own friendships"
  ON friendships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can send friend requests"
  ON friendships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can respond to or remove friendships they are part of"
  ON friendships FOR UPDATE TO authenticated
  USING     (user_id = auth.uid() OR friend_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can remove their own friendships"
  ON friendships FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR friend_id = auth.uid());

-- questions
CREATE POLICY "Parties can view questions"
  ON questions FOR SELECT TO authenticated
  USING (from_id = auth.uid() OR to_id = auth.uid());

CREATE POLICY "Users can ask questions"
  ON questions FOR INSERT TO authenticated
  WITH CHECK (from_id = auth.uid());

CREATE POLICY "Recipient can update question status"
  ON questions FOR UPDATE TO authenticated
  USING     (to_id = auth.uid())
  WITH CHECK (to_id = auth.uid());

CREATE POLICY "Sender can delete unanswered questions"
  ON questions FOR DELETE TO authenticated
  USING (from_id = auth.uid() AND status = 'waiting');

-- gifs
CREATE POLICY "Users can view their own GIFs"
  ON gifs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own GIFs"
  ON gifs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own GIFs"
  ON gifs FOR UPDATE TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own GIFs"
  ON gifs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- answers
-- The asker (from_id) needs to read the answer to display it on Question Detail.
-- gif_url is denormalized here so the asker never needs to cross into the gifs table.
CREATE POLICY "Parties can view answers"
  ON answers FOR SELECT TO authenticated
  USING (
    responder_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = answers.question_id
        AND q.from_id = auth.uid()
    )
  );

CREATE POLICY "Responders can submit answers"
  ON answers FOR INSERT TO authenticated
  WITH CHECK (
    responder_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = answers.question_id
        AND q.to_id   = auth.uid()
        AND q.status  = 'waiting'
    )
  );

CREATE POLICY "Responders can delete their own answers"
  ON answers FOR DELETE TO authenticated
  USING (responder_id = auth.uid());


-- ── INDEXES ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS friendships_user_id_idx     ON friendships (user_id);
CREATE INDEX IF NOT EXISTS friendships_friend_id_idx   ON friendships (friend_id);

CREATE INDEX IF NOT EXISTS questions_to_id_status_idx  ON questions   (to_id, status);
CREATE INDEX IF NOT EXISTS questions_from_id_idx       ON questions   (from_id);
CREATE INDEX IF NOT EXISTS questions_created_at_idx    ON questions   (created_at DESC);

CREATE INDEX IF NOT EXISTS gifs_user_id_created_idx    ON gifs        (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS answers_question_id_idx     ON answers     (question_id);
CREATE INDEX IF NOT EXISTS answers_responder_id_idx    ON answers     (responder_id);


-- ── STORAGE BUCKETS ───────────────────────────────────────────
-- file_size_limit is in bytes:
--   avatars    2 MB  = 2 097 152
--   gifs      10 MB  = 10 485 760
--   thumbnails 0.5 MB = 524 288
--   videos    50 MB  = 52 428 800

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',
   'avatars',
   true,
   2097152,
   ARRAY['image/jpeg','image/png','image/webp','image/gif']),

  ('gifs',
   'gifs',
   true,
   10485760,
   ARRAY['image/gif']),

  ('thumbnails',
   'thumbnails',
   true,
   524288,
   ARRAY['image/jpeg','image/webp']),

  ('videos',
   'videos',
   false,
   52428800,
   ARRAY['video/mp4','video/webm','video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — the path convention is:
--   {bucket}/{user_id}/{filename}
-- so (storage.foldername(name))[1] always equals the owner's user_id.

-- avatars (public bucket — anyone can view)
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- gifs (public bucket — URLs are shared with question askers)
CREATE POLICY "Anyone can view GIFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gifs');

CREATE POLICY "Authenticated users can upload GIFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gifs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own GIFs from storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'gifs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- thumbnails (public bucket)
CREATE POLICY "Anyone can view thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can upload thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- videos (private bucket — only owner can read)
CREATE POLICY "Users can view their own videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can upload videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

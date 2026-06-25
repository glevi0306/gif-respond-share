-- ============================================================
-- 002_profile_trigger.sql
-- Auto-creates a profiles row the moment a user signs up.
-- Must run after 001_schema.sql (profiles table must exist).
-- ============================================================

-- The function runs as the table owner (SECURITY DEFINER) so it can
-- INSERT into profiles even though there is no user-facing INSERT policy.
-- SET search_path = public prevents search-path injection attacks.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_emoji, bio, language)
  VALUES (
    NEW.id,

    -- Prefer a username passed via sign-up metadata; fall back to user_{first-8-chars-of-uuid}
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
      'user_' || LEFT(NEW.id::text, 8)
    ),

    -- Prefer an emoji passed via sign-up metadata; fall back to default
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_emoji'), ''),
      '🙂'
    ),

    -- Bio starts empty
    '',

    -- Prefer a language passed via sign-up metadata; fall back to English
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'language'), ''),
      'en'
    )
  );
  RETURN NEW;
END;
$$;

-- Drop and re-create so re-running this migration is idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

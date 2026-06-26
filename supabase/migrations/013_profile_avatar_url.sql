-- ============================================================
-- 013_profile_avatar_url.sql
--
-- Adds avatar_url to profiles for photo-based avatars.
-- NULL = use avatar_emoji fallback (existing behaviour unchanged).
-- Existing rows stay as-is: no NOT NULL, no DEFAULT.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================
-- 003_settings_columns.sql
-- Adds notification and privacy preference columns to profiles.
-- Must run after 001_schema.sql (profiles table must exist).
-- These columns back the Settings page (settings.tsx).
-- ============================================================

ALTER TABLE profiles
  -- Notification toggles (match the five toggles in the Notifications section)
  ADD COLUMN IF NOT EXISTS notif_new_question  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_new_answer    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_friend_joined boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_weekly        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_results       boolean NOT NULL DEFAULT true,

  -- Privacy selectors (match the three Segment controls in the Privacy section)
  ADD COLUMN IF NOT EXISTS profile_visibility  text    NOT NULL DEFAULT 'friends'
    CHECK (profile_visibility  IN ('public','friends')),

  ADD COLUMN IF NOT EXISTS library_visibility  text    NOT NULL DEFAULT 'friends'
    CHECK (library_visibility  IN ('public','friends','private')),

  ADD COLUMN IF NOT EXISTS gif_default_privacy text    NOT NULL DEFAULT 'friends'
    CHECK (gif_default_privacy IN ('public','friends','private'));

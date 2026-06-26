-- Favorites flag on GIFs
ALTER TABLE gifs ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

-- Usage counter: incremented each time a GIF is sent/shared
ALTER TABLE gifs ADD COLUMN IF NOT EXISTS times_used INTEGER NOT NULL DEFAULT 0;

-- Atomic increment function (SECURITY INVOKER → RLS applies, users can only touch their own GIFs)
CREATE OR REPLACE FUNCTION increment_gif_usage(p_gif_id UUID)
RETURNS void LANGUAGE sql SECURITY INVOKER AS $$
  UPDATE gifs SET times_used = times_used + 1 WHERE id = p_gif_id AND user_id = auth.uid();
$$;

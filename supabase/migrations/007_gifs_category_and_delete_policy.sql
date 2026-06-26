-- Ensure category column exists (may already be present from earlier setup)
ALTER TABLE gifs ADD COLUMN IF NOT EXISTS category TEXT;

-- Allow users to update their own GIFs (required for category assignment)
CREATE POLICY "Users can update own gifs"
  ON gifs FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow users to delete their own GIFs from the library
CREATE POLICY "Users can delete own gifs"
  ON gifs FOR DELETE
  USING (user_id = auth.uid());

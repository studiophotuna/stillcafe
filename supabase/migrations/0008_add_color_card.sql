ALTER TABLE site_content
  ADD COLUMN IF NOT EXISTS color_card text NOT NULL DEFAULT '#ffffff';

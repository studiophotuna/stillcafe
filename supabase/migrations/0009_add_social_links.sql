ALTER TABLE site_content
  ADD COLUMN IF NOT EXISTS social_instagram text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_facebook text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tiktok text NOT NULL DEFAULT '';

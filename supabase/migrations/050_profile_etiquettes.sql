-- Add etiquettes (tags) array to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS etiquettes text[] NOT NULL DEFAULT '{}';

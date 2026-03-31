-- Migration etiquette (text) → etiquettes (text[])

-- Dossiers
ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS etiquettes text[] DEFAULT '{}';
UPDATE dossiers SET etiquettes = ARRAY[etiquette] WHERE etiquette IS NOT NULL AND etiquette != '';
ALTER TABLE dossiers DROP COLUMN IF EXISTS etiquette;

-- Cours
ALTER TABLE cours ADD COLUMN IF NOT EXISTS etiquettes text[] DEFAULT '{}';
UPDATE cours SET etiquettes = ARRAY[etiquette] WHERE etiquette IS NOT NULL AND etiquette != '';
ALTER TABLE cours DROP COLUMN IF EXISTS etiquette;

-- Règles de liaison automatique par section pour les universités.
-- Format: { "sections": { "Socle": ["prepa_pass","prepa_las","prepa_lsps"], ... } }
-- NULL = pas de règles (pas de contrainte).

ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS link_rules jsonb DEFAULT NULL;

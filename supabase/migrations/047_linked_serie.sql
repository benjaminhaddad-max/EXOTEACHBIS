-- Liaison des séries entre offres (même logique que linked_cours_id pour les cours)
ALTER TABLE series ADD COLUMN IF NOT EXISTS linked_serie_id uuid DEFAULT NULL;

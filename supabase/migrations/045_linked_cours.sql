-- Ajout d'un champ pour lier les cours clonés entre offres
ALTER TABLE cours ADD COLUMN IF NOT EXISTS linked_cours_id uuid DEFAULT NULL;

-- Ajout d'un champ étiquette libre sur les dossiers
ALTER TABLE dossiers ADD COLUMN etiquette text DEFAULT NULL;

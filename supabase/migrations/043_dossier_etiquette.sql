-- Ajout d'un champ étiquette libre sur les dossiers et les cours
ALTER TABLE dossiers ADD COLUMN etiquette text DEFAULT NULL;
ALTER TABLE cours ADD COLUMN etiquette text DEFAULT NULL;

-- Statut d'actualisation des cours
-- Valeurs: 'non_actualisee' (défaut), 'aucun_changement', 'actualisation', 'changements_notables', 'nouvelle_fiche'
ALTER TABLE cours ADD COLUMN IF NOT EXISTS actualisation text DEFAULT 'non_actualisee';

-- Migration: Add role_type to prof_matieres
-- Allows differentiating professor assignments: cours, qa, contenu

-- 1. Add role_type column with default "cours" for backward compatibility
ALTER TABLE prof_matieres
  ADD COLUMN IF NOT EXISTS role_type text NOT NULL DEFAULT 'cours';

-- 2. Drop existing unique constraint (prof_id, matiere_id)
ALTER TABLE prof_matieres
  DROP CONSTRAINT IF EXISTS prof_matieres_prof_id_matiere_id_key;

-- 3. Create new unique constraint including role_type
ALTER TABLE prof_matieres
  ADD CONSTRAINT prof_matieres_prof_matiere_role_unique
  UNIQUE (prof_id, matiere_id, role_type);

-- 4. Add check constraint for valid values
ALTER TABLE prof_matieres
  ADD CONSTRAINT prof_matieres_role_type_check
  CHECK (role_type IN ('cours', 'qa', 'contenu'));

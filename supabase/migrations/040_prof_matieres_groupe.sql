-- Migration: Add groupe_id to prof_matieres
-- Allows assigning a professor to a matière for specific classes (groupes)
-- A NULL groupe_id means the prof teaches this matière to all classes

-- 1. Add groupe_id column (nullable)
ALTER TABLE prof_matieres
  ADD COLUMN IF NOT EXISTS groupe_id uuid REFERENCES groupes(id) ON DELETE SET NULL;

-- 2. Drop existing unique constraint (prof_id, matiere_id, role_type)
ALTER TABLE prof_matieres
  DROP CONSTRAINT IF EXISTS prof_matieres_prof_matiere_role_unique;

-- 3. Create new unique constraint including groupe_id
--    Use NULLS NOT DISTINCT so (prof, mat, cours, NULL) can only appear once
ALTER TABLE prof_matieres
  ADD CONSTRAINT prof_matieres_prof_matiere_role_groupe_unique
  UNIQUE NULLS NOT DISTINCT (prof_id, matiere_id, role_type, groupe_id);

-- 4. Index for groupe lookups
CREATE INDEX IF NOT EXISTS idx_prof_matieres_groupe ON prof_matieres(groupe_id);

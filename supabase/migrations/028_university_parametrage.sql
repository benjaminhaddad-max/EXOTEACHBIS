-- University-level parametrage: grading scales + default matière coefficients

-- Grading scale per university (grille QCM)
-- Example: 0 errors = 1pt, 1 error = 0.5pt, 2 errors = 0.2pt, 3+ = 0pt
CREATE TABLE IF NOT EXISTS public.university_grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  nb_errors integer NOT NULL,
  points numeric(4,2) NOT NULL,
  UNIQUE(university_dossier_id, nb_errors)
);

-- Default matière coefficients per university
-- Applied automatically when creating exam épreuves
CREATE TABLE IF NOT EXISTS public.university_matiere_coefficients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  subject_dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  coefficient numeric(4,2) NOT NULL DEFAULT 1,
  UNIQUE(university_dossier_id, subject_dossier_id)
);

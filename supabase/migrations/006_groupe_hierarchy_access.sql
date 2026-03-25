-- 006: Hierarchie des groupes + contrôle d'accès par dossier
-- À exécuter dans Supabase Dashboard > SQL Editor

-- 1. Ajouter parent_id sur groupes (hiérarchie infinie)
ALTER TABLE public.groupes
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.groupes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_groupes_parent ON public.groupes(parent_id);

-- 2. Table de liaison groupe <-> dossier (accès granulaire)
CREATE TABLE IF NOT EXISTS public.groupe_dossier_acces (
  groupe_id  uuid NOT NULL REFERENCES public.groupes(id)  ON DELETE CASCADE,
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (groupe_id, dossier_id)
);

-- 3. RLS
ALTER TABLE public.groupe_dossier_acces ENABLE ROW LEVEL SECURITY;

-- Admins : accès complet
DROP POLICY IF EXISTS "admin_full_access" ON public.groupe_dossier_acces;
CREATE POLICY "admin_full_access" ON public.groupe_dossier_acces
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Élèves/profs : lecture de leur propre groupe
DROP POLICY IF EXISTS "read_own_groupe_acces" ON public.groupe_dossier_acces;
CREATE POLICY "read_own_groupe_acces" ON public.groupe_dossier_acces
  FOR SELECT TO authenticated
  USING (
    groupe_id IN (
      SELECT groupe_id FROM public.profiles WHERE id = auth.uid() AND groupe_id IS NOT NULL
    )
  );

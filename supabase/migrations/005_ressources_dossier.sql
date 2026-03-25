-- =============================================
-- Migration 005 : Ressources attachées aux dossiers
-- Permet de placer du contenu à n'importe quel niveau
-- =============================================

-- Rendre cours_id nullable (contenu peut être attaché à un dossier directement)
ALTER TABLE public.ressources ALTER COLUMN cours_id DROP NOT NULL;

-- Ajouter dossier_id sur ressources
ALTER TABLE public.ressources ADD COLUMN IF NOT EXISTS dossier_id uuid REFERENCES public.dossiers(id) ON DELETE CASCADE;

-- Index
CREATE INDEX IF NOT EXISTS idx_ressources_dossier ON public.ressources(dossier_id);

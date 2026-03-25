-- =============================================
-- Migration 004 : Table ressources
-- Items (PDF, vidéo, Vimeo, lien) dans un cours/page
-- =============================================

-- Type de ressource
CREATE TYPE ressource_type AS ENUM ('pdf', 'video', 'vimeo', 'lien');

-- Table ressources
CREATE TABLE IF NOT EXISTS public.ressources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cours_id      uuid NOT NULL REFERENCES public.cours(id) ON DELETE CASCADE,
  titre         text NOT NULL,
  sous_titre    text,
  type          ressource_type NOT NULL DEFAULT 'pdf',
  -- PDF
  pdf_url       text,
  pdf_path      text,
  -- Vidéo (URL directe mp4 ou autre)
  video_url     text,
  -- Vimeo embed ID ou URL complète
  vimeo_id      text,
  -- Lien externe
  lien_url      text,
  lien_label    text,
  -- Commun
  order_index   integer DEFAULT 0,
  visible       boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_ressources_cours ON public.ressources(cours_id);
CREATE INDEX IF NOT EXISTS idx_ressources_order ON public.ressources(cours_id, order_index);

-- RLS
ALTER TABLE public.ressources ENABLE ROW LEVEL SECURITY;

-- Elèves : lire les ressources visibles
CREATE POLICY "Eleves can read visible ressources"
  ON public.ressources FOR SELECT
  USING (
    visible = true
    AND EXISTS (
      SELECT 1 FROM public.cours c
      WHERE c.id = cours_id AND c.visible = true
    )
  );

-- Admins : tout gérer
CREATE POLICY "Admins can manage ressources"
  ON public.ressources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Ajouter colonne page_type sur cours pour identifier le type de page
ALTER TABLE public.cours ADD COLUMN IF NOT EXISTS page_type text DEFAULT 'fiches'
  CHECK (page_type IN ('fiches', 'seances', 'videos', 'exercices', 'liens', 'custom'));

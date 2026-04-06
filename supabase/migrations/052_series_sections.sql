-- Sections/Parties for QCM series (e.g., "Partie A — Etude de l'ésoméprazole")
-- Each section has a title, intro text, and shared images.
-- Questions are linked to sections via series_questions.section_id.

CREATE TABLE IF NOT EXISTS public.series_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  intro_text TEXT,
  image_url TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.series_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read series_sections"
  ON public.series_sections FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage series_sections"
  ON public.series_sections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'prof')));

-- Add section_id FK to series_questions
ALTER TABLE public.series_questions
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.series_sections(id) ON DELETE SET NULL;

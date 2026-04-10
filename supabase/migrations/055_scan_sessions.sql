-- Scan sessions: track PDF scan uploads and processing status
CREATE TABLE IF NOT EXISTS public.scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examen_id UUID NOT NULL REFERENCES public.examens(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.profiles(id),
  filename TEXT,
  total_pages INT DEFAULT 0,
  processed_pages INT DEFAULT 0,
  matched_students INT DEFAULT 0,
  unmatched_students INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing', -- processing | review | done | error
  results JSONB DEFAULT '[]', -- array of { pageIndex, studentId, userId, answers, score, errors }
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scan_sessions"
  ON public.scan_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'prof')));

CREATE POLICY "Students can read own scan results"
  ON public.scan_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Add sujet and correction file URLs to examens_series
ALTER TABLE public.examens_series
  ADD COLUMN IF NOT EXISTS sujet_url TEXT,
  ADD COLUMN IF NOT EXISTS correction_url TEXT;

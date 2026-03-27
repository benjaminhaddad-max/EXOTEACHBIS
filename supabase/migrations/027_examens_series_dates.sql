-- Add per-serie scheduling to examens
-- Each serie within an exam can have its own debut/fin dates
-- When NULL, falls back to the parent exam's dates

ALTER TABLE public.examens_series
  ADD COLUMN IF NOT EXISTS debut_at timestamptz,
  ADD COLUMN IF NOT EXISTS fin_at   timestamptz;

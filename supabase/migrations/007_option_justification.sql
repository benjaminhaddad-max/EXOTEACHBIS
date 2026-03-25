-- Add justification column to options (per-proposition explanation for PASS/LAS format)
ALTER TABLE public.options ADD COLUMN IF NOT EXISTS justification text;

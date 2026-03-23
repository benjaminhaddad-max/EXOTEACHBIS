-- Migration 003: Add 'revision' to events type enum
-- This extends the existing events.type CHECK constraint to include 'revision'

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_type_check
  CHECK (type IN ('cours', 'examen', 'reunion', 'revision', 'autre'));

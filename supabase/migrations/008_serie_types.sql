-- Migration 008 : Ajout des types "annales" et "qcm_supplementaires" pour les séries
-- À exécuter dans Supabase Dashboard > SQL Editor

ALTER TABLE public.series
  DROP CONSTRAINT IF EXISTS series_type_check;

ALTER TABLE public.series
  ADD CONSTRAINT series_type_check
    CHECK (type IN ('entrainement', 'concours_blanc', 'revision', 'annales', 'qcm_supplementaires'));

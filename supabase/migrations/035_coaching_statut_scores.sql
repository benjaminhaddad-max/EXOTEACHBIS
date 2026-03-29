-- ============================================================================
-- 035 — Coaching: Statut niveau/mental en scores 0-100
-- ============================================================================

-- Drop old CHECK constraints first
alter table public.coaching_student_profiles
  drop constraint if exists coaching_student_profiles_niveau_initial_check,
  drop constraint if exists coaching_student_profiles_mental_initial_check,
  drop constraint if exists coaching_student_profiles_niveau_progressif_check,
  drop constraint if exists coaching_student_profiles_mental_progressif_check;

-- Change column types from text to integer (0-100)
alter table public.coaching_student_profiles
  alter column niveau_initial type integer using null,
  alter column mental_initial type integer using null,
  alter column niveau_progressif type integer using null,
  alter column mental_progressif type integer using null;

-- Add range constraints
alter table public.coaching_student_profiles
  add constraint coaching_student_profiles_niveau_initial_range
    check (niveau_initial is null or (niveau_initial >= 0 and niveau_initial <= 100)),
  add constraint coaching_student_profiles_mental_initial_range
    check (mental_initial is null or (mental_initial >= 0 and mental_initial <= 100)),
  add constraint coaching_student_profiles_niveau_progressif_range
    check (niveau_progressif is null or (niveau_progressif >= 0 and niveau_progressif <= 100)),
  add constraint coaching_student_profiles_mental_progressif_range
    check (mental_progressif is null or (mental_progressif >= 0 and mental_progressif <= 100));

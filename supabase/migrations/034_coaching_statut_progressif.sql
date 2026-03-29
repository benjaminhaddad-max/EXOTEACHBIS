-- ============================================================================
-- 034 — Coaching: Statut Progressif (niveau + mental évolutifs)
-- ============================================================================

alter table public.coaching_student_profiles
  add column if not exists niveau_progressif text
    check (niveau_progressif in ('fort', 'moyen', 'fragile')),
  add column if not exists mental_progressif text
    check (mental_progressif in ('fort', 'moyen', 'fragile'));

-- Initialize progressif = initial for existing rows
update public.coaching_student_profiles
  set niveau_progressif = niveau_initial,
      mental_progressif = mental_initial
  where niveau_progressif is null and niveau_initial is not null;

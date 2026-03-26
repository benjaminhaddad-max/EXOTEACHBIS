alter table public.form_templates
  add column if not exists target_type text not null default 'global',
  add column if not exists target_offer_code text,
  add column if not exists target_university_dossier_id uuid references public.dossiers(id) on delete set null,
  add column if not exists target_groupe_id uuid references public.groupes(id) on delete set null,
  add column if not exists target_student_id uuid references public.profiles(id) on delete set null,
  add column if not exists target_student_ids jsonb not null default '[]'::jsonb;

alter table public.form_templates
  drop constraint if exists form_templates_target_type_check;

alter table public.form_templates
  add constraint form_templates_target_type_check
  check (target_type in ('global', 'offer', 'university', 'groupe', 'student', 'selection'));

create index if not exists idx_form_templates_target_offer on public.form_templates(target_offer_code);
create index if not exists idx_form_templates_target_university on public.form_templates(target_university_dossier_id);
create index if not exists idx_form_templates_target_groupe on public.form_templates(target_groupe_id);
create index if not exists idx_form_templates_target_student on public.form_templates(target_student_id);

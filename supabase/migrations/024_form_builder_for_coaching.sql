create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  context text not null default 'generic',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  form_template_id uuid not null references public.form_templates(id) on delete cascade,
  key text not null,
  label text not null,
  helper_text text,
  placeholder text,
  field_type text not null check (field_type in ('short_text', 'long_text', 'select')),
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  width text not null default 'full' check (width in ('half', 'full')),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_template_id, key)
);

alter table public.coaching_intake_forms
  add column if not exists form_template_id uuid references public.form_templates(id) on delete set null,
  add column if not exists answers jsonb not null default '{}'::jsonb;

create index if not exists idx_form_templates_slug on public.form_templates(slug);
create index if not exists idx_form_fields_template_order on public.form_fields(form_template_id, order_index);

alter table public.form_templates enable row level security;
alter table public.form_fields enable row level security;

drop policy if exists "form_templates_admin_full_access" on public.form_templates;
create policy "form_templates_admin_full_access"
  on public.form_templates
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

drop policy if exists "form_fields_admin_full_access" on public.form_fields;
create policy "form_fields_admin_full_access"
  on public.form_fields
  for all to authenticated
  using (public.get_my_role() = any (array['admin', 'superadmin']))
  with check (public.get_my_role() = any (array['admin', 'superadmin']));

with upsert_template as (
  insert into public.form_templates (slug, title, description, context, is_active)
  values (
    'coaching_onboarding',
    'Formulaire d''onboarding coaching',
    'Premier formulaire rempli par l''élève avant son appel avec le coach.',
    'coaching',
    true
  )
  on conflict (slug) do update
    set title = excluded.title,
        description = excluded.description,
        context = excluded.context,
        is_active = true,
        updated_at = now()
  returning id
)
insert into public.form_fields (
  form_template_id,
  key,
  label,
  helper_text,
  placeholder,
  field_type,
  required,
  options,
  width,
  order_index
)
select
  upsert_template.id,
  field.key,
  field.label,
  field.helper_text,
  field.placeholder,
  field.field_type,
  field.required,
  field.options::jsonb,
  field.width,
  field.order_index
from upsert_template
cross join (
  values
    ('phone', 'Téléphone', 'Un numéro sur lequel ton coach peut te joindre facilement.', '06 12 34 56 78', 'short_text', true, '[]', 'half', 10),
    ('city', 'Ville', 'Utile pour comprendre ton contexte et tes contraintes.', 'Paris', 'short_text', false, '[]', 'half', 20),
    ('bac_specialties', 'Spécialités au bac', 'Les matières qui ont marqué ton parcours au lycée.', 'SVT, Physique-Chimie...', 'short_text', false, '[]', 'full', 30),
    ('parcours_label', 'Ton parcours actuel', 'Ex: Terminale, PASS, LAS, année de césure, réorientation...', 'Décris brièvement ta situation', 'short_text', true, '[]', 'full', 40),
    ('why_medicine', 'Pourquoi veux-tu faire médecine ?', 'Raconte ce qui te motive vraiment.', 'Explique ce qui te pousse vers cette voie', 'long_text', true, '[]', 'full', 50),
    ('expectations', 'Qu''attends-tu du coaching ?', 'Qu''est-ce qui te serait le plus utile dans cet accompagnement ?', 'Tes attentes, ce que tu veux en retirer', 'long_text', true, '[]', 'full', 60),
    ('main_worry', 'Ta plus grosse inquiétude aujourd''hui', 'Le blocage ou la peur numéro 1 à ce stade.', 'Dis ce qui te fait le plus peur ou te freine', 'long_text', true, '[]', 'full', 70),
    ('current_method_description', 'Comment travailles-tu actuellement ?', 'Organisation, rythme, manière d''apprendre, supports utilisés...', 'Décris ta méthode de travail actuelle', 'long_text', true, '[]', 'full', 80),
    ('strengths', 'Tes points forts', 'Ce sur quoi tu sens que tu peux t''appuyer.', 'Tes atouts, habitudes positives, qualités...', 'long_text', false, '[]', 'full', 90),
    ('weaknesses', 'Tes points faibles', 'Ce qui te fait perdre du temps, de l''énergie ou de la confiance.', 'Ce qui te freine aujourd''hui', 'long_text', false, '[]', 'full', 100),
    ('availability_notes', 'Tes disponibilités ou contraintes', 'Horaires, trajet, job, obligations familiales, sport...', 'Tout ce qui peut jouer sur ton organisation', 'long_text', false, '[]', 'full', 110)
) as field(key, label, helper_text, placeholder, field_type, required, options, width, order_index)
on conflict (form_template_id, key) do update
  set label = excluded.label,
      helper_text = excluded.helper_text,
      placeholder = excluded.placeholder,
      field_type = excluded.field_type,
      required = excluded.required,
      options = excluded.options,
      width = excluded.width,
      order_index = excluded.order_index,
      updated_at = now();

update public.coaching_intake_forms
set
  form_template_id = (
    select id from public.form_templates where slug = 'coaching_onboarding' limit 1
  ),
  answers = jsonb_strip_nulls(jsonb_build_object(
    'phone', phone,
    'city', city,
    'bac_specialties', bac_specialties,
    'parcours_label', parcours_label,
    'why_medicine', why_medicine,
    'expectations', expectations,
    'main_worry', main_worry,
    'current_method_description', current_method_description,
    'strengths', strengths,
    'weaknesses', weaknesses,
    'availability_notes', availability_notes
  ))
where coalesce(answers, '{}'::jsonb) = '{}'::jsonb;

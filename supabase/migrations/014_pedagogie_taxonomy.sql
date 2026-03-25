-- =============================================
-- 014: Taxonomie d'arborescence pédagogique
-- =============================================

alter table public.dossiers
  add column if not exists dossier_type text not null default 'generic',
  add column if not exists formation_offer text;

alter table public.dossiers
  drop constraint if exists dossiers_dossier_type_check;

alter table public.dossiers
  add constraint dossiers_dossier_type_check
  check (dossier_type in (
    'generic',
    'offer',
    'university',
    'semester',
    'option',
    'period',
    'module',
    'subject'
  ));

alter table public.dossiers
  drop constraint if exists dossiers_formation_offer_check;

alter table public.dossiers
  add constraint dossiers_formation_offer_check
  check (
    formation_offer is null
    or formation_offer in (
      'prepa_pass',
      'prepa_las',
      'prepa_lsps',
      'terminale_sante',
      'paes_fr_eu',
      'premiere_elite'
    )
  );

create index if not exists idx_dossiers_dossier_type
  on public.dossiers(dossier_type);

create index if not exists idx_dossiers_formation_offer
  on public.dossiers(formation_offer);

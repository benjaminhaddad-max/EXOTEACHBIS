alter table public.dossiers
  drop constraint if exists dossiers_formation_offer_check;

alter table public.dossiers
  add constraint dossiers_formation_offer_check
  check (
    formation_offer is null
    or length(btrim(formation_offer)) > 0
  );

alter table public.posts
  add column if not exists dossier_id uuid references public.dossiers(id) on delete set null,
  add column if not exists matiere_id uuid references public.matieres(id) on delete set null;

create index if not exists idx_posts_dossier_id on public.posts(dossier_id);
create index if not exists idx_posts_matiere_id on public.posts(matiere_id);

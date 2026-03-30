-- ============================================================
-- Knowledge Base: categories, articles, versions, auto-entries
-- ============================================================

-- Enable pgvector for RAG embeddings
create extension if not exists vector with schema extensions;

-- ─── Categories (3-level hierarchy) ────────────────────────
create table if not exists public.kb_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  parent_id uuid references public.kb_categories(id) on delete cascade,
  icon text, -- lucide icon name
  color text,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_categories_parent_idx on public.kb_categories(parent_id);

-- ─── Articles / fiches de contenu ──────────────────────────
create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.kb_categories(id) on delete set null,
  title text not null,
  content text not null default '',
  content_html text,
  summary text, -- short AI-generated or manual summary
  tags text[] default '{}',

  -- Access scope
  visibility text not null default 'all'
    check (visibility in ('all', 'staff_only', 'formation', 'classe')),
  formation_dossier_ids text[] default '{}',
  groupe_ids text[] default '{}',
  allowed_roles text[] default '{}', -- empty = all roles

  -- Workflow
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_comment text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,

  -- Source tracking (manual vs auto)
  source text not null default 'manual'
    check (source in ('manual', 'auto_platform', 'auto_sync')),
  source_ref text, -- e.g. "matieres:uuid", "dossiers:uuid", "profiles:uuid"

  -- Attachments
  attachments jsonb default '[]', -- [{name, url, type, size}]

  -- RAG embedding
  embedding extensions.vector(1536),

  -- Meta
  author_id uuid references auth.users(id) on delete set null,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_articles_category_idx on public.kb_articles(category_id);
create index if not exists kb_articles_status_idx on public.kb_articles(status);
create index if not exists kb_articles_source_idx on public.kb_articles(source);
create index if not exists kb_articles_tags_idx on public.kb_articles using gin(tags);

-- ─── Article versions (history) ────────────────────────────
create table if not exists public.kb_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.kb_articles(id) on delete cascade,
  version_number int not null default 1,
  title text not null,
  content text not null,
  content_html text,
  author_id uuid references auth.users(id) on delete set null,
  change_note text,
  created_at timestamptz not null default now()
);

create index if not exists kb_versions_article_idx on public.kb_article_versions(article_id);

-- ─── Chatbot questions log ─────────────────────────────────
create table if not exists public.kb_chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_role text,
  question text not null,
  answer text,
  article_ids text[] default '{}', -- articles used to answer
  confidence float,
  had_answer boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists kb_chat_logs_user_idx on public.kb_chat_logs(user_id);
create index if not exists kb_chat_logs_no_answer_idx on public.kb_chat_logs(had_answer) where had_answer = false;

-- ─── RLS ────────────────────────────────────────────────────
alter table public.kb_categories enable row level security;
alter table public.kb_articles enable row level security;
alter table public.kb_article_versions enable row level security;
alter table public.kb_chat_logs enable row level security;

-- Categories: readable by all authenticated, writable by admin/superadmin
create policy "kb_categories_read" on public.kb_categories for select to authenticated using (true);
create policy "kb_categories_write" on public.kb_categories for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','superadmin'))
  );

-- Articles: read approved or own drafts, write by authenticated
create policy "kb_articles_read" on public.kb_articles for select to authenticated
  using (
    status = 'approved'
    or author_id = auth.uid()
    or submitted_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','superadmin'))
  );
create policy "kb_articles_insert" on public.kb_articles for insert to authenticated with check (true);
create policy "kb_articles_update" on public.kb_articles for update to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','superadmin'))
  );
create policy "kb_articles_delete" on public.kb_articles for delete to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','superadmin'))
  );

-- Versions: same as articles read
create policy "kb_versions_read" on public.kb_article_versions for select to authenticated using (true);
create policy "kb_versions_insert" on public.kb_article_versions for insert to authenticated with check (true);

-- Chat logs: own logs or admin
create policy "kb_chat_read" on public.kb_chat_logs for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','superadmin'))
  );
create policy "kb_chat_insert" on public.kb_chat_logs for insert to authenticated with check (true);

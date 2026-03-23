# Diploma Santé — Plateforme E-Learning

Remplacement complet d'ExoTeach pour la plateforme de préparation PASS/LAS de Diploma Santé.

## Stack

| Couche | Choix |
|---|---|
| Frontend | Next.js 16 (App Router, SSR) |
| DB + Auth + Storage | Supabase (PostgreSQL + RLS) |
| CSS | Tailwind CSS v4 |
| Language | TypeScript |
| PDF viewer | react-pdf + pdfjs-dist |
| Icons | lucide-react |

## Rôles

4 rôles distincts : `superadmin`, `admin`, `prof`, `eleve`
Enforced via RLS Supabase + middleware Next.js.

## Couleurs

- Navy : `#241E3F`
- Gold : `#E3C286`

## Setup local

```bash
npm install
```

Créer `.env.local` à la racine :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
```

```bash
npm run dev
```

## Base de données

Les migrations SQL sont dans `supabase/migrations/` :

- `001_initial_schema.sql` — Auth, profiles, rôles
- `002_content_schema.sql` — Contenu complet (cours, questions, tracking, examens, etc.)

Exécuter dans cet ordre dans Supabase → SQL Editor.

## Structure

```
src/
  app/
    (auth)/login, register
    (eleve)/dashboard, cours, serie/[id]
    (admin)/admin/dashboard, pedagogie, utilisateurs...
  components/
    cours/       — ArborescenceCours, CoursCard, PdfViewer, SeriesList, ModuleRevisions
    qcm/         — QcmPlayer (setup → playing → results)
    sidebar/     — StudentSidebar, AdminSidebar
    header.tsx
  lib/supabase/  — client, server, middleware
  types/         — database.ts (tous les types TypeScript)
  middleware.ts  — routing multi-rôles
supabase/migrations/
```

## Phases

- **Phase 1** ✅ — Auth, cours (PDF + QCM + révisions), dashboards élève + admin
- **Phase 2** — Générateur d'entraînement, concours blancs chronométrés
- **Phase 3** — Forum, annonces TipTap, planning/agenda
- **Phase 4** — Admin CRUD contenu/users, bulletins de notes, absences
- **Phase 5** — IA, Stripe abonnements, gamification
- **Phase 6** — Script scraping ExoTeach (migration données)

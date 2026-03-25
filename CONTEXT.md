# CONTEXT — ExoTeach BIS

> Ce fichier est mis à jour à chaque décision, modification de fichier, ou étape complétée.
> **À lire en début de chaque conversation.**

---

## Projet

- **Nom** : ExoTeach BIS — plateforme e-learning de prépa médecine (PASS/LAS) pour Diploma Santé
- **URL prod** : https://exoteachbis.vercel.app
- **Repo GitHub** : https://github.com/benjaminhaddad-max/EXOTEACHBIS (branche `main`)
- **Repo local** : `/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/EXOTEACHBIS-main`
- **Stack** : Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9, Supabase (PostgreSQL + Storage + Auth + RLS), Vercel, TailwindCSS v4 (config dans CSS, pas de tailwind.config.js)
- **Déploiement** : Push → GitHub `main` → auto-deploy Vercel (Production)
- **Couleurs** : Navy `#241E3F`, Gold `#E3C286`
- **Rôles** : `superadmin`, `admin`, `prof`, `eleve` — enforced via RLS Supabase + middleware Next.js

### Outils CLI configurés
- **GitHub CLI** (`~/bin/gh`) : authentifié compte `benjaminhaddad-max`
- **Vercel CLI** : authentifié compte `benjaminhaddad-max`
- **Node** : v20.20.1 via nvm (`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` requis avant npm/npx)

### Dépendances notables
- `@supabase/supabase-js` + `@supabase/ssr` (auth, DB, storage)
- `react-pdf` + `pdfjs-dist` (viewer PDF)
- `katex` (rendu LaTeX/maths)
- `@anthropic-ai/sdk` (IA - réponses Q&A)
- `@dnd-kit/*` (drag & drop)
- `lucide-react` (icônes)
- `docx` + `mammoth` (documents)
- `clsx` + `tailwind-merge` (utilitaires CSS)

---

## Architecture du projet

```
src/
  app/
    (auth)/           — login, register
    (eleve)/          — dashboard, cours, cours/[coursId], serie/[serieId],
                        exercices, flashcards, examens, examens/[examenId]/resultats,
                        forum, annonces, notifications, profil, progression, agenda, equipe
    (admin)/admin/    — dashboard, pedagogie, cours/[coursId], utilisateurs,
                        exercices, examens, examens/[examenId]/resultats,
                        examens/coefficients, flashcards, annonces, planning,
                        configuration, aide, abonnements, questions-reponses
    api/              — import-exoteach, generate-questions, upload-pdf,
                        upload-image, export-serie, qa/upload-media, qa/ai-respond...
  components/
    admin/            — pédagogie, cours, examens (examens-shell, coefficients-shell,
                        resultats-shell), exercices, flashcards, QA, annonces
    auth/             — login-form, register-form
    cours/            — arborescence, cartes, PDF, séries, révisions, ressources
    qcm/              — qcm-player
    qa/               — chat, drawer, bulles, médias, voix, indicateurs, FAB
    sidebar/          — student-sidebar, admin-sidebar
    ui/               — math-text, composants réutilisables
    dashboard/, eleve/, forum/, profil/, header, notifications-shell, flashcard-player
  lib/
    supabase/         — client.ts, server.ts, middleware.ts
    qa/               — contexte, deep links, upload médias
    upload-pdf.ts, upload-image.ts, utils.ts
  hooks/              — use-user, use-qa-realtime, use-qa-unread-count, use-voice-recorder
  types/              — database.ts, qa.ts
supabase/
  migrations/         — 001 à 012 (schema, contenu, flashcards, QCM, QA, examens coefficients/filières)
  seed.sql
scripts/              — scrape-exoteach.mjs, seed-serie-418.mjs
```

---

## État actuel — Ce qui fonctionne

- Panel admin Pédagogie (`/admin/pedagogie`) avec arborescence dossiers + CoursDetailPanel (PDF + sidebar séries/questions)
- Viewer PDF centré avec bouton téléchargement
- Éditeur de série (SerieEditorModal) : affiche les questions, permet ajout/retrait depuis la banque
- Œil 👁️ sur chaque série = ouvre `/serie/[id]` en nouvel onglet avec bandeau "Vue élève — Retour à la pédagogie"
- QCM player élève (`/serie/[serieId]`) : sidebar numérotée, cartes exercice avec badges cours + type, checkboxes A-E, LaTeX via KaTeX, résultats avec corrections
- Import ExoTeach via GraphQL (Apollo client) avec scraping DOM pour les images (canvas base64)
- Système Q&A temps réel avec médias, réponses IA (Anthropic), enregistrement vocal
- Flashcards (decks, player)
- Forum, annonces, planning, notifications
- Profil, progression, agenda
- Espace admin complet (utilisateurs, exercices, examens, flashcards, configuration, abonnements)
- **Système d'examens enrichi** :
  - Séries avec coefficients (×0.5 à ×10)
  - Toggle résultats visibles/masqués
  - Notation configurable (/20, /100, etc.)
  - Filières de santé (Médecine, Dentaire, Pharmacie, Maïeutique, Kinésithérapie)
  - Coefficients matière × filière configurables
  - Page résultats admin : classement, moyennes, stats, export CSV, filtre par filière
  - Page résultats élève : score personnel, classement, détail par série

---

## Règles critiques

- **Ne jamais utiliser** `nb_questions:series_questions(count)` ni `series(id, type, series_questions(count))` dans les selects Supabase — cela casse tout silencieusement avec une erreur 400.
  - **Pourquoi** : Bug racine résolu — `series_questions(count)` dans les selects Supabase faisait disparaître tous les cours/séries après deploy. Supprimé dans 4 fichiers.
- **Base de données** : pas de Prisma — le schéma vit dans les migrations SQL sous `supabase/migrations/`. Toute modification de schéma = nouveau fichier de migration.
- **Tailwind v4** : la config est dans `src/app/globals.css` via `@theme`, pas dans un fichier `tailwind.config.js`.
- **Migration 012** : doit être exécutée en prod pour activer le système examens enrichi (filières, coefficients, résultats).

---

## Tâches en attente

1. [ ] Affichage du profil admin dans la sidebar élève (montrait "?" + "Élève")
2. [ ] Sidebar arborescence redimensionnable (drag handle)
3. [x] Import ExoTeach : bouton "ExoTeach" dans le panel admin → modal IDs → import automatique via GraphQL
4. [x] Images ExoTeach : scraping DOM via canvas base64, stockage dans `image_url`
5. [ ] Upload d'image dans les questions/options QCM (bucket `question-images` créé, colonnes `image_url` ajoutées)
6. [ ] Rendu LaTeX automatique dans les QCMs (MathText component existe)
7. [x] Système Q&A temps réel (migration 011, composants qa/, hooks realtime)
8. [x] Système examens enrichi avec coefficients, filières, résultats (migration 012)
9. [ ] Exécuter migration 012 en production Supabase (SQL Editor ou `DATABASE_URL` + `npm run migrate:012`)

---

## Fichiers clés

| Rôle | Chemin |
|------|--------|
| Server actions admin | `src/app/(admin)/admin/pedagogie/actions.ts` |
| Panel admin pédagogie | `src/components/admin/pedagogie/cours-detail-panel.tsx` |
| Import ExoTeach API | `src/app/api/import-exoteach/route.ts` |
| Import ExoTeach Modal | `src/components/admin/pedagogie/import-exoteach-modal.tsx` |
| QCM Player | `src/components/qcm/qcm-player.tsx` |
| Page série élève | `src/app/(eleve)/serie/[serieId]/page.tsx` |
| Page cours élève | `src/app/(eleve)/cours/[coursId]/page.tsx` |
| Sidebar élève | `src/components/sidebar/student-sidebar.tsx` |
| Sidebar admin | `src/components/sidebar/admin-sidebar.tsx` |
| Q&A drawer | `src/components/qa/ask-question-drawer.tsx` |
| Q&A AI respond | `src/app/api/qa/ai-respond/route.ts` |
| Middleware auth | `src/lib/supabase/middleware.ts` |
| Types DB | `src/types/database.ts` |
| Types QA | `src/types/qa.ts` |
| Hooks user | `src/hooks/use-user.ts` |
| Hooks QA realtime | `src/hooks/use-qa-realtime.ts` |
| Globals CSS (thème) | `src/app/globals.css` |
| **Examens admin shell** | `src/components/admin/examens/examens-shell.tsx` |
| **Examens actions** | `src/app/(admin)/admin/examens/actions.ts` |
| **Coefficients filières** | `src/components/admin/examens/coefficients-shell.tsx` |
| **Résultats admin** | `src/components/admin/examens/resultats-shell.tsx` |
| **Examens élève** | `src/app/(eleve)/examens/page.tsx` |
| **Résultats élève** | `src/app/(eleve)/examens/[examenId]/resultats/page.tsx` |
| **Migration examens** | `supabase/migrations/012_examens_coefficients_filieres.sql` |

---

## Schéma DB examens (migration 012)

### Tables créées
- `filieres` : Médecine, Dentaire, Pharmacie, Maïeutique, Kinésithérapie (+ CRUD admin)
- `matiere_coefficients` : poids de chaque matière pour chaque filière (ex: Anatomie ×3 pour MED, ×1 pour PHAR)
- `examen_results` : score global par élève par examen (score_raw, score_20, nb_series_done)
- `examen_serie_results` : détail par série dans un examen

### Colonnes ajoutées
- `examens_series.coefficient` : poids de chaque série dans un examen (numeric 4,2, défaut 1)
- `examens.results_visible` : toggle admin pour rendre les résultats visibles aux élèves
- `examens.notation_sur` : notation configurable (défaut 20)
- `examens.created_by` : qui a créé l'examen
- `profiles.filiere_id` : filière de l'élève

### RLS activée sur
- `filieres`, `matiere_coefficients`, `examens_series`, `examens_groupes`, `examen_results`, `examen_serie_results`

---

## Journal des modifications

| Date | Fichier(s) | Description |
|------|------------|-------------|
| 2026-03-24 | `CONTEXT.md` | Création du fichier de contexte projet |
| 2026-03-24 | `cours-detail-panel.tsx` | Suppression preview QCM dans la sidebar — questions cliquables pour éditer, pas d'expansion |
| 2026-03-24 | `cours-detail-panel.tsx` | Série cliquable pour ouvrir l'éditeur (SerieEditorModal) directement |
| 2026-03-24 | `serie/[serieId]/page.tsx` | Suppression `user!.id` → ajout vérification null + redirect si session expirée |
| 2026-03-24 | `middleware.ts` | Suppression redirect admin→/admin/dashboard sur routes élève — les admins peuvent naviguer librement les deux interfaces |
| 2026-03-24 | `cours-detail-panel.tsx` | Sidebar séries : cliquer sur une série = lancer en vue élève (nouvel onglet). Section "Questions" supprimée. Crayon = ouvrir SerieEditorModal. |
| 2026-03-24 | `cours-detail-panel.tsx` | Fix spinner infini SerieEditorModal : ajout try/finally sur loadSerieQ + alias `question:questions` pour la query Supabase |
| 2026-03-24 | `exercices/actions.ts` | Fix dossier vide : cours peut avoir dossier_id direct OU matiere_id→dossier_id — les deux cas sont maintenant gérés |
| 2026-03-25 | `import-exoteach/route.ts`, modal, panel | Import ExoTeach : bouton dans panel admin → modal IDs → auth auto via signIn GraphQL → import direct Supabase |
| 2026-03-25 | Multiples fichiers import | Images ExoTeach : évolution scraping DOM → canvas base64, matching Y-position, deep clone objets Apollo |
| 2026-03-25 | Système Q&A complet | Q&A temps réel avec médias, IA (Anthropic), migration 011, composants drawer/chat/FAB |
| 2026-03-25 | `CONTEXT.md` | Mise à jour complète : architecture, dépendances, fichiers clés, état actuel, règles |
| 2026-03-25 | Migration 012 | Système examens enrichi : filières, coefficients matière×filière, coefficients série, résultats, notation configurable |
| 2026-03-25 | `types/database.ts` | Ajout types Filiere, MatiereCoefficient, ExamenSerie, ExamenResult, ExamenSerieResult + enrichissement Examen et Profile |
| 2026-03-25 | `admin/examens/actions.ts` | CRUD enrichi : coefficients, toggle résultats, filières, matiere_coefficients, getExamenResults |
| 2026-03-25 | `examens-shell.tsx` | Refonte complète : coefficients par série, toggle résultats, lien résultats détaillés, notation_sur |
| 2026-03-25 | `coefficients-shell.tsx` | Nouveau : grille matière × filière pour configurer les coefficients + CRUD filières |
| 2026-03-25 | `resultats-shell.tsx` | Nouveau : classement admin avec stats, moyennes par série, filtre filière, export CSV |
| 2026-03-25 | `examens/page.tsx` (élève) | Refonte : scores pondérés, coefficients affichés, lien classement, card score |
| 2026-03-25 | `examens/[examenId]/resultats/page.tsx` (élève) | Nouveau : classement élève, score personnel, détail par série, rang |
| 2026-03-25 | `scripts/run-migration-012.cjs`, `package.json`, `.env.example` | Script migration 012 via `DATABASE_URL` (navigateur Cursor ≠ session Supabase connectée ; pas d’accès SQL sans URI Postgres) |

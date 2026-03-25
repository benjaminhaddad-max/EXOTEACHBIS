# CONTEXT — ExoTeach BIS

> Ce fichier est mis à jour à chaque décision, modification de fichier, ou étape complétée.
> À lire en début de chaque conversation.

---

## Projet

- **Nom** : ExoTeach BIS — plateforme de prépa médecine
- **URL prod** : https://exoteachbis.vercel.app
- **Repo GitHub** : https://github.com/benjaminhaddad-max/EXOTEACHBIS (branche `main`)
- **Repo local** : `/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/EXOTEACHBIS-main`
- **Stack** : Next.js 16 (App Router, Turbopack), React 19, Supabase (PostgreSQL + Storage + Auth), Vercel, TailwindCSS 4
- **Déploiement** : Push → GitHub `main` → auto-deploy Vercel (Production)

### Outils CLI configurés
- **GitHub CLI** (`~/bin/gh`) : authentifié compte `benjaminhaddad-max`
- **Vercel CLI** : authentifié compte `benjaminhaddad-max`
- **Node** : v20.20.1 via nvm (`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` requis avant npm/npx)

---

## État actuel — Ce qui fonctionne

- Panel admin Pédagogie (`/admin/pedagogie`) avec arborescence dossiers + CoursDetailPanel (PDF + sidebar séries/questions)
- Viewer PDF centré avec bouton téléchargement
- Éditeur de série (SerieEditorModal) : affiche les 5 questions, permet ajout/retrait depuis la banque
- Œil 👁️ sur chaque série = ouvre `/serie/[id]` en nouvel onglet avec bandeau "Vue élève — Retour à la pédagogie"
- QCM player élève (`/serie/[serieId]`) : sidebar numérotée, cartes exercice avec badges cours + type, checkboxes A-E, LaTeX via KaTeX, résultats avec corrections
- Série "Atomistique #1" : 5 questions scrapées depuis ExoTeach série 418, avec justifications

---

## Règles critiques

- **Ne jamais utiliser** `nb_questions:series_questions(count)` ni `series(id, type, series_questions(count))` dans les selects Supabase — cela casse tout silencieusement avec une erreur 400.
  - **Pourquoi** : Bug racine résolu — `series_questions(count)` dans les selects Supabase faisait disparaître tous les cours/séries après deploy. Supprimé dans 4 fichiers.

---

## Tâches en attente

1. [ ] Affichage du profil admin dans la sidebar élève (montrait "?" + "Élève")
2. [ ] Sidebar arborescence redimensionnable (drag handle)
3. [x] Import ExoTeach : bouton "ExoTeach" dans le panel admin → modal IDs → import automatique via GraphQL (medibox2-api/graphql, mutation signIn)
4. [ ] Upload d'image dans les questions/options QCM (bucket `question-images` créé, colonnes `image_url` ajoutées)
5. [ ] Rendu LaTeX automatique dans les QCMs (MathText component existe)

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
| 2026-03-25 | `import-exoteach/route.ts`, `import-exoteach-modal.tsx`, `cours-detail-panel.tsx` | Import ExoTeach : bouton dans panel admin → modal IDs → auth auto via signIn GraphQL → import direct Supabase. Credentials dans .env.local (EXOTEACH_LOGIN / EXOTEACH_PASSWORD). API : medibox2-api/graphql, query `qcm(id)`, champs questions→answers. |

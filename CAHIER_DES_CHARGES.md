# CAHIER DES CHARGES — EXOTEACH (Diploma Santé)
> Plateforme e-learning PASS/LAS — Refonte complète
> Dernière mise à jour : Mars 2026

---

## 1. CONTEXTE & ÉTAT ACTUEL

### Ce qui est déjà fait (Phase 1 ✅)
| Fonctionnalité | Statut | Détail |
|---|---|---|
| Auth (login/register) | ✅ | Supabase Auth + trigger profil auto |
| Dashboard étudiant | ✅ | Stats, derniers cours, dernières séries |
| Arborescence cours | ✅ | Dossiers > Matières > Cours |
| Viewer PDF | ✅ | react-pdf, progression, sauvegarde page |
| Moteur QCM | ✅ | Setup > Playing > Results, timer, correction |
| Module révisions | ✅ | Mode 1 par 1 et liste |
| Dashboard admin | ✅ | 8 stats en temps réel |
| Middleware rôles | ✅ | superadmin / admin / prof / eleve |
| Schéma DB complet | ✅ | 14 tables, RLS, indexes |
| Déploiement Vercel | ✅ | exoteachbis.vercel.app |

### Ce qui reste à faire (Phases 2–7)
| Module | Côté | Priorité |
|---|---|---|
| Gestion pédagogie (CRUD contenu) | Admin | 🔴 P1 |
| Gestion QCM (CRUD questions/séries) | Admin | 🔴 P1 |
| Upload PDF (Supabase Storage) | Admin | 🔴 P1 |
| Gestion utilisateurs & groupes | Admin | 🔴 P1 |
| Page Exercices étudiant | Élève | 🟠 P2 |
| Examens blancs chronométrés | Élève + Admin | 🟠 P2 |
| Profil étudiant | Élève | 🟠 P2 |
| Forum / Questions-Réponses | Élève + Admin | 🟡 P3 |
| Agenda / Calendrier | Élève + Admin | 🟡 P3 |
| Équipe pédagogique | Élève | 🟡 P3 |
| Abonnements Stripe | Admin + Élève | 🔵 P4 |
| Gestion absences | Admin + Prof | 🔵 P4 |
| Configuration plateforme | Admin | 🔵 P4 |
| Notifications | Global | 🔵 P4 |

---

## 2. ARCHITECTURE TECHNIQUE

```
Stack:
- Frontend : Next.js 16 (App Router, SSR)
- DB + Auth : Supabase (PostgreSQL + RLS)
- Storage : Supabase Storage (PDFs)
- Style : Tailwind CSS v4
- Déploiement : Vercel
- Couleurs : Navy #241E3F + Gold #E3C286

Rôles:
- superadmin : accès total
- admin      : gestion contenu + utilisateurs
- prof       : visualisation avancée + gestion events
- eleve      : consommation cours + exercices
```

---

## 3. PHASE 2 — ADMIN PÉDAGOGIE (CRUD CONTENU)

### 3.1 Page `/admin/pedagogie`
Interface de gestion de l'arborescence complète des cours.

**Fonctionnalités :**

#### Gestion des Dossiers
- Créer / modifier / supprimer un dossier
- Définir : nom, description, couleur, icône, ordre
- Activer/désactiver la visibilité (toggle `visible`)
- Nesting infini (dossier dans dossier via `parent_id`)
- Drag & drop pour réordonner (`order_index`)

#### Gestion des Matières
- Créer / modifier / supprimer une matière dans un dossier
- Définir : nom, description, couleur, icône
- Activer/désactiver la visibilité
- Réordonner par drag & drop

#### Gestion des Cours
- Créer / modifier / supprimer un cours dans une matière
- Définir : nom, description, tags, version
- **Upload PDF** vers Supabase Storage
  - Bucket : `cours-pdfs`
  - Path : `{matiere_id}/{cours_id}/v{version}.pdf`
  - Générer URL signée ou publique
  - Afficher nb_pages après upload
- Activer/désactiver la visibilité

**UI :**
- Panel gauche : arborescence en accordéon (Dossiers > Matières)
- Panel droit : liste des cours de la matière sélectionnée
- Modal de création/édition pour chaque entité
- Confirmation avant suppression
- Toast de succès/erreur

**Tables Supabase :** `dossiers`, `matieres`, `cours`
**Storage :** bucket `cours-pdfs`

---

### 3.2 Page `/admin/exercices`
Interface de création et gestion des QCM.

**Fonctionnalités :**

#### Banque de Questions
- Créer / modifier / supprimer une question
- Champs : texte, type (unique/multiple), explication, difficulté (1-5), tags
- Associer à un cours ou une matière
- Ajouter 2 à 5 options (A-E) avec texte + toggle `is_correct`
- Validation : au moins 1 option correcte

#### Gestion des Séries
- Créer / modifier / supprimer une série
- Champs : nom, description, type, chronométré, durée, score_définitif
- **Composer la série** : sélectionner des questions depuis la banque
  - Filtre par cours / matière / tags / difficulté
  - Drag & drop pour ordonner les questions
- Activer/désactiver la visibilité

**UI :**
- Onglets : "Banque de questions" | "Séries d'exercices"
- Table paginée des questions avec filtres et recherche
- Formulaire de création de question avec preview
- Interface de composition de série (deux colonnes : disponible | sélectionné)

**Tables Supabase :** `questions`, `options`, `series`, `series_questions`

---

## 4. PHASE 2 — ADMIN UTILISATEURS

### 4.1 Page `/admin/utilisateurs`

**Fonctionnalités :**

#### Liste des utilisateurs
- Table paginée (50/page) avec colonnes : nom, email, rôle, groupe, inscription, dernière connexion
- Filtres : rôle, groupe, statut abonnement
- Recherche par nom/email
- Export CSV

#### Actions sur un utilisateur
- Modifier le rôle (eleve / prof / admin / superadmin)
- Assigner/retirer d'un groupe
- Voir les stats : nb cours vus, score moyen, temps total
- Suspendre / réactiver le compte
- Réinitialiser le mot de passe (via Supabase Auth admin API)

#### Gestion des Groupes
- Créer / modifier / supprimer un groupe
- Champs : nom, année, description, couleur
- Ajouter/retirer des membres (étudiants et profs)
- Voir les stats du groupe

**Tables Supabase :** `profiles`, `groupes`, `groupe_members`
**API :** Supabase Admin API (service role) pour gestion Auth

---

## 5. PHASE 2 — CÔTÉ ÉLÈVE : EXERCICES

### 5.1 Page `/exercices`
Page de découverte et lancement des exercices disponibles.

**Fonctionnalités :**
- **Filtres** : par matière, par type (entrainement/concours_blanc/revision), chronométré ou non
- **Recherche** par nom de série
- **Cards de séries** affichant :
  - Nom, type, nb questions, durée si chrono
  - Score de la dernière tentative (si déjà tenté)
  - Statut : "Nouveau" / "En cours" / "Terminé"
  - Bouton "Démarrer" ou "Recommencer"
- **Historique** : onglet avec les 20 dernières tentatives (date, série, score, temps)

**Tables Supabase :** `series`, `serie_attempts`, `series_questions` (count)

---

## 6. PHASE 2 — CÔTÉ ÉLÈVE : PROFIL

### 6.1 Page `/profil`

**Fonctionnalités :**

#### Informations personnelles
- Modifier : prénom, nom, photo de profil (upload vers Storage)
- Affichage email (non modifiable, géré par Auth)
- Modifier le mot de passe via Supabase Auth

#### Statistiques personnelles
- Total cours consultés / terminés
- Score moyen global et par matière
- Temps total passé sur la plateforme (estimé via série_attempts.time_spent_s)
- Graphique de progression sur les 30 derniers jours

#### Abonnement
- Plan actuel, date d'expiration
- Bouton "Gérer mon abonnement" (redirige vers portail Stripe)

**Tables Supabase :** `profiles`, `user_progress`, `serie_attempts`, `abonnements`

---

## 7. PHASE 3 — EXAMENS BLANCS

### 7.1 Admin : Gestion des Examens (`/admin/exercices` onglet Examens)

**Fonctionnalités :**
- Créer un examen avec : nom, description, date début, date fin
- Associer des séries à l'examen (`examens_series`)
- Assigner des groupes à l'examen (`examens_groupes`)
- Activer/désactiver l'examen

### 7.2 Élève : Page `/examens`

**Fonctionnalités :**
- Afficher les examens assignés au groupe de l'élève
- Statut de chaque examen : "À venir" / "En cours" / "Terminé"
- Pour les examens "En cours" : bouton "Accéder à l'examen"
- **Passage d'examen** (réutilise le QCM Player existant en mode `timed`)
  - Compte à rebours global (fin_at - now())
  - Soumission automatique à l'expiration
  - Une seule tentative autorisée si `score_definitif = true`
- Résultats après clôture

**Tables Supabase :** `examens`, `examens_series`, `examens_groupes`, `serie_attempts`

---

## 8. PHASE 3 — FORUM

### 8.1 Page `/forum`

**Fonctionnalités :**

#### Liste des discussions
- Onglets : "Toutes" | "Mes questions" | "Annonces"
- Filtres par matière / cours
- Recherche dans les titres/contenus
- Tri : récent / populaire / non répondu

#### Créer une question
- Titre, contenu riche (TipTap éditeur → `content_json`)
- Associer à un cours ou une matière
- Tags optionnels

#### Thread de discussion
- Question principale + réponses imbriquées (`parent_id`)
- Markdown/rich text via TipTap
- Like/utile (non en DB actuellement, à ajouter)
- Marquer comme résolu
- Épingler (admin/prof uniquement)

#### Annonces
- Créées uniquement par admin/prof (type = 'annonce')
- Épinglées en haut de liste
- Notification email optionnelle

**Tables Supabase :** `posts` (type: annonce/forum_question/forum_reply)

---

## 9. PHASE 3 — AGENDA

### 9.1 Page `/agenda` (Élève)

**Fonctionnalités :**
- Calendrier mensuel (FullCalendar ou custom)
- Affichage des events du groupe de l'élève
- Types d'events avec couleurs : cours (bleu), examen (rouge), réunion (orange), autre (gris)
- Vue semaine et mois
- Clic sur un event : détail (titre, description, lieu/zoom, durée)
- Lien Zoom si fourni

### 9.2 Admin/Prof : Gestion Planning (`/admin/planning`)

**Fonctionnalités :**
- Vue calendrier + liste
- Créer / modifier / supprimer un event
- Champs : titre, description, start_at, end_at, type, groupe, zoom_link, lieu
- Assigner à un ou plusieurs groupes
- Export iCal (optionnel)

**Tables Supabase :** `events`, `groupes`

---

## 10. PHASE 3 — ÉQUIPE PÉDAGOGIQUE

### 10.1 Page `/equipe`

**Fonctionnalités :**
- Liste des profs du projet (profiles avec role = 'prof')
- Card par prof : photo, nom, matières enseignées
- Accès aux groupes (si l'étudiant partage un groupe avec le prof)
- Section "Mes camarades" : liste des étudiants du même groupe (noms + avatars, pas d'email)

**Tables Supabase :** `profiles`, `groupe_members`, `groupes`

---

## 11. PHASE 4 — ABONNEMENTS STRIPE

### 11.1 Admin : Page `/admin/abonnements`

**Fonctionnalités :**
- Vue globale : nb abonnés par plan, MRR estimé
- Table des abonnements actifs/annulés/en retard
- Lien vers dashboard Stripe pour chaque abonnement
- Créer un coupon de réduction (via Stripe API)

### 11.2 Webhooks Stripe
- `customer.subscription.created` → update `abonnements.status = 'active'`
- `customer.subscription.deleted` → update `abonnements.status = 'cancelled'`
- `invoice.payment_failed` → update `abonnements.status = 'past_due'`

**Route API :** `/api/webhooks/stripe`

### 11.3 Gating du contenu
- Vérification `abonnements.status = 'active'` avant accès aux cours
- Page de souscription si pas d'abonnement actif
- Intégration Stripe Checkout (3 plans : mensuel/trimestriel/annuel)

---

## 12. PHASE 4 — CONFIGURATION PLATEFORME

### 12.1 Page `/admin/configuration`

**Fonctionnalités :**
- Nom de la plateforme, logo, couleurs primaires
- Email de support
- Paramètres d'inscription (ouverte / sur invitation / désactivée)
- Paramètres email (SMTP ou Supabase email)
- Intégrations : clé Stripe publique/secrète (stockées en env vars)
- Maintenance mode (toggle global)

---

## 13. PLAN D'IMPLÉMENTATION

### Sprint 1 — Admin Pédagogie + Upload PDF (2 sem)
1. Page `/admin/pedagogie` : CRUD dossiers/matières
2. Upload PDF vers Supabase Storage
3. CRUD cours avec PDF viewer preview
4. Mise à jour types TS

### Sprint 2 — Admin QCM (2 sem)
1. Page `/admin/exercices` : Banque de questions CRUD
2. Gestion des options (A-E) inline
3. Création/édition de séries
4. Compositeur de série (drag & drop)

### Sprint 3 — Admin Utilisateurs + Groupes (1 sem)
1. Table utilisateurs avec filtres
2. Modification rôle + groupe via Supabase Admin API
3. CRUD groupes + ajout/retrait membres
4. Stats par utilisateur

### Sprint 4 — Élève Exercices + Profil (1 sem)
1. Page `/exercices` : liste filtrée + historique
2. Page `/profil` : édition infos + stats perso

### Sprint 5 — Examens (1 sem)
1. Admin : création examens + assignation groupes
2. Élève : page `/examens` + passage examen (réutilise QCM Player)

### Sprint 6 — Forum (1.5 sem)
1. Page `/forum` : liste posts, filtres, recherche
2. Création question (TipTap)
3. Thread de réponses
4. Annonces admin/prof

### Sprint 7 — Agenda + Équipe (1 sem)
1. Calendrier étudiant (events du groupe)
2. Admin/Prof : CRUD events
3. Page `/equipe` : profs + camarades

### Sprint 8 — Stripe + Config (2 sem)
1. Intégration Stripe Checkout (3 plans)
2. Webhooks Stripe
3. Gating du contenu
4. Page `/admin/abonnements`
5. Page `/admin/configuration`

---

## 14. PAGES À CRÉER — RÉCAPITULATIF

### Côté Élève (6 pages)
| Route | Priorité | Sprint |
|---|---|---|
| `/exercices` | P2 | S4 |
| `/examens` | P2 | S5 |
| `/profil` | P2 | S4 |
| `/forum` | P3 | S6 |
| `/agenda` | P3 | S7 |
| `/equipe` | P3 | S7 |

### Côté Admin (7 pages)
| Route | Priorité | Sprint |
|---|---|---|
| `/admin/pedagogie` | P1 | S1 |
| `/admin/exercices` | P1 | S2 |
| `/admin/utilisateurs` | P1 | S3 |
| `/admin/examens` (dans exercices) | P2 | S5 |
| `/admin/planning` | P3 | S7 |
| `/admin/abonnements` | P4 | S8 |
| `/admin/configuration` | P4 | S8 |

---

## 15. COMPOSANTS RÉUTILISABLES À CRÉER

```
src/components/
├── ui/
│   ├── data-table.tsx        # Table paginée avec tri/filtre
│   ├── modal.tsx             # Modal générique
│   ├── toast.tsx             # Notifications toast
│   ├── file-upload.tsx       # Upload vers Supabase Storage
│   ├── rich-text-editor.tsx  # TipTap éditeur riche
│   └── calendar.tsx          # Calendrier (agenda)
├── admin/
│   ├── content-tree.tsx      # Arborescence drag & drop
│   ├── question-form.tsx     # Formulaire question + options
│   ├── serie-composer.tsx    # Compositeur de série
│   └── user-table.tsx        # Table utilisateurs
└── forum/
    ├── post-card.tsx         # Card de post/question
    ├── post-thread.tsx       # Thread de réponses
    └── post-editor.tsx       # Éditeur de post
```

---

## 16. NOUVELLES TABLES / MODIFICATIONS DB

### Modifications nécessaires
```sql
-- Ajouter à profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path text; -- chemin Storage

-- Ajouter table reactions forum (phase 3)
CREATE TABLE post_reactions (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text CHECK (type IN ('like', 'utile')),
  PRIMARY KEY (post_id, user_id, type)
);

-- Ajouter table notifications (phase 4)
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'new_cours', 'new_examen', 'forum_reply', etc.
  title text NOT NULL,
  body text,
  read boolean DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);
```

---

## 17. SUPABASE STORAGE — BUCKETS

```
cours-pdfs/          (privé - URLs signées)
  └── {matiere_id}/
      └── {cours_id}/
          └── v{version}.pdf

avatars/             (public)
  └── {user_id}/
      └── avatar.{ext}
```

---

## 18. VARIABLES D'ENVIRONNEMENT CIBLES

```env
# Existant
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# À ajouter
SUPABASE_SERVICE_ROLE_KEY=      # Pour admin API (server only)
STRIPE_SECRET_KEY=               # Stripe server
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=   # Stripe client
STRIPE_WEBHOOK_SECRET=           # Validation webhooks
```

---

## 19. PRIORITÉS ABSOLUES POUR DÉMARRER

1. **Contenu** : sans pédagogie admin, pas de cours = plateforme vide
   → Sprint 1 & 2 en priorité absolue

2. **Utilisateurs** : sans gestion des comptes, impossible d'onboarder des élèves
   → Sprint 3 juste après

3. **Exercices** : le cœur du PASS/LAS, le QCM player existe, il faut juste exposer les séries
   → Sprint 4

4. **Tout le reste** : forum, agenda, Stripe — quand le core fonctionne

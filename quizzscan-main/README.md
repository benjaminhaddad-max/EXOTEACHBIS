# QuizzScan

Outil de correction automatique d'épreuves blanches QCM (OMR).

## Stack
- **Backend** : Python 3.11 + FastAPI + SQLAlchemy + OpenCV
- **Base de données** : PostgreSQL (Render) / SQLite (dev local)
- **Stockage** : Disque persistant Render (grilles PDF, scans, exports)
- **Frontend** : React 18 + Vite (servi par FastAPI en production)

---

## Lancer en local

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend (dans un autre terminal)
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Le frontend proxifie `/api` → `http://localhost:8000` automatiquement.

---

## Déployer sur Render

1. **Pousser sur GitHub** :
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/TON_USER/quizzscan.git
git push -u origin main
```

2. **Sur render.com** :
   - New → **Blueprint**
   - Pointer sur votre repo GitHub
   - Render détecte `render.yaml` et crée automatiquement :
     - Le service web Python (backend + frontend buildé)
     - La base PostgreSQL gratuite
     - Le disque persistant 5 Go

3. **Variables d'environnement** (déjà dans render.yaml, rien à faire) :
   - `DATABASE_URL` → injectée depuis la BDD Render
   - `STORAGE_DIR` → `/var/data/storage`
   - `ALLOWED_ORIGINS` → à ajuster si besoin avec votre URL

---

## Structure

```
quizzscan/
├── backend/
│   ├── main.py                  # FastAPI + serving frontend statique
│   ├── database.py              # SQLAlchemy (SQLite dev / PostgreSQL prod)
│   ├── models.py                # Exam, ScanSession, StudentResult, Student
│   ├── requirements.txt
│   ├── routers/
│   │   ├── exams.py             # CRUD épreuves + génération PDF
│   │   ├── scans.py             # Upload PDF, OMR, review, export Excel
│   │   ├── files.py             # Téléchargement grilles et images
│   │   └── students.py          # Base étudiants + import CSV
│   └── services/
│       ├── pdf_generator.py     # Génération grilles OMR (auto-fit 1 page)
│       ├── omr_processor.py     # Lecture optique OpenCV
│       └── excel_exporter.py    # Export format plateforme
├── frontend/
│   └── src/
│       ├── App.jsx              # Router + sidebar
│       ├── api.js               # Client Axios centralisé
│       ├── pages/
│       │   ├── Home.jsx         # Liste des épreuves
│       │   ├── CreateExam.jsx   # Création + validation
│       │   ├── ExamDetail.jsx   # Détail épreuve + upload scan
│       │   ├── ReviewPage.jsx   # Correction manuelle cases douteuses
│       │   └── StudentsPage.jsx # Annuaire + import CSV
│       └── index.css            # Design system complet
├── render.yaml                  # Blueprint déploiement Render
└── README.md
```

---

## Flux complet

```
1. Créer une épreuve  →  grille PDF générée automatiquement
2. Imprimer + faire passer l'examen
3. Scanner les copies  →  un seul PDF multi-pages
4. Uploader le PDF  →  OMR en arrière-plan
5. Review des cases douteuses  →  interface humain-dans-la-boucle
6. Télécharger le fichier Excel  →  prêt pour la plateforme
```

## Limites grille
- Avec remord : **60 questions max** sur une page A4
- Sans remord : **120 questions max** sur une page A4

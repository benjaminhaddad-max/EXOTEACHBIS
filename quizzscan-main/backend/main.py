from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from database import engine, Base
from routers import exams, scans, files, students, groups, folders

# ── Migrations + création des tables ─────────────────────────────────────────
Base.metadata.create_all(bind=engine)
try:
    from migrate import run as run_migrations
    run_migrations()
except Exception as e:
    print(f"Migration warning: {e}")

# ── Dossiers de stockage ──────────────────────────────────────────────────────
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")
for subdir in ["grids", "scans", "pages", "exports"]:
    os.makedirs(os.path.join(STORAGE_DIR, subdir), exist_ok=True)

app = FastAPI(title="QuizzScan API", version="1.0.0")

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware, allow_origins=origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

app.include_router(exams.router,    prefix="/api")
app.include_router(scans.router,    prefix="/api")
app.include_router(files.router,    prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(groups.router,   prefix="/api")
app.include_router(folders.router,  prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

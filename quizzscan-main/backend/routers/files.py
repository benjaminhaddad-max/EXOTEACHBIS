from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os

router = APIRouter(prefix="/files", tags=["files"])

STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")


@router.get("/grid/{exam_id}")
def get_grid_pdf(exam_id: int):
    path = os.path.join(STORAGE_DIR, "grids", f"exam_{exam_id}_grid.pdf")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Grille introuvable")
    return FileResponse(path, media_type="application/pdf", filename=f"grille_examen_{exam_id}.pdf")


@router.get("/page/{session_id}/{page_number}")
def get_page_image(session_id: int, page_number: int):
    path = os.path.join(STORAGE_DIR, "pages", str(session_id), f"page_{page_number:03d}.jpg")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image introuvable")
    return FileResponse(path, media_type="image/jpeg")

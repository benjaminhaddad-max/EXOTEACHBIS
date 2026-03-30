from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Folder, Exam

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FolderOut(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    exam_count: int
    child_count: int
    class Config: from_attributes = True


def _load_folder(db: Session, folder_id: int) -> dict:
    """Charge un dossier avec ses compteurs via des requêtes séparées (évite les joinedload problématiques)."""
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f:
        return None
    exam_count  = db.query(Exam).filter(Exam.folder_id == folder_id).count()
    child_count = db.query(Folder).filter(Folder.parent_id == folder_id).count()
    return {
        "id": f.id, "name": f.name, "parent_id": f.parent_id,
        "exam_count": exam_count, "child_count": child_count,
    }


@router.get("/", response_model=list[FolderOut])
def list_folders(parent_id: Optional[int] = None, db: Session = Depends(get_db)):
    if parent_id is None:
        folders = db.query(Folder).filter(Folder.parent_id.is_(None)).order_by(Folder.name).all()
    else:
        folders = db.query(Folder).filter(Folder.parent_id == parent_id).order_by(Folder.name).all()

    result = []
    for f in folders:
        exam_count  = db.query(Exam).filter(Exam.folder_id == f.id).count()
        child_count = db.query(Folder).filter(Folder.parent_id == f.id).count()
        result.append({
            "id": f.id, "name": f.name, "parent_id": f.parent_id,
            "exam_count": exam_count, "child_count": child_count,
        })
    return result


@router.get("/breadcrumb/{folder_id}")
def get_breadcrumb(folder_id: int, db: Session = Depends(get_db)):
    crumbs = []
    fid = folder_id
    while fid:
        f = db.query(Folder).filter(Folder.id == fid).first()
        if not f: break
        crumbs.insert(0, {"id": f.id, "name": f.name})
        fid = f.parent_id
    return crumbs


@router.post("/", response_model=FolderOut, status_code=201)
def create_folder(payload: FolderCreate, db: Session = Depends(get_db)):
    if payload.parent_id is not None:
        if not db.query(Folder).filter(Folder.id == payload.parent_id).first():
            raise HTTPException(404, "Dossier parent introuvable")

    # Vérifier doublon
    q = db.query(Folder).filter(Folder.name == payload.name)
    if payload.parent_id is None:
        q = q.filter(Folder.parent_id.is_(None))
    else:
        q = q.filter(Folder.parent_id == payload.parent_id)
    if q.first():
        raise HTTPException(409, "Un dossier avec ce nom existe déjà ici")

    f = Folder(name=payload.name, parent_id=payload.parent_id)
    db.add(f)
    db.commit()
    db.refresh(f)

    # Retourner via compteurs séparés (pas de joinedload)
    return {
        "id": f.id, "name": f.name, "parent_id": f.parent_id,
        "exam_count": 0, "child_count": 0,
    }


@router.patch("/{folder_id}")
def rename_folder(folder_id: int, payload: FolderCreate, db: Session = Depends(get_db)):
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f: raise HTTPException(404, "Dossier introuvable")
    f.name = payload.name
    db.commit()
    return {"ok": True}


@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f: raise HTTPException(404, "Dossier introuvable")
    db.query(Exam).filter(Exam.folder_id == folder_id).update({"folder_id": None})
    db.commit()
    db.delete(f)
    db.commit()
    return {"ok": True}


@router.patch("/{folder_id}/move")
def move_folder(folder_id: int, new_parent_id: Optional[int] = None,
                db: Session = Depends(get_db)):
    f = db.query(Folder).filter(Folder.id == folder_id).first()
    if not f: raise HTTPException(404, "Dossier introuvable")
    if new_parent_id == folder_id:
        raise HTTPException(400, "Impossible de déplacer un dossier dans lui-même")
    f.parent_id = new_parent_id
    db.commit()
    return {"ok": True}

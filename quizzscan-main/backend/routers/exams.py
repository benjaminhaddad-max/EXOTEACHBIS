from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import os

from database import get_db
from models import Exam, Group, Folder
from services.pdf_generator import generate_exam_pdf

router = APIRouter(prefix="/exams", tags=["exams"])
STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")


class GroupMini(BaseModel):
    id: int; name: str
    class Config: from_attributes = True

class FolderMini(BaseModel):
    id: int; name: str
    class Config: from_attributes = True

class ExamCreate(BaseModel):
    title: str
    institution: str
    nb_questions: int
    nb_choices: int
    has_remorse: bool = True
    group_ids: List[int] = []
    folder_id: Optional[int] = None

class ExamMove(BaseModel):
    folder_id: Optional[int] = None

class ExamOut(BaseModel):
    id: int
    title: str
    institution: str
    nb_questions: int
    nb_choices: int
    has_remorse: bool
    created_at: datetime
    has_pdf: bool
    groups: List[GroupMini] = []
    folder_id: Optional[int] = None
    folder: Optional[FolderMini] = None
    class Config: from_attributes = True


def _exam_out(exam):
    return {
        **{c.name: getattr(exam, c.name) for c in exam.__table__.columns},
        "has_pdf": bool(exam.grid_pdf_path),
        "groups": [{"id": g.id, "name": g.name} for g in exam.groups],
        "folder": {"id": exam.folder.id, "name": exam.folder.name} if exam.folder else None,
    }


@router.post("/", response_model=ExamOut)
def create_exam(payload: ExamCreate, db: Session = Depends(get_db)):
    if payload.folder_id:
        if not db.query(Folder).filter(Folder.id == payload.folder_id).first():
            raise HTTPException(404, "Dossier introuvable")

    exam = Exam(
        title=payload.title, institution=payload.institution,
        nb_questions=payload.nb_questions, nb_choices=payload.nb_choices,
        has_remorse=payload.has_remorse, folder_id=payload.folder_id,
    )
    if payload.group_ids:
        exam.groups = db.query(Group).filter(Group.id.in_(payload.group_ids)).all()

    db.add(exam); db.commit(); db.refresh(exam)

    pdf_dir  = os.path.join(STORAGE_DIR, "grids")
    pdf_path = os.path.join(pdf_dir, f"exam_{exam.id}_grid.pdf")
    try:
        generate_exam_pdf(pdf_path, exam.title, exam.institution,
                          exam.nb_questions, exam.nb_choices, exam.has_remorse)
        exam.grid_pdf_path = pdf_path
        db.commit(); db.refresh(exam)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return _exam_out(exam)


@router.get("/", response_model=list[ExamOut])
def list_exams(folder_id: Optional[int] = None, all: bool = False,
               db: Session = Depends(get_db)):
    """
    - all=true  → toutes les épreuves (recherche)
    - folder_id → épreuves dans ce dossier
    - (aucun)   → épreuves à la racine (folder_id IS NULL)
    """
    q = db.query(Exam).options(joinedload(Exam.groups), joinedload(Exam.folder))
    if not all:
        if folder_id is not None:
            q = q.filter(Exam.folder_id == folder_id)
        else:
            q = q.filter(Exam.folder_id.is_(None))
    return [_exam_out(e) for e in q.order_by(Exam.created_at.desc()).all()]


@router.get("/{exam_id}", response_model=ExamOut)
def get_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(Exam).options(joinedload(Exam.groups), joinedload(Exam.folder))\
               .filter(Exam.id == exam_id).first()
    if not exam: raise HTTPException(404, "Épreuve introuvable")
    return _exam_out(exam)


@router.patch("/{exam_id}/move")
def move_exam(exam_id: int, payload: ExamMove, db: Session = Depends(get_db)):
    """Déplace une épreuve dans un dossier (ou à la racine si folder_id=null)."""
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam: raise HTTPException(404)
    if payload.folder_id is not None:
        if not db.query(Folder).filter(Folder.id == payload.folder_id).first():
            raise HTTPException(404, "Dossier introuvable")
    exam.folder_id = payload.folder_id
    db.commit()
    return {"ok": True}


@router.patch("/{exam_id}/groups")
def update_exam_groups(exam_id: int, group_ids: List[int], db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam: raise HTTPException(404)
    exam.groups = db.query(Group).filter(Group.id.in_(group_ids)).all()
    db.commit()
    return {"ok": True}


@router.delete("/{exam_id}")
def delete_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam: raise HTTPException(404)
    db.delete(exam); db.commit()
    return {"ok": True}

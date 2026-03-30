"""
CRUD Groupes d'étudiants
- Créer / renommer / supprimer un groupe
- Ajouter / retirer des étudiants d'un groupe
- Import CSV directement dans un groupe
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
import csv, io

from database import get_db
from models import Group, Student, student_groups

router = APIRouter(prefix="/groups", tags=["groups"])


# ── Schémas ──────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str

class GroupOut(BaseModel):
    id: int
    name: str
    student_count: int
    class Config: from_attributes = True

class StudentMini(BaseModel):
    id: int
    student_number: str
    last_name: str
    first_name: str
    email: Optional[str]
    class Config: from_attributes = True


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[GroupOut])
def list_groups(db: Session = Depends(get_db)):
    groups = db.query(Group).order_by(Group.name).all()
    return [{"id": g.id, "name": g.name, "student_count": len(g.students)} for g in groups]


@router.post("/", response_model=GroupOut, status_code=201)
def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    if db.query(Group).filter(Group.name == payload.name).first():
        raise HTTPException(409, "Un groupe avec ce nom existe déjà")
    g = Group(name=payload.name)
    db.add(g); db.commit(); db.refresh(g)
    return {"id": g.id, "name": g.name, "student_count": 0}


@router.patch("/{group_id}")
def rename_group(group_id: int, payload: GroupCreate, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "Groupe introuvable")
    g.name = payload.name; db.commit()
    return {"ok": True}


@router.delete("/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "Groupe introuvable")
    db.delete(g); db.commit()
    return {"ok": True}


@router.get("/{group_id}/students", response_model=list[StudentMini])
def get_group_students(group_id: int, db: Session = Depends(get_db)):
    g = db.query(Group).options(joinedload(Group.students)).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "Groupe introuvable")
    return sorted(g.students, key=lambda s: s.last_name)


@router.post("/{group_id}/students/{student_id}")
def add_student_to_group(group_id: int, student_id: int, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "Groupe introuvable")
    s = db.query(Student).filter(Student.id == student_id).first()
    if not s: raise HTTPException(404, "Étudiant introuvable")
    if s not in g.students:
        g.students.append(s)
        db.commit()
    return {"ok": True}


@router.delete("/{group_id}/students/{student_id}")
def remove_student_from_group(group_id: int, student_id: int, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "Groupe introuvable")
    s = db.query(Student).filter(Student.id == student_id).first()
    if s and s in g.students:
        g.students.remove(s)
        db.commit()
    return {"ok": True}


@router.post("/{group_id}/import-csv")
async def import_csv_to_group(group_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Importe un CSV et ajoute les étudiants directement dans ce groupe.
    Crée les étudiants s'ils n'existent pas encore.
    """
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "Groupe introuvable")

    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    sep = ";" if text.count(";") > text.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)

    COL_MAP = {
        "numero":"student_number","number":"student_number","id":"student_number",
        "etudiant":"student_number","student_number":"student_number","identifiant":"student_number",
        "nom":"last_name","last_name":"last_name","name":"last_name",
        "prenom":"first_name","prénom":"first_name","first_name":"first_name","firstname":"first_name",
        "email":"email","mail":"email","courriel":"email",
    }

    created = added = updated = skipped = 0
    errors = []

    for row_i, row in enumerate(reader, 2):
        normalized = {}
        for raw_key, val in row.items():
            if raw_key is None: continue
            key = raw_key.strip().lower().replace(" ","").replace("_","")
            key = key.replace("é","e").replace("è","e").replace("ê","e")
            mapped = COL_MAP.get(key)
            if mapped: normalized[mapped] = (val or "").strip()

        num   = normalized.get("student_number","")
        last  = normalized.get("last_name","")
        first = normalized.get("first_name","")

        if not num:
            errors.append(f"Ligne {row_i} : numéro manquant"); skipped += 1; continue

        existing = db.query(Student).filter(Student.student_number == num).first()
        if existing:
            existing.last_name  = last  or existing.last_name
            existing.first_name = first or existing.first_name
            existing.email      = normalized.get("email") or existing.email
            updated += 1
            student = existing
        else:
            student = Student(student_number=num, last_name=last, first_name=first,
                              email=normalized.get("email") or None)
            db.add(student); db.flush()
            created += 1

        if student not in g.students:
            g.students.append(student)
            added += 1

    db.commit()
    return {"created": created, "updated": updated, "added_to_group": added,
            "skipped": skipped, "errors": errors[:20]}

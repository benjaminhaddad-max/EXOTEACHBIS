from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
import csv, io

from database import get_db
from models import Student

router = APIRouter(prefix="/students", tags=["students"])


class GroupMini(BaseModel):
    id: int; name: str
    class Config: from_attributes = True

class StudentCreate(BaseModel):
    student_number: str
    last_name: str
    first_name: str
    email: Optional[str] = None

class StudentOut(BaseModel):
    id: int
    student_number: str
    last_name: str
    first_name: str
    email: Optional[str]
    groups: list[GroupMini] = []
    class Config: from_attributes = True


@router.get("/", response_model=list[StudentOut])
def list_students(search: str = "", db: Session = Depends(get_db)):
    q = db.query(Student).options(joinedload(Student.groups))
    if search:
        s = f"%{search.lower()}%"
        q = q.filter(
            Student.last_name.ilike(s) |
            Student.first_name.ilike(s) |
            Student.student_number.ilike(s)
        )
    return q.order_by(Student.last_name).all()


@router.get("/lookup/{student_number}", response_model=Optional[StudentOut])
def lookup_student(student_number: str, db: Session = Depends(get_db)):
    return db.query(Student).options(joinedload(Student.groups))\
             .filter(Student.student_number == student_number).first()


@router.post("/", response_model=StudentOut, status_code=201)
def create_student(payload: StudentCreate, db: Session = Depends(get_db)):
    if db.query(Student).filter(Student.student_number == payload.student_number).first():
        raise HTTPException(409, "Numéro déjà existant")
    s = Student(**payload.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return s


@router.delete("/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    s = db.query(Student).filter(Student.id == student_id).first()
    if not s: raise HTTPException(404, "Introuvable")
    db.delete(s); db.commit()
    return {"ok": True}


@router.delete("/")
def delete_all_students(db: Session = Depends(get_db)):
    db.query(Student).delete(); db.commit()
    return {"ok": True}


@router.post("/import-csv")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    sep = ";" if text.count(";") > text.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)

    COL_MAP = {
        "numero":"student_number","number":"student_number","id":"student_number",
        "etudiant":"student_number","student_number":"student_number",
        "nom":"last_name","last_name":"last_name","name":"last_name",
        "prenom":"first_name","prénom":"first_name","first_name":"first_name",
        "email":"email","mail":"email",
    }

    created = updated = skipped = 0
    errors = []

    for row_i, row in enumerate(reader, 2):
        normalized = {}
        for raw_key, val in row.items():
            if raw_key is None: continue
            key = raw_key.strip().lower().replace(" ","").replace("_","")
            key = key.replace("é","e").replace("è","e")
            mapped = COL_MAP.get(key)
            if mapped: normalized[mapped] = (val or "").strip()

        num   = normalized.get("student_number","")
        last  = normalized.get("last_name","")
        first = normalized.get("first_name","")

        if not num: errors.append(f"Ligne {row_i}: numéro manquant"); skipped += 1; continue

        existing = db.query(Student).filter(Student.student_number == num).first()
        if existing:
            if last:  existing.last_name  = last
            if first: existing.first_name = first
            if normalized.get("email"): existing.email = normalized["email"]
            updated += 1
        else:
            db.add(Student(student_number=num, last_name=last, first_name=first,
                           email=normalized.get("email") or None))
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors[:20]}


@router.get("/export-csv")
def export_csv(db: Session = Depends(get_db)):
    students = db.query(Student).options(joinedload(Student.groups)).order_by(Student.last_name).all()
    output = io.StringIO()
    w = csv.writer(output, delimiter=";")
    w.writerow(["numero", "nom", "prenom", "email", "groupes"])
    for s in students:
        w.writerow([s.student_number, s.last_name, s.first_name, s.email or "",
                    ",".join(g.name for g in s.groups)])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=etudiants.csv"},
    )

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os
import shutil
import tempfile

from database import get_db
from models import Exam, ScanSession, StudentResult
from services.omr_processor import process_page
from services.excel_exporter import export_to_excel

router = APIRouter(prefix="/scans", tags=["scans"])

STORAGE_DIR = os.getenv("STORAGE_DIR", "./storage")


class ReviewUpdate(BaseModel):
    student_id: Optional[str] = None
    answers: dict
    reviewed: bool = True


@router.post("/{exam_id}/upload")
async def upload_scan(
    exam_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Épreuve introuvable")

    # Sauvegarder le PDF uploadé
    scan_dir = os.path.join(STORAGE_DIR, "scans", str(exam_id))
    os.makedirs(scan_dir, exist_ok=True)
    pdf_path = os.path.join(scan_dir, file.filename)

    with open(pdf_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    session = ScanSession(
        exam_id=exam_id,
        filename=file.filename,
        pdf_path=pdf_path,
        status="processing",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Traitement OMR en arrière-plan
    background_tasks.add_task(
        run_omr_processing,
        session_id=session.id,
        pdf_path=pdf_path,
        exam=exam,
    )

    return {"session_id": session.id, "status": "processing"}


def run_omr_processing(session_id: int, pdf_path: str, exam: Exam):
    """Tâche de fond : convertit le PDF en images et lance l'OMR"""
    from database import SessionLocal
    db = SessionLocal()

    try:
        import pdf2image
        import numpy as np

        pages = pdf2image.convert_from_path(pdf_path, dpi=300)
        images_dir = os.path.join(STORAGE_DIR, "pages", str(session_id))
        os.makedirs(images_dir, exist_ok=True)

        for i, pil_img in enumerate(pages):
            import cv2
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

            result = process_page(
                img=img,
                page_number=i + 1,
                nb_questions=exam.nb_questions,
                nb_choices=exam.nb_choices,
                has_remorse=exam.has_remorse,
                output_dir=images_dir,
            )

            student_result = StudentResult(
                session_id=session_id,
                page_number=result.page_number,
                student_id=result.student_id,
                student_id_confidence=result.student_id_confidence,
                answers=result.answers,
                doubtful_cases=result.doubtful_cases,
                page_image_path=result.page_image_path,
                reviewed=len(result.doubtful_cases) == 0 and result.student_id_confidence == "ok",
            )
            db.add(student_result)

        # Mise à jour statut session
        session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if session:
            has_doubts = db.query(StudentResult).filter(
                StudentResult.session_id == session_id,
                StudentResult.reviewed == False,
            ).count() > 0
            session.status = "review" if has_doubts else "done"
        db.commit()

    except Exception as e:
        session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
        if session:
            session.status = f"error: {str(e)[:200]}"
        db.commit()
    finally:
        db.close()


@router.get("/{exam_id}/sessions")
def get_sessions(exam_id: int, db: Session = Depends(get_db)):
    sessions = db.query(ScanSession).filter(ScanSession.exam_id == exam_id).all()
    result = []
    for s in sessions:
        total = db.query(StudentResult).filter(StudentResult.session_id == s.id).count()
        pending = db.query(StudentResult).filter(
            StudentResult.session_id == s.id,
            StudentResult.reviewed == False
        ).count()
        result.append({
            "id": s.id,
            "filename": s.filename,
            "status": s.status,
            "uploaded_at": s.uploaded_at,
            "total_students": total,
            "pending_review": pending,
        })
    return result


@router.get("/session/{session_id}/results")
def get_session_results(session_id: int, db: Session = Depends(get_db)):
    results = db.query(StudentResult).filter(
        StudentResult.session_id == session_id
    ).order_by(StudentResult.page_number).all()
    return results


@router.get("/session/{session_id}/pending-review")
def get_pending_review(session_id: int, db: Session = Depends(get_db)):
    """Retourne les copies nécessitant une vérification humaine"""
    results = db.query(StudentResult).filter(
        StudentResult.session_id == session_id,
        StudentResult.reviewed == False,
    ).order_by(StudentResult.page_number).all()
    return results


@router.put("/result/{result_id}/review")
def update_review(result_id: int, payload: ReviewUpdate, db: Session = Depends(get_db)):
    """Mise à jour manuelle après review humaine"""
    result = db.query(StudentResult).filter(StudentResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Résultat introuvable")

    if payload.student_id is not None:
        result.student_id = payload.student_id
        result.student_id_confidence = "manual"
    result.answers = payload.answers
    result.doubtful_cases = {}
    result.reviewed = True
    db.commit()
    return {"ok": True}


@router.get("/session/{session_id}/export-excel")
def export_excel(session_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse

    session = db.query(ScanSession).filter(ScanSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    exam = db.query(Exam).filter(Exam.id == session.exam_id).first()
    results = db.query(StudentResult).filter(
        StudentResult.session_id == session_id,
        StudentResult.reviewed == True,
    ).order_by(StudentResult.student_id).all()

    student_data = [
        {"student_id": r.student_id, "answers": r.answers}
        for r in results
    ]

    export_dir = os.path.join(STORAGE_DIR, "exports")
    os.makedirs(export_dir, exist_ok=True)
    filename = f"resultats_{exam.title}_{session_id}.xlsx".replace(" ", "_")
    output_path = os.path.join(export_dir, filename)

    export_to_excel(output_path, student_data, exam.nb_questions)

    return FileResponse(
        path=output_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

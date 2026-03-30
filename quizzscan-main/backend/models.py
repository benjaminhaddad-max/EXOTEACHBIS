from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text, Table
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


# ── Tables d'association many-to-many ────────────────────────────────────────

student_groups = Table(
    "student_groups", Base.metadata,
    Column("student_id", Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id",   Integer, ForeignKey("groups.id",   ondelete="CASCADE"), primary_key=True),
)

exam_groups = Table(
    "exam_groups", Base.metadata,
    Column("exam_id",  Integer, ForeignKey("exams.id",  ondelete="CASCADE"), primary_key=True),
    Column("group_id", Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
)


# ── Modèles ───────────────────────────────────────────────────────────────────

class Group(Base):
    """Groupe d'étudiants (ex: LAS3, PACES-2, TD-B...)"""
    __tablename__ = "groups"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    students = relationship("Student", secondary=student_groups, back_populates="groups")
    exams    = relationship("Exam",    secondary=exam_groups,    back_populates="groups")


class Student(Base):
    """Annuaire des étudiants"""
    __tablename__ = "students"

    id             = Column(Integer, primary_key=True, index=True)
    student_number = Column(String, unique=True, index=True, nullable=False)
    last_name      = Column(String, nullable=False)
    first_name     = Column(String, nullable=False)
    email          = Column(String, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    groups = relationship("Group", secondary=student_groups, back_populates="students")


class Exam(Base):
    """Une épreuve créée par l'enseignant"""
    __tablename__ = "exams"

    id           = Column(Integer, primary_key=True, index=True)
    title        = Column(String, nullable=False)
    institution  = Column(String, nullable=True)
    nb_questions = Column(Integer, nullable=False)
    nb_choices   = Column(Integer, nullable=False)
    has_remorse  = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    grid_pdf_path = Column(String, nullable=True)
    folder_id     = Column(Integer, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)

    folder        = relationship("Folder", back_populates="exams")

    groups        = relationship("Group", secondary=exam_groups, back_populates="exams")
    scan_sessions = relationship("ScanSession", back_populates="exam", cascade="all, delete-orphan")


class ScanSession(Base):
    """Un upload de PDF scanné"""
    __tablename__ = "scan_sessions"

    id          = Column(Integer, primary_key=True, index=True)
    exam_id     = Column(Integer, ForeignKey("exams.id"), nullable=False)
    filename    = Column(String, nullable=False)
    pdf_path    = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    status      = Column(String, default="pending")  # pending|processing|review|done|error

    exam            = relationship("Exam", back_populates="scan_sessions")
    student_results = relationship("StudentResult", back_populates="session", cascade="all, delete-orphan")


class StudentResult(Base):
    """Résultats d'un étudiant sur une session de scan"""
    __tablename__ = "student_results"

    id                    = Column(Integer, primary_key=True, index=True)
    session_id            = Column(Integer, ForeignKey("scan_sessions.id"), nullable=False)
    page_number           = Column(Integer, nullable=False)
    student_id            = Column(String, nullable=True)
    student_id_confidence = Column(String, default="ok")  # ok|doubt|manual
    answers               = Column(JSON, nullable=False, default=dict)
    doubtful_cases        = Column(JSON, nullable=False, default=dict)
    reviewed              = Column(Boolean, default=False)
    review_notes          = Column(Text, nullable=True)
    page_image_path       = Column(String, nullable=True)

    session = relationship("ScanSession", back_populates="student_results")


class Folder(Base):
    """Dossier pour organiser les épreuves (arborescence illimitée)"""
    __tablename__ = "folders"

    id        = Column(Integer, primary_key=True, index=True)
    name      = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    parent   = relationship("Folder", remote_side="Folder.id", back_populates="children")
    children = relationship("Folder", back_populates="parent", cascade="all, delete-orphan")
    exams    = relationship("Exam", back_populates="folder")

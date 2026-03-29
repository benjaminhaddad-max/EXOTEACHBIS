// =============================================
// Types Q&A System — ExoTeach
// =============================================

import type { Profile } from "./database";

// ---------- Enums ----------

export type QaContextType =
  | "dossier"
  | "matiere"
  | "cours"
  | "qcm_question"
  | "qcm_option"
  | "coaching";

export type QaStatus =
  | "ai_pending"
  | "ai_answered"
  | "escalated"
  | "prof_answered"
  | "resolved";

export type QaSenderType = "student" | "ai" | "prof" | "coach";

export type QaMessageContentType = "text" | "voice" | "image" | "video";

// ---------- Tables ----------

export interface ProfMatiere {
  id: string;
  prof_id: string;
  matiere_id: string;
  created_at: string;
  // Relations
  profile?: Profile;
  matiere?: { id: string; name: string; color: string };
}

export interface QaThread {
  id: string;
  student_id: string;
  // Context
  context_type: QaContextType;
  dossier_id: string | null;
  matiere_id: string | null;
  cours_id: string | null;
  question_id: string | null;
  option_id: string | null;
  serie_id: string | null;
  context_label: string;
  // Metadata
  title: string;
  status: QaStatus;
  assigned_prof_id: string | null;
  assigned_coach_id: string | null;
  resolved_at: string | null;
  /** Si non null, conversation archivée (hors liste élève et liste admin par défaut). */
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  // Relations (joined)
  student?: Profile;
  assigned_prof?: Profile;
  assigned_coach?: Profile;
  messages?: QaMessage[];
  last_message?: QaMessage;
  unread_count?: number;
  matiere?: { id: string; name: string; color: string };
}

export interface QaMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_type: QaSenderType;
  content_type: QaMessageContentType;
  content: string | null;
  media_url: string | null;
  media_duration_s: number | null;
  read_by_student: boolean;
  read_by_prof: boolean;
  created_at: string;
  // Relations
  sender?: Profile;
}

// ---------- Context helpers ----------

/** Props passed to the contextual "Ask Question" button */
export interface QaContextProps {
  contextType: QaContextType;
  dossierId?: string;
  matiereId?: string;
  coursId?: string;
  questionId?: string;
  optionId?: string;
  serieId?: string;
  /** Pre-resolved context label, or will be built from IDs */
  contextLabel?: string;
}

/** Resolved context with matiere_id guaranteed */
export interface QaResolvedContext extends QaContextProps {
  matiereId: string;
  contextLabel: string;
}

/** Payload sent to create a new thread */
export interface CreateThreadPayload {
  context_type: QaContextType;
  dossier_id?: string | null;
  matiere_id: string;
  cours_id?: string | null;
  question_id?: string | null;
  option_id?: string | null;
  serie_id?: string | null;
  context_label: string;
  title: string;
  first_message: string;
}

/** Payload for AI response API */
export interface AiRespondPayload {
  thread_id: string;
  question_text: string;
  context: {
    matiere_name: string;
    cours_name?: string;
    qcm_question_text?: string;
    qcm_option_text?: string;
    context_label: string;
  };
}

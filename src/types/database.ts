// =============================================
// Types base de données — ExoTeach Next
// =============================================

export type UserRole = "superadmin" | "admin" | "prof" | "eleve";

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  groupe_id: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================
// Hiérarchie contenu
// =============================================

export interface Dossier {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  icon_url: string | null;
  color: string;
  order_index: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
  // Relations (optionnelles selon la requête)
  children?: Dossier[];
  matieres?: Matiere[];
}

export interface Matiere {
  id: string;
  dossier_id: string;
  name: string;
  description: string | null;
  color: string;
  icon_url: string | null;
  order_index: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  dossier?: Dossier;
  cours?: Cours[];
  nb_cours?: number;
  nb_questions?: number;
}

export interface Cours {
  id: string;
  matiere_id: string;
  name: string;
  description: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  version: number;
  nb_pages: number;
  order_index: number;
  visible: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  // Relations
  matiere?: Matiere;
  series?: Serie[];
  user_progress?: UserProgress;
}

// =============================================
// Exercices QCM
// =============================================

export type QuestionType = "qcm_unique" | "qcm_multiple";

export interface Question {
  id: string;
  cours_id: string | null;
  matiere_id: string | null;
  text: string;
  explanation: string | null;
  type: QuestionType;
  tags: string[];
  difficulty: number;
  created_at: string;
  updated_at: string;
  // Relations
  options?: Option[];
}

export interface Option {
  id: string;
  question_id: string;
  label: "A" | "B" | "C" | "D" | "E";
  text: string;
  is_correct: boolean;
  order_index: number;
}

export type SerieType = "entrainement" | "concours_blanc" | "revision";

export interface Serie {
  id: string;
  cours_id: string | null;
  matiere_id: string | null;
  name: string;
  description: string | null;
  type: SerieType;
  timed: boolean;
  duration_minutes: number | null;
  score_definitif: boolean;
  visible: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  questions?: Question[];
  nb_questions?: number;
  last_attempt?: SerieAttempt;
}

// =============================================
// Tracking étudiant
// =============================================

export interface UserProgress {
  user_id: string;
  cours_id: string;
  pct_complete: number;
  current_page: number;
  last_seen_at: string;
}

export interface SerieAttempt {
  id: string;
  user_id: string;
  series_id: string;
  started_at: string;
  ended_at: string | null;
  score: number | null;
  nb_correct: number;
  nb_total: number;
  timed: boolean;
  time_spent_s: number | null;
  // Relations
  answers?: UserAnswer[];
}

export interface UserAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_labels: string[];
  is_correct: boolean;
  time_spent_s: number | null;
  // Relations
  question?: Question;
}

// =============================================
// Examens
// =============================================

export interface Examen {
  id: string;
  name: string;
  description: string | null;
  debut_at: string;
  fin_at: string;
  visible: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  series?: Serie[];
}

// =============================================
// Groupes & présence
// =============================================

export interface Groupe {
  id: string;
  name: string;
  annee: string | null;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  // Relations
  members?: GroupeMember[];
  nb_members?: number;
}

export interface GroupeMember {
  groupe_id: string;
  user_id: string;
  role: "eleve" | "prof";
  joined_at: string;
  // Relations
  profile?: Profile;
  groupe?: Groupe;
}

export type AbsenceType = "present" | "absent_justifie" | "absent_non_justifie";

export interface Absence {
  id: string;
  user_id: string;
  groupe_id: string | null;
  date: string;
  type: AbsenceType;
  note: string | null;
  created_at: string;
}

// =============================================
// Communication
// =============================================

export type PostType = "annonce" | "forum_question" | "forum_reply";

export interface Post {
  id: string;
  author_id: string;
  cours_id: string | null;
  groupe_id: string | null;
  parent_id: string | null;
  content: string;
  content_json: Record<string, unknown> | null;
  type: PostType;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  author?: Profile;
  replies?: Post[];
}

// =============================================
// Planning
// =============================================

export type EventType = "cours" | "examen" | "reunion" | "autre";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  type: EventType;
  groupe_id: string | null;
  zoom_link: string | null;
  location: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================
// Abonnements
// =============================================

export type AbonnementPlan = "mensuel" | "trimestriel" | "annuel";
export type AbonnementStatus = "active" | "cancelled" | "past_due" | "trialing";

export interface Abonnement {
  id: string;
  user_id: string;
  plan: AbonnementPlan;
  status: AbonnementStatus;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================
// Stats admin
// =============================================

export interface AdminStats {
  total_users: number;
  total_cours: number;
  total_questions: number;
  total_answers: number;
  total_groupes: number;
}

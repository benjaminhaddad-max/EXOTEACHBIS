// =============================================
// Types base de données — ExoTeach Next
// =============================================

export type UserRole = "superadmin" | "admin" | "coach" | "prof" | "eleve";
export type FormationOffer = string;
export type DossierType =
  | "generic"
  | "offer"
  | "university"
  | "semester"
  | "option"
  | "period"
  | "module"
  | "subject";

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  groupe_id: string | null;
  filiere_id: string | null;
  access_dossier_id: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  filiere?: Filiere;
  access_dossier?: Dossier | null;
}

// =============================================
// Hiérarchie contenu
// =============================================

export interface Dossier {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  dossier_type: DossierType;
  formation_offer: FormationOffer | null;
  icon_url: string | null;
  color: string;
  order_index: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
  // Relations
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

export type PageType = 'fiches' | 'seances' | 'videos' | 'exercices' | 'liens' | 'custom';

export interface Cours {
  id: string;
  matiere_id: string | null;
  dossier_id: string | null;
  name: string;
  description: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  version: number;
  nb_pages: number;
  order_index: number;
  visible: boolean;
  tags: string[];
  page_type: PageType;
  created_at: string;
  updated_at: string;
  // Relations
  matiere?: Matiere;
  series?: Serie[];
  user_progress?: UserProgress;
  ressources?: Ressource[];
}

export type RessourceType = 'pdf' | 'video' | 'vimeo' | 'lien';

export interface Ressource {
  id: string;
  cours_id: string | null;
  dossier_id: string | null;
  titre: string;
  sous_titre: string | null;
  type: RessourceType;
  pdf_url: string | null;
  pdf_path: string | null;
  video_url: string | null;
  vimeo_id: string | null;
  lien_url: string | null;
  lien_label: string | null;
  order_index: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
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

export type SerieType = "entrainement" | "concours_blanc" | "revision" | "annales" | "qcm_supplementaires";

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
  annee: string | null;
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
// Filières de santé
// =============================================

export interface Filiere {
  id: string;
  name: string;
  code: string;
  color: string;
  order_index: number;
  created_at: string;
}

export interface MatiereCoefficient {
  id: string;
  matiere_id: string;
  filiere_id: string;
  coefficient: number;
  // Relations
  matiere?: Matiere;
  filiere?: Filiere;
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
  results_visible: boolean;
  notation_sur: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  series?: Serie[];
  examen_series?: ExamenSerie[];
}

export interface ExamenSerie {
  examen_id: string;
  series_id: string;
  order_index: number;
  coefficient: number;
  // Relations
  series?: Serie;
}

export interface ExamenResult {
  id: string;
  examen_id: string;
  user_id: string;
  score_raw: number | null;
  score_20: number | null;
  nb_series_done: number;
  nb_series_total: number;
  started_at: string;
  completed_at: string | null;
  // Relations
  user?: Profile;
  examen?: Examen;
  serie_results?: ExamenSerieResult[];
}

export interface ExamenSerieResult {
  id: string;
  examen_result_id: string;
  examen_id: string;
  series_id: string;
  user_id: string;
  attempt_id: string | null;
  score: number | null;
  score_20: number | null;
  nb_correct: number;
  nb_total: number;
  completed_at: string | null;
  // Relations
  series?: Serie;
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
  parent_id: string | null;
  formation_dossier_id: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  members?: GroupeMember[];
  nb_members?: number;
  formation_dossier?: Dossier | null;
}

export interface GroupeDossierAcces {
  groupe_id: string;
  dossier_id: string;
  created_at: string;
}

export interface ProfileDossierAcces {
  profile_id: string;
  dossier_id: string;
  created_at: string;
}

export interface ProfileDossierAccesExclusion {
  profile_id: string;
  dossier_id: string;
  created_at: string;
}

export interface GroupeMember {
  groupe_id: string;
  user_id: string;
  role: "eleve" | "prof" | "coach";
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
  title: string | null;
  cours_id: string | null;
  groupe_id: string | null;
  dossier_id: string | null;
  matiere_id: string | null;
  parent_id: string | null;
  content: string;
  content_json: Record<string, unknown> | null;
  type: PostType;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  author?: Profile;
  groupe?: Groupe | null;
  dossier?: Dossier | null;
  matiere?: Matiere | null;
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
// Coaching
// =============================================

export type CoachingCohortStatus = "draft" | "active" | "archived";
export type CoachingProfileType =
  | "good_confident"
  | "good_fragile"
  | "good_arrogant"
  | "average_motivated"
  | "average_unaware";
export type CoachingStudentStatus = "green" | "orange" | "red";
export type CoachingHoursBucket = "lt5" | "5_10" | "10_20" | "20_plus";
export type CoachingUnderstandingLevel = "not_at_all" | "a_little" | "mostly_yes" | "fully";
export type CoachingMentalState = "lost" | "doubtful" | "okay" | "confident";
export type CoachingMainBlocker = "subject" | "organization" | "motivation" | "none";
export type CoachingMomentum = "backward" | "same" | "improving" | "much_better";
export type CoachingNoteType =
  | "onboarding_call"
  | "guardian_call"
  | "weekly_followup"
  | "meeting"
  | "alert"
  | "internal";
export type CoachingInterventionChannel =
  | "call"
  | "visio"
  | "physical"
  | "email"
  | "sms"
  | "whatsapp"
  | "crisp";
export type CoachingInterventionStatus = "todo" | "scheduled" | "done" | "cancelled";

export interface CoachingCohort {
  id: string;
  name: string;
  season: string;
  status: CoachingCohortStatus;
  onboarding_starts_on: string | null;
  intensive_starts_on: string | null;
  cadence_starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachingStudent {
  id: string;
  cohort_id: string;
  student_id: string;
  coach_id: string | null;
  profile_type: CoachingProfileType;
  current_status: CoachingStudentStatus;
  onboarding_completed: boolean;
  onboarding_called_at: string | null;
  guardian_called_at: string | null;
  goals: unknown;
  risk_notes: string | null;
  created_at: string;
  updated_at: string;
  student?: Profile;
  coach?: Profile | null;
}

export interface CoachingWeeklyCheckin {
  id: string;
  cohort_id: string;
  coaching_student_id: string;
  student_id: string;
  week_start: string;
  hours_bucket: CoachingHoursBucket;
  understanding_level: CoachingUnderstandingLevel;
  mental_state: CoachingMentalState;
  main_blocker: CoachingMainBlocker;
  momentum: CoachingMomentum;
  free_text: string | null;
  computed_status: CoachingStudentStatus;
  signal_reasons: string[];
  submitted_at: string;
}

export interface CoachingNote {
  id: string;
  cohort_id: string;
  coaching_student_id: string;
  student_id: string;
  author_id: string;
  note_type: CoachingNoteType;
  title: string;
  content: string;
  created_at: string;
  author?: Profile;
}

export interface CoachingIntervention {
  id: string;
  cohort_id: string;
  coaching_student_id: string;
  student_id: string;
  owner_id: string | null;
  requested_by_id: string | null;
  channel: CoachingInterventionChannel;
  status: CoachingInterventionStatus;
  reason: string;
  scheduled_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  owner?: Profile | null;
  requested_by?: Profile | null;
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

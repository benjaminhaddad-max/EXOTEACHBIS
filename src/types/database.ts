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

export type QuestionType = "qcm_unique" | "qcm_multiple" | "short_answer" | "redaction";

export interface Question {
  id: string;
  cours_id: string | null;
  matiere_id: string | null;
  text: string;
  explanation: string | null;
  type: QuestionType;
  tags: string[];
  difficulty: number;
  correct_answer?: string | null; // for short_answer questions
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

// Réponse écrite d'un étudiant (short_answer ou redaction)
export interface UserTextAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer_text: string | null;
  is_correct: boolean | null; // null = pas encore corrigé (redaction)
  time_spent_s: number | null;
  created_at: string;
  // Relations
  question?: Question;
  correction?: RedactionCorrection;
}

// Correction manuelle d'une rédaction par le prof
export interface RedactionCorrection {
  id: string;
  user_text_answer_id: string;
  corrected_by: string | null;
  score_percent: number | null; // 0-100
  comment: string | null;
  corrected_at: string;
}

// Config de notation réponse courte par université
export interface UniversityShortAnswerConfig {
  university_dossier_id: string;
  points_correct: number;
  points_incorrect: number;
  case_sensitive: boolean;
}

// Config de notation rédaction par université
export interface UniversityRedactionConfig {
  university_dossier_id: string;
  max_points: number;
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
// Formulaires dynamiques
// =============================================

export type FormFieldType = "short_text" | "long_text" | "select" | "radio" | "checkboxes";
export type FormFieldWidth = "half" | "full";
export type FormAnswerValue = string | string[];
export type FormTargetType = "global" | "offer" | "university" | "groupe" | "student" | "selection";

export interface FormTemplate {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  context: string;
  target_type: FormTargetType;
  target_offer_code: string | null;
  target_university_dossier_id: string | null;
  target_groupe_id: string | null;
  target_student_id: string | null;
  target_student_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: string;
  form_template_id: string;
  key: string;
  label: string;
  helper_text: string | null;
  placeholder: string | null;
  field_type: FormFieldType;
  required: boolean;
  options: string[];
  width: FormFieldWidth;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// =============================================
// Coaching
// =============================================

export type CoachingMentality = "passif" | "pessimiste" | "optimiste";
export type CoachingSchoolLevel = "limite" | "normal" | "bon";
export type CoachingWorkCapacity = "faible" | "moyenne" | "forte";
export type CoachingMethodLevel = "mauvaise" | "moyenne" | "bonne";
export type CoachingCallBookingStatus = "booked" | "completed" | "cancelled" | "no_show";
export type CoachingNiveauInitial = "fort" | "moyen" | "fragile";
export type CoachingMentalInitial = "fort" | "moyen" | "fragile";
export type CoachingVideoCategory = "motivation" | "methode";
export type CoachingRdvType = "physique" | "appel" | "visio";
export type CoachingRdvStatus = "pending" | "assigned" | "completed" | "cancelled";

export interface CoachingIntakeForm {
  id: string;
  student_id: string;
  groupe_id: string | null;
  form_template_id: string | null;
  answers: Record<string, FormAnswerValue>;
  phone: string | null;
  city: string | null;
  bac_specialties: string | null;
  parcours_label: string | null;
  why_medicine: string | null;
  expectations: string | null;
  main_worry: string | null;
  current_method_description: string | null;
  strengths: string | null;
  weaknesses: string | null;
  availability_notes: string | null;
  submitted_at: string;
  updated_at: string;
  student?: Profile;
  groupe?: Groupe | null;
}

export interface CoachingCallSlot {
  id: string;
  coach_id: string;
  groupe_id: string;
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  coach?: Profile;
  groupe?: Groupe;
}

export interface CoachingCallBooking {
  id: string;
  slot_id: string;
  student_id: string;
  coach_id: string;
  groupe_id: string;
  intake_form_id: string | null;
  status: CoachingCallBookingStatus;
  booked_at: string;
  updated_at: string;
  slot?: CoachingCallSlot;
  student?: Profile;
  coach?: Profile;
  groupe?: Groupe;
  intake_form?: CoachingIntakeForm | null;
}

export interface CoachingStudentProfile {
  id: string;
  student_id: string;
  groupe_id: string;
  coach_id: string | null;
  intake_form_id: string | null;
  booking_id: string | null;
  mentality: CoachingMentality | null;
  school_level: CoachingSchoolLevel | null;
  work_capacity: CoachingWorkCapacity | null;
  method_level: CoachingMethodLevel | null;
  confidence_score: number | null;
  niveau_initial: CoachingNiveauInitial | null;
  mental_initial: CoachingMentalInitial | null;
  niveau_progressif: CoachingNiveauInitial | null;
  mental_progressif: CoachingMentalInitial | null;
  coach_report: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  student?: Profile;
  coach?: Profile | null;
  reviewer?: Profile | null;
}

// =============================================
// Coach ↔ Groupe assignments
// =============================================

export interface CoachGroupeAssignment {
  id: string;
  coach_id: string;
  groupe_id: string;
  created_at: string;
  coach?: Profile | null;
  groupe?: Groupe | null;
}

// =============================================
// Coaching Videos
// =============================================

export interface CoachingVideo {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  vimeo_id: string | null;
  category: CoachingVideoCategory;
  university_dossier_id: string | null;
  order_index: number;
  visible: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================
// Coaching RDV Requests
// =============================================

export interface CoachingRdvRequest {
  id: string;
  student_id: string;
  groupe_id: string;
  rdv_type: CoachingRdvType;
  message: string | null;
  status: CoachingRdvStatus;
  assigned_coach_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  student?: Profile;
  assigned_coach?: Profile | null;
  groupe?: Groupe;
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
// Student revision events
// =============================================

export type RevisionType =
  | "apprentissage_fiche"
  | "revision_fiche"
  | "qcm_supplementaires"
  | "annales_matiere"
  | "annales_chapitre"
  | "preparation_seance";

export const REVISION_TYPE_META: Record<RevisionType, { label: string; icon: string; color: string }> = {
  apprentissage_fiche:  { label: "Apprentissage fiche de cours", icon: "BookOpen",    color: "#3B82F6" },
  revision_fiche:       { label: "Révision fiche de cours",      icon: "RefreshCw",   color: "#8B5CF6" },
  qcm_supplementaires:  { label: "QCM supplémentaires",          icon: "ListChecks",  color: "#F59E0B" },
  annales_matiere:      { label: "Annales (matière)",             icon: "FileText",    color: "#EF4444" },
  annales_chapitre:     { label: "Annales (chapitre)",            icon: "FileStack",   color: "#EC4899" },
  preparation_seance:   { label: "Préparation séance Diploma",   icon: "GraduationCap", color: "#0EA5E9" },
};

export interface StudentEvent {
  id: string;
  student_id: string;
  title: string;
  revision_type: RevisionType;
  matiere_id: string | null;
  cours_id: string | null;
  start_at: string;
  end_at: string;
  notes: string | null;
  completed: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  matiere?: Matiere | null;
  cours?: Cours | null;
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

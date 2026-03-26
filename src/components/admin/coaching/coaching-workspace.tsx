"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Loader2,
  MessageSquareText,
  PhoneCall,
  Plus,
  Search,
  ShieldAlert,
  Siren,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  CoachingCohort,
  CoachingIntervention,
  CoachingInterventionChannel,
  CoachingInterventionStatus,
  CoachingMainBlocker,
  CoachingMentalState,
  CoachingMomentum,
  CoachingNote,
  CoachingNoteType,
  CoachingProfileType,
  CoachingStudent,
  CoachingStudentStatus,
  CoachingUnderstandingLevel,
  CoachingWeeklyCheckin,
  CoachingHoursBucket,
  Profile,
} from "@/types/database";
import { COACHING_PROFILE_TYPES, COACHING_STATUS_META } from "@/lib/coaching";
import {
  addStudentsToCoachingCohort,
  createCoachingCohort,
  createCoachingIntervention,
  createCoachingNote,
  createCoachingWeeklyCheckin,
  updateCoachingInterventionStatus,
  updateCoachingStudent,
} from "@/app/(admin)/admin/coaching/actions";

type CoachingAssignment = CoachingStudent & {
  student?: Profile;
  coach?: Profile | null;
};

type CoachingInterventionWithRelations = CoachingIntervention & {
  owner?: Profile | null;
  requested_by?: Profile | null;
};

type CoachingNoteWithAuthor = CoachingNote & {
  author?: Profile;
};

type Toast = {
  kind: "success" | "error";
  message: string;
} | null;

type CoachingWorkspaceProps = {
  setupComplete: boolean;
  setupError?: string | null;
  initialCohorts: CoachingCohort[];
  initialAssignments: CoachingAssignment[];
  students: Profile[];
  coaches: Profile[];
  initialCheckins: CoachingWeeklyCheckin[];
  initialNotes: CoachingNoteWithAuthor[];
  initialInterventions: CoachingInterventionWithRelations[];
};

type AssignmentDraft = {
  coach_id: string | null;
  profile_type: CoachingProfileType;
  current_status: CoachingStudentStatus;
  onboarding_completed: boolean;
  risk_notes: string;
};

type WeeklyCheckinDraft = {
  week_start: string;
  hours_bucket: CoachingHoursBucket;
  understanding_level: CoachingUnderstandingLevel;
  mental_state: CoachingMentalState;
  main_blocker: CoachingMainBlocker;
  momentum: CoachingMomentum;
  free_text: string;
};

type NoteDraft = {
  note_type: CoachingNoteType;
  title: string;
  content: string;
};

type InterventionDraft = {
  ownerId: string | null;
  channel: CoachingInterventionChannel;
  reason: string;
  scheduledAt: string;
};

const HOURS_OPTIONS: Array<{ value: CoachingHoursBucket; label: string }> = [
  { value: "lt5", label: "Moins de 5h" },
  { value: "5_10", label: "Entre 5 et 10h" },
  { value: "10_20", label: "Entre 10 et 20h" },
  { value: "20_plus", label: "Plus de 20h" },
];

const UNDERSTANDING_OPTIONS: Array<{ value: CoachingUnderstandingLevel; label: string }> = [
  { value: "not_at_all", label: "Pas du tout" },
  { value: "a_little", label: "Un peu" },
  { value: "mostly_yes", label: "Globalement oui" },
  { value: "fully", label: "Complètement" },
];

const MENTAL_OPTIONS: Array<{ value: CoachingMentalState; label: string }> = [
  { value: "lost", label: "Je suis perdu" },
  { value: "doubtful", label: "Je doute beaucoup" },
  { value: "okay", label: "Ça va globalement" },
  { value: "confident", label: "Je suis confiant" },
];

const BLOCKER_OPTIONS: Array<{ value: CoachingMainBlocker; label: string }> = [
  { value: "subject", label: "Une matière spécifique" },
  { value: "organization", label: "Mon organisation" },
  { value: "motivation", label: "Ma motivation" },
  { value: "none", label: "Rien, ça s'est bien passé" },
];

const MOMENTUM_OPTIONS: Array<{ value: CoachingMomentum; label: string }> = [
  { value: "backward", label: "En recul" },
  { value: "same", label: "Pareil" },
  { value: "improving", label: "En progression" },
  { value: "much_better", label: "Beaucoup mieux" },
];

const NOTE_TYPE_OPTIONS: Array<{ value: CoachingNoteType; label: string }> = [
  { value: "internal", label: "Note interne" },
  { value: "onboarding_call", label: "Call onboarding" },
  { value: "guardian_call", label: "Call parent" },
  { value: "weekly_followup", label: "Suivi hebdo" },
  { value: "meeting", label: "Rendez-vous" },
  { value: "alert", label: "Alerte" },
];

const INTERVENTION_CHANNEL_OPTIONS: Array<{ value: CoachingInterventionChannel; label: string }> = [
  { value: "call", label: "Call" },
  { value: "visio", label: "Visio" },
  { value: "physical", label: "Rendez-vous physique" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "crisp", label: "Crisp" },
];

const INTERVENTION_STATUS_OPTIONS: Array<{ value: CoachingInterventionStatus; label: string }> = [
  { value: "todo", label: "À faire" },
  { value: "scheduled", label: "Planifiée" },
  { value: "done", label: "Terminée" },
  { value: "cancelled", label: "Annulée" },
];

function displayName(profile?: Profile | null) {
  if (!profile) return "—";
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return fullName || profile.email;
}

function countByStatus(assignments: CoachingAssignment[]) {
  return assignments.reduce(
    (acc, assignment) => {
      acc.total += 1;
      acc[assignment.current_status] += 1;
      if (!assignment.coach_id) acc.unassigned += 1;
      return acc;
    },
    { total: 0, green: 0, orange: 0, red: 0, unassigned: 0 }
  );
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleString("fr-FR", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function getCurrentWeekStart() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function initialCheckinDraft(): WeeklyCheckinDraft {
  return {
    week_start: getCurrentWeekStart(),
    hours_bucket: "10_20",
    understanding_level: "mostly_yes",
    mental_state: "okay",
    main_blocker: "none",
    momentum: "improving",
    free_text: "",
  };
}

function initialNoteDraft(): NoteDraft {
  return {
    note_type: "internal",
    title: "",
    content: "",
  };
}

function initialInterventionDraft(): InterventionDraft {
  return {
    ownerId: null,
    channel: "call",
    reason: "",
    scheduledAt: "",
  };
}

export function CoachingWorkspace({
  setupComplete,
  setupError,
  initialCohorts,
  initialAssignments,
  students,
  coaches,
  initialCheckins,
  initialNotes,
  initialInterventions,
}: CoachingWorkspaceProps) {
  const [cohorts, setCohorts] = useState(initialCohorts);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [checkins, setCheckins] = useState(initialCheckins);
  const [notes, setNotes] = useState(initialNotes);
  const [interventions, setInterventions] = useState(initialInterventions);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(initialCohorts[0]?.id ?? null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(initialAssignments[0]?.id ?? null);
  const [season, setSeason] = useState("2026-2027");
  const [cohortName, setCohortName] = useState("Coaching PASS/LAS");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CoachingStudentStatus>("all");
  const [profileFilter, setProfileFilter] = useState<"all" | CoachingProfileType>("all");
  const [toast, setToast] = useState<Toast>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft | null>(null);
  const [weeklyDraft, setWeeklyDraft] = useState<WeeklyCheckinDraft>(initialCheckinDraft());
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(initialNoteDraft());
  const [interventionDraft, setInterventionDraft] = useState<InterventionDraft>(initialInterventionDraft());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedCohortId) ?? null;

  const cohortAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.cohort_id === selectedCohortId),
    [assignments, selectedCohortId]
  );

  useEffect(() => {
    if (!selectedCohortId && cohorts[0]) {
      setSelectedCohortId(cohorts[0].id);
    }
  }, [cohorts, selectedCohortId]);

  useEffect(() => {
    if (!selectedAssignmentId || !cohortAssignments.some((assignment) => assignment.id === selectedAssignmentId)) {
      setSelectedAssignmentId(cohortAssignments[0]?.id ?? null);
    }
  }, [cohortAssignments, selectedAssignmentId]);

  const filteredAssignments = useMemo(() => {
    return cohortAssignments.filter((assignment) => {
      const haystack = `${displayName(assignment.student)} ${assignment.student?.email ?? ""}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && assignment.current_status !== statusFilter) return false;
      if (profileFilter !== "all" && assignment.profile_type !== profileFilter) return false;
      return true;
    });
  }, [cohortAssignments, search, statusFilter, profileFilter]);

  const selectedAssignment = cohortAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const cohortStats = useMemo(() => countByStatus(cohortAssignments), [cohortAssignments]);

  const availableStudents = useMemo(() => {
    const alreadyInCohort = new Set(cohortAssignments.map((assignment) => assignment.student_id));
    return students.filter((student) => !alreadyInCohort.has(student.id));
  }, [cohortAssignments, students]);

  const cohortCheckins = useMemo(
    () => checkins.filter((checkin) => checkin.cohort_id === selectedCohortId),
    [checkins, selectedCohortId]
  );

  const cohortNotes = useMemo(
    () => notes.filter((note) => note.cohort_id === selectedCohortId),
    [notes, selectedCohortId]
  );

  const cohortInterventions = useMemo(
    () => interventions.filter((intervention) => intervention.cohort_id === selectedCohortId),
    [interventions, selectedCohortId]
  );

  const actionQueue = useMemo(
    () =>
      cohortInterventions
        .filter((intervention) => intervention.status === "todo" || intervention.status === "scheduled")
        .sort((a, b) => {
          const aDate = a.scheduled_at ?? a.created_at;
          const bDate = b.scheduled_at ?? b.created_at;
          return new Date(aDate).getTime() - new Date(bDate).getTime();
        }),
    [cohortInterventions]
  );

  const latestCheckinsThisWeek = useMemo(() => {
    const currentWeek = getCurrentWeekStart();
    return cohortCheckins.filter((checkin) => checkin.week_start === currentWeek).length;
  }, [cohortCheckins]);

  const selectedStudentCheckins = useMemo(
    () =>
      selectedAssignment
        ? checkins.filter((checkin) => checkin.coaching_student_id === selectedAssignment.id)
        : [],
    [checkins, selectedAssignment]
  );

  const selectedStudentNotes = useMemo(
    () =>
      selectedAssignment
        ? notes.filter((note) => note.coaching_student_id === selectedAssignment.id)
        : [],
    [notes, selectedAssignment]
  );

  const selectedStudentInterventions = useMemo(
    () =>
      selectedAssignment
        ? interventions.filter((intervention) => intervention.coaching_student_id === selectedAssignment.id)
        : [],
    [interventions, selectedAssignment]
  );

  const latestCheckin = selectedStudentCheckins[0] ?? null;

  useEffect(() => {
    if (!selectedAssignment) {
      setAssignmentDraft(null);
      return;
    }

    setAssignmentDraft({
      coach_id: selectedAssignment.coach_id,
      profile_type: selectedAssignment.profile_type,
      current_status: selectedAssignment.current_status,
      onboarding_completed: selectedAssignment.onboarding_completed,
      risk_notes: selectedAssignment.risk_notes ?? "",
    });
    setWeeklyDraft(initialCheckinDraft());
    setNoteDraft(initialNoteDraft());
    setInterventionDraft(initialInterventionDraft());
  }, [selectedAssignment?.id]);

  const assignmentDirty = Boolean(
    selectedAssignment &&
      assignmentDraft &&
      (
        assignmentDraft.coach_id !== selectedAssignment.coach_id ||
        assignmentDraft.profile_type !== selectedAssignment.profile_type ||
        assignmentDraft.current_status !== selectedAssignment.current_status ||
        assignmentDraft.onboarding_completed !== selectedAssignment.onboarding_completed ||
        assignmentDraft.risk_notes !== (selectedAssignment.risk_notes ?? "")
      )
  );

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
  };

  const handleCreateCohort = () => {
    startTransition(async () => {
      const result = await createCoachingCohort({
        name: cohortName,
        season,
        status: "draft",
      });

      if (!("cohort" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible de créer la cohorte.");
        return;
      }

      const cohort = result.cohort;
      if (!cohort) {
        showToast("error", "Impossible de créer la cohorte.");
        return;
      }
      setCohorts((prev) => [cohort, ...prev]);
      setSelectedCohortId(cohort.id);
      showToast("success", "Cohorte créée");
    });
  };

  const handleAddStudent = () => {
    if (!selectedCohortId || !selectedStudentId) return;

    startTransition(async () => {
      const result = await addStudentsToCoachingCohort({
        cohortId: selectedCohortId,
        studentIds: [selectedStudentId],
      });

      if (!("rows" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible d'ajouter l'élève.");
        return;
      }

      const rows = result.rows ?? [];
      const inserted = rows.map((row) => ({
        ...row,
        student: students.find((student) => student.id === row.student_id),
        coach: coaches.find((coach) => coach.id === row.coach_id) ?? null,
      }));

      setAssignments((prev) => {
        const next = prev.filter(
          (assignment) => !inserted.some((newAssignment) => newAssignment.id === assignment.id)
        );
        return [...inserted, ...next];
      });
      setSelectedAssignmentId(inserted[0]?.id ?? null);
      setSelectedStudentId("");
      showToast("success", "Élève ajouté à la cohorte");
    });
  };

  const handleSaveAssignment = () => {
    if (!selectedAssignment || !assignmentDraft) return;

    startTransition(async () => {
      const result = await updateCoachingStudent({
        id: selectedAssignment.id,
        coach_id: assignmentDraft.coach_id,
        profile_type: assignmentDraft.profile_type,
        current_status: assignmentDraft.current_status,
        onboarding_completed: assignmentDraft.onboarding_completed,
        risk_notes: assignmentDraft.risk_notes,
      });

      if (!("row" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible de mettre à jour la fiche élève.");
        return;
      }

      const updatedRow = result.row;
      if (!updatedRow) {
        showToast("error", "Impossible de mettre à jour la fiche élève.");
        return;
      }
      setAssignments((prev) =>
        prev.map((assignment) =>
          assignment.id === selectedAssignment.id
            ? {
                ...assignment,
                ...updatedRow,
                coach: coaches.find((coach) => coach.id === updatedRow.coach_id) ?? null,
              }
            : assignment
        )
      );
      showToast("success", "Fiche élève mise à jour");
    });
  };

  const handleCreateCheckin = () => {
    if (!selectedAssignment) return;

    startTransition(async () => {
      const result = await createCoachingWeeklyCheckin({
        cohortId: selectedAssignment.cohort_id,
        coachingStudentId: selectedAssignment.id,
        studentId: selectedAssignment.student_id,
        weekStart: weeklyDraft.week_start,
        hours_bucket: weeklyDraft.hours_bucket,
        understanding_level: weeklyDraft.understanding_level,
        mental_state: weeklyDraft.mental_state,
        main_blocker: weeklyDraft.main_blocker,
        momentum: weeklyDraft.momentum,
        free_text: weeklyDraft.free_text,
      });

      if (!("checkin" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible d'enregistrer le check-in.");
        return;
      }

      const insertedCheckin = result.checkin;
      if (!insertedCheckin || !result.updatedStudent) {
        showToast("error", "Impossible d'enregistrer le check-in.");
        return;
      }
      setCheckins((prev) => {
        const next = prev.filter(
          (checkin) => !(checkin.student_id === insertedCheckin.student_id && checkin.week_start === insertedCheckin.week_start)
        );
        return [insertedCheckin, ...next];
      });

      setAssignments((prev) =>
        prev.map((assignment) =>
          assignment.id === selectedAssignment.id
            ? {
                ...assignment,
                ...result.updatedStudent,
                coach: coaches.find((coach) => coach.id === result.updatedStudent.coach_id) ?? null,
              }
            : assignment
        )
      );

      if (result.autoIntervention) {
        setInterventions((prev) => [result.autoIntervention as CoachingInterventionWithRelations, ...prev]);
      }

      setWeeklyDraft((prev) => ({ ...initialCheckinDraft(), week_start: prev.week_start }));
      showToast("success", `Check-in enregistré: statut ${COACHING_STATUS_META[result.evaluation.status].label}.`);
    });
  };

  const handleCreateNote = () => {
    if (!selectedAssignment || !noteDraft.title.trim() || !noteDraft.content.trim()) return;

    startTransition(async () => {
      const result = await createCoachingNote({
        cohortId: selectedAssignment.cohort_id,
        coachingStudentId: selectedAssignment.id,
        studentId: selectedAssignment.student_id,
        noteType: noteDraft.note_type,
        title: noteDraft.title,
        content: noteDraft.content,
      });

      if (!("note" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible d'ajouter la note.");
        return;
      }

      if (!result.note) {
        showToast("error", "Impossible d'ajouter la note.");
        return;
      }
      setNotes((prev) => [
        {
          ...result.note,
          author: undefined,
        },
        ...prev,
      ]);
      setNoteDraft(initialNoteDraft());
      showToast("success", "Note ajoutée");
    });
  };

  const handleCreateIntervention = () => {
    if (!selectedAssignment || !interventionDraft.reason.trim()) return;

    startTransition(async () => {
      const result = await createCoachingIntervention({
        cohortId: selectedAssignment.cohort_id,
        coachingStudentId: selectedAssignment.id,
        studentId: selectedAssignment.student_id,
        ownerId: interventionDraft.ownerId,
        channel: interventionDraft.channel,
        reason: interventionDraft.reason,
        scheduledAt: interventionDraft.scheduledAt || null,
      });

      if (!("intervention" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible de créer l'intervention.");
        return;
      }

      if (!result.intervention) {
        showToast("error", "Impossible de créer l'intervention.");
        return;
      }
      setInterventions((prev) => [
        {
          ...result.intervention,
          owner: coaches.find((coach) => coach.id === result.intervention.owner_id) ?? null,
          requested_by: undefined,
        },
        ...prev,
      ]);
      setInterventionDraft(initialInterventionDraft());
      showToast("success", "Intervention créée");
    });
  };

  const handleUpdateInterventionStatus = (interventionId: string, status: CoachingInterventionStatus) => {
    startTransition(async () => {
      const result = await updateCoachingInterventionStatus({ id: interventionId, status });

      if (!("intervention" in result)) {
        showToast("error", ("error" in result && result.error) || "Impossible de mettre à jour l'intervention.");
        return;
      }

      if (!result.intervention) {
        showToast("error", "Impossible de mettre à jour l'intervention.");
        return;
      }
      setInterventions((prev) =>
        prev.map((intervention) =>
          intervention.id === interventionId
            ? { ...intervention, ...result.intervention }
            : intervention
        )
      );
      showToast("success", "Intervention mise à jour");
    });
  };

  return (
    <section className="space-y-6">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.kind === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {!setupComplete && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Le module Coaching n'est pas encore initialisé en base</p>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Applique d'abord la migration `022_coaching_module.sql` dans Supabase, puis recharge la page. Tant que la base
                n'est pas prête, le cockpit reste en lecture de conception.
              </p>
              {setupError ? <p className="mt-2 text-xs text-amber-800/80">{setupError}</p> : null}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-navy" />
              <h3 className="text-lg font-semibold text-gray-900">Cohortes</h3>
            </div>
            <div className="mt-4 space-y-3">
              {cohorts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                  Aucune cohorte créée pour l'instant.
                </div>
              ) : (
                cohorts.map((cohort) => {
                  const stats = countByStatus(assignments.filter((assignment) => assignment.cohort_id === cohort.id));
                  const isActive = cohort.id === selectedCohortId;
                  return (
                    <button
                      key={cohort.id}
                      type="button"
                      onClick={() => setSelectedCohortId(cohort.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        isActive
                          ? "border-navy bg-navy/5"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{cohort.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{cohort.season}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white px-2.5 py-1 text-gray-600">{stats.total} élèves</span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-gray-600">{stats.unassigned} sans coach</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-navy" />
              <h3 className="text-lg font-semibold text-gray-900">Créer une cohorte</h3>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Nom</span>
                <input
                  value={cohortName}
                  onChange={(event) => setCohortName(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Saison</span>
                <input
                  value={season}
                  onChange={(event) => setSeason(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
                />
              </label>
              <button
                type="button"
                disabled={!setupComplete || isPending || !cohortName.trim() || !season.trim()}
                onClick={handleCreateCohort}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#112a48] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Créer la cohorte
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-navy" />
              <h3 className="text-lg font-semibold text-gray-900">Ajouter un élève</h3>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {selectedCohort ? `Ajout direct dans ${selectedCohort.name}.` : "Crée d'abord ou sélectionne une cohorte."}
            </p>
            <div className="mt-4 space-y-3">
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                disabled={!setupComplete || !selectedCohortId || availableStudents.length === 0}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40 disabled:bg-gray-100"
              >
                <option value="">Sélectionner un élève</option>
                {availableStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {displayName(student)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!setupComplete || isPending || !selectedCohortId || !selectedStudentId}
                onClick={handleAddStudent}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Ajouter à la cohorte
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-navy" />
              <h3 className="text-lg font-semibold text-gray-900">Élèves de la cohorte</h3>
            </div>
            <div className="mt-4 space-y-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un élève"
                  className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-navy/40"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | CoachingStudentStatus)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(COACHING_STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <select
                value={profileFilter}
                onChange={(event) => setProfileFilter(event.target.value as "all" | CoachingProfileType)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
              >
                <option value="all">Tous les profils</option>
                {COACHING_PROFILE_TYPES.map((profile) => (
                  <option key={profile.key} value={profile.key}>
                    {profile.shortLabel} · {profile.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 space-y-2">
              {filteredAssignments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                  Aucun élève ne correspond au filtre actuel.
                </div>
              ) : (
                filteredAssignments.map((assignment) => {
                  const meta = COACHING_STATUS_META[assignment.current_status];
                  const isSelected = assignment.id === selectedAssignmentId;
                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-navy bg-navy/5"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{displayName(assignment.student)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Coach: {displayName(assignment.coach)} · {meta.icon} {meta.label}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Élèves suivis", value: cohortStats.total, icon: Users },
              { label: "Verts", value: cohortStats.green, icon: CheckCheck },
              { label: "Oranges", value: cohortStats.orange, icon: ClipboardList },
              { label: "Rouges", value: cohortStats.red, icon: Siren },
              { label: "Actions ouvertes", value: actionQueue.length, icon: PhoneCall },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500">
                  <item.icon className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">{item.label}</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-navy">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-navy" />
                <h3 className="text-lg font-semibold text-gray-900">File d'actions de la cohorte</h3>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <QueueMetric label="Check-ins cette semaine" value={latestCheckinsThisWeek} />
                <QueueMetric label="Rouges" value={cohortStats.red} />
                <QueueMetric label="Sans coach" value={cohortStats.unassigned} />
              </div>
              <div className="mt-4 space-y-3">
                {actionQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                    Aucune intervention ouverte dans cette cohorte.
                  </div>
                ) : (
                  actionQueue.slice(0, 8).map((intervention) => {
                    const assignment = cohortAssignments.find((item) => item.id === intervention.coaching_student_id);
                    return (
                      <div key={intervention.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{displayName(assignment?.student)}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {INTERVENTION_CHANNEL_OPTIONS.find((option) => option.value === intervention.channel)?.label} · {INTERVENTION_STATUS_OPTIONS.find((option) => option.value === intervention.status)?.label}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedAssignmentId(intervention.coaching_student_id)}
                            className="text-xs font-semibold text-navy"
                          >
                            Ouvrir
                          </button>
                        </div>
                        <p className="mt-3 text-sm text-gray-700">{intervention.reason}</p>
                        {intervention.scheduled_at ? (
                          <p className="mt-2 text-xs text-gray-500">Prévu le {formatDate(intervention.scheduled_at, true)}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-navy" />
                <h3 className="text-lg font-semibold text-gray-900">Rythme de suivi recommandé</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <p>Vert: on automatise, mais on garde un check périodique et une possibilité de prise de rendez-vous.</p>
                <p>Orange: on recadre la semaine, on propose une ressource, puis on vérifie qu'une action coach existe.</p>
                <p>Rouge: on fait monter l'alerte tout de suite, avec call ou visio planifiée, pas juste un message.</p>
              </div>
              {latestCheckin ? (
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Dernier check-in de l'élève sélectionné</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {COACHING_STATUS_META[latestCheckin.computed_status].icon} {COACHING_STATUS_META[latestCheckin.computed_status].label}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">Semaine du {formatDate(latestCheckin.week_start)}</p>
                </div>
              ) : null}
            </div>
          </div>

          {!selectedAssignment || !assignmentDraft ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
              Sélectionne un élève pour afficher sa fiche coaching détaillée.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-semibold text-gray-900">{displayName(selectedAssignment.student)}</h3>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-semibold text-gray-700">
                        {COACHING_STATUS_META[assignmentDraft.current_status].icon} {COACHING_STATUS_META[assignmentDraft.current_status].label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{selectedAssignment.student?.email ?? "Email non disponible"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!assignmentDirty || isPending}
                    onClick={handleSaveAssignment}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#112a48] disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Enregistrer la fiche
                  </button>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-4">
                  <FieldSelect
                    label="Coach"
                    value={assignmentDraft.coach_id ?? ""}
                    onChange={(value) => setAssignmentDraft((prev) => prev ? { ...prev, coach_id: value || null } : prev)}
                    options={[
                      { value: "", label: "Aucun coach assigné" },
                      ...coaches.map((coach) => ({ value: coach.id, label: displayName(coach) })),
                    ]}
                  />
                  <FieldSelect
                    label="Profil"
                    value={assignmentDraft.profile_type}
                    onChange={(value) => setAssignmentDraft((prev) => prev ? { ...prev, profile_type: value as CoachingProfileType } : prev)}
                    options={COACHING_PROFILE_TYPES.map((profile) => ({
                      value: profile.key,
                      label: `${profile.shortLabel} · ${profile.title}`,
                    }))}
                  />
                  <FieldSelect
                    label="Statut"
                    value={assignmentDraft.current_status}
                    onChange={(value) => setAssignmentDraft((prev) => prev ? { ...prev, current_status: value as CoachingStudentStatus } : prev)}
                    options={Object.entries(COACHING_STATUS_META).map(([key, meta]) => ({
                      value: key,
                      label: `${meta.icon} ${meta.label}`,
                    }))}
                  />
                  <label className="flex h-full items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={assignmentDraft.onboarding_completed}
                      onChange={(event) =>
                        setAssignmentDraft((prev) => prev ? { ...prev, onboarding_completed: event.target.checked } : prev)
                      }
                      className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Onboarding terminé</p>
                      <p className="text-xs text-gray-500">Call élève et cadrage réalisés</p>
                    </div>
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Notes de risque</span>
                  <textarea
                    value={assignmentDraft.risk_notes}
                    onChange={(event) =>
                      setAssignmentDraft((prev) => prev ? { ...prev, risk_notes: event.target.value } : prev)
                    }
                    rows={4}
                    placeholder="Blocages, signaux faibles, retour d'appel, pistes d'action..."
                    className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm text-gray-900 outline-none focus:border-navy/40"
                  />
                </label>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-navy" />
                    <h3 className="text-lg font-semibold text-gray-900">Check-in hebdo</h3>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <FieldInput
                      label="Semaine du"
                      type="date"
                      value={weeklyDraft.week_start}
                      onChange={(value) => setWeeklyDraft((prev) => ({ ...prev, week_start: value }))}
                    />
                    <FieldSelect
                      label="Temps de travail"
                      value={weeklyDraft.hours_bucket}
                      onChange={(value) => setWeeklyDraft((prev) => ({ ...prev, hours_bucket: value as CoachingHoursBucket }))}
                      options={HOURS_OPTIONS}
                    />
                    <FieldSelect
                      label="Compréhension"
                      value={weeklyDraft.understanding_level}
                      onChange={(value) => setWeeklyDraft((prev) => ({ ...prev, understanding_level: value as CoachingUnderstandingLevel }))}
                      options={UNDERSTANDING_OPTIONS}
                    />
                    <FieldSelect
                      label="État mental"
                      value={weeklyDraft.mental_state}
                      onChange={(value) => setWeeklyDraft((prev) => ({ ...prev, mental_state: value as CoachingMentalState }))}
                      options={MENTAL_OPTIONS}
                    />
                    <FieldSelect
                      label="Blocage principal"
                      value={weeklyDraft.main_blocker}
                      onChange={(value) => setWeeklyDraft((prev) => ({ ...prev, main_blocker: value as CoachingMainBlocker }))}
                      options={BLOCKER_OPTIONS}
                    />
                    <FieldSelect
                      label="Dynamique"
                      value={weeklyDraft.momentum}
                      onChange={(value) => setWeeklyDraft((prev) => ({ ...prev, momentum: value as CoachingMomentum }))}
                      options={MOMENTUM_OPTIONS}
                    />
                  </div>
                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Message libre</span>
                    <textarea
                      value={weeklyDraft.free_text}
                      onChange={(event) => setWeeklyDraft((prev) => ({ ...prev, free_text: event.target.value }))}
                      rows={3}
                      className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm text-gray-900 outline-none focus:border-navy/40"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!setupComplete || isPending}
                    onClick={handleCreateCheckin}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#112a48] disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    Enregistrer le check-in
                  </button>
                  <div className="mt-5 space-y-3">
                    {selectedStudentCheckins.slice(0, 4).map((checkin) => (
                      <div key={checkin.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900">Semaine du {formatDate(checkin.week_start)}</p>
                          <span className="text-sm">{COACHING_STATUS_META[checkin.computed_status].icon} {COACHING_STATUS_META[checkin.computed_status].label}</span>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-gray-600">
                          {checkin.signal_reasons.map((reason) => (
                            <p key={reason}>• {reason}</p>
                          ))}
                          {checkin.free_text ? <p className="pt-2 text-gray-700">{checkin.free_text}</p> : null}
                        </div>
                      </div>
                    ))}
                    {selectedStudentCheckins.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                        Aucun check-in enregistré pour cet élève.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="h-5 w-5 text-navy" />
                    <h3 className="text-lg font-semibold text-gray-900">Interventions & rendez-vous</h3>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <FieldSelect
                      label="Responsable"
                      value={interventionDraft.ownerId ?? ""}
                      onChange={(value) => setInterventionDraft((prev) => ({ ...prev, ownerId: value || null }))}
                      options={[
                        { value: "", label: "Non assigné" },
                        ...coaches.map((coach) => ({ value: coach.id, label: displayName(coach) })),
                      ]}
                    />
                    <FieldSelect
                      label="Canal"
                      value={interventionDraft.channel}
                      onChange={(value) => setInterventionDraft((prev) => ({ ...prev, channel: value as CoachingInterventionChannel }))}
                      options={INTERVENTION_CHANNEL_OPTIONS}
                    />
                    <FieldInput
                      label="Date / heure"
                      type="datetime-local"
                      value={interventionDraft.scheduledAt}
                      onChange={(value) => setInterventionDraft((prev) => ({ ...prev, scheduledAt: value }))}
                    />
                  </div>
                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Pourquoi cette intervention ?</span>
                    <textarea
                      value={interventionDraft.reason}
                      onChange={(event) => setInterventionDraft((prev) => ({ ...prev, reason: event.target.value }))}
                      rows={3}
                      className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm text-gray-900 outline-none focus:border-navy/40"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!setupComplete || isPending || !interventionDraft.reason.trim()}
                    onClick={handleCreateIntervention}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#112a48] disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                    Créer l'intervention
                  </button>
                  <div className="mt-5 space-y-3">
                    {selectedStudentInterventions.map((intervention) => (
                      <div key={intervention.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {INTERVENTION_CHANNEL_OPTIONS.find((option) => option.value === intervention.channel)?.label}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Responsable: {displayName(intervention.owner)} · {INTERVENTION_STATUS_OPTIONS.find((option) => option.value === intervention.status)?.label}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {INTERVENTION_STATUS_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleUpdateInterventionStatus(intervention.id, option.value)}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  option.value === intervention.status
                                    ? "bg-navy text-white"
                                    : "bg-white text-gray-600 border border-gray-200"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-gray-700">{intervention.reason}</p>
                        <p className="mt-2 text-xs text-gray-500">
                          Créée le {formatDate(intervention.created_at, true)}
                          {intervention.scheduled_at ? ` · prévue le ${formatDate(intervention.scheduled_at, true)}` : ""}
                        </p>
                      </div>
                    ))}
                    {selectedStudentInterventions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                        Aucune intervention enregistrée pour cet élève.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-navy" />
                  <h3 className="text-lg font-semibold text-gray-900">Journal de notes</h3>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[220px,1fr]">
                  <FieldSelect
                    label="Type de note"
                    value={noteDraft.note_type}
                    onChange={(value) => setNoteDraft((prev) => ({ ...prev, note_type: value as CoachingNoteType }))}
                    options={NOTE_TYPE_OPTIONS}
                  />
                  <FieldInput
                    label="Titre"
                    value={noteDraft.title}
                    onChange={(value) => setNoteDraft((prev) => ({ ...prev, title: value }))}
                  />
                </div>
                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Contenu</span>
                  <textarea
                    value={noteDraft.content}
                    onChange={(event) => setNoteDraft((prev) => ({ ...prev, content: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm text-gray-900 outline-none focus:border-navy/40"
                  />
                </label>
                <button
                  type="button"
                  disabled={!setupComplete || isPending || !noteDraft.title.trim() || !noteDraft.content.trim()}
                  onClick={handleCreateNote}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#112a48] disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                  Ajouter la note
                </button>
                <div className="mt-5 space-y-3">
                  {selectedStudentNotes.map((note) => (
                    <div key={note.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{note.title}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {NOTE_TYPE_OPTIONS.find((option) => option.value === note.note_type)?.label} · {formatDate(note.created_at, true)}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">{displayName(note.author)}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{note.content}</p>
                    </div>
                  ))}
                  {selectedStudentNotes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                      Aucune note enregistrée pour cet élève.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-navy">{value}</p>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
      />
    </label>
  );
}

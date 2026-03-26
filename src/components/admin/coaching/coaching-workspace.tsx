"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import type { CoachingCohort, CoachingProfileType, CoachingStudent, CoachingStudentStatus, Profile } from "@/types/database";
import { COACHING_PROFILE_TYPES, COACHING_STATUS_META } from "@/lib/coaching";
import {
  addStudentsToCoachingCohort,
  createCoachingCohort,
  updateCoachingStudent,
} from "@/app/(admin)/admin/coaching/actions";

type CoachingAssignment = CoachingStudent & {
  student?: Profile;
  coach?: Profile | null;
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
};

type AssignmentDraft = {
  coach_id: string | null;
  profile_type: CoachingProfileType;
  current_status: CoachingStudentStatus;
  onboarding_completed: boolean;
  risk_notes: string;
};

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

export function CoachingWorkspace({
  setupComplete,
  setupError,
  initialCohorts,
  initialAssignments,
  students,
  coaches,
}: CoachingWorkspaceProps) {
  const [cohorts, setCohorts] = useState(initialCohorts);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(initialCohorts[0]?.id ?? null);
  const [season, setSeason] = useState("2026-2027");
  const [cohortName, setCohortName] = useState("Coaching PASS/LAS");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CoachingStudentStatus>("all");
  const [profileFilter, setProfileFilter] = useState<"all" | CoachingProfileType>("all");
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!selectedCohortId && cohorts[0]) {
      setSelectedCohortId(cohorts[0].id);
      return;
    }

    if (selectedCohortId && !cohorts.some((cohort) => cohort.id === selectedCohortId)) {
      setSelectedCohortId(cohorts[0]?.id ?? null);
    }
  }, [cohorts, selectedCohortId]);

  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedCohortId) ?? null;

  const cohortAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.cohort_id === selectedCohortId),
    [assignments, selectedCohortId]
  );

  const cohortStats = useMemo(() => countByStatus(cohortAssignments), [cohortAssignments]);

  const filteredAssignments = useMemo(() => {
    return cohortAssignments.filter((assignment) => {
      const haystack = `${displayName(assignment.student)} ${assignment.student?.email ?? ""}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && assignment.current_status !== statusFilter) return false;
      if (profileFilter !== "all" && assignment.profile_type !== profileFilter) return false;
      return true;
    });
  }, [cohortAssignments, search, statusFilter, profileFilter]);

  const availableStudents = useMemo(() => {
    const alreadyInCohort = new Set(cohortAssignments.map((assignment) => assignment.student_id));
    return students.filter((student) => !alreadyInCohort.has(student.id));
  }, [cohortAssignments, students]);

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

      setCohorts((prev) => [(result as any).cohort, ...prev]);
      setSelectedCohortId((result as any).cohort.id);
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

      const inserted = (result.rows ?? []).map((row) => ({
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
      setSelectedStudentId("");
      showToast("success", "Élève ajouté à la cohorte");
    });
  };

  const handleSaveAssignment = async (assignmentId: string, draft: AssignmentDraft) => {
    const result = await updateCoachingStudent({
      id: assignmentId,
      coach_id: draft.coach_id,
      profile_type: draft.profile_type,
      current_status: draft.current_status,
      onboarding_completed: draft.onboarding_completed,
      risk_notes: draft.risk_notes,
    });

    if (!("row" in result)) {
      showToast("error", ("error" in result && result.error) || "Impossible de mettre à jour la fiche élève.");
      return false;
    }

    const updatedRow = result.row;
    setAssignments((prev) =>
      prev.map((assignment) =>
        assignment.id === assignmentId
          ? {
              ...assignment,
              ...updatedRow,
              coach: coaches.find((coach) => coach.id === updatedRow?.coach_id) ?? null,
            }
          : assignment
      )
    );
    showToast("success", "Fiche élève mise à jour");
    return true;
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
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Élèves suivis", value: cohortStats.total },
              { label: "Verts", value: cohortStats.green },
              { label: "Oranges", value: cohortStats.orange },
              { label: "Rouges", value: cohortStats.red },
              { label: "Sans coach", value: cohortStats.unassigned },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-navy">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 xl:grid-cols-[1fr,180px,220px]">
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
          </div>

          {!selectedCohort ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
              Sélectionne ou crée une cohorte pour commencer à gérer les élèves.
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
              Aucun élève ne correspond au filtre actuel dans cette cohorte.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAssignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  coaches={coaches}
                  onSave={handleSaveAssignment}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AssignmentCard({
  assignment,
  coaches,
  onSave,
}: {
  assignment: CoachingAssignment;
  coaches: Profile[];
  onSave: (assignmentId: string, draft: AssignmentDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<AssignmentDraft>({
    coach_id: assignment.coach_id,
    profile_type: assignment.profile_type,
    current_status: assignment.current_status,
    onboarding_completed: assignment.onboarding_completed,
    risk_notes: assignment.risk_notes ?? "",
  });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDraft({
      coach_id: assignment.coach_id,
      profile_type: assignment.profile_type,
      current_status: assignment.current_status,
      onboarding_completed: assignment.onboarding_completed,
      risk_notes: assignment.risk_notes ?? "",
    });
  }, [assignment]);

  const isDirty =
    draft.coach_id !== assignment.coach_id ||
    draft.profile_type !== assignment.profile_type ||
    draft.current_status !== assignment.current_status ||
    draft.onboarding_completed !== assignment.onboarding_completed ||
    draft.risk_notes !== (assignment.risk_notes ?? "");

  const statusMeta = COACHING_STATUS_META[draft.current_status];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-gray-900">{displayName(assignment.student)}</p>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
              {statusMeta.icon} {statusMeta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{assignment.student?.email ?? "Email non disponible"}</p>
        </div>
        <button
          type="button"
          disabled={!isDirty || isPending}
          onClick={() =>
            startTransition(async () => {
              await onSave(assignment.id, draft);
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#112a48] disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Enregistrer
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Coach</span>
          <select
            value={draft.coach_id ?? ""}
            onChange={(event) => setDraft((prev) => ({ ...prev, coach_id: event.target.value || null }))}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
          >
            <option value="">Aucun coach assigné</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {displayName(coach)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Profil</span>
          <select
            value={draft.profile_type}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, profile_type: event.target.value as CoachingProfileType }))
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
          >
            {COACHING_PROFILE_TYPES.map((profile) => (
              <option key={profile.key} value={profile.key}>
                {profile.shortLabel} · {profile.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Statut</span>
          <select
            value={draft.current_status}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, current_status: event.target.value as CoachingStudentStatus }))
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-navy/40"
          >
            {Object.entries(COACHING_STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex h-full items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
          <input
            type="checkbox"
            checked={draft.onboarding_completed}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, onboarding_completed: event.target.checked }))
            }
            className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
          />
          <div>
            <p className="text-sm font-semibold text-gray-900">Onboarding terminé</p>
            <p className="text-xs text-gray-500">Call élève et cadrage initial effectués</p>
          </div>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Notes de risque</span>
        <textarea
          value={draft.risk_notes}
          onChange={(event) => setDraft((prev) => ({ ...prev, risk_notes: event.target.value }))}
          rows={4}
          placeholder="Blocages, signaux faibles, retour d'appel, pistes d'action..."
          className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm text-gray-900 outline-none focus:border-navy/40"
        />
      </label>
    </div>
  );
}

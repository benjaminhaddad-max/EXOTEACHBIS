"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PhoneCall,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  COACHING_MENTALITY_OPTIONS,
  COACHING_METHOD_OPTIONS,
  COACHING_SCHOOL_LEVEL_OPTIONS,
  COACHING_WORK_CAPACITY_OPTIONS,
  calculateConfidenceScore,
} from "@/lib/coaching-score";
import { formatAnswerValue, getCoachingFormAnswers } from "@/lib/form-builder";
import {
  createCoachCallSlot,
  saveStudentPointAProfile,
  updateBookingStatus,
  assignCoachToGroupe,
  removeCoachFromGroupe,
  assignCoachToBooking,
} from "@/app/(admin)/admin/coaching/actions";
import { CoachAvailability } from "./coach-availability";
import type {
  CoachGroupeAssignment,
  CoachingCallBooking,
  CoachingCallBookingStatus,
  CoachingCallSlot,
  CoachingIntakeForm,
  CoachingMentality,
  CoachingMethodLevel,
  CoachingSchoolLevel,
  CoachingStudentProfile,
  CoachingWorkCapacity,
  FormField,
  FormTemplate,
  Groupe,
  Profile,
} from "@/types/database";

type Toast = {
  kind: "success" | "error";
  message: string;
} | null;

type SlotDraft = {
  coachId: string;
  groupeId: string;
  startAt: string;
  endAt: string;
  location: string;
  notes: string;
};

type PointADraft = {
  mentality: CoachingMentality;
  schoolLevel: CoachingSchoolLevel;
  workCapacity: CoachingWorkCapacity;
  methodLevel: CoachingMethodLevel;
  coachReport: string;
};

type CoachingShellProps = {
  currentProfile: Profile;
  groupes: Groupe[];
  students: Profile[];
  coaches: Profile[];
  initialIntakeForms: CoachingIntakeForm[];
  initialSlots: CoachingCallSlot[];
  initialBookings: CoachingCallBooking[];
  initialPointAProfiles: CoachingStudentProfile[];
  formTemplate: FormTemplate | null;
  formFields: FormField[];
  coachAssignments?: CoachGroupeAssignment[];
  setupError?: string | null;
};

const BOOKING_STATUS_LABELS: Record<CoachingCallBookingStatus, string> = {
  booked: "Réservé",
  completed: "Effectué",
  cancelled: "Annulé",
  no_show: "Absent",
};

const BOOKING_STATUS_STYLES: Record<CoachingCallBookingStatus, string> = {
  booked: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-700",
};

function getDisplayName(profile?: Profile | null) {
  if (!profile) return "Utilisateur inconnu";
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return fullName || profile.email;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function initialPointADraft(profile?: CoachingStudentProfile | null): PointADraft {
  return {
    mentality: profile?.mentality ?? "passif",
    schoolLevel: profile?.school_level ?? "normal",
    workCapacity: profile?.work_capacity ?? "moyenne",
    methodLevel: profile?.method_level ?? "moyenne",
    coachReport: profile?.coach_report ?? "",
  };
}

export function CoachingShell({
  currentProfile,
  groupes,
  students,
  coaches,
  initialIntakeForms,
  initialSlots,
  initialBookings,
  initialPointAProfiles,
  formTemplate,
  formFields,
  coachAssignments = [],
  setupError,
}: CoachingShellProps) {
  const [intakeForms] = useState(initialIntakeForms);
  const [slots, setSlots] = useState(initialSlots);
  const [bookings, setBookings] = useState(initialBookings);
  const [pointAProfiles, setPointAProfiles] = useState(initialPointAProfiles);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id ?? "");
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const isCoach = currentProfile.role === "coach";

  const [slotDraft, setSlotDraft] = useState<SlotDraft>({
    coachId: isCoach ? currentProfile.id : coaches[0]?.id ?? "",
    groupeId: isCoach ? currentProfile.groupe_id ?? "" : groupes[0]?.id ?? "",
    startAt: "",
    endAt: "",
    location: "",
    notes: "",
  });
  const [pointADraft, setPointADraft] = useState<PointADraft>(
    initialPointADraft(initialPointAProfiles[0] ?? null)
  );

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const groupsById = useMemo(() => new Map(groupes.map((group) => [group.id, group])), [groupes]);
  const coachesById = useMemo(() => new Map(coaches.map((coach) => [coach.id, coach])), [coaches]);
  const formsByStudentId = useMemo(() => new Map(intakeForms.map((form) => [form.student_id, form])), [intakeForms]);
  const bookingsByStudentId = useMemo(() => {
    const map = new Map<string, CoachingCallBooking>();
    for (const booking of bookings) {
      if (!map.has(booking.student_id)) {
        map.set(booking.student_id, booking);
      }
    }
    return map;
  }, [bookings]);
  const bookingsBySlotId = useMemo(() => new Map(bookings.map((booking) => [booking.slot_id, booking])), [bookings]);
  const pointAByStudentId = useMemo(
    () => new Map(pointAProfiles.map((profile) => [profile.student_id, profile])),
    [pointAProfiles]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const haystack = `${getDisplayName(student)} ${student.email}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (groupFilter !== "all" && student.groupe_id !== groupFilter) return false;
      return true;
    });
  }, [groupFilter, search, students]);

  useEffect(() => {
    if (!filteredStudents.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0]?.id ?? "");
    }
  }, [filteredStudents, selectedStudentId]);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const selectedForm = selectedStudent ? formsByStudentId.get(selectedStudent.id) ?? null : null;
  const selectedBooking = selectedStudent ? bookingsByStudentId.get(selectedStudent.id) ?? null : null;
  const selectedBookingSlot = selectedBooking ? slots.find((slot) => slot.id === selectedBooking.slot_id) ?? null : null;
  const selectedPointA = selectedStudent ? pointAByStudentId.get(selectedStudent.id) ?? null : null;
  const selectedAnswers = useMemo(() => getCoachingFormAnswers(selectedForm), [selectedForm]);

  useEffect(() => {
    setPointADraft(initialPointADraft(selectedPointA));
  }, [selectedPointA?.id]);

  useEffect(() => {
    if (!isCoach && !slotDraft.coachId && coaches[0]) {
      setSlotDraft((current) => ({ ...current, coachId: coaches[0].id }));
    }
    if (!slotDraft.groupeId && (isCoach ? currentProfile.groupe_id : groupes[0]?.id)) {
      setSlotDraft((current) => ({
        ...current,
        groupeId: isCoach ? currentProfile.groupe_id ?? "" : groupes[0]?.id ?? "",
      }));
    }
  }, [coaches, currentProfile.groupe_id, groupes, isCoach, slotDraft.coachId, slotDraft.groupeId]);

  const stats = useMemo(() => {
    const formsCount = students.filter((student) => formsByStudentId.has(student.id)).length;
    const bookingsCount = students.filter((student) => bookingsByStudentId.has(student.id)).length;
    const pointACount = students.filter((student) => pointAByStudentId.has(student.id)).length;
    return [
      { label: "Élèves suivis", value: students.length, hint: "Élèves visibles dans ton périmètre" },
      { label: "Formulaires reçus", value: formsCount, hint: "Élèves qui ont rempli leur onboarding" },
      { label: "Rendez-vous pris", value: bookingsCount, hint: "Appels onboarding déjà réservés" },
      { label: "Points A validés", value: pointACount, hint: "Profils internes déjà scorés" },
    ];
  }, [bookingsByStudentId, formsByStudentId, pointAByStudentId, students]);

  const scheduleItems = useMemo(() => {
    return slots
      .filter((slot) => (isCoach ? slot.coach_id === currentProfile.id : true))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [currentProfile.id, isCoach, slots]);

  const scheduleDays = useMemo(() => {
    const groups = new Map<string, CoachingCallSlot[]>();
    for (const slot of scheduleItems) {
      const key = new Date(slot.start_at).toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(slot);
    }
    return [...groups.entries()];
  }, [scheduleItems]);

  const computedInternalScore = useMemo(
    () =>
      calculateConfidenceScore({
        mentality: pointADraft.mentality,
        schoolLevel: pointADraft.schoolLevel,
        workCapacity: pointADraft.workCapacity,
        methodLevel: pointADraft.methodLevel,
      }),
    [pointADraft]
  );

  const handleCreateSlot = () => {
    startTransition(async () => {
      const response = await createCoachCallSlot({
        coach_id: isCoach ? undefined : slotDraft.coachId,
        groupe_id: isCoach ? undefined : slotDraft.groupeId,
        start_at: slotDraft.startAt,
        end_at: slotDraft.endAt,
        location: slotDraft.location,
        notes: slotDraft.notes,
      });

      if (!("success" in response)) {
        setToast({ kind: "error", message: String((response as any).error ?? "Une erreur est survenue.") });
        return;
      }

      const createdSlot = response.slot;
      if (!createdSlot) {
        setToast({ kind: "error", message: "Créneau non retourné par le serveur." });
        return;
      }

      setSlots((current) =>
        [...current, createdSlot].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      );
      setSlotDraft((current) => ({
        ...current,
        startAt: "",
        endAt: "",
        location: "",
        notes: "",
      }));
      setToast({ kind: "success", message: "Créneau ajouté au calendrier coach." });
    });
  };

  const handleBookingStatusUpdate = (status: CoachingCallBookingStatus) => {
    if (!selectedBooking) return;
    startTransition(async () => {
      const response = await updateBookingStatus({
        bookingId: selectedBooking.id,
        status,
      });

      if (!("success" in response)) {
        setToast({ kind: "error", message: String((response as any).error ?? "Une erreur est survenue.") });
        return;
      }

      const updatedBooking = response.booking;
      if (!updatedBooking) {
        setToast({ kind: "error", message: "Rendez-vous non retourné par le serveur." });
        return;
      }

      setBookings((current) => current.map((booking) => (booking.id === updatedBooking.id ? updatedBooking : booking)));
      setToast({ kind: "success", message: "Statut du rendez-vous mis à jour." });
    });
  };

  const handleSavePointA = () => {
    if (!selectedStudent || !selectedStudent.groupe_id) {
      setToast({ kind: "error", message: "Classe élève introuvable." });
      return;
    }

    const studentGroupId = selectedStudent.groupe_id;

    startTransition(async () => {
      const response = await saveStudentPointAProfile({
        student_id: selectedStudent.id,
        groupe_id: studentGroupId,
        coach_id:
          selectedBooking?.coach_id ??
          selectedPointA?.coach_id ??
          (currentProfile.role === "coach" ? currentProfile.id : null),
        intake_form_id: selectedForm?.id ?? null,
        booking_id: selectedBooking?.id ?? null,
        mentality: pointADraft.mentality,
        school_level: pointADraft.schoolLevel,
        work_capacity: pointADraft.workCapacity,
        method_level: pointADraft.methodLevel,
        coach_report: pointADraft.coachReport,
      });

      if (!("success" in response)) {
        setToast({ kind: "error", message: String((response as any).error ?? "Une erreur est survenue.") });
        return;
      }

      const savedProfile = response.profile;
      if (!savedProfile) {
        setToast({ kind: "error", message: "Profil interne non retourné par le serveur." });
        return;
      }

      setPointAProfiles((current) => {
        const withoutStudent = current.filter((profile) => profile.student_id !== savedProfile.student_id);
        return [savedProfile, ...withoutStudent];
      });
      setToast({ kind: "success", message: "Point A enregistré côté staff." });
    });
  };

  const canAccess = ["admin", "superadmin", "coach"].includes(currentProfile.role);

  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Cet espace est réservé aux coachs et à l'administration.
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        La base coaching n'est pas prête: {setupError}. Applique d'abord la migration
        <span className="mx-1 font-semibold">`023_reset_coaching_first_brick.sql`</span>
        puis recharge la page.
      </div>
    );
  }

  if (isCoach && groupes.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Ton profil coach n&apos;est relié à aucune classe. Un admin doit t&apos;assigner à une ou plusieurs classes.
      </div>
    );
  }

  // ─── Coach-specific dashboard ───────────────────────────────────────────────
  if (isCoach) {
    const coachBookings = bookings.filter((b) => b.coach_id === currentProfile.id || slots.some((s) => s.id === b.slot_id && s.coach_id === currentProfile.id));
    const upcomingBookings = coachBookings.filter((b) => b.status === "booked");

    return (
      <div className="space-y-6">
        {toast && (
          <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
            {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.message}
          </div>
        )}

        {/* Coach header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#12314d]">Bonjour {currentProfile.first_name ?? "Coach"}</h2>
            <p className="text-sm text-[#7d8c9e]">
              {groupes.map((g) => g.name).join(", ")} · {upcomingBookings.length} RDV à venir
            </p>
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5edf6] px-3 py-2 text-xs font-medium text-[#5d7085] hover:bg-[#f8fbfe]"
          >
            <UserRound className="h-3.5 w-3.5" />
            Vue élève
          </a>
        </div>

        {/* Tabs */}
        <CoachDashboardTabs
          slots={slots}
          bookings={bookings}
          students={students}
          groupes={groupes}
          coaches={coaches}
          coachId={currentProfile.id}
          intakeForms={intakeForms}
          formFields={formFields}
          formsByStudentId={formsByStudentId}
          bookingsByStudentId={bookingsByStudentId}
          pointAByStudentId={pointAByStudentId}
          pointAProfiles={pointAProfiles}
          coachesById={coachesById}
          groupsById={groupsById}
        />
      </div>
    );
  }

  // ─── Admin tabbed view ────────────────────────────────────────────────────
  const [adminTab, setAdminTab] = useState<"coachs" | "planning" | "eleves" | "rdv">("coachs");

  const adminTabs = [
    { key: "coachs" as const, label: "Coachs", count: coaches.length },
    { key: "planning" as const, label: "Planning", count: slots.filter((s) => new Date(s.start_at) >= new Date()).length },
    { key: "eleves" as const, label: "Élèves", count: students.length },
    { key: "rdv" as const, label: "Rendez-vous", count: bookings.filter((b) => b.status === "booked").length },
  ];

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#12314d]">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
        {adminTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setAdminTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              adminTab === t.key ? "bg-white text-[#12314d] shadow-sm" : "text-gray-500 hover:text-[#12314d]"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${adminTab === t.key ? "bg-[#12314d] text-white" : "bg-gray-200 text-gray-600"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Coachs ── */}
      {adminTab === "coachs" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-base font-semibold text-[#12314d]">Gestion des coachs</h3>
            <p className="text-xs text-gray-500">Assigne des coachs à des classes. Un coach peut gérer plusieurs classes.</p>

            <div className="mt-4 space-y-3">
              {coaches.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Aucun coach (rôle = coach) dans la base.</p>
              ) : (
                coaches.map((coach) => {
                  const assigned = coachAssignments.filter((a) => a.coach_id === coach.id);
                  const assignedIds = new Set(assigned.map((a) => a.groupe_id));
                  const unassigned = groupes.filter((g) => !assignedIds.has(g.id));
                  return (
                    <div key={coach.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12314d] text-[10px] font-bold text-white">
                            {(coach.first_name?.[0] ?? "").toUpperCase()}{(coach.last_name?.[0] ?? "").toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#12314d]">{getDisplayName(coach)}</p>
                            <p className="text-xs text-gray-500">{coach.email}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          {assigned.length} classe{assigned.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {/* Assigned groups */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {assigned.map((a) => {
                          const g = groupsById.get(a.groupe_id);
                          return (
                            <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              {g?.name ?? "?"}
                              <button
                                onClick={() => { startTransition(async () => { const res = await removeCoachFromGroupe({ coach_id: coach.id, groupe_id: a.groupe_id }); if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" }); else setToast({ kind: "success", message: "Coach retiré" }); }); }}
                                className="ml-0.5 text-emerald-500 hover:text-red-500"
                              >×</button>
                            </span>
                          );
                        })}
                        {/* Add group dropdown */}
                        {unassigned.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const gId = e.target.value;
                              startTransition(async () => {
                                const res = await assignCoachToGroupe({ coach_id: coach.id, groupe_id: gId });
                                if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" });
                                else setToast({ kind: "success", message: "Coach assigné" });
                              });
                              e.target.value = "";
                            }}
                            className="rounded-md border border-dashed border-gray-300 bg-white px-2 py-1 text-[10px] text-gray-500"
                          >
                            <option value="">+ Ajouter classe</option>
                            {unassigned.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Planning ── */}
      {adminTab === "planning" && (
        <div className="space-y-4">
          {/* Slot creation form */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-base font-semibold text-[#12314d]">Créer un créneau</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <select value={slotDraft.coachId} onChange={(e) => setSlotDraft((c) => ({ ...c, coachId: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Coach</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{getDisplayName(c)}</option>)}
              </select>
              <select value={slotDraft.groupeId} onChange={(e) => setSlotDraft((c) => ({ ...c, groupeId: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Classe</option>
                {groupes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input type="datetime-local" value={toLocalDateTimeInput(slotDraft.startAt)} onChange={(e) => setSlotDraft((c) => ({ ...c, startAt: fromLocalDateTimeInput(e.target.value) }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <input type="datetime-local" value={toLocalDateTimeInput(slotDraft.endAt)} onChange={(e) => setSlotDraft((c) => ({ ...c, endAt: fromLocalDateTimeInput(e.target.value) }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <button onClick={handleCreateSlot} disabled={isPending || !slotDraft.startAt || !slotDraft.endAt || !slotDraft.coachId || !slotDraft.groupeId} className="rounded-lg bg-[#12314d] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {isPending ? "..." : "+ Ajouter"}
              </button>
            </div>
          </div>
          {/* Schedule */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-base font-semibold text-[#12314d]">Calendrier</h3>
            <div className="mt-3 space-y-2">
              {scheduleDays.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Aucun créneau.</p>
              ) : (
                scheduleDays.map(([day, daySlots]) => (
                  <div key={day} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold capitalize text-gray-700">{formatDayLabel(day)}</p>
                    <div className="mt-2 space-y-1">
                      {daySlots.map((slot) => {
                        const booking = bookingsBySlotId.get(slot.id) ?? null;
                        const student = booking ? students.find((s) => s.id === booking.student_id) : null;
                        const coach = coachesById.get(slot.coach_id);
                        const groupe = groupsById.get(slot.groupe_id);
                        return (
                          <div key={slot.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[#12314d]">{formatDateTime(slot.start_at)}</span>
                              <span className="text-gray-400">{coach ? getDisplayName(coach) : "?"}</span>
                              {groupe && <span className="text-gray-400">· {groupe.name}</span>}
                              {student && <span className="text-blue-600">→ {getDisplayName(student)}</span>}
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${booking ? BOOKING_STATUS_STYLES[booking.status] : "bg-emerald-100 text-emerald-700"}`}>
                              {booking ? BOOKING_STATUS_LABELS[booking.status] : "Libre"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Élèves ── */}
      {adminTab === "eleves" && (
        <div className="grid gap-5 xl:grid-cols-[340px,1fr]">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full bg-transparent text-sm outline-none" />
            </label>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="all">Toutes les classes</option>
              {groupes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto">
              {filteredStudents.map((student) => {
                const form = formsByStudentId.get(student.id);
                const booking = bookingsByStudentId.get(student.id);
                const isSelected = student.id === selectedStudentId;
                return (
                  <button key={student.id} onClick={() => setSelectedStudentId(student.id)} className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${isSelected ? "border-[#12314d] bg-[#12314d]/5" : "border-gray-100 hover:border-gray-300"}`}>
                    <p className="text-sm font-medium text-[#12314d]">{getDisplayName(student)}</p>
                    <div className="mt-1 flex gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${form ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{form ? "Form ✓" : "Form ✗"}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${booking ? BOOKING_STATUS_STYLES[booking.status] : "bg-gray-100 text-gray-500"}`}>{booking ? BOOKING_STATUS_LABELS[booking.status] : "Pas de RDV"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            {!selectedStudent ? (
              <p className="py-10 text-center text-sm text-gray-400">Sélectionne un élève.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#12314d]">{getDisplayName(selectedStudent)}</h2>
                    <p className="text-xs text-gray-500">{selectedStudent.email}{selectedStudent.groupe_id ? ` · ${groupsById.get(selectedStudent.groupe_id)?.name}` : ""}</p>
                  </div>
                  {selectedPointA && (
                    <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">{selectedPointA.confidence_score}/100</span>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryCard icon={<ClipboardList className="h-4 w-4 text-[#12314d]" />} title="Formulaire" value={selectedForm ? "Rempli" : "En attente"} subtitle={selectedForm ? `Le ${formatDateTime(selectedForm.submitted_at)}` : "Pas encore répondu"} />
                  <SummaryCard icon={<PhoneCall className="h-4 w-4 text-[#12314d]" />} title="RDV" value={selectedBooking ? BOOKING_STATUS_LABELS[selectedBooking.status] : "À réserver"} subtitle={selectedBookingSlot ? formatDateTime(selectedBookingSlot.start_at) : "—"} />
                  <SummaryCard icon={<ShieldCheck className="h-4 w-4 text-[#12314d]" />} title="Point A" value={selectedPointA ? `${selectedPointA.confidence_score}/100` : "À valider"} subtitle={selectedPointA ? "Staff uniquement" : "Après l'appel"} />
                </div>

                {/* Form answers */}
                {selectedForm && (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-[#12314d]">Formulaire élève</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {formFields.length > 0
                        ? formFields.map((field) => <AnswerField key={field.id} label={field.label} value={selectedAnswers[field.key]} className={field.width === "full" ? "md:col-span-2" : ""} />)
                        : Object.entries(selectedAnswers).map(([key, value]) => <AnswerField key={key} label={key} value={value} />)}
                    </div>
                  </div>
                )}

                {/* Booking status */}
                {selectedBooking && (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-[#12314d]">Rendez-vous</h3>
                    <p className="mt-1 text-xs text-gray-500">{formatDateTime(selectedBookingSlot?.start_at)} · {getDisplayName(coachesById.get(selectedBooking.coach_id) ?? null)}</p>
                    <div className="mt-3 flex gap-1.5">
                      {(["booked", "completed", "cancelled", "no_show"] as CoachingCallBookingStatus[]).map((status) => (
                        <button key={status} onClick={() => handleBookingStatusUpdate(status)} disabled={isPending} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${selectedBooking.status === status ? "bg-[#12314d] text-white" : "border border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                          {BOOKING_STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Point A */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#12314d]">Évaluation coach</h3>
                    <span className="text-lg font-bold text-[#12314d]">{computedInternalScore}/100</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <SelectField label="Mentalité" value={pointADraft.mentality} options={COACHING_MENTALITY_OPTIONS} onChange={(v) => setPointADraft((c) => ({ ...c, mentality: v as CoachingMentality }))} />
                    <SelectField label="Niveau lycée" value={pointADraft.schoolLevel} options={COACHING_SCHOOL_LEVEL_OPTIONS} onChange={(v) => setPointADraft((c) => ({ ...c, schoolLevel: v as CoachingSchoolLevel }))} />
                    <SelectField label="Capacité travail" value={pointADraft.workCapacity} options={COACHING_WORK_CAPACITY_OPTIONS} onChange={(v) => setPointADraft((c) => ({ ...c, workCapacity: v as CoachingWorkCapacity }))} />
                    <SelectField label="Méthode" value={pointADraft.methodLevel} options={COACHING_METHOD_OPTIONS} onChange={(v) => setPointADraft((c) => ({ ...c, methodLevel: v as CoachingMethodLevel }))} />
                  </div>
                  <textarea rows={4} value={pointADraft.coachReport} onChange={(e) => setPointADraft((c) => ({ ...c, coachReport: e.target.value }))} placeholder="Rapport coach..." className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none" />
                  <button onClick={handleSavePointA} disabled={isPending || !selectedForm} className="mt-3 rounded-lg bg-[#12314d] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    {isPending ? "..." : "Enregistrer le point A"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: RDV ── */}
      {adminTab === "rdv" && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-[#12314d]">Tous les rendez-vous</h3>
          <div className="mt-3 space-y-1.5">
            {bookings.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Aucun rendez-vous.</p>
            ) : (
              bookings.map((booking) => {
                const slot = slots.find((s) => s.id === booking.slot_id);
                const student = students.find((s) => s.id === booking.student_id);
                const coach = coachesById.get(booking.coach_id);
                return (
                  <div key={booking.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CalendarClock className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-[#12314d]">{slot ? formatDateTime(slot.start_at) : "?"}</p>
                        <p className="text-xs text-gray-500">
                          {student ? getDisplayName(student) : "?"} → {coach ? getDisplayName(coach) : "Pas de coach"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BOOKING_STATUS_STYLES[booking.status]}`}>
                        {BOOKING_STATUS_LABELS[booking.status]}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        {icon}
        {title}
      </div>
      <p className="mt-3 text-xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function AnswerField({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: string | string[] | null;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-gray-50 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">{formatAnswerValue(value ?? "").trim() || "—"}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
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

// ─── Coach Dashboard Tabs ───────────────────────────────────────────────────
function CoachDashboardTabs({
  slots,
  bookings,
  students,
  groupes,
  coaches,
  coachId,
  intakeForms,
  formFields,
  formsByStudentId,
  bookingsByStudentId,
  pointAByStudentId,
  pointAProfiles,
  coachesById,
  groupsById,
}: {
  slots: CoachingCallSlot[];
  bookings: CoachingCallBooking[];
  students: Profile[];
  groupes: Groupe[];
  coaches: Profile[];
  coachId: string;
  intakeForms: CoachingIntakeForm[];
  formFields: FormField[];
  formsByStudentId: Map<string, CoachingIntakeForm>;
  bookingsByStudentId: Map<string, CoachingCallBooking>;
  pointAByStudentId: Map<string, CoachingStudentProfile>;
  pointAProfiles: CoachingStudentProfile[];
  coachesById: Map<string, Profile>;
  groupsById: Map<string, Groupe>;
}) {
  const [tab, setTab] = useState<"planning" | "eleves" | "rdv">("planning");

  const coachBookings = useMemo(
    () => bookings.filter((b) => b.coach_id === coachId).sort((a, b) => new Date(b.booked_at).getTime() - new Date(a.booked_at).getTime()),
    [bookings, coachId]
  );

  const tabs = [
    { key: "planning" as const, label: "Planning", count: slots.filter((s) => s.coach_id === coachId && new Date(s.start_at) >= new Date()).length },
    { key: "eleves" as const, label: "Élèves", count: students.length },
    { key: "rdv" as const, label: "Rendez-vous", count: coachBookings.filter((b) => b.status === "booked").length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-[#e5edf6] bg-[#f8fbfe] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${
              tab === t.key ? "bg-white text-[#12314d] shadow-sm" : "text-[#7d8c9e] hover:text-[#12314d]"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${tab === t.key ? "bg-[#12314d] text-white" : "bg-[#e5edf6] text-[#5d7085]"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "planning" && (
        <CoachAvailability
          coachId={coachId}
          slots={slots.filter((s) => s.coach_id === coachId)}
          bookings={bookings}
          groupes={groupes}
        />
      )}

      {tab === "eleves" && (
        <div className="space-y-2">
          {students.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#7d8c9e]">Aucun élève dans tes classes.</p>
          ) : (
            students.map((student) => {
              const form = formsByStudentId.get(student.id);
              const booking = bookingsByStudentId.get(student.id);
              const groupe = student.groupe_id ? groupsById.get(student.groupe_id) : null;
              return (
                <div key={student.id} className="flex items-center justify-between rounded-xl border border-[#e5edf6] bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12314d] text-[10px] font-bold text-white">
                      {(student.first_name?.[0] ?? "").toUpperCase()}{(student.last_name?.[0] ?? "").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#12314d]">{getDisplayName(student)}</p>
                      <p className="text-xs text-[#7d8c9e]">{groupe?.name ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {form ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Formulaire ✓</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Pas de formulaire</span>
                    )}
                    {booking ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BOOKING_STATUS_STYLES[booking.status as CoachingCallBookingStatus] ?? "bg-gray-100 text-gray-600"}`}>
                        {BOOKING_STATUS_LABELS[booking.status as CoachingCallBookingStatus] ?? booking.status}
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Pas de RDV</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "rdv" && (
        <div className="space-y-2">
          {coachBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#7d8c9e]">Aucun rendez-vous pour l&apos;instant.</p>
          ) : (
            coachBookings.map((booking) => {
              const slot = slots.find((s) => s.id === booking.slot_id);
              const student = students.find((s) => s.id === booking.student_id);
              return (
                <div key={booking.id} className="flex items-center justify-between rounded-xl border border-[#e5edf6] bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CalendarClock className="h-4 w-4 text-[#5d7085]" />
                    <div>
                      <p className="text-sm font-medium text-[#12314d]">
                        {slot ? formatDateTime(slot.start_at) : "Date inconnue"}
                      </p>
                      <p className="text-xs text-[#7d8c9e]">
                        {student ? getDisplayName(student) : "Élève inconnu"}
                        {slot?.location ? ` · ${slot.location}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BOOKING_STATUS_STYLES[booking.status as CoachingCallBookingStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {BOOKING_STATUS_LABELS[booking.status as CoachingCallBookingStatus] ?? booking.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

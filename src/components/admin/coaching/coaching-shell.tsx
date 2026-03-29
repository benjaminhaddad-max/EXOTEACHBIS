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
import CoachingSidebar from "./coaching-sidebar";
import { CoachingWeekView } from "./coaching-week-view";
import CoachingRdvView from "./coaching-rdv-view";
import { CoachingChatThreadsPanel } from "./coaching-chat-threads-panel";
import { CoachingRdvPanel } from "./coaching-rdv-panel";
import { CoachingVideosCrud } from "./coaching-videos-crud";
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
  CoachingRdvRequest,
  CoachingVideo,
  Dossier,
  FormField,
  FormTemplate,
  Groupe,
  Profile,
} from "@/types/database";
import type { QaThread } from "@/types/qa";

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
  dossiers?: Dossier[];
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
  coachingThreads?: QaThread[];
  coachingRdvRequests?: CoachingRdvRequest[];
  coachingVideos?: CoachingVideo[];
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
    mentality: (profile?.mentality ?? "passif") as CoachingMentality,
    schoolLevel: (profile?.school_level ?? "normal") as CoachingSchoolLevel,
    workCapacity: (profile?.work_capacity ?? "moyenne") as CoachingWorkCapacity,
    methodLevel: (profile?.method_level ?? "moyenne") as CoachingMethodLevel,
    coachReport: profile?.coach_report ?? "",
  };
}

export function CoachingShell({
  currentProfile,
  dossiers = [],
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
  coachingThreads = [],
  coachingRdvRequests = [],
  coachingVideos = [],
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

  // ─── Admin sidebar + main layout ────────────────────────────────────────────
  const [adminView, setAdminView] = useState<"planning" | "rdv" | "chat" | "rdv_requests" | "videos">("chat");
  const [selectedGroupeIds, setSelectedGroupeIds] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const toggleGroupe = (id: string) => {
    setSelectedGroupeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter data by selected groupes
  const filteredSlots = useMemo(() => {
    if (selectedGroupeIds.size === 0) return slots;
    return slots.filter((s) => selectedGroupeIds.has(s.groupe_id));
  }, [slots, selectedGroupeIds]);

  const filteredBookings = useMemo(() => {
    if (selectedGroupeIds.size === 0) return bookings;
    return bookings.filter((b) => selectedGroupeIds.has(b.groupe_id));
  }, [bookings, selectedGroupeIds]);

  const handleAdminAssignCoach = (coachId: string, groupeId: string) => {
    startTransition(async () => {
      const res = await assignCoachToGroupe({ coach_id: coachId, groupe_id: groupeId });
      if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" });
      else setToast({ kind: "success", message: "Coach assigné" });
    });
  };

  const handleAdminRemoveCoach = (coachId: string, groupeId: string) => {
    startTransition(async () => {
      const res = await removeCoachFromGroupe({ coach_id: coachId, groupe_id: groupeId });
      if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" });
      else setToast({ kind: "success", message: "Coach retiré" });
    });
  };

  const handleAdminCreateSlot = (data: { coach_id: string; groupe_id: string; start_at: string; end_at: string; location?: string }) => {
    startTransition(async () => {
      const res = await createCoachCallSlot(data);
      if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" });
      else setToast({ kind: "success", message: "Créneau créé" });
    });
  };

  const handleAdminBookingStatus = (bookingId: string, status: CoachingCallBookingStatus) => {
    startTransition(async () => {
      const res = await updateBookingStatus({ bookingId, status });
      if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" });
      else setToast({ kind: "success", message: "Statut mis à jour" });
    });
  };

  const handleAdminAssignBookingCoach = (bookingId: string, coachId: string) => {
    startTransition(async () => {
      const res = await assignCoachToBooking({ booking_id: bookingId, coach_id: coachId });
      if ("error" in res) setToast({ kind: "error", message: res.error ?? "Erreur" });
      else setToast({ kind: "success", message: "Coach réassigné" });
    });
  };

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6 xl:-mx-8 -mt-5" style={{ height: "calc(100vh - 80px)" }}>
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Sidebar */}
      <CoachingSidebar
        dossiers={dossiers}
        groupes={groupes}
        coaches={coaches}
        coachAssignments={coachAssignments}
        selectedGroupeIds={selectedGroupeIds}
        onToggleGroupe={toggleGroupe}
        view={adminView}
        onViewChange={setAdminView}
        onAssignCoach={handleAdminAssignCoach}
        onRemoveCoach={handleAdminRemoveCoach}
        isCoach={isCoach}
      />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-[#f5f6fa] p-5">

        {adminView === "planning" && (
          <CoachingWeekView
            slots={filteredSlots}
            bookings={filteredBookings}
            students={students}
            coaches={coaches}
            groupes={groupes}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            onCreateSlot={handleAdminCreateSlot}
          />
        )}

        {adminView === "rdv" && (
          <CoachingRdvView
            bookings={filteredBookings}
            slots={slots}
            students={students}
            coaches={coaches}
            groupes={groupes}
            onStatusChange={handleAdminBookingStatus}
            onAssignCoach={handleAdminAssignBookingCoach}
          />
        )}

        {adminView === "chat" && (
          <CoachingChatThreadsPanel
            threads={coachingThreads}
            coaches={coaches}
            students={students}
            currentProfile={currentProfile}
          />
        )}

        {adminView === "rdv_requests" && (
          <CoachingRdvPanel
            rdvRequests={coachingRdvRequests}
            coaches={coaches}
            students={students}
          />
        )}

        {adminView === "videos" && !isCoach && (
          <CoachingVideosCrud
            videos={coachingVideos}
            universities={dossiers.filter(d => d.dossier_type === "university")}
          />
        )}
      </div>
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

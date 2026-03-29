"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  Monitor,
  Phone,
  PhoneCall,
  MessageSquare as ChatIcon,
  MapPin,
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
  CoachRecurringAvailability,
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
  recurringAvailability?: CoachRecurringAvailability[];
  setupError?: string | null;
};

const SLOT_TYPE_ICONS: Record<string, typeof Monitor> = {
  rdv_physique: MapPin,
  rdv_visio: Monitor,
  rdv_tel: Phone,
  chat: ChatIcon,
};

const SLOT_TYPE_LABELS: Record<string, string> = {
  rdv_physique: "Présentiel",
  rdv_visio: "Visio",
  rdv_tel: "Téléphone",
  chat: "Chat",
};

const SLOT_TYPE_COLORS: Record<string, string> = {
  rdv_physique: "text-blue-600 bg-blue-50",
  rdv_visio: "text-purple-600 bg-purple-50",
  rdv_tel: "text-green-600 bg-green-50",
  chat: "text-amber-600 bg-amber-50",
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
  recurringAvailability = [],
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
            href="/vue-eleve"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5edf6] px-3 py-2 text-xs font-medium text-[#5d7085] hover:bg-[#f8fbfe]"
          >
            <UserRound className="h-3.5 w-3.5" />
            Vue élève
          </a>
        </div>

        {/* Weekly schedule overview */}
        <CoachWeeklyOverview
          slots={slots.filter((s) => s.coach_id === currentProfile.id)}
          bookings={coachBookings}
          students={students}
          recurringAvailability={(recurringAvailability ?? []).filter((r) => r.coach_id === currentProfile.id)}
        />

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
          recurringAvailability={recurringAvailability}
        />
      </div>
    );
  }

  // ─── Admin layout — tabs + pill filters (no sidebar) ────────────────────────
  const [adminView, setAdminView] = useState<"chat" | "rdv_requests" | "videos" | "planning" | "rdv">("chat");
  const [filterFormationId, setFilterFormationId] = useState("");
  const [filterUniversityId, setFilterUniversityId] = useState("");
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Build formation structure from dossiers
  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const universities = useMemo(() => {
    if (!filterFormationId) return dossiers.filter(d => d.dossier_type === "university");
    return dossiers.filter(d => d.dossier_type === "university" && d.parent_id === filterFormationId);
  }, [dossiers, filterFormationId]);

  // Compute which groupeIds match the current filter
  const filteredGroupeIds = useMemo(() => {
    if (!filterFormationId && !filterUniversityId) return null; // null = no filter
    if (filterUniversityId) {
      return new Set(groupes.filter(g => g.formation_dossier_id === filterUniversityId).map(g => g.id));
    }
    if (filterFormationId) {
      const uniIds = new Set(dossiers.filter(d => d.dossier_type === "university" && d.parent_id === filterFormationId).map(d => d.id));
      return new Set(groupes.filter(g => g.formation_dossier_id && uniIds.has(g.formation_dossier_id)).map(g => g.id));
    }
    return null;
  }, [dossiers, filterFormationId, filterUniversityId, groupes]);

  // Filter data
  const filteredSlots = useMemo(() => {
    if (!filteredGroupeIds) return slots;
    return slots.filter((s) => filteredGroupeIds.has(s.groupe_id));
  }, [slots, filteredGroupeIds]);

  const filteredBookings = useMemo(() => {
    if (!filteredGroupeIds) return bookings;
    return bookings.filter((b) => filteredGroupeIds.has(b.groupe_id));
  }, [bookings, filteredGroupeIds]);

  // Build a set of student IDs matching the filter for threads/rdv
  const filteredStudentIds = useMemo(() => {
    if (!filteredGroupeIds) return null;
    return new Set(students.filter(s => s.groupe_id && filteredGroupeIds.has(s.groupe_id)).map(s => s.id));
  }, [filteredGroupeIds, students]);

  const filteredThreads = useMemo(() => {
    if (!filteredStudentIds) return coachingThreads;
    return coachingThreads.filter(t => filteredStudentIds.has(t.student_id));
  }, [coachingThreads, filteredStudentIds]);

  const filteredRdvRequests = useMemo(() => {
    if (!filteredGroupeIds) return coachingRdvRequests;
    return coachingRdvRequests.filter(r => filteredGroupeIds.has(r.groupe_id));
  }, [coachingRdvRequests, filteredGroupeIds]);

  // Counts for pills
  const studentCountByOffer = useMemo(() => {
    const map = new Map<string, number>();
    for (const offer of offers) {
      const uniIds = new Set(dossiers.filter(d => d.dossier_type === "university" && d.parent_id === offer.id).map(d => d.id));
      const gIds = new Set(groupes.filter(g => g.formation_dossier_id && uniIds.has(g.formation_dossier_id)).map(g => g.id));
      map.set(offer.id, students.filter(s => s.groupe_id && gIds.has(s.groupe_id)).length);
    }
    return map;
  }, [dossiers, groupes, offers, students]);

  const studentCountByUni = useMemo(() => {
    const map = new Map<string, number>();
    for (const uni of universities) {
      const gIds = new Set(groupes.filter(g => g.formation_dossier_id === uni.id).map(g => g.id));
      map.set(uni.id, students.filter(s => s.groupe_id && gIds.has(s.groupe_id)).length);
    }
    return map;
  }, [groupes, students, universities]);

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

  const adminTabs: { key: typeof adminView; label: string; icon: React.ReactNode }[] = [
    { key: "chat", label: "Chat Coaching", icon: <Search className="w-3.5 h-3.5" /> },
    { key: "rdv_requests", label: "Demandes RDV", icon: <PhoneCall className="w-3.5 h-3.5" /> },
    { key: "videos", label: "Vidéos", icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { key: "planning", label: "Planning", icon: <CalendarClock className="w-3.5 h-3.5" /> },
    { key: "rdv", label: "RDV (créneaux)", icon: <CalendarClock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        {adminTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setAdminView(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              adminView === t.key
                ? "bg-white text-[#12314d] shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Pill filters — Formation → Université */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
          {/* Formation */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest w-24 shrink-0 text-gray-400">Formation</span>
            <button
              onClick={() => { setFilterFormationId(""); setFilterUniversityId(""); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                !filterFormationId ? "bg-[#0e1e35] text-white border-[#0e1e35]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
              }`}
            >
              Tout <span className="text-[9px] opacity-60">{students.length}</span>
            </button>
            {offers.map((o) => (
              <button
                key={o.id}
                onClick={() => { setFilterFormationId(o.id); setFilterUniversityId(""); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                  filterFormationId === o.id ? "bg-[#0e1e35] text-white border-[#0e1e35]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {o.name} <span className="text-[9px] opacity-60">{studentCountByOffer.get(o.id) ?? 0}</span>
              </button>
            ))}
          </div>

          {/* Université — only when a formation is selected */}
          {filterFormationId && universities.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest w-24 shrink-0 text-gray-400">Université</span>
              <button
                onClick={() => setFilterUniversityId("")}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                  !filterUniversityId ? "bg-[#0e1e35] text-white border-[#0e1e35]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
              >
                Toutes
              </button>
              {universities.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setFilterUniversityId(u.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                    filterUniversityId === u.id ? "bg-[#0e1e35] text-white border-[#0e1e35]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {u.name.replace("Université ", "")} <span className="text-[9px] opacity-60">{studentCountByUni.get(u.id) ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      {/* Main content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ minHeight: "calc(100vh - 250px)" }}>
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
            threads={filteredThreads}
            coaches={coaches}
            students={students}
            currentProfile={currentProfile}
          />
        )}

        {adminView === "rdv_requests" && (
          <CoachingRdvPanel
            rdvRequests={filteredRdvRequests}
            coaches={coaches}
            students={students}
          />
        )}

        {adminView === "videos" && (
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

// ─── Coach Weekly Overview ──────────────────────────────────────────────────
function CoachWeeklyOverview({
  slots,
  bookings,
  students,
  recurringAvailability = [],
}: {
  slots: CoachingCallSlot[];
  bookings: CoachingCallBooking[];
  students: Profile[];
  recurringAvailability?: CoachRecurringAvailability[];
}) {
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const bookedSlotIds = useMemo(
    () => new Map(bookings.filter((b) => b.status === "booked").map((b) => [b.slot_id, b])),
    [bookings]
  );

  // Build 7 days starting from today
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  // Map JS getDay() (0=Sun) to our day_of_week (0=Mon)
  function jsDayToRecurringDay(jsDay: number) {
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  // Group recurring availability by day_of_week
  const recurringByDay = useMemo(() => {
    const map = new Map<number, CoachRecurringAvailability[]>();
    for (const r of recurringAvailability) {
      if (!r.is_active) continue;
      const arr = map.get(r.day_of_week) ?? [];
      arr.push(r);
      map.set(r.day_of_week, arr);
    }
    return map;
  }, [recurringAvailability]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, (CoachingCallSlot & { booking?: CoachingCallBooking })[]>();
    for (const day of days) {
      map.set(day.toISOString().slice(0, 10), []);
    }
    for (const slot of slots) {
      const key = new Date(slot.start_at).toISOString().slice(0, 10);
      const arr = map.get(key);
      if (arr) {
        arr.push({ ...slot, booking: bookedSlotIds.get(slot.id) });
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return map;
  }, [slots, days, bookedSlotIds]);

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-[#e5edf6] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e5edf6] bg-[#f8fbfe]">
        <h3 className="text-xs font-semibold text-[#12314d] flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-[#5d7085]" />
          Ma semaine
        </h3>
      </div>
      <div className="grid grid-cols-7 divide-x divide-[#e5edf6]">
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const daySlots = slotsByDay.get(key) ?? [];
          const recDay = jsDayToRecurringDay(day.getDay());
          const dayRecurring = recurringByDay.get(recDay) ?? [];
          const isToday = key === todayKey;
          const bookedCount = daySlots.filter((s) => s.booking).length;
          const hasContent = daySlots.length > 0 || dayRecurring.length > 0;

          return (
            <div key={key} className={`min-h-[120px] ${isToday ? "bg-blue-50/40" : ""}`}>
              {/* Day header */}
              <div className={`px-2 py-1.5 text-center border-b border-[#e5edf6] ${isToday ? "bg-[#12314d]" : "bg-[#f8fbfe]"}`}>
                <p className={`text-[10px] font-bold uppercase ${isToday ? "text-white/70" : "text-[#8a98a8]"}`}>
                  {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                </p>
                <p className={`text-sm font-semibold ${isToday ? "text-white" : "text-[#12314d]"}`}>
                  {day.getDate()}
                </p>
              </div>

              <div className="p-1.5 space-y-1">
                {/* Actual slots (booked or available) */}
                {daySlots.map((slot) => {
                  const student = slot.booking ? studentsById.get(slot.booking.student_id) : null;
                  const SlotIcon = SLOT_TYPE_ICONS[slot.slot_type] ?? Clock;
                  const startTime = new Date(slot.start_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div
                      key={slot.id}
                      className={`rounded-lg px-1.5 py-1 text-[10px] ${
                        slot.booking
                          ? "bg-[#12314d] text-white"
                          : "border border-dashed border-[#d0d8e2] text-[#8a98a8]"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 shrink-0 opacity-70" />
                        <span className="font-medium">{startTime}</span>
                      </div>
                      {slot.booking && student && (
                        <p className="truncate mt-0.5 font-medium opacity-90">
                          {student.first_name ?? ""} {(student.last_name ?? "")[0]?.toUpperCase() ?? ""}.
                        </p>
                      )}
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <SlotIcon className="h-2.5 w-2.5 opacity-60" />
                        <span className="opacity-70">{SLOT_TYPE_LABELS[slot.slot_type] ?? slot.slot_type}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Recurring availability (when no actual slots exist for this day) */}
                {daySlots.length === 0 && dayRecurring.map((r) => {
                  const SlotIcon = SLOT_TYPE_ICONS[r.slot_type] ?? Clock;
                  const colorClass = SLOT_TYPE_COLORS[r.slot_type] ?? "text-gray-600 bg-gray-50";
                  return (
                    <div key={r.id} className={`rounded-lg px-1.5 py-1 text-[10px] ${colorClass}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 shrink-0 opacity-70" />
                        <span className="font-medium">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <SlotIcon className="h-2.5 w-2.5 opacity-60" />
                        <span className="opacity-70">{SLOT_TYPE_LABELS[r.slot_type] ?? r.slot_type}</span>
                      </div>
                    </div>
                  );
                })}

                {!hasContent && (
                  <p className="text-[9px] text-[#b0b8c4] text-center py-3">—</p>
                )}
              </div>

              {/* Footer with count */}
              {bookedCount > 0 && (
                <div className="px-1.5 pb-1.5">
                  <span className="block text-center text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded-full py-0.5">
                    {bookedCount} RDV
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
  recurringAvailability = [],
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
  recurringAvailability?: CoachRecurringAvailability[];
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
          recurringAvailability={recurringAvailability.filter(r => r.coach_id === coachId)}
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

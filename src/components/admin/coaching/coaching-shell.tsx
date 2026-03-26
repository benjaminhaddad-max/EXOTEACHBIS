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
import {
  createCoachCallSlot,
  saveStudentPointAProfile,
  updateBookingStatus,
} from "@/app/(admin)/admin/coaching/actions";
import type {
  CoachingCallBooking,
  CoachingCallBookingStatus,
  CoachingCallSlot,
  CoachingIntakeForm,
  CoachingMentality,
  CoachingMethodLevel,
  CoachingSchoolLevel,
  CoachingStudentProfile,
  CoachingWorkCapacity,
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
  const bookingsByStudentId = useMemo(() => new Map(bookings.map((booking) => [booking.student_id, booking])), [bookings]);
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

  if (isCoach && !currentProfile.groupe_id) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Ton profil coach n'est relié à aucune classe. Attribue-lui un `groupe_id` pour voir les élèves et proposer des
        créneaux.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{stat.label}</p>
            <p className="mt-3 text-3xl font-bold text-navy">{stat.value}</p>
            <p className="mt-2 text-sm text-gray-500">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-navy" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Créer un créneau coach</h2>
              <p className="text-sm text-gray-500">L'élève pourra réserver ici juste après son formulaire.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {!isCoach && (
              <>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-gray-700">Coach</span>
                  <select
                    value={slotDraft.coachId}
                    onChange={(event) => {
                      const coach = coachesById.get(event.target.value) ?? null;
                      setSlotDraft((current) => ({
                        ...current,
                        coachId: event.target.value,
                        groupeId: coach?.groupe_id ?? current.groupeId,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-navy"
                  >
                    <option value="">Choisir un coach</option>
                    {coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {getDisplayName(coach)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-gray-700">Classe</span>
                  <select
                    value={slotDraft.groupeId}
                    onChange={(event) => setSlotDraft((current) => ({ ...current, groupeId: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none ring-0 focus:border-navy"
                  >
                    <option value="">Choisir une classe</option>
                    {groupes.map((groupe) => (
                      <option key={groupe.id} value={groupe.id}>
                        {groupe.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Début</span>
              <input
                type="datetime-local"
                value={toLocalDateTimeInput(slotDraft.startAt)}
                onChange={(event) =>
                  setSlotDraft((current) => ({ ...current, startAt: new Date(event.target.value).toISOString() }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Fin</span>
              <input
                type="datetime-local"
                value={toLocalDateTimeInput(slotDraft.endAt)}
                onChange={(event) =>
                  setSlotDraft((current) => ({ ...current, endAt: new Date(event.target.value).toISOString() }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Lieu ou lien d'appel</span>
              <input
                value={slotDraft.location}
                onChange={(event) => setSlotDraft((current) => ({ ...current, location: event.target.value }))}
                placeholder="Téléphone, Zoom, Google Meet..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
              />
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-medium text-gray-700">Notes internes</span>
              <textarea
                rows={3}
                value={slotDraft.notes}
                onChange={(event) => setSlotDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Ex: appel onboarding de 30 min, créneau réservé PASS Lyon..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleCreateSlot}
            disabled={isPending || !slotDraft.startAt || !slotDraft.endAt || (!isCoach && (!slotDraft.coachId || !slotDraft.groupeId))}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Ajouter ce créneau
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-navy" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Calendrier des appels</h2>
              <p className="text-sm text-gray-500">Créneaux visibles par les élèves et rendez-vous déjà pris.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {scheduleDays.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Aucun créneau pour l'instant.
              </div>
            ) : (
              scheduleDays.map(([day, daySlots]) => (
                <div key={day} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold capitalize text-gray-900">{formatDayLabel(day)}</p>
                  <div className="mt-3 space-y-3">
                    {daySlots.map((slot) => {
                      const booking = bookingsBySlotId.get(slot.id) ?? null;
                      const student = booking ? students.find((item) => item.id === booking.student_id) ?? null : null;
                      const coach = coachesById.get(slot.coach_id) ?? null;
                      const groupe = groupsById.get(slot.groupe_id) ?? null;
                      return (
                        <div key={slot.id} className="rounded-xl border border-white bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{formatDateTime(slot.start_at)}</p>
                              <p className="text-xs text-gray-500">
                                {coach ? getDisplayName(coach) : "Coach inconnu"}
                                {groupe ? ` · ${groupe.name}` : ""}
                              </p>
                            </div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                booking ? BOOKING_STATUS_STYLES[booking.status] : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {booking ? BOOKING_STATUS_LABELS[booking.status] : "Disponible"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-gray-600">
                            {student ? `Élève: ${getDisplayName(student)}` : "Aucun élève réservé pour ce créneau."}
                          </p>
                          {slot.location && <p className="mt-1 text-xs text-gray-500">Lieu: {slot.location}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px,1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-navy" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Dossiers élèves</h2>
              <p className="text-sm text-gray-500">Formulaire, rendez-vous et point A au même endroit.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un élève"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>

            {!isCoach && (
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
              >
                <option value="all">Toutes les classes</option>
                {groupes.map((groupe) => (
                  <option key={groupe.id} value={groupe.id}>
                    {groupe.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {filteredStudents.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                Aucun élève trouvé.
              </div>
            ) : (
              filteredStudents.map((student) => {
                const form = formsByStudentId.get(student.id);
                const booking = bookingsByStudentId.get(student.id);
                const pointA = pointAByStudentId.get(student.id);
                const isSelected = student.id === selectedStudentId;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedStudentId(student.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected ? "border-navy bg-navy/5 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{getDisplayName(student)}</p>
                        <p className="text-xs text-gray-500">{student.email}</p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                        {student.groupe_id ? groupsById.get(student.groupe_id)?.name ?? "Classe" : "Sans classe"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${form ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {form ? "Formulaire reçu" : "Formulaire absent"}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${booking ? BOOKING_STATUS_STYLES[booking.status] : "bg-gray-100 text-gray-500"}`}>
                        {booking ? BOOKING_STATUS_LABELS[booking.status] : "Aucun RDV"}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${pointA ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                        {pointA ? `Point A ${pointA.confidence_score}/100` : "Point A non validé"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {!selectedStudent ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
              Sélectionne un élève pour ouvrir son dossier de coaching.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">{getDisplayName(selectedStudent)}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedStudent.email}
                    {selectedStudent.phone ? ` · ${selectedStudent.phone}` : ""}
                    {selectedStudent.groupe_id ? ` · ${groupsById.get(selectedStudent.groupe_id)?.name ?? "Classe"}` : ""}
                  </p>
                </div>
                {selectedPointA && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Score interne caché</p>
                    <p className="mt-1 text-2xl font-bold text-amber-900">{selectedPointA.confidence_score}/100</p>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard
                  icon={<ClipboardList className="h-4 w-4 text-navy" />}
                  title="Formulaire"
                  value={selectedForm ? "Rempli" : "En attente"}
                  subtitle={selectedForm ? `Le ${formatDateTime(selectedForm.submitted_at)}` : "L'élève n'a pas encore répondu"}
                />
                <SummaryCard
                  icon={<PhoneCall className="h-4 w-4 text-navy" />}
                  title="Rendez-vous"
                  value={selectedBooking ? BOOKING_STATUS_LABELS[selectedBooking.status] : "À réserver"}
                  subtitle={selectedBookingSlot ? formatDateTime(selectedBookingSlot.start_at) : "Aucun créneau choisi"}
                />
                <SummaryCard
                  icon={<ShieldCheck className="h-4 w-4 text-navy" />}
                  title="Point A"
                  value={selectedPointA ? `${selectedPointA.confidence_score}/100` : "À valider"}
                  subtitle={selectedPointA ? "Visible staff uniquement" : "À renseigner après l'appel"}
                />
              </div>

              <section className="rounded-2xl border border-gray-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900">Formulaire élève</h3>
                {!selectedForm ? (
                  <p className="mt-3 text-sm text-gray-500">L'élève n'a pas encore rempli son onboarding.</p>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <AnswerField label="Téléphone" value={selectedForm.phone} />
                    <AnswerField label="Ville" value={selectedForm.city} />
                    <AnswerField label="Spécialités bac" value={selectedForm.bac_specialties} />
                    <AnswerField label="Parcours" value={selectedForm.parcours_label} />
                    <AnswerField label="Pourquoi médecine ?" value={selectedForm.why_medicine} />
                    <AnswerField label="Attentes" value={selectedForm.expectations} />
                    <AnswerField label="Inquiétude principale" value={selectedForm.main_worry} />
                    <AnswerField label="Méthode actuelle" value={selectedForm.current_method_description} />
                    <AnswerField label="Points forts" value={selectedForm.strengths} />
                    <AnswerField label="Points faibles" value={selectedForm.weaknesses} />
                    <AnswerField label="Disponibilités" value={selectedForm.availability_notes} />
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Rendez-vous coaching</h3>
                    <p className="text-sm text-gray-500">Le call déclenché juste après le formulaire.</p>
                  </div>
                  {selectedBooking && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${BOOKING_STATUS_STYLES[selectedBooking.status]}`}>
                      {BOOKING_STATUS_LABELS[selectedBooking.status]}
                    </span>
                  )}
                </div>

                {!selectedBooking ? (
                  <p className="mt-3 text-sm text-gray-500">Aucun rendez-vous réservé pour cet élève.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                      <p>
                        <span className="font-semibold text-gray-900">Date:</span> {formatDateTime(selectedBookingSlot?.start_at)}
                      </p>
                      <p className="mt-1">
                        <span className="font-semibold text-gray-900">Coach:</span>{" "}
                        {getDisplayName(coachesById.get(selectedBooking.coach_id) ?? null)}
                      </p>
                      {selectedBookingSlot?.location && (
                        <p className="mt-1">
                          <span className="font-semibold text-gray-900">Lieu:</span> {selectedBookingSlot.location}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(["booked", "completed", "cancelled", "no_show"] as CoachingCallBookingStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleBookingStatusUpdate(status)}
                          disabled={isPending}
                          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                            selectedBooking.status === status
                              ? "bg-navy text-white"
                              : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {BOOKING_STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Évaluation coach après appel</h3>
                    <p className="text-sm text-gray-500">
                      Ce score est fixe, interne à l'équipe et n'est jamais montré à l'élève.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-navy/10 bg-navy/5 px-4 py-3 text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-navy/70">Score calculé</p>
                    <p className="mt-1 text-2xl font-bold text-navy">{computedInternalScore}/100</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Mentalité"
                    value={pointADraft.mentality}
                    options={COACHING_MENTALITY_OPTIONS}
                    onChange={(value) => setPointADraft((current) => ({ ...current, mentality: value as CoachingMentality }))}
                  />
                  <SelectField
                    label="Niveau lycée"
                    value={pointADraft.schoolLevel}
                    options={COACHING_SCHOOL_LEVEL_OPTIONS}
                    onChange={(value) => setPointADraft((current) => ({ ...current, schoolLevel: value as CoachingSchoolLevel }))}
                  />
                  <SelectField
                    label="Capacité de travail"
                    value={pointADraft.workCapacity}
                    options={COACHING_WORK_CAPACITY_OPTIONS}
                    onChange={(value) => setPointADraft((current) => ({ ...current, workCapacity: value as CoachingWorkCapacity }))}
                  />
                  <SelectField
                    label="Méthode actuelle"
                    value={pointADraft.methodLevel}
                    options={COACHING_METHOD_OPTIONS}
                    onChange={(value) => setPointADraft((current) => ({ ...current, methodLevel: value as CoachingMethodLevel }))}
                  />
                </div>

                <label className="mt-4 block space-y-2 text-sm">
                  <span className="font-medium text-gray-700">Rapport coach</span>
                  <textarea
                    rows={6}
                    value={pointADraft.coachReport}
                    onChange={(event) => setPointADraft((current) => ({ ...current, coachReport: event.target.value }))}
                    placeholder="Compte-rendu détaillé de l'appel, perception du profil, points d'attention, suite à donner..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleSavePointA}
                  disabled={isPending || !selectedForm}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Enregistrer le point A
                </button>
                {!selectedForm && <p className="mt-2 text-xs text-gray-500">Le formulaire élève doit exister avant validation.</p>}
              </section>
            </div>
          )}
        </div>
      </section>
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

function AnswerField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">{value?.trim() || "—"}</p>
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

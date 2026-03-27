"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  LockKeyhole,
  PhoneCall,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  bookStudentCoachingCall,
  submitStudentCoachingForm,
} from "@/app/(admin)/admin/coaching/actions";
import { getCoachingFormAnswers, getFieldOptions, isFilledAnswer } from "@/lib/form-builder";
import type {
  CoachingCallBooking,
  CoachingCallSlot,
  CoachingIntakeForm,
  FormAnswerValue,
  FormField,
  FormTemplate,
  Groupe,
  Profile,
} from "@/types/database";

type Toast = {
  kind: "success" | "error";
  message: string;
} | null;

type StudentCoachingShellProps = {
  currentProfile: Profile;
  groupe: Groupe | null;
  coaches: Profile[];
  initialForm: CoachingIntakeForm | null;
  initialBooking: CoachingCallBooking | null;
  initialBookingSlot: CoachingCallSlot | null;
  initialAvailableSlots: CoachingCallSlot[];
  formTemplate: FormTemplate | null;
  formFields: FormField[];
  setupError?: string | null;
  [key: string]: unknown;
};

function getDisplayName(profile?: Profile | null) {
  if (!profile) return "Coach";
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return fullName || profile.email;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildInitialDraft(form: CoachingIntakeForm | null, fields: FormField[]) {
  const answers = getCoachingFormAnswers(form);
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      answers[field.key] ?? (field.field_type === "checkboxes" ? [] : ""),
    ])
  ) as Record<string, FormAnswerValue>;
}

export function StudentCoachingShell({
  currentProfile,
  groupe,
  coaches,
  initialForm,
  initialBooking,
  initialBookingSlot,
  initialAvailableSlots,
  formTemplate,
  formFields,
  setupError,
}: StudentCoachingShellProps) {
  const [form, setForm] = useState(initialForm);
  const [booking, setBooking] = useState(initialBooking);
  const [bookingSlot, setBookingSlot] = useState(initialBookingSlot);
  const [availableSlots, setAvailableSlots] = useState(initialAvailableSlots);
  const [draft, setDraft] = useState<Record<string, FormAnswerValue>>(() => buildInitialDraft(initialForm, formFields));
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setDraft(buildInitialDraft(form, formFields));
  }, [form?.id, formFields]);

  const coachesById = useMemo(() => new Map(coaches.map((coach) => [coach.id, coach])), [coaches]);
  const requiredFields = useMemo(() => formFields.filter((field) => field.required), [formFields]);
  const optionalFields = useMemo(() => formFields.filter((field) => !field.required), [formFields]);
  const answeredRequiredCount = requiredFields.filter((field) => isFilledAnswer(draft[field.key])).length;
  const completionRatio = requiredFields.length === 0 ? 100 : Math.round((answeredRequiredCount / requiredFields.length) * 100);
  const onboardingDone = Boolean(form);
  const bookingDone = Boolean(booking && bookingSlot);
  const callDone = booking?.status === "completed";
  const journeySteps = [
    {
      id: "coaching-form-step",
      title: "Formulaire d'onboarding",
      description: onboardingDone
        ? "Tes réponses sont enregistrées et restent modifiables."
        : "Complète ton profil pour donner du contexte au coach.",
      done: onboardingDone,
      locked: false,
    },
    {
      id: "coaching-booking-step",
      title: "Réservation de l'appel",
      description: bookingDone
        ? `Appel réservé le ${formatDateTime(bookingSlot?.start_at)}`
        : onboardingDone
          ? "Choisis ensuite le créneau qui t'arrange."
          : "Cette étape se débloque juste après le formulaire.",
      done: bookingDone,
      locked: !onboardingDone,
    },
    {
      id: "coaching-call-step",
      title: "Point avec ton coach",
      description: callDone
        ? "Le premier échange a déjà été marqué comme réalisé."
        : bookingDone
          ? "Prépare tes questions et tes blocages avant l'appel."
          : "Viendra après la réservation du créneau.",
      done: callDone,
      locked: !bookingDone,
    },
  ];
  const completedJourneyCount = journeySteps.filter((step) => step.done).length;
  const nextAction = !onboardingDone
    ? {
        title: "Complète ton onboarding",
        body: `${answeredRequiredCount}/${requiredFields.length} questions obligatoires complétées. Plus tu es précis, plus l'appel sera utile.`,
        cta: "Continuer le formulaire",
        target: "coaching-form-step",
      }
    : !bookingDone
      ? {
          title: "Réserve ton créneau d'appel",
          body: "Ton formulaire est prêt. Il ne reste plus qu'à choisir ton rendez-vous avec un coach de ta classe.",
          cta: "Voir les créneaux",
          target: "coaching-booking-step",
        }
      : !callDone
        ? {
            title: "Prépare ton appel",
            body: bookingSlot
              ? `Ton rendez-vous est prévu le ${formatDateTime(bookingSlot.start_at)}. Garde en tête tes questions, tes difficultés et ton organisation actuelle.`
              : "Ton rendez-vous est réservé.",
            cta: "Voir mon rendez-vous",
            target: "coaching-booking-step",
          }
        : {
            title: "Parcours lancé",
            body: "Ton onboarding et ton premier point coach sont en place. La suite se jouera dans le suivi personnalisé.",
            cta: "Revoir mon parcours",
            target: "coaching-form-step",
          };

  if (setupError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        La base coaching n'est pas prête: {setupError}. Applique d'abord les migrations
        <span className="mx-1 font-semibold">`023_reset_coaching_first_brick.sql`</span>
        et
        <span className="mx-1 font-semibold">`024_form_builder_for_coaching.sql`</span>
        puis recharge la page.
      </div>
    );
  }

  if (!groupe || !currentProfile.groupe_id) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Ton compte n'est pas encore attribué à une classe. Dès qu'une classe t'est assignée, tu verras ici le
        formulaire de coaching puis la prise de rendez-vous avec ton coach.
      </div>
    );
  }

  if (!formTemplate || formFields.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Aucun formulaire coaching actif n'est configuré pour le moment. L'équipe admin doit d'abord le paramétrer dans
        l'espace Formulaires.
      </div>
    );
  }

  const handleSubmitForm = () => {
    setToast(null);
    startTransition(async () => {
      try {
        const response = await submitStudentCoachingForm({
          form_template_id: formTemplate.id,
          answers: draft,
        });

        if (!("success" in response)) {
          setToast({ kind: "error", message: response.error ?? "Une erreur est survenue." });
          return;
        }

        const submittedForm = response.form;
        if (!submittedForm) {
          setToast({ kind: "error", message: "Formulaire non retourné par le serveur." });
          return;
        }

        setForm(submittedForm);
        setToast({ kind: "success", message: "Formulaire enregistré. Tu peux maintenant réserver ton appel." });
      } catch (error) {
        console.error("submit coaching form failed", error);
        setToast({ kind: "error", message: "Impossible d'enregistrer le formulaire pour le moment." });
      }
    });
  };

  const handleBookSlot = (slot: CoachingCallSlot) => {
    setToast(null);
    startTransition(async () => {
      try {
        const response = await bookStudentCoachingCall(slot.id);
        if (!("success" in response)) {
          setToast({ kind: "error", message: response.error ?? "Une erreur est survenue." });
          return;
        }

        const createdBooking = response.booking;
        if (!createdBooking) {
          setToast({ kind: "error", message: "Rendez-vous non retourné par le serveur." });
          return;
        }

        setBooking(createdBooking);
        setBookingSlot(slot);
        setAvailableSlots((current) => current.filter((item) => item.id !== slot.id));
        setToast({ kind: "success", message: "Ton rendez-vous coaching est réservé." });
      } catch (error) {
        console.error("book coaching slot failed", error);
        setToast({ kind: "error", message: "Impossible de réserver ce créneau pour le moment." });
      }
    });
  };

  const canSubmit = requiredFields.every((field) => isFilledAnswer(draft[field.key]));
  const scrollToSection = (sectionId: string) => {
    const node = document.getElementById(sectionId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-4 sm:px-6">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* ── Compact header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#12314d]">
            <Sparkles className="h-4 w-4 text-[#c5963d]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#12314d]">Coaching {groupe.name}</h1>
            <p className="text-xs text-[#7d8c9e]">{coaches.length} coach{coaches.length !== 1 ? "s" : ""} · {completedJourneyCount}/3 étapes</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => scrollToSection(nextAction.target)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#12314d] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0f2940]"
        >
          {nextAction.cta}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* ── Horizontal stepper ── */}
      <div className="mt-4 flex items-center gap-1">
        {journeySteps.map((step, i) => (
          <button
            key={step.id}
            type="button"
            onClick={() => scrollToSection(step.id)}
            className="group flex flex-1 items-center gap-2 rounded-lg border border-[#e5edf6] bg-white px-3 py-2 text-left transition hover:border-[#ccd8e6]"
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
              step.done ? "bg-emerald-100 text-emerald-700" : step.locked ? "bg-gray-100 text-gray-400" : "bg-[#12314d] text-white"
            }`}>
              {step.done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`truncate text-xs font-medium ${step.done ? "text-emerald-700" : step.locked ? "text-gray-400" : "text-[#12314d]"}`}>
              {step.title}
            </span>
            {step.locked && <LockKeyhole className="ml-auto h-3 w-3 shrink-0 text-gray-300" />}
          </button>
        ))}
      </div>

      {/* ── Next appointment pill ── */}
      {bookingSlot && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="font-medium">RDV {formatDateTime(bookingSlot.start_at)}</span>
          <span className="text-emerald-600">
            avec {getDisplayName(coachesById.get(booking?.coach_id ?? "") ?? null)}
            {bookingSlot.location ? ` · ${bookingSlot.location}` : ""}
          </span>
        </div>
      )}

      {/* ── SECTION 1 : Formulaire ── */}
      <section id="coaching-form-step" className="mt-6 rounded-2xl border border-[#e5edf6] bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-[#12314d] px-2 py-0.5 text-[10px] font-bold text-white">1</span>
              <h2 className="text-base font-semibold text-[#12314d]">Formulaire d&apos;onboarding</h2>
            </div>
            <p className="mt-1 text-xs text-[#7d8c9e]">
              {formTemplate.description || "Réponds aux questions pour préparer ton échange avec le coach."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5d7085]">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#e6edf5]">
              <div className="h-full rounded-full bg-[#4fabdb] transition-all" style={{ width: `${completionRatio}%` }} />
            </div>
            <span className="font-medium">{answeredRequiredCount}/{requiredFields.length}</span>
          </div>
        </div>

        {form && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Onboarding enregistré</span>
            <span className="text-emerald-600">— tu peux encore modifier tes réponses.</span>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {requiredFields.length > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#b0b8c4]">Obligatoire</p>
          )}
          {requiredFields.map((field, index) => (
            <QuestionBlock
              key={field.id}
              index={index + 1}
              field={field}
              value={draft[field.key] ?? (field.field_type === "checkboxes" ? [] : "")}
              onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </div>

        {optionalFields.length > 0 && (
          <div className="mt-5 space-y-3 border-t border-[#edf2f7] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#b0b8c4]">Facultatif</p>
            {optionalFields.map((field, index) => (
              <QuestionBlock
                key={field.id}
                index={requiredFields.length + index + 1}
                field={field}
                value={draft[field.key] ?? (field.field_type === "checkboxes" ? [] : "")}
                onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
          <p className="text-xs text-[#7d8c9e]">Sauvegarde possible — le coach voit la dernière version.</p>
          <button
            type="button"
            onClick={handleSubmitForm}
            disabled={isPending || !canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#12314d] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0f2940] disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {form ? "Mettre à jour" : "Enregistrer"}
          </button>
        </div>
      </section>

      {/* ── SECTION 2 : Réservation ── */}
      <section id="coaching-booking-step" className="mt-4 rounded-2xl border border-[#e5edf6] bg-white p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#12314d] px-2 py-0.5 text-[10px] font-bold text-white">2</span>
          <h2 className="text-base font-semibold text-[#12314d]">Réserve ton appel</h2>
        </div>

        <div className="mt-4">
          {booking && bookingSlot ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">{formatDateTime(bookingSlot.start_at)}</span>
                <span className="ml-1 text-emerald-600">
                  avec {getDisplayName(coachesById.get(booking.coach_id) ?? null)}
                  {bookingSlot.location ? ` · ${bookingSlot.location}` : ""}
                </span>
              </div>
            </div>
          ) : !form ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#d8e1ed] bg-[#f8fbfe] px-4 py-4 text-xs text-[#7d8c9e]">
              <LockKeyhole className="h-4 w-4 shrink-0 text-[#b0b8c4]" />
              <span>Termine le formulaire pour débloquer les créneaux.</span>
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d8e1ed] bg-[#f8fbfe] px-4 py-4 text-center text-xs text-[#7d8c9e]">
              Aucun créneau disponible pour l&apos;instant.
            </div>
          ) : (
            <div className="space-y-2">
              {availableSlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5edf6] bg-[#fbfcfe] px-4 py-3 transition hover:border-[#c9d9eb]">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-[#5d7085]" />
                    <div>
                      <p className="text-sm font-medium text-[#12314d]">{formatDateTime(slot.start_at)}</p>
                      <p className="text-xs text-[#7d8c9e]">
                        {getDisplayName(coachesById.get(slot.coach_id) ?? null)}
                        {slot.location ? ` · ${slot.location}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBookSlot(slot)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#12314d] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f2940] disabled:opacity-50"
                  >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PhoneCall className="h-3 w-3" />}
                    Réserver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 3 : Coachs ── */}
      <section id="coaching-call-step" className="mt-4 rounded-2xl border border-[#e5edf6] bg-white p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#12314d] px-2 py-0.5 text-[10px] font-bold text-white">3</span>
          <h2 className="text-base font-semibold text-[#12314d]">Tes coachs</h2>
        </div>
        <div className="mt-3 space-y-2">
          {coaches.length === 0 ? (
            <p className="text-xs text-[#7d8c9e]">Aucun coach rattaché à cette classe.</p>
          ) : (
            coaches.map((coach) => (
              <div key={coach.id} className="flex items-center gap-3 rounded-xl border border-[#e5edf6] bg-[#fbfcfe] px-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12314d] text-white">
                  <UserRound className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#12314d]">{getDisplayName(coach)}</p>
                  <p className="truncate text-xs text-[#7d8c9e]">{coach.email}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SidebarMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-white/65">{detail}</p>
    </div>
  );
}

function SummaryStat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-[24px] border border-[#e3ebf5] bg-[#fbfdff] p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#12314d]">{value}</p>
      <p className="mt-1 text-sm text-[#64788d]">{caption}</p>
    </div>
  );
}

function JourneyStep({
  index,
  title,
  description,
  done,
  locked,
  onClick,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-4 rounded-[24px] border border-[#e5edf6] bg-[#fbfcfe] px-4 py-4 text-left transition hover:border-[#ccd9e8] hover:shadow-[0_10px_24px_rgba(18,49,77,0.05)]"
    >
      <div
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
          done ? "bg-emerald-100 text-emerald-700" : locked ? "bg-[#f2f5f8] text-[#95a4b5]" : "bg-[#12314d] text-white"
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-[#12314d]">{title}</p>
          {locked && <LockKeyhole className="h-3.5 w-3.5 text-[#94a5b6]" />}
        </div>
        <p className="mt-1 text-sm leading-6 text-[#64788d]">{description}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          done ? "bg-emerald-100 text-emerald-700" : locked ? "bg-[#eef2f6] text-[#8ea0b3]" : "bg-[#eef6ff] text-[#2e6fa3]"
        }`}
      >
        {done ? "OK" : locked ? "Bientôt" : "À faire"}
      </span>
    </button>
  );
}

function InputShell({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border bg-[#fbfdff] px-4 py-2.5 transition ${
        active
          ? "border-[#4fabdb] bg-white shadow-[0_0_0_3px_rgba(79,171,219,0.10)]"
          : "border-[#dbe5f0] hover:border-[#c8d5e3]"
      }`}
    >
      {children}
    </div>
  );
}

function QuestionBlock({
  index,
  field,
  value,
  onChange,
}: {
  index: number;
  field: FormField;
  value: FormAnswerValue;
  onChange: (value: FormAnswerValue) => void;
}) {
  const options = getFieldOptions(field);
  const selectedValues = Array.isArray(value) ? value : [];
  const currentValue = Array.isArray(value) ? "" : value;

  return (
    <div className="rounded-xl border border-[#e7edf5] bg-white p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#eef2f7] text-[10px] font-bold text-[#5d7085]">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-[#12314d]">{field.label}</h4>
          {field.helper_text && <p className="mt-0.5 text-xs text-[#7d8c9e]">{field.helper_text}</p>}
          <div className="mt-2">
            {field.field_type === "select" ? (
              <InputShell active={Boolean(currentValue)}>
                <div className="relative">
                  <select
                    value={currentValue}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-10 w-full appearance-none bg-transparent pr-10 text-[15px] text-[#12314d] outline-none"
                  >
                    <option value="">Sélectionner une réponse</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#8ea0b3]" />
                </div>
              </InputShell>
            ) : field.field_type === "radio" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => {
                  const selected = currentValue === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onChange(option)}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left text-sm font-medium transition ${
                        selected
                          ? "border-[#4fabdb] bg-[#f2f9fe] text-[#12314d] shadow-sm"
                          : "border-[#dbe5f0] bg-[#fbfdff] text-[#5f7287] hover:border-[#c8d5e3]"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          selected ? "border-[#12314d] bg-[#12314d]" : "border-[#c7d3df] bg-white"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : field.field_type === "checkboxes" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => {
                  const selected = selectedValues.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          onChange(selectedValues.filter((item) => item !== option));
                          return;
                        }
                        onChange([...selectedValues, option]);
                      }}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left text-sm transition ${
                        selected
                          ? "border-[#4fabdb] bg-[#f2f9fe] text-[#12314d]"
                          : "border-[#dbe5f0] bg-[#fbfdff] text-[#5f7287] hover:border-[#c8d5e3]"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          selected ? "border-[#12314d] bg-[#12314d]" : "border-[#c7d3df] bg-white"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : field.field_type === "long_text" ? (
              <InputShell active={Boolean(currentValue)}>
                <textarea
                  rows={3}
                  value={currentValue}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder={field.placeholder ?? ""}
                  className="w-full resize-y bg-transparent text-[15px] leading-6 text-[#12314d] outline-none placeholder:text-[#9babbc]"
                />
              </InputShell>
            ) : (
              <InputShell active={Boolean(currentValue)}>
                <input
                  value={currentValue}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder={field.placeholder ?? ""}
                  className="h-10 w-full bg-transparent text-[15px] text-[#12314d] outline-none placeholder:text-[#9babbc]"
                />
              </InputShell>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

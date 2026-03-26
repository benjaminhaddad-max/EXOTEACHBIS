"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PhoneCall,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  bookStudentCoachingCall,
  submitStudentCoachingForm,
} from "@/app/(admin)/admin/coaching/actions";
import { getCoachingFormAnswers, getFieldOptions } from "@/lib/form-builder";
import type {
  CoachingCallBooking,
  CoachingCallSlot,
  CoachingIntakeForm,
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
  return Object.fromEntries(fields.map((field) => [field.key, answers[field.key] ?? ""]));
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
  const [draft, setDraft] = useState<Record<string, string>>(() => buildInitialDraft(initialForm, formFields));
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
  const answeredRequiredCount = requiredFields.filter((field) => draft[field.key]?.trim()).length;
  const completionRatio = requiredFields.length === 0 ? 100 : Math.round((answeredRequiredCount / requiredFields.length) * 100);

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
        l'espace Configuration.
      </div>
    );
  }

  const handleSubmitForm = () => {
    startTransition(async () => {
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
    });
  };

  const handleBookSlot = (slot: CoachingCallSlot) => {
    startTransition(async () => {
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
    });
  };

  const canSubmit = requiredFields.every((field) => draft[field.key]?.trim());

  return (
    <div className="space-y-8">
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

      <section className="overflow-hidden rounded-[32px] border border-[#d8dce8] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_32%),linear-gradient(135deg,_#0f1e36_0%,_#132a48_48%,_#1e4466_100%)] p-6 text-white shadow-sm">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#f1d48b]">
            <Sparkles className="h-3.5 w-3.5" />
            Coaching {groupe.name}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight">
                Commence par un vrai onboarding, puis réserve ton appel avec un coach de ta promo.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/75">
                Le but n'est pas de remplir un formulaire “pour remplir un formulaire”. Plus tes réponses sont honnêtes,
                plus ton appel sera utile.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Progression</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#f1d48b]" style={{ width: `${completionRatio}%` }} />
              </div>
              <p className="mt-3 text-sm text-white/80">
                {answeredRequiredCount}/{requiredFields.length} questions obligatoires complétées
              </p>
              <div className="mt-5 space-y-3 text-sm">
                <StepRow title="1. Formulaire" done={Boolean(form)} />
                <StepRow title="2. Réservation d'appel" done={Boolean(booking)} />
                <StepRow title="3. Point avec le coach" done={booking?.status === "completed"} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-8">
        <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">Étape 1</p>
              <h3 className="mt-2 text-3xl font-semibold text-gray-900">{formTemplate.title}</h3>
              {formTemplate.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">{formTemplate.description}</p>}
            </div>
            {form && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Déjà enregistré
              </span>
            )}
          </div>

          <div className="mt-8 space-y-5">
            {formFields.map((field, index) => (
              <QuestionBlock
                key={field.id}
                index={index + 1}
                field={field}
                value={draft[field.key] ?? ""}
                onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleSubmitForm}
            disabled={isPending || !canSubmit}
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {form ? "Mettre à jour mes réponses" : "Valider mon formulaire"}
          </button>
        </div>

        <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">Étape 2</p>
              <h3 className="mt-2 text-3xl font-semibold text-gray-900">Réserve ton appel</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                Une fois le formulaire envoyé, tu choisis un créneau avec un coach de ta classe.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Coachs disponibles</p>
              <p className="mt-2 text-sm font-medium text-gray-700">{coaches.length} coach(s) rattaché(s) à {groupe.name}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {coaches.map((coach) => (
              <div key={coach.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white p-3 text-navy shadow-sm">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{getDisplayName(coach)}</p>
                    <p className="text-sm text-gray-500">{coach.email}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            {booking && bookingSlot ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="font-semibold">Ton rendez-vous est réservé</p>
                </div>
                <p className="mt-4 text-base">
                  {formatDateTime(bookingSlot.start_at)} avec {getDisplayName(coachesById.get(booking.coach_id) ?? null)}
                </p>
                {bookingSlot.location && <p className="mt-2">Lieu / lien: {bookingSlot.location}</p>}
              </div>
            ) : !form ? (
              <div className="rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Envoie d'abord ton formulaire pour débloquer les créneaux d'appel.
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Aucun créneau n'est disponible pour l'instant. Reviens plus tard ou contacte l'équipe.
              </div>
            ) : (
              <div className="space-y-4">
                {availableSlots.map((slot) => (
                  <div key={slot.id} className="flex flex-col gap-4 rounded-3xl border border-gray-200 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Créneau disponible</p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">{formatDateTime(slot.start_at)}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {getDisplayName(coachesById.get(slot.coach_id) ?? null)}
                        {slot.location ? ` · ${slot.location}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBookSlot(slot)}
                      disabled={isPending || !form}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                      Réserver ce créneau
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StepRow({ title, done }: { title: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-white/85">{title}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${done ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/60"}`}>
        {done ? "OK" : "À faire"}
      </span>
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
  value: string;
  onChange: (value: string) => void;
}) {
  const options = getFieldOptions(field);

  return (
    <div className="rounded-[28px] border border-gray-200 bg-[#fcfcfb] p-6 shadow-[0_1px_0_rgba(15,30,54,0.04)]">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy text-sm font-semibold text-white">
          {index}
        </div>
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-lg font-semibold text-gray-900">{field.label}</h4>
            {field.required && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                Obligatoire
              </span>
            )}
          </div>
          {field.helper_text && <p className="mt-2 text-sm leading-6 text-gray-500">{field.helper_text}</p>}

          <div className="mt-5">
            {field.field_type === "select" ? (
              <div className="flex flex-wrap gap-3">
                {options.map((option) => {
                  const selected = value === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onChange(option)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                        selected
                          ? "border-navy bg-navy text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : field.field_type === "long_text" ? (
              <textarea
                rows={5}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={field.placeholder ?? ""}
                className="w-full rounded-3xl border border-gray-200 bg-white px-5 py-4 text-sm leading-6 text-gray-700 outline-none transition focus:border-navy"
              />
            ) : (
              <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={field.placeholder ?? ""}
                className="h-14 w-full rounded-3xl border border-gray-200 bg-white px-5 text-sm text-gray-700 outline-none transition focus:border-navy"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

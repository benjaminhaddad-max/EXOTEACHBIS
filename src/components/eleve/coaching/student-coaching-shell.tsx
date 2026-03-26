"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PhoneCall,
  UserRound,
} from "lucide-react";
import {
  bookStudentCoachingCall,
  submitStudentCoachingForm,
} from "@/app/(admin)/admin/coaching/actions";
import type {
  CoachingCallBooking,
  CoachingCallSlot,
  CoachingIntakeForm,
  Groupe,
  Profile,
} from "@/types/database";

type Toast = {
  kind: "success" | "error";
  message: string;
} | null;

type FormDraft = {
  phone: string;
  city: string;
  bac_specialties: string;
  parcours_label: string;
  why_medicine: string;
  expectations: string;
  main_worry: string;
  current_method_description: string;
  strengths: string;
  weaknesses: string;
  availability_notes: string;
};

type StudentCoachingShellProps = {
  currentProfile: Profile;
  groupe: Groupe | null;
  coaches: Profile[];
  initialForm: CoachingIntakeForm | null;
  initialBooking: CoachingCallBooking | null;
  initialBookingSlot: CoachingCallSlot | null;
  initialAvailableSlots: CoachingCallSlot[];
  setupError?: string | null;
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

function initialFormDraft(form?: CoachingIntakeForm | null, profile?: Profile | null): FormDraft {
  return {
    phone: form?.phone ?? profile?.phone ?? "",
    city: form?.city ?? "",
    bac_specialties: form?.bac_specialties ?? "",
    parcours_label: form?.parcours_label ?? "",
    why_medicine: form?.why_medicine ?? "",
    expectations: form?.expectations ?? "",
    main_worry: form?.main_worry ?? "",
    current_method_description: form?.current_method_description ?? "",
    strengths: form?.strengths ?? "",
    weaknesses: form?.weaknesses ?? "",
    availability_notes: form?.availability_notes ?? "",
  };
}

export function StudentCoachingShell({
  currentProfile,
  groupe,
  coaches,
  initialForm,
  initialBooking,
  initialBookingSlot,
  initialAvailableSlots,
  setupError,
}: StudentCoachingShellProps) {
  const [form, setForm] = useState(initialForm);
  const [booking, setBooking] = useState(initialBooking);
  const [bookingSlot, setBookingSlot] = useState(initialBookingSlot);
  const [availableSlots, setAvailableSlots] = useState(initialAvailableSlots);
  const [draft, setDraft] = useState<FormDraft>(initialFormDraft(initialForm, currentProfile));
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const coachesById = useMemo(() => new Map(coaches.map((coach) => [coach.id, coach])), [coaches]);

  if (setupError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        La base coaching n'est pas prête: {setupError}. Applique d'abord la migration
        <span className="mx-1 font-semibold">`023_reset_coaching_first_brick.sql`</span>
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

  const handleSubmitForm = () => {
    startTransition(async () => {
      const response = await submitStudentCoachingForm(draft);
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

      <section className="rounded-3xl border border-[#d8dce8] bg-gradient-to-br from-[#0f1e36] via-[#142948] to-[#1b3761] p-6 text-white shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <StepCard
            step="1"
            title="Ton formulaire"
            text="On apprend à te connaître pour préparer un vrai appel utile."
            done={Boolean(form)}
          />
          <StepCard
            step="2"
            title="Ton rendez-vous"
            text="Juste après, tu réserves ton créneau avec un coach de ta classe."
            done={Boolean(booking)}
          />
          <StepCard
            step="3"
            title="Ton appel onboarding"
            text="Le coach fait le point avec toi et prépare la suite de ton accompagnement."
            done={booking?.status === "completed"}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-navy" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Formulaire d'onboarding</h2>
              <p className="text-sm text-gray-500">Réponds sérieusement, ton coach s'appuiera dessus pendant l'appel.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InputField label="Téléphone" value={draft.phone} onChange={(value) => setDraft((current) => ({ ...current, phone: value }))} />
            <InputField label="Ville" value={draft.city} onChange={(value) => setDraft((current) => ({ ...current, city: value }))} />
            <InputField
              label="Spécialités au bac"
              value={draft.bac_specialties}
              onChange={(value) => setDraft((current) => ({ ...current, bac_specialties: value }))}
            />
            <InputField
              label="Ton parcours actuel"
              value={draft.parcours_label}
              onChange={(value) => setDraft((current) => ({ ...current, parcours_label: value }))}
            />
            <TextAreaField
              label="Pourquoi veux-tu faire médecine ?"
              value={draft.why_medicine}
              onChange={(value) => setDraft((current) => ({ ...current, why_medicine: value }))}
            />
            <TextAreaField
              label="Qu'attends-tu du coaching ?"
              value={draft.expectations}
              onChange={(value) => setDraft((current) => ({ ...current, expectations: value }))}
            />
            <TextAreaField
              label="Ta plus grosse inquiétude aujourd'hui"
              value={draft.main_worry}
              onChange={(value) => setDraft((current) => ({ ...current, main_worry: value }))}
            />
            <TextAreaField
              label="Comment travailles-tu actuellement ?"
              value={draft.current_method_description}
              onChange={(value) => setDraft((current) => ({ ...current, current_method_description: value }))}
            />
            <TextAreaField
              label="Tes points forts"
              value={draft.strengths}
              onChange={(value) => setDraft((current) => ({ ...current, strengths: value }))}
            />
            <TextAreaField
              label="Tes points faibles"
              value={draft.weaknesses}
              onChange={(value) => setDraft((current) => ({ ...current, weaknesses: value }))}
            />
            <TextAreaField
              label="Tes disponibilités ou contraintes"
              value={draft.availability_notes}
              onChange={(value) => setDraft((current) => ({ ...current, availability_notes: value }))}
              className="md:col-span-2"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmitForm}
            disabled={isPending || !draft.phone.trim() || !draft.why_medicine.trim() || !draft.main_worry.trim()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {form ? "Mettre à jour mes réponses" : "Valider mon formulaire"}
          </button>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-navy" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Tes coachs</h2>
                <p className="text-sm text-gray-500">{groupe.name}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {coaches.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun coach n'est encore rattaché à ta classe.</p>
              ) : (
                coaches.map((coach) => (
                  <div key={coach.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-900">{getDisplayName(coach)}</p>
                    <p className="mt-1 text-sm text-gray-500">{coach.email}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-navy" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Réserver ton appel</h2>
                <p className="text-sm text-gray-500">
                  {form
                    ? "Choisis maintenant ton créneau."
                    : "Le formulaire doit être rempli avant de réserver un rendez-vous."}
                </p>
              </div>
            </div>

            {booking && bookingSlot ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Ton rendez-vous est réservé.</p>
                <p className="mt-2">
                  {formatDateTime(bookingSlot.start_at)} avec {getDisplayName(coachesById.get(booking.coach_id) ?? null)}
                </p>
                {bookingSlot.location && <p className="mt-1">Lieu / lien: {bookingSlot.location}</p>}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {!form ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                    Valide d'abord ton formulaire pour débloquer les créneaux.
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                    Aucun créneau n'est disponible pour l'instant. Reviens un peu plus tard ou contacte l'équipe.
                  </div>
                ) : (
                  availableSlots.map((slot) => (
                    <div key={slot.id} className="rounded-2xl border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900">{formatDateTime(slot.start_at)}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {getDisplayName(coachesById.get(slot.coach_id) ?? null)}
                      </p>
                      {slot.location && <p className="mt-1 text-xs text-gray-500">{slot.location}</p>}
                      <button
                        type="button"
                        onClick={() => handleBookSlot(slot)}
                        disabled={isPending || !form}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                        Réserver ce créneau
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StepCard({ step, title, text, done }: { step: string; title: string; text: string; done: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
          {step}
        </span>
        {done && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
      </div>
      <p className="mt-4 text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/75">{text}</p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`space-y-2 text-sm ${className}`}>
      <span className="font-medium text-gray-700">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
      />
    </label>
  );
}

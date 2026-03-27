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
    <div className="mx-auto max-w-[1450px] px-4 pb-16 pt-5 sm:px-6 xl:px-8">
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

      <div className="rounded-[40px] border border-[#e4ebf3] bg-[linear-gradient(180deg,#f9fbff_0%,#ffffff_14%,#f6f8fc_100%)] p-4 shadow-[0_30px_80px_rgba(18,49,77,0.08)] sm:p-6 lg:p-8">
        <section className="rounded-[32px] border border-[#e3ebf5] bg-white p-6 shadow-[0_14px_35px_rgba(18,49,77,0.05)] sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#e3ebf5] bg-[#fffdfa] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c5963d]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Coaching {groupe.name}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#e3ebf5] bg-[#f7fafc] px-3 py-1 text-[11px] font-medium text-[#5d7085]">
                  <UserRound className="h-3.5 w-3.5" />
                  {coaches.length} coach{coaches.length > 1 ? "s" : ""} disponible{coaches.length > 1 ? "s" : ""}
                </div>
              </div>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Parcours de départ</p>
              <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight text-[#12314d] sm:text-[42px]">
                Ton onboarding doit être simple: répondre clairement, réserver ton appel, avancer.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#63768b]">
                On te guide étape par étape. Tu remplis d’abord les infos essentielles, puis tu réserves ton premier
                échange avec un coach de ta promo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px] xl:max-w-[520px] xl:flex-1">
              <SummaryStat
                label="Questions clés"
                value={`${answeredRequiredCount}/${requiredFields.length}`}
                caption={onboardingDone ? "Formulaire prêt" : `${completionRatio}% complété`}
              />
              <SummaryStat
                label="Rendez-vous"
                value={bookingDone ? "Réservé" : "À caler"}
                caption={bookingSlot ? formatDateTime(bookingSlot.start_at) : "Après le formulaire"}
              />
              <SummaryStat
                label="Parcours"
                value={`${completedJourneyCount}/3`}
                caption={callDone ? "Appel lancé" : "Étapes initiales"}
              />
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[300px,minmax(0,1fr)]">
          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[30px] border border-[#dbe7f2] bg-[#12314d] p-5 text-white shadow-[0_28px_55px_rgba(18,49,77,0.24)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Action guidée</p>
              <h2 className="mt-3 text-2xl font-semibold leading-tight">{nextAction.title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">{nextAction.body}</p>
              <button
                type="button"
                onClick={() => scrollToSection(nextAction.target)}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#12314d] transition hover:bg-[#f6f9fd]"
              >
                {nextAction.cta}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-[30px] border border-[#e3ebf5] bg-white p-5 shadow-[0_16px_35px_rgba(18,49,77,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Feuille de route</p>
                  <h3 className="mt-2 text-xl font-semibold text-[#12314d]">Tes 3 étapes</h3>
                </div>
                <span className="rounded-full bg-[#eef6ff] px-3 py-1 text-[11px] font-semibold text-[#2e6fa3]">
                  {completedJourneyCount}/3
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#4fabdb_0%,#12314d_100%)] transition-all"
                  style={{ width: `${Math.max(12, Math.round((completedJourneyCount / journeySteps.length) * 100))}%` }}
                />
              </div>
              <div className="mt-5 space-y-3">
                {journeySteps.map((step, index) => (
                  <JourneyStep
                    key={step.id}
                    index={index + 1}
                    title={step.title}
                    description={step.description}
                    done={step.done}
                    locked={step.locked}
                    onClick={() => scrollToSection(step.id)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-[#e3ebf5] bg-white p-5 shadow-[0_16px_35px_rgba(18,49,77,0.05)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#eef6ff] p-3 text-[#2e6fa3]">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Prochain créneau</p>
                  <h3 className="mt-1 text-lg font-semibold text-[#12314d]">
                    {bookingSlot ? formatDateTime(bookingSlot.start_at) : "Pas encore réservé"}
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#64788d]">
                {bookingSlot
                  ? `Avec ${getDisplayName(coachesById.get(booking?.coach_id ?? "") ?? null)}${
                      bookingSlot.location ? ` · ${bookingSlot.location}` : ""
                    }`
                  : "Ton appel apparaîtra ici dès que tu auras choisi un créneau."}
              </p>
            </div>
          </aside>

          <main className="space-y-6">
            <section
              id="coaching-form-step"
              className="rounded-[34px] border border-[#e2e9f3] bg-white p-6 shadow-[0_24px_60px_rgba(18,49,77,0.07)] sm:p-8"
            >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Étape 1</p>
              <h3 className="mt-2 text-3xl font-semibold text-[#12314d]">Formulaire d'onboarding</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#62768b]">
                Réponds d’abord aux questions importantes. Ensuite, si tu veux, tu peux compléter les infos plus
                personnelles pour aider encore plus ton coach.
              </p>
              {formTemplate.description && (
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[#7a8ca0]">{formTemplate.description}</p>
              )}
            </div>
            <div className="rounded-[24px] border border-[#e3ebf5] bg-[#f8fbfe] px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Progression formulaire</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e6edf5]">
                <div className="h-full rounded-full bg-[#4fabdb]" style={{ width: `${completionRatio}%` }} />
              </div>
              <p className="mt-3 text-sm font-medium text-[#12314d]">
                {answeredRequiredCount}/{requiredFields.length} obligatoires complétées
              </p>
            </div>
          </div>

          {form && (
            <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Ton onboarding est déjà enregistré.</p>
                  <p className="mt-1 text-emerald-800/80">Tu peux encore ajuster tes réponses si quelque chose a changé avant l'appel.</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 space-y-8">
            <div className="rounded-[28px] border border-[#e8eef5] bg-[#f8fbfe] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Bloc 1</p>
                  <h4 className="mt-2 text-xl font-semibold text-[#12314d]">Les indispensables</h4>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#2e6fa3] shadow-sm">
                  Obligatoire
                </span>
              </div>
              <div className="mt-5 space-y-4">
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
            </div>

            {optionalFields.length > 0 && (
              <div className="rounded-[28px] border border-[#e8eef5] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Bloc 2</p>
                    <h4 className="mt-2 text-xl font-semibold text-[#12314d]">Pour aller plus loin</h4>
                    <p className="mt-1 text-sm text-[#64788d]">Facultatif, mais utile pour préparer un meilleur échange.</p>
                  </div>
                  <span className="rounded-full bg-[#f4f6f9] px-3 py-1 text-[11px] font-semibold text-[#708294]">
                    Facultatif
                  </span>
                </div>
                <div className="mt-5 space-y-4">
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
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-4 rounded-[28px] border border-[#e7edf5] bg-[#f8fbfe] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#12314d]">Tu peux sauvegarder puis revenir modifier plus tard.</p>
              <p className="mt-1 text-sm text-[#64788d]">Le coach verra la dernière version de ton formulaire au moment de l'appel.</p>
            </div>
            <button
              type="button"
              onClick={handleSubmitForm}
              disabled={isPending || !canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12314d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2940] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {form ? "Mettre à jour mes réponses" : "Enregistrer mon onboarding"}
            </button>
          </div>
          </section>

          <section id="coaching-booking-step" className="rounded-[34px] border border-[#e2e9f3] bg-white p-6 shadow-[0_24px_60px_rgba(18,49,77,0.07)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Étape 2</p>
                <h3 className="mt-2 text-3xl font-semibold text-[#12314d]">Réserve ton appel</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#62768b]">
                Une fois le formulaire envoyé, choisis simplement le créneau qui te convient le mieux.
                </p>
              </div>
              <div className="rounded-[24px] border border-[#e3ebf5] bg-[#f8fbfe] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Classe</p>
                <p className="mt-2 text-sm font-medium text-[#12314d]">{groupe.name}</p>
              </div>
            </div>

            <div className="mt-8">
            {booking && bookingSlot ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
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
              <div className="rounded-[28px] border border-dashed border-[#d8e1ed] bg-[#f8fbfe] p-8 text-center text-sm text-[#64788d]">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#12314d] shadow-sm">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <p className="mt-4 font-semibold text-[#12314d]">Les créneaux se débloquent juste après le formulaire.</p>
                <p className="mt-2">Termine d'abord ton onboarding pour afficher les disponibilités des coachs.</p>
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[#d8e1ed] bg-[#f8fbfe] p-8 text-center text-sm text-[#64788d]">
                Aucun créneau n'est disponible pour l'instant. Reviens plus tard ou contacte l'équipe.
              </div>
            ) : (
              <div className="space-y-4">
                {availableSlots.map((slot) => (
                  <div key={slot.id} className="rounded-[28px] border border-[#e3ebf5] bg-[#fbfcfe] p-5 transition hover:border-[#c9d9eb] hover:shadow-[0_12px_28px_rgba(18,49,77,0.06)]">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-[#eef6ff] p-3 text-[#2e6fa3]">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Créneau disponible</p>
                          <p className="mt-2 text-lg font-semibold text-[#12314d]">{formatDateTime(slot.start_at)}</p>
                          <p className="mt-1 text-sm text-[#62768b]">
                        {getDisplayName(coachesById.get(slot.coach_id) ?? null)}
                        {slot.location ? ` · ${slot.location}` : ""}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBookSlot(slot)}
                        disabled={isPending || !form}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12314d] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2940] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                        Réserver ce créneau
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </section>

          <section id="coaching-call-step" className="rounded-[34px] border border-[#e2e9f3] bg-white p-6 shadow-[0_24px_60px_rgba(18,49,77,0.07)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a98a8]">Équipe coaching</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#12314d]">Tes coachs de promo</h3>
              </div>
              <div className="rounded-2xl bg-[#f7fafc] p-3 text-[#12314d] ring-1 ring-[#e5edf6]">
                <UserRound className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {coaches.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#d8e1ed] bg-[#f8fbfe] p-6 text-sm text-[#64788d]">
                  Aucun coach n'est encore rattaché à cette classe.
                </div>
              ) : (
                coaches.map((coach) => (
                  <div key={coach.id} className="rounded-[24px] border border-[#e6edf5] bg-[#fbfcfe] p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-white p-3 text-[#12314d] shadow-sm ring-1 ring-[#e8edf5]">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#12314d]">{getDisplayName(coach)}</p>
                        <p className="text-sm text-[#6a7d92]">{coach.email}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          </main>
        </div>
      </div>
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
    <div className="rounded-[26px] border border-[#e7edf5] bg-white p-4 shadow-[0_10px_26px_rgba(18,49,77,0.035)] sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#12314d] text-sm font-semibold text-white shadow-sm">
          {index}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xl font-semibold leading-snug text-[#12314d]">{field.label}</h4>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                field.required ? "bg-amber-100 text-amber-700" : "bg-[#eef2f6] text-[#7e8fa4]"
              }`}
            >
              {field.required ? "Obligatoire" : "Facultatif"}
            </span>
          </div>

          {field.helper_text && <p className="mt-2 text-sm leading-6 text-[#64788d]">{field.helper_text}</p>}

          <div className="mt-3">
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

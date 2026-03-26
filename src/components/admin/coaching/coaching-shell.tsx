import {
  AlertTriangle,
  ArrowRight,
  BookMarked,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  LifeBuoy,
  Mail,
  PhoneCall,
  Route,
  Sparkles,
  Target,
  Users,
  Video,
} from "lucide-react";
import {
  COACHING_FUTURE_INTEGRATIONS,
  COACHING_MVP_SCOPE,
  COACHING_PHASES,
  COACHING_PILARS,
  COACHING_PROFILE_TYPES,
  COACHING_STATUS_META,
  COACHING_WEEKLY_FORM,
  calculateCoachingStatus,
} from "@/lib/coaching";
import type { CoachingCohort, CoachingIntervention, CoachingNote, CoachingStudent, CoachingWeeklyCheckin, Profile } from "@/types/database";
import { CoachingWorkspace } from "./coaching-workspace";

type CoachingStat = {
  label: string;
  value: string;
  hint: string;
};

type CoachingShellProps = {
  stats: CoachingStat[];
  setupComplete: boolean;
  setupError?: string | null;
  cohorts: CoachingCohort[];
  assignments: (CoachingStudent & { student?: Profile; coach?: Profile | null })[];
  students: Profile[];
  coaches: Profile[];
  checkins: CoachingWeeklyCheckin[];
  notes: CoachingNote[];
  interventions: CoachingIntervention[];
};

const scenarioEvaluations = [
  {
    title: "Eleve stable qui monte en puissance",
    summary: "Volume de travail solide, comprehension correcte, confiance saine.",
    evaluation: calculateCoachingStatus({
      hoursBucket: "10_20",
      understanding: "mostly_yes",
      mentalState: "okay",
      mainBlocker: "none",
      momentum: "improving",
      previousMomentum: "same",
    }),
  },
  {
    title: "Eleve fragile qui se tasse",
    summary: "L'eleve bosse un peu mais doute, stagne et verbalise un blocage.",
    evaluation: calculateCoachingStatus({
      hoursBucket: "5_10",
      understanding: "a_little",
      mentalState: "doubtful",
      mainBlocker: "organization",
      momentum: "same",
      previousMomentum: "same",
    }),
  },
  {
    title: "Eleve en rupture a rappeler vite",
    summary: "Tres faible volume de travail et dynamique en recul repetee.",
    evaluation: calculateCoachingStatus({
      hoursBucket: "lt5",
      understanding: "not_at_all",
      mentalState: "lost",
      mainBlocker: "motivation",
      momentum: "backward",
      previousMomentum: "backward",
    }),
  },
] as const;

const sprintCards = [
  {
    title: "Sprint 1",
    subtitle: "Le cockpit de base",
    points: [
      "Cohortes, eleves, coachs assignes",
      "Profils permanents et statuts dynamiques",
      "File d'actions et notes internes",
    ],
  },
  {
    title: "Sprint 2",
    subtitle: "Le rituel hebdomadaire",
    points: [
      "Questionnaire hebdo",
      "Calcul auto vert / orange / rouge",
      "Historique, tendances et alertes",
    ],
  },
  {
    title: "Sprint 3",
    subtitle: "Les couches externes",
    points: [
      "Crisp, Calendly, n8n",
      "Mails et sequences de relance",
      "Exports et synchronisations equipe",
    ],
  },
] as const;

export function CoachingShell({
  stats,
  setupComplete,
  setupError,
  cohorts,
  assignments,
  students,
  coaches,
  checkins,
  notes,
  interventions,
}: CoachingShellProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#d8dce8] bg-gradient-to-br from-[#0f1e36] via-[#142948] to-[#1b3761] p-6 text-white shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#e7c879]">
              Coaching 2026-2027
            </div>
            <div className="space-y-3">
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight">
                Construire un cockpit de pilotage du risque eleve plutot qu'un simple onglet de contenu.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/75">
                Cette premiere version met a plat le systeme cible: profils permanents, statuts hebdomadaires,
                interventions coach/admin, conferences et automatisations a brancher ensuite proprement.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {COACHING_PILARS.map((pillar) => (
                <div key={pillar.title} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                  <p className="text-sm font-semibold text-white">{pillar.title}</p>
                  <p className="mt-2 text-xs leading-5 text-white/70">{pillar.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Target className="h-4 w-4 text-[#e7c879]" />
              Ce MVP doit faire tout de suite
            </div>
            <div className="mt-4 space-y-3">
              {COACHING_MVP_SCOPE.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-white/80">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{stat.label}</p>
            <p className="mt-3 text-3xl font-bold text-navy">{stat.value}</p>
            <p className="mt-2 text-sm text-gray-500">{stat.hint}</p>
          </div>
        ))}
      </section>

      <CoachingWorkspace
        setupComplete={setupComplete}
        setupError={setupError}
        initialCohorts={cohorts}
        initialAssignments={assignments}
        students={students}
        coaches={coaches}
        initialCheckins={checkins}
        initialNotes={notes}
        initialInterventions={interventions}
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Flux annuel de coaching</h3>
          </div>
          <div className="mt-6 space-y-4">
            {COACHING_PHASES.map((phase, index) => (
              <div key={phase.slug} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{phase.title}</p>
                    <p className="text-xs text-gray-500">{phase.period}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">{phase.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {phase.priorities.map((priority) => (
                    <span
                      key={priority}
                      className="rounded-full border border-[#d7deeb] bg-white px-3 py-1 text-xs font-medium text-gray-600"
                    >
                      {priority}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gold" />
              <h3 className="text-lg font-semibold text-gray-900">Ce qu'on garde pour plus tard</h3>
            </div>
            <div className="mt-5 space-y-3">
              {COACHING_FUTURE_INTEGRATIONS.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-gray-600">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Decision d'architecture cle</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-900/80">
              Airtable peut rester un support equipe, mais la source de verite doit vivre ici. Sinon le cockpit coaching
              restera fragile, duplique et difficile a automatiser proprement.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-navy" />
          <h3 className="text-lg font-semibold text-gray-900">Profils permanents d'onboarding</h3>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {COACHING_PROFILE_TYPES.map((profile) => (
            <div key={profile.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{profile.shortLabel}</p>
              <h4 className="mt-2 text-base font-semibold text-gray-900">{profile.title}</h4>
              <p className="mt-3 text-sm leading-6 text-gray-600">{profile.summary}</p>
              <div className="mt-4 rounded-xl border border-[#d8dce8] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Focus coaching</p>
                <p className="mt-2 text-sm text-gray-700">{profile.focus}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Statuts hebdomadaires</h3>
          </div>
          <div className="mt-5 space-y-4">
            {Object.entries(COACHING_STATUS_META).map(([key, meta]) => (
              <div key={key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.icon}</span>
                  <p className="text-base font-semibold text-gray-900">{meta.label}</p>
                </div>
                <p className="mt-2 text-sm text-gray-600">{meta.description}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[#d8dce8] bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Declencheur</p>
                    <p className="mt-2 text-sm text-gray-700">{meta.trigger}</p>
                  </div>
                  <div className="rounded-xl border border-[#d8dce8] bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Action</p>
                    <p className="mt-2 text-sm text-gray-700">{meta.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Simulation de scoring hebdo</h3>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Trois cas tres concrets pour visualiser ce que le moteur de statut doit produire.
          </p>
          <div className="mt-5 space-y-4">
            {scenarioEvaluations.map((scenario) => {
              const meta = COACHING_STATUS_META[scenario.evaluation.status];
              return (
                <div key={scenario.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{scenario.title}</p>
                      <p className="mt-1 text-sm text-gray-500">{scenario.summary}</p>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-gray-700">
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#d8dce8] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Pourquoi</p>
                      <ul className="mt-2 space-y-2 text-sm text-gray-700">
                        {scenario.evaluation.reasons.map((reason) => (
                          <li key={reason} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-[#d8dce8] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Action a lancer</p>
                      <p className="mt-2 text-sm text-gray-700">{scenario.evaluation.recommendedAction}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-navy" />
          <h3 className="text-lg font-semibold text-gray-900">Formulaire hebdomadaire Diploma Sante</h3>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {COACHING_WEEKLY_FORM.map((question, index) => (
            <div key={question.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Question {index + 1}</p>
              <h4 className="mt-2 text-base font-semibold text-gray-900">{question.question}</h4>
              <div className="mt-4 flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <span
                    key={option}
                    className="rounded-full border border-[#d7deeb] bg-white px-3 py-1 text-xs font-medium text-gray-600"
                  >
                    {option}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-600">{question.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Parcours d'interventions a outiller</h3>
          </div>
          <div className="mt-5 space-y-3">
            {[
              { icon: PhoneCall, label: "Appel onboarding eleve", text: "Call de 30 min pour cadrer le profil, les videos a regarder et les premiers chapitres a bosser." },
              { icon: Users, label: "Appel responsable legal", text: "Restitution du profil, explication du dispositif et des attentes pendant la phase intensive." },
              { icon: Video, label: "Visios de coaching", text: "Petits groupes selon les profils, tres frequents entre mi-aout et mi-octobre." },
              { icon: Mail, label: "Relances automatisees", text: "Mails, puis ensuite SMS / WhatsApp selon statut et blocage detecte." },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/10 text-navy">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    <p className="mt-1 text-sm text-gray-600">{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5 text-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Plan de construction recommande</h3>
          </div>
          <div className="mt-5 grid gap-4">
            {sprintCards.map((sprint) => (
              <div key={sprint.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{sprint.title}</p>
                    <p className="text-sm text-gray-500">{sprint.subtitle}</p>
                  </div>
                  <span className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white">
                    Priorite
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {sprint.points.map((point) => (
                    <div key={point} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gold" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

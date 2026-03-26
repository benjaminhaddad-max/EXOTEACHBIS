export type CoachingProfileKey =
  | "good_confident"
  | "good_fragile"
  | "good_arrogant"
  | "average_motivated"
  | "average_unaware";

export type CoachingStatusKey = "green" | "orange" | "red";

export type CoachingHoursBucket = "lt5" | "5_10" | "10_20" | "20_plus";
export type CoachingUnderstandingLevel = "not_at_all" | "a_little" | "mostly_yes" | "fully";
export type CoachingMentalState = "lost" | "doubtful" | "okay" | "confident";
export type CoachingMainBlocker = "subject" | "organization" | "motivation" | "none";
export type CoachingMomentum = "backward" | "same" | "improving" | "much_better";

export type WeeklyCheckinAnswers = {
  hoursBucket: CoachingHoursBucket;
  understanding: CoachingUnderstandingLevel;
  mentalState: CoachingMentalState;
  mainBlocker: CoachingMainBlocker;
  momentum: CoachingMomentum;
  previousMomentum?: CoachingMomentum | null;
};

export type CoachingStatusEvaluation = {
  status: CoachingStatusKey;
  reasons: string[];
  recommendedAction: string;
};

export const COACHING_PILARS = [
  {
    title: "Source de verite unique",
    description:
      "Supabase doit piloter les profils, les statuts, les notes et les actions. Airtable reste un export ou un outil equipe, pas le cerveau du systeme.",
  },
  {
    title: "Pilotage du risque eleve",
    description:
      "Le coeur du produit n'est pas le contenu. C'est la detection precoce des signaux faibles puis le declenchement de la bonne intervention humaine.",
  },
  {
    title: "Automatisation par couches",
    description:
      "On construit d'abord le cockpit admin dans l'app. Les briques Crisp, Calendly, n8n, mails et WhatsApp viennent apres, au-dessus d'un socle propre.",
  },
] as const;

export const COACHING_PHASES = [
  {
    slug: "pre-inscription",
    title: "Pre-inscription",
    period: "Avant validation faculte",
    description:
      "Boucle de mails motivants, storytelling, projection dans l'annee et education a la realite PASS/LAS.",
    priorities: [
      "Nourrir la motivation",
      "Preparer le terrain avant l'onboarding",
      "Commencer la segmentation des profils",
    ],
  },
  {
    slug: "onboarding",
    title: "Onboarding inscription fac",
    period: "Juin a septembre",
    description:
      "Formulaire de profil, appel de 30 min, briefing parent, assignation du coach, videos Ben et premiers chapitres de pre-rentree.",
    priorities: [
      "Capturer un profil permanent fiable",
      "Rassurer l'eleve et le responsable legal",
      "Lancer les premiers rituels de travail",
    ],
  },
  {
    slug: "intensive",
    title: "Phase intensive",
    period: "Pre-rentree a mi-octobre",
    description:
      "Questionnaire hebdo, analyse Exoteach, visios par profils, rendez-vous sur demande et passage progressif de tous les eleves vers le vert.",
    priorities: [
      "Intervenir tres vite sur les oranges",
      "Escalader immediatement les rouges",
      "Installer l'habitude du test du dimanche",
    ],
  },
  {
    slug: "cadence",
    title: "Cadence longue",
    period: "Mi-octobre a fin mai",
    description:
      "Suivi plus leger pour les verts, conferences mensuelles, suivi adaptatif, maintien du chat et des rendez-vous coach sur demande.",
    priorities: [
      "Automatiser le vert",
      "Conserver une surveillance active des oranges et rouges",
      "Maintenir une communication impeccablement reguliere",
    ],
  },
] as const;

export const COACHING_PROFILE_TYPES = [
  {
    key: "good_confident" as const,
    shortLabel: "Profil 1",
    title: "Le bon eleve bien dans sa tete",
    summary: "Bon niveau et bonne mentalite. Il reussira si on le cadre correctement.",
    focus: "Structurer, canaliser, garder le rythme.",
  },
  {
    key: "good_fragile" as const,
    shortLabel: "Profil 2",
    title: "Le bon eleve qui se sent nul",
    summary: "Il a le niveau mais se sabote mentalement. C'est le profil psychologiquement le plus urgent.",
    focus: "Rassurer, objectiver ses progres, couper l'auto-sabotage.",
  },
  {
    key: "good_arrogant" as const,
    shortLabel: "Profil 3",
    title: "Le bon eleve arrogant",
    summary: "Bon niveau mais trop confiant. Il risque de sous-estimer violemment la P1.",
    focus: "Creer l'electrochoc, recadrer vite, imposer des preuves de travail.",
  },
  {
    key: "average_motivated" as const,
    shortLabel: "Profil 4",
    title: "Le moyen motive",
    summary: "Niveau moyen ou faible mais vraie volonte. Il a besoin d'une voie extremement claire.",
    focus: "Fournir une methode, des routines et des objectifs simples.",
  },
  {
    key: "average_unaware" as const,
    shortLabel: "Profil 5",
    title: "Le moyen inconscient",
    summary: "Il ne realise pas encore l'intensite de l'annee. Sans intervention forte, il deraille.",
    focus: "Faire prendre conscience du niveau d'exigence et lancer des habitudes fermes.",
  },
] as const;

export const COACHING_STATUS_META = {
  green: {
    label: "Vert",
    icon: "🟢",
    description: "Tout roule, le systeme automatique suffit.",
    trigger: "Travail solide, comprehension correcte, etat mental stable, dynamique positive.",
    action: "Mail d'encouragement et contenu de progression avancee.",
  },
  orange: {
    label: "Orange",
    icon: "🟠",
    description: "Signal d'alerte, le coach surveille de pres.",
    trigger: "Au moins un signal faible detecte dans la semaine.",
    action: "Mail de recadrage doux, ressource ciblee et surveillance coach.",
  },
  red: {
    label: "Rouge",
    icon: "🔴",
    description: "Urgence, intervention humaine immediate.",
    trigger: "Charge de travail critique, etat mental casse ou glissade repetitive.",
    action: "Escalade prioritaire, proposition de call et suivi admin rapide.",
  },
} satisfies Record<
  CoachingStatusKey,
  { label: string; icon: string; description: string; trigger: string; action: string }
>;

export const COACHING_WEEKLY_FORM = [
  {
    id: "hours",
    question: "Cette semaine tu as travaille combien d'heures ?",
    options: ["Moins de 5h", "Entre 5 et 10h", "Entre 10 et 20h", "Plus de 20h"],
    note: "Moins de 5h doit declencher un rouge immediat.",
  },
  {
    id: "understanding",
    question: "Cette semaine tu as compris les cours ?",
    options: ["Pas du tout", "Un peu", "Globalement oui", "Completement"],
    note: "A croiser avec les QCM pour confirmer ou contredire la perception.",
  },
  {
    id: "mental_state",
    question: "Comment tu te sens en ce moment par rapport au concours ?",
    options: ["Je suis perdu", "Je doute beaucoup", "Ca va globalement", "Je suis confiant"],
    note: "Question cle pour detecter les profils fragiles qui se sabotent en silence.",
  },
  {
    id: "main_blocker",
    question: "Qu'est-ce qui t'a le plus bloque cette semaine ?",
    options: ["Une matiere specifique", "Mon organisation", "Ma motivation", "Rien, ca s'est bien passe"],
    note: "Peut piloter des videos ou briefs de coaching cibles.",
  },
  {
    id: "momentum",
    question: "Par rapport a la semaine derniere tu te sens...",
    options: ["En recul", "Pareil", "En progression", "Beaucoup mieux"],
    note: "Permet de capter les glissades progressives avant qu'elles deviennent critiques.",
  },
  {
    id: "free_text",
    question: "Y a-t-il quelque chose que tu veux dire a ton coach cette semaine ?",
    options: ["Texte libre optionnel"],
    note: "Soupape emotionnelle et terrain d'information tres riche pour le coach.",
  },
] as const;

export const COACHING_MVP_SCOPE = [
  "Creer une cohorte 2026-2027",
  "Assigner un coach a chaque eleve",
  "Stocker le profil permanent d'onboarding",
  "Collecter le questionnaire hebdomadaire",
  "Calculer automatiquement le statut vert / orange / rouge",
  "Afficher une file d'actions pour coachs et admins",
  "Journaliser les appels, rendez-vous et notes de suivi",
  "Planifier les conferences et visios de coaching",
] as const;

export const COACHING_FUTURE_INTEGRATIONS = [
  "Sequences mails automatiques",
  "Escalades n8n",
  "Chat Crisp relie au dossier coaching",
  "Prise de rendez-vous Calendly",
  "Notifications SMS / WhatsApp",
  "Exports ou sync Airtable",
] as const;

export function calculateCoachingStatus(
  answers: WeeklyCheckinAnswers
): CoachingStatusEvaluation {
  const reasons: string[] = [];

  if (answers.hoursBucket === "lt5") {
    reasons.push("Charge de travail critique inferieure a 5h.");
  }

  if (answers.mentalState === "lost") {
    reasons.push("Etat mental declare comme perdu.");
  }

  if (answers.momentum === "backward" && answers.previousMomentum === "backward") {
    reasons.push("Dynamique en recul deux semaines de suite.");
  }

  if (reasons.length > 0) {
    return {
      status: "red",
      reasons,
      recommendedAction:
        "Declencher une escalade prioritaire avec proposition de call individuel et suivi admin.",
    };
  }

  const weakSignals: string[] = [];

  if (answers.hoursBucket === "5_10") {
    weakSignals.push("Volume de travail encore fragile.");
  }

  if (answers.understanding === "not_at_all" || answers.understanding === "a_little") {
    weakSignals.push("Compréhension insuffisante des cours.");
  }

  if (answers.mentalState === "doubtful") {
    weakSignals.push("Doute mental important.");
  }

  if (answers.mainBlocker !== "none") {
    weakSignals.push("Blocage principal identifie par l'eleve.");
  }

  if (answers.momentum === "same" || answers.momentum === "backward") {
    weakSignals.push("Dynamique qui stagne ou recule.");
  }

  if (weakSignals.length > 0) {
    return {
      status: "orange",
      reasons: weakSignals,
      recommendedAction:
        "Envoyer un recadrage doux, proposer une ressource ciblee et faire surveiller l'eleve par le coach.",
    };
  }

  return {
    status: "green",
    reasons: ["Les indicateurs de travail, de comprehension et de dynamique sont solides."],
    recommendedAction:
      "Automatiser l'encouragement, alleger le suivi et reserver l'intervention humaine aux autres profils.",
  };
}

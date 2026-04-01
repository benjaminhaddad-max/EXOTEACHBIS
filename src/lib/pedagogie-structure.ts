import type { Dossier, DossierType, FormationOffer } from "@/types/database";

export const FORMATION_OFFERS: Array<{
  code: FormationOffer;
  label: string;
  description: string;
  defaultColor: string;
}> = [
  {
    code: "prepa_pass",
    label: "PREPA PASS",
    description: "Préparation PASS avec universités puis semestres/options.",
    defaultColor: "#0e1e35",
  },
  {
    code: "prepa_las",
    label: "PREPA LAS",
    description: "Préparation LAS avec universités puis semestres/options.",
    defaultColor: "#1D4ED8",
  },
  {
    code: "prepa_lsps",
    label: "PREPA LSPS",
    description: "Préparation LSPS avec universités puis semestres/options.",
    defaultColor: "#0F766E",
  },
  {
    code: "terminale_sante",
    label: "Terminale Santé",
    description: "Organisation par périodes pédagogiques et matières.",
    defaultColor: "#9333EA",
  },
  {
    code: "paes_fr_eu",
    label: "PAES FR/EU",
    description: "Organisation par périodes pédagogiques et matières.",
    defaultColor: "#B45309",
  },
  {
    code: "premiere_elite",
    label: "Première Elite",
    description: "Organisation directe par matières puis chapitres.",
    defaultColor: "#BE123C",
  },
];

function humanizeOfferCode(code: string) {
  return code
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export const DOSSIER_TYPE_META: Record<
  DossierType,
  {
    label: string;
    shortLabel: string;
    description: string;
  }
> = {
  generic: {
    label: "Dossier libre",
    shortLabel: "Libre",
    description: "Noeud legacy ou libre de l'arborescence.",
  },
  offer: {
    label: "Offre de formation",
    shortLabel: "Offre",
    description: "Racine business: PREPA PASS, LAS, LSPS, etc.",
  },
  sub_offer: {
    label: "Sous-offre",
    shortLabel: "Sous-offre",
    description: "Sous-niveau d'une offre (ex: LSPS1, LSPS2, LSPS3).",
  },
  university: {
    label: "Université",
    shortLabel: "Université",
    description: "Université couverte à l'intérieur d'une offre.",
  },
  semester: {
    label: "Semestre",
    shortLabel: "Semestre",
    description: "Semestre pédagogique comme S1 ou S2.",
  },
  option: {
    label: "Option / complément",
    shortLabel: "Option",
    description: "Oraux, option ou complément associé à une université.",
  },
  period: {
    label: "Période",
    shortLabel: "Période",
    description: "Bloc de l'année hors logique universitaire.",
  },
  module: {
    label: "Bloc pédagogique",
    shortLabel: "Bloc",
    description: "Sous-ensemble pédagogique intermédiaire.",
  },
  subject: {
    label: "Matière",
    shortLabel: "Matière",
    description: "Matière contenant ensuite les chapitres.",
  },
};

export function getOfferMeta(code?: FormationOffer | null) {
  if (!code) return null;
  return FORMATION_OFFERS.find((offer) => offer.code === code) ?? {
    code,
    label: humanizeOfferCode(code),
    description: "",
    defaultColor: "#0e1e35",
  };
}

export function getOfferLabel(code?: FormationOffer | null) {
  return getOfferMeta(code)?.label ?? "Offre";
}

export function inferOfferFromAncestors(
  dossier: Pick<Dossier, "id" | "parent_id" | "formation_offer">,
  allDossiers: Pick<Dossier, "id" | "parent_id" | "formation_offer">[]
): FormationOffer | null {
  if (dossier.formation_offer) return dossier.formation_offer;

  const byId = new Map(allDossiers.map((item) => [item.id, item]));
  let currentParentId = dossier.parent_id;

  while (currentParentId) {
    const parent = byId.get(currentParentId);
    if (!parent) break;
    if (parent.formation_offer) return parent.formation_offer;
    currentParentId = parent.parent_id;
  }

  return null;
}

export function getAllowedChildTypes(
  parent: Pick<Dossier, "dossier_type" | "formation_offer"> | null
): DossierType[] {
  if (!parent) return ["offer"];

  switch (parent.dossier_type) {
    case "offer":
      if (["prepa_pass", "prepa_las", "prepa_lsps"].includes(parent.formation_offer ?? "")) {
        return ["sub_offer", "university", "subject", "module"];
      }
      if (parent.formation_offer === "premiere_elite") {
        return ["sub_offer", "semester", "period", "module", "subject"];
      }
      return ["sub_offer", "period", "module", "subject"];
    case "sub_offer":
      return ["university", "subject", "module", "period"];
    case "university":
      return ["semester", "option", "subject", "module"];
    case "semester":
    case "option":
      return ["subject", "module"];
    case "period":
    case "module":
      return ["module", "subject"];
    case "subject":
      return [];
    case "generic":
    default:
      return ["generic", "module", "subject"];
  }
}

export function getDefaultChildType(
  parent: Pick<Dossier, "dossier_type" | "formation_offer"> | null
): DossierType {
  return getAllowedChildTypes(parent)[0] ?? "generic";
}

export function getContentCreationLabel(
  dossierType?: DossierType | null
) {
  if (dossierType === "subject") return "Créer un chapitre";
  return "Créer un cours";
}

export function canCreateCourseInDossier(
  dossierType?: DossierType | null
) {
  return !dossierType || dossierType === "generic" || dossierType === "subject";
}

export function getDossierPathLabel(
  dossierId: string | null,
  dossiers: Pick<Dossier, "id" | "name" | "parent_id">[]
) {
  if (!dossierId) return "Aucun périmètre";

  const byId = new Map(dossiers.map((dossier) => [dossier.id, dossier]));
  const labels: string[] = [];
  let currentId: string | null = dossierId;

  while (currentId) {
    const current = byId.get(currentId);
    if (!current) break;
    labels.unshift(current.name);
    currentId = current.parent_id;
  }

  return labels.join(" > ");
}

import { FORMATION_OFFERS } from "@/lib/pedagogie-structure";
import type { DossierType, FormationOffer } from "@/types/database";

export type FormationOfferSetting = {
  code: FormationOffer;
  label: string;
  description: string;
  defaultColor: string;
  enabled: boolean;
  orderIndex: number;
};

export type DossierNamePreset = {
  id: string;
  formationOffer: FormationOffer;
  dossierType: DossierType;
  title: string;
  suggestions: string[];
};

export type AdminSettingRow = {
  key: string;
  value: unknown;
};

export const DEFAULT_FORMATION_OFFER_SETTINGS: FormationOfferSetting[] = FORMATION_OFFERS.map((offer, index) => ({
  code: offer.code,
  label: offer.label,
  description: offer.description,
  defaultColor: offer.defaultColor,
  enabled: true,
  orderIndex: index,
}));

export const DEFAULT_DOSSIER_NAME_PRESETS: DossierNamePreset[] = [
  {
    id: "prepa_pass_university",
    formationOffer: "prepa_pass",
    dossierType: "university",
    title: "Universités PASS",
    suggestions: ["Université Paris-Cité", "Sorbonne Université", "Université Paris-Saclay"],
  },
  {
    id: "prepa_pass_semester",
    formationOffer: "prepa_pass",
    dossierType: "semester",
    title: "Semestres PASS",
    suggestions: ["S1", "S2"],
  },
  {
    id: "prepa_pass_option",
    formationOffer: "prepa_pass",
    dossierType: "option",
    title: "Compléments PASS",
    suggestions: ["Oraux", "Mineure", "Complément"],
  },
  {
    id: "prepa_las_university",
    formationOffer: "prepa_las",
    dossierType: "university",
    title: "Universités LAS",
    suggestions: ["Université Paris-Cité", "Sorbonne Université", "Université de Versailles"],
  },
  {
    id: "prepa_las_semester",
    formationOffer: "prepa_las",
    dossierType: "semester",
    title: "Semestres LAS",
    suggestions: ["S1", "S2"],
  },
  {
    id: "prepa_lsps_university",
    formationOffer: "prepa_lsps",
    dossierType: "university",
    title: "Universités LSPS",
    suggestions: ["Université Paris-Cité", "Université Paris-Saclay"],
  },
  {
    id: "prepa_lsps_semester",
    formationOffer: "prepa_lsps",
    dossierType: "semester",
    title: "Semestres LSPS",
    suggestions: ["S1", "S2"],
  },
  {
    id: "terminale_sante_period",
    formationOffer: "terminale_sante",
    dossierType: "period",
    title: "Périodes Terminale Santé",
    suggestions: ["Rentrée", "Automne", "Hiver", "Printemps", "Bootcamp Bac"],
  },
  {
    id: "paes_fr_eu_period",
    formationOffer: "paes_fr_eu",
    dossierType: "period",
    title: "Périodes PAES FR/EU",
    suggestions: ["Rentrée", "Intensif 1", "Intensif 2", "Oraux"],
  },
  {
    id: "premiere_elite_subject",
    formationOffer: "premiere_elite",
    dossierType: "subject",
    title: "Matières Première Elite",
    suggestions: ["Biologie", "Chimie", "Physique", "Mathématiques"],
  },
];

export function normalizeFormationOfferSettings(input: unknown) {
  const defaultsByCode = new Map(
    DEFAULT_FORMATION_OFFER_SETTINGS.map((offer) => [offer.code, offer])
  );

  if (!Array.isArray(input)) {
    return DEFAULT_FORMATION_OFFER_SETTINGS;
  }

  const merged = input
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const candidate = raw as Partial<FormationOfferSetting>;
      if (!candidate.code || !defaultsByCode.has(candidate.code)) return null;
      const fallback = defaultsByCode.get(candidate.code)!;
      return {
        code: fallback.code,
        label: candidate.label?.trim() || fallback.label,
        description: candidate.description?.trim() || fallback.description,
        defaultColor: candidate.defaultColor?.trim() || fallback.defaultColor,
        enabled: candidate.enabled ?? true,
        orderIndex: Number.isFinite(candidate.orderIndex) ? Number(candidate.orderIndex) : index,
      } satisfies FormationOfferSetting;
    })
    .filter(Boolean) as FormationOfferSetting[];

  const missing = DEFAULT_FORMATION_OFFER_SETTINGS.filter(
    (offer) => !merged.some((candidate) => candidate.code === offer.code)
  );

  return [...merged, ...missing].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function normalizeDossierNamePresets(input: unknown) {
  if (!Array.isArray(input)) {
    return DEFAULT_DOSSIER_NAME_PRESETS;
  }

  const normalized = input
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const candidate = raw as Partial<DossierNamePreset>;
      if (!candidate.formationOffer || !candidate.dossierType) return null;
      if (!FORMATION_OFFERS.some((offer) => offer.code === candidate.formationOffer)) return null;
      const suggestions = Array.isArray(candidate.suggestions)
        ? candidate.suggestions.map((item) => String(item).trim()).filter(Boolean)
        : [];

      return {
        id: candidate.id?.trim() || `${candidate.formationOffer}_${candidate.dossierType}_${index}`,
        formationOffer: candidate.formationOffer,
        dossierType: candidate.dossierType,
        title: candidate.title?.trim() || `${candidate.formationOffer} / ${candidate.dossierType}`,
        suggestions,
      } satisfies DossierNamePreset;
    })
    .filter(Boolean) as DossierNamePreset[];

  return normalized.length > 0 ? normalized : DEFAULT_DOSSIER_NAME_PRESETS;
}

export function parsePedagogieAdminSettings(rows: AdminSettingRow[] = []) {
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    formationOffers: normalizeFormationOfferSettings(map.get("pedagogie_formation_offers")),
    dossierNamePresets: normalizeDossierNamePresets(map.get("pedagogie_name_presets")),
  };
}

export function getDossierSuggestions(
  presets: DossierNamePreset[],
  formationOffer: FormationOffer | null | undefined,
  dossierType: DossierType | null | undefined
) {
  if (!formationOffer || !dossierType) return [];
  return presets.filter(
    (preset) => preset.formationOffer === formationOffer && preset.dossierType === dossierType
  );
}

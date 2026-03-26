import type {
  CoachingMentality,
  CoachingMethodLevel,
  CoachingSchoolLevel,
  CoachingWorkCapacity,
} from "@/types/database";

export const COACHING_MENTALITY_OPTIONS: Array<{ value: CoachingMentality; label: string }> = [
  { value: "passif", label: "Passif" },
  { value: "pessimiste", label: "Pessimiste" },
  { value: "optimiste", label: "Optimiste" },
];

export const COACHING_SCHOOL_LEVEL_OPTIONS: Array<{ value: CoachingSchoolLevel; label: string }> = [
  { value: "limite", label: "Limite" },
  { value: "normal", label: "Normal" },
  { value: "bon", label: "Bon" },
];

export const COACHING_WORK_CAPACITY_OPTIONS: Array<{ value: CoachingWorkCapacity; label: string }> = [
  { value: "faible", label: "Faible" },
  { value: "moyenne", label: "Moyenne" },
  { value: "forte", label: "Forte" },
];

export const COACHING_METHOD_OPTIONS: Array<{ value: CoachingMethodLevel; label: string }> = [
  { value: "mauvaise", label: "Mauvaise" },
  { value: "moyenne", label: "Moyenne" },
  { value: "bonne", label: "Bonne" },
];

const MENTALITY_SCORE: Record<CoachingMentality, number> = {
  passif: 1,
  pessimiste: 2,
  optimiste: 3,
};

const SCHOOL_LEVEL_SCORE: Record<CoachingSchoolLevel, number> = {
  limite: 1,
  normal: 2,
  bon: 3,
};

const WORK_CAPACITY_SCORE: Record<CoachingWorkCapacity, number> = {
  faible: 1,
  moyenne: 2,
  forte: 3,
};

const METHOD_SCORE: Record<CoachingMethodLevel, number> = {
  mauvaise: 1,
  moyenne: 2,
  bonne: 3,
};

export function calculateConfidenceScore(input: {
  mentality: CoachingMentality;
  schoolLevel: CoachingSchoolLevel;
  workCapacity: CoachingWorkCapacity;
  methodLevel: CoachingMethodLevel;
}) {
  const raw =
    MENTALITY_SCORE[input.mentality] +
    SCHOOL_LEVEL_SCORE[input.schoolLevel] +
    WORK_CAPACITY_SCORE[input.workCapacity] +
    METHOD_SCORE[input.methodLevel];

  return Math.round((raw / 12) * 100);
}

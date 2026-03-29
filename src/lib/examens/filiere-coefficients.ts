export type FiliereMatiereCoefficient = {
  matiere_id: string;
  filiere_id: string;
  coefficient: number;
};

export function createFiliereCoefficientKey(matiereId: string, filiereId: string) {
  return `${matiereId}:${filiereId}`;
}

export function buildFiliereCoefficientMap(rows: FiliereMatiereCoefficient[]) {
  return new Map(
    rows.map((row) => [createFiliereCoefficientKey(row.matiere_id, row.filiere_id), Number(row.coefficient)])
  );
}

export function resolveSerieCoefficient({
  defaultCoefficient,
  matiereId,
  filiereId,
  coefficientMap,
}: {
  defaultCoefficient?: number | null;
  matiereId?: string | null;
  filiereId?: string | null;
  coefficientMap?: Map<string, number>;
}) {
  if (matiereId && filiereId && coefficientMap) {
    const override = coefficientMap.get(createFiliereCoefficientKey(matiereId, filiereId));
    if (override != null && !Number.isNaN(override)) {
      return override;
    }
  }

  return defaultCoefficient ?? 1;
}

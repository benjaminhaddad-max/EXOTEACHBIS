import type { Dossier } from "@/types/database";

function nameLooksLikePassLasLsps(name: string): boolean {
  const n = name.trim().toUpperCase();
  return (
    n === "PASS" ||
    n === "LAS" ||
    n === "LSPS" ||
    n.startsWith("PASS ") ||
    n.startsWith("LAS ") ||
    n.startsWith("LSPS ")
  );
}

/** Dossiers « filière » sous une université : PASS / LAS / LSPS uniquement (pas tout `subject`). */
export function isUniversityFiliereFolder(c: Dossier): boolean {
  if (c.dossier_type === "subject" || c.dossier_type === "option") {
    return nameLooksLikePassLasLsps(c.name);
  }
  return false;
}

function nameLooksLikeStructuralLoose(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n.startsWith("semestre") ||
    /^s\d+\b/.test(n) ||
    n.includes("bloc") ||
    n.includes("trimestre") ||
    n.includes("modules complémentaires") ||
    n.includes("module complément")
  );
}

/**
 * Nœuds souvent mal rattachés en base (frères de PASS/LAS sous l’université) : à regrouper sous la filière.
 * Les `option` génériques (ex. Mineure) restent au niveau université.
 */
export function isLooseStructuralUnderUniversity(c: Dossier): boolean {
  if (isUniversityFiliereFolder(c)) return false;
  if (c.dossier_type === "semester" || c.dossier_type === "period" || c.dossier_type === "module") return true;
  if (c.dossier_type === "option") return nameLooksLikeStructuralLoose(c.name);
  if (c.dossier_type === "generic") return nameLooksLikeStructuralLoose(c.name);
  return false;
}

/**
 * Sous une université : garde PASS/LAS en tête, injecte semestres & co. sous la bonne filière
 * (comme attendu dans Pédagogie quand les `parent_id` pointent encore vers l’université).
 */
export function partitionUniversityChildren(children: Dossier[]): {
  topLevel: Dossier[];
  injectionMap: Map<string, Dossier[]>;
} {
  const filieres = children.filter(isUniversityFiliereFolder);
  const candidates = children.filter(isLooseStructuralUnderUniversity);
  const rest = children.filter(c => !filieres.includes(c) && !candidates.includes(c));

  if (filieres.length === 0) {
    return { topLevel: children, injectionMap: new Map() };
  }

  const injectionMap = new Map<string, Dossier[]>();
  for (const f of filieres) injectionMap.set(f.id, []);

  const assigned = new Set<string>();
  for (const node of candidates) {
    let targets: Dossier[] = [];
    if (node.formation_offer) {
      const fo = filieres.filter(f => f.formation_offer && f.formation_offer === node.formation_offer);
      if (fo.length) targets = fo;
    }
    if (targets.length === 0) {
      const nl = node.name.toLowerCase();
      const byName = filieres.filter(f => f.name && nl.includes(f.name.toLowerCase()));
      if (byName.length) targets = byName;
    }
    if (targets.length === 0 && filieres.length === 1) targets = [filieres[0]];
    // Plusieurs filières (PASS + LAS) et libellés génériques « Semestre 1 » : même arbre en base → sous chaque filière
    if (targets.length === 0 && filieres.length > 1) targets = [...filieres];

    for (const target of targets) {
      injectionMap.get(target.id)!.push(node);
    }
    if (targets.length) assigned.add(node.id);
  }

  const orphanCandidates = candidates.filter(c => !assigned.has(c.id));
  for (const arr of injectionMap.values()) arr.sort((a, b) => a.order_index - b.order_index);

  const topLevel = [...filieres, ...orphanCandidates, ...rest].sort((a, b) => a.order_index - b.order_index);
  return { topLevel, injectionMap };
}

/** Nœud parent sous lequel on regroupe semestres → filières (évite les `generic` mal typés). */
function isUniversityLikeParent(d: Dossier): boolean {
  if (d.dossier_type === "university") return true;
  if (d.dossier_type === "generic") {
    const n = d.name.toLowerCase();
    return n.includes("universit");
  }
  return false;
}

/** Carte parent → enfants avec regroupement université → filière → semestres. */
export function buildQaPedagogieChildrenMap(dossiers: Dossier[]): Map<string | null, Dossier[]> {
  const m = new Map<string | null, Dossier[]>();
  for (const d of dossiers) {
    const p = d.parent_id;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(d);
  }
  for (const list of m.values()) list.sort((a, b) => a.order_index - b.order_index);

  for (const uni of dossiers) {
    if (!isUniversityLikeParent(uni)) continue;
    const raw = m.get(uni.id);
    if (!raw?.length) continue;

    const { topLevel, injectionMap } = partitionUniversityChildren(raw);
    m.set(uni.id, topLevel);

    for (const [fid, extra] of injectionMap) {
      const cur = m.get(fid) ?? [];
      const seen = new Set(cur.map(c => c.id));
      const merged = [...cur];
      for (const e of extra) {
        if (!seen.has(e.id)) {
          merged.push(e);
          seen.add(e.id);
        }
      }
      merged.sort((a, b) => a.order_index - b.order_index);
      m.set(fid, merged);
    }
  }

  return m;
}

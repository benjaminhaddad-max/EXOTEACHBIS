import type { Dossier } from "@/types/database";

/** Dossiers « filière » sous une université (PASS, LAS, etc.) — souvent `subject`, parfois `option`. */
export function isUniversityFiliereFolder(c: Dossier): boolean {
  if (c.dossier_type === "subject") return true;
  if (c.dossier_type === "option") {
    const n = c.name.trim().toUpperCase();
    return (
      n === "PASS" ||
      n === "LAS" ||
      n === "LSPS" ||
      n.startsWith("PASS ") ||
      n.startsWith("LAS ") ||
      n.startsWith("LSPS ")
    );
  }
  return false;
}

/**
 * Nœuds souvent mal rattachés en base (frères de PASS/LAS sous l’université) : à regrouper sous la filière.
 */
export function isLooseStructuralUnderUniversity(c: Dossier): boolean {
  if (isUniversityFiliereFolder(c)) return false;
  return ["semester", "period", "module", "option"].includes(c.dossier_type);
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
    let target: Dossier | undefined;
    if (node.formation_offer) {
      target = filieres.find(f => f.formation_offer && f.formation_offer === node.formation_offer);
    }
    if (!target) {
      const nl = node.name.toLowerCase();
      target = filieres.find(f => f.name && nl.includes(f.name.toLowerCase()));
    }
    if (!target && filieres.length === 1) target = filieres[0];

    if (target) {
      injectionMap.get(target.id)!.push(node);
      assigned.add(node.id);
    }
  }

  const orphanCandidates = candidates.filter(c => !assigned.has(c.id));
  for (const arr of injectionMap.values()) arr.sort((a, b) => a.order_index - b.order_index);

  const topLevel = [...filieres, ...orphanCandidates, ...rest].sort((a, b) => a.order_index - b.order_index);
  return { topLevel, injectionMap };
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
    if (uni.dossier_type !== "university") continue;
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

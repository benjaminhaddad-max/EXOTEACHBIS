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

/**
 * Dossiers « filière » sous une université : nom PASS / LAS / LSPS.
 * En base ils sont souvent en `generic` ou `module`, pas seulement `subject` / `option`.
 */
export function isUniversityFiliereFolder(c: Dossier): boolean {
  if (c.dossier_type === "semester" || c.dossier_type === "period") return false;
  return nameLooksLikePassLasLsps(c.name);
}

function isPassOnlyFiliereName(d: Dossier): boolean {
  if (d.dossier_type === "semester" || d.dossier_type === "period") return false;
  const n = d.name.trim().toUpperCase();
  return n === "PASS" || n.startsWith("PASS ");
}

function isLasOnlyFiliereName(d: Dossier): boolean {
  if (d.dossier_type === "semester" || d.dossier_type === "period") return false;
  const n = d.name.trim().toUpperCase();
  return n === "LAS" || n.startsWith("LAS ");
}

/**
 * Nœud « offre » en pratique : souvent `generic` en base alors que le nom est « PREPA PASS ».
 * Sans ça, aucun reparentage ni aplatissement ne s’exécute.
 */
function isOfferLikeDossier(d: Dossier): boolean {
  if (d.dossier_type === "offer") return true;
  const n = d.name.trim().toUpperCase();
  if (n.includes("PREPA PASS") || n.includes("PREPA LAS")) return true;
  if (/^PREPA\s+/i.test(d.name.trim())) return true;
  return false;
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Filière portée par le nom de l’offre (PREPA PASS / PREPA LAS) : on n’affiche plus PASS/LAS sous l’université.
 */
function inferOfferFormationTrack(offerName: string): "pass" | "las" | null {
  const n = foldAccents(offerName.trim())
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (n.includes("PREPA LAS")) return "las";
  if (n.includes("PREPA PASS")) return "pass";
  if (/\bLAS\b/.test(n) && !/\bPASS\b/.test(n)) return "las";
  if (/\bPASS\b/.test(n) && !/\bLAS\b/.test(n)) return "pass";
  return null;
}

/**
 * Remonte toute la chaîne des parents : un dossier `offer` sans nom utile ne doit pas bloquer
 * (ex. offre racine vide → enfant « PREPA PASS »). Sinon PASS/LAS ne sont jamais aplatis.
 */
function inferPassLasTrackFromAncestors(uni: Dossier, byId: Map<string, Dossier>): "pass" | "las" | null {
  let id: string | null = uni.parent_id;
  while (id) {
    const p = byId.get(id);
    if (!p) break;
    const t = inferOfferFormationTrack(p.name);
    if (t) return t;
    id = p.parent_id;
  }
  return null;
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

/** Frères des universités directement sous une offre (semestres, mineures…) — `parent_id` = offre. */
function isLooseStructuralOfferSibling(c: Dossier): boolean {
  if (isUniversityLikeParent(c)) return false;
  if (isUniversityFiliereFolder(c)) return false;
  if (isLooseStructuralUnderUniversity(c)) return true;
  const n = c.name.trim().toLowerCase();
  if (n.includes("mineure")) return true;
  return false;
}

/**
 * Sous une offre : retire semestres / blocs / mineure du même niveau que les universités et les rattache aux bons dossiers université.
 */
function partitionOfferChildren(raw: Dossier[]): {
  topLevel: Dossier[];
  perUniversity: Map<string, Dossier[]>;
} {
  const unis = raw.filter(isUniversityLikeParent);
  const loose = raw.filter(isLooseStructuralOfferSibling);
  const rest = raw.filter(x => !unis.includes(x) && !loose.includes(x));

  if (unis.length === 0 || loose.length === 0) {
    return { topLevel: raw, perUniversity: new Map() };
  }

  const perUniversity = new Map<string, Dossier[]>();
  for (const u of unis) perUniversity.set(u.id, []);

  for (const node of loose) {
    let targets: Dossier[] = [];
    if (node.formation_offer) {
      const fo = unis.filter(u => u.formation_offer && u.formation_offer === node.formation_offer);
      if (fo.length) targets = fo;
    }
    if (targets.length === 0 && unis.length === 1) targets = [unis[0]];
    if (targets.length === 0 && unis.length > 1) targets = [...unis];

    for (const t of targets) {
      perUniversity.get(t.id)!.push(node);
    }
  }

  for (const arr of perUniversity.values()) arr.sort((a, b) => a.order_index - b.order_index);

  const topLevel = [...unis, ...rest].sort((a, b) => a.order_index - b.order_index);
  return { topLevel, perUniversity };
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
    if (n.includes("universit") || n.includes("faculté") || n.includes("faculte")) return true;
    // Souvent typé generic sans le mot « université » (ex. Sorbonne Paris-Nord)
    if (/\bsorbonne\b/.test(n)) return true;
    if (/\bparis[\s-]nord\b/.test(n) || /\bparis[\s-]cit[eé]\b/.test(n)) return true;
  }
  return false;
}

function mergeUniqueById(existing: Dossier[], extra: Dossier[]): Dossier[] {
  const seen = new Set(existing.map(c => c.id));
  const merged = [...existing];
  for (const e of extra) {
    if (!seen.has(e.id)) {
      merged.push(e);
      seen.add(e.id);
    }
  }
  merged.sort((a, b) => a.order_index - b.order_index);
  return merged;
}

/**
 * Sous une université dont le parent est PREPA PASS / PREPA LAS : enlève le dossier redondant LAS/PASS
 * et remonte d’un cran le contenu de la filière concernée.
 */
function flattenFiliereForOfferTrack(
  children: Dossier[],
  track: "pass" | "las",
  childMap: Map<string | null, Dossier[]>
): Dossier[] {
  const out: Dossier[] = [];
  const seen = new Set<string>();

  for (const c of [...children].sort((a, b) => a.order_index - b.order_index)) {
    if (track === "pass" && isLasOnlyFiliereName(c)) continue;
    if (track === "las" && isPassOnlyFiliereName(c)) continue;

    if (track === "pass" && isPassOnlyFiliereName(c)) {
      for (const sub of childMap.get(c.id) ?? []) {
        if (!seen.has(sub.id)) {
          out.push(sub);
          seen.add(sub.id);
        }
      }
      continue;
    }
    if (track === "las" && isLasOnlyFiliereName(c)) {
      for (const sub of childMap.get(c.id) ?? []) {
        if (!seen.has(sub.id)) {
          out.push(sub);
          seen.add(sub.id);
        }
      }
      continue;
    }

    if (!seen.has(c.id)) {
      out.push(c);
      seen.add(c.id);
    }
  }

  return out.sort((a, b) => a.order_index - b.order_index);
}

/** Carte parent → enfants avec regroupement offre → université → (sans PASS/LAS redondants) → semestres. */
export function buildQaPedagogieChildrenMap(dossiers: Dossier[]): Map<string | null, Dossier[]> {
  const byId = new Map(dossiers.map(d => [d.id, d]));
  const m = new Map<string | null, Dossier[]>();
  for (const d of dossiers) {
    const p = d.parent_id;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(d);
  }
  for (const list of m.values()) list.sort((a, b) => a.order_index - b.order_index);

  // 1) Semestres / mineures au même niveau que les universités sous l’offre → sous chaque université concernée
  for (const offer of dossiers) {
    if (!isOfferLikeDossier(offer)) continue;
    const raw = m.get(offer.id);
    if (!raw?.length) continue;

    const { topLevel, perUniversity } = partitionOfferChildren(raw);
    m.set(offer.id, topLevel);

    for (const [uid, extra] of perUniversity) {
      const cur = m.get(uid) ?? [];
      m.set(uid, mergeUniqueById(cur, extra));
    }
  }

  // 2) Semestres frères de PASS/LAS sous l’université → sous les filières (pour offres neutres ou avant aplatissement)
  for (const uni of dossiers) {
    if (!isUniversityLikeParent(uni)) continue;
    const raw = m.get(uni.id);
    if (!raw?.length) continue;

    const { topLevel, injectionMap } = partitionUniversityChildren(raw);
    m.set(uni.id, topLevel);

    for (const [fid, extra] of injectionMap) {
      m.set(fid, mergeUniqueById(m.get(fid) ?? [], extra));
    }
  }

  // 3) PREPA PASS / PREPA LAS : plus de ligne PASS+LAS sous l’université (la filière est déjà dans le nom de l’offre)
  for (const uni of dossiers) {
    if (!isUniversityLikeParent(uni)) continue;
    const track = inferPassLasTrackFromAncestors(uni, byId);
    if (!track) continue;

    const ch = m.get(uni.id);
    if (!ch?.length) continue;
    m.set(uni.id, flattenFiliereForOfferTrack(ch, track, m));
  }

  return m;
}

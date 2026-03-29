"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ArrowLeft, Check, Loader2, Plus, Save,
  GraduationCap, Building2, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import type { Dossier, Filiere, Matiere } from "@/types/database";
import {
  getUniversityGradingScale,
  upsertUniversityGradingScale,
  getUniversityCoefficients,
  ensureUniversityMatiereCoverage,
  getUniversityFiliereCoefficients,
  upsertUniversityCoefficient,
  getShortAnswerConfig,
  upsertShortAnswerConfig,
  getRedactionConfig,
  upsertRedactionConfig,
  upsertMatiereCoefficient,
} from "@/app/(admin)/admin/examens/actions";

type Toast = { message: string; kind: "success" | "error" } | null;
type ScaleRow = { nb_errors: number; points: number };
type CoeffRow = { subject_dossier_id: string; name: string; semester: string; coefficient: number };
type NotationType = "qcm" | "short_answer" | "redaction";

export function ParametrageShell({
  dossiers,
  allDossiers,
  matieres,
  filieres,
  embedded,
}: {
  dossiers: Dossier[];
  allDossiers: Dossier[];
  matieres: Matiere[];
  filieres: Filiere[];
  embedded?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [notationType, setNotationType] = useState<NotationType>("qcm");

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const selectedUni = useMemo(() => dossiers.find(d => d.id === selectedId), [dossiers, selectedId]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-lg"
          style={{ backgroundColor: toast.kind === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: toast.kind === "success" ? "#22c55e" : "#ef4444", border: `1px solid ${toast.kind === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
          {toast.kind === "success" ? <Check size={12} /> : null}
          {toast.message}
        </div>
      )}

      {/* Sidebar */}
      <ParametrageSidebar dossiers={dossiers} selectedId={selectedId} onSelect={setSelectedId} />

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header — masqué en mode embedded (géré par l'onglet parent) */}
        {!embedded && (
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 shrink-0">
            <Link href="/admin/examens" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <ArrowLeft size={16} style={{ color: "rgba(255,255,255,0.5)" }} />
            </Link>
            <div>
              <h1 className="text-base font-semibold text-white">Paramétrage universités</h1>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                Barème QCM &amp; coefficients matières par défaut
              </p>
            </div>
          </div>
        )}

        {!selectedUni ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Building2 size={32} style={{ color: "rgba(255,255,255,0.15)" }} className="mx-auto" />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Sélectionne une formation ou université</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>dans le menu à gauche pour configurer son barème et ses coefficients</p>
            </div>
          </div>
        ) : (
          <>
            {/* Type de notation tabs */}
            <div className="flex items-center gap-1 px-6 pt-5 pb-0 shrink-0 border-b border-white/10">
              {([
                { key: "qcm", label: "QCM" },
                { key: "short_answer", label: "Réponse courte" },
                { key: "redaction", label: "Rédaction" },
              ] as { key: NotationType; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => setNotationType(key)}
                  className="relative px-4 py-2.5 text-xs font-semibold transition-colors rounded-t-lg"
                  style={{ color: notationType === key ? "#C9A84C" : "rgba(255,255,255,0.35)" }}>
                  {label}
                  {notationType === key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: "#C9A84C" }} />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-8 overflow-y-auto flex-1">
              {notationType === "qcm" && (
                <>
                  <GradingScaleSection
                    universityId={selectedUni.id}
                    universityName={selectedUni.name}
                    showToast={showToast}
                  />
                  <CoefficientsSection
                    universityId={selectedUni.id}
                    allDossiers={allDossiers}
                    matieres={matieres}
                    filieres={filieres}
                    showToast={showToast}
                  />
                </>
              )}
              {notationType === "short_answer" && (
                <ShortAnswerSection
                  universityId={selectedUni.id}
                  universityName={selectedUni.name}
                  showToast={showToast}
                />
              )}
              {notationType === "redaction" && (
                <RedactionSection
                  universityId={selectedUni.id}
                  universityName={selectedUni.name}
                  showToast={showToast}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function ParametrageSidebar({ dossiers, selectedId, onSelect }: {
  dossiers: Dossier[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const universities = useMemo(() => dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unisByOffer = useMemo(() => {
    const m = new Map<string, Dossier[]>();
    for (const u of universities) if (u.parent_id) { if (!m.has(u.parent_id)) m.set(u.parent_id, []); m.get(u.parent_id)!.push(u); }
    return m;
  }, [universities]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(offers.map(o => o.id)));
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col shrink-0 border-r border-white/10 overflow-y-auto h-full" style={{ width: 260, backgroundColor: "rgba(0,0,0,0.15)" }}>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Formations &amp; Universités
        </p>
      </div>

      <div className="px-3 pb-2 space-y-0.5 flex-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          const hasUnis = offerUnis.length > 0;
          const isOpen = expanded.has(offer.id);
          const isOfferSelected = selectedId === offer.id;

          return (
            <div key={offer.id}>
              <div className="flex items-center gap-0.5">
                {/* Offer row — clickable to select + toggle expand */}
                <button
                  onClick={() => { onSelect(offer.id); if (hasUnis) toggleExpand(offer.id); }}
                  className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-left"
                  style={{
                    backgroundColor: isOfferSelected ? "rgba(201,168,76,0.12)" : "transparent",
                    border: isOfferSelected ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent",
                  }}
                  onMouseOver={e => { if (!isOfferSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
                  onMouseOut={e => { if (!isOfferSelected) e.currentTarget.style.backgroundColor = isOfferSelected ? "rgba(201,168,76,0.12)" : "transparent"; }}>
                  <GraduationCap size={11} style={{ color: "#C9A84C" }} />
                  <span className="flex-1 text-[11px] font-bold truncate" style={{ color: "#C9A84C" }}>{offer.name}</span>
                  {hasUnis && (
                    <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.2)", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                  )}
                </button>
              </div>

              {hasUnis && isOpen && offerUnis.map(uni => {
                const isSelected = selectedId === uni.id;
                return (
                  <button key={uni.id} onClick={() => onSelect(uni.id)}
                    className="w-full flex items-center gap-1.5 ml-3 px-2 py-1.5 rounded-lg transition-all text-left"
                    style={{
                      backgroundColor: isSelected ? "rgba(167,139,250,0.12)" : "transparent",
                      border: isSelected ? "1px solid rgba(167,139,250,0.25)" : "1px solid transparent",
                    }}
                    onMouseOver={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
                    onMouseOut={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <Building2 size={9} style={{ color: isSelected ? "#c4b5fd" : "#A78BFA" }} />
                    <span className="text-[10px] font-semibold truncate" style={{ color: isSelected ? "#c4b5fd" : "#A78BFA" }}>{uni.name}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Grading Scale Section ───────────────────────────────────────────────────

// penalties[i] = points perdus pour la (i+1)ème erreur
const DEFAULT_PENALTIES: number[] = [0.5, 0.5];

function ordinal(n: number): string {
  if (n === 1) return "1ère";
  return `${n}ème`;
}

/** Convert flat DB rows to an array of per-error penalties.
 *  DB format: nb_errors=N, points=score_at_N_errors (positive, decreasing).
 *  penalty[i] = score[i-1] - score[i], score[-1] = 1.
 */
function dbRowsToPenalties(rows: ScaleRow[]): number[] {
  const sorted = [...rows].filter(r => r.nb_errors > 0).sort((a, b) => a.nb_errors - b.nb_errors);
  if (sorted.length === 0) return DEFAULT_PENALTIES;
  const penalties: number[] = [];
  let prev = 1;
  for (const r of sorted) {
    const score = r.points; // positive score at this error count
    penalties.push(+(prev - score).toFixed(4));
    prev = score;
  }
  return penalties;
}

/** Convert penalties array back to DB rows format. */
function penaltiesToDbRows(penalties: number[]): ScaleRow[] {
  const rows: ScaleRow[] = [];
  let score = 1;
  for (let i = 0; i < penalties.length; i++) {
    score = score - penalties[i];
    rows.push({ nb_errors: i + 1, points: +score.toFixed(4) });
  }
  return rows;
}

function GradingScaleSection({ universityId, universityName, showToast }: {
  universityId: string; universityName: string; showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [penalties, setPenalties] = useState<number[]>(DEFAULT_PENALTIES);
  const [fixedIfEmpty, setFixedIfEmpty] = useState(false);
  const [fixedScore, setFixedScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUniversityGradingScale(universityId).then(res => {
      if (cancelled) return;
      if (res.data && res.data.length > 0) {
        const rawRows: ScaleRow[] = res.data.map((r: any) => ({ nb_errors: r.nb_errors, points: Number(r.points) }));
        setPenalties(dbRowsToPenalties(rawRows));
      } else {
        setPenalties(DEFAULT_PENALTIES);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [universityId]);

  // Cumulative totals: total[i] = score after (i+1) errors
  const totals = useMemo(() => {
    const t: number[] = [];
    let score = 1;
    for (const p of penalties) {
      score = score - p;
      t.push(Math.max(0, +score.toFixed(4)));
    }
    return t;
  }, [penalties]);

  const updatePenalty = (idx: number, value: number) => {
    setPenalties(prev => prev.map((p, i) => i === idx ? value : p));
  };

  const addError = () => {
    setPenalties(prev => [...prev, 0.5]);
  };

  const removeError = () => {
    if (penalties.length > 1) setPenalties(prev => prev.slice(0, -1));
  };

  const handleSave = async () => {
    setSaving(true);
    const dbRows = penaltiesToDbRows(penalties);
    const res = await upsertUniversityGradingScale(universityId, dbRows);
    setSaving(false);
    if (res.error) showToast("Erreur : " + res.error, "error");
    else showToast("Barème enregistré", "success");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Notation QCM</h2>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            Pénalités par erreur — {universityName}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Chargement…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Condition box */}
          <div className="rounded-xl border border-white/10 px-5 py-4 text-xs leading-relaxed" style={{ backgroundColor: "rgba(0,0,0,0.15)", color: "rgba(255,255,255,0.55)" }}>
            Si une réponse <span className="font-bold" style={{ color: "#4ade80" }}>VRAIE</span> n&apos;est pas cochée
            <span className="mx-2 opacity-40">ou</span>
            si une réponse <span className="font-bold" style={{ color: "#f87171" }}>FAUSSE</span> est cochée
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden border border-white/10">
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)" }} className="grid grid-cols-3 px-5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Erreur</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Points perdus</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: "rgba(255,255,255,0.4)" }}>Total</span>
            </div>

            <div className="divide-y divide-white/5">
              {penalties.map((penalty, idx) => (
                <div key={idx} className="grid grid-cols-3 items-center px-5 py-3"
                  style={{ backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.06)" }}>
                  <span className="text-sm font-semibold text-white/80">
                    {ordinal(idx + 1)} erreur&nbsp;:
                  </span>
                  <div>
                    <input
                      type="number" min={0} step={0.25}
                      value={penalty}
                      onChange={e => updatePenalty(idx, parseFloat(e.target.value) || 0)}
                      className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50"
                    />
                  </div>
                  <span className="text-sm font-semibold text-right" style={{ color: totals[idx] > 0 ? "#C9A84C" : "rgba(255,255,255,0.3)" }}>
                    {totals[idx].toFixed(2)}<span className="text-xs font-normal opacity-50">/ 1</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Add / Remove buttons */}
            <div className="flex items-center gap-3 px-5 py-3 border-t border-white/5">
              <button onClick={addError}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/5"
                style={{ color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.12)" }}>
                <Plus size={11} /> Ajouter une erreur
              </button>
              <button onClick={removeError} disabled={penalties.length <= 1}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/5 disabled:opacity-30"
                style={{ color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.12)" }}>
                <span className="text-base leading-none" style={{ marginTop: -1 }}>—</span> Enlever une erreur
              </button>
            </div>
          </div>

          {/* Note fixe si rien coché */}
          <div className="flex items-center gap-3 px-1">
            <button
              onClick={() => setFixedIfEmpty(v => !v)}
              className="flex items-center gap-2 text-xs font-medium transition-colors"
              style={{ color: fixedIfEmpty ? "#C9A84C" : "rgba(255,255,255,0.4)" }}>
              <span className="flex items-center justify-center w-4 h-4 rounded border shrink-0 transition-colors"
                style={{ borderColor: fixedIfEmpty ? "#C9A84C" : "rgba(255,255,255,0.2)", backgroundColor: fixedIfEmpty ? "rgba(201,168,76,0.2)" : "transparent" }}>
                {fixedIfEmpty && <Check size={10} style={{ color: "#C9A84C" }} />}
              </span>
              Note fixe si rien n&apos;est coché
            </button>
            {fixedIfEmpty && (
              <input type="number" min={0} max={1} step={0.25}
                value={fixedScore}
                onChange={e => setFixedScore(parseFloat(e.target.value) || 0)}
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50"
              />
            )}
          </div>

          {/* Save button */}
          <div className="pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ backgroundColor: "#C9A84C", color: "#0e1e35", opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Mettre à jour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coefficients Section ────────────────────────────────────────────────────

function CoefficientsSection({ universityId, allDossiers, matieres, filieres, showToast }: {
  universityId: string;
  allDossiers: Dossier[];
  matieres: Matiere[];
  filieres: Filiere[];
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [matiereRows, setMatiereRows] = useState<Matiere[]>(matieres);
  const [defaultCoeffs, setDefaultCoeffs] = useState<Record<string, number>>({});
  const [filiereCoeffs, setFiliereCoeffs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const subjectsBySemester = useMemo(() => {
    const semesters = allDossiers.filter(
      (d) => d.parent_id === universityId && (d.dossier_type === "semester" || d.dossier_type === "module")
    );
    const semesterIds = new Set(semesters.map(s => s.id));
    const subjects = allDossiers.filter(d => d.parent_id && semesterIds.has(d.parent_id) && d.dossier_type === "subject");
    const matiereByDossierId = new Map(matiereRows.map((matiere) => [matiere.dossier_id, matiere]));

    const grouped: { semester: Dossier; subjects: Array<{ subject: Dossier; matiere: Matiere | null }> }[] = [];
    for (const sem of semesters.sort((a, b) => a.order_index - b.order_index)) {
      const semSubjects = subjects
        .filter(s => s.parent_id === sem.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((subject) => ({ subject, matiere: matiereByDossierId.get(subject.id) ?? null }));
      if (semSubjects.length > 0) {
        grouped.push({ semester: sem, subjects: semSubjects });
      }
    }
    return grouped;
  }, [universityId, allDossiers, matiereRows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    ensureUniversityMatiereCoverage(universityId).then(async (coverageRes) => {
      if (cancelled) return;
      if (coverageRes.error) {
        showToast("Erreur : " + coverageRes.error, "error");
        setLoading(false);
        return;
      }

      const nextMatieres = (coverageRes.data ?? []) as Matiere[];
      setMatiereRows(nextMatieres);

      const [defaultRes, filiereRes] = await Promise.all([
        getUniversityCoefficients(universityId),
        getUniversityFiliereCoefficients(nextMatieres.map((matiere) => matiere.id)),
      ]);

      if (cancelled) return;

      if (defaultRes.error) {
        showToast("Erreur : " + defaultRes.error, "error");
        setLoading(false);
        return;
      }

      if (filiereRes.error) {
        showToast("Erreur : " + filiereRes.error, "error");
        setLoading(false);
        return;
      }

      const nextDefaultCoeffs: Record<string, number> = {};
      for (const row of defaultRes.data ?? []) {
        nextDefaultCoeffs[row.subject_dossier_id] = Number(row.coefficient);
      }

      const nextFiliereCoeffs: Record<string, number> = {};
      for (const row of (filiereRes.data ?? []) as Array<{ matiere_id: string; filiere_id: string; coefficient: number }>) {
        nextFiliereCoeffs[`${row.matiere_id}:${row.filiere_id}`] = Number(row.coefficient);
      }

      setDefaultCoeffs(nextDefaultCoeffs);
      setFiliereCoeffs(nextFiliereCoeffs);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [universityId]);

  const handleDefaultBlur = useCallback(async (subjectId: string, value: number) => {
    setSavingKey(`default:${subjectId}`);
    const res = await upsertUniversityCoefficient(universityId, subjectId, value);
    setSavingKey(null);
    if (res.error) showToast("Erreur : " + res.error, "error");
  }, [universityId]);

  const handleFiliereBlur = useCallback(async (matiereId: string, filiereId: string, value: number) => {
    const key = `${matiereId}:${filiereId}`;
    setSavingKey(key);
    const res = await upsertMatiereCoefficient(matiereId, filiereId, value);
    setSavingKey(null);
    if (res.error) showToast("Erreur : " + res.error, "error");
  }, []);

  const allSubjects = subjectsBySemester.flatMap(g => g.subjects);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Coefficients matières et filières</h2>
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Une ligne par matière. Tu règles ici le coefficient général de l&apos;épreuve, puis le poids de cette matière
          pour chaque filière visée.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Chargement…</span>
        </div>
      ) : allSubjects.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune matière trouvée pour cette université.</p>
          <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            Vérifie la structure pédagogique (Semestres → Matières) dans la section Pédagogie.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {subjectsBySemester.map(({ semester, subjects }) => (
            <div key={semester.id} className="rounded-xl overflow-hidden border border-white/10">
              <div className="px-4 py-2" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {semester.name}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                      <th className="px-4 py-3 text-left font-semibold text-white/45 min-w-[220px]">Matière</th>
                      <th className="px-3 py-3 text-center font-semibold text-white/45 min-w-[110px]">Défaut examen</th>
                      {filieres.map((filiere) => (
                        <th key={filiere.id} className="px-3 py-3 text-center min-w-[105px]">
                          <div className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold"
                            style={{
                              borderColor: `${filiere.color}44`,
                              backgroundColor: `${filiere.color}14`,
                              color: filiere.color,
                            }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: filiere.color }} />
                            {filiere.code}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map(({ subject, matiere }) => {
                      const defaultValue = defaultCoeffs[subject.id] ?? 1;
                      const defaultSaving = savingKey === `default:${subject.id}`;

                      return (
                        <tr key={subject.id} className="border-b border-white/5 last:border-b-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white/85">{subject.name}</span>
                              {!matiere && (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                  liaison matière
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-center gap-2">
                              {defaultSaving && <Loader2 size={10} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />}
                              <input
                                type="number"
                                min={0}
                                max={20}
                                step={0.5}
                                value={defaultValue}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  setDefaultCoeffs((prev) => ({ ...prev, [subject.id]: value }));
                                }}
                                onBlur={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  handleDefaultBlur(subject.id, value);
                                }}
                                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50"
                              />
                            </div>
                          </td>
                          {filieres.map((filiere) => {
                            const key = matiere ? `${matiere.id}:${filiere.id}` : null;
                            const value = key ? (filiereCoeffs[key] ?? 1) : 1;
                            const isSaving = key ? savingKey === key : false;

                            return (
                              <td key={filiere.id} className="px-3 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  {isSaving && <Loader2 size={10} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />}
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    step={0.5}
                                    disabled={!matiere}
                                    value={value}
                                    onChange={(e) => {
                                      if (!key) return;
                                      const nextValue = parseFloat(e.target.value) || 0;
                                      setFiliereCoeffs((prev) => ({ ...prev, [key]: nextValue }));
                                    }}
                                    onBlur={(e) => {
                                      if (!matiere) return;
                                      const nextValue = parseFloat(e.target.value) || 0;
                                      handleFiliereBlur(matiere.id, filiere.id, nextValue);
                                    }}
                                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-30"
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FiliereCoefficientsSection({
  universityId,
  allDossiers,
  matieres,
  filieres,
  showToast,
}: {
  universityId: string;
  allDossiers: Dossier[];
  matieres: Matiere[];
  filieres: Filiere[];
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [selectedFiliereId, setSelectedFiliereId] = useState<string>(filieres[0]?.id ?? "");
  const [matiereRows, setMatiereRows] = useState<Matiere[]>(matieres);
  const [coeffs, setCoeffs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFiliereId && filieres[0]?.id) {
      setSelectedFiliereId(filieres[0].id);
    }
  }, [filieres, selectedFiliereId]);

  const subjectsBySemester = useMemo(() => {
    const semesters = allDossiers.filter(
      (d) =>
        d.parent_id === universityId &&
        (d.dossier_type === "semester" || d.dossier_type === "module")
    );
    const semesterIds = new Set(semesters.map((s) => s.id));
    const subjects = allDossiers.filter(
      (d) => d.parent_id && semesterIds.has(d.parent_id) && d.dossier_type === "subject"
    );
    const matiereByDossierId = new Map(matiereRows.map((matiere) => [matiere.dossier_id, matiere]));

    return semesters
      .sort((a, b) => a.order_index - b.order_index)
      .map((semester) => ({
        semester,
        subjects: subjects
          .filter((subject) => subject.parent_id === semester.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map((subject) => ({
            subject,
            matiere: matiereByDossierId.get(subject.id) ?? null,
          }))
          .filter(({ matiere }) => Boolean(matiere)),
      }))
      .filter((group) => group.subjects.length > 0);
  }, [universityId, allDossiers, matiereRows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    ensureUniversityMatiereCoverage(universityId).then(async (coverageRes) => {
      if (cancelled) return;

      if (coverageRes.error) {
        showToast("Erreur : " + coverageRes.error, "error");
        setLoading(false);
        return;
      }

      const nextMatieres = (coverageRes.data ?? []) as Matiere[];
      setMatiereRows(nextMatieres);

      const matiereIds = nextMatieres.map((matiere) => matiere.id);
      const coeffRes = await getUniversityFiliereCoefficients(matiereIds);
      if (cancelled) return;

      if (coeffRes.error) {
        showToast("Erreur : " + coeffRes.error, "error");
        setLoading(false);
        return;
      }

      const map: Record<string, number> = {};
      if (coeffRes.data) {
        for (const row of coeffRes.data as Array<{ matiere_id: string; filiere_id: string; coefficient: number }>) {
          map[`${row.matiere_id}:${row.filiere_id}`] = Number(row.coefficient);
        }
      }

      setCoeffs(map);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [universityId]);

  const activeFiliere = filieres.find((filiere) => filiere.id === selectedFiliereId) ?? null;

  const handleBlur = useCallback(
    async (matiereId: string, filiereId: string, value: number) => {
      setSavingKey(`${matiereId}:${filiereId}`);
      const res = await upsertMatiereCoefficient(matiereId, filiereId, value);
      setSavingKey(null);
      if (res.error) showToast("Erreur : " + res.error, "error");
    },
    [showToast]
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Classements par filière</h2>
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Poids des matières pour chaque filière visée. Ces coefficients servent au classement médecine, dentaire,
          pharmacie, maïeutique ou kiné.
        </p>
      </div>

      {filieres.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune filière configurée.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Chargement…</span>
        </div>
      ) : subjectsBySemester.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Aucune matière trouvée pour cette université.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {filieres.map((filiere) => {
              const active = filiere.id === selectedFiliereId;
              return (
                <button
                  key={filiere.id}
                  type="button"
                  onClick={() => setSelectedFiliereId(filiere.id)}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all"
                  style={{
                    borderColor: active ? `${filiere.color}55` : "rgba(255,255,255,0.12)",
                    backgroundColor: active ? `${filiere.color}20` : "rgba(255,255,255,0.03)",
                    color: active ? filiere.color : "rgba(255,255,255,0.65)",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: filiere.color }} />
                  {filiere.name}
                </button>
              );
            })}
          </div>

          <div className="mb-4 rounded-xl border border-white/10 px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
              Filière active
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {activeFiliere ? activeFiliere.name : "—"}
            </p>
            <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Les notes et rangs seront recalculés avec ces coefficients sur la filière sélectionnée.
            </p>
          </div>

          <div className="space-y-4">
            {subjectsBySemester.map(({ semester, subjects }) => (
              <div key={semester.id} className="rounded-xl overflow-hidden border border-white/10">
                <div className="px-4 py-2" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {semester.name}
                  </span>
                </div>
                <div className="divide-y divide-white/5">
                  {subjects.map(({ subject, matiere }) => {
                    if (!matiere || !selectedFiliereId) return null;

                    const key = `${matiere.id}:${selectedFiliereId}`;
                    const value = coeffs[key] ?? 1;
                    const isSaving = savingKey === key;

                    return (
                      <div key={subject.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div>
                          <p className="text-xs font-medium text-white/80">{subject.name}</p>
                          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                            {activeFiliere?.code ?? "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSaving && <Loader2 size={10} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />}
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.5}
                            value={value}
                            onChange={(e) => {
                              const nextValue = parseFloat(e.target.value) || 0;
                              setCoeffs((prev) => ({ ...prev, [key]: nextValue }));
                            }}
                            onBlur={(e) => {
                              const nextValue = parseFloat(e.target.value) || 0;
                              handleBlur(matiere.id, selectedFiliereId, nextValue);
                            }}
                            className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Short Answer Section ─────────────────────────────────────────────────────

function ShortAnswerSection({ universityId, universityName, showToast }: {
  universityId: string; universityName: string; showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [pointsCorrect, setPointsCorrect] = useState(1);
  const [pointsIncorrect, setPointsIncorrect] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getShortAnswerConfig(universityId).then(res => {
      if (cancelled) return;
      if (res.data) {
        setPointsCorrect(Number(res.data.points_correct));
        setPointsIncorrect(Number(res.data.points_incorrect));
        setCaseSensitive(Boolean(res.data.case_sensitive));
      } else {
        setPointsCorrect(1); setPointsIncorrect(0); setCaseSensitive(false);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [universityId]);

  const handleSave = async () => {
    setSaving(true);
    const res = await upsertShortAnswerConfig(universityId, { points_correct: pointsCorrect, points_incorrect: pointsIncorrect, case_sensitive: caseSensitive });
    setSaving(false);
    if (res.error) showToast("Erreur : " + res.error, "error");
    else showToast("Config enregistrée", "success");
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-white">Réponse courte</h2>
        <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
          Questions à réponse textuelle courte (mot, nombre, formule) — {universityName}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 px-5 py-4 mb-5 text-xs leading-relaxed" style={{ backgroundColor: "rgba(0,0,0,0.15)", color: "rgba(255,255,255,0.55)" }}>
        La réponse de l&apos;étudiant est comparée automatiquement à la réponse correcte définie dans l&apos;éditeur de question.
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)" }} className="px-5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Notation</span>
            </div>
            <div className="divide-y divide-white/5">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-semibold text-white/80">Réponse correcte</span>
                <div className="flex items-center gap-2">
                  <input type="number" step={0.25} min={0} max={1} value={pointsCorrect}
                    onChange={e => setPointsCorrect(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50" />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>pt</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-semibold text-white/80">Réponse incorrecte</span>
                <div className="flex items-center gap-2">
                  <input type="number" step={0.25} value={pointsIncorrect}
                    onChange={e => setPointsIncorrect(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50" />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>pt</span>
                </div>
              </div>
            </div>
          </div>

          <button onClick={() => setCaseSensitive(v => !v)}
            className="flex items-center gap-2 text-xs font-medium transition-colors"
            style={{ color: caseSensitive ? "#C9A84C" : "rgba(255,255,255,0.4)" }}>
            <span className="flex items-center justify-center w-4 h-4 rounded border shrink-0"
              style={{ borderColor: caseSensitive ? "#C9A84C" : "rgba(255,255,255,0.2)", backgroundColor: caseSensitive ? "rgba(201,168,76,0.2)" : "transparent" }}>
              {caseSensitive && <Check size={10} style={{ color: "#C9A84C" }} />}
            </span>
            Sensible à la casse (majuscules/minuscules comptent)
          </button>

          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: "#C9A84C", color: "#0e1e35", opacity: saving ? 0.6 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Mettre à jour
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Redaction Section ────────────────────────────────────────────────────────

function RedactionSection({ universityId, universityName, showToast }: {
  universityId: string; universityName: string; showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [maxPoints, setMaxPoints] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRedactionConfig(universityId).then(res => {
      if (cancelled) return;
      if (res.data) setMaxPoints(Number(res.data.max_points));
      else setMaxPoints(20);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [universityId]);

  const handleSave = async () => {
    setSaving(true);
    const res = await upsertRedactionConfig(universityId, { max_points: maxPoints });
    setSaving(false);
    if (res.error) showToast("Erreur : " + res.error, "error");
    else showToast("Config enregistrée", "success");
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-white">Rédaction</h2>
        <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
          Questions à réponse longue corrigées manuellement — {universityName}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 px-5 py-4 mb-5 space-y-2" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
        <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Comment ça marche</p>
        <ul className="text-xs space-y-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
          <li>• L&apos;étudiant rédige sa réponse dans une zone de texte libre</li>
          <li>• Le professeur reçoit les copies à corriger dans l&apos;interface de correction</li>
          <li>• Le prof attribue une note et peut laisser un commentaire</li>
          <li>• La note est visible par l&apos;étudiant après correction</li>
        </ul>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)" }} className="px-5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Barème</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-semibold text-white/80">Note maximale par défaut</span>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={100} step={1} value={maxPoints}
                  onChange={e => setMaxPoints(parseInt(e.target.value) || 20)}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50" />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>pts</span>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: "#C9A84C", color: "#0e1e35", opacity: saving ? 0.6 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Mettre à jour
          </button>
        </div>
      )}
    </div>
  );
}

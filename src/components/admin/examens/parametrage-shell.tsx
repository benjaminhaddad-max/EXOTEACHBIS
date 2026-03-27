"use client";

import { useState, useTransition, useMemo, useEffect, useCallback } from "react";
import {
  ArrowLeft, Check, Loader2, Plus, Trash2, Save,
  GraduationCap, Building2, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import type { Dossier } from "@/types/database";
import {
  getUniversityGradingScale,
  upsertUniversityGradingScale,
  getUniversityCoefficients,
  upsertUniversityCoefficient,
} from "@/app/(admin)/admin/examens/actions";

type Toast = { message: string; kind: "success" | "error" } | null;
type ScaleRow = { nb_errors: number; points: number };
type CoeffRow = { subject_dossier_id: string; name: string; semester: string; coefficient: number };

export function ParametrageShell({ dossiers, allDossiers }: { dossiers: Dossier[]; allDossiers: Dossier[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

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
        {/* Header */}
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

        {!selectedUni ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Building2 size={32} style={{ color: "rgba(255,255,255,0.15)" }} className="mx-auto" />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Sélectionne une université</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>dans le menu à gauche pour configurer son barème et ses coefficients</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-8">
            <GradingScaleSection
              universityId={selectedUni.id}
              universityName={selectedUni.name}
              showToast={showToast}
            />
            <CoefficientsSection
              universityId={selectedUni.id}
              allDossiers={allDossiers}
              showToast={showToast}
            />
          </div>
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
          Universités
        </p>
      </div>

      <div className="px-3 pb-2 space-y-0.5 flex-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          if (offerUnis.length === 0) return null;
          const isOpen = expanded.has(offer.id);

          return (
            <div key={offer.id}>
              <button onClick={() => toggleExpand(offer.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-left"
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                <GraduationCap size={11} style={{ color: "#C9A84C" }} />
                <span className="flex-1 text-[11px] font-bold truncate" style={{ color: "#C9A84C" }}>{offer.name}</span>
                <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.2)", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
              </button>

              {isOpen && offerUnis.map(uni => {
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

const DEFAULT_SCALES: ScaleRow[] = [
  { nb_errors: 0, points: 1 },
  { nb_errors: 1, points: -0.25 },
  { nb_errors: 2, points: -0.5 },
  { nb_errors: 3, points: -1 },
];

function GradingScaleSection({ universityId, universityName, showToast }: {
  universityId: string; universityName: string; showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [scales, setScales] = useState<ScaleRow[]>(DEFAULT_SCALES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load scales when university changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUniversityGradingScale(universityId).then(res => {
      if (cancelled) return;
      if (res.data && res.data.length > 0) {
        setScales(res.data.map((r: any) => ({ nb_errors: r.nb_errors, points: Number(r.points) })));
      } else {
        setScales(DEFAULT_SCALES);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [universityId]);

  const updateRow = (idx: number, field: "nb_errors" | "points", value: number) => {
    setScales(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    const maxErrors = scales.length > 0 ? Math.max(...scales.map(s => s.nb_errors)) + 1 : 0;
    setScales(prev => [...prev, { nb_errors: maxErrors, points: 0 }]);
  };

  const removeRow = (idx: number) => {
    setScales(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await upsertUniversityGradingScale(universityId, scales);
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
            Score par question selon le nb d&apos;erreurs. Valeurs négatives = pénalité. — {universityName}
          </p>
        </div>
        <button onClick={handleSave} disabled={saving || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ backgroundColor: "#C9A84C", color: "#0e1e35", opacity: saving || loading ? 0.5 : 1 }}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Enregistrer
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Chargement…</span>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                <th className="text-[10px] font-semibold uppercase tracking-wider text-left px-4 py-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Nb erreurs
                </th>
                <th className="text-[10px] font-semibold uppercase tracking-wider text-left px-4 py-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Score (négatif = pénalité)
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {scales.sort((a, b) => a.nb_errors - b.nb_errors).map((row, idx) => (
                <tr key={idx} className="border-t border-white/5" style={{ backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.08)" }}>
                  <td className="px-4 py-2">
                    <input type="number" min={0} step={1}
                      value={row.nb_errors}
                      onChange={e => updateRow(idx, "nb_errors", parseInt(e.target.value) || 0)}
                      className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" step={0.05}
                      value={row.points}
                      onChange={e => updateRow(idx, "points", parseFloat(e.target.value) ?? 0)}
                      className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#C9A84C]/50"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => removeRow(idx)}
                      className="p-1 rounded hover:bg-red-500/10 transition-colors"
                      style={{ color: "rgba(239,68,68,0.5)" }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-2 border-t border-white/5">
            <button onClick={addRow}
              className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}>
              <Plus size={10} /> Ajouter une ligne
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coefficients Section ────────────────────────────────────────────────────

function CoefficientsSection({ universityId, allDossiers, showToast }: {
  universityId: string; allDossiers: Dossier[]; showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [coeffs, setCoeffs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Compute subjects grouped by semester
  const subjectsBySemester = useMemo(() => {
    const semesters = allDossiers.filter(d => d.parent_id === universityId && (d.dossier_type === "semester" || d.dossier_type === "module"));
    const semesterIds = new Set(semesters.map(s => s.id));
    const subjects = allDossiers.filter(d => d.parent_id && semesterIds.has(d.parent_id) && d.dossier_type === "subject");

    const grouped: { semester: Dossier; subjects: Dossier[] }[] = [];
    for (const sem of semesters.sort((a, b) => a.order_index - b.order_index)) {
      const semSubjects = subjects.filter(s => s.parent_id === sem.id).sort((a, b) => a.order_index - b.order_index);
      if (semSubjects.length > 0) {
        grouped.push({ semester: sem, subjects: semSubjects });
      }
    }
    return grouped;
  }, [universityId, allDossiers]);

  // Load coefficients when university changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUniversityCoefficients(universityId).then(res => {
      if (cancelled) return;
      const map: Record<string, number> = {};
      if (res.data) {
        for (const r of res.data) {
          map[r.subject_dossier_id] = Number(r.coefficient);
        }
      }
      setCoeffs(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [universityId]);

  const handleBlur = useCallback(async (subjectId: string, value: number) => {
    setSavingId(subjectId);
    const res = await upsertUniversityCoefficient(universityId, subjectId, value);
    setSavingId(null);
    if (res.error) showToast("Erreur : " + res.error, "error");
  }, [universityId, showToast]);

  const allSubjects = subjectsBySemester.flatMap(g => g.subjects);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Coefficients matières</h2>
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Coefficients par défaut appliqués aux épreuves d&apos;examen — sauvegarde automatique
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
              <div className="divide-y divide-white/5">
                {subjects.map(subject => {
                  const value = coeffs[subject.id] ?? 1;
                  const isSaving = savingId === subject.id;
                  return (
                    <div key={subject.id} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-medium text-white/80">{subject.name}</span>
                      <div className="flex items-center gap-2">
                        {isSaving && <Loader2 size={10} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />}
                        <input
                          type="number" min={0} max={20} step={0.5}
                          value={value}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            setCoeffs(prev => ({ ...prev, [subject.id]: v }));
                          }}
                          onBlur={e => {
                            const v = parseFloat(e.target.value) || 0;
                            handleBlur(subject.id, v);
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
      )}
    </div>
  );
}

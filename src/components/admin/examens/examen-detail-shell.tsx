"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import {
  ArrowLeft, Plus, Trash2, X, Check, AlertCircle, Loader2,
  Calendar, Clock, Layers, ChevronDown, Download, FileText,
  Upload, ListMinus, Trophy, Users, BarChart3, Filter, Eye, EyeOff,
} from "lucide-react";
import Link from "next/link";
import type { Serie, Filiere, SerieType, Dossier, Groupe, Matiere } from "@/types/database";
import {
  addSerieToExamen, removeSerieFromExamen, updateExamen,
  updateSerieCoefficient, updateSerieSchedule, toggleResultsVisibility, updateSerieGroupes, ensureSubjectMatiere,
  getUniversityCoefficients, updateSerieFileUrl,
} from "@/app/(admin)/admin/examens/actions";
import { uploadPdf } from "@/lib/upload-pdf";
import { createSerie } from "@/app/(admin)/admin/exercices/actions";
import { createClient } from "@/lib/supabase/client";
import { FullSerieEditor, type SerieSummary } from "@/components/admin/pedagogie/dossier-exercices-view";
import { buildFiliereCoefficientMap, resolveSerieCoefficient, type FiliereMatiereCoefficient } from "@/lib/examens/filiere-coefficients";
import { SemesterIcon, SubjectIcon } from "@/components/admin/pedagogie/dossier-icons";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type ExamenSerieWithCoeff = {
  series_id: string;
  order_index: number;
  coefficient: number;
  debut_at?: string | null;
  fin_at?: string | null;
  groupe_ids?: string[] | null;
  sujet_url?: string | null;
  correction_url?: string | null;
  series?: Serie;
};

type ExamenData = {
  id: string;
  name: string;
  description: string | null;
  debut_at: string;
  fin_at: string;
  visible: boolean;
  results_visible: boolean;
  notation_sur: number;
  created_at: string;
  examen_series: ExamenSerieWithCoeff[];
  series?: Serie[];
  groupe_ids?: string[];
};

type AttemptType = {
  id: string; user_id: string; series_id: string; score: number | null;
  nb_correct: number; nb_total: number; ended_at: string;
  user?: { id: string; first_name: string | null; last_name: string | null; email: string; filiere_id: string | null; groupe_id: string | null; filiere?: { id: string; name: string; code: string; color: string } | null };
};

type Toast = { message: string; kind: "success" | "error" } | null;

export function ExamenDetailShell({
  examen: initialExamen,
  attempts: initialAttempts,
  filieres,
  allDossiers,
  groupes,
  matieres,
  matiereCoefficients,
}: {
  examen: ExamenData;
  attempts: AttemptType[];
  filieres: any[];
  allDossiers: Dossier[];
  groupes: Groupe[];
  matieres: Matiere[];
  matiereCoefficients: FiliereMatiereCoefficient[];
}) {
  const [epreuves, setEpreuves] = useState<ExamenSerieWithCoeff[]>(initialExamen.examen_series);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState<string | null>(null);
  const [resultsVisible, setResultsVisible] = useState(initialExamen.results_visible);
  const [editingSerie, setEditingSerie] = useState<SerieSummary | null>(null);
  const [importingSerieId, setImportingSerieId] = useState<string | null>(null);
  const [importedSerieIds, setImportedSerieIds] = useState<Set<string>>(new Set());

  // Editable header fields
  const [examenName, setExamenName] = useState(initialExamen.name);
  const [editingName, setEditingName] = useState(false);
  const [debutAt, setDebutAt] = useState(initialExamen.debut_at);
  const [finAt, setFinAt] = useState(initialExamen.fin_at);
  const [examenVisible, setExamenVisible] = useState(initialExamen.visible);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Helper: import QCM — server extracts text, client renders images from PDF
  const triggerPdfImport = async (serieId: string, sujetUrl: string, correctionUrl: string, coursId: string | null) => {
    setImportingSerieId(serieId);
    try {
      // Step 1: Server extracts questions via Claude
      const res = await fetch("/api/import-from-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serieId, sujetUrl, correctionUrl, coursId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.error ?? "Erreur import PDF", "error");
        return;
      }

      showToast(json.message, "success");
      setImportedSerieIds(prev => new Set(prev).add(serieId));

      // Step 2: Client renders images from the sujet PDF
      const questions: { id: string; page: number; hasImage: boolean; yStart: number; yEnd: number }[] = json.createdQuestions ?? [];
      const withImages = questions.filter(q => q.hasImage && q.yStart > 0 && q.yEnd > q.yStart);

      if (withImages.length === 0) return;

      showToast(`Extraction de ${withImages.length} images…`, "success");

      // Load the sujet PDF through our proxy (avoids CORS)
      const pdfData = await fetch(`/api/proxy-pdf?url=${encodeURIComponent(sujetUrl)}`).then(r => {
        if (!r.ok) throw new Error(`Proxy PDF failed: ${r.status}`);
        return r.arrayBuffer();
      });
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;

      const supabase = createClient();
      const scale = 3;
      let uploaded = 0;

      // Cache rendered pages
      const pageCache: Record<number, HTMLCanvasElement> = {};

      for (const q of withImages) {
        try {
          // Render the page if not cached
          if (!pageCache[q.page]) {
            const page = await pdfDoc.getPage(q.page);
            const vp = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, vp.width, vp.height);
            await (page.render({ canvasContext: ctx, viewport: vp } as any).promise);
            pageCache[q.page] = canvas;
          }

          const fullCanvas = pageCache[q.page];
          // Crop to the image region
          const top = Math.round(q.yStart * scale);
          const bottom = Math.round(q.yEnd * scale);
          const cropH = Math.min(bottom - top, fullCanvas.height - top);
          if (cropH < 20) continue;

          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = fullCanvas.width;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext("2d")!;
          cropCtx.drawImage(fullCanvas, 0, top, fullCanvas.width, cropH, 0, 0, fullCanvas.width, cropH);

          // Convert to blob and upload
          const blob = await new Promise<Blob | null>(r => cropCanvas.toBlob(r, "image/png"));
          if (!blob) continue;

          const fd = new FormData();
          fd.append("file", new File([blob], `q_${q.id}.png`, { type: "image/png" }));
          fd.append("path", `questions/${q.id}/pdf_image.png`);
          const uploadRes = await fetch("/api/upload-image", { method: "POST", body: fd });
          const uploadJson = await uploadRes.json();

          if (uploadJson.url) {
            await supabase.from("questions").update({ image_url: uploadJson.url }).eq("id", q.id);
            uploaded++;
          }
        } catch (e) {
          console.error(`[image Q${q.id}]`, e);
        }
      }

      if (uploaded > 0) showToast(`${uploaded} images extraites du PDF`, "success");
      else showToast("Aucune image n'a pu être extraite", "error");

    } catch (err: any) {
      showToast(err?.message ?? "Erreur import", "error");
      console.error("[triggerPdfImport]", err);
    } finally {
      setImportingSerieId(null);
    }
  };

  const SENTINEL = "9999-01-01";
  const isDateSet = (iso: string) => !iso.startsWith(SENTINEL);
  const toDatetimeLocal = (iso: string) => {
    if (!isDateSet(iso)) return "";
    try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
  };

  const saveHeader = (updates: { name?: string; debut_at?: string; fin_at?: string; visible?: boolean }) => {
    startTransition(async () => {
      const res = await updateExamen(initialExamen.id, {
        name: updates.name ?? examenName,
        debut_at: updates.debut_at ?? debutAt,
        fin_at: updates.fin_at ?? finAt,
        visible: updates.visible ?? examenVisible,
      });
      if ("error" in res) showToast(res.error!, "error");
    });
  };

  // Results state
  const [resultTab, setResultTab] = useState<"global" | "serie">("global");
  const [selectedSerie, setSelectedSerie] = useState<string | null>(null);
  const [filterFiliere, setFilterFiliere] = useState("all");

  const notationSur = initialExamen.notation_sur || 20;
  const rankingFiliereId = filterFiliere === "all" ? null : filterFiliere;
  const coefficientMap = useMemo(() => buildFiliereCoefficientMap(matiereCoefficients), [matiereCoefficients]);
  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind }); setTimeout(() => setToast(null), 3500);
  };

  // --- DOSSIER TREE ---
  const targetUniIds = useMemo(() => {
    const ids = new Set<string>();
    for (const gid of (initialExamen.groupe_ids ?? [])) {
      const g = groupes.find(gr => gr.id === gid);
      if (g?.formation_dossier_id) ids.add(g.formation_dossier_id);
    }
    return ids;
  }, [initialExamen.groupe_ids, groupes]);

  const tree = useMemo(() => {
    const semesters = allDossiers
      .filter(d => d.parent_id && targetUniIds.has(d.parent_id) && (d.dossier_type === "semester" || d.dossier_type === "module" || d.dossier_type === "period"))
      .sort((a, b) => a.order_index - b.order_index);
    const semesterMap = new Map<string, Dossier[]>();
    for (const sem of semesters) {
      const subjects = allDossiers
        .filter(d => d.parent_id === sem.id && (d.dossier_type === "subject" || d.dossier_type === "option"))
        .sort((a, b) => a.order_index - b.order_index);
      if (subjects.length > 0) semesterMap.set(sem.id, subjects);
    }
    return { semesters, semesterMap };
  }, [allDossiers, targetUniIds]);

  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(() => new Set(tree.semesters.map(s => s.id)));
  const toggleSemester = (id: string) => setExpandedSemesters(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addedMatiereIds = new Set(epreuves.map(es => es.series?.matiere_id).filter(Boolean));
  const addedSerieNames = new Set(epreuves.map(es => es.series?.name).filter(Boolean));

  // Load university coefficients for auto-fill
  const [uniCoeffMap, setUniCoeffMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const uniIds = [...targetUniIds];
    if (uniIds.length === 0) return;
    // Load coefficients for the first target university
    getUniversityCoefficients(uniIds[0]).then(res => {
      if (res.data) {
        const m = new Map<string, number>();
        for (const row of res.data as any[]) {
          if (row.subject_dossier_id && row.coefficient != null) {
            m.set(row.subject_dossier_id, row.coefficient);
          }
        }
        setUniCoeffMap(m);
      }
    });
  }, [targetUniIds]);

  // --- HANDLERS ---
  const handleAddSubject = async (subject: Dossier) => {
    setCreating(subject.id);
    try {
      const serieName = `${initialExamen.name} — ${subject.name}`;
      let matiere = matieres.find(m => m.dossier_id === subject.id);
      if (!matiere) {
        const matiereRes = await ensureSubjectMatiere(subject.id);
        if ("error" in matiereRes) { showToast(matiereRes.error!, "error"); return; }
        matiere = (matiereRes as any).data ?? null;
      }
      // Use university coefficient if configured, otherwise default to 1
      const coeff = uniCoeffMap.get(subject.id) ?? 1;
      const res = await createSerie({ name: serieName, type: "concours_blanc" as SerieType, timed: false, score_definitif: false, visible: true, matiere_id: matiere?.id ?? null });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      const addRes = await addSerieToExamen(initialExamen.id, res.id!, epreuves.length, coeff);
      if ("error" in addRes) { showToast(addRes.error!, "error"); return; }
      const newSerie: Serie = { id: res.id!, name: serieName, type: "concours_blanc", description: null, cours_id: null, matiere_id: matiere?.id ?? null, timed: false, duration_minutes: null, score_definitif: false, visible: true, annee: null, linked_serie_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setEpreuves(prev => [...prev, { series_id: res.id!, order_index: prev.length, coefficient: coeff, series: newSerie }]);
      showToast(`${subject.name} ajoutée`, "success");
    } finally { setCreating(null); }
  };

  const handleRemove = (serieId: string) => {
    startTransition(async () => {
      const res = await removeSerieFromExamen(initialExamen.id, serieId);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setEpreuves(prev => prev.filter(s => s.series_id !== serieId));
      showToast("Épreuve retirée", "success");
    });
  };

  const handleCoeffChange = (serieId: string, coeff: number) => {
    startTransition(async () => {
      const res = await updateSerieCoefficient(initialExamen.id, serieId, coeff);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setEpreuves(prev => prev.map(s => s.series_id === serieId ? { ...s, coefficient: coeff } : s));
    });
  };

  const handleScheduleChange = (serieId: string, debut_at: string | null, fin_at: string | null) => {
    startTransition(async () => {
      const res = await updateSerieSchedule(initialExamen.id, serieId, debut_at, fin_at);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setEpreuves(prev => prev.map(s => s.series_id === serieId ? { ...s, debut_at, fin_at } : s));
    });
  };

  const handleGroupesChange = (serieId: string, groupe_ids: string[] | null) => {
    startTransition(async () => {
      const res = await updateSerieGroupes(initialExamen.id, serieId, groupe_ids);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setEpreuves(prev => prev.map(s => s.series_id === serieId ? { ...s, groupe_ids } : s));
    });
  };

  const handleToggleResults = () => {
    startTransition(async () => {
      const newVal = !resultsVisible;
      const res = await toggleResultsVisibility(initialExamen.id, newVal);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setResultsVisible(newVal);
      showToast(newVal ? "Résultats visibles" : "Résultats masqués", "success");
    });
  };

  const handleImportWord = async (subject: Dossier, file: File) => {
    setCreating(subject.id);
    try {
      const serieName = `${initialExamen.name} — ${subject.name}`;
      let matiere = matieres.find(m => m.dossier_id === subject.id);
      if (!matiere) {
        const matiereRes = await ensureSubjectMatiere(subject.id);
        if ("error" in matiereRes) { showToast(matiereRes.error!, "error"); return; }
        matiere = (matiereRes as any).data ?? null;
      }
      const res = await createSerie({ name: serieName, type: "concours_blanc" as SerieType, timed: false, score_definitif: false, visible: true, matiere_id: matiere?.id ?? null });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      const addRes = await addSerieToExamen(initialExamen.id, res.id!, epreuves.length, 1);
      if ("error" in addRes) { showToast(addRes.error!, "error"); return; }
      const formData = new FormData();
      formData.append("serieId", res.id!);
      formData.append("file", file);
      const importRes = await fetch("/api/import-serie", { method: "POST", body: formData });
      const importData = await importRes.json();
      if (!importRes.ok || importData.error) { showToast(importData.error || "Erreur d'import", "error"); return; }
      const newSerie: Serie = { id: res.id!, name: serieName, type: "concours_blanc", description: null, cours_id: null, matiere_id: matiere?.id ?? null, timed: false, duration_minutes: null, score_definitif: false, visible: true, annee: null, linked_serie_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setEpreuves(prev => [...prev, { series_id: res.id!, order_index: prev.length, coefficient: 1, series: newSerie }]);
      showToast(`${subject.name} importée`, "success");
    } finally { setCreating(null); }
  };

  const exportSerie = (serieId: string, corrections: boolean) => {
    window.open(`/api/export-serie?serieId=${serieId}&corrections=${corrections ? "1" : "0"}`, "_blank");
  };

  // --- RESULTS CALCULATIONS ---
  const students = useMemo(() => {
    const byUser = new Map<string, any>();
    for (const a of attempts) {
      if (!a.user || a.score == null) continue;
      if (!byUser.has(a.user.id)) {
        byUser.set(a.user.id, { userId: a.user.id, name: [a.user.first_name, a.user.last_name].filter(Boolean).join(" ") || a.user.email, email: a.user.email, filiere: a.user.filiere ?? null, groupeId: a.user.groupe_id ?? null, serieScores: {}, weightedTotal: 0, totalCoeff: 0, moyenne20: 0 });
      }
      const row = byUser.get(a.user.id)!;
      const existing = row.serieScores[a.series_id];
      if (!existing || (a.score ?? 0) > existing.score) {
        row.serieScores[a.series_id] = { score: a.score ?? 0, nb_correct: a.nb_correct, nb_total: a.nb_total, ended_at: a.ended_at };
      }
    }
    for (const row of byUser.values()) {
      let ws = 0, tc = 0;
      for (const es of epreuves) {
        // Skip this épreuve if it doesn't target the student's classe
        if (es.groupe_ids !== null && es.groupe_ids !== undefined && es.groupe_ids.length > 0 && row.groupeId && !es.groupe_ids.includes(row.groupeId)) continue;
        const s = row.serieScores[es.series_id];
        if (s) {
          const s20 = s.nb_total > 0 ? (s.nb_correct / s.nb_total) * notationSur : 0;
          const appliedCoeff = resolveSerieCoefficient({
            defaultCoefficient: es.coefficient,
            matiereId: es.series?.matiere_id ?? null,
            filiereId: rankingFiliereId,
            coefficientMap,
          });
          ws += s20 * appliedCoeff;
          tc += appliedCoeff;
        }
      }
      row.weightedTotal = ws; row.totalCoeff = tc; row.moyenne20 = tc > 0 ? ws / tc : 0;
    }
    return Array.from(byUser.values()).sort((a: any, b: any) => b.moyenne20 - a.moyenne20);
  }, [attempts, coefficientMap, epreuves, notationSur, rankingFiliereId]);

  const filteredStudents = filterFiliere === "all" ? students : students.filter((s: any) => s.filiere?.id === filterFiliere);
  const classMoyenne = filteredStudents.length > 0 ? filteredStudents.reduce((acc: number, s: any) => acc + s.moyenne20, 0) / filteredStudents.length : 0;

  const serieStudents = useMemo(() => {
    if (!selectedSerie) return [];
    return filteredStudents.filter((s: any) => s.serieScores[selectedSerie]).map((s: any) => {
      const sc = s.serieScores[selectedSerie];
      return { ...s, serieScore20: sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * notationSur : 0, serieEndedAt: sc.ended_at };
    }).sort((a: any, b: any) => b.serieScore20 - a.serieScore20);
  }, [filteredStudents, selectedSerie, notationSur]);

  const exportCSV = () => {
    const headers = ["Rang", "Nom", "Email", "Filière", ...epreuves.map(es => {
      const coeff = resolveSerieCoefficient({
        defaultCoefficient: es.coefficient,
        matiereId: es.series?.matiere_id ?? null,
        filiereId: rankingFiliereId,
        coefficientMap,
      });
      return `${es.series?.name?.replace(`${initialExamen.name} — `, "") ?? "?"} (×${coeff})`;
    }), `Moyenne /${notationSur}`];
    const rows = filteredStudents.map((s: any, i: number) => [i + 1, s.name, s.email, s.filiere?.name ?? "—", ...epreuves.map(es => { const sc = s.serieScores[es.series_id]; return sc ? (sc.nb_total > 0 ? ((sc.nb_correct / sc.nb_total) * notationSur).toFixed(1) : "0") : "—"; }), s.moyenne20.toFixed(2)]);
    const csv = [headers.join(";"), ...rows.map((r: any) => r.join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `resultats-${initialExamen.name.replace(/\s+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const RankBadge = ({ rank }: { rank: number }) => rank <= 3 ? (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${rank === 1 ? "bg-yellow-500/20 text-yellow-400" : rank === 2 ? "bg-gray-400/20 text-gray-300" : "bg-orange-500/20 text-orange-400"}`}>{rank}</span>
  ) : <span className="text-xs text-white/40 font-mono">{rank}</span>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10 shrink-0">
        <Link href="/admin/examens" className="text-white/50 hover:text-white transition-colors"><ArrowLeft size={18} /></Link>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameInputRef}
              value={examenName}
              onChange={e => setExamenName(e.target.value)}
              onBlur={() => { setEditingName(false); if (examenName.trim() && examenName !== initialExamen.name) saveHeader({ name: examenName.trim() }); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setExamenName(initialExamen.name); setEditingName(false); } }}
              className="text-lg font-semibold text-white bg-white/5 border border-white/20 rounded-lg px-2 py-0.5 w-full outline-none focus:border-[#C9A84C]"
              autoFocus
            />
          ) : (
            <h1 onClick={() => { setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 50); }}
              className="text-lg font-semibold text-white truncate cursor-pointer hover:text-[#C9A84C] transition-colors" title="Cliquer pour renommer">
              {examenName}
            </h1>
          )}
          <div className="flex items-center gap-4 mt-2">
            <DateTimePicker
              value={isDateSet(debutAt) ? debutAt : null}
              onChange={v => { const iso = v ?? `${SENTINEL}T00:00:00.000Z`; setDebutAt(iso); saveHeader({ debut_at: iso }); }}
              placeholder="Début…"
              placement="left"
            />
            <DateTimePicker
              value={isDateSet(finAt) ? finAt : null}
              onChange={v => { const iso = v ?? `${SENTINEL}T00:00:00.000Z`; setFinAt(iso); saveHeader({ fin_at: iso }); }}
              placeholder="Fin…"
              placement="left"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Examen visibility toggle */}
          <button onClick={() => { const v = !examenVisible; setExamenVisible(v); saveHeader({ visible: v }); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${examenVisible ? "bg-[#C9A84C]/15 text-[#C9A84C]" : "bg-white/5 text-white/40"}`}>
            {examenVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            {examenVisible ? "Visible élèves" : "Masqué élèves"}
          </button>
          <button onClick={handleToggleResults} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${resultsVisible ? "bg-green-500/15 text-green-400" : "bg-white/5 text-white/40"}`}>
            {resultsVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            {resultsVisible ? "Résultats visibles" : "Résultats masqués"}
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-xs font-semibold rounded-lg hover:bg-[#A8892E] transition-colors">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT — Épreuves */}
        <div className="w-[420px] shrink-0 border-r border-white/10 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 pt-4 pb-2 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Épreuves ({epreuves.length})
            </p>
          </div>

          <div className="flex-1 overflow-auto px-4 pb-4 space-y-2">
            {/* Added épreuves */}
            {epreuves.map(es => (
              <div key={es.series_id} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: es.series?.matiere_id ? (matieres.find(m => m.id === es.series?.matiere_id)?.color ?? "#C9A84C") : "#C9A84C" }} />
                  <p className="flex-1 text-sm text-white font-medium truncate">{es.series?.name?.replace(`${initialExamen.name} — `, "") ?? "?"}</p>
                  <button onClick={() => handleRemove(es.series_id)} className="p-1 text-white/20 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                </div>

                {/* Coefficient + Dates */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-white/40">Coeff.</span>
                    <input type="number" min={0.5} max={10} step={0.5} value={es.coefficient}
                      onChange={(e) => handleCoeffChange(es.series_id, Number(e.target.value) || 1)}
                      className="w-14 px-1.5 py-1 bg-white/5 border border-white/10 rounded text-xs text-[#C9A84C] text-center focus:outline-none focus:border-[#C9A84C]/50" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                    <DateTimePicker
                      value={es.debut_at ?? null}
                      placeholder="Début..."
                      onChange={(v) => handleScheduleChange(es.series_id, v, es.fin_at ?? null)}
                    />
                    <span className="text-[10px] text-white/15">→</span>
                    <DateTimePicker
                      value={es.fin_at ?? null}
                      placeholder="Fin..."
                      placement="right"
                      onChange={(v) => handleScheduleChange(es.series_id, es.debut_at ?? null, v)}
                    />
                  </div>
                </div>

                {/* Classes cibles */}
                {(initialExamen.groupe_ids?.length ?? 0) > 1 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-white/25">Classes cibles</p>
                    <div className="flex flex-wrap gap-1">
                      {groupes
                        .filter(g => initialExamen.groupe_ids?.includes(g.id))
                        .map(g => {
                          const active = !es.groupe_ids || es.groupe_ids.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              onClick={() => {
                                const current = es.groupe_ids ?? initialExamen.groupe_ids ?? [];
                                let next: string[] | null;
                                if (active) {
                                  const after = current.filter(id => id !== g.id);
                                  next = after.length === 0 ? [] : after;
                                } else {
                                  const after = [...current, g.id];
                                  next = after.length === (initialExamen.groupe_ids?.length ?? 0) ? null : after;
                                }
                                handleGroupesChange(es.series_id, next);
                              }}
                              className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all border ${active ? "bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C] shadow-sm shadow-[#C9A84C]/10" : "bg-transparent border-white/8 text-white/20 line-through decoration-white/10"}`}
                            >
                              {g.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Actions — Sujet & Correction upload */}
                <div className="flex items-center gap-1.5">
                  {/* Sujet */}
                  {es.sujet_url ? (
                    <div className="flex items-center gap-0.5">
                      <a href={es.sujet_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] text-green-400 hover:bg-green-500/20 transition-colors">
                        <FileText size={10} /> Sujet ✓
                      </a>
                      <button onClick={() => { startTransition(async () => { await updateSerieFileUrl(initialExamen.id, es.series_id, "sujet_url", null); setEpreuves(prev => prev.map(s => s.series_id === es.series_id ? { ...s, sujet_url: null } : s)); }); }}
                        className="p-1 rounded text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Supprimer le sujet">
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg text-[10px] text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer">
                      <Upload size={10} /> Sujet
                      <input type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const res = await uploadPdf(file, `examens/${initialExamen.id}`);
                        if ("error" in res) { showToast(res.error, "error"); return; }
                        const sujUrl = res.url;
                        await updateSerieFileUrl(initialExamen.id, es.series_id, "sujet_url", sujUrl);
                        setEpreuves(prev => prev.map(s => s.series_id === es.series_id ? { ...s, sujet_url: sujUrl } : s));
                        showToast("Sujet uploadé", "success");
                        e.target.value = "";
                        // Auto-import QCM if correction also exists
                        if (es.correction_url) {
                          triggerPdfImport(es.series_id, sujUrl, es.correction_url, (es.series as any)?.cours_id ?? null);
                        }
                      }} />
                    </label>
                  )}
                  {/* Correction */}
                  {es.correction_url ? (
                    <div className="flex items-center gap-0.5">
                      <a href={es.correction_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] text-green-400 hover:bg-green-500/20 transition-colors">
                        <Download size={10} /> Correction ✓
                      </a>
                      <button onClick={() => { startTransition(async () => { await updateSerieFileUrl(initialExamen.id, es.series_id, "correction_url", null); setEpreuves(prev => prev.map(s => s.series_id === es.series_id ? { ...s, correction_url: null } : s)); }); }}
                        className="p-1 rounded text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Supprimer la correction">
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg text-[10px] text-white/50 hover:text-green-400/80 hover:bg-green-500/10 transition-colors cursor-pointer">
                      <Upload size={10} /> Correction
                      <input type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const res = await uploadPdf(file, `examens/${initialExamen.id}`);
                        if ("error" in res) { showToast(res.error, "error"); return; }
                        const corrUrl = res.url;
                        await updateSerieFileUrl(initialExamen.id, es.series_id, "correction_url", corrUrl);
                        setEpreuves(prev => prev.map(s => s.series_id === es.series_id ? { ...s, correction_url: corrUrl } : s));
                        showToast("Correction uploadée", "success");
                        e.target.value = "";
                        // Auto-import QCM if sujet also exists
                        if (es.sujet_url) {
                          triggerPdfImport(es.series_id, es.sujet_url, corrUrl, (es.series as any)?.cours_id ?? null);
                        }
                      }} />
                    </label>
                  )}
                  {/* Import from PDF button — visible when both PDFs uploaded */}
                  {es.sujet_url && es.correction_url && (
                    importedSerieIds.has(es.series_id) ? (
                      <span className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] text-green-400">
                        <Check size={10} /> QCM importés
                      </span>
                    ) : (
                      <button
                        disabled={importingSerieId === es.series_id}
                        onClick={() => triggerPdfImport(es.series_id, es.sujet_url!, es.correction_url!, (es.series as any)?.cours_id ?? null)}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                      >
                        {importingSerieId === es.series_id ? (
                          <><Loader2 size={10} className="animate-spin" /> Import IA en cours…</>
                        ) : (
                          <><Layers size={10} /> Importer QCM (IA)</>
                        )}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => {
                      if (!es.series) return;
                      setEditingSerie({
                        id: es.series_id,
                        name: es.series.name,
                        type: es.series.type ?? "concours_blanc",
                        visible: es.series.visible ?? true,
                        timed: (es.series as any).timed ?? false,
                        duration_minutes: (es.series as any).duration_minutes ?? null,
                        score_definitif: (es.series as any).score_definitif ?? false,
                        cours_id: (es.series as any).cours_id ?? null,
                        nb_questions: (es.series as any).nb_questions ?? 0,
                        annee: (es.series as any).annee ?? null,
                      });
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-[#C9A84C]/10 rounded-lg text-[10px] text-[#C9A84C]/70 hover:text-[#C9A84C] hover:bg-[#C9A84C]/20 transition-colors ml-auto"
                  >
                    Éditer QCM →
                  </button>
                </div>
              </div>
            ))}

            {/* Separator */}
            {epreuves.length > 0 && <div className="border-t border-white/5 my-2" />}

            {/* Add épreuves — matières list */}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 pt-1">Ajouter une épreuve</p>
            {tree.semesters.map(sem => {
              const subjects = tree.semesterMap.get(sem.id) ?? [];
              if (subjects.length === 0) return null;
              const isOpen = expandedSemesters.has(sem.id);
              return (
                <div key={sem.id}>
                  <button onClick={() => toggleSemester(sem.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] text-left">
                    <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.3)", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                    <SemesterIcon className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] font-semibold" style={{ color: "#C9A84C" }}>{sem.name}</span>
                  </button>
                  {isOpen && subjects.map(sub => {
                    const matiere = matieres.find(m => m.dossier_id === sub.id);
                    const added = (!!matiere && addedMatiereIds.has(matiere.id))
                      || Array.from(addedSerieNames).some(n => n?.endsWith(`— ${sub.name}`));
                    const isCreatingThis = creating === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => !added && !isCreatingThis && handleAddSubject(sub)}
                        disabled={added || isCreatingThis}
                        className={`w-full flex items-center gap-2.5 ml-4 px-3 py-2 rounded-lg transition-all text-left ${added ? "opacity-35 cursor-default" : "hover:bg-[#C9A84C]/8 cursor-pointer"}`}
                      >
                        <SubjectIcon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-[11px] text-white/70 truncate font-medium">{sub.name}</span>
                        {added ? (
                          <Check size={12} className="text-green-400/60 shrink-0" />
                        ) : isCreatingThis ? (
                          <Loader2 size={12} className="animate-spin text-[#C9A84C] shrink-0" />
                        ) : (
                          <Plus size={13} className="text-[#C9A84C]/50 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Résultats */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 px-5 pt-4 shrink-0">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-white/40 text-[10px] mb-1"><Trophy size={10} /> Moyenne</div>
              <p className="text-xl font-bold text-white">{classMoyenne.toFixed(1)}<span className="text-xs text-white/40">/{notationSur}</span></p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-white/40 text-[10px] mb-1"><Users size={10} /> Participants</div>
              <p className="text-xl font-bold text-white">{filteredStudents.length}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-white/40 text-[10px] mb-1"><Layers size={10} /> Épreuves</div>
              <p className="text-xl font-bold text-white">{epreuves.length}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-white/40 text-[10px] mb-1"><Trophy size={10} /> Top</div>
              <p className="text-xl font-bold text-white">{filteredStudents.length > 0 ? (filteredStudents[0] as any).moyenne20.toFixed(1) : "—"}<span className="text-xs text-white/40">/{notationSur}</span></p>
            </div>
          </div>

          {/* Tabs + filters */}
          <div className="flex items-center gap-3 px-5 pt-3 shrink-0 flex-wrap">
            <div className="flex bg-white/5 rounded-lg p-0.5">
              <button onClick={() => { setResultTab("global"); setSelectedSerie(null); }}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${resultTab === "global" ? "bg-[#C9A84C] text-[#0e1e35]" : "text-white/50"}`}>
                Global
              </button>
              <button onClick={() => { setResultTab("serie"); if (!selectedSerie && epreuves.length > 0) setSelectedSerie(epreuves[0].series_id); }}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${resultTab === "serie" ? "bg-[#C9A84C] text-[#0e1e35]" : "text-white/50"}`}>
                Par matière
              </button>
            </div>
            {resultTab === "serie" && (
              <div className="flex flex-wrap gap-1">
                {epreuves.map(es => (
                  <button key={es.series_id} onClick={() => setSelectedSerie(es.series_id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${selectedSerie === es.series_id ? "bg-[#C9A84C]/15 text-[#C9A84C] border-[#C9A84C]/30" : "bg-white/5 text-white/40 border-white/10"}`}>
                    {es.series?.name?.replace(`${initialExamen.name} — `, "") ?? "?"}
                  </button>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Filter size={10} className="text-white/30" />
              <select value={filterFiliere} onChange={(e) => setFilterFiliere(e.target.value)}
                className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white focus:outline-none">
                <option value="all">Toutes filières</option>
                {filieres.map((f: any) => <option key={f.id} value={f.id}>{f.code}</option>)}
              </select>
              {rankingFiliereId && (
                <span className="rounded-full bg-[#C9A84C]/10 px-2 py-1 text-[10px] font-semibold text-[#C9A84C]">
                  coeff. {filieres.find((f: any) => f.id === rankingFiliereId)?.code ?? "filière"}
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-5 pt-3 pb-4">
            {resultTab === "global" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 sticky top-0 bg-[#0e1e35]">
                    <th className="text-left py-2 px-2 text-white/50 text-[10px] font-medium w-8">#</th>
                    <th className="text-left py-2 px-2 text-white/50 text-[10px] font-medium min-w-[140px]">Élève</th>
                    {epreuves.map(es => {
                      const coeff = resolveSerieCoefficient({
                        defaultCoefficient: es.coefficient,
                        matiereId: es.series?.matiere_id ?? null,
                        filiereId: rankingFiliereId,
                        coefficientMap,
                      });
                      return (
                        <th key={es.series_id} className="py-2 px-1 text-center text-white/40 text-[10px] font-medium min-w-[60px]">
                          <div className="truncate max-w-[80px]">{es.series?.name?.replace(`${initialExamen.name} — `, "") ?? "?"}</div>
                          <div className="text-[9px] text-[#C9A84C]">×{coeff}</div>
                        </th>
                      );
                    })}
                    <th className="py-2 px-2 text-center text-white/50 text-[10px] font-semibold">Moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s: any, i: number) => (
                    <tr key={s.userId} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-1.5 px-2"><RankBadge rank={i + 1} /></td>
                      <td className="py-1.5 px-2"><p className="text-xs text-white/80 font-medium truncate">{s.name}</p><p className="text-[9px] text-white/25">{s.email}</p></td>
                      {epreuves.map(es => {
                        const sc = s.serieScores[es.series_id];
                        if (!sc) return <td key={es.series_id} className="py-1.5 px-1 text-center text-[9px] text-white/15">—</td>;
                        const s20 = sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * notationSur : 0;
                        const pct = sc.nb_total > 0 ? (sc.nb_correct / sc.nb_total) * 100 : 0;
                        return <td key={es.series_id} className="py-1.5 px-1 text-center"><span className={`text-xs font-medium ${pct >= 70 ? "text-green-400" : pct >= 50 ? "text-orange-400" : "text-red-400"}`}>{s20.toFixed(1)}</span></td>;
                      })}
                      <td className="py-1.5 px-2 text-center"><span className={`text-sm font-bold ${s.moyenne20 >= notationSur * 0.7 ? "text-green-400" : s.moyenne20 >= notationSur * 0.5 ? "text-orange-400" : "text-red-400"}`}>{s.moyenne20.toFixed(1)}</span></td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && <tr><td colSpan={2 + epreuves.length + 1} className="text-center py-12 text-white/25 text-xs">Aucun résultat</td></tr>}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 sticky top-0 bg-[#0e1e35]">
                    <th className="text-left py-2 px-2 text-white/50 text-[10px] w-8">#</th>
                    <th className="text-left py-2 px-2 text-white/50 text-[10px] min-w-[160px]">Élève</th>
                    <th className="text-left py-2 px-2 text-white/50 text-[10px]">Date</th>
                    <th className="py-2 px-2 text-center text-white/50 text-[10px] font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {serieStudents.map((s: any, i: number) => {
                    const pct = (s.serieScore20 / notationSur) * 100;
                    return (
                      <tr key={s.userId} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-1.5 px-2"><RankBadge rank={i + 1} /></td>
                        <td className="py-1.5 px-2"><p className="text-xs text-white/80 font-medium">{s.name}</p><p className="text-[9px] text-white/25">{s.email}</p></td>
                        <td className="py-1.5 px-2 text-[10px] text-white/40">{new Date(s.serieEndedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="py-1.5 px-2 text-center"><span className={`text-sm font-bold ${pct >= 70 ? "text-green-400" : pct >= 50 ? "text-orange-400" : "text-red-400"}`}>{s.serieScore20.toFixed(1)}</span><span className="text-[9px] text-white/20">/{notationSur}</span></td>
                      </tr>
                    );
                  })}
                  {serieStudents.length === 0 && <tr><td colSpan={4} className="text-center py-12 text-white/25 text-xs">{selectedSerie ? "Aucun résultat" : "Sélectionne une épreuve"}</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Inline QCM serie editor */}
      {editingSerie && (
        <FullSerieEditor
          serie={editingSerie}
          coursList={[]}
          onClose={() => setEditingSerie(null)}
          onSaved={() => setEditingSerie(null)}
          readonlyType
        />
      )}
    </div>
  );
}

// ─── Modern DateTimePicker ────────────────────────────────────────────────────

const MONTHS_FR = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const DAYS_FR = ["L", "M", "M", "J", "V", "S", "D"];

export function DateTimePicker({ value, onChange, placeholder, placement = "left" }: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  placement?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, left: 0 });
  const parsed = value ? new Date(value) : null;
  const [viewYear, setViewYear] = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed?.getMonth() ?? new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(parsed);
  const [timeH, setTimeH] = useState(() => parsed ? String(parsed.getHours()).padStart(2, "0") : "08");
  const [timeM, setTimeM] = useState(() => parsed ? String(parsed.getMinutes()).padStart(2, "0") : "00");

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const POPUP_W = 256;
      const POPUP_H = 370; // approximate popup height
      // Open above if not enough room below
      const openAbove = r.bottom + POPUP_H + 10 > window.innerHeight;
      const top = openAbove ? Math.max(4, r.top - POPUP_H - 6) : r.bottom + 6;
      if (placement === "right") {
        setPopupPos({ top, right: Math.max(4, window.innerWidth - r.right) });
      } else {
        const left = Math.max(4, Math.min(r.left, window.innerWidth - POPUP_W - 4));
        setPopupPos({ top, left });
      }
    }
    setOpen(o => {
      // Auto-select today when opening with no date selected
      if (!o && !selectedDate) {
        const now = new Date();
        setSelectedDate(now);
        setViewYear(now.getFullYear());
        setViewMonth(now.getMonth());
        applyDateTime(now, timeH, timeM);
      }
      return !o;
    });
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const applyDateTime = (date: Date, h: string, m: string) => {
    const d = new Date(date);
    d.setHours(parseInt(h) || 0, parseInt(m) || 0, 0, 0);
    onChange(d.toISOString());
  };

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    setSelectedDate(d);
    applyDateTime(d, timeH, timeM);
  };

  const handleTime = (field: "h" | "m", val: string) => {
    // Store raw value during typing — validate on blur
    if (field === "h") { setTimeH(val); if (selectedDate) applyDateTime(selectedDate, val || "0", timeM); }
    else { setTimeM(val); if (selectedDate) applyDateTime(selectedDate, timeH, val || "0"); }
  };
  const handleTimeBlur = (field: "h" | "m") => {
    if (field === "h") {
      setTimeH(prev => {
        const n = Math.min(parseInt(prev) || 0, 23);
        return String(n).padStart(2, "0");
      });
    } else {
      setTimeM(prev => {
        const n = Math.min(parseInt(prev) || 0, 59);
        return String(n).padStart(2, "0");
      });
    }
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = new Date();

  const label = selectedDate
    ? `${selectedDate.getDate()} ${MONTHS_FR[selectedDate.getMonth()]} ${selectedDate.getFullYear()} · ${timeH}:${timeM}`
    : placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
          selectedDate
            ? "bg-white/8 border-[#C9A84C]/30 text-white/80 hover:border-[#C9A84C]/50"
            : "bg-white/3 border-white/8 text-white/30 hover:border-white/15 hover:text-white/50"
        }`}
      >
        <Calendar size={9} className={selectedDate ? "text-[#C9A84C]/70" : ""} />
        {label}
      </button>

      {open && (
        <div className="fixed z-[9999] rounded-2xl border border-white/12 shadow-2xl overflow-hidden" style={{ backgroundColor: "#0a1828", minWidth: 248, top: popupPos.top, ...(popupPos.left !== undefined ? { left: popupPos.left } : { right: popupPos.right }) }}>
          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <button onClick={prevMonth} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white transition-colors text-sm">‹</button>
            <span className="text-xs font-bold text-white">{MONTHS_FR[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white transition-colors text-sm">›</button>
          </div>

          {/* Calendar grid */}
          <div className="px-3 pt-2 pb-1">
            <div className="grid grid-cols-7 mb-1">
              {DAYS_FR.map((d, i) => (
                <span key={i} className="text-center text-[9px] font-bold text-white/20 py-1">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected = selectedDate?.getFullYear() === viewYear && selectedDate?.getMonth() === viewMonth && selectedDate?.getDate() === day;
                const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
                return (
                  <button key={day} onClick={() => selectDay(day)}
                    className={`h-7 w-full rounded-lg text-[11px] font-semibold transition-all ${
                      isSelected
                        ? "bg-[#C9A84C] text-[#0a1828] shadow-sm"
                        : isToday
                        ? "text-[#C9A84C] border border-[#C9A84C]/30"
                        : "text-white/55 hover:bg-white/8 hover:text-white"
                    }`}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time + actions */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-white/8">
            <Clock size={12} className="text-white/30 shrink-0" />
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={timeH}
                onChange={e => handleTime("h", e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => handleTimeBlur("h")}
                onFocus={e => e.target.select()}
                className="w-10 bg-white/8 border border-white/15 rounded-lg py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:border-[#C9A84C]/60"
              />
              <span className="text-white/40 text-sm font-bold">:</span>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={timeM}
                onChange={e => handleTime("m", e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => handleTimeBlur("m")}
                onFocus={e => e.target.select()}
                className="w-10 bg-white/8 border border-white/15 rounded-lg py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:border-[#C9A84C]/60"
              />
            </div>
            <button
              onClick={() => { setSelectedDate(null); onChange(null); setOpen(false); }}
              className="text-[10px] text-white/25 hover:text-white/50 transition-colors px-1"
            >
              Effacer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

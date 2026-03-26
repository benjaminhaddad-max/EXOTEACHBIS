"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import {
  FileText, Clock, Users, Check, AlertCircle, Search, Eye,
  ChevronRight, Pencil, BarChart3, Copy, X, GraduationCap, Building2,
} from "lucide-react";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, FormTargetType, Groupe, Profile } from "@/types/database";
import type { SidebarFilter } from "@/components/admin/formulaires/formulaires-sidebar";
import { FormulaireEditor } from "@/components/admin/formulaires/formulaire-editor";
import { duplicateFormTemplate } from "@/app/(admin)/admin/configuration/actions";

type ActiveView = "list" | "editor" | "responses";
type Toast = { kind: "success" | "error"; message: string } | null;

function profileName(p: Profile | null | undefined) {
  if (!p) return "Inconnu";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email;
}

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

function getTargetLabel(t: FormTemplate, dossiers: Dossier[], groupes: Groupe[]) {
  if (t.target_type === "global") return "Tous les élèves";
  if (t.target_type === "offer") { const d = dossiers.find(d => d.formation_offer === t.target_offer_code || d.id === t.target_offer_code); return d ? d.name : "Formation"; }
  if (t.target_type === "university") { const d = dossiers.find(d => d.id === t.target_university_dossier_id); return d ? d.name : "Université"; }
  if (t.target_type === "groupe") { const g = groupes.find(g => g.id === t.target_groupe_id); return g ? g.name : "Classe"; }
  if (t.target_type === "student") return "1 élève";
  if (t.target_type === "selection") return `${t.target_student_ids?.length ?? 0} élèves`;
  return "—";
}

const TARGET_COLORS: Record<string, string> = {
  global: "#C9A84C", offer: "#C9A84C", university: "#A78BFA", groupe: "#34D399", student: "#38BDF8", selection: "#F472B6",
};

export function FormulairesShellContent({
  currentProfile, initialTemplates, initialFields, initialDossiers, initialGroupes, initialStudents, initialResponses, sidebarFilter, triggerCreate, onCreateHandled,
}: {
  currentProfile: Profile;
  initialTemplates: FormTemplate[];
  initialFields: FormField[];
  initialDossiers: Dossier[];
  initialGroupes: Groupe[];
  initialStudents: Profile[];
  initialResponses: CoachingIntakeForm[];
  sidebarFilter: SidebarFilter;
  triggerCreate?: boolean;
  onCreateHandled?: () => void;
}) {
  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<Toast>(null);

  const responseCountByTemplate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of initialResponses) if (r.form_template_id) m.set(r.form_template_id, (m.get(r.form_template_id) || 0) + 1);
    return m;
  }, [initialResponses]);

  const filteredTemplates = useMemo(() => {
    let filtered = initialTemplates;
    if (sidebarFilter.type === "offer") filtered = filtered.filter(t => t.target_type === "offer" && t.target_offer_code === sidebarFilter.offerId);
    else if (sidebarFilter.type === "university") filtered = filtered.filter(t => t.target_type === "university" && t.target_university_dossier_id === sidebarFilter.dossierId);
    else if (sidebarFilter.type === "groupe") filtered = filtered.filter(t => t.target_type === "groupe" && t.target_groupe_id === sidebarFilter.groupeId);
    if (search.trim()) { const q = search.toLowerCase(); filtered = filtered.filter(t => t.title.toLowerCase().includes(q)); }
    return filtered;
  }, [initialTemplates, sidebarFilter, search]);

  const selectedTemplate = initialTemplates.find(t => t.id === selectedTemplateId) ?? null;
  const selectedResponses = useMemo(() => selectedTemplate ? initialResponses.filter(r => r.form_template_id === selectedTemplate.id) : [], [initialResponses, selectedTemplate]);
  const selectedFields = useMemo(() => selectedTemplate ? initialFields.filter(f => f.form_template_id === selectedTemplate.id).sort((a, b) => a.order_index - b.order_index) : [], [initialFields, selectedTemplate]);

  const showToast = (msg: string, kind: "success" | "error") => { setToast({ message: msg, kind }); setTimeout(() => setToast(null), 3000); };

  // Open editor for new template when triggered from header
  useEffect(() => {
    if (triggerCreate) { setSelectedTemplateId(null); setActiveView("editor"); onCreateHandled?.(); }
  }, [triggerCreate]);

  return (
    <div className="p-5 space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Sub-header when viewing a template */}
      {selectedTemplate && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => { setActiveView("list"); setSelectedTemplateId(null); }} className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>← Formulaires</button>
            <ChevronRight size={10} style={{ color: "rgba(255,255,255,0.2)" }} />
            <span className="text-sm font-semibold text-white truncate">{selectedTemplate.title}</span>
          </div>
          <div className="flex rounded-lg border border-white/15 overflow-hidden text-xs">
            <button onClick={() => setActiveView("editor")} className={`px-3 py-1.5 font-medium transition-colors ${activeView === "editor" ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10"}`}>
              <Pencil size={11} className="inline mr-1" /> Éditeur
            </button>
            <button onClick={() => setActiveView("responses")} className={`px-3 py-1.5 font-medium transition-colors ${activeView === "responses" ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10"}`}>
              <BarChart3 size={11} className="inline mr-1" /> Réponses ({responseCountByTemplate.get(selectedTemplate.id) ?? 0})
            </button>
          </div>
        </div>
      )}

      {/* Views */}
      {activeView === "list" && !selectedTemplate && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un formulaire..." className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25" />
          </div>
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
              <FileText size={32} className="mb-3 opacity-30" />
              <p className="text-sm">Aucun formulaire</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredTemplates.map(t => {
                const count = responseCountByTemplate.get(t.id) ?? 0;
                const tc = TARGET_COLORS[t.target_type] ?? "#9CA3AF";
                return (
                  <button key={t.id} onClick={() => { setSelectedTemplateId(t.id); setActiveView("editor"); }}
                    className="text-left p-4 rounded-2xl border transition-all" style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                    onMouseOver={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; }} onMouseOut={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}>
                    <div className="flex items-start gap-2 mb-2">
                      <FileText size={14} style={{ color: tc, marginTop: 2 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                        {t.description && <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "rgba(255,255,255,0.4)" }}>{t.description}</p>}
                      </div>
                      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: t.is_active ? "#34D399" : "rgba(255,255,255,0.15)" }} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tc + "15", color: tc }}>
                        <Users size={9} /> {getTargetLabel(t, initialDossiers, initialGroupes)}
                      </span>
                      <span>{count} rép.</span>
                      <span className="ml-auto">{formatDate(t.updated_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeView === "editor" && (
        <FormulaireEditor
          initialTemplates={initialTemplates}
          initialFields={initialFields}
          initialDossiers={initialDossiers}
          initialGroupes={initialGroupes}
          initialStudents={initialStudents}
          initialResponses={initialResponses}
          selectedTemplateId={selectedTemplateId}
          showToast={showToast}
        />
      )}

      {activeView === "responses" && selectedTemplate && (
        <ResponsesView template={selectedTemplate} fields={selectedFields} responses={selectedResponses} />
      )}
    </div>
  );
}

// ─── Responses (copied from formulaires-shell for independence) ───────────────

function ResponsesView({ template, fields, responses }: { template: FormTemplate; fields: FormField[]; responses: CoachingIntakeForm[] }) {
  const [sel, setSel] = useState<CoachingIntakeForm | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Total</p>
          <p className="text-2xl font-bold text-white">{responses.length}</p>
        </div>
        <div className="p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Dernière</p>
          <p className="text-sm font-semibold text-white">{formatDate(responses[0]?.submitted_at)}</p>
        </div>
        <div className="p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Questions</p>
          <p className="text-2xl font-bold text-white">{fields.length}</p>
        </div>
      </div>
      {responses.length === 0 ? (
        <div className="text-center py-12" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune réponse</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Élève</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Classe</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Date</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Actions</th>
            </tr></thead>
            <tbody>{responses.map((r, i) => (
              <tr key={r.id} className="cursor-pointer" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} onClick={() => setSel(r)}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")} onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                <td className="px-4 py-3 text-white font-medium">{profileName(r.student)}</td>
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)" }}>{r.groupe?.name ?? "—"}</td>
                <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)" }}>{formatDate(r.submitted_at)}</td>
                <td className="px-4 py-3 text-right"><button onClick={e => { e.stopPropagation(); setSel(r); }} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "#C9A84C", backgroundColor: "rgba(201,168,76,0.1)" }}><Eye size={11} className="inline mr-1" />Détail</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {sel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSel(null)}>
          <div className="bg-[#0e1e35] border border-white/15 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-base font-semibold text-white">{profileName(sel.student)}</h3><p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{sel.groupe?.name ?? "Sans classe"} · {formatDate(sel.submitted_at)}</p></div>
              <button onClick={() => setSel(null)} className="text-white/40 hover:text-white text-lg">×</button>
            </div>
            <div className="space-y-3">{fields.map(f => { const a = sel.answers?.[f.key]; const v = Array.isArray(a) ? a.join(", ") : a ?? "—"; return (
              <div key={f.id} className="p-3 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{f.label}</p>
                <p className="text-sm text-white">{v || <span style={{ color: "rgba(255,255,255,0.2)" }}>Non renseigné</span>}</p>
              </div>); })}</div>
          </div>
        </div>
      )}
    </div>
  );
}

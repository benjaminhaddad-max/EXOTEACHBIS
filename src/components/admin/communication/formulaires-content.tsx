"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import {
  FileText, Clock, Users, Check, AlertCircle, Search,
  ChevronRight, Pencil, BarChart3, Copy, X, GraduationCap, Building2,
} from "lucide-react";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, FormTargetType, Groupe, Profile } from "@/types/database";
import type { SidebarFilter } from "@/components/admin/formulaires/formulaires-sidebar";
import { FormulaireEditor } from "@/components/admin/formulaires/formulaire-editor";
import { FormResponsesView } from "@/components/admin/formulaires/form-responses-view";
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
  currentProfile, initialTemplates, initialFields, initialDossiers, initialGroupes, initialStudents, initialResponses, sidebarFilter, selectedGroupeIds, triggerCreate, onCreateHandled,
}: {
  currentProfile: Profile;
  initialTemplates: FormTemplate[];
  initialFields: FormField[];
  initialDossiers: Dossier[];
  initialGroupes: Groupe[];
  initialStudents: Profile[];
  initialResponses: CoachingIntakeForm[];
  sidebarFilter: SidebarFilter;
  selectedGroupeIds?: Set<string>;
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
          sidebarGroupeIds={selectedGroupeIds}
          onSaved={() => {
            setSelectedTemplateId(null);
            setActiveView("list");
          }}
        />
      )}

      {activeView === "responses" && selectedTemplate && (
        <FormResponsesView template={selectedTemplate} fields={selectedFields} responses={selectedResponses} />
      )}
    </div>
  );
}


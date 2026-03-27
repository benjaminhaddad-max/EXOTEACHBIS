"use client";

import { useState, useMemo, useTransition } from "react";
import {
  FileText, Clock, Users, Check, AlertCircle, Plus, Search,
  ChevronRight, Pencil, BarChart3, Copy, X, GraduationCap, Building2,
} from "lucide-react";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, FormTargetType, Groupe, Profile } from "@/types/database";
import { duplicateFormTemplate } from "@/app/(admin)/admin/configuration/actions";
import { FormulairesSidebar, type SidebarFilter } from "./formulaires-sidebar";
import { FormulaireEditor } from "./formulaire-editor";
import { FormResponsesView } from "./form-responses-view";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveView = "list" | "editor" | "responses";
type Toast = { kind: "success" | "error"; message: string } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (t.target_type === "offer") {
    const d = dossiers.find(d => d.formation_offer === t.target_offer_code || d.id === t.target_offer_code);
    return d ? d.name : "Formation";
  }
  if (t.target_type === "university") {
    const d = dossiers.find(d => d.id === t.target_university_dossier_id);
    return d ? d.name : "Université";
  }
  if (t.target_type === "groupe") {
    const g = groupes.find(g => g.id === t.target_groupe_id);
    return g ? g.name : "Classe";
  }
  if (t.target_type === "student") return "1 élève";
  if (t.target_type === "selection") return `${t.target_student_ids?.length ?? 0} élèves`;
  return "—";
}

const TARGET_COLORS: Record<string, string> = {
  global: "#C9A84C",
  offer: "#C9A84C",
  university: "#A78BFA",
  groupe: "#34D399",
  student: "#38BDF8",
  selection: "#F472B6",
};

// ─── Main Shell ───────────────────────────────────────────────────────────────

export function FormulairesShell({
  currentProfile,
  initialTemplates,
  initialFields,
  initialDossiers,
  initialGroupes,
  initialStudents,
  initialResponses,
}: {
  currentProfile: Profile;
  initialTemplates: FormTemplate[];
  initialFields: FormField[];
  initialDossiers: Dossier[];
  initialGroupes: Groupe[];
  initialStudents: Profile[];
  initialResponses: CoachingIntakeForm[];
  setupError?: string | null;
}) {
  const [templates] = useState(initialTemplates);
  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ type: "all" });
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<Toast>(null);

  // Response count per template
  const responseCountByTemplate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of initialResponses) {
      if (r.form_template_id) m.set(r.form_template_id, (m.get(r.form_template_id) || 0) + 1);
    }
    return m;
  }, [initialResponses]);

  // Filter templates by sidebar + search
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Sidebar filter
    if (sidebarFilter.type === "offer") {
      filtered = filtered.filter(t => t.target_type === "offer" && (t.target_offer_code === sidebarFilter.offerId || t.target_offer_code === sidebarFilter.offerId));
    } else if (sidebarFilter.type === "university") {
      filtered = filtered.filter(t => t.target_type === "university" && t.target_university_dossier_id === sidebarFilter.dossierId);
    } else if (sidebarFilter.type === "groupe") {
      filtered = filtered.filter(t => t.target_type === "groupe" && t.target_groupe_id === sidebarFilter.groupeId);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q));
    }

    return filtered;
  }, [templates, sidebarFilter, search]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;
  const selectedResponses = useMemo(
    () => selectedTemplate ? initialResponses.filter(r => r.form_template_id === selectedTemplate.id) : [],
    [initialResponses, selectedTemplate]
  );
  const selectedFields = useMemo(
    () => selectedTemplate ? initialFields.filter(f => f.form_template_id === selectedTemplate.id).sort((a, b) => a.order_index - b.order_index) : [],
    [initialFields, selectedTemplate]
  );

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Sidebar */}
      <FormulairesSidebar
        dossiers={initialDossiers}
        groupes={initialGroupes}
        templates={templates}
        filter={sidebarFilter}
        selectedTemplateId={selectedTemplateId}
        onFilterChange={f => { setSidebarFilter(f); setActiveView("list"); setSelectedTemplateId(null); }}
        onSelectTemplate={id => { setSelectedTemplateId(id); setActiveView("editor"); }}
        onCreateTemplate={() => { setSelectedTemplateId(null); setActiveView("editor"); }}
      />

      {/* Right content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveView("list"); setSelectedTemplateId(null); }}
              className="text-sm font-semibold transition-colors"
              style={{ color: activeView === "list" ? "#E3C286" : "rgba(255,255,255,0.4)" }}
            >
              Formulaires
            </button>
            {selectedTemplate && (
              <>
                <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.2)" }} />
                <span className="text-sm font-semibold text-white truncate max-w-[200px]">{selectedTemplate.title}</span>
              </>
            )}
          </div>

          {selectedTemplate && (
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-white/15 overflow-hidden text-xs">
                <button
                  onClick={() => setActiveView("editor")}
                  className={`px-3 py-1.5 font-medium transition-colors ${activeView === "editor" ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10"}`}
                >
                  <Pencil size={11} className="inline mr-1" /> Éditeur
                </button>
                <button
                  onClick={() => setActiveView("responses")}
                  className={`px-3 py-1.5 font-medium transition-colors ${activeView === "responses" ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10"}`}
                >
                  <BarChart3 size={11} className="inline mr-1" /> Réponses ({responseCountByTemplate.get(selectedTemplate.id) ?? 0})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto p-5">
          {activeView === "list" && (
            <FormTemplateList
              templates={filteredTemplates}
              dossiers={initialDossiers}
              groupes={initialGroupes}
              responseCountByTemplate={responseCountByTemplate}
              onSelect={id => { setSelectedTemplateId(id); setActiveView("editor"); }}
              onDuplicate={showToast}
              search={search}
              onSearchChange={setSearch}
            />
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
            <FormResponsesView template={selectedTemplate} fields={selectedFields} responses={selectedResponses} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form Template List ───────────────────────────────────────────────────────

function FormTemplateList({
  templates, dossiers, groupes, responseCountByTemplate, onSelect, onDuplicate, search, onSearchChange,
}: {
  templates: FormTemplate[];
  dossiers: Dossier[];
  groupes: Groupe[];
  responseCountByTemplate: Map<string, number>;
  onSelect: (id: string) => void;
  onDuplicate: (msg: string, kind: "success" | "error") => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const [dupModal, setDupModal] = useState<FormTemplate | null>(null);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Rechercher un formulaire..."
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
        />
      </div>

      {/* Grid */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
          <FileText size={32} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">Aucun formulaire</p>
          <p className="text-xs mt-1">Crée ton premier formulaire depuis la sidebar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {templates.map(t => {
            const count = responseCountByTemplate.get(t.id) ?? 0;
            const targetColor = TARGET_COLORS[t.target_type] ?? "#9CA3AF";
            return (
              <div
                key={t.id}
                className="text-left p-4 rounded-2xl border transition-all group relative"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                {/* Duplicate button (top-right, visible on hover) */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDupModal(t); }}
                  className="absolute top-3 right-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
                  style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.2)" }}
                  title="Dupliquer vers..."
                >
                  <Copy size={10} /> Dupliquer
                </button>

                <button onClick={() => onSelect(t.id)} className="w-full text-left">
                  {/* Title row */}
                  <div className="flex items-start gap-2 mb-2">
                    <FileText size={14} style={{ color: targetColor, marginTop: 2 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                      {t.description && (
                        <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {t.description}
                        </p>
                      )}
                    </div>
                    <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: t.is_active ? "#34D399" : "rgba(255,255,255,0.15)" }} />
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: targetColor + "15", color: targetColor }}>
                      <Users size={9} />
                      {getTargetLabel(t, dossiers, groupes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 size={9} />
                      {count} réponse{count !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 ml-auto">
                      <Clock size={9} />
                      {formatDate(t.updated_at)}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Duplicate modal */}
      {dupModal && (
        <DuplicateModal
          template={dupModal}
          dossiers={dossiers}
          groupes={groupes}
          onClose={() => setDupModal(null)}
          onSuccess={(msg) => { setDupModal(null); onDuplicate(msg, "success"); }}
          onError={(msg) => onDuplicate(msg, "error")}
        />
      )}
    </div>
  );
}

// ─── Duplicate Modal ──────────────────────────────────────────────────────────

function DuplicateModal({ template, dossiers, groupes, onClose, onSuccess, onError }: {
  template: FormTemplate;
  dossiers: Dossier[];
  groupes: Groupe[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [isPending, startTransition] = useState_transition();
  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const universities = useMemo(() => dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unisByOffer = useMemo(() => {
    const m = new Map<string, Dossier[]>();
    for (const u of universities) if (u.parent_id) { if (!m.has(u.parent_id)) m.set(u.parent_id, []); m.get(u.parent_id)!.push(u); }
    return m;
  }, [universities]);
  const groupsByUni = useMemo(() => {
    const m = new Map<string, Groupe[]>();
    for (const g of groupes) if (g.formation_dossier_id) { if (!m.has(g.formation_dossier_id)) m.set(g.formation_dossier_id, []); m.get(g.formation_dossier_id)!.push(g); }
    return m;
  }, [groupes]);

  const handleDuplicate = (targetType: FormTargetType, opts: { offerId?: string; uniId?: string; grpId?: string }) => {
    const targetName = targetType === "global" ? "Tous" :
      targetType === "offer" ? offers.find(o => (o.formation_offer ?? o.id) === opts.offerId)?.name ?? "" :
      targetType === "university" ? universities.find(u => u.id === opts.uniId)?.name ?? "" :
      groupes.find(g => g.id === opts.grpId)?.name ?? "";

    startTransition(async () => {
      const res = await duplicateFormTemplate({
        sourceTemplateId: template.id,
        newTitle: `${template.title} — ${targetName}`,
        target_type: targetType,
        target_offer_code: opts.offerId ?? null,
        target_university_dossier_id: opts.uniId ?? null,
        target_groupe_id: opts.grpId ?? null,
      });
      if ("error" in res) { onError(res.error ?? "Erreur"); return; }
      onSuccess(`Formulaire dupliqué vers ${targetName}`);
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0e1e35] border border-white/15 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">Dupliquer vers...</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              « {template.title} » — choisis la cible
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-1">
          {isPending && (
            <div className="text-center py-4 text-xs" style={{ color: "#C9A84C" }}>Duplication en cours...</div>
          )}

          {/* Global */}
          <button onClick={() => handleDuplicate("global", {})} disabled={isPending}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all disabled:opacity-50"
            style={{ color: "rgba(255,255,255,0.6)" }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            <Users size={12} style={{ color: "#C9A84C" }} />
            <span className="text-[11px] font-semibold">Tous les élèves (global)</span>
          </button>

          <div className="border-t border-white/5 my-1" />

          {/* Tree */}
          {offers.map(offer => (
            <div key={offer.id}>
              <button onClick={() => handleDuplicate("offer", { offerId: offer.formation_offer ?? offer.id })} disabled={isPending}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all disabled:opacity-50"
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                <GraduationCap size={11} style={{ color: "#C9A84C" }} />
                <span className="text-[11px] font-bold" style={{ color: "#C9A84C" }}>{offer.name}</span>
              </button>

              {(unisByOffer.get(offer.id) ?? []).map(uni => (
                <div key={uni.id} className="ml-3">
                  <button onClick={() => handleDuplicate("university", { uniId: uni.id })} disabled={isPending}
                    className="w-full flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-lg text-left transition-all disabled:opacity-50"
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                    <Building2 size={10} style={{ color: "#A78BFA" }} />
                    <span className="text-[10px] font-semibold" style={{ color: "#A78BFA" }}>{uni.name}</span>
                  </button>

                  {(groupsByUni.get(uni.id) ?? []).map(g => (
                    <button key={g.id} onClick={() => handleDuplicate("groupe", { grpId: g.id })} disabled={isPending}
                      className="w-full flex items-center gap-2 pl-8 pr-2 py-1.5 rounded-lg text-left transition-all disabled:opacity-50"
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                      <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ backgroundColor: g.color }}>{g.name[0]?.toUpperCase()}</span>
                      <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{g.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function useState_transition() {
  const [isPending, startTransition] = useTransition();
  return [isPending, (fn: () => Promise<void>) => startTransition(fn)] as const;
}


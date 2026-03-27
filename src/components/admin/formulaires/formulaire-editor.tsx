"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check, CheckSquare, CircleDot, Copy, Eye, EyeOff, GripVertical,
  ListChecks, Loader2, PencilRuler, Plus, Save, Search, Trash2, Type, Users,
} from "lucide-react";
import {
  deleteFormField, saveFormField, saveFormFieldOrder, saveFormTemplate,
} from "@/app/(admin)/admin/configuration/actions";
import { getFieldOptions } from "@/lib/form-builder";
import type {
  CoachingIntakeForm, Dossier, FormField, FormFieldType, FormTargetType, FormTemplate, Groupe, Profile,
} from "@/types/database";

// ─── Constants ────────────────────────────────────────────────────────────────

type TemplateDraft = {
  id?: string; slug: string; title: string; description: string; context: string;
  target_type: FormTargetType; target_offer_code: string | null;
  target_university_dossier_id: string | null; target_groupe_id: string | null;
  target_student_id: string | null; target_student_ids: string[]; is_active: boolean;
};

const FIELD_LIBRARY: { type: FormFieldType; title: string; icon: React.ReactNode }[] = [
  { type: "short_text", title: "Texte court", icon: <Type className="h-4 w-4" /> },
  { type: "long_text", title: "Paragraphe", icon: <PencilRuler className="h-4 w-4" /> },
  { type: "radio", title: "Choix unique", icon: <CircleDot className="h-4 w-4" /> },
  { type: "checkboxes", title: "Cases à cocher", icon: <CheckSquare className="h-4 w-4" /> },
  { type: "select", title: "Liste", icon: <ListChecks className="h-4 w-4" /> },
];

const FORM_CONTEXT_OPTIONS = [
  { value: "generic", label: "Formulaire libre" }, { value: "coaching", label: "Coaching" },
  { value: "pass", label: "PASS" }, { value: "las", label: "LAS" },
  { value: "lsps", label: "LSPS" }, { value: "autre", label: "Autre usage" },
] as const;

const FORM_TARGET_OPTIONS: { value: FormTargetType; label: string; hint: string }[] = [
  { value: "global", label: "Tous les élèves", hint: "Visible par tous." },
  { value: "offer", label: "Formation entière", hint: "Ex: tout PASS, LAS..." },
  { value: "university", label: "Fac entière", hint: "Une université précise." },
  { value: "groupe", label: "Classe entière", hint: "Une classe déterminée." },
  { value: "student", label: "Un élève", hint: "Suivi individuel." },
  { value: "selection", label: "Groupe d'élèves", hint: "Sélection manuelle." },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function templateToDraft(t?: FormTemplate | null): TemplateDraft {
  return { id: t?.id, slug: t?.slug ?? "", title: t?.title ?? "", description: t?.description ?? "", context: t?.context ?? "generic", target_type: t?.target_type ?? "global", target_offer_code: t?.target_offer_code ?? null, target_university_dossier_id: t?.target_university_dossier_id ?? null, target_groupe_id: t?.target_groupe_id ?? null, target_student_id: t?.target_student_id ?? null, target_student_ids: t?.target_student_ids ?? [], is_active: t?.is_active ?? true };
}

function buildNewField(tid: string, type: FormFieldType, order: number): FormField {
  const ts = new Date().toISOString();
  const label = type === "short_text" ? "Nouvelle question" : type === "long_text" ? "Nouvelle question longue" : type === "radio" ? "Question à choix unique" : type === "checkboxes" ? "Question à choix multiple" : "Nouvelle liste";
  return { id: `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, form_template_id: tid, key: "", label, helper_text: "", placeholder: "", field_type: type, required: false, options: ["radio", "checkboxes", "select"].includes(type) ? ["Option 1", "Option 2"] : [], width: "full", order_index: order, created_at: ts, updated_at: ts };
}

function sortFields(f: FormField[]) { return [...f].sort((a, b) => a.order_index - b.order_index); }
function sortTemplates(t: FormTemplate[]) { return [...t].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()); }
function profileName(p: Profile | null | undefined) { if (!p) return "Inconnu"; return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email; }

function getFieldIcon(type: FormFieldType) {
  if (type === "long_text") return <PencilRuler className="h-3.5 w-3.5" />;
  if (type === "radio") return <CircleDot className="h-3.5 w-3.5" />;
  if (type === "checkboxes") return <CheckSquare className="h-3.5 w-3.5" />;
  if (type === "select") return <ListChecks className="h-3.5 w-3.5" />;
  return <Type className="h-3.5 w-3.5" />;
}

function getFieldTypeSymbol(type: FormFieldType) {
  if (type === "checkboxes") return "□"; if (type === "radio") return "○"; if (type === "select") return "▾"; return null;
}

const F = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25";

// ─── Main Editor ──────────────────────────────────────────────────────────────

export function FormulaireEditor({
  initialTemplates, initialFields, initialDossiers, initialGroupes, initialStudents, initialResponses,
  selectedTemplateId: externalSelectedId,
  showToast,
  sidebarGroupeIds,
  onSaved,
}: {
  initialTemplates: FormTemplate[];
  initialFields: FormField[];
  initialDossiers: Dossier[];
  initialGroupes: Groupe[];
  initialStudents: Profile[];
  initialResponses: CoachingIntakeForm[];
  selectedTemplateId: string | null;
  showToast: (msg: string, kind: "success" | "error") => void;
  sidebarGroupeIds?: Set<string>;
  onSaved?: (templateId: string) => void;
}) {
  const [templates, setTemplates] = useState(sortTemplates(initialTemplates));
  const [fields, setFields] = useState(initialFields);
  const [selectedTemplateId, setSelectedTemplateId] = useState(externalSelectedId ?? templates[0]?.id ?? "");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(templateToDraft(templates.find(t => t.id === selectedTemplateId)));
  const [showPreview, setShowPreview] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Sync with external selection
  useEffect(() => {
    if (externalSelectedId && externalSelectedId !== selectedTemplateId) {
      setSelectedTemplateId(externalSelectedId);
    }
  }, [externalSelectedId]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;
  const offerDossiers = useMemo(() => initialDossiers.filter(d => d.dossier_type === "offer"), [initialDossiers]);
  const universityDossiers = useMemo(() => initialDossiers.filter(d => d.dossier_type === "university"), [initialDossiers]);
  const selectedFields = useMemo(() => sortFields(fields.filter(f => f.form_template_id === selectedTemplateId)), [fields, selectedTemplateId]);
  const templateResponses = useMemo(() => initialResponses.filter(r => r.form_template_id === selectedTemplateId), [initialResponses, selectedTemplateId]);
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return q ? initialStudents.filter(s => profileName(s).toLowerCase().includes(q)).slice(0, 16) : initialStudents.slice(0, 16);
  }, [initialStudents, studentSearch]);

  useEffect(() => { setTemplateDraft(templateToDraft(selectedTemplate)); }, [selectedTemplate?.id]);
  useEffect(() => { setShowAddMenu(false); }, [selectedTemplateId, selectedFieldId]);
  useEffect(() => {
    if (!selectedFieldId || !selectedFields.some(f => f.id === selectedFieldId)) setSelectedFieldId(selectedFields[0]?.id ?? null);
  }, [selectedFieldId, selectedFields]);

  const replaceTemplateFields = (next: FormField[]) => {
    setFields(cur => sortFields([...cur.filter(f => f.form_template_id !== selectedTemplateId), ...next]));
  };
  const updateFieldById = (fid: string, patch: Partial<FormField>) => {
    const field = selectedFields.find(f => f.id === fid);
    if (!field) return;
    replaceTemplateFields(selectedFields.map(f => f.id === fid ? { ...field, ...patch, updated_at: new Date().toISOString() } : f));
    setSelectedFieldId(fid);
  };

  // Apply sidebar targeting to draft before save
  const getDraftWithSidebarTarget = (): TemplateDraft => {
    if (!sidebarGroupeIds || sidebarGroupeIds.size === 0) return { ...templateDraft, target_type: "global", target_offer_code: null, target_university_dossier_id: null, target_groupe_id: null, target_student_id: null, target_student_ids: [] };
    if (sidebarGroupeIds.size === 1) {
      const gid = [...sidebarGroupeIds][0];
      return { ...templateDraft, target_type: "groupe", target_groupe_id: gid, target_offer_code: null, target_university_dossier_id: null, target_student_id: null, target_student_ids: [] };
    }
    // Multi-class: use selection with student_ids empty (or first group)
    return { ...templateDraft, target_type: "groupe", target_groupe_id: [...sidebarGroupeIds][0], target_offer_code: null, target_university_dossier_id: null, target_student_id: null, target_student_ids: [] };
  };

  // Handlers
  const handleSaveTemplate = () => startTransition(async () => {
    const draftToSave = getDraftWithSidebarTarget();
    const res = await saveFormTemplate(draftToSave);
    if (!("success" in res) || !res.template) { showToast(res.error ?? "Erreur", "error"); return; }
    setTemplates(cur => sortTemplates([...cur.filter(t => t.id !== res.template!.id), res.template!]));
    setSelectedTemplateId(res.template!.id);
    showToast("Formulaire enregistré", "success");
    onSaved?.(res.template!.id);
  });

  const handleAddField = (type: FormFieldType) => {
    if (!selectedTemplateId) { showToast("Enregistre d'abord le formulaire", "error"); return; }
    const nf = buildNewField(selectedTemplateId, type, (selectedFields.at(-1)?.order_index ?? 0) + 10);
    replaceTemplateFields([...selectedFields, nf]);
    setSelectedFieldId(nf.id);
  };

  const handleSaveField = (field: FormField) => startTransition(async () => {
    const res = await saveFormField({ id: field.id.startsWith("draft-") ? undefined : field.id, form_template_id: selectedTemplateId, key: field.key, label: field.label, helper_text: field.helper_text ?? "", placeholder: field.placeholder ?? "", field_type: field.field_type, required: field.required, options: field.options, width: "full", order_index: field.order_index });
    if (!("success" in res) || !res.field) { showToast(res.error ?? "Erreur", "error"); return; }
    replaceTemplateFields(selectedFields.map(f => (f.id === field.id || f.id === res.field!.id) ? res.field! : f));
    setSelectedFieldId(res.field!.id);
    showToast("Question enregistrée", "success");
  });

  const handleDeleteField = (field: FormField) => {
    if (field.id.startsWith("draft-")) { replaceTemplateFields(selectedFields.filter(f => f.id !== field.id)); setSelectedFieldId(null); return; }
    startTransition(async () => {
      const res = await deleteFormField(field.id);
      if (!("success" in res)) { showToast(res.error ?? "Erreur", "error"); return; }
      replaceTemplateFields(selectedFields.filter(f => f.id !== field.id));
      setSelectedFieldId(null);
      showToast("Question supprimée", "success");
    });
  };

  const handleDuplicateField = (field: FormField) => {
    if (!selectedTemplateId) return;
    const dup: FormField = { ...field, id: `draft-${Date.now()}`, key: "", label: `${field.label} copie`, order_index: (selectedFields.at(-1)?.order_index ?? 0) + 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    replaceTemplateFields([...selectedFields, dup]);
    setSelectedFieldId(dup.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = selectedFields.findIndex(f => f.id === active.id);
    const newIdx = selectedFields.findIndex(f => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(selectedFields, oldIdx, newIdx).map((f, i) => ({ ...f, order_index: (i + 1) * 10 }));
    replaceTemplateFields(reordered);
    const ids = reordered.filter(f => !f.id.startsWith("draft-")).map(f => f.id);
    if (ids.length && selectedTemplateId) startTransition(async () => { await saveFormFieldOrder({ form_template_id: selectedTemplateId, field_ids: ids }); });
  };

  return (
    <div className="space-y-5">
      {/* ── Metadata + Targeting ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),320px]">
        {/* Left: Template info */}
        <div className="p-5 rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            value={templateDraft.title}
            onChange={e => setTemplateDraft(d => ({ ...d, title: e.target.value }))}
            placeholder="Titre du formulaire"
            className="w-full bg-transparent text-xl font-bold text-white outline-none placeholder:text-white/20 mb-3"
          />
          <textarea
            rows={2}
            value={templateDraft.description}
            onChange={e => setTemplateDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="Description du formulaire..."
            className="w-full bg-transparent text-sm text-white/60 outline-none resize-none placeholder:text-white/20 mb-3"
          />
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>{selectedFields.length} question(s)</span>
            <span className="px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(52,211,153,0.12)", color: "#34D399" }}>{selectedFields.filter(f => f.required).length} obligatoire(s)</span>
            <span className="px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(167,139,250,0.12)", color: "#A78BFA" }}>{templateResponses.length} réponse(s)</span>
          </div>

          <div className="flex items-center gap-3 mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <select value={templateDraft.context === "generic" || FORM_CONTEXT_OPTIONS.some(o => o.value === templateDraft.context) ? templateDraft.context : "autre"} onChange={e => setTemplateDraft(d => ({ ...d, context: e.target.value }))} className={F + " max-w-[160px]"}>
                {FORM_CONTEXT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/60 ml-auto">
              <input type="checkbox" checked={templateDraft.is_active} onChange={e => setTemplateDraft(d => ({ ...d, is_active: e.target.checked }))} className="rounded" style={{ accentColor: "#34D399" }} />
              Actif
            </label>
            <button onClick={() => setShowPreview(p => !p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
              {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPreview ? "Masquer" : "Aperçu"}
            </button>
            <button onClick={handleSaveTemplate} disabled={isPending || !templateDraft.title.trim()} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Enregistrer
            </button>
          </div>
        </div>

        {/* Right: Target summary from sidebar */}
        <div className="p-4 rounded-2xl space-y-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#C9A84C" }}>Destinataires</p>
          {sidebarGroupeIds && sidebarGroupeIds.size > 0 ? (
            <div className="p-3 rounded-xl" style={{ backgroundColor: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
              <p className="text-xs font-semibold" style={{ color: "#34D399" }}>
                {sidebarGroupeIds.size} classe{sidebarGroupeIds.size > 1 ? "s" : ""} ciblée{sidebarGroupeIds.size > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {[...sidebarGroupeIds].map(gid => {
                  const g = initialGroupes.find(g => g.id === gid);
                  return g ? (
                    <span key={gid} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: g.color + "20", color: g.color }}>
                      {g.name}
                    </span>
                  ) : null;
                })}
              </div>
              <p className="text-[9px] mt-2" style={{ color: "rgba(52,211,153,0.5)" }}>Définis depuis la sidebar à gauche</p>
            </div>
          ) : (
            <div className="p-3 rounded-xl" style={{ backgroundColor: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)" }}>
              <p className="text-xs font-semibold" style={{ color: "#C9A84C" }}>Global (tous les élèves)</p>
              <p className="text-[9px] mt-1" style={{ color: "rgba(201,168,76,0.5)" }}>Coche des classes dans la sidebar pour cibler</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Student Preview ── */}
      {showPreview && (
        <div className="rounded-2xl p-5 overflow-hidden" style={{ background: "linear-gradient(135deg, #0f1e36 0%, #12314d 48%, #1f5d84 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#d3ab67] mb-2">Aperçu élève</p>
          <h3 className="text-lg font-semibold text-white mb-1">{templateDraft.title || "Titre du formulaire"}</h3>
          <p className="text-xs text-white/60 mb-4">{templateDraft.description || "Description..."}</p>
          <div className="space-y-3">
            {selectedFields.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/15 p-6 text-center text-xs text-white/40">Ajoute des questions pour voir l'aperçu.</div>
            ) : selectedFields.map((field, i) => (
              <div key={field.id} className="rounded-xl bg-white p-4 text-[#12314d]">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#12314d] text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{field.label}</span>
                      {field.required && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f5ecdd] font-semibold">Obligatoire</span>}
                    </div>
                    {field.helper_text && <p className="text-xs text-[#61778a] mb-2">{field.helper_text}</p>}
                    {field.field_type === "radio" && <div className="flex flex-wrap gap-2">{getFieldOptions(field).map(o => <div key={o} className="px-3 py-1.5 rounded-lg border border-[#d8e3eb] text-xs">{o}</div>)}</div>}
                    {field.field_type === "checkboxes" && <div className="space-y-1.5">{getFieldOptions(field).map(o => <label key={o} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#d8e3eb] text-xs"><input type="checkbox" disabled className="rounded" />{o}</label>)}</div>}
                    {field.field_type === "select" && <select disabled className="w-full px-3 py-2 rounded-lg border border-[#d8e3eb] text-xs text-[#61778a]"><option>Sélectionner...</option></select>}
                    {field.field_type === "long_text" && <textarea disabled rows={3} placeholder={field.placeholder ?? ""} className="w-full px-3 py-2 rounded-lg border border-[#d8e3eb] text-xs text-[#61778a] resize-none" />}
                    {field.field_type === "short_text" && <input disabled placeholder={field.placeholder ?? ""} className="w-full px-3 py-2 rounded-lg border border-[#d8e3eb] text-xs text-[#61778a]" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Questions ── */}
      <div className="p-5 rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-white">Questions</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Construis le formulaire question par question.</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>{selectedFields.length} bloc(s)</span>
        </div>

        {selectedFields.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed p-8 text-center" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Enregistre le formulaire puis ajoute ta première question.</p>
            <FieldAddMenu disabled={!selectedTemplateId} onAdd={handleAddField} />
          </div>
        ) : (
          <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selectedFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                {selectedFields.map((field, idx) => (
                  <SortableFieldCard
                    key={field.id}
                    field={field}
                    index={idx + 1}
                    isSelected={field.id === selectedFieldId}
                    isPending={isPending}
                    onSelect={() => setSelectedFieldId(field.id)}
                    onChange={patch => updateFieldById(field.id, patch)}
                    onSave={() => handleSaveField(field)}
                    onDuplicate={() => handleDuplicateField(field)}
                    onDelete={() => handleDeleteField(field)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <div className="flex justify-center pt-2">
              <FieldAddMenu disabled={!selectedTemplateId} onAdd={type => { handleAddField(type); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Targeting Panel (unified tree: Offer → Uni → Class → Students) ──────────

function TargetingPanel({ templateDraft, setTemplateDraft, dossiers, groupes, students }: {
  templateDraft: TemplateDraft;
  setTemplateDraft: React.Dispatch<React.SetStateAction<TemplateDraft>>;
  dossiers: Dossier[];
  groupes: Groupe[];
  students: Profile[];
}) {
  const [searchQ, setSearchQ] = useState("");
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

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
  // Students by groupe_id
  const studentsByGroupe = useMemo(() => {
    const m = new Map<string, Profile[]>();
    const noGroup: Profile[] = [];
    for (const s of students) {
      if (s.groupe_id) { if (!m.has(s.groupe_id)) m.set(s.groupe_id, []); m.get(s.groupe_id)!.push(s); }
      else noGroup.push(s);
    }
    return { byGroup: m, noGroup };
  }, [students]);

  const toggleClassExpand = (gid: string) => setExpandedClasses(prev => { const n = new Set(prev); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });

  // Is a student individually selected?
  const isStudentSelected = (sid: string) => templateDraft.target_type === "selection" && templateDraft.target_student_ids.includes(sid);

  const toggleStudent = (sid: string) => {
    const current = templateDraft.target_student_ids;
    const has = current.includes(sid);
    const next = has ? current.filter(id => id !== sid) : [...current, sid];
    setTemplateDraft(d => ({ ...d, target_type: "selection", target_offer_code: null, target_university_dossier_id: null, target_groupe_id: null, target_student_id: null, target_student_ids: next }));
  };

  const selectGlobal = () => setTemplateDraft(d => ({ ...d, target_type: "global", target_offer_code: null, target_university_dossier_id: null, target_groupe_id: null, target_student_id: null, target_student_ids: [] }));
  const selectOffer = (code: string) => setTemplateDraft(d => ({ ...d, target_type: "offer", target_offer_code: code, target_university_dossier_id: null, target_groupe_id: null, target_student_id: null, target_student_ids: [] }));
  const selectUni = (id: string) => setTemplateDraft(d => ({ ...d, target_type: "university", target_university_dossier_id: id, target_offer_code: null, target_groupe_id: null, target_student_id: null, target_student_ids: [] }));
  const selectGroupe = (id: string) => setTemplateDraft(d => ({ ...d, target_type: "groupe", target_groupe_id: id, target_offer_code: null, target_university_dossier_id: null, target_student_id: null, target_student_ids: [] }));

  const Chk = ({ checked, partial }: { checked: boolean; partial?: boolean }) => (
    <div className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0" style={{
      borderColor: checked || partial ? "#C9A84C" : "rgba(255,255,255,0.2)",
      backgroundColor: checked ? "#C9A84C" : "transparent",
    }}>
      {checked && <Check size={9} style={{ color: "#0e1e35" }} strokeWidth={3} />}
      {!checked && partial && <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: "#C9A84C" }} />}
    </div>
  );

  // Summary
  const summary = useMemo(() => {
    const t = templateDraft.target_type;
    if (t === "global") return "Tous les élèves";
    if (t === "offer") { const o = offers.find(d => (d.formation_offer ?? d.id) === templateDraft.target_offer_code); return o ? o.name : "Formation"; }
    if (t === "university") { const u = universities.find(d => d.id === templateDraft.target_university_dossier_id); return u ? u.name : "Fac"; }
    if (t === "groupe") { const g = groupes.find(g => g.id === templateDraft.target_groupe_id); return g ? g.name : "Classe"; }
    if (t === "selection") return `${templateDraft.target_student_ids.length} élève(s)`;
    return "—";
  }, [templateDraft, offers, universities, groupes]);

  // Search filter
  const matchesSearch = (name: string) => {
    if (!searchQ.trim()) return true;
    return name.toLowerCase().includes(searchQ.toLowerCase());
  };

  return (
    <div className="p-4 rounded-2xl space-y-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#C9A84C" }}>Ciblage</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>{summary}</span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg">
        <Search size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Rechercher un élève, une classe..." className="flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/25" />
      </div>

      {/* Global */}
      <button onClick={selectGlobal} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left"
        style={{ backgroundColor: templateDraft.target_type === "global" ? "rgba(201,168,76,0.1)" : "transparent", border: templateDraft.target_type === "global" ? "1px solid rgba(201,168,76,0.2)" : "1px solid transparent" }}>
        <Chk checked={templateDraft.target_type === "global"} />
        <Users size={11} style={{ color: templateDraft.target_type === "global" ? "#C9A84C" : "rgba(255,255,255,0.3)" }} />
        <span className="text-[11px] font-semibold" style={{ color: templateDraft.target_type === "global" ? "#E3C286" : "rgba(255,255,255,0.5)" }}>Tous les élèves</span>
      </button>

      <div className="border-t border-white/5" />

      {/* Tree: Offer → Uni → Class → Students */}
      <div className="max-h-[400px] overflow-y-auto space-y-0.5 pr-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          const isOfferSel = templateDraft.target_type === "offer" && templateDraft.target_offer_code === (offer.formation_offer ?? offer.id);
          const hasChild = offerUnis.some(u => (templateDraft.target_type === "university" && templateDraft.target_university_dossier_id === u.id) || (groupsByUni.get(u.id) ?? []).some(g => templateDraft.target_type === "groupe" && templateDraft.target_groupe_id === g.id));
          const hasStudentChild = templateDraft.target_type === "selection" && offerUnis.some(u => (groupsByUni.get(u.id) ?? []).some(g => (studentsByGroupe.byGroup.get(g.id) ?? []).some(s => templateDraft.target_student_ids.includes(s.id))));

          return (
            <div key={offer.id}>
              <button onClick={() => selectOffer(offer.formation_offer ?? offer.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left"
                style={{ backgroundColor: isOfferSel ? "rgba(201,168,76,0.08)" : "transparent" }}
                onMouseOver={e => { if (!isOfferSel) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = isOfferSel ? "rgba(201,168,76,0.08)" : "transparent"; }}>
                <Chk checked={isOfferSel} partial={!isOfferSel && (hasChild || hasStudentChild)} />
                <span className="flex-1 text-[11px] font-bold truncate" style={{ color: isOfferSel ? "#E3C286" : "#C9A84C" }}>{offer.name}</span>
              </button>

              {offerUnis.map(uni => {
                const uniGroups = groupsByUni.get(uni.id) ?? [];
                const isUniSel = templateDraft.target_type === "university" && templateDraft.target_university_dossier_id === uni.id;
                const hasGrp = uniGroups.some(g => templateDraft.target_type === "groupe" && templateDraft.target_groupe_id === g.id);

                return (
                  <div key={uni.id} className="ml-3">
                    <button onClick={() => selectUni(uni.id)}
                      className="w-full flex items-center gap-2 pl-2 pr-2 py-1 rounded-lg transition-all text-left"
                      style={{ backgroundColor: isUniSel ? "rgba(167,139,250,0.06)" : "transparent" }}
                      onMouseOver={e => { if (!isUniSel) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                      onMouseOut={e => { e.currentTarget.style.backgroundColor = isUniSel ? "rgba(167,139,250,0.06)" : "transparent"; }}>
                      <Chk checked={isUniSel || isOfferSel} partial={!isUniSel && !isOfferSel && hasGrp} />
                      <span className="text-[10px] font-semibold truncate" style={{ color: isUniSel ? "#A78BFA" : "rgba(167,139,250,0.65)" }}>{uni.name}</span>
                    </button>

                    {uniGroups.map(g => {
                      const isGrpSel = templateDraft.target_type === "groupe" && templateDraft.target_groupe_id === g.id;
                      const classStudents = studentsByGroupe.byGroup.get(g.id) ?? [];
                      const isExpanded = expandedClasses.has(g.id);
                      const hasStudentSel = templateDraft.target_type === "selection" && classStudents.some(s => templateDraft.target_student_ids.includes(s.id));
                      const filteredClassStudents = classStudents.filter(s => matchesSearch(profileName(s)));

                      return (
                        <div key={g.id} className="ml-3">
                          {/* Class row */}
                          <div className="flex items-center gap-1">
                            <button onClick={() => selectGroupe(g.id)}
                              className="flex-1 flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg transition-all text-left"
                              style={{ backgroundColor: isGrpSel ? "rgba(52,211,153,0.06)" : "transparent" }}
                              onMouseOver={e => { if (!isGrpSel) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                              onMouseOut={e => { e.currentTarget.style.backgroundColor = isGrpSel ? "rgba(52,211,153,0.06)" : "transparent"; }}>
                              <Chk checked={isGrpSel || isUniSel || isOfferSel} partial={!isGrpSel && !isUniSel && !isOfferSel && hasStudentSel} />
                              <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ backgroundColor: g.color }}>{g.name[0]?.toUpperCase()}</span>
                              <span className="text-[10px] font-medium truncate" style={{ color: isGrpSel ? "#34D399" : "rgba(255,255,255,0.55)" }}>{g.name}</span>
                            </button>
                            {classStudents.length > 0 && (
                              <button onClick={() => toggleClassExpand(g.id)} className="px-1.5 py-1 rounded text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                                {isExpanded ? "▾" : "▸"} <span className="text-[8px]">{classStudents.length}</span>
                              </button>
                            )}
                          </div>

                          {/* Students under this class */}
                          {isExpanded && filteredClassStudents.length > 0 && (
                            <div className="ml-5 space-y-0.5 mt-0.5 mb-1">
                              {filteredClassStudents.map(s => {
                                const isSel = isStudentSelected(s.id);
                                const inherited = isGrpSel || isUniSel || isOfferSel || templateDraft.target_type === "global";
                                return (
                                  <button key={s.id} onClick={() => { if (!inherited) toggleStudent(s.id); }}
                                    className="w-full flex items-center gap-2 pl-1 pr-2 py-0.5 rounded text-left transition-all"
                                    style={{ backgroundColor: isSel ? "rgba(56,189,248,0.06)" : "transparent", opacity: inherited ? 0.5 : 1 }}
                                    disabled={inherited}
                                    onMouseOver={e => { if (!inherited && !isSel) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                                    onMouseOut={e => { e.currentTarget.style.backgroundColor = isSel ? "rgba(56,189,248,0.06)" : "transparent"; }}>
                                    <Chk checked={isSel || inherited} />
                                    <span className="text-[9px] truncate" style={{ color: isSel ? "#38BDF8" : "rgba(255,255,255,0.45)" }}>{profileName(s)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Students without a class */}
        {studentsByGroupe.noGroup.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[9px] font-semibold uppercase tracking-widest mb-1 px-2" style={{ color: "rgba(255,255,255,0.2)" }}>Sans classe</p>
            {studentsByGroupe.noGroup.filter(s => matchesSearch(profileName(s))).map(s => {
              const isSel = isStudentSelected(s.id);
              const inherited = templateDraft.target_type === "global";
              return (
                <button key={s.id} onClick={() => { if (!inherited) toggleStudent(s.id); }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-all"
                  style={{ backgroundColor: isSel ? "rgba(56,189,248,0.06)" : "transparent", opacity: inherited ? 0.5 : 1 }}
                  disabled={inherited}
                  onMouseOver={e => { if (!inherited && !isSel) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = isSel ? "rgba(56,189,248,0.06)" : "transparent"; }}>
                  <Chk checked={isSel || inherited} />
                  <span className="text-[9px] truncate" style={{ color: isSel ? "#38BDF8" : "rgba(255,255,255,0.4)" }}>{profileName(s)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Field Add Menu ───────────────────────────────────────────────────────────

function FieldAddMenu({ disabled, onAdd }: { disabled: boolean; onAdd: (t: FormFieldType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex items-center gap-2">
      <button onClick={() => setOpen(p => !p)} disabled={disabled} className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-50" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
        <Plus size={20} />
      </button>
      {open && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 w-56 rounded-xl p-2 shadow-2xl" style={{ backgroundColor: "#1a2438", border: "1px solid rgba(255,255,255,0.1)" }}>
          <p className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#C9A84C" }}>Nouvelle question</p>
          {FIELD_LIBRARY.map(item => (
            <button key={item.type} onClick={() => { onAdd(item.type); setOpen(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left" style={{ color: "rgba(255,255,255,0.7)" }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")} onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>{item.icon}</span>
              {item.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sortable Field Card ──────────────────────────────────────────────────────

function SortableFieldCard({ field, index, isSelected, isPending, onSelect, onChange, onSave, onDuplicate, onDelete }: {
  field: FormField; index: number; isSelected: boolean; isPending: boolean;
  onSelect: () => void; onChange: (p: Partial<FormField>) => void; onSave: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={{ ...style, backgroundColor: isSelected ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.02)", border: isSelected ? "1px solid rgba(201,168,76,0.2)" : "1px solid rgba(255,255,255,0.06)", opacity: isDragging ? 0.6 : 1 }} className="rounded-xl p-4">
      <div className="flex items-start gap-3">
        <button onClick={onSelect} className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: isSelected ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)", color: isSelected ? "#C9A84C" : "rgba(255,255,255,0.4)" }}>
          {index}
        </button>
        <div className="flex-1 min-w-0">
          {isSelected ? (
            <FieldEditor field={field} isPending={isPending} onChange={onChange} onSave={onSave} onDuplicate={onDuplicate} onDelete={onDelete}
              dragHandle={<button className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.3)" }} {...attributes} {...listeners}><GripVertical size={14} /></button>} />
          ) : (
            <div role="button" tabIndex={0} onClick={onSelect} className="cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">{getFieldIcon(field.field_type)} {field.label}</span>
                    {field.required && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>Obligatoire</span>}
                  </div>
                  {field.helper_text && <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{field.helper_text}</p>}
                </div>
                <button className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.2)" }} {...attributes} {...listeners}><GripVertical size={14} /></button>
              </div>
              {/* Preview */}
              <div className="mt-3">
                {["radio", "checkboxes", "select"].includes(field.field_type) ? (
                  <div className="flex flex-wrap gap-1.5">{getFieldOptions(field).map(o => (
                    <span key={o} className="px-2.5 py-1 rounded-lg text-[10px]" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                      {getFieldTypeSymbol(field.field_type)} {o}
                    </span>
                  ))}</div>
                ) : (
                  <div className="px-3 py-2 rounded-lg text-[11px]" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }}>
                    {field.placeholder || (field.field_type === "long_text" ? "Réponse longue..." : "Réponse courte...")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Field Editor (expanded) ──────────────────────────────────────────────────

function FieldEditor({ field, isPending, onChange, onSave, onDuplicate, onDelete, dragHandle }: {
  field: FormField; isPending: boolean; onChange: (p: Partial<FormField>) => void;
  onSave: () => void; onDuplicate: () => void; onDelete: () => void; dragHandle: React.ReactNode;
}) {
  const options = getFieldOptions(field);
  const isChoice = ["radio", "checkboxes", "select"].includes(field.field_type);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#C9A84C" }}>{getFieldIcon(field.field_type)} Question</span>
        {dragHandle}
      </div>

      <input value={field.label} onChange={e => onChange({ label: e.target.value })} placeholder="Question sans titre" className="w-full bg-transparent text-lg font-semibold text-white outline-none border-b border-white/15 pb-2 placeholder:text-white/20" />
      <input value={field.helper_text ?? ""} onChange={e => onChange({ helper_text: e.target.value })} placeholder="Description (facultatif)" className="w-full bg-transparent text-xs text-white/50 outline-none border-b border-white/8 pb-2 placeholder:text-white/20" />

      {/* Type picker */}
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#C9A84C" }}>Type</p>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_LIBRARY.map(item => {
            const active = item.type === field.field_type;
            return (
              <button key={item.type} onClick={() => onChange({ field_type: item.type, options: ["radio", "checkboxes", "select"].includes(item.type) ? (options.length > 0 ? options : ["Option 1", "Option 2"]) : [] })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{ backgroundColor: active ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.03)", border: active ? "1px solid rgba(201,168,76,0.25)" : "1px solid rgba(255,255,255,0.06)", color: active ? "#E3C286" : "rgba(255,255,255,0.5)" }}>
                {item.icon} {item.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Options or placeholder */}
      {isChoice ? (
        <div className="space-y-1.5">
          {options.map((opt, i) => (
            <div key={`${field.id}-o-${i}`} className="flex items-center gap-2">
              <span className="text-white/25 w-5 text-center text-sm">{getFieldTypeSymbol(field.field_type)}</span>
              <input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; onChange({ options: n }); }} className="flex-1 bg-transparent text-sm text-white outline-none border-b border-white/10 py-1.5 placeholder:text-white/20" placeholder={`Option ${i + 1}`} />
              <button onClick={() => onChange({ options: options.filter((_, j) => j !== i) })} className="p-1 rounded text-red-400/60 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
          <button onClick={() => onChange({ options: [...options, `Option ${options.length + 1}`] })} className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded-lg" style={{ color: "#C9A84C" }}>
            <Plus size={12} /> Ajouter une option
          </button>
        </div>
      ) : (
        <input value={field.placeholder ?? ""} onChange={e => onChange({ placeholder: e.target.value })} placeholder="Placeholder..." className="w-full bg-transparent text-sm text-white/50 outline-none border-b border-white/10 py-1.5 placeholder:text-white/20" />
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <label className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          <input type="checkbox" checked={field.required} onChange={e => onChange({ required: e.target.checked })} className="rounded" style={{ accentColor: "#C9A84C" }} />
          Obligatoire
        </label>
        <div className="flex items-center gap-1.5">
          <button onClick={onDuplicate} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
            <Copy size={11} /> Dupliquer
          </button>
          <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", backgroundColor: "rgba(239,68,68,0.06)" }}>
            <Trash2 size={11} /> Supprimer
          </button>
          <button onClick={onSave} disabled={isPending || !field.label.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
            {isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

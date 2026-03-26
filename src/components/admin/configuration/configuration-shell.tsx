"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Building2,
  Check,
  CheckSquare,
  Copy,
  CircleDot,
  Eye,
  EyeOff,
  GripVertical,
  History,
  ListChecks,
  Loader2,
  PencilRuler,
  Plus,
  Save,
  Search,
  Trash2,
  Type,
  User,
  Users,
} from "lucide-react";
import {
  deleteFormField,
  saveFormField,
  saveFormFieldOrder,
  saveFormTemplate,
} from "@/app/(admin)/admin/configuration/actions";
import { getFieldOptions } from "@/lib/form-builder";
import type {
  CoachingIntakeForm,
  Dossier,
  FormField,
  FormFieldType,
  FormTargetType,
  FormTemplate,
  Groupe,
  Profile,
} from "@/types/database";

type Toast = {
  kind: "success" | "error";
  message: string;
} | null;

type TemplateDraft = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  context: string;
  target_type: FormTargetType;
  target_offer_code: string | null;
  target_university_dossier_id: string | null;
  target_groupe_id: string | null;
  target_student_id: string | null;
  target_student_ids: string[];
  is_active: boolean;
};

type FieldLibraryItem = {
  type: FormFieldType;
  title: string;
  icon: React.ReactNode;
};

const FIELD_LIBRARY: FieldLibraryItem[] = [
  { type: "short_text", title: "Texte court", icon: <Type className="h-4 w-4" /> },
  { type: "long_text", title: "Paragraphe", icon: <PencilRuler className="h-4 w-4" /> },
  { type: "radio", title: "Choix unique", icon: <CircleDot className="h-4 w-4" /> },
  { type: "checkboxes", title: "Cases à cocher", icon: <CheckSquare className="h-4 w-4" /> },
  { type: "select", title: "Liste", icon: <ListChecks className="h-4 w-4" /> },
];

const FORM_CONTEXT_OPTIONS = [
  { value: "generic", label: "Formulaire libre" },
  { value: "coaching", label: "Coaching" },
  { value: "pass", label: "PASS" },
  { value: "las", label: "LAS" },
  { value: "lsps", label: "LSPS" },
  { value: "autre", label: "Autre usage" },
] as const;

const FORM_TARGET_OPTIONS: Array<{ value: FormTargetType; label: string; hint: string }> = [
  { value: "global", label: "Tous les élèves", hint: "Visible par tous les élèves concernés par la plateforme." },
  { value: "offer", label: "Formation entière", hint: "Ex: tout PASS, tout LAS, tout LSPS." },
  { value: "university", label: "Fac entière", hint: "Cible tous les élèves d'une université précise." },
  { value: "groupe", label: "Classe entière", hint: "Envoie le formulaire à une classe déterminée." },
  { value: "student", label: "Un élève", hint: "Pour un suivi individuel ponctuel." },
  { value: "selection", label: "Groupe d'élèves", hint: "Tu sélectionnes exactement les élèves concernés." },
];

const DS = {
  navy: "#12314d",
  navyDark: "#1a2438",
  blue: "#4fabdb",
  blueSoft: "#a3cceb",
  bluePale: "#a2d8f6",
  gold: "#d3ab67",
  goldSoft: "#f5ecdd",
  line: "#d8e3eb",
  bg: "#f5f8fb",
};

function getContextLabel(context: string) {
  const match = FORM_CONTEXT_OPTIONS.find((option) => option.value === context);
  return match?.label ?? context ?? "Tous les parcours";
}

function getContextSelectValue(context: string) {
  return FORM_CONTEXT_OPTIONS.some((option) => option.value === context) ? context : "autre";
}

function templateToDraft(template?: FormTemplate | null): TemplateDraft {
  return {
    id: template?.id,
    slug: template?.slug ?? "",
    title: template?.title ?? "",
    description: template?.description ?? "",
    context: template?.context ?? "generic",
    target_type: template?.target_type ?? "global",
    target_offer_code: template?.target_offer_code ?? null,
    target_university_dossier_id: template?.target_university_dossier_id ?? null,
    target_groupe_id: template?.target_groupe_id ?? null,
    target_student_id: template?.target_student_id ?? null,
    target_student_ids: template?.target_student_ids ?? [],
    is_active: template?.is_active ?? true,
  };
}

function buildNewField(formTemplateId: string, type: FormFieldType, orderIndex: number): FormField {
  const timestamp = new Date().toISOString();
  const label =
    type === "short_text" ? "Nouvelle question" :
    type === "long_text" ? "Nouvelle question longue" :
    type === "radio" ? "Nouvelle question à choix unique" :
    type === "checkboxes" ? "Nouvelle question à choix multiple" :
    "Nouvelle liste";

  return {
    id: `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    form_template_id: formTemplateId,
    key: "",
    label,
    helper_text: "",
    placeholder: "",
    field_type: type,
    required: false,
    options: ["radio", "checkboxes", "select"].includes(type) ? ["Option 1", "Option 2"] : [],
    width: "full",
    order_index: orderIndex,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function sortFields(fields: FormField[]) {
  return [...fields].sort((a, b) => a.order_index - b.order_index);
}

function sortTemplates(templates: FormTemplate[]) {
  return [...templates].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

function getFieldIcon(type: FormFieldType) {
  if (type === "long_text") return <PencilRuler className="h-4 w-4" />;
  if (type === "radio") return <CircleDot className="h-4 w-4" />;
  if (type === "checkboxes") return <CheckSquare className="h-4 w-4" />;
  if (type === "select") return <ListChecks className="h-4 w-4" />;
  return <Type className="h-4 w-4" />;
}

function getFieldTypeSymbol(type: FormFieldType) {
  if (type === "checkboxes") return "□";
  if (type === "radio") return "○";
  if (type === "select") return "▾";
  return null;
}

function profileName(profile: Profile | null | undefined) {
  if (!profile) return "Élève inconnu";
  const full = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return full || profile.email;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Pas encore";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTemplateTargetSummary(
  template: Pick<FormTemplate, "target_type" | "target_offer_code" | "target_university_dossier_id" | "target_groupe_id" | "target_student_id" | "target_student_ids">,
  options: {
    offerDossiers: Dossier[];
    dossierById: Map<string, Dossier>;
    groupeById: Map<string, Groupe>;
    studentById: Map<string, Profile>;
  }
) {
  if (template.target_type === "offer") {
    const offer = options.offerDossiers.find((item) => item.formation_offer === template.target_offer_code || item.id === template.target_offer_code);
    return offer ? `Formation · ${offer.name}` : "Formation ciblée";
  }

  if (template.target_type === "university") {
    const university = template.target_university_dossier_id ? options.dossierById.get(template.target_university_dossier_id) : null;
    return university ? `Fac · ${university.name}` : "Fac ciblée";
  }

  if (template.target_type === "groupe") {
    const groupe = template.target_groupe_id ? options.groupeById.get(template.target_groupe_id) : null;
    return groupe ? `Classe · ${groupe.name}` : "Classe ciblée";
  }

  if (template.target_type === "student") {
    const student = template.target_student_id ? options.studentById.get(template.target_student_id) : null;
    return student ? `Élève · ${profileName(student)}` : "Élève ciblé";
  }

  if (template.target_type === "selection") {
    const count = template.target_student_ids?.length ?? 0;
    return count > 0 ? `Groupe d'élèves · ${count} sélectionné(s)` : "Groupe d'élèves";
  }

  return "Tous les élèves";
}

export function ConfigurationShell({
  currentProfile,
  initialTemplates,
  initialFields,
  initialDossiers,
  initialGroupes,
  initialStudents,
  initialResponses,
  setupError,
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
  const [templates, setTemplates] = useState(sortTemplates(initialTemplates));
  const [fields, setFields] = useState(initialFields);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplates[0]?.id ?? "");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(templateToDraft(initialTemplates[0] ?? null));
  const [toast, setToast] = useState<Toast>(null);
  const [showStudentPreview, setShowStudentPreview] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const canAccess = ["admin", "superadmin"].includes(currentProfile.role);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const offerDossiers = useMemo(
    () => initialDossiers.filter((dossier) => dossier.dossier_type === "offer"),
    [initialDossiers]
  );
  const universityDossiers = useMemo(
    () => initialDossiers.filter((dossier) => dossier.dossier_type === "university"),
    [initialDossiers]
  );
  const groupeById = useMemo(() => new Map(initialGroupes.map((groupe) => [groupe.id, groupe])), [initialGroupes]);
  const dossierById = useMemo(() => new Map(initialDossiers.map((dossier) => [dossier.id, dossier])), [initialDossiers]);
  const studentById = useMemo(() => new Map(initialStudents.map((student) => [student.id, student])), [initialStudents]);
  const selectedFields = useMemo(
    () => sortFields(fields.filter((field) => field.form_template_id === selectedTemplateId)),
    [fields, selectedTemplateId]
  );
  useEffect(() => {
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    setTemplateDraft(templateToDraft(selectedTemplate));
  }, [selectedTemplate?.id]);

  useEffect(() => {
    setShowAddMenu(false);
  }, [selectedTemplateId, selectedFieldId]);

  useEffect(() => {
    if (!selectedFieldId || !selectedFields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(selectedFields[0]?.id ?? null);
    }
  }, [selectedFieldId, selectedFields]);

  const stats = useMemo(() => {
    return {
      total: selectedFields.length,
      required: selectedFields.filter((field) => field.required).length,
    };
  }, [selectedFields]);
  const templateResponses = useMemo(
    () => initialResponses.filter((response) => response.form_template_id === selectedTemplateId),
    [initialResponses, selectedTemplateId]
  );
  const responseStats = useMemo(() => {
    const latest = templateResponses[0] ?? null;
    return {
      total: templateResponses.length,
      latestSubmittedAt: latest?.submitted_at ?? null,
    };
  }, [templateResponses]);
  const selectedContextValue = getContextSelectValue(templateDraft.context);
  const isCustomContext = selectedContextValue === "autre";
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return initialStudents.slice(0, 16);
    return initialStudents.filter((student) => profileName(student).toLowerCase().includes(query)).slice(0, 16);
  }, [initialStudents, studentSearch]);
  const draftTargetSummary = useMemo(
    () =>
      getTemplateTargetSummary(templateDraft, {
        offerDossiers,
        dossierById,
        groupeById,
        studentById,
      }),
    [templateDraft, offerDossiers, dossierById, groupeById, studentById]
  );

  const replaceTemplateFields = (nextFields: FormField[]) => {
    setFields((current) => {
      const unrelated = current.filter((field) => field.form_template_id !== selectedTemplateId);
      return sortFields([...unrelated, ...nextFields]);
    });
  };

  const updateFieldById = (fieldId: string, patch: Partial<FormField>) => {
    const field = selectedFields.find((item) => item.id === fieldId);
    if (!field) return;

    const nextField: FormField = {
      ...field,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    replaceTemplateFields(selectedFields.map((item) => (item.id === fieldId ? nextField : item)));
    setSelectedFieldId(fieldId);
  };

  const handleSaveTemplate = () => {
    startTransition(async () => {
      const response = await saveFormTemplate(templateDraft);
      if (!("success" in response) || !response.template) {
        setToast({ kind: "error", message: response.error ?? "Impossible d'enregistrer le formulaire." });
        return;
      }

      const savedTemplate = response.template;
      setTemplates((current) => {
        const withoutCurrent = current.filter((template) => template.id !== savedTemplate.id);
        return sortTemplates([...withoutCurrent, savedTemplate]);
      });
      setSelectedTemplateId(savedTemplate.id);
      setToast({ kind: "success", message: "Formulaire enregistré." });
    });
  };

  const handleAddTemplate = () => {
    setSelectedTemplateId("");
    setSelectedFieldId(null);
    setTemplateDraft({
      slug: "",
      title: "Nouveau formulaire",
      description: "",
      context: "generic",
      target_type: "global",
      target_offer_code: null,
      target_university_dossier_id: null,
      target_groupe_id: null,
      target_student_id: null,
      target_student_ids: [],
      is_active: true,
    });
  };

  const handleAddField = (type: FormFieldType) => {
    if (!selectedTemplateId) {
      setToast({ kind: "error", message: "Enregistre d'abord le formulaire avant d'ajouter une question." });
      return;
    }

    const nextOrder = (selectedFields.at(-1)?.order_index ?? 0) + 10;
    const newField = buildNewField(selectedTemplateId, type, nextOrder);
    replaceTemplateFields([...selectedFields, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleSaveField = (field: FormField) => {
    if (!selectedTemplateId) return;

    startTransition(async () => {
      const response = await saveFormField({
        id: field.id.startsWith("draft-") ? undefined : field.id,
        form_template_id: selectedTemplateId,
        key: field.key,
        label: field.label,
        helper_text: field.helper_text ?? "",
        placeholder: field.placeholder ?? "",
        field_type: field.field_type,
        required: field.required,
        options: field.options,
        width: "full",
        order_index: field.order_index,
      });

      if (!("success" in response) || !response.field) {
        setToast({ kind: "error", message: response.error ?? "Impossible d'enregistrer la question." });
        return;
      }

      const savedField = response.field;
      replaceTemplateFields(
        selectedFields.map((item) => (item.id === field.id || item.id === savedField.id ? savedField : item))
      );
      setSelectedFieldId(savedField.id);
      setToast({ kind: "success", message: "Question enregistrée." });
    });
  };

  const handleDeleteField = (field: FormField) => {
    if (field.id.startsWith("draft-")) {
      replaceTemplateFields(selectedFields.filter((item) => item.id !== field.id));
      setSelectedFieldId(null);
      return;
    }

    startTransition(async () => {
      const response = await deleteFormField(field.id);
      if (!("success" in response)) {
        setToast({ kind: "error", message: response.error ?? "Impossible de supprimer la question." });
        return;
      }

      replaceTemplateFields(selectedFields.filter((item) => item.id !== field.id));
      setSelectedFieldId(null);
      setToast({ kind: "success", message: "Question supprimée." });
    });
  };

  const handleDuplicateField = (field: FormField) => {
    if (!selectedTemplateId) return;

    const duplicate: FormField = {
      ...field,
      id: `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      key: "",
      label: `${field.label} copie`,
      order_index: (selectedFields.at(-1)?.order_index ?? 0) + 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    replaceTemplateFields([...selectedFields, duplicate]);
    setSelectedFieldId(duplicate.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = selectedFields.findIndex((field) => field.id === active.id);
    const newIndex = selectedFields.findIndex((field) => field.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(selectedFields, oldIndex, newIndex).map((field, index) => ({
      ...field,
      order_index: (index + 1) * 10,
      updated_at: new Date().toISOString(),
    }));

    replaceTemplateFields(reordered);

    const persistedIds = reordered.filter((field) => !field.id.startsWith("draft-")).map((field) => field.id);
    if (persistedIds.length === 0 || !selectedTemplateId) return;

    startTransition(async () => {
      const response = await saveFormFieldOrder({
        form_template_id: selectedTemplateId,
        field_ids: persistedIds,
      });

      if (!("success" in response)) {
        setToast({ kind: "error", message: response.error ?? "Impossible de sauvegarder le nouvel ordre." });
      }
    });
  };

  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Cette page est réservée à l'administration.
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        La section Formulaires n'est pas prête: {setupError}. Recharge après avoir appliqué les migrations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.kind === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-[30px] border bg-white p-5 shadow-sm" style={{ borderColor: DS.line }}>
            <div className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ backgroundColor: "#f8fbfd" }}>
              <img src="/logo-ds.svg" alt="Diploma Santé" className="h-8 w-auto object-contain" />
              <div className="leading-tight">
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: DS.gold }}>Diploma Santé</p>
                <p className="text-sm font-medium" style={{ color: DS.navy }}>Formulaires</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddTemplate}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: DS.navy }}
            >
              <Plus className="h-4 w-4" />
              Créer un formulaire
            </button>

            <div className="mt-4 rounded-[24px] border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: "#eef6fb", color: DS.navy }}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: DS.navy }}>Portée du formulaire</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "#61778a" }}>
                    Tu peux viser une formation entière, une fac, une classe, un élève ou un groupe d'élèves précis.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {FORM_TARGET_OPTIONS.map((option) => {
                  const active = option.value === templateDraft.target_type;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTemplateDraft((current) => ({ ...current, target_type: option.value }))}
                      className="w-full rounded-2xl border px-3 py-3 text-left transition"
                      style={{
                        borderColor: active ? DS.blue : DS.line,
                        backgroundColor: active ? "#f7fbfe" : "#ffffff",
                      }}
                    >
                      <p className="text-sm font-semibold" style={{ color: DS.navy }}>{option.label}</p>
                      <p className="mt-1 text-xs leading-5" style={{ color: "#61778a" }}>{option.hint}</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-3">
                {templateDraft.target_type === "offer" && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium" style={{ color: DS.navy }}>Formation</span>
                    <select
                      value={templateDraft.target_offer_code ?? ""}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, target_offer_code: event.target.value || null }))}
                      className="h-12 w-full rounded-2xl border bg-white px-4 text-sm outline-none"
                      style={{ borderColor: DS.line, color: DS.navy }}
                    >
                      <option value="">Sélectionner une formation</option>
                      {offerDossiers.map((offer) => (
                        <option key={offer.id} value={offer.formation_offer ?? offer.id}>
                          {offer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {templateDraft.target_type === "university" && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium" style={{ color: DS.navy }}>Fac</span>
                    <select
                      value={templateDraft.target_university_dossier_id ?? ""}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, target_university_dossier_id: event.target.value || null }))}
                      className="h-12 w-full rounded-2xl border bg-white px-4 text-sm outline-none"
                      style={{ borderColor: DS.line, color: DS.navy }}
                    >
                      <option value="">Sélectionner une fac</option>
                      {universityDossiers.map((university) => (
                        <option key={university.id} value={university.id}>
                          {university.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {templateDraft.target_type === "groupe" && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium" style={{ color: DS.navy }}>Classe</span>
                    <select
                      value={templateDraft.target_groupe_id ?? ""}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, target_groupe_id: event.target.value || null }))}
                      className="h-12 w-full rounded-2xl border bg-white px-4 text-sm outline-none"
                      style={{ borderColor: DS.line, color: DS.navy }}
                    >
                      <option value="">Sélectionner une classe</option>
                      {initialGroupes.map((groupe) => (
                        <option key={groupe.id} value={groupe.id}>
                          {groupe.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {templateDraft.target_type === "student" && (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium" style={{ color: DS.navy }}>Élève</span>
                    <select
                      value={templateDraft.target_student_id ?? ""}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, target_student_id: event.target.value || null }))}
                      className="h-12 w-full rounded-2xl border bg-white px-4 text-sm outline-none"
                      style={{ borderColor: DS.line, color: DS.navy }}
                    >
                      <option value="">Sélectionner un élève</option>
                      {initialStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {profileName(student)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {templateDraft.target_type === "selection" && (
                  <div className="space-y-3">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium" style={{ color: DS.navy }}>Rechercher des élèves</span>
                      <div className="flex h-12 items-center gap-3 rounded-2xl border bg-white px-4" style={{ borderColor: DS.line }}>
                        <Search className="h-4 w-4" style={{ color: "#8aa3b6" }} />
                        <input
                          value={studentSearch}
                          onChange={(event) => setStudentSearch(event.target.value)}
                          placeholder="Tape un nom ou un email"
                          className="w-full bg-transparent text-sm outline-none"
                          style={{ color: DS.navy }}
                        />
                      </div>
                    </label>

                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                      {filteredStudents.map((student) => {
                        const checked = templateDraft.target_student_ids.includes(student.id);
                        return (
                          <label
                            key={student.id}
                            className="flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm"
                            style={{ borderColor: checked ? DS.blue : DS.line, backgroundColor: checked ? "#f7fbfe" : "#ffffff" }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setTemplateDraft((current) => ({
                                  ...current,
                                  target_student_ids: event.target.checked
                                    ? [...current.target_student_ids, student.id]
                                    : current.target_student_ids.filter((id) => id !== student.id),
                                }));
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                              style={{ accentColor: DS.blue }}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium" style={{ color: DS.navy }}>{profileName(student)}</p>
                              <p className="truncate text-xs" style={{ color: "#61778a" }}>{student.email}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: DS.gold }}>Portée actuelle</p>
              <p className="mt-2 text-sm font-semibold" style={{ color: DS.navy }}>{draftTargetSummary}</p>
              <p className="mt-1 text-xs" style={{ color: "#61778a" }}>
                {templateDraft.is_active ? "Le formulaire est actif et prêt à être utilisé." : "Le formulaire est archivé pour le moment."}
              </p>
            </div>
          </section>

          <section className="rounded-[30px] border bg-white p-5 shadow-sm" style={{ borderColor: DS.line }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: DS.navy }}>Bibliothèque</p>
                <p className="mt-1 text-xs" style={{ color: "#61778a" }}>Historique des formulaires créés et déjà en place.</p>
              </div>
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: "#eef6fb", color: DS.navy }}>
                {templates.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {!selectedTemplateId && (
                <div
                  className="rounded-[24px] border p-4"
                  style={{
                    borderColor: DS.blue,
                    backgroundColor: "#f7fbfe",
                    boxShadow: "0 0 0 2px rgba(79,171,219,0.16)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: DS.navy }}>
                        {templateDraft.title || "Nouveau formulaire"}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "#61778a" }}>{draftTargetSummary}</p>
                    </div>
                    <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: DS.goldSoft, color: DS.navy }}>
                      Brouillon
                    </span>
                  </div>
                </div>
              )}

              {templates.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-[#61778a]" style={{ borderColor: DS.line }}>
                  Aucun formulaire pour le moment.
                </div>
              ) : (
                templates.map((template) => {
                  const active = template.id === selectedTemplateId;
                  const templateCount = initialResponses.filter((response) => response.form_template_id === template.id).length;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className="w-full rounded-[24px] border p-4 text-left transition"
                      style={{
                        borderColor: active ? DS.blue : DS.line,
                        backgroundColor: active ? "#f7fbfe" : "#ffffff",
                        boxShadow: active ? "0 0 0 2px rgba(79,171,219,0.16)" : "none",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold" style={{ color: DS.navy }}>{template.title}</p>
                          <p className="mt-1 text-xs" style={{ color: "#61778a" }}>
                            {getTemplateTargetSummary(template, { offerDossiers, dossierById, groupeById, studentById })}
                          </p>
                          <p className="mt-2 text-[11px]" style={{ color: "#90a2b4" }}>
                            Mis à jour le {formatDateTime(template.updated_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: template.is_active ? "#eef6fb" : "#f3f4f6", color: template.is_active ? DS.navy : "#667085" }}>
                            {template.is_active ? "Actif" : "Archivé"}
                          </span>
                          <p className="mt-2 text-[11px] font-semibold" style={{ color: DS.navy }}>{templateCount} réponse(s)</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </aside>

        <section className="overflow-hidden rounded-[30px] border shadow-sm" style={{ borderColor: DS.line, backgroundColor: DS.bg }}>
          <div className="border-b bg-white px-5 py-4" style={{ borderColor: DS.line }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: DS.gold }}>Section Formulaires</p>
                <p className="mt-1 text-sm" style={{ color: "#61778a" }}>
                  Crée, cible, archive et analyse tous tes formulaires depuis un seul espace.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowStudentPreview((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
                  style={{ borderColor: DS.line, color: DS.navy }}
                >
                  {showStudentPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showStudentPreview ? "Masquer l'aperçu élève" : "Voir l'aperçu élève"}
                </button>

                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={isPending || !templateDraft.title.trim()}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: DS.navy }}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 py-6 lg:px-8 xl:px-10">
            <div className="mx-auto max-w-[1700px] space-y-6">
              <div className="rounded-[28px] border border-t-[10px] bg-white p-6 shadow-[0_18px_40px_rgba(18,49,77,0.08)]" style={{ borderColor: DS.line, borderTopColor: DS.navy }}>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr),minmax(320px,0.7fr)]">
                  <div>
                    <input
                      value={templateDraft.title}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Titre du formulaire"
                      className="w-full border-none bg-transparent text-3xl font-semibold outline-none"
                      style={{ color: DS.navy }}
                    />
                    <textarea
                      rows={2}
                      value={templateDraft.description}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Description du formulaire"
                      className="mt-3 w-full resize-none border-none bg-transparent text-sm leading-6 outline-none"
                      style={{ color: "#5f7183" }}
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" style={{ color: DS.navy }}>
                      <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: "#eef6fb" }}>{stats.total} question(s)</span>
                      <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: DS.goldSoft, color: DS.navy }}>{stats.required} obligatoire(s)</span>
                      <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: "#eef6fb" }}>{responseStats.total} réponse(s)</span>
                    </div>
                  </div>

                  <div className="rounded-[24px] border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: DS.gold }}>Pilotage</p>
                        <p className="mt-1 text-sm" style={{ color: "#61778a" }}>
                          Le formulaire est rattaché à un usage et à une audience bien définie.
                        </p>
                      </div>

                      <label className="block space-y-2">
                        <span className="text-sm font-medium" style={{ color: DS.navy }}>Usage</span>
                        <select
                          value={selectedContextValue}
                          onChange={(event) =>
                            setTemplateDraft((current) => ({
                              ...current,
                              context: event.target.value === "autre" ? current.context || "" : event.target.value,
                            }))
                          }
                          className="h-12 w-full rounded-2xl border bg-white px-4 text-sm outline-none"
                          style={{ borderColor: DS.line, color: DS.navy }}
                        >
                          {FORM_CONTEXT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {isCustomContext && (
                        <label className="block space-y-2">
                          <span className="text-sm font-medium" style={{ color: DS.navy }}>Autre usage</span>
                          <input
                            value={templateDraft.context}
                            onChange={(event) => setTemplateDraft((current) => ({ ...current, context: event.target.value }))}
                            placeholder="Ex: Pré-rentrée médecine"
                            className="h-12 w-full rounded-2xl border bg-white px-4 text-sm outline-none"
                            style={{ borderColor: DS.line, color: DS.navy }}
                          />
                        </label>
                      )}

                      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: DS.line, backgroundColor: "#ffffff" }}>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: DS.gold }}>Audience visée</p>
                        <p className="mt-2 text-sm font-semibold" style={{ color: DS.navy }}>{draftTargetSummary}</p>
                      </div>

                      <label className="inline-flex items-center gap-3 text-sm font-medium" style={{ color: DS.navy }}>
                        <input
                          type="checkbox"
                          checked={templateDraft.is_active}
                          onChange={(event) => setTemplateDraft((current) => ({ ...current, is_active: event.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 focus:ring-0"
                          style={{ accentColor: DS.blue }}
                        />
                        Formulaire actif
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {showStudentPreview && (
                <StudentPreviewCard
                  title={templateDraft.title}
                  description={templateDraft.description}
                  fields={selectedFields}
                />
              )}

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr),360px]">
                <div className="space-y-5">
                  <div className="rounded-[30px] border bg-white p-5 shadow-sm" style={{ borderColor: DS.line }}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: DS.navy }}>Questions</p>
                        <p className="mt-1 text-xs" style={{ color: "#61778a" }}>
                          Construis le formulaire comme un vrai parcours élève, question par question.
                        </p>
                      </div>
                      <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: "#eef6fb", color: DS.navy }}>
                        {stats.total} bloc(s)
                      </span>
                    </div>

                    <div className="relative">
                      {selectedFields.length === 0 ? (
                        <div className="rounded-[28px] border-2 border-dashed bg-white/70 p-12 text-center" style={{ borderColor: "#ddd2b8" }}>
                          <p className="text-sm text-[#7c7664]">
                            Commence par enregistrer ce formulaire, puis ajoute ta première question.
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowAddMenu((current) => !current)}
                            disabled={!selectedTemplateId}
                            className="mx-auto mt-6 inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ backgroundColor: DS.navy }}
                          >
                            <Plus className="h-6 w-6" />
                          </button>

                          {showAddMenu && selectedTemplateId && (
                            <div className="mx-auto mt-4 max-w-sm rounded-[24px] border bg-white p-3 text-left shadow-sm" style={{ borderColor: DS.line }}>
                              <div className="space-y-2">
                                {FIELD_LIBRARY.map((item) => (
                                  <button
                                    key={item.type}
                                    type="button"
                                    onClick={() => {
                                      handleAddField(item.type);
                                      setShowAddMenu(false);
                                    }}
                                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition hover:bg-[#f7fbfe]"
                                    style={{ color: DS.navy }}
                                  >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: "#eef6fb" }}>
                                      {item.icon}
                                    </span>
                                    {item.title}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={selectedFields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-4">
                                {selectedFields.map((field, index) => (
                                  <SortableQuestionCard
                                    key={field.id}
                                    field={field}
                                    index={index + 1}
                                    isSelected={field.id === selectedFieldId}
                                    isPending={isPending}
                                    onSelect={() => setSelectedFieldId(field.id)}
                                    onChange={(patch) => updateFieldById(field.id, patch)}
                                    onSave={() => handleSaveField(field)}
                                    onDuplicate={() => handleDuplicateField(field)}
                                    onDelete={() => handleDeleteField(field)}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>

                          <div className="flex justify-center pt-2">
                            <div className="relative flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setShowAddMenu((current) => !current)}
                                disabled={!selectedTemplateId}
                                className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_14px_34px_rgba(18,49,77,0.24)] transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ backgroundColor: DS.navy }}
                                title="Ajouter une question"
                              >
                                <Plus className="h-6 w-6" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const lastField = selectedFields.at(-1);
                                  if (lastField) {
                                    handleDuplicateField(lastField);
                                  }
                                }}
                                disabled={selectedFields.length === 0}
                                className="flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ borderColor: DS.line, color: DS.navy }}
                                title="Dupliquer la dernière question"
                              >
                                <Copy className="h-5 w-5" />
                              </button>

                              {showAddMenu && selectedTemplateId && (
                                <div className="absolute bottom-16 left-1/2 z-20 w-64 -translate-x-1/2 rounded-[24px] border bg-white p-3 shadow-[0_24px_50px_rgba(18,49,77,0.18)]" style={{ borderColor: DS.line }}>
                                  <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: DS.gold }}>
                                    Nouvelle question
                                  </p>
                                  <div className="space-y-2">
                                    {FIELD_LIBRARY.map((item) => (
                                      <button
                                        key={item.type}
                                        type="button"
                                        onClick={() => {
                                          handleAddField(item.type);
                                          setShowAddMenu(false);
                                        }}
                                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition hover:bg-[#f7fbfe]"
                                        style={{ color: DS.navy }}
                                      >
                                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: "#eef6fb" }}>
                                          {item.icon}
                                        </span>
                                        {item.title}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <aside className="space-y-5">
                  <div className="rounded-[30px] border bg-white p-5 shadow-sm" style={{ borderColor: DS.line }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: "#eef6fb", color: DS.navy }}>
                        <History className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: DS.navy }}>Historique</p>
                        <p className="mt-1 text-xs" style={{ color: "#61778a" }}>Vision rapide de la vie du formulaire.</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
                        <p className="text-xs uppercase tracking-[0.14em]" style={{ color: DS.gold }}>Réponses reçues</p>
                        <p className="mt-2 text-2xl font-semibold" style={{ color: DS.navy }}>{responseStats.total}</p>
                      </div>
                      <div className="rounded-2xl border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
                        <p className="text-xs uppercase tracking-[0.14em]" style={{ color: DS.gold }}>Dernière réponse</p>
                        <p className="mt-2 text-sm font-semibold" style={{ color: DS.navy }}>{formatDateTime(responseStats.latestSubmittedAt)}</p>
                      </div>
                      <div className="rounded-2xl border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
                        <p className="text-xs uppercase tracking-[0.14em]" style={{ color: DS.gold }}>Audience</p>
                        <p className="mt-2 text-sm font-semibold" style={{ color: DS.navy }}>{draftTargetSummary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[30px] border bg-white p-5 shadow-sm" style={{ borderColor: DS.line }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: "#eef6fb", color: DS.navy }}>
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: DS.navy }}>Réponses récentes</p>
                        <p className="mt-1 text-xs" style={{ color: "#61778a" }}>Pour l'instant, l'historique reprend les formulaires déjà remplis côté coaching.</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {templateResponses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: DS.line, color: "#61778a" }}>
                          Aucune réponse enregistrée pour ce formulaire.
                        </div>
                      ) : (
                        templateResponses.slice(0, 6).map((response) => (
                          <div key={response.id} className="rounded-2xl border p-4" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold" style={{ color: DS.navy }}>
                                  {profileName(response.student)}
                                </p>
                                <p className="mt-1 truncate text-xs" style={{ color: "#61778a" }}>
                                  {response.groupe?.name ?? "Sans classe renseignée"}
                                </p>
                              </div>
                              <span className="text-[11px] font-medium" style={{ color: "#90a2b4" }}>
                                {formatDateTime(response.submitted_at)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-[30px] border bg-white p-5 shadow-sm" style={{ borderColor: DS.line }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: "#eef6fb", color: DS.navy }}>
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: DS.navy }}>Résumé opérationnel</p>
                        <p className="mt-1 text-xs" style={{ color: "#61778a" }}>
                          Le formulaire est actuellement rangé dans l'usage {getContextLabel(templateDraft.context)}.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border p-4 text-sm leading-6" style={{ borderColor: DS.line, backgroundColor: "#fbfdff", color: "#61778a" }}>
                      Utilise cette colonne pour savoir à qui le formulaire s'adresse, combien de réponses sont déjà arrivées, et quand il a été utilisé pour la dernière fois.
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SortableQuestionCard({
  field,
  index,
  isSelected,
  isPending,
  onSelect,
  onChange,
  onSave,
  onDuplicate,
  onDelete,
}: {
  field: FormField;
  index: number;
  isSelected: boolean;
  isPending: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<FormField>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-[24px] border bg-white shadow-[0_12px_30px_rgba(18,49,77,0.06)] ${
        isSelected ? "ring-2" : ""
      } ${isDragging ? "opacity-70" : ""}`}
      style={{
        ...style,
        borderColor: isSelected ? DS.blue : DS.line,
        boxShadow: isSelected ? "0 0 0 2px rgba(79,171,219,0.22)" : undefined,
      }}
    >
      <div className="flex items-start gap-4 p-5">
        <button
          type="button"
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold"
          style={{ backgroundColor: "#eef6fb", color: DS.navy }}
          onClick={onSelect}
        >
          {index}
        </button>

        <div className="min-w-0 flex-1">
          {isSelected ? (
            <QuestionEditorCard
              field={field}
              isPending={isPending}
              onChange={onChange}
              onSave={onSave}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              dragHandle={
                <button
                  type="button"
                  className="rounded-xl p-2 transition hover:bg-[#eef6fb]"
                  style={{ color: "#8aa3b6" }}
                  {...attributes}
                  {...listeners}
                  title="Glisser pour réordonner"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              }
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={onSelect}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect();
                }
              }}
              className="w-full cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e2a3a]">
                    {getFieldIcon(field.field_type)}
                    {field.label}
                  </span>
                  {field.required && (
                      <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: DS.goldSoft, color: DS.navy }}>
                        Obligatoire
                      </span>
                    )}
                  </div>
                  {field.helper_text && <p className="mt-2 text-sm leading-6 text-[#7c7664]">{field.helper_text}</p>}
                </div>

                <button
                  type="button"
                  className="rounded-xl p-2 transition hover:bg-[#eef6fb]"
                  style={{ color: "#8aa3b6" }}
                  {...attributes}
                  {...listeners}
                  title="Glisser pour réordonner"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4">
                <FieldPreview field={field} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionEditorCard({
  field,
  isPending,
  onChange,
  onSave,
  onDuplicate,
  onDelete,
  dragHandle,
}: {
  field: FormField;
  isPending: boolean;
  onChange: (patch: Partial<FormField>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  dragHandle: React.ReactNode;
}) {
  const optionFields = getFieldOptions(field);

  const updateOption = (index: number, value: string) => {
    const nextOptions = [...optionFields];
    nextOptions[index] = value;
    onChange({ options: nextOptions });
  };

  const removeOption = (index: number) => {
    onChange({ options: optionFields.filter((_, itemIndex) => itemIndex !== index) });
  };

  const addOption = () => {
    onChange({ options: [...optionFields, `Option ${optionFields.length + 1}`] });
  };

  const isChoiceField = ["radio", "checkboxes", "select"].includes(field.field_type);

  return (
    <div className="mt-5 rounded-[20px] border p-5" style={{ borderColor: DS.line, backgroundColor: "#fbfdff" }}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: DS.navy }}>
              {getFieldIcon(field.field_type)}
              Question
            </span>
            {field.required && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: DS.goldSoft, color: DS.navy }}>
                Obligatoire
              </span>
            )}
          </div>
          {dragHandle}
        </div>

        <div className="space-y-3">
          <input
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="Question sans titre"
            className="w-full border-0 border-b-2 bg-transparent px-1 py-3 text-[1.7rem] font-semibold outline-none"
            style={{ borderColor: DS.blueSoft, color: DS.navy }}
          />

          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: DS.gold }}>
              Description facultative
            </div>
            <input
              value={field.helper_text ?? ""}
              onChange={(event) => onChange({ helper_text: event.target.value })}
              placeholder="Ajoute une précision sous la question si besoin"
              className="w-full border-0 border-b bg-transparent px-1 py-2 text-sm outline-none"
              style={{ borderColor: DS.line, color: "#61778a" }}
            />
          </div>

          <FieldTypePicker
            value={field.field_type}
            onChange={(nextType) =>
              onChange({
                field_type: nextType,
                options: ["radio", "checkboxes", "select"].includes(nextType)
                  ? (optionFields.length > 0 ? optionFields : ["Option 1", "Option 2"])
                  : [],
              })
            }
          />
        </div>

        {isChoiceField ? (
          <div className="space-y-1">
            {optionFields.map((option, index) => (
              <div key={`${field.id}-option-${index}`} className="flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-[#f7fbfe]">
                <span className="w-7 text-center text-base" style={{ color: "#88a0b0" }}>
                  {getFieldTypeSymbol(field.field_type)}
                </span>
                <input
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1 border-0 border-b bg-transparent px-1 py-3 text-sm outline-none"
                  style={{ borderColor: DS.line, color: DS.navy }}
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="rounded-xl p-2 text-[#b55a58] transition hover:bg-red-50"
                  title="Supprimer l'option"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm font-medium transition hover:bg-[#eef6fb]"
              style={{ color: DS.blue }}
            >
              <Plus className="h-4 w-4" />
              Ajouter une option
            </button>
          </div>
        ) : (
          <input
            value={field.placeholder ?? ""}
            onChange={(event) => onChange({ placeholder: event.target.value })}
            placeholder="Texte de reponse"
            className="w-full border-0 border-b bg-transparent px-1 py-3 text-sm outline-none"
            style={{ borderColor: DS.line, color: "#61778a" }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: DS.line }}>
          <label className="inline-flex items-center gap-3 text-sm font-medium" style={{ color: DS.navy }}>
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => onChange({ required: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300 focus:ring-0"
              style={{ accentColor: DS.blue }}
            />
            Question obligatoire
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 text-sm font-medium transition hover:bg-[#f7fbfe]"
              style={{ borderColor: DS.line, color: DS.navy }}
            >
              <Copy className="h-4 w-4" />
              Dupliquer
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isPending || !field.label.trim()}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: DS.navy }}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldTypePicker({
  value,
  onChange,
}: {
  value: FormFieldType;
  onChange: (type: FormFieldType) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: DS.gold }}>
        Type de reponse
      </div>
      <div className="flex flex-wrap gap-2">
        {FIELD_LIBRARY.map((item) => {
          const active = item.type === value;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onChange(item.type)}
              className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition"
              style={{
                borderColor: active ? DS.blue : DS.line,
                backgroundColor: active ? "#eef6fb" : "#ffffff",
                color: DS.navy,
              }}
            >
              {item.icon}
              {item.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StudentPreviewCard({
  title,
  description,
  fields,
}: {
  title: string;
  description: string;
  fields: FormField[];
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_34%),linear-gradient(135deg,_#0f1e36_0%,_#12314d_48%,_#1f5d84_100%)] p-6 text-white shadow-sm">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d3ab67]">Aperçu élève</p>
            <h3 className="mt-2 text-2xl font-semibold">{title || "Titre du formulaire"}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              {description || "Voici comment le formulaire apparaîtra côté élève."}
            </p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
            Vue lecture seule
          </span>
        </div>

        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
          {fields.length === 0 ? (
            <div className="rounded-[24px] border-2 border-dashed border-white/15 p-8 text-center text-sm text-white/65">
              Ajoute des questions pour voir l’aperçu élève.
            </div>
          ) : (
            fields.map((field, index) => <StudentPreviewQuestion key={field.id} field={field} index={index + 1} />)
          )}
        </div>
      </div>
    </section>
  );
}

function StudentPreviewQuestion({
  field,
  index,
}: {
  field: FormField;
  index: number;
}) {
  const options = getFieldOptions(field);

  return (
    <div className="rounded-[24px] border border-white/10 bg-white p-5 text-[#12314d] shadow-[0_1px_0_rgba(15,30,54,0.04)]">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#12314d] text-sm font-semibold text-white">
          {index}
        </div>
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-lg font-semibold">{field.label}</h4>
            {field.required && (
              <span className="rounded-full bg-[#f5ecdd] px-2.5 py-1 text-[11px] font-semibold text-[#12314d]">
                Obligatoire
              </span>
            )}
          </div>
          {field.helper_text && <p className="mt-2 text-sm leading-6 text-[#61778a]">{field.helper_text}</p>}

          <div className="mt-5">
            {field.field_type === "select" ? (
              <select
                disabled
                className="h-14 w-full rounded-3xl border border-[#d8e3eb] bg-white px-5 text-sm text-[#61778a] outline-none"
              >
                <option>Selectionner une reponse</option>
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.field_type === "radio" ? (
              <div className="flex flex-wrap gap-3">
                {options.map((option) => (
                  <div
                    key={option}
                    className="rounded-2xl border border-[#d8e3eb] bg-white px-4 py-3 text-sm font-medium text-[#12314d]"
                  >
                    {option}
                  </div>
                ))}
              </div>
            ) : field.field_type === "checkboxes" ? (
              <div className="space-y-3">
                {options.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 rounded-2xl border border-[#d8e3eb] bg-white px-4 py-3 text-sm text-[#12314d]"
                  >
                    <input type="checkbox" disabled className="h-4 w-4 rounded border-gray-300" />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : field.field_type === "long_text" ? (
              <textarea
                rows={5}
                disabled
                placeholder={field.placeholder ?? ""}
                className="w-full rounded-3xl border border-[#d8e3eb] bg-white px-5 py-4 text-sm leading-6 text-[#61778a] outline-none"
              />
            ) : (
              <input
                disabled
                placeholder={field.placeholder ?? ""}
                className="h-14 w-full rounded-3xl border border-[#d8e3eb] bg-white px-5 text-sm text-[#61778a] outline-none"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldPreview({ field }: { field: FormField }) {
  if (["select", "radio", "checkboxes"].includes(field.field_type)) {
    const options = getFieldOptions(field);
    return (
      <div className="space-y-2">
        {options.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-4 py-3 text-sm" style={{ borderColor: DS.line, color: "#7f93a1" }}>
            Ajoute des options
          </div>
        ) : (
          options.map((option) => (
            <div key={option} className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm" style={{ borderColor: DS.line, color: DS.navy }}>
              <span className="w-5 text-center" style={{ color: "#88a0b0" }}>
                {getFieldTypeSymbol(field.field_type)}
              </span>
              <span>{option}</span>
            </div>
          ))
        )}
      </div>
    );
  }

  if (field.field_type === "long_text") {
    return (
      <div className="rounded-2xl border bg-white px-4 py-4 text-sm" style={{ borderColor: DS.line, color: "#7f93a1" }}>
        {field.placeholder || "Réponse longue..."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white px-4 py-3 text-sm" style={{ borderColor: DS.line, color: "#7f93a1" }}>
      {field.placeholder || "Réponse courte..."}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Grip,
  LayoutTemplate,
  ListChecks,
  Loader2,
  PencilRuler,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import { deleteFormField, saveFormField, saveFormTemplate } from "@/app/(admin)/admin/configuration/actions";
import { FORM_FIELD_TYPE_LABELS, getFieldOptions } from "@/lib/form-builder";
import type { FormField, FormFieldType, FormFieldWidth, FormTemplate, Profile } from "@/types/database";

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
  is_active: boolean;
};

type FieldLibraryItem = {
  type: FormFieldType;
  title: string;
  description: string;
  icon: React.ReactNode;
};

const FIELD_LIBRARY: FieldLibraryItem[] = [
  {
    type: "short_text",
    title: "Réponse courte",
    description: "Une ligne simple pour capter une info rapide.",
    icon: <Type className="h-4 w-4" />,
  },
  {
    type: "long_text",
    title: "Paragraphe",
    description: "Une grande zone de texte pour une réponse développée.",
    icon: <PencilRuler className="h-4 w-4" />,
  },
  {
    type: "select",
    title: "Choix simple",
    description: "Un ensemble d'options où l'élève choisit une seule réponse.",
    icon: <ListChecks className="h-4 w-4" />,
  },
];

function templateToDraft(template?: FormTemplate | null): TemplateDraft {
  return {
    id: template?.id,
    slug: template?.slug ?? "",
    title: template?.title ?? "",
    description: template?.description ?? "",
    context: template?.context ?? "generic",
    is_active: template?.is_active ?? true,
  };
}

function buildNewField(formTemplateId: string, type: FormFieldType, orderIndex: number): FormField {
  const timestamp = new Date().toISOString();
  const baseLabel =
    type === "short_text" ? "Nouvelle question courte" :
    type === "long_text" ? "Nouvelle question paragraphe" :
    "Nouveau choix";

  return {
    id: `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    form_template_id: formTemplateId,
    key: "",
    label: baseLabel,
    helper_text: "",
    placeholder: "",
    field_type: type,
    required: false,
    options: type === "select" ? ["Option 1", "Option 2"] : [],
    width: "full",
    order_index: orderIndex,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function sortFields(fields: FormField[]) {
  return [...fields].sort((a, b) => a.order_index - b.order_index);
}

function getFieldIcon(type: FormFieldType) {
  if (type === "long_text") return <PencilRuler className="h-4 w-4" />;
  if (type === "select") return <ListChecks className="h-4 w-4" />;
  return <Type className="h-4 w-4" />;
}

export function ConfigurationShell({
  currentProfile,
  initialTemplates,
  initialFields,
  setupError,
}: {
  currentProfile: Profile;
  initialTemplates: FormTemplate[];
  initialFields: FormField[];
  setupError?: string | null;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [fields, setFields] = useState(initialFields);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplates[0]?.id ?? "");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(templateToDraft(initialTemplates[0] ?? null));
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const canAccess = ["admin", "superadmin"].includes(currentProfile.role);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  const selectedFields = useMemo(
    () => sortFields(fields.filter((field) => field.form_template_id === selectedTemplateId)),
    [fields, selectedTemplateId]
  );

  const selectedField = selectedFields.find((field) => field.id === selectedFieldId) ?? null;

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    setTemplateDraft(templateToDraft(selectedTemplate));
  }, [selectedTemplate?.id]);

  useEffect(() => {
    if (!selectedFieldId || !selectedFields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(selectedFields[0]?.id ?? null);
    }
  }, [selectedFieldId, selectedFields]);

  const templateStats = useMemo(() => {
    return {
      total: selectedFields.length,
      required: selectedFields.filter((field) => field.required).length,
      halfWidth: selectedFields.filter((field) => field.width === "half").length,
    };
  }, [selectedFields]);

  const upsertFieldLocally = (field: FormField) => {
    setFields((current) => {
      const withoutCurrent = current.filter((item) => item.id !== field.id);
      return sortFields([...withoutCurrent, field]);
    });
    setSelectedFieldId(field.id);
  };

  const handleSaveTemplate = () => {
    startTransition(async () => {
      const response = await saveFormTemplate(templateDraft);
      if (!("success" in response)) {
        setToast({ kind: "error", message: response.error ?? "Impossible d'enregistrer le formulaire." });
        return;
      }

      const savedTemplate = response.template;
      if (!savedTemplate) {
        setToast({ kind: "error", message: "Formulaire non retourné par le serveur." });
        return;
      }

      setTemplates((current) => {
        const withoutCurrent = current.filter((template) => template.id !== savedTemplate.id);
        return [...withoutCurrent, savedTemplate].sort((a, b) => a.title.localeCompare(b.title));
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
      is_active: true,
    });
  };

  const handleAddField = (type: FormFieldType) => {
    if (!selectedTemplateId) {
      setToast({ kind: "error", message: "Enregistre d'abord le formulaire avant d'ajouter des champs." });
      return;
    }
    const nextOrder = (selectedFields.at(-1)?.order_index ?? 0) + 10;
    const newField = buildNewField(selectedTemplateId, type, nextOrder);
    upsertFieldLocally(newField);
  };

  const handleUpdateSelectedField = (patch: Partial<FormField>) => {
    if (!selectedField) return;
    upsertFieldLocally({
      ...selectedField,
      ...patch,
      updated_at: new Date().toISOString(),
    });
  };

  const handleMoveSelectedField = (direction: "up" | "down") => {
    if (!selectedField) return;
    const index = selectedFields.findIndex((field) => field.id === selectedField.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    const otherField = selectedFields[swapIndex];
    if (!otherField) return;

    const reordered = selectedFields.map((field) => {
      if (field.id === selectedField.id) return { ...field, order_index: otherField.order_index };
      if (field.id === otherField.id) return { ...field, order_index: selectedField.order_index };
      return field;
    });

    setFields((current) => {
      const unaffected = current.filter((field) => field.form_template_id !== selectedTemplateId);
      return sortFields([...unaffected, ...reordered]);
    });
  };

  const handleSaveSelectedField = () => {
    if (!selectedField || !selectedTemplateId) return;
    startTransition(async () => {
      const response = await saveFormField({
        id: selectedField.id.startsWith("draft-") ? undefined : selectedField.id,
        form_template_id: selectedTemplateId,
        key: selectedField.key,
        label: selectedField.label,
        helper_text: selectedField.helper_text ?? "",
        placeholder: selectedField.placeholder ?? "",
        field_type: selectedField.field_type,
        required: selectedField.required,
        options: selectedField.options,
        width: selectedField.width,
        order_index: selectedField.order_index,
      });

      if (!("success" in response)) {
        setToast({ kind: "error", message: response.error ?? "Impossible d'enregistrer le champ." });
        return;
      }

      const savedField = response.field;
      if (!savedField) {
        setToast({ kind: "error", message: "Champ non retourné par le serveur." });
        return;
      }

      setFields((current) => {
        const withoutDraft = current.filter((field) => field.id !== selectedField.id && field.id !== savedField.id);
        return sortFields([...withoutDraft, savedField]);
      });
      setSelectedFieldId(savedField.id);
      setToast({ kind: "success", message: "Champ enregistré." });
    });
  };

  const handleDeleteSelectedField = () => {
    if (!selectedField) return;
    if (selectedField.id.startsWith("draft-")) {
      setFields((current) => current.filter((field) => field.id !== selectedField.id));
      setSelectedFieldId(null);
      return;
    }

    startTransition(async () => {
      const response = await deleteFormField(selectedField.id);
      if (!("success" in response)) {
        setToast({ kind: "error", message: response.error ?? "Impossible de supprimer le champ." });
        return;
      }

      setFields((current) => current.filter((field) => field.id !== selectedField.id));
      setSelectedFieldId(null);
      setToast({ kind: "success", message: "Champ supprimé." });
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
        La configuration des formulaires n'est pas prête: {setupError}. Applique la migration
        <span className="mx-1 font-semibold">`024_form_builder_for_coaching.sql`</span>
        puis recharge la page.
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

      <section className="overflow-hidden rounded-[28px] border border-[#ddd8c9] bg-[#f7f3ea] shadow-sm">
        <div className="border-b border-[#e5decb] bg-[#fbf8f1] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d845f]">Form Builder</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#1e2a3a]">Construis tes formulaires comme un vrai canvas</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddTemplate}
                className="inline-flex items-center gap-2 rounded-xl border border-[#d7cfb8] bg-white px-4 py-2 text-sm font-medium text-[#514a35] transition hover:bg-[#f6f1e6]"
              >
                <Plus className="h-4 w-4" />
                Nouveau formulaire
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={isPending || !templateDraft.title.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#7a6d2e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6a5f27] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Enregistrer le formulaire
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-[760px] gap-0 xl:grid-cols-[280px,minmax(0,1fr),340px]">
          <aside className="border-r border-[#e5decb] bg-[#fbf8f1] p-5">
            <div className="rounded-2xl border border-[#e5decb] bg-white p-4">
              <div className="flex items-center gap-2 text-[#1e2a3a]">
                <LayoutTemplate className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Formulaires</h3>
              </div>
              <div className="mt-4 space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      template.id === selectedTemplateId
                        ? "border-[#7a6d2e] bg-[#f7f0d9]"
                        : "border-[#ece7d9] bg-white hover:border-[#d6cfbb]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#1e2a3a]">{template.title}</p>
                        <p className="mt-1 text-xs text-[#7c7664]">{template.slug}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${template.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {template.is_active ? "Actif" : "Off"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#e5decb] bg-white p-4">
              <div className="flex items-center gap-2 text-[#1e2a3a]">
                <Sparkles className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Blocs de question</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#7c7664]">
                Clique sur un bloc pour l’ajouter au formulaire actif.
              </p>
              <div className="mt-4 space-y-3">
                {FIELD_LIBRARY.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => handleAddField(item.type)}
                    className="w-full rounded-2xl border border-[#ece7d9] bg-[#fcfbf7] p-4 text-left transition hover:border-[#d3c8ad] hover:bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-[#f3eddc] p-2 text-[#7a6d2e]">{item.icon}</div>
                      <div>
                        <p className="text-sm font-semibold text-[#1e2a3a]">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[#7c7664]">{item.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="bg-[#f5f1e8] p-6">
            <div className="mx-auto max-w-3xl">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d845f]">Canvas</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#1e2a3a]">
                    {templateDraft.title || "Nouveau formulaire"}
                  </h3>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-[#e0d7c0] bg-white px-3 py-2 text-xs text-[#7c7664]">
                  <span>{templateStats.total} champ(s)</span>
                  <span className="h-1 w-1 rounded-full bg-[#c8b889]" />
                  <span>{templateStats.required} obligatoire(s)</span>
                </div>
              </div>

              <div className="rounded-[32px] border border-[#e2dac5] bg-white p-8 shadow-[0_20px_60px_rgba(60,50,30,0.08)]">
                <div className="border-b border-[#f0eadb] pb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d845f]">
                    {templateDraft.context || "generic"}
                  </p>
                  <h4 className="mt-3 text-3xl font-semibold text-[#1e2a3a]">
                    {templateDraft.title || "Titre du formulaire"}
                  </h4>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#7c7664]">
                    {templateDraft.description || "Ajoute une description claire pour guider l'élève avant qu'il commence à répondre."}
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  {selectedFields.length === 0 ? (
                    <div className="rounded-[28px] border-2 border-dashed border-[#e3dcc8] bg-[#fbf8f1] p-10 text-center text-sm text-[#7c7664]">
                      Ajoute un premier bloc depuis la colonne de gauche pour commencer ton formulaire.
                    </div>
                  ) : (
                    selectedFields.map((field, index) => (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() => setSelectedFieldId(field.id)}
                        className={`w-full rounded-[26px] border p-5 text-left transition ${
                          field.id === selectedFieldId
                            ? "border-[#7a6d2e] bg-[#fffaf0] shadow-[0_10px_24px_rgba(122,109,46,0.12)]"
                            : "border-[#eee7d7] bg-[#fcfbf7] hover:border-[#ddd1b4]"
                        } ${field.width === "half" ? "max-w-[calc(50%-8px)]" : ""}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#f3eddc] text-sm font-semibold text-[#7a6d2e]">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e2a3a]">
                                {getFieldIcon(field.field_type)}
                                {field.label}
                              </div>
                              {field.required && (
                                <span className="rounded-full bg-[#f7e9b4] px-2 py-1 text-[10px] font-semibold text-[#7a6d2e]">
                                  Obligatoire
                                </span>
                              )}
                            </div>
                            {field.helper_text && (
                              <p className="mt-2 text-sm leading-6 text-[#7c7664]">{field.helper_text}</p>
                            )}
                            <div className="mt-4">
                              <FieldPreview field={field} />
                            </div>
                          </div>
                          <div className="rounded-xl bg-white p-2 text-[#c0b48f]">
                            <Grip className="h-4 w-4" />
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-8">
                  <button
                    type="button"
                    className="rounded-2xl bg-[#547df0] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Soumettre
                  </button>
                </div>
              </div>
            </div>
          </main>

          <aside className="border-l border-[#e5decb] bg-[#fbf8f1] p-5">
            {!selectedField ? (
              <div className="rounded-2xl border border-[#e5decb] bg-white p-5">
                <div className="flex items-center gap-2 text-[#1e2a3a]">
                  <Settings2 className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Réglages du formulaire</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#7c7664]">
                  Sélectionne un formulaire ou un champ pour modifier ses propriétés.
                </p>

                <div className="mt-5 space-y-4">
                  <FieldLabel label="Titre">
                    <input
                      value={templateDraft.title}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))}
                      className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                    />
                  </FieldLabel>
                  <FieldLabel label="Slug">
                    <input
                      value={templateDraft.slug}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, slug: event.target.value }))}
                      className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                    />
                  </FieldLabel>
                  <FieldLabel label="Description">
                    <textarea
                      rows={5}
                      value={templateDraft.description}
                      onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))}
                      className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                    />
                  </FieldLabel>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#e5decb] bg-white p-5">
                  <div className="flex items-center gap-2 text-[#1e2a3a]">
                    <Settings2 className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Propriétés du champ</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#7c7664]">
                    Tu édites ici uniquement le bloc sélectionné au centre.
                  </p>

                  <div className="mt-5 space-y-4">
                    <FieldLabel label="Question">
                      <input
                        value={selectedField.label}
                        onChange={(event) => handleUpdateSelectedField({ label: event.target.value })}
                        className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                      />
                    </FieldLabel>

                    <FieldLabel label="Clé technique">
                      <input
                        value={selectedField.key}
                        onChange={(event) => handleUpdateSelectedField({ key: event.target.value })}
                        className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                      />
                    </FieldLabel>

                    <FieldLabel label="Texte d'aide">
                      <textarea
                        rows={3}
                        value={selectedField.helper_text ?? ""}
                        onChange={(event) => handleUpdateSelectedField({ helper_text: event.target.value })}
                        className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                      />
                    </FieldLabel>

                    <FieldLabel label="Placeholder">
                      <input
                        value={selectedField.placeholder ?? ""}
                        onChange={(event) => handleUpdateSelectedField({ placeholder: event.target.value })}
                        className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                      />
                    </FieldLabel>

                    <div className="grid gap-4 grid-cols-2">
                      <FieldLabel label="Type">
                        <select
                          value={selectedField.field_type}
                          onChange={(event) =>
                            handleUpdateSelectedField({
                              field_type: event.target.value as FormFieldType,
                              options: event.target.value === "select" ? (selectedField.options.length > 0 ? selectedField.options : ["Option 1", "Option 2"]) : [],
                            })
                          }
                          className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                        >
                          {Object.entries(FORM_FIELD_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </FieldLabel>

                      <FieldLabel label="Largeur">
                        <select
                          value={selectedField.width}
                          onChange={(event) => handleUpdateSelectedField({ width: event.target.value as FormFieldWidth })}
                          className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                        >
                          <option value="full">Pleine largeur</option>
                          <option value="half">Demi largeur</option>
                        </select>
                      </FieldLabel>
                    </div>

                    <div className="grid gap-4 grid-cols-2">
                      <FieldLabel label="Ordre">
                        <input
                          type="number"
                          value={selectedField.order_index}
                          onChange={(event) => handleUpdateSelectedField({ order_index: Number(event.target.value) })}
                          className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                        />
                      </FieldLabel>

                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-[#514a35]">Statut</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateSelectedField({ required: !selectedField.required })}
                          className={`inline-flex h-[50px] w-full items-center rounded-2xl px-4 text-sm font-medium ${
                            selectedField.required ? "bg-[#f7e9b4] text-[#7a6d2e]" : "bg-white border border-[#e3dcc8] text-[#6d6756]"
                          }`}
                        >
                          {selectedField.required ? "Obligatoire" : "Optionnel"}
                        </button>
                      </label>
                    </div>

                    {selectedField.field_type === "select" && (
                      <FieldLabel label="Options">
                        <textarea
                          rows={5}
                          value={selectedField.options.join("\n")}
                          onChange={(event) =>
                            handleUpdateSelectedField({
                              options: event.target.value
                                .split("\n")
                                .map((option) => option.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full rounded-2xl border border-[#e3dcc8] bg-white px-4 py-3 text-sm outline-none focus:border-[#7a6d2e]"
                        />
                      </FieldLabel>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e5decb] bg-white p-5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleMoveSelectedField("up")}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#e3dcc8] px-3 py-2 text-sm font-medium text-[#514a35] transition hover:bg-[#f8f4ea]"
                    >
                      <ChevronUp className="h-4 w-4" />
                      Monter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSelectedField("down")}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#e3dcc8] px-3 py-2 text-sm font-medium text-[#514a35] transition hover:bg-[#f8f4ea]"
                    >
                      <ChevronDown className="h-4 w-4" />
                      Descendre
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveSelectedField}
                      disabled={isPending || !selectedField.label.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#7a6d2e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6a5f27] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer le champ
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelectedField}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function FieldPreview({ field }: { field: FormField }) {
  if (field.field_type === "select") {
    const options = getFieldOptions(field);
    return (
      <div className="space-y-2">
        {options.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#ddd1b4] px-4 py-3 text-sm text-[#9a937e]">
            Ajoute des options dans le panneau de droite.
          </div>
        ) : (
          options.map((option) => (
            <div key={option} className="rounded-2xl border border-[#ebe3d0] bg-white px-4 py-3 text-sm text-[#514a35]">
              {option}
            </div>
          ))
        )}
      </div>
    );
  }

  if (field.field_type === "long_text") {
    return (
      <div className="rounded-[24px] border border-[#ebe3d0] bg-white px-4 py-4 text-sm text-[#9a937e]">
        {field.placeholder || "Réponse longue de l'élève..."}
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-[#ebe3d0] bg-white px-4 py-3 text-sm text-[#9a937e]">
      {field.placeholder || "Réponse courte de l'élève..."}
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-[#514a35]">{label}</span>
      {children}
    </label>
  );
}

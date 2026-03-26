"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Check,
  CheckSquare,
  Copy,
  CircleDot,
  GripVertical,
  ListChecks,
  Loader2,
  PencilRuler,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import {
  deleteFormField,
  saveFormField,
  saveFormFieldOrder,
  saveFormTemplate,
} from "@/app/(admin)/admin/configuration/actions";
import { FORM_FIELD_TYPE_LABELS, getFieldOptions } from "@/lib/form-builder";
import type { FormField, FormFieldType, FormTemplate, Profile } from "@/types/database";

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
  icon: React.ReactNode;
};

const FIELD_LIBRARY: FieldLibraryItem[] = [
  { type: "short_text", title: "Texte court", icon: <Type className="h-4 w-4" /> },
  { type: "long_text", title: "Paragraphe", icon: <PencilRuler className="h-4 w-4" /> },
  { type: "radio", title: "Choix unique", icon: <CircleDot className="h-4 w-4" /> },
  { type: "checkboxes", title: "Cases à cocher", icon: <CheckSquare className="h-4 w-4" /> },
  { type: "select", title: "Liste", icon: <ListChecks className="h-4 w-4" /> },
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

function getFieldIcon(type: FormFieldType) {
  if (type === "long_text") return <PencilRuler className="h-4 w-4" />;
  if (type === "radio") return <CircleDot className="h-4 w-4" />;
  if (type === "checkboxes") return <CheckSquare className="h-4 w-4" />;
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
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

  const stats = useMemo(() => {
    return {
      total: selectedFields.length,
      required: selectedFields.filter((field) => field.required).length,
    };
  }, [selectedFields]);

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
        La configuration des formulaires n'est pas prête: {setupError}. Recharge après avoir appliqué les migrations.
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

      <section className="overflow-hidden rounded-[30px] border border-[#ddd7f0] bg-[#f4f1fb] shadow-sm">
        <div className="border-b border-[#e1dbf3] bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="rounded-2xl border border-[#ddd3bb] bg-white px-4 py-2.5 text-sm font-medium text-[#2f3640] outline-none focus:border-[#7a6d2e]"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddTemplate}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#ddd3bb] bg-white px-4 py-2.5 text-sm font-medium text-[#514a35] transition hover:bg-[#f6f0e2]"
              >
                <Plus className="h-4 w-4" />
                Nouveau formulaire
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isPending || !templateDraft.title.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#7a6d2e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6a5f27] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer le formulaire
            </button>
          </div>
        </div>

        <div className="border-b border-[#e1dbf3] bg-white px-5 py-3">
          <div className="mx-auto flex max-w-[1500px] items-center justify-center gap-8 text-sm font-medium text-[#71688c]">
            <button type="button" className="border-b-2 border-[#6f48d9] pb-2 text-[#3b2b68]">
              Questions
            </button>
            <button type="button" className="pb-2 opacity-70">
              Reponses
            </button>
            <button type="button" className="pb-2 opacity-70">
              Parametres
            </button>
          </div>
        </div>

        <div className="px-4 py-6 lg:px-8 xl:px-10">
          <div className="mx-auto max-w-[1500px]">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr),88px]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-[#dcd5ef] border-t-[10px] border-t-[#6f48d9] bg-white p-6 shadow-[0_18px_40px_rgba(80,62,24,0.07)]">
                  <input
                    value={templateDraft.title}
                    onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Titre du formulaire"
                    className="w-full border-none bg-transparent text-3xl font-semibold text-[#1e2a3a] outline-none placeholder:text-[#7c7664]"
                  />
                  <textarea
                    rows={2}
                    value={templateDraft.description}
                    onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Description du formulaire"
                    className="mt-3 w-full resize-none border-none bg-transparent text-sm leading-6 text-[#6f6753] outline-none placeholder:text-[#9b927d]"
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#7d72a0]">
                    <span className="rounded-full bg-[#f3efff] px-3 py-1 font-semibold">{stats.total} question(s)</span>
                    <span className="rounded-full bg-[#f3efff] px-3 py-1 font-semibold">{stats.required} obligatoire(s)</span>
                  </div>
                </div>

                {selectedFields.length === 0 ? (
                  <div className="rounded-[28px] border-2 border-dashed border-[#ddd2b8] bg-white/70 p-10 text-center text-sm text-[#7c7664]">
                    Ajoute une première question avec les boutons à droite.
                  </div>
                ) : (
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
                )}
              </div>

                <div className="lg:sticky lg:top-6 lg:h-fit">
                <div className="rounded-[24px] border border-[#dcd5ef] bg-white p-3 shadow-sm">
                  <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d845f]">
                    Ajouter
                  </p>
                  <div className="space-y-2">
                    {FIELD_LIBRARY.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => handleAddField(item.type)}
                        className="flex w-full items-center justify-center rounded-2xl border border-[#ede4cf] bg-[#fcfbf7] p-3 text-[#5c533e] transition hover:border-[#d8cba7] hover:bg-white"
                        title={item.title}
                      >
                        {item.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
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
      style={style}
      className={`rounded-[24px] border bg-white shadow-[0_12px_30px_rgba(80,62,24,0.06)] ${
        isSelected ? "border-[#71a1ff] ring-2 ring-[#71a1ff]" : "border-[#dcd5ef]"
      } ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-4 p-5">
        <button
          type="button"
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f3efff] text-sm font-semibold text-[#6f48d9]"
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
                  className="rounded-xl p-2 text-[#9f95bf] transition hover:bg-[#f5f1ff]"
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
                      <span className="rounded-full bg-[#f3efff] px-2 py-1 text-[10px] font-semibold text-[#6f48d9]">
                        Obligatoire
                      </span>
                    )}
                  </div>
                  {field.helper_text && <p className="mt-2 text-sm leading-6 text-[#7c7664]">{field.helper_text}</p>}
                </div>

                <button
                  type="button"
                  className="rounded-xl p-2 text-[#9f95bf] transition hover:bg-[#f5f1ff]"
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
    <div className="mt-5 rounded-[20px] border border-[#e7e1f5] bg-[#fcfbff] p-5">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e2a3a]">
              {getFieldIcon(field.field_type)}
              Question en cours d'edition
            </span>
            {field.required && (
              <span className="rounded-full bg-[#f3efff] px-2 py-1 text-[10px] font-semibold text-[#6f48d9]">
                Obligatoire
              </span>
            )}
          </div>
          {dragHandle}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),220px]">
          <input
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="Question sans titre"
            className="w-full border-0 border-b-2 border-[#d9d1ef] bg-transparent px-1 py-3 text-lg font-medium text-[#243041] outline-none focus:border-[#6f48d9]"
          />

          <select
            value={field.field_type}
            onChange={(event) =>
              onChange({
                field_type: event.target.value as FormFieldType,
                options: ["radio", "checkboxes", "select"].includes(event.target.value)
                  ? (optionFields.length > 0 ? optionFields : ["Option 1", "Option 2"])
                  : [],
              })
            }
            className="w-full rounded-xl border border-[#ded6f2] bg-white px-4 py-3 text-sm text-[#243041] outline-none focus:border-[#6f48d9]"
          >
            {Object.entries(FORM_FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3">
          <input
            value={field.helper_text ?? ""}
            onChange={(event) => onChange({ helper_text: event.target.value })}
            placeholder="Description ou aide (optionnel)"
            className="w-full border-0 border-b border-[#e5dff3] bg-transparent px-1 py-2 text-sm text-[#5f5870] outline-none focus:border-[#6f48d9]"
          />
        </div>

        {isChoiceField ? (
          <div className="space-y-2">
            {optionFields.map((option, index) => (
              <div key={`${field.id}-option-${index}`} className="flex items-center gap-3">
                <span className="w-7 text-center text-[#8e86a8]">
                  {field.field_type === "checkboxes" ? "□" : field.field_type === "radio" ? "○" : "▾"}
                </span>
                <input
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1 border-0 border-b border-[#e5dff3] bg-transparent px-1 py-3 text-sm text-[#243041] outline-none focus:border-[#6f48d9]"
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
              className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm font-medium text-[#6f48d9] transition hover:bg-[#f3efff]"
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
            className="w-full border-0 border-b border-[#e5dff3] bg-transparent px-1 py-3 text-sm text-[#243041] outline-none focus:border-[#6f48d9]"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ebe5f7] pt-4">
          <label className="inline-flex items-center gap-3 text-sm font-medium text-[#514a35]">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => onChange({ required: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-[#6f48d9] focus:ring-[#6f48d9]"
            />
            Question obligatoire
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#ddd6f2] bg-white px-3 py-2.5 text-sm font-medium text-[#5d4e88] transition hover:bg-[#f6f2ff]"
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
              className="inline-flex items-center gap-2 rounded-2xl bg-[#6f48d9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#603bc5] disabled:cursor-not-allowed disabled:opacity-60"
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

function FieldPreview({ field }: { field: FormField }) {
  if (["select", "radio", "checkboxes"].includes(field.field_type)) {
    const options = getFieldOptions(field);
    return (
      <div className="space-y-2">
        {options.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#ddd2b8] bg-white px-4 py-3 text-sm text-[#9a937e]">
            Ajoute des options
          </div>
        ) : (
          options.map((option) => (
            <div key={option} className="flex items-center gap-3 rounded-2xl border border-[#ebe5f7] bg-white px-4 py-3 text-sm text-[#514a35]">
              <span className="w-5 text-center text-[#8e86a8]">
                {field.field_type === "checkboxes" ? "□" : field.field_type === "radio" ? "○" : "▾"}
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
      <div className="rounded-2xl border border-[#ebe2cb] bg-white px-4 py-4 text-sm text-[#9a937e]">
        {field.placeholder || "Réponse longue..."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#ebe2cb] bg-white px-4 py-3 text-sm text-[#9a937e]">
      {field.placeholder || "Réponse courte..."}
    </div>
  );
}

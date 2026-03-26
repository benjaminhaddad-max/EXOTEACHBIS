"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Settings,
  Trash2,
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

type FieldDraft = {
  id?: string;
  form_template_id: string;
  key: string;
  label: string;
  helper_text: string;
  placeholder: string;
  field_type: FormFieldType;
  required: boolean;
  optionsText: string;
  width: FormFieldWidth;
  order_index: number;
};

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

function fieldToDraft(field: FormField, templateId: string): FieldDraft {
  return {
    id: field.id,
    form_template_id: templateId,
    key: field.key,
    label: field.label,
    helper_text: field.helper_text ?? "",
    placeholder: field.placeholder ?? "",
    field_type: field.field_type,
    required: field.required,
    optionsText: getFieldOptions(field).join("\n"),
    width: field.width,
    order_index: field.order_index,
  };
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
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(templateToDraft(initialTemplates[0] ?? null));
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const canAccess = ["admin", "superadmin"].includes(currentProfile.role);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    setTemplateDraft(templateToDraft(selectedTemplate));
  }, [selectedTemplate?.id]);

  const selectedFields = useMemo(
    () =>
      fields
        .filter((field) => field.form_template_id === selectedTemplateId)
        .sort((a, b) => a.order_index - b.order_index),
    [fields, selectedTemplateId]
  );

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
    setTemplateDraft({
      slug: "",
      title: "",
      description: "",
      context: "generic",
      is_active: true,
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
        La configuration des formulaires n'est pas prête: {setupError}. Applique aussi la migration
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

      <section className="grid gap-6 xl:grid-cols-[320px,1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Formulaires</h2>
              <p className="text-sm text-gray-500">Gère les formulaires dynamiques de la plateforme.</p>
            </div>
            <button
              type="button"
              onClick={handleAddTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Nouveau
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  template.id === selectedTemplateId ? "border-navy bg-navy/5" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{template.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{template.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${template.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {template.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-gray-500">{fields.filter((field) => field.form_template_id === template.id).length} champ(s)</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-navy" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Paramètres du formulaire</h2>
                <p className="text-sm text-gray-500">Titre, description, slug et activation.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <FieldLabel label="Titre">
                <input
                  value={templateDraft.title}
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
                />
              </FieldLabel>
              <FieldLabel label="Slug">
                <input
                  value={templateDraft.slug}
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, slug: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
                />
              </FieldLabel>
              <FieldLabel label="Contexte">
                <input
                  value={templateDraft.context}
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, context: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
                />
              </FieldLabel>
              <FieldLabel label="Statut">
                <button
                  type="button"
                  onClick={() => setTemplateDraft((current) => ({ ...current, is_active: !current.is_active }))}
                  className={`inline-flex h-11 w-full items-center rounded-xl px-3 text-sm font-medium transition ${
                    templateDraft.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {templateDraft.is_active ? "Actif" : "Inactif"}
                </button>
              </FieldLabel>
              <FieldLabel label="Description" className="md:col-span-2">
                <textarea
                  rows={3}
                  value={templateDraft.description}
                  onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-navy"
                />
              </FieldLabel>
            </div>

            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isPending || !templateDraft.title.trim()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer le formulaire
            </button>
          </div>

          {selectedTemplateId && (
            <FormFieldsEditor
              formTemplateId={selectedTemplateId}
              fields={selectedFields}
              onFieldsChange={setFields}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function FormFieldsEditor({
  formTemplateId,
  fields,
  onFieldsChange,
}: {
  formTemplateId: string;
  fields: FormField[];
  onFieldsChange: React.Dispatch<React.SetStateAction<FormField[]>>;
}) {
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleAddField = () => {
    const nextOrder = (fields.at(-1)?.order_index ?? 0) + 10;
    const tempId = `draft-${Date.now()}`;
    onFieldsChange((current) => [
      ...current,
      {
        id: tempId,
        form_template_id: formTemplateId,
        key: "",
        label: "",
        helper_text: null,
        placeholder: null,
        field_type: "short_text",
        required: false,
        options: [],
        width: "full",
        order_index: nextOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {toast && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${toast.kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Champs du formulaire</h2>
          <p className="text-sm text-gray-500">Tu peux modifier les questions et en ajouter quand tu veux.</p>
        </div>
        <button
          type="button"
          onClick={handleAddField}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
          Ajouter un champ
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            Aucun champ pour le moment.
          </div>
        ) : (
          fields.map((field) => (
            <EditableFieldCard
              key={field.id}
              initialDraft={fieldToDraft(field, formTemplateId)}
              onSaved={(savedField) =>
                onFieldsChange((current) => {
                  const withoutCurrent = current.filter((item) => item.id !== field.id && item.id !== savedField.id);
                  return [...withoutCurrent, savedField].sort((a, b) => a.order_index - b.order_index);
                })
              }
              onDeleted={(fieldId) => onFieldsChange((current) => current.filter((item) => item.id !== fieldId))}
              onToast={setToast}
              isPending={isPending}
              startTransition={startTransition}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EditableFieldCard({
  initialDraft,
  onSaved,
  onDeleted,
  onToast,
  isPending,
  startTransition,
}: {
  initialDraft: FieldDraft;
  onSaved: (field: FormField) => void;
  onDeleted: (fieldId: string) => void;
  onToast: (toast: Toast) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [draft, setDraft] = useState(initialDraft);

  const options = Object.entries(FORM_FIELD_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  const handleSave = () => {
    startTransition(async () => {
      const response = await saveFormField({
        id: draft.id?.startsWith("draft-") ? undefined : draft.id,
        form_template_id: draft.form_template_id,
        key: draft.key,
        label: draft.label,
        helper_text: draft.helper_text,
        placeholder: draft.placeholder,
        field_type: draft.field_type,
        required: draft.required,
        options: draft.optionsText.split("\n"),
        width: draft.width,
        order_index: Number(draft.order_index),
      });

      if (!("success" in response)) {
        onToast({ kind: "error", message: response.error ?? "Impossible d'enregistrer le champ." });
        return;
      }

      const savedField = response.field;
      if (!savedField) {
        onToast({ kind: "error", message: "Champ non retourné par le serveur." });
        return;
      }

      onSaved(savedField);
      setDraft(fieldToDraft(savedField, savedField.form_template_id));
      onToast({ kind: "success", message: "Champ enregistré." });
    });
  };

  const handleDelete = () => {
    if (draft.id?.startsWith("draft-")) {
      onDeleted(draft.id);
      return;
    }

    startTransition(async () => {
      const response = await deleteFormField(draft.id!);
      if (!("success" in response)) {
        onToast({ kind: "error", message: response.error ?? "Impossible de supprimer le champ." });
        return;
      }
      onDeleted(draft.id!);
      onToast({ kind: "success", message: "Champ supprimé." });
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white p-2 text-gray-400">
            <GripVertical className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{draft.label || "Nouveau champ"}</p>
            <p className="text-xs text-gray-500">{FORM_FIELD_TYPE_LABELS[draft.field_type]}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-xl p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FieldLabel label="Label">
          <input
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
        </FieldLabel>
        <FieldLabel label="Clé technique">
          <input
            value={draft.key}
            onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
        </FieldLabel>
        <FieldLabel label="Type">
          <select
            value={draft.field_type}
            onChange={(event) => setDraft((current) => ({ ...current, field_type: event.target.value as FormFieldType }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Largeur">
          <select
            value={draft.width}
            onChange={(event) => setDraft((current) => ({ ...current, width: event.target.value as FormFieldWidth }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          >
            <option value="full">Pleine largeur</option>
            <option value="half">Demi largeur</option>
          </select>
        </FieldLabel>
        <FieldLabel label="Placeholder">
          <input
            value={draft.placeholder}
            onChange={(event) => setDraft((current) => ({ ...current, placeholder: event.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
        </FieldLabel>
        <FieldLabel label="Ordre">
          <input
            type="number"
            value={draft.order_index}
            onChange={(event) => setDraft((current) => ({ ...current, order_index: Number(event.target.value) }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
        </FieldLabel>
        <FieldLabel label="Texte d'aide" className="md:col-span-2">
          <textarea
            rows={2}
            value={draft.helper_text}
            onChange={(event) => setDraft((current) => ({ ...current, helper_text: event.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
        </FieldLabel>
        {draft.field_type === "select" && (
          <FieldLabel label="Options (une par ligne)" className="md:col-span-2">
            <textarea
              rows={4}
              value={draft.optionsText}
              onChange={(event) => setDraft((current) => ({ ...current, optionsText: event.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy"
            />
          </FieldLabel>
        )}
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))}
          className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
        />
        Champ obligatoire
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !draft.label.trim()}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Enregistrer ce champ
      </button>
    </div>
  );
}

function FieldLabel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-2 text-sm ${className}`}>
      <span className="font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

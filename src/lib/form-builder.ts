import type { CoachingIntakeForm, FormAnswerValue, FormField, FormFieldType } from "@/types/database";

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  short_text: "Réponse courte",
  long_text: "Paragraphe",
  select: "Liste deroulante",
  radio: "Choix unique",
  checkboxes: "Cases a cocher",
};

export function slugifyFieldKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

export function getCoachingLegacyAnswers(form: CoachingIntakeForm | null | undefined): Record<string, FormAnswerValue> {
  if (!form) return {};
  return {
    phone: form.phone ?? "",
    city: form.city ?? "",
    bac_specialties: form.bac_specialties ?? "",
    parcours_label: form.parcours_label ?? "",
    why_medicine: form.why_medicine ?? "",
    expectations: form.expectations ?? "",
    main_worry: form.main_worry ?? "",
    current_method_description: form.current_method_description ?? "",
    strengths: form.strengths ?? "",
    weaknesses: form.weaknesses ?? "",
    availability_notes: form.availability_notes ?? "",
  };
}

export function getCoachingFormAnswers(form: CoachingIntakeForm | null | undefined): Record<string, FormAnswerValue> {
  if (!form) return {};
  const answers = form.answers ?? {};
  if (Object.keys(answers).length > 0) {
    return Object.fromEntries(
      Object.entries(answers).map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key, value.map((item) => String(item ?? "")).filter(Boolean)];
        }
        return [key, typeof value === "string" ? value : String(value ?? "")];
      })
    );
  }
  return getCoachingLegacyAnswers(form);
}

export function getFieldOptions(field: FormField) {
  return Array.isArray(field.options) ? field.options.filter((option) => typeof option === "string") : [];
}

export function isFilledAnswer(value: FormAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === "string" ? value.trim().length > 0 : false;
}

export function formatAnswerValue(value: FormAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? "";
}

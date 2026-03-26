"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slugifyFieldKey } from "@/lib/form-builder";
import type { FormField, FormFieldType, FormFieldWidth, FormTemplate } from "@/types/database";

const CONFIGURATION_PATH = "/admin/configuration";
const FORMULAIRES_PATH = "/admin/formulaires";
const COACHING_PATH = "/admin/coaching";
const STUDENT_COACHING_PATH = "/coaching";

function normalizeStudentIds(studentIds?: string[]) {
  return [...new Set((studentIds ?? []).map((studentId) => studentId.trim()).filter(Boolean))];
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    return { error: "Accès réservé à l'administration" as const };
  }

  return { user, profile };
}

function normalizeOptions(options: string[]) {
  return options.map((option) => option.trim()).filter(Boolean);
}

export async function saveFormTemplate(data: {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  context?: string;
  target_type?: "global" | "offer" | "university" | "groupe" | "student" | "selection";
  target_offer_code?: string | null;
  target_university_dossier_id?: string | null;
  target_groupe_id?: string | null;
  target_student_id?: string | null;
  target_student_ids?: string[];
  is_active: boolean;
}) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const slug = slugifyFieldKey(data.slug || data.title);
  if (!slug) {
    return { error: "Slug de formulaire invalide." };
  }

  const { data: template, error } = await admin
    .from("form_templates")
    .upsert(
      {
        id: data.id,
        slug,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        context: data.context?.trim() || "generic",
        target_type: data.target_type ?? "global",
        target_offer_code: data.target_offer_code?.trim() || null,
        target_university_dossier_id: data.target_university_dossier_id || null,
        target_groupe_id: data.target_groupe_id || null,
        target_student_id: data.target_student_id || null,
        target_student_ids: normalizeStudentIds(data.target_student_ids),
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    )
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(CONFIGURATION_PATH);
  revalidatePath(FORMULAIRES_PATH);
  revalidatePath(COACHING_PATH);
  revalidatePath(STUDENT_COACHING_PATH);
  return { success: true, template: template as FormTemplate };
}

export async function saveFormField(data: {
  id?: string;
  form_template_id: string;
  key: string;
  label: string;
  helper_text?: string;
  placeholder?: string;
  field_type: FormFieldType;
  required: boolean;
  options: string[];
  width: FormFieldWidth;
  order_index: number;
}) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const key = slugifyFieldKey(data.key || data.label);

  if (!key) {
    return { error: "Clé de champ invalide." };
  }

  const { data: field, error } = await admin
    .from("form_fields")
    .upsert(
      {
        id: data.id,
        form_template_id: data.form_template_id,
        key,
        label: data.label.trim(),
        helper_text: data.helper_text?.trim() || null,
        placeholder: data.placeholder?.trim() || null,
        field_type: data.field_type,
        required: data.required,
        options: normalizeOptions(data.options),
        width: data.width,
        order_index: data.order_index,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(CONFIGURATION_PATH);
  revalidatePath(FORMULAIRES_PATH);
  revalidatePath(COACHING_PATH);
  revalidatePath(STUDENT_COACHING_PATH);
  return { success: true, field: field as FormField };
}

export async function deleteFormField(fieldId: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("form_fields")
    .delete()
    .eq("id", fieldId);

  if (error) return { error: error.message };

  revalidatePath(CONFIGURATION_PATH);
  revalidatePath(FORMULAIRES_PATH);
  revalidatePath(COACHING_PATH);
  revalidatePath(STUDENT_COACHING_PATH);
  return { success: true };
}

export async function saveFormFieldOrder(data: {
  form_template_id: string;
  field_ids: string[];
}) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const updates = data.field_ids.map((fieldId, index) =>
    admin
      .from("form_fields")
      .update({
        order_index: (index + 1) * 10,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fieldId)
      .eq("form_template_id", data.form_template_id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return { error: failed.error.message };
  }

  revalidatePath(CONFIGURATION_PATH);
  revalidatePath(FORMULAIRES_PATH);
  revalidatePath(COACHING_PATH);
  revalidatePath(STUDENT_COACHING_PATH);
  return { success: true };
}

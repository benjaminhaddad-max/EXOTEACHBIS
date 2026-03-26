import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ConfigurationShell } from "@/components/admin/configuration/configuration-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormField, FormTemplate, Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!currentProfile) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const [templatesRes, fieldsRes] = ["admin", "superadmin"].includes(currentProfile.role)
    ? await Promise.all([
        admin.from("form_templates").select("*").order("context").order("title"),
        admin.from("form_fields").select("*").order("order_index").order("created_at"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const setupError = templatesRes.error?.message ?? fieldsRes.error?.message ?? null;

  return (
    <div>
      <Header title="Configuration" />
      <ConfigurationShell
        currentProfile={currentProfile as Profile}
        initialTemplates={(templatesRes.data ?? []) as FormTemplate[]}
        initialFields={(fieldsRes.data ?? []) as FormField[]}
        setupError={setupError}
      />
    </div>
  );
}

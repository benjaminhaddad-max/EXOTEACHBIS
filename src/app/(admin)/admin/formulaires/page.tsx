import { redirect } from "next/navigation";
import { FormulairesShell } from "@/components/admin/formulaires/formulaires-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, Groupe, Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function FormulairesPage() {
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
  const [templatesRes, fieldsRes, dossiersRes, groupesRes, studentsRes, responsesRes] = ["admin", "superadmin"].includes(currentProfile.role)
    ? await Promise.all([
        admin.from("form_templates").select("*").order("updated_at", { ascending: false }),
        admin.from("form_fields").select("*").order("order_index").order("created_at"),
        admin.from("dossiers").select("*").in("dossier_type", ["offer", "university"]).order("order_index").order("name"),
        admin.from("groupes").select("*").order("name"),
        admin.from("profiles").select("*").eq("role", "eleve").order("last_name").order("first_name"),
        admin
          .from("coaching_intake_forms")
          .select("*, student:profiles(*), groupe:groupes(*)")
          .order("submitted_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  return (
    <div className="bg-[#0e1e35] rounded-2xl h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
      <FormulairesShell
        currentProfile={currentProfile as Profile}
        initialTemplates={(templatesRes.data ?? []) as FormTemplate[]}
        initialFields={(fieldsRes.data ?? []) as FormField[]}
        initialDossiers={(dossiersRes.data ?? []) as Dossier[]}
        initialGroupes={(groupesRes.data ?? []) as Groupe[]}
        initialStudents={(studentsRes.data ?? []) as Profile[]}
        initialResponses={(responsesRes.data ?? []) as CoachingIntakeForm[]}
      />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CoachStudentPicker } from "@/components/coach/coach-student-picker";
import type { Groupe, Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function VueElevePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "coach") {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  // Get ALL groupes (bypass RLS)
  const { data: groupes } = await admin
    .from("groupes")
    .select("id, name, color, annee")
    .order("name");

  const allGroupes = (groupes ?? []) as Pick<Groupe, "id" | "name" | "color" | "annee">[];
  const groupeIds = allGroupes.map((g) => g.id);

  // Get students in all groupes
  const { data: students } = groupeIds.length > 0
    ? await admin
        .from("profiles")
        .select("id, first_name, last_name, email, avatar_url, groupe_id")
        .eq("role", "eleve")
        .in("groupe_id", groupeIds)
        .order("first_name")
    : { data: [] };

  return (
    <div className="max-w-4xl mx-auto">
      <CoachStudentPicker
        groupes={allGroupes}
        students={
          (students ?? []) as Pick<
            Profile,
            "id" | "first_name" | "last_name" | "email" | "avatar_url" | "groupe_id"
          >[]
        }
      />
    </div>
  );
}

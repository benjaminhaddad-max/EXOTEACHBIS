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
    .select("role, groupe_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "coach") {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  // Get coach's assigned groupes to find their university
  const { data: assignments } = await admin
    .from("coach_groupe_assignments")
    .select("groupe_id")
    .eq("coach_id", user.id);

  let coachGroupeIds = (assignments ?? []).map((a) => a.groupe_id);
  if (coachGroupeIds.length === 0 && profile.groupe_id) {
    coachGroupeIds = [profile.groupe_id];
  }

  // Get the coach's assigned groupes to find which university they belong to
  const { data: coachGroupes } = coachGroupeIds.length > 0
    ? await admin.from("groupes").select("id, formation_dossier_id").in("id", coachGroupeIds)
    : { data: [] };

  // Get all unique formation_dossier_ids (universities) the coach is linked to
  const universityIds = [...new Set(
    (coachGroupes ?? [])
      .map((g) => g.formation_dossier_id)
      .filter(Boolean) as string[]
  )];

  // Get all groupes belonging to the same university/universities
  const { data: groupes } = universityIds.length > 0
    ? await admin
        .from("groupes")
        .select("id, name, color, annee")
        .in("formation_dossier_id", universityIds)
        .order("name")
    : await admin
        .from("groupes")
        .select("id, name, color, annee")
        .in("id", coachGroupeIds.length > 0 ? coachGroupeIds : ["__none__"])
        .order("name");

  const allGroupes = (groupes ?? []) as Pick<Groupe, "id" | "name" | "color" | "annee">[];
  const groupeIds = allGroupes.map((g) => g.id);

  // Get students in those groupes
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

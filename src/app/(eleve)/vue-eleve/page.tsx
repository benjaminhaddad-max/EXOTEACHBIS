import { createClient } from "@/lib/supabase/server";
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

  // Get coach's assigned groupes
  const { data: assignments } = await supabase
    .from("coach_groupe_assignments")
    .select("groupe_id")
    .eq("coach_id", user.id);

  const groupeIds = (assignments ?? []).map((a) => a.groupe_id);

  if (groupeIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500">Aucune classe assignée.</p>
      </div>
    );
  }

  // Get groupes info
  const { data: groupes } = await supabase
    .from("groupes")
    .select("id, name, color, annee")
    .in("id", groupeIds)
    .order("name");

  // Get students in those groupes
  const { data: students } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url, groupe_id")
    .eq("role", "eleve")
    .in("groupe_id", groupeIds)
    .order("first_name");

  return (
    <div className="max-w-4xl mx-auto">
      <CoachStudentPicker
        groupes={(groupes ?? []) as Pick<Groupe, "id" | "name" | "color" | "annee">[]}
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

import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { StudentCoachingShell } from "@/components/eleve/coaching/student-coaching-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CoachingVideo, CoachingRdvRequest, Profile, Groupe, Dossier } from "@/types/database";
import type { QaThread } from "@/types/qa";

export const dynamic = "force-dynamic";

export default async function StudentCoachingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!currentProfile) redirect("/login");

  const admin = createAdminClient();

  // ─── Resolve university name from groupe ────────────────────────────
  let universityName = "";
  let universityDossierId: string | null = null;

  if (currentProfile.groupe_id) {
    const { data: groupe } = await admin
      .from("groupes")
      .select("formation_dossier_id")
      .eq("id", currentProfile.groupe_id)
      .maybeSingle();

    if (groupe?.formation_dossier_id) {
      const { data: dossier } = await admin
        .from("dossiers")
        .select("id, name, dossier_type, parent_id")
        .eq("id", groupe.formation_dossier_id)
        .maybeSingle();

      if (dossier) {
        if (dossier.dossier_type === "university") {
          universityName = dossier.name;
          universityDossierId = dossier.id;
        } else if (dossier.parent_id) {
          // Walk up to find university
          const { data: parent } = await admin
            .from("dossiers")
            .select("id, name, dossier_type")
            .eq("id", dossier.parent_id)
            .maybeSingle();
          if (parent?.dossier_type === "university") {
            universityName = parent.name;
            universityDossierId = parent.id;
          }
        }
      }
    }
  }

  // ─── Fetch data in parallel ─────────────────────────────────────────
  const [videosRes, threadRes, rdvRes, coachesRes] = await Promise.all([
    // Videos: visible + matching university or global
    admin
      .from("coaching_videos")
      .select("*")
      .eq("visible", true)
      .or(
        universityDossierId
          ? `university_dossier_id.is.null,university_dossier_id.eq.${universityDossierId}`
          : "university_dossier_id.is.null"
      )
      .order("order_index"),

    // Existing coaching thread
    admin
      .from("qa_threads")
      .select("*")
      .eq("student_id", user.id)
      .eq("context_type", "coaching")
      .in("status", ["ai_pending", "ai_answered", "escalated", "prof_answered"])
      .order("created_at", { ascending: false })
      .limit(1),

    // RDV requests
    admin
      .from("coaching_rdv_requests")
      .select("*")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false }),

    // Coaches (for display)
    currentProfile.groupe_id
      ? admin
          .from("coach_groupe_assignments")
          .select("coach:profiles(*)")
          .eq("groupe_id", currentProfile.groupe_id)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const videos = (videosRes.data ?? []) as CoachingVideo[];
  const initialThread = ((threadRes.data ?? [])[0] ?? null) as QaThread | null;
  const rdvRequests = (rdvRes.data ?? []) as CoachingRdvRequest[];
  const coaches = ((coachesRes.data ?? [])
    .map((row: any) => row.coach)
    .filter(Boolean)) as Profile[];

  return (
    <div>
      <Header title="Coaching" />
      <StudentCoachingShell
        currentProfile={currentProfile as Profile}
        universityName={universityName}
        videos={videos}
        initialThread={initialThread}
        rdvRequests={rdvRequests}
        coaches={coaches}
      />
    </div>
  );
}

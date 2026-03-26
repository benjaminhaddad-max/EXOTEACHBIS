import { Header } from "@/components/header";
import { CoachingShell } from "@/components/admin/coaching/coaching-shell";
import { createClient } from "@/lib/supabase/server";
import type { CoachingCohort, CoachingStudent, Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CoachingPage() {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [
    studentCountRes,
    coachCountRes,
    groupesRes,
    meetingsRes,
    studentsRes,
    coachesRes,
    cohortsRes,
    assignmentsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "eleve"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "coach"),
    supabase.from("groupes").select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("type", "reunion")
      .gte("start_at", now),
    supabase
      .from("profiles")
      .select("id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at")
      .eq("role", "eleve")
      .order("last_name")
      .order("first_name"),
    supabase
      .from("profiles")
      .select("id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at")
      .eq("role", "coach")
      .order("last_name")
      .order("first_name"),
    supabase.from("coaching_cohorts").select("*").order("created_at", { ascending: false }),
    supabase
      .from("coaching_students")
      .select(`
        *,
        student:profiles!coaching_students_student_id_fkey(
          id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at
        ),
        coach:profiles!coaching_students_coach_id_fkey(
          id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at
        )
      `)
      .order("created_at", { ascending: false }),
  ]);

  const setupComplete = !cohortsRes.error && !assignmentsRes.error;
  const setupError = cohortsRes.error?.message ?? assignmentsRes.error?.message ?? null;

  const stats = [
    {
      label: "Eleves",
      value: String(studentCountRes.count ?? 0),
      hint: "Base actuelle d'eleves a segmenter et suivre.",
    },
    {
      label: "Coachs",
      value: String(coachCountRes.count ?? 0),
      hint: "Pool de coachs potentiels a affecter aux cohortes.",
    },
    {
      label: "Groupes",
      value: String(groupesRes.count ?? 0),
      hint: "Classes ou cohortes a utiliser pour organiser le coaching.",
    },
    {
      label: "Reunions planifiees",
      value: String(meetingsRes.count ?? 0),
      hint: "Evenements staff de type reunion deja presents dans le planning.",
    },
  ];

  return (
    <div>
      <Header title="Coaching" />
      <CoachingShell
        stats={stats}
        setupComplete={setupComplete}
        setupError={setupError}
        cohorts={(cohortsRes.data ?? []) as CoachingCohort[]}
        assignments={(assignmentsRes.data ?? []) as (CoachingStudent & { student?: Profile; coach?: Profile | null })[]}
        students={(studentsRes.data ?? []) as Profile[]}
        coaches={(coachesRes.data ?? []) as Profile[]}
      />
    </div>
  );
}

import { Header } from "@/components/header";
import { CoachingShell } from "@/components/admin/coaching/coaching-shell";
import { createClient } from "@/lib/supabase/server";
import type { CoachingCohort, CoachingIntervention, CoachingNote, CoachingStudent, CoachingWeeklyCheckin, Profile } from "@/types/database";

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
    checkinsRes,
    notesRes,
    interventionsRes,
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
    supabase.from("coaching_weekly_checkins").select("*").order("submitted_at", { ascending: false }),
    supabase
      .from("coaching_notes")
      .select(`
        *,
        author:profiles!coaching_notes_author_id_fkey(
          id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at
        )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("coaching_interventions")
      .select(`
        *,
        owner:profiles!coaching_interventions_owner_id_fkey(
          id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at
        ),
        requested_by:profiles!coaching_interventions_requested_by_id_fkey(
          id, email, first_name, last_name, phone, role, avatar_url, groupe_id, filiere_id, access_dossier_id, created_at, updated_at
        )
      `)
      .order("created_at", { ascending: false }),
  ]);

  const setupComplete = !cohortsRes.error && !assignmentsRes.error && !checkinsRes.error && !notesRes.error && !interventionsRes.error;
  const setupError =
    cohortsRes.error?.message ??
    assignmentsRes.error?.message ??
    checkinsRes.error?.message ??
    notesRes.error?.message ??
    interventionsRes.error?.message ??
    null;

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
        checkins={(checkinsRes.data ?? []) as CoachingWeeklyCheckin[]}
        notes={(notesRes.data ?? []) as CoachingNote[]}
        interventions={(interventionsRes.data ?? []) as CoachingIntervention[]}
      />
    </div>
  );
}

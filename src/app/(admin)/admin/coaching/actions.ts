"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CoachingCohort, CoachingProfileType, CoachingStudent, CoachingStudentStatus } from "@/types/database";

const PATH = "/admin/coaching";

async function ensureAdminAccess() {
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
    .single();

  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    return { error: "Accès refusé" as const };
  }

  return { userId: user.id };
}

export async function createCoachingCohort(data: {
  name: string;
  season: string;
  status?: "draft" | "active" | "archived";
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const admin = createAdminClient();
  const { data: cohort, error } = await admin
    .from("coaching_cohorts")
    .insert({
      name: data.name.trim(),
      season: data.season.trim(),
      status: data.status ?? "draft",
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, cohort: cohort as CoachingCohort };
}

export async function addStudentsToCoachingCohort(data: {
  cohortId: string;
  studentIds: string[];
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const uniqueStudentIds = [...new Set(data.studentIds.filter(Boolean))];
  if (uniqueStudentIds.length === 0) {
    return { error: "Aucun élève sélectionné" };
  }

  const admin = createAdminClient();
  const rows = uniqueStudentIds.map((studentId) => ({
    cohort_id: data.cohortId,
    student_id: studentId,
    coach_id: null,
    profile_type: "average_motivated" as CoachingProfileType,
    current_status: "orange" as CoachingStudentStatus,
    onboarding_completed: false,
    risk_notes: null,
  }));

  const { data: insertedRows, error } = await admin
    .from("coaching_students")
    .upsert(rows, { onConflict: "cohort_id,student_id" })
    .select("*");

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, rows: (insertedRows ?? []) as CoachingStudent[] };
}

export async function updateCoachingStudent(data: {
  id: string;
  coach_id: string | null;
  profile_type: CoachingProfileType;
  current_status: CoachingStudentStatus;
  onboarding_completed: boolean;
  risk_notes: string | null;
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const admin = createAdminClient();
  const { data: updatedRow, error } = await admin
    .from("coaching_students")
    .update({
      coach_id: data.coach_id,
      profile_type: data.profile_type,
      current_status: data.current_status,
      onboarding_completed: data.onboarding_completed,
      risk_notes: data.risk_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, row: updatedRow as CoachingStudent };
}

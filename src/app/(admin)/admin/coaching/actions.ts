"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateCoachingStatus } from "@/lib/coaching";
import type {
  CoachingCohort,
  CoachingIntervention,
  CoachingInterventionChannel,
  CoachingInterventionStatus,
  CoachingMainBlocker,
  CoachingMentalState,
  CoachingMomentum,
  CoachingNote,
  CoachingNoteType,
  CoachingProfileType,
  CoachingStudent,
  CoachingStudentStatus,
  CoachingUnderstandingLevel,
  CoachingWeeklyCheckin,
  CoachingHoursBucket,
} from "@/types/database";

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

export async function createCoachingWeeklyCheckin(data: {
  cohortId: string;
  coachingStudentId: string;
  studentId: string;
  weekStart: string;
  hours_bucket: CoachingHoursBucket;
  understanding_level: CoachingUnderstandingLevel;
  mental_state: CoachingMentalState;
  main_blocker: CoachingMainBlocker;
  momentum: CoachingMomentum;
  free_text?: string | null;
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const admin = createAdminClient();
  const { data: previousCheckin } = await admin
    .from("coaching_weekly_checkins")
    .select("momentum")
    .eq("student_id", data.studentId)
    .lt("week_start", data.weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const evaluation = calculateCoachingStatus({
    hoursBucket: data.hours_bucket,
    understanding: data.understanding_level,
    mentalState: data.mental_state,
    mainBlocker: data.main_blocker,
    momentum: data.momentum,
    previousMomentum: (previousCheckin?.momentum as CoachingMomentum | null | undefined) ?? null,
  });

  const { data: checkin, error } = await admin
    .from("coaching_weekly_checkins")
    .upsert(
      {
        cohort_id: data.cohortId,
        coaching_student_id: data.coachingStudentId,
        student_id: data.studentId,
        week_start: data.weekStart,
        hours_bucket: data.hours_bucket,
        understanding_level: data.understanding_level,
        mental_state: data.mental_state,
        main_blocker: data.main_blocker,
        momentum: data.momentum,
        free_text: data.free_text?.trim() || null,
        computed_status: evaluation.status,
        signal_reasons: evaluation.reasons,
      },
      { onConflict: "student_id,week_start" }
    )
    .select("*")
    .single();

  if (error) return { error: error.message };

  const { data: updatedStudent, error: studentError } = await admin
    .from("coaching_students")
    .update({
      current_status: evaluation.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.coachingStudentId)
    .select("*")
    .single();

  if (studentError) return { error: studentError.message };

  let autoIntervention: CoachingIntervention | null = null;

  if (evaluation.status !== "green") {
    const channel: CoachingInterventionChannel = evaluation.status === "red" ? "call" : "email";
    const { data: intervention } = await admin
      .from("coaching_interventions")
      .insert({
        cohort_id: data.cohortId,
        coaching_student_id: data.coachingStudentId,
        student_id: data.studentId,
        owner_id: null,
        requested_by_id: access.userId,
        channel,
        status: "todo",
        reason: `Alerte automatique après check-in: ${evaluation.reasons.join(" ")}`,
        metadata: {
          source: "weekly_checkin_auto",
          computed_status: evaluation.status,
        },
      })
      .select("*")
      .single();

    autoIntervention = (intervention as CoachingIntervention | null) ?? null;
  }

  revalidatePath(PATH);
  return {
    success: true,
    checkin: checkin as CoachingWeeklyCheckin,
    updatedStudent: updatedStudent as CoachingStudent,
    evaluation,
    autoIntervention,
  };
}

export async function createCoachingNote(data: {
  cohortId: string;
  coachingStudentId: string;
  studentId: string;
  noteType: CoachingNoteType;
  title: string;
  content: string;
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const admin = createAdminClient();
  const { data: note, error } = await admin
    .from("coaching_notes")
    .insert({
      cohort_id: data.cohortId,
      coaching_student_id: data.coachingStudentId,
      student_id: data.studentId,
      author_id: access.userId,
      note_type: data.noteType,
      title: data.title.trim(),
      content: data.content.trim(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, note: note as CoachingNote, authorId: access.userId };
}

export async function createCoachingIntervention(data: {
  cohortId: string;
  coachingStudentId: string;
  studentId: string;
  ownerId?: string | null;
  channel: CoachingInterventionChannel;
  reason: string;
  scheduledAt?: string | null;
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const admin = createAdminClient();
  const { data: intervention, error } = await admin
    .from("coaching_interventions")
    .insert({
      cohort_id: data.cohortId,
      coaching_student_id: data.coachingStudentId,
      student_id: data.studentId,
      owner_id: data.ownerId ?? null,
      requested_by_id: access.userId,
      channel: data.channel,
      status: data.scheduledAt ? "scheduled" : "todo",
      reason: data.reason.trim(),
      scheduled_at: data.scheduledAt || null,
      metadata: {},
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, intervention: intervention as CoachingIntervention, requesterId: access.userId };
}

export async function updateCoachingInterventionStatus(data: {
  id: string;
  status: CoachingInterventionStatus;
}) {
  const access = await ensureAdminAccess();
  if ("error" in access) return access;

  const admin = createAdminClient();
  const completedAt = data.status === "done" ? new Date().toISOString() : null;

  const { data: intervention, error } = await admin
    .from("coaching_interventions")
    .update({
      status: data.status,
      completed_at: completedAt,
    })
    .eq("id", data.id)
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true, intervention: intervention as CoachingIntervention };
}

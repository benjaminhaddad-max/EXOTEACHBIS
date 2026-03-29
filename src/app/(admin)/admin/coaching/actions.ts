"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateConfidenceScore } from "@/lib/coaching-score";
import type {
  CoachingCallBooking,
  CoachingCallBookingStatus,
  CoachingCallSlot,
  CoachingIntakeForm,
  CoachingMentality,
  CoachingMethodLevel,
  CoachingSchoolLevel,
  CoachingStudentProfile,
  CoachingWorkCapacity,
  CoachGroupeAssignment,
  FormAnswerValue,
} from "@/types/database";

const STUDENT_PATH = "/coaching";
const ADMIN_PATH = "/admin/coaching";

async function getAuthenticatedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { error: "Profil introuvable" as const };
  }

  return { user, profile };
}

async function requireStudent() {
  const auth = await getAuthenticatedProfile();
  if ("error" in auth) return auth;
  if (auth.profile.role !== "eleve") {
    return { error: "Accès réservé aux élèves" as const };
  }
  return auth;
}

async function requireCoachOrAdmin() {
  const auth = await getAuthenticatedProfile();
  if ("error" in auth) return auth;
  if (!["admin", "superadmin", "coach"].includes(auth.profile.role)) {
    return { error: "Accès refusé" as const };
  }
  return auth;
}

async function getCoachGroupeIds(coachId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("coach_groupe_assignments")
    .select("groupe_id")
    .eq("coach_id", coachId);
  return (data ?? []).map((r) => r.groupe_id);
}

async function canCoachAccessGroupe(coachId: string, groupeId: string | null): Promise<boolean> {
  if (!groupeId) return false;
  const ids = await getCoachGroupeIds(coachId);
  return ids.includes(groupeId);
}

function canCoachAccessStudent(coachGroupId: string | null, studentGroupId: string | null) {
  return Boolean(coachGroupId && studentGroupId && coachGroupId === studentGroupId);
}

export async function submitStudentCoachingForm(data: {
  form_template_id: string;
  answers: Record<string, FormAnswerValue>;
}) {
  const auth = await requireStudent();
  if ("error" in auth) return auth;
  if (!auth.profile.groupe_id) {
    return { error: "Tu dois être attribué à une classe avant de remplir ce formulaire." };
  }

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("form_templates")
    .select("id, is_active")
    .eq("id", data.form_template_id)
    .maybeSingle();

  if (!template?.is_active) {
    return { error: "Le formulaire n'est pas disponible pour le moment." };
  }

  const sanitizedAnswers = Object.fromEntries(
    Object.entries(data.answers ?? {}).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.map((item) => String(item ?? "").trim()).filter(Boolean)];
      }
      return [key, typeof value === "string" ? value.trim() : ""];
    })
  );

  const toLegacyString = (value: FormAnswerValue | undefined) => {
    if (Array.isArray(value)) return value.join(", ") || null;
    return value?.trim() ? value.trim() : null;
  };

  const payload = {
    student_id: auth.user.id,
    groupe_id: auth.profile.groupe_id,
    form_template_id: template.id,
    answers: sanitizedAnswers,
    phone: toLegacyString(sanitizedAnswers.phone),
    city: toLegacyString(sanitizedAnswers.city),
    bac_specialties: toLegacyString(sanitizedAnswers.bac_specialties),
    parcours_label: toLegacyString(sanitizedAnswers.parcours_label),
    why_medicine: toLegacyString(sanitizedAnswers.why_medicine),
    expectations: toLegacyString(sanitizedAnswers.expectations),
    main_worry: toLegacyString(sanitizedAnswers.main_worry),
    current_method_description: toLegacyString(sanitizedAnswers.current_method_description),
    strengths: toLegacyString(sanitizedAnswers.strengths),
    weaknesses: toLegacyString(sanitizedAnswers.weaknesses),
    availability_notes: toLegacyString(sanitizedAnswers.availability_notes),
    updated_at: new Date().toISOString(),
  };

  const { data: form, error } = await admin
    .from("coaching_intake_forms")
    .upsert(payload, { onConflict: "student_id" })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(STUDENT_PATH);
  revalidatePath(ADMIN_PATH);
  return { success: true, form: form as CoachingIntakeForm };
}

export async function bookStudentCoachingCall(slotId: string) {
  const auth = await requireStudent();
  if ("error" in auth) return auth;
  if (!auth.profile.groupe_id) {
    return { error: "Tu dois être attribué à une classe avant de réserver un appel." };
  }

  const admin = createAdminClient();

  const [{ data: form }, { data: slot, error: slotError }, { data: existingBooking }] = await Promise.all([
    admin.from("coaching_intake_forms").select("*").eq("student_id", auth.user.id).maybeSingle(),
    admin.from("coaching_call_slots").select("*").eq("id", slotId).maybeSingle(),
    admin
      .from("coaching_call_bookings")
      .select("*")
      .eq("student_id", auth.user.id)
      .in("status", ["booked", "completed"])
      .order("booked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!form) {
    return { error: "Tu dois d'abord remplir le formulaire avant de réserver ton appel." };
  }
  if (slotError || !slot) {
    return { error: slotError?.message ?? "Créneau introuvable." };
  }
  if (slot.groupe_id !== auth.profile.groupe_id) {
    return { error: "Ce créneau n'appartient pas à ta classe." };
  }
  if (existingBooking && existingBooking.status !== "cancelled") {
    return { error: "Tu as déjà un rendez-vous coaching réservé." };
  }

  const { data: alreadyTaken } = await admin
    .from("coaching_call_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .maybeSingle();

  if (alreadyTaken) {
    return { error: "Ce créneau vient d'être réservé." };
  }

  const { data: booking, error } = await admin
    .from("coaching_call_bookings")
    .insert({
      slot_id: slot.id,
      student_id: auth.user.id,
      coach_id: slot.coach_id,
      groupe_id: slot.groupe_id,
      intake_form_id: form.id,
      status: "booked",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(STUDENT_PATH);
  revalidatePath(ADMIN_PATH);
  return { success: true, booking: booking as CoachingCallBooking };
}

export async function createCoachCallSlot(data: {
  coach_id?: string;
  groupe_id?: string;
  start_at: string;
  end_at: string;
  location?: string;
  notes?: string;
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const isCoach = auth.profile.role === "coach";
  const coachId = isCoach ? auth.user.id : data.coach_id;
  const groupeId = isCoach ? data.groupe_id : data.groupe_id;

  if (!coachId || !groupeId) {
    return { error: "Coach et classe requis pour créer un créneau." };
  }

  const startAt = new Date(data.start_at);
  const endAt = new Date(data.end_at);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: "Dates de créneau invalides." };
  }

  if (endAt <= startAt) {
    return { error: "L'heure de fin doit être après l'heure de début." };
  }

  if (isCoach && coachId !== auth.user.id) {
    return { error: "Un coach ne peut créer des créneaux que pour lui-même." };
  }

  // Verify coach is assigned to this groupe (multi-group check)
  if (isCoach) {
    const hasAccess = await canCoachAccessGroupe(coachId, groupeId);
    if (!hasAccess) {
      return { error: "Tu n'es pas rattaché à cette classe." };
    }
  }

  const { data: slot, error } = await admin
    .from("coaching_call_slots")
    .insert({
      coach_id: coachId,
      groupe_id: groupeId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      location: data.location?.trim() || null,
      notes: data.notes?.trim() || null,
      created_by: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true, slot: slot as CoachingCallSlot };
}

export async function updateBookingStatus(data: {
  bookingId: string;
  status: CoachingCallBookingStatus;
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("coaching_call_bookings")
    .select("*, student:profiles!coaching_call_bookings_student_id_fkey(groupe_id)")
    .eq("id", data.bookingId)
    .maybeSingle();

  if (!booking) {
    return { error: "Rendez-vous introuvable." };
  }

  if (
    auth.profile.role === "coach" &&
    booking.coach_id !== auth.user.id &&
    !canCoachAccessStudent(auth.profile.groupe_id, booking.student?.groupe_id ?? null)
  ) {
    return { error: "Accès refusé à ce rendez-vous." };
  }

  const { data: updatedBooking, error } = await admin
    .from("coaching_call_bookings")
    .update({
      status: data.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.bookingId)
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true, booking: updatedBooking as CoachingCallBooking };
}

export async function saveStudentPointAProfile(data: {
  student_id: string;
  groupe_id: string;
  coach_id: string | null;
  intake_form_id: string | null;
  booking_id: string | null;
  mentality: CoachingMentality;
  school_level: CoachingSchoolLevel;
  work_capacity: CoachingWorkCapacity;
  method_level: CoachingMethodLevel;
  coach_report: string;
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { data: student } = await admin
    .from("profiles")
    .select("groupe_id")
    .eq("id", data.student_id)
    .maybeSingle();

  if (!student?.groupe_id) {
    return { error: "Élève introuvable ou sans classe." };
  }

  if (
    auth.profile.role === "coach" &&
    !canCoachAccessStudent(auth.profile.groupe_id, student.groupe_id)
  ) {
    return { error: "Accès refusé à cet élève." };
  }

  const confidenceScore = calculateConfidenceScore({
    mentality: data.mentality,
    schoolLevel: data.school_level,
    workCapacity: data.work_capacity,
    methodLevel: data.method_level,
  });

  const { data: profile, error } = await admin
    .from("coaching_student_profiles")
    .upsert(
      {
        student_id: data.student_id,
        groupe_id: data.groupe_id,
        coach_id: data.coach_id,
        intake_form_id: data.intake_form_id,
        booking_id: data.booking_id,
        mentality: data.mentality,
        school_level: data.school_level,
        work_capacity: data.work_capacity,
        method_level: data.method_level,
        confidence_score: confidenceScore,
        coach_report: data.coach_report.trim() || null,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" }
    )
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  return { success: true, profile: profile as CoachingStudentProfile };
}

// ─── Coach ↔ Groupe assignment actions ───────────────────────────────────────

export async function assignCoachToGroupe(data: { coach_id: string; groupe_id: string }) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;
  if (auth.profile.role === "coach") {
    return { error: "Seul un admin peut assigner un coach à une classe." };
  }

  const admin = createAdminClient();
  const { data: assignment, error } = await admin
    .from("coach_groupe_assignments")
    .upsert({ coach_id: data.coach_id, groupe_id: data.groupe_id }, { onConflict: "coach_id,groupe_id" })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  return { success: true, assignment: assignment as CoachGroupeAssignment };
}

export async function removeCoachFromGroupe(data: { coach_id: string; groupe_id: string }) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;
  if (auth.profile.role === "coach") {
    return { error: "Seul un admin peut retirer un coach d'une classe." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("coach_groupe_assignments")
    .delete()
    .eq("coach_id", data.coach_id)
    .eq("groupe_id", data.groupe_id);

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  return { success: true };
}

export async function deleteCoachCallSlot(slotId: string) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  // Check if slot has a booking
  const { data: booking } = await admin
    .from("coaching_call_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .maybeSingle();

  if (booking) {
    return { error: "Ce créneau a déjà été réservé par un élève. Annule le RDV d'abord." };
  }

  const { data: slot } = await admin
    .from("coaching_call_slots")
    .select("coach_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return { error: "Créneau introuvable." };

  // Coach can only delete their own slots
  if (auth.profile.role === "coach" && slot.coach_id !== auth.user.id) {
    return { error: "Tu ne peux supprimer que tes propres créneaux." };
  }

  const { error } = await admin
    .from("coaching_call_slots")
    .delete()
    .eq("id", slotId);

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true };
}

export async function assignCoachToBooking(data: { booking_id: string; coach_id: string }) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;
  if (auth.profile.role === "coach") {
    return { error: "Seul un admin peut réassigner un RDV." };
  }

  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("coaching_call_bookings")
    .update({ coach_id: data.coach_id, updated_at: new Date().toISOString() })
    .eq("id", data.booking_id)
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true, booking: booking as CoachingCallBooking };
}

// ─── Coaching Videos CRUD ──────────────────────────────────────────────────────

export async function createCoachingVideo(data: {
  title: string;
  description?: string;
  video_url?: string;
  vimeo_id?: string;
  category: "motivation" | "methode";
  university_dossier_id?: string | null;
  order_index?: number;
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;
  if (auth.profile.role === "coach") return { error: "Seul un admin peut gérer les vidéos." };

  const admin = createAdminClient();
  const { data: video, error } = await admin
    .from("coaching_videos")
    .insert({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      video_url: data.video_url?.trim() || null,
      vimeo_id: data.vimeo_id?.trim() || null,
      category: data.category,
      university_dossier_id: data.university_dossier_id ?? null,
      order_index: data.order_index ?? 0,
      created_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true, video };
}

export async function updateCoachingVideo(
  videoId: string,
  data: {
    title?: string;
    description?: string | null;
    video_url?: string | null;
    vimeo_id?: string | null;
    category?: "motivation" | "methode";
    university_dossier_id?: string | null;
    order_index?: number;
    visible?: boolean;
  },
) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;
  if (auth.profile.role === "coach") return { error: "Seul un admin peut gérer les vidéos." };

  const admin = createAdminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) update.title = data.title.trim();
  if (data.description !== undefined) update.description = data.description?.trim() || null;
  if (data.video_url !== undefined) update.video_url = data.video_url?.trim() || null;
  if (data.vimeo_id !== undefined) update.vimeo_id = data.vimeo_id?.trim() || null;
  if (data.category !== undefined) update.category = data.category;
  if (data.university_dossier_id !== undefined) update.university_dossier_id = data.university_dossier_id;
  if (data.order_index !== undefined) update.order_index = data.order_index;
  if (data.visible !== undefined) update.visible = data.visible;

  const { error } = await admin.from("coaching_videos").update(update).eq("id", videoId);
  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true };
}

export async function deleteCoachingVideo(videoId: string) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;
  if (auth.profile.role === "coach") return { error: "Seul un admin peut gérer les vidéos." };

  const admin = createAdminClient();
  const { error } = await admin.from("coaching_videos").delete().eq("id", videoId);
  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true };
}

// ─── Coaching Chat Thread Management ───────────────────────────────────────────

export async function assignCoachToThread(data: { thread_id: string; coach_id: string }) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("qa_threads")
    .update({ assigned_coach_id: data.coach_id, updated_at: new Date().toISOString() })
    .eq("id", data.thread_id)
    .eq("context_type", "coaching");

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  return { success: true };
}

export async function respondToCoachingThread(data: {
  thread_id: string;
  content: string;
  sender_id: string;
  sender_type?: "coach" | "prof";
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { data: message, error } = await admin
    .from("qa_messages")
    .insert({
      thread_id: data.thread_id,
      sender_id: data.sender_id,
      sender_type: data.sender_type ?? (auth.profile.role === "coach" ? "coach" : "prof"),
      content_type: "text",
      content: data.content,
      read_by_prof: true,
      read_by_student: false,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Update thread status
  await admin
    .from("qa_threads")
    .update({ status: "prof_answered", updated_at: new Date().toISOString() })
    .eq("id", data.thread_id);

  revalidatePath(ADMIN_PATH);
  return { success: true, message };
}

// ─── Coaching RDV Management ───────────────────────────────────────────────────

export async function assignCoachToRdv(data: {
  rdv_request_id: string;
  coach_id: string;
  scheduled_at?: string;
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("coaching_rdv_requests")
    .update({
      assigned_coach_id: data.coach_id,
      scheduled_at: data.scheduled_at ?? null,
      status: "assigned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.rdv_request_id);

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true };
}

export async function updateRdvRequestStatus(data: {
  rdv_request_id: string;
  status: "pending" | "assigned" | "completed" | "cancelled";
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("coaching_rdv_requests")
    .update({ status: data.status, updated_at: new Date().toISOString() })
    .eq("id", data.rdv_request_id);

  if (error) return { error: error.message };

  revalidatePath(ADMIN_PATH);
  revalidatePath(STUDENT_PATH);
  return { success: true };
}

// ─── Student Niveau/Mental Management ──────────────────────────────────────────

export async function updateStudentNiveauMental(data: {
  student_id: string;
  niveau_initial?: "fort" | "moyen" | "fragile" | null;
  mental_initial?: "fort" | "moyen" | "fragile" | null;
}) {
  const auth = await requireCoachOrAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  // Check if profile exists, if not create one
  const { data: existing } = await admin
    .from("coaching_student_profiles")
    .select("id")
    .eq("student_id", data.student_id)
    .maybeSingle();

  if (existing) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.niveau_initial !== undefined) update.niveau_initial = data.niveau_initial;
    if (data.mental_initial !== undefined) update.mental_initial = data.mental_initial;
    const { error } = await admin.from("coaching_student_profiles").update(update).eq("student_id", data.student_id);
    if (error) return { error: error.message };
  } else {
    // Need student's groupe_id to create
    const { data: student } = await admin.from("profiles").select("groupe_id").eq("id", data.student_id).single();
    if (!student?.groupe_id) return { error: "L'élève n'est pas dans un groupe." };

    const { error } = await admin.from("coaching_student_profiles").insert({
      student_id: data.student_id,
      groupe_id: student.groupe_id,
      niveau_initial: data.niveau_initial ?? null,
      mental_initial: data.mental_initial ?? null,
      confidence_score: 0,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(ADMIN_PATH);
  return { success: true };
}

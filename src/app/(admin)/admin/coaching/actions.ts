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

function canCoachAccessStudent(coachGroupId: string | null, studentGroupId: string | null) {
  return Boolean(coachGroupId && studentGroupId && coachGroupId === studentGroupId);
}

export async function submitStudentCoachingForm(data: {
  form_template_id: string;
  answers: Record<string, string>;
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
    Object.entries(data.answers ?? {}).map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
  );

  const payload = {
    student_id: auth.user.id,
    groupe_id: auth.profile.groupe_id,
    form_template_id: template.id,
    answers: sanitizedAnswers,
    phone: sanitizedAnswers.phone || null,
    city: sanitizedAnswers.city || null,
    bac_specialties: sanitizedAnswers.bac_specialties || null,
    parcours_label: sanitizedAnswers.parcours_label || null,
    why_medicine: sanitizedAnswers.why_medicine || null,
    expectations: sanitizedAnswers.expectations || null,
    main_worry: sanitizedAnswers.main_worry || null,
    current_method_description: sanitizedAnswers.current_method_description || null,
    strengths: sanitizedAnswers.strengths || null,
    weaknesses: sanitizedAnswers.weaknesses || null,
    availability_notes: sanitizedAnswers.availability_notes || null,
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
  const groupeId = isCoach ? auth.profile.groupe_id : data.groupe_id;

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

  const { data: coachProfile } = await admin
    .from("profiles")
    .select("id, role, groupe_id")
    .eq("id", coachId)
    .maybeSingle();

  if (!coachProfile || coachProfile.role !== "coach") {
    return { error: "Coach introuvable." };
  }

  if (coachProfile.groupe_id && coachProfile.groupe_id !== groupeId) {
    return { error: "Ce coach n'est pas rattaché à cette classe." };
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

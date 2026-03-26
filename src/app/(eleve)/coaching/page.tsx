import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { StudentCoachingShell } from "@/components/eleve/coaching/student-coaching-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  CoachingCallBooking,
  CoachingCallSlot,
  CoachingIntakeForm,
  Groupe,
  Profile,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function StudentCoachingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!currentProfile) {
    redirect("/login");
  }

  const admin = createAdminClient();
  let groupe: Groupe | null = null;
  let coaches: Profile[] = [];
  let intakeForm: CoachingIntakeForm | null = null;
  let booking: CoachingCallBooking | null = null;
  let bookingSlot: CoachingCallSlot | null = null;
  let availableSlots: CoachingCallSlot[] = [];
  let setupError: string | null = null;

  if (currentProfile.groupe_id) {
    const now = new Date().toISOString();
    const [groupeRes, coachesRes, formRes, bookingRes, slotsRes, bookingsRes] = await Promise.all([
      admin.from("groupes").select("*").eq("id", currentProfile.groupe_id).maybeSingle(),
      admin.from("profiles").select("*").eq("role", "coach").eq("groupe_id", currentProfile.groupe_id).order("last_name").order("first_name"),
      admin.from("coaching_intake_forms").select("*").eq("student_id", currentProfile.id).maybeSingle(),
      admin
        .from("coaching_call_bookings")
        .select("*")
        .eq("student_id", currentProfile.id)
        .in("status", ["booked", "completed"])
        .order("booked_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("coaching_call_slots").select("*").eq("groupe_id", currentProfile.groupe_id).gte("end_at", now).order("start_at"),
      admin
        .from("coaching_call_bookings")
        .select("*")
        .eq("groupe_id", currentProfile.groupe_id)
        .in("status", ["booked", "completed"]),
    ]);

    setupError =
      groupeRes.error?.message ??
      coachesRes.error?.message ??
      formRes.error?.message ??
      bookingRes.error?.message ??
      slotsRes.error?.message ??
      bookingsRes.error?.message ??
      null;

    groupe = (groupeRes.data ?? null) as Groupe | null;
    coaches = (coachesRes.data ?? []) as Profile[];
    intakeForm = (formRes.data ?? null) as CoachingIntakeForm | null;
    booking = (bookingRes.data ?? null) as CoachingCallBooking | null;

    if (booking?.slot_id) {
      const bookingSlotRes = await admin.from("coaching_call_slots").select("*").eq("id", booking.slot_id).maybeSingle();
      if (!setupError && bookingSlotRes.error) {
        setupError = bookingSlotRes.error.message;
      }
      bookingSlot = (bookingSlotRes.data ?? null) as CoachingCallSlot | null;
    }

    const takenSlotIds = new Set(
      ((bookingsRes.data ?? []) as CoachingCallBooking[])
        .filter((item) => item.student_id !== currentProfile.id)
        .map((item) => item.slot_id)
    );

    availableSlots = ((slotsRes.data ?? []) as CoachingCallSlot[]).filter(
      (slot) => !takenSlotIds.has(slot.id) || slot.id === booking?.slot_id
    );
  }

  return (
    <div>
      <Header title="Coaching" />
      <StudentCoachingShell
        currentProfile={currentProfile as Profile}
        groupe={groupe}
        coaches={coaches}
        initialForm={intakeForm}
        initialBooking={booking}
        initialBookingSlot={bookingSlot}
        initialAvailableSlots={availableSlots}
        setupError={setupError}
      />
    </div>
  );
}

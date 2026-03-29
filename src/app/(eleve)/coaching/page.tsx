import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { StudentCoachingShell } from "@/components/eleve/coaching/student-coaching-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CoachingVideo, CoachingRdvRequest, CoachingCallSlot, CoachingCallBooking, Profile, Groupe, Dossier } from "@/types/database";
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

  // Coaches and admins go to admin coaching page
  if (["coach", "admin", "superadmin"].includes(currentProfile.role)) {
    redirect("/admin/coaching");
  }

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
  const [videosRes, threadRes, rdvRes, coachesRes, slotsRes, bookingsRes, myBookingRes] = await Promise.all([
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

    // Available slots for booking (future, for student's groupe)
    currentProfile.groupe_id
      ? admin
          .from("coaching_call_slots")
          .select("*")
          .eq("groupe_id", currentProfile.groupe_id)
          .gte("start_at", new Date().toISOString())
          .order("start_at")
      : Promise.resolve({ data: [] as any[] }),

    // Existing bookings (to know which slots are taken)
    currentProfile.groupe_id
      ? admin
          .from("coaching_call_bookings")
          .select("*")
          .eq("groupe_id", currentProfile.groupe_id)
          .in("status", ["booked", "completed"])
      : Promise.resolve({ data: [] as any[] }),

    // Student's own booking
    admin
      .from("coaching_call_bookings")
      .select("*, slot:coaching_call_slots(*)")
      .eq("student_id", user.id)
      .eq("status", "booked")
      .order("booked_at", { ascending: false })
      .limit(1),
  ]);

  const videos = (videosRes.data ?? []) as CoachingVideo[];
  const initialThread = ((threadRes.data ?? [])[0] ?? null) as QaThread | null;
  const rdvRequests = (rdvRes.data ?? []) as CoachingRdvRequest[];
  const allSlots = (slotsRes.data ?? []) as CoachingCallSlot[];
  const allBookings = (bookingsRes.data ?? []) as CoachingCallBooking[];
  const myBooking = ((myBookingRes.data ?? [])[0] ?? null) as (CoachingCallBooking & { slot?: CoachingCallSlot }) | null;
  // Filter out booked slots
  const bookedSlotIds = new Set(allBookings.map(b => b.slot_id));
  const availableSlots = allSlots.filter(s => !bookedSlotIds.has(s.id) || s.id === myBooking?.slot_id);
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
        availableSlots={availableSlots}
        myBooking={myBooking}
      />
    </div>
  );
}

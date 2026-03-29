import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { CoachingShell } from "@/components/admin/coaching/coaching-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  CoachGroupeAssignment,
  CoachingCallBooking,
  CoachingCallSlot,
  CoachingIntakeForm,
  CoachingRdvRequest,
  CoachingStudentProfile,
  CoachingVideo,
  CoachRecurringAvailability,
  Dossier,
  FormField,
  FormTemplate,
  Groupe,
  Profile,
} from "@/types/database";
import type { QaThread } from "@/types/qa";

export const dynamic = "force-dynamic";

export default async function CoachingPage() {
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

  const isCoachOrAdmin = ["admin", "superadmin", "coach"].includes(currentProfile.role);
  const admin = createAdminClient();
  const isCoach = currentProfile.role === "coach";

  const emptyData = {
    dossiers: [] as Dossier[],
    groupes: [] as Groupe[],
    students: [] as Profile[],
    coaches: [] as Profile[],
    intakeForms: [] as CoachingIntakeForm[],
    slots: [] as CoachingCallSlot[],
    bookings: [] as CoachingCallBooking[],
    pointAProfiles: [] as CoachingStudentProfile[],
    formTemplate: null as FormTemplate | null,
    formFields: [] as FormField[],
    coachAssignments: [] as CoachGroupeAssignment[],
    coachingThreads: [] as QaThread[],
    coachingRdvRequests: [] as CoachingRdvRequest[],
    coachingVideos: [] as CoachingVideo[],
    recurringAvailability: [] as CoachRecurringAvailability[],
  };

  let data = emptyData;
  let setupError: string | null = null;

  if (isCoachOrAdmin) {
    // For coaches, get their assigned groupe IDs from coach_groupe_assignments
    let coachGroupeIds: string[] = [];
    if (isCoach) {
      const { data: assignments } = await admin
        .from("coach_groupe_assignments")
        .select("groupe_id")
        .eq("coach_id", user.id);
      coachGroupeIds = (assignments ?? []).map((a) => a.groupe_id);
      // Fallback to profiles.groupe_id for backward compat
      if (coachGroupeIds.length === 0 && currentProfile.groupe_id) {
        coachGroupeIds = [currentProfile.groupe_id];
      }
    }

    const groupesQuery = isCoach && coachGroupeIds.length > 0
      ? admin.from("groupes").select("*").in("id", coachGroupeIds).order("name")
      : isCoach
        ? admin.from("groupes").select("*").limit(0) // no groups assigned
        : admin.from("groupes").select("*").order("name");

    const studentsQuery = isCoach && coachGroupeIds.length > 0
      ? admin.from("profiles").select("*").eq("role", "eleve").in("groupe_id", coachGroupeIds).order("last_name").order("first_name")
      : isCoach
        ? admin.from("profiles").select("*").eq("role", "eleve").limit(0)
        : admin.from("profiles").select("*").eq("role", "eleve").order("last_name").order("first_name");

    const coachesQuery = admin.from("profiles").select("*").eq("role", "coach").order("last_name").order("first_name");

    const intakeFormsQuery = isCoach && coachGroupeIds.length > 0
      ? admin.from("coaching_intake_forms").select("*").in("groupe_id", coachGroupeIds).order("submitted_at", { ascending: false })
      : isCoach
        ? admin.from("coaching_intake_forms").select("*").limit(0)
        : admin.from("coaching_intake_forms").select("*").order("submitted_at", { ascending: false });

    const slotsQuery = isCoach
      ? admin.from("coaching_call_slots").select("*").eq("coach_id", user.id).order("start_at")
      : admin.from("coaching_call_slots").select("*").order("start_at");

    const bookingsQuery = isCoach && coachGroupeIds.length > 0
      ? admin.from("coaching_call_bookings").select("*").in("groupe_id", coachGroupeIds).order("booked_at", { ascending: false })
      : isCoach
        ? admin.from("coaching_call_bookings").select("*").eq("coach_id", user.id).order("booked_at", { ascending: false })
        : admin.from("coaching_call_bookings").select("*").order("booked_at", { ascending: false });

    const pointAProfilesQuery = isCoach && coachGroupeIds.length > 0
      ? admin.from("coaching_student_profiles").select("*").in("groupe_id", coachGroupeIds).order("reviewed_at", { ascending: false, nullsFirst: false })
      : isCoach
        ? admin.from("coaching_student_profiles").select("*").limit(0)
        : admin.from("coaching_student_profiles").select("*").order("reviewed_at", { ascending: false, nullsFirst: false });

    const assignmentsQuery = admin.from("coach_groupe_assignments").select("*").order("created_at");
    const dossiersQuery = admin.from("dossiers").select("*").order("order_index");

    // New coaching data queries
    const coachingThreadsQuery = isCoach
      ? admin.from("qa_threads").select("*").eq("context_type", "coaching").eq("assigned_coach_id", user.id).order("updated_at", { ascending: false })
      : admin.from("qa_threads").select("*").eq("context_type", "coaching").order("updated_at", { ascending: false });

    const rdvRequestsQuery = isCoach
      ? admin.from("coaching_rdv_requests").select("*").eq("assigned_coach_id", user.id).order("created_at", { ascending: false })
      : admin.from("coaching_rdv_requests").select("*").order("created_at", { ascending: false });

    const videosQuery = admin.from("coaching_videos").select("*").order("order_index");

    const recurringQuery = isCoach
      ? admin.from("coach_recurring_availability").select("*").eq("coach_id", user.id).order("day_of_week").order("start_time")
      : admin.from("coach_recurring_availability").select("*").order("day_of_week").order("start_time");

    const [groupesRes, studentsRes, coachesRes, intakeFormsRes, slotsRes, bookingsRes, pointAProfilesRes, formTemplateRes, assignmentsRes, dossiersRes, coachingThreadsRes, rdvRequestsRes, videosRes, recurringRes] = await Promise.all([
      groupesQuery,
      studentsQuery,
      coachesQuery,
      intakeFormsQuery,
      slotsQuery,
      bookingsQuery,
      pointAProfilesQuery,
      admin.from("form_templates").select("*").eq("slug", "coaching_onboarding").eq("is_active", true).maybeSingle(),
      assignmentsQuery,
      dossiersQuery,
      coachingThreadsQuery,
      rdvRequestsQuery,
      videosQuery,
      recurringQuery,
    ]);

    setupError =
      groupesRes.error?.message ??
      studentsRes.error?.message ??
      coachesRes.error?.message ??
      intakeFormsRes.error?.message ??
      slotsRes.error?.message ??
      bookingsRes.error?.message ??
      pointAProfilesRes.error?.message ??
      formTemplateRes.error?.message ??
      null;

    let formFields: FormField[] = [];
    if (formTemplateRes.data?.id) {
      const formFieldsRes = await admin
        .from("form_fields")
        .select("*")
        .eq("form_template_id", formTemplateRes.data.id)
        .order("order_index");

      if (!setupError && formFieldsRes.error) {
        setupError = formFieldsRes.error.message;
      }
      formFields = (formFieldsRes.data ?? []) as FormField[];
    }

    data = {
      dossiers: (dossiersRes.data ?? []) as Dossier[],
      groupes: (groupesRes.data ?? []) as Groupe[],
      students: (studentsRes.data ?? []) as Profile[],
      coaches: (coachesRes.data ?? []) as Profile[],
      intakeForms: (intakeFormsRes.data ?? []) as CoachingIntakeForm[],
      slots: (slotsRes.data ?? []) as CoachingCallSlot[],
      bookings: (bookingsRes.data ?? []) as CoachingCallBooking[],
      pointAProfiles: (pointAProfilesRes.data ?? []) as CoachingStudentProfile[],
      formTemplate: (formTemplateRes.data ?? null) as FormTemplate | null,
      formFields,
      coachAssignments: (assignmentsRes.data ?? []) as CoachGroupeAssignment[],
      coachingThreads: (coachingThreadsRes.data ?? []) as QaThread[],
      coachingRdvRequests: (rdvRequestsRes.data ?? []) as CoachingRdvRequest[],
      coachingVideos: (videosRes.data ?? []) as CoachingVideo[],
      recurringAvailability: (recurringRes.data ?? []) as CoachRecurringAvailability[],
    };
  }

  return (
    <div>
      <Header title="Coaching" />
      <CoachingShell
        currentProfile={currentProfile as Profile}
        dossiers={data.dossiers}
        groupes={data.groupes}
        students={data.students}
        coaches={data.coaches}
        initialIntakeForms={data.intakeForms}
        initialSlots={data.slots}
        initialBookings={data.bookings}
        initialPointAProfiles={data.pointAProfiles}
        formTemplate={data.formTemplate}
        formFields={data.formFields}
        coachAssignments={data.coachAssignments}
        coachingThreads={data.coachingThreads}
        coachingRdvRequests={data.coachingRdvRequests}
        coachingVideos={data.coachingVideos}
        recurringAvailability={data.recurringAvailability}
        setupError={setupError}
      />
    </div>
  );
}

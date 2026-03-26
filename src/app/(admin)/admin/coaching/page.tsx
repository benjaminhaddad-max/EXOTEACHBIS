import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { CoachingShell } from "@/components/admin/coaching/coaching-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  CoachingCallBooking,
  CoachingCallSlot,
  CoachingIntakeForm,
  CoachingStudentProfile,
  FormField,
  FormTemplate,
  Groupe,
  Profile,
} from "@/types/database";

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
  const coachGroupId = currentProfile.groupe_id;

  const emptyData = {
    groupes: [] as Groupe[],
    students: [] as Profile[],
    coaches: [] as Profile[],
    intakeForms: [] as CoachingIntakeForm[],
    slots: [] as CoachingCallSlot[],
    bookings: [] as CoachingCallBooking[],
    pointAProfiles: [] as CoachingStudentProfile[],
    formTemplate: null as FormTemplate | null,
    formFields: [] as FormField[],
  };

  let data = emptyData;
  let setupError: string | null = null;

  if (isCoachOrAdmin && (!isCoach || coachGroupId)) {
    const groupesQuery = isCoach
      ? admin.from("groupes").select("*").eq("id", coachGroupId!).order("name")
      : admin.from("groupes").select("*").order("name");

    const studentsQuery = isCoach
      ? admin.from("profiles").select("*").eq("role", "eleve").eq("groupe_id", coachGroupId!).order("last_name").order("first_name")
      : admin.from("profiles").select("*").eq("role", "eleve").order("last_name").order("first_name");

    const coachesQuery = isCoach
      ? admin.from("profiles").select("*").eq("role", "coach").eq("groupe_id", coachGroupId!).order("last_name").order("first_name")
      : admin.from("profiles").select("*").eq("role", "coach").order("last_name").order("first_name");

    const intakeFormsQuery = isCoach
      ? admin.from("coaching_intake_forms").select("*").eq("groupe_id", coachGroupId!).order("submitted_at", { ascending: false })
      : admin.from("coaching_intake_forms").select("*").order("submitted_at", { ascending: false });

    const slotsQuery = isCoach
      ? admin.from("coaching_call_slots").select("*").eq("groupe_id", coachGroupId!).order("start_at")
      : admin.from("coaching_call_slots").select("*").order("start_at");

    const bookingsQuery = isCoach
      ? admin.from("coaching_call_bookings").select("*").eq("groupe_id", coachGroupId!).order("booked_at", { ascending: false })
      : admin.from("coaching_call_bookings").select("*").order("booked_at", { ascending: false });

    const pointAProfilesQuery = isCoach
      ? admin.from("coaching_student_profiles").select("*").eq("groupe_id", coachGroupId!).order("reviewed_at", { ascending: false, nullsFirst: false })
      : admin.from("coaching_student_profiles").select("*").order("reviewed_at", { ascending: false, nullsFirst: false });

    const [groupesRes, studentsRes, coachesRes, intakeFormsRes, slotsRes, bookingsRes, pointAProfilesRes, formTemplateRes] = await Promise.all([
      groupesQuery,
      studentsQuery,
      coachesQuery,
      intakeFormsQuery,
      slotsQuery,
      bookingsQuery,
      pointAProfilesQuery,
      admin.from("form_templates").select("*").eq("slug", "coaching_onboarding").eq("is_active", true).maybeSingle(),
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
      groupes: (groupesRes.data ?? []) as Groupe[],
      students: (studentsRes.data ?? []) as Profile[],
      coaches: (coachesRes.data ?? []) as Profile[],
      intakeForms: (intakeFormsRes.data ?? []) as CoachingIntakeForm[],
      slots: (slotsRes.data ?? []) as CoachingCallSlot[],
      bookings: (bookingsRes.data ?? []) as CoachingCallBooking[],
      pointAProfiles: (pointAProfilesRes.data ?? []) as CoachingStudentProfile[],
      formTemplate: (formTemplateRes.data ?? null) as FormTemplate | null,
      formFields,
    };
  }

  return (
    <div>
      <Header title="Coaching" />
      <CoachingShell
        currentProfile={currentProfile as Profile}
        groupes={data.groupes}
        students={data.students}
        coaches={data.coaches}
        initialIntakeForms={data.intakeForms}
        initialSlots={data.slots}
        initialBookings={data.bookings}
        initialPointAProfiles={data.pointAProfiles}
        formTemplate={data.formTemplate}
        formFields={data.formFields}
        setupError={setupError}
      />
    </div>
  );
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { CoachingRdvType } from "@/types/database";

export async function createCoachingRdvRequest(data: {
  rdv_type: CoachingRdvType;
  message: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, groupe_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profil introuvable." };
  if (!profile.groupe_id) return { error: "Tu dois être assigné à un groupe pour demander un RDV." };

  // Check no pending/assigned request exists
  const { data: existing } = await supabase
    .from("coaching_rdv_requests")
    .select("id")
    .eq("student_id", user.id)
    .in("status", ["pending", "assigned"])
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: "Tu as déjà une demande de RDV en cours." };
  }

  const { data: rdv, error } = await supabase
    .from("coaching_rdv_requests")
    .insert({
      student_id: user.id,
      groupe_id: profile.groupe_id,
      rdv_type: data.rdv_type,
      message: data.message,
      status: "pending",
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/coaching");
  return { success: true, data: rdv };
}

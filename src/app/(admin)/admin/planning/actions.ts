"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/planning";

export async function createEvent(data: {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  type: "cours" | "examen" | "reunion" | "autre";
  groupe_id?: string | null;
  groupe_ids?: string[];
  zoom_link?: string;
  location?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const base = {
    title: data.title,
    description: data.description || null,
    start_at: data.start_at,
    end_at: data.end_at,
    type: data.type,
    zoom_link: data.zoom_link || null,
    location: data.location || null,
    created_by: user!.id,
  };

  // Batch insert: one event per groupe_id
  const ids = data.groupe_ids && data.groupe_ids.length > 0
    ? data.groupe_ids
    : [data.groupe_id || null];

  const rows = ids.map(gid => ({ ...base, groupe_id: gid }));

  const { error } = await supabase.from("events").insert(rows);

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateEvent(
  id: string,
  data: {
    title: string;
    description?: string;
    start_at: string;
    end_at: string;
    type: "cours" | "examen" | "reunion" | "autre";
    groupe_id?: string | null;
    zoom_link?: string;
    location?: string;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({
      title: data.title,
      description: data.description || null,
      start_at: data.start_at,
      end_at: data.end_at,
      type: data.type,
      groupe_id: data.groupe_id || null,
      zoom_link: data.zoom_link || null,
      location: data.location || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteEvent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

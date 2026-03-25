"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/annonces";

export async function createAnnonce(data: {
  title: string;
  content: string;
  groupe_id?: string | null;
  pinned?: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("posts").insert({
    title: data.title,
    content: data.content,
    groupe_id: data.groupe_id || null,
    pinned: data.pinned ?? false,
    type: "annonce",
    author_id: user!.id,
  });

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateAnnonce(
  id: string,
  data: {
    title: string;
    content: string;
    groupe_id?: string | null;
    pinned?: boolean;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({
      title: data.title,
      content: data.content,
      groupe_id: data.groupe_id || null,
      pinned: data.pinned ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("type", "annonce");

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteAnnonce(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("type", "annonce");
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function togglePin(id: string, pinned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ pinned: !pinned })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/forum";

export async function createPost(data: {
  content: string;
  parent_id?: string | null;
  type: "forum_question" | "forum_reply";
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase.from("posts").insert({
    author_id: user.id,
    content: data.content.trim(),
    parent_id: data.parent_id || null,
    type: data.type,
  });

  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deletePost(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: post } = await supabase.from("posts").select("author_id").eq("id", id).single();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!post) return { error: "Post introuvable" };
  if (post.author_id !== user.id && !["admin", "superadmin"].includes(profile?.role ?? "")) {
    return { error: "Non autorisé" };
  }

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

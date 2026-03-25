"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/flashcards";

export async function createDeck(data: { name: string; description?: string; matiere_id?: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcard_decks").insert({
    name: data.name,
    description: data.description || null,
    matiere_id: data.matiere_id || null,
    visible: true,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateDeck(id: string, data: { name: string; description?: string; matiere_id?: string | null; visible?: boolean }) {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcard_decks").update({
    name: data.name,
    description: data.description || null,
    matiere_id: data.matiere_id || null,
    visible: data.visible ?? true,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteDeck(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcard_decks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function createCard(data: { deck_id: string; front: string; back: string; order_index?: number }) {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").insert({
    deck_id: data.deck_id,
    front: data.front,
    back: data.back,
    order_index: data.order_index ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function updateCard(id: string, data: { front: string; back: string }) {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").update({ front: data.front, back: data.back }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteCard(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

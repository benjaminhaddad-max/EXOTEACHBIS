import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { QcmPlayer } from "@/components/qcm/qcm-player";
import Link from "next/link";

interface Props {
  params: Promise<{ serieId: string }>;
}

export default async function SeriePage({ params }: Props) {
  const { serieId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Vérifier si admin pour afficher le bandeau retour
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  // Charger la série (sans filtre visible — les séries ad-hoc d'entraînement sont visible=false)
  const { data: serie } = await supabase
    .from("series")
    .select(`
      *,
      cours:cours (id, name, matiere_id)
    `)
    .eq("id", serieId)
    .single();

  if (!serie) notFound();

  // Charger les questions avec options (dans l'ordre de la série)
  const { data: serieQuestions } = await supabase
    .from("series_questions")
    .select(`
      order_index,
      section_id,
      question:questions (
        id, text, type, explanation, tags, image_url,
        options (id, label, text, is_correct, order_index, justification, image_url)
      )
    `)
    .eq("series_id", serieId)
    .order("order_index");

  // Fetch sections for this serie
  const { data: sectionsData } = await supabase
    .from("series_sections")
    .select("id, title, intro_text, image_url, order_index")
    .eq("series_id", serieId)
    .order("order_index");

  // Build question→section map
  const questionSectionMap: Record<string, string> = {};
  for (const sq of (serieQuestions ?? [])) {
    if (sq.section_id && (sq as any).question?.id) {
      questionSectionMap[(sq as any).question.id] = sq.section_id;
    }
  }

  const questions = (serieQuestions ?? [])
    .map((sq: any) => sq.question)
    .filter(Boolean)
    .map((q: any) => ({
      ...q,
      options: (q.options ?? []).sort((a: any, b: any) => a.order_index - b.order_index),
    }));

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="text-gray-500">Cette série ne contient pas encore de questions.</p>
      </div>
    );
  }

  return (
    <>
      <QcmPlayer
        serie={serie}
        questions={questions}
        userId={user.id}
        sections={sectionsData ?? undefined}
        questionSectionMap={Object.keys(questionSectionMap).length > 0 ? questionSectionMap : undefined}
        isAdminPreview={isAdmin}
      />
    </>
  );
}

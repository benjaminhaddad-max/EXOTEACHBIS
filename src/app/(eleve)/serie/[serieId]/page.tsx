import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { QcmPlayer } from "@/components/qcm/qcm-player";

interface Props {
  params: Promise<{ serieId: string }>;
}

export default async function SeriePage({ params }: Props) {
  const { serieId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Charger la série
  const { data: serie } = await supabase
    .from("series")
    .select(`
      *,
      cours:cours (id, name, matiere_id)
    `)
    .eq("id", serieId)
    .eq("visible", true)
    .single();

  if (!serie) notFound();

  // Charger les questions avec options (dans l'ordre de la série)
  const { data: serieQuestions } = await supabase
    .from("series_questions")
    .select(`
      order_index,
      question:questions (
        id, text, type, explanation, tags,
        options (id, label, text, is_correct, order_index)
      )
    `)
    .eq("series_id", serieId)
    .order("order_index");

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
    <QcmPlayer
      serie={serie}
      questions={questions}
      userId={user!.id}
    />
  );
}

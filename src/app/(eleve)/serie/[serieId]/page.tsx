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
      question:questions (
        id, text, type, explanation, tags, image_url,
        options (id, label, text, is_correct, order_index, justification, image_url)
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
    <>
      {isAdmin && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-xs font-semibold" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
          <span>👁️ Mode aperçu — vue élève</span>
          <Link href="/admin/pedagogie" className="underline hover:no-underline">
            ← Retour à la pédagogie
          </Link>
        </div>
      )}
      <div className={isAdmin ? "pt-9" : ""}>
        <QcmPlayer
          serie={serie}
          questions={questions}
          userId={user.id}
        />
      </div>
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { CoursCard } from "@/components/cours/cours-card";
import { canAccessMatiere, getAccessScopeForUser } from "@/lib/access-scope";

interface Props {
  params: Promise<{ matiereId: string }>;
}

export default async function MatierePage({ params }: Props) {
  const { matiereId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const scope = await getAccessScopeForUser(supabase, user!.id);

  // Charger la matière
  const { data: matiere } = await supabase
    .from("matieres")
    .select("*, dossier:dossiers(id, name)")
    .eq("id", matiereId)
    .single();

  if (!matiere || !canAccessMatiere(matiere as any, scope)) notFound();

  // Charger les cours avec progression
  const { data: cours } = await supabase
    .from("cours")
    .select(`
      *,
      series (id, name, type, visible, timed, duration_minutes, score_definitif),
      user_progress!left (pct_complete, current_page, last_seen_at)
    `)
    .eq("matiere_id", matiereId)
    .eq("visible", true)
    .order("order_index");

  const coursAvecProgress = (cours || []).map((c) => ({
    ...c,
    user_progress: Array.isArray(c.user_progress) ? c.user_progress[0] : c.user_progress,
    series: c.series?.map((s: any) => ({
      ...s,
      nb_questions: 0,
    })),
  }));

  return (
    <div>
      <Header
        title={matiere.name}
        breadcrumb={[
          { label: "Cours", href: "/cours" },
          { label: (matiere.dossier as any)?.name ?? "Dossier", href: "/cours" },
          { label: matiere.name },
        ]}
      />

      {coursAvecProgress.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-500">Aucun cours disponible dans cette matière.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {coursAvecProgress.map((c) => (
            <CoursCard key={c.id} cours={c as any} />
          ))}
        </div>
      )}
    </div>
  );
}

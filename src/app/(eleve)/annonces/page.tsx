import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { Megaphone, Pin, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnnoncesElevePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("groupe_id")
    .eq("id", user!.id)
    .single();

  // Fetch annonces: global + user's groupe
  const { data: annonces } = profile?.groupe_id
    ? await supabase
        .from("posts")
        .select("*, author:profiles(first_name, last_name), groupe:groupes(name, color)")
        .eq("type", "annonce")
        .or(`groupe_id.is.null,groupe_id.eq.${profile.groupe_id}`)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
    : await supabase
        .from("posts")
        .select("*, author:profiles(first_name, last_name), groupe:groupes(name, color)")
        .eq("type", "annonce")
        .is("groupe_id", null)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

  const now = new Date();

  return (
    <div>
      <Header title="Annonces" />

      {!annonces || annonces.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucune annonce</h3>
          <p className="mt-2 text-sm text-gray-500">Les annonces de vos formateurs apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {annonces.map((a: any) => {
            const createdAt = new Date(a.created_at);
            const diffHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            const isNew = diffHours < 24;
            const authorName = a.author
              ? `${a.author.first_name ?? ""} ${a.author.last_name ?? ""}`.trim()
              : "L'équipe pédagogique";

            return (
              <article key={a.id} className={`bg-white rounded-xl border ${a.pinned ? "border-indigo-200 shadow-md" : "border-gray-200 shadow-sm"} overflow-hidden`}>
                {a.pinned && (
                  <div className="bg-indigo-50 px-4 py-1.5 border-b border-indigo-100 flex items-center gap-1.5">
                    <Pin size={12} className="text-indigo-500" />
                    <span className="text-xs font-medium text-indigo-600">Annonce épinglée</span>
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isNew && (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Nouveau</span>
                      )}
                      {a.groupe && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: a.groupe.color }}>
                          <Users size={10} /> {a.groupe.name}
                        </span>
                      )}
                    </div>
                    <time className="text-xs text-gray-400 shrink-0">
                      {createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </time>
                  </div>

                  <h2 className="text-base font-bold text-gray-900 mb-2">{a.title ?? "(sans titre)"}</h2>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{a.content}</p>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                      {authorName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="text-xs text-gray-500">{authorName}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

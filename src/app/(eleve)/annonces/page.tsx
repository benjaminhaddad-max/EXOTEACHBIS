import { createClient } from "@/lib/supabase/server";
import { canAccessDossier, getAccessScopeForUser } from "@/lib/access-scope";
import { getDossierPathLabel } from "@/lib/pedagogie-structure";
import { Header } from "@/components/header";
import { Megaphone, Pin, Users, FolderTree, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AnnoncesElevePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("groupe_id")
    .eq("id", user!.id)
    .single();

  const scope = await getAccessScopeForUser(supabase as any, user!.id);

  const [{ data: annonces }, { data: dossiers }, { data: matieres }] = await Promise.all([
    supabase
      .from("posts")
      .select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)")
      .eq("type", "annonce")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("dossiers").select("id, name, parent_id, color"),
    supabase.from("matieres").select("id, name, color, dossier_id"),
  ]);

  const accessibleMatiereIds = new Set(
    (matieres ?? [])
      .filter((matiere: any) => scope.unrestricted || (matiere.dossier_id && scope.allowedDossierIds.has(matiere.dossier_id)))
      .map((matiere: any) => matiere.id)
  );

  const filteredAnnonces = (annonces ?? []).filter((annonce: any) => {
    if (!annonce.groupe_id && !annonce.dossier_id && !annonce.matiere_id) return true;
    if (annonce.groupe_id) return annonce.groupe_id === profile?.groupe_id;
    if (annonce.dossier_id) return canAccessDossier(annonce.dossier_id, scope);
    if (annonce.matiere_id) return accessibleMatiereIds.has(annonce.matiere_id);
    return false;
  });

  const now = new Date();

  return (
    <div>
      <Header title="Annonces" />

      {!filteredAnnonces || filteredAnnonces.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-navy/20 bg-navy/5 p-12 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-navy/30" />
          <h3 className="mt-4 text-lg font-semibold text-navy">Aucune annonce</h3>
          <p className="mt-2 text-sm text-gray-500">Les annonces de vos formateurs apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAnnonces.map((a: any) => {
            const createdAt = new Date(a.created_at);
            const diffHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            const isNew = diffHours < 24;
            const authorName = a.author
              ? `${a.author.first_name ?? ""} ${a.author.last_name ?? ""}`.trim()
              : "L'équipe pédagogique";

            const audienceBadge = a.matiere
              ? {
                  icon: <BookOpen size={10} />,
                  label: a.matiere.name,
                  style: { backgroundColor: `${a.matiere.color}22`, color: a.matiere.color },
                }
              : a.dossier_id
                ? {
                    icon: <FolderTree size={10} />,
                    label: getDossierPathLabel(a.dossier_id, (dossiers ?? []) as any[]),
                    style: { backgroundColor: "rgba(201,168,76,0.14)", color: "#B9891E" },
                  }
                : a.groupe
                  ? {
                      icon: <Users size={10} />,
                      label: a.groupe.name,
                      style: { backgroundColor: a.groupe.color, color: "white" },
                    }
                  : null;

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
                      {audienceBadge && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium max-w-[360px]" style={audienceBadge.style}>
                          {audienceBadge.icon} <span className="truncate">{audienceBadge.label}</span>
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

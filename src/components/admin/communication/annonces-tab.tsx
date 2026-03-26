"use client";

import { useState, useTransition, useMemo } from "react";
import {
  Megaphone, Plus, Pencil, Trash2, Pin, X, Check, AlertCircle, Loader2, Users, FolderTree, BookOpen,
} from "lucide-react";
import { getDossierPathLabel } from "@/lib/pedagogie-structure";
import type { Dossier, Groupe, Matiere, Profile } from "@/types/database";
import type { SidebarFilter } from "@/components/admin/formulaires/formulaires-sidebar";
import { createAnnonce, updateAnnonce, deleteAnnonce, togglePin } from "@/app/(admin)/admin/annonces/actions";

type Annonce = {
  id: string; title: string | null; content: string;
  groupe_id: string | null; dossier_id: string | null; matiere_id: string | null;
  pinned: boolean; created_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
  groupe?: { name: string; color: string } | null;
  dossier?: { id: string; name: string; color: string; parent_id: string | null } | null;
  matiere?: { id: string; name: string; color: string; dossier_id: string | null } | null;
};

type Modal = { type: "create" } | { type: "edit"; annonce: Annonce } | null;
type Toast = { message: string; kind: "success" | "error" } | null;

const F = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25";

export function AnnoncesTab({
  initialAnnonces, groupes, dossiers, matieres, currentProfile, sidebarFilter, selectedGroupeIds,
}: {
  initialAnnonces: Annonce[];
  groupes: Groupe[];
  dossiers: Dossier[];
  matieres: Matiere[];
  currentProfile: Profile | null;
  sidebarFilter: SidebarFilter;
  selectedGroupeIds?: Set<string>;
}) {
  const [annonces, setAnnonces] = useState<Annonce[]>(initialAnnonces);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, kind: "success" | "error") => { setToast({ message: msg, kind }); setTimeout(() => setToast(null), 3500); };

  const refresh = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    let q = sb.from("posts").select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)").eq("type", "annonce").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    if (currentProfile?.role === "prof" || currentProfile?.role === "coach") q = q.eq("author_id", currentProfile.id);
    const { data } = await q;
    if (data) setAnnonces(data as any[]);
  };

  // Filter by selected classes (multi-select checkboxes)
  const filteredAnnonces = useMemo(() => {
    if (!selectedGroupeIds || selectedGroupeIds.size === 0) return annonces;
    return annonces.filter(a => {
      // Show global annonces + annonces targeting any of the selected classes
      if (!a.groupe_id && !a.dossier_id && !a.matiere_id) return true; // global
      if (a.groupe_id && selectedGroupeIds.has(a.groupe_id)) return true;
      return false;
    });
  }, [annonces, selectedGroupeIds]);

  const getAudienceBadge = (a: Annonce) => {
    if (a.matiere_id) { const m = a.matiere ?? matieres.find(i => i.id === a.matiere_id); return m ? { label: m.name, color: m.color, icon: <BookOpen size={9} /> } : null; }
    if (a.dossier_id) { return { label: getDossierPathLabel(a.dossier_id, dossiers), color: "#C9A84C", icon: <FolderTree size={9} /> }; }
    if (a.groupe_id) { const g = a.groupe ?? groupes.find(i => i.id === a.groupe_id); return g ? { label: g.name, color: g.color, icon: <Users size={9} /> } : null; }
    return null;
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    startTransition(async () => {
      const res = await deleteAnnonce(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setAnnonces(prev => prev.filter(a => a.id !== id));
      showToast("Annonce supprimée", "success");
    });
  };

  const handleTogglePin = (id: string, pinned: boolean) => {
    startTransition(async () => {
      const res = await togglePin(id, pinned);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      await refresh();
    });
  };

  return (
    <div className="p-5 space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          {filteredAnnonces.length} annonce{filteredAnnonces.length !== 1 ? "s" : ""}
        </p>
        <button onClick={() => setModal({ type: "create" })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
          <Plus size={13} /> Nouvelle annonce
        </button>
      </div>

      {/* List */}
      {filteredAnnonces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
          <Megaphone size={32} className="mb-3 opacity-30" />
          <p className="text-sm">Aucune annonce</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAnnonces.map(a => {
            const authorName = a.author ? `${a.author.first_name ?? ""} ${a.author.last_name ?? ""}`.trim() : "Admin";
            const badge = getAudienceBadge(a);
            return (
              <div key={a.id} className="p-4 rounded-xl transition-all group"
                style={{ backgroundColor: a.pinned ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.03)", border: a.pinned ? "1px solid rgba(201,168,76,0.15)" : "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {a.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                          <Pin size={9} /> Épinglée
                        </span>
                      )}
                      {badge ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: badge.color + "20", color: badge.color }}>
                          {badge.icon} {badge.label}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                          <Users size={9} className="inline mr-1" /> Tous
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white">{a.title ?? "(sans titre)"}</h3>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "rgba(255,255,255,0.5)" }}>{a.content}</p>
                    <p className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                      {authorName} · {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleTogglePin(a.id, a.pinned)} title={a.pinned ? "Désépingler" : "Épingler"}
                      className="p-1.5 rounded-lg transition-colors" style={{ color: a.pinned ? "#C9A84C" : "rgba(255,255,255,0.3)", backgroundColor: a.pinned ? "rgba(201,168,76,0.1)" : "transparent" }}>
                      <Pin size={12} />
                    </button>
                    <button onClick={() => setModal({ type: "edit", annonce: a })} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseOver={e => (e.currentTarget.style.color = "white")} onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseOver={e => (e.currentTarget.style.color = "#EF4444")} onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
          <div className="bg-[#0e1e35] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <AnnonceFormDark
              annonce={modal.type === "edit" ? modal.annonce : undefined}
              groupes={groupes} dossiers={dossiers} matieres={matieres} isPending={isPending}
              defaultGroupeIds={modal.type === "create" ? selectedGroupeIds : undefined}
              onClose={() => setModal(null)}
              onSubmit={data => {
                startTransition(async () => {
                  if (modal.type === "edit") {
                    const res = await updateAnnonce(modal.annonce.id, data);
                    if ("error" in res) { showToast(res.error!, "error"); return; }
                    setModal(null); await refresh(); showToast("Annonce modifiée", "success");
                  } else {
                    // Batch: create one annonce per target group
                    const targetIds = data.groupe_ids && data.groupe_ids.length > 0 ? data.groupe_ids : [data.groupe_id];
                    let errored = false;
                    for (const gid of targetIds) {
                      const res = await createAnnonce({ title: data.title, content: data.content, groupe_id: gid, dossier_id: data.dossier_id, matiere_id: data.matiere_id, pinned: data.pinned });
                      if ("error" in res) { showToast(res.error!, "error"); errored = true; break; }
                    }
                    if (!errored) {
                      setModal(null); await refresh();
                      showToast(targetIds.length > 1 ? `Annonce publiée dans ${targetIds.length} classes` : "Annonce publiée", "success");
                    }
                  }
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dark Annonce Form ────────────────────────────────────────────────────────

function AnnonceFormDark({ annonce, groupes, dossiers, matieres, isPending, defaultGroupeIds, onClose, onSubmit }: {
  annonce?: Annonce;
  groupes: Groupe[]; dossiers: Dossier[]; matieres: Matiere[];
  isPending: boolean; onClose: () => void;
  defaultGroupeIds?: Set<string>;
  onSubmit: (data: { title: string; content: string; groupe_id: string | null; groupe_ids?: string[]; dossier_id: string | null; matiere_id: string | null; pinned: boolean }) => void;
}) {
  const hasDefaultClasses = defaultGroupeIds && defaultGroupeIds.size > 0;
  const [title, setTitle] = useState(annonce?.title ?? "");
  const [content, setContent] = useState(annonce?.content ?? "");
  const [audienceType, setAudienceType] = useState<"global" | "groupe" | "dossier" | "matiere" | "multi">(
    annonce?.matiere_id ? "matiere" : annonce?.dossier_id ? "dossier" : annonce?.groupe_id ? "groupe" : hasDefaultClasses ? "multi" : "global"
  );
  const [groupeId, setGroupeId] = useState(annonce?.groupe_id ?? (hasDefaultClasses && defaultGroupeIds!.size === 1 ? [...defaultGroupeIds!][0] : ""));
  const [dossierId, setDossierId] = useState(annonce?.dossier_id ?? "");
  const [matiereId, setMatiereId] = useState(annonce?.matiere_id ?? "");
  const [pinned, setPinned] = useState(annonce?.pinned ?? false);

  const defaultClassNames = hasDefaultClasses
    ? [...defaultGroupeIds!].map(id => groupes.find(g => g.id === id)?.name ?? "?").join(", ")
    : "";

  const canSubmit = !isPending && title.trim() && content.trim() && (
    audienceType === "global" || audienceType === "multi" ||
    (audienceType === "groupe" && groupeId) ||
    (audienceType === "dossier" && dossierId) ||
    (audienceType === "matiere" && matiereId)
  );

  const handleSubmit = () => {
    const base = { title: title.trim(), content: content.trim(), dossier_id: null as string | null, matiere_id: null as string | null, pinned };
    if (audienceType === "multi" && hasDefaultClasses) {
      onSubmit({ ...base, groupe_id: null, groupe_ids: [...defaultGroupeIds!] });
    } else if (audienceType === "groupe") {
      onSubmit({ ...base, groupe_id: groupeId || null });
    } else if (audienceType === "dossier") {
      onSubmit({ ...base, dossier_id: dossierId || null, groupe_id: null });
    } else if (audienceType === "matiere") {
      onSubmit({ ...base, matiere_id: matiereId || null, groupe_id: null });
    } else {
      onSubmit({ ...base, groupe_id: null });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{annonce ? "Modifier l'annonce" : "Nouvelle annonce"}</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>

      {/* Pre-filled classes banner */}
      {!annonce && hasDefaultClasses && audienceType === "multi" && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
          <Users size={13} style={{ color: "#34D399" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold" style={{ color: "#34D399" }}>
              {defaultGroupeIds!.size} classe{defaultGroupeIds!.size > 1 ? "s" : ""} sélectionnée{defaultGroupeIds!.size > 1 ? "s" : ""}
            </p>
            <p className="text-[10px] truncate" style={{ color: "rgba(52,211,153,0.7)" }}>{defaultClassNames}</p>
          </div>
          <button onClick={() => setAudienceType("global")} className="text-[10px] px-2 py-1 rounded-lg" style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Changer
          </button>
        </div>
      )}

      <div>
        <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Titre *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'annonce..." className={F} autoFocus />
      </div>

      <div>
        <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Contenu *</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={5} placeholder="Rédigez votre annonce..." className={F + " resize-none"} />
      </div>

      {/* Audience selector (only if not multi-class from sidebar) */}
      {audienceType !== "multi" && (
        <>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Destinataires</label>
            <select value={audienceType} onChange={e => setAudienceType(e.target.value as any)} className={F}>
              <option value="global">Tout le monde</option>
              {groupes.length > 0 && <option value="groupe">Une classe</option>}
              {dossiers.length > 0 && <option value="dossier">Une formation</option>}
              {matieres.length > 0 && <option value="matiere">Une matière</option>}
            </select>
          </div>
          {audienceType === "groupe" && (
            <select value={groupeId} onChange={e => setGroupeId(e.target.value)} className={F}>
              <option value="">Choisir une classe...</option>
              {groupes.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          {audienceType === "dossier" && (
            <select value={dossierId} onChange={e => setDossierId(e.target.value)} className={F}>
              <option value="">Choisir un dossier...</option>
              {dossiers.map(d => <option key={d.id} value={d.id}>{getDossierPathLabel(d.id, dossiers)}</option>)}
            </select>
          )}
          {audienceType === "matiere" && (
            <select value={matiereId} onChange={e => setMatiereId(e.target.value)} className={F}>
              <option value="">Choisir une matière...</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </>
      )}

      <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "rgba(255,255,255,0.6)" }}>
        <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="rounded" style={{ accentColor: "#C9A84C" }} />
        Épingler en haut du fil
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Annuler</button>
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {annonce ? "Enregistrer" : audienceType === "multi" && defaultGroupeIds && defaultGroupeIds.size > 1 ? `Publier (${defaultGroupeIds.size} classes)` : "Publier"}
        </button>
      </div>
    </div>
  );
}

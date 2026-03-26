"use client";

import { useState, useTransition } from "react";
import {
  Megaphone, Plus, Pencil, Trash2, Pin, X, Check, AlertCircle, Loader2, Users, FolderTree, BookOpen,
} from "lucide-react";
import { getDossierPathLabel } from "@/lib/pedagogie-structure";
import type { Dossier, Groupe, Matiere, Profile } from "@/types/database";
import { createAnnonce, updateAnnonce, deleteAnnonce, togglePin } from "@/app/(admin)/admin/annonces/actions";

type Annonce = {
  id: string;
  title: string | null;
  content: string;
  groupe_id: string | null;
  dossier_id: string | null;
  matiere_id: string | null;
  pinned: boolean;
  created_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
  groupe?: { name: string; color: string } | null;
  dossier?: { id: string; name: string; color: string; parent_id: string | null } | null;
  matiere?: { id: string; name: string; color: string; dossier_id: string | null } | null;
};

type Modal = { type: "create" } | { type: "edit"; annonce: Annonce } | null;
type Toast = { message: string; kind: "success" | "error" } | null;

export function AnnoncesShell({
  initialAnnonces,
  groupes,
  dossiers,
  matieres,
  currentProfile,
}: {
  initialAnnonces: Annonce[];
  groupes: Groupe[];
  dossiers: Dossier[];
  matieres: Matiere[];
  currentProfile: Profile | null;
}) {
  const [annonces, setAnnonces] = useState<Annonce[]>(initialAnnonces);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    let query = sb
      .from("posts")
      .select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)")
      .eq("type", "annonce")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (currentProfile?.role === "prof") {
      query = query.eq("author_id", currentProfile.id);
    }

    const { data } = await query;
    if (data) setAnnonces(data as any[]);
  };

  const getAudienceBadge = (annonce: Annonce) => {
    if (annonce.matiere_id) {
      const matiere = annonce.matiere ?? matieres.find((item) => item.id === annonce.matiere_id);
      return matiere
        ? {
            label: matiere.name,
            icon: <BookOpen size={10} />,
            backgroundColor: `${matiere.color}22`,
            color: matiere.color,
          }
        : null;
    }

    if (annonce.dossier_id) {
      const path = getDossierPathLabel(annonce.dossier_id, dossiers);
      return {
        label: path,
        icon: <FolderTree size={10} />,
        backgroundColor: "rgba(201,168,76,0.14)",
        color: "#B9891E",
      };
    }

    if (annonce.groupe_id) {
      const groupe = annonce.groupe ?? groupes.find((item) => item.id === annonce.groupe_id);
      return groupe
        ? {
            label: groupe.name,
            icon: <Users size={10} />,
            backgroundColor: groupe.color,
            color: "white",
          }
        : null;
    }

    return null;
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    startTransition(async () => {
      const res = await deleteAnnonce(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setAnnonces((prev) => prev.filter((a) => a.id !== id));
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
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone size={20} className="text-indigo-600" /> Annonces
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{annonces.length} annonce{annonces.length !== 1 ? "s" : ""} publiée{annonces.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setModal({ type: "create" })}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} /> Nouvelle annonce
        </button>
      </div>

      {/* List */}
      {annonces.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <Megaphone size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400">Aucune annonce publiée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {annonces.map((a) => {
            const authorName = a.author
              ? `${a.author.first_name ?? ""} ${a.author.last_name ?? ""}`.trim()
              : "Admin";
            const audienceBadge = getAudienceBadge(a);
            return (
              <div key={a.id} className={`bg-white rounded-xl border ${a.pinned ? "border-indigo-300 ring-1 ring-indigo-100" : "border-gray-200"} shadow-sm p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {a.pinned && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                          <Pin size={10} /> Épinglée
                        </span>
                      )}
                      {audienceBadge ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium max-w-[360px]" style={{ backgroundColor: audienceBadge.backgroundColor, color: audienceBadge.color }}>
                          {audienceBadge.icon} <span className="truncate">{audienceBadge.label}</span>
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          Tous les utilisateurs concernés
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-base">{a.title ?? "(sans titre)"}</h3>
                    <p className="text-sm text-gray-500 mt-1.5 line-clamp-3 whitespace-pre-line">{a.content}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      Publié par {authorName} · {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleTogglePin(a.id, a.pinned)}
                      title={a.pinned ? "Désépingler" : "Épingler"}
                      className={`p-1.5 rounded-lg transition-colors ${a.pinned ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                      <Pin size={13} />
                    </button>
                    <button onClick={() => setModal({ type: "edit", annonce: a })} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <AnnonceForm
              annonce={modal.type === "edit" ? modal.annonce : undefined}
              groupes={groupes}
              dossiers={dossiers}
              matieres={matieres}
              isPending={isPending}
              onClose={() => setModal(null)}
              onSubmit={(data) => {
                startTransition(async () => {
                  const res = modal.type === "edit"
                    ? await updateAnnonce(modal.annonce.id, data)
                    : await createAnnonce(data);
                  if ("error" in res) { showToast(res.error!, "error"); return; }
                  setModal(null);
                  await refresh();
                  showToast(modal.type === "create" ? "Annonce publiée" : "Annonce modifiée", "success");
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AnnonceForm({ annonce, groupes, dossiers, matieres, isPending, onClose, onSubmit }: {
  annonce?: Annonce;
  groupes: Groupe[];
  dossiers: Dossier[];
  matieres: Matiere[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    content: string;
    groupe_id: string | null;
    dossier_id: string | null;
    matiere_id: string | null;
    pinned: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState(annonce?.title ?? "");
  const [content, setContent] = useState(annonce?.content ?? "");
  const [audienceType, setAudienceType] = useState<"global" | "groupe" | "dossier" | "matiere">(
    annonce?.matiere_id ? "matiere" : annonce?.dossier_id ? "dossier" : annonce?.groupe_id ? "groupe" : "global"
  );
  const [groupeId, setGroupeId] = useState(annonce?.groupe_id ?? "");
  const [dossierId, setDossierId] = useState(annonce?.dossier_id ?? "");
  const [matiereId, setMatiereId] = useState(annonce?.matiere_id ?? "");
  const [pinned, setPinned] = useState(annonce?.pinned ?? false);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {annonce ? "Modifier l'annonce" : "Nouvelle annonce"}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Titre *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'annonce..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400" />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Contenu *</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6}
          placeholder="Rédigez votre annonce..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400 resize-none" />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Destinataires</label>
        <select value={audienceType} onChange={(e) => setAudienceType(e.target.value as any)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400">
          <option value="global">Tout le monde concerné</option>
          {groupes.length > 0 && <option value="groupe">Une classe / un groupe</option>}
          {dossiers.length > 0 && <option value="dossier">Une formation / un dossier</option>}
          {matieres.length > 0 && <option value="matiere">Une matière</option>}
        </select>
      </div>

      {audienceType === "groupe" && (
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Classe / groupe</label>
          <select value={groupeId} onChange={(e) => setGroupeId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400">
            <option value="">Choisir une classe...</option>
            {groupes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {audienceType === "dossier" && (
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Formation / dossier</label>
          <select value={dossierId} onChange={(e) => setDossierId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400">
            <option value="">Choisir un dossier...</option>
            {dossiers.map((dossier) => (
              <option key={dossier.id} value={dossier.id}>
                {getDossierPathLabel(dossier.id, dossiers)}
              </option>
            ))}
          </select>
        </div>
      )}

      {audienceType === "matiere" && (
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Matière</label>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400">
            <option value="">Choisir une matière...</option>
            {matieres.map((matiere) => (
              <option key={matiere.id} value={matiere.id}>
                {matiere.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
        <span className="text-sm text-gray-700">Épingler cette annonce en haut du fil</span>
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Annuler</button>
        <button
          onClick={() => onSubmit({
            title: title.trim(),
            content: content.trim(),
            groupe_id: audienceType === "groupe" ? groupeId || null : null,
            dossier_id: audienceType === "dossier" ? dossierId || null : null,
            matiere_id: audienceType === "matiere" ? matiereId || null : null,
            pinned,
          })}
          disabled={
            isPending ||
            !title.trim() ||
            !content.trim() ||
            (audienceType === "groupe" && !groupeId) ||
            (audienceType === "dossier" && !dossierId) ||
            (audienceType === "matiere" && !matiereId)
          }
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {annonce ? "Enregistrer" : "Publier"}
        </button>
      </div>
    </div>
  );
}

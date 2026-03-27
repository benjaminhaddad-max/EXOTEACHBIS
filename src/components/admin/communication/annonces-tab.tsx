"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import {
  Megaphone, Pencil, Trash2, Pin, X, Check, AlertCircle, Loader2, Users, FolderTree, BookOpen,
  Save, ArrowLeft, Paperclip, FileText,
} from "lucide-react";
import { getDossierPathLabel } from "@/lib/pedagogie-structure";
import type { Dossier, Groupe, Matiere, Profile } from "@/types/database";
import type { SidebarFilter } from "@/components/admin/formulaires/formulaires-sidebar";
import { createAnnonce, updateAnnonce, deleteAnnonce, togglePin } from "@/app/(admin)/admin/annonces/actions";
import type { Attachment } from "@/app/(admin)/admin/annonces/actions";
import { AnnonceAttachmentsPreview } from "@/components/annonce-attachments-preview";

type Annonce = {
  id: string; title: string | null; content: string;
  groupe_id: string | null; dossier_id: string | null; matiere_id: string | null;
  pinned: boolean; created_at: string;
  attachments?: Attachment[];
  author: { first_name: string | null; last_name: string | null } | null;
  groupe?: { name: string; color: string } | null;
  dossier?: { id: string; name: string; color: string; parent_id: string | null } | null;
  matiere?: { id: string; name: string; color: string; dossier_id: string | null } | null;
};

type View = "list" | "create" | "edit";
type Toast = { message: string; kind: "success" | "error" } | null;

export function AnnoncesTab({
  initialAnnonces, groupes, dossiers, matieres, currentProfile, sidebarFilter, selectedGroupeIds, triggerCreate, onCreateHandled,
}: {
  initialAnnonces: Annonce[];
  groupes: Groupe[];
  dossiers: Dossier[];
  matieres: Matiere[];
  currentProfile: Profile | null;
  sidebarFilter: SidebarFilter;
  selectedGroupeIds?: Set<string>;
  triggerCreate?: boolean;
  onCreateHandled?: () => void;
}) {
  const [annonces, setAnnonces] = useState<Annonce[]>(initialAnnonces);
  const [view, setView] = useState<View>("list");
  const [editingAnnonce, setEditingAnnonce] = useState<Annonce | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, kind: "success" | "error") => { setToast({ message: msg, kind }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (triggerCreate) { setView("create"); setEditingAnnonce(null); onCreateHandled?.(); }
  }, [triggerCreate]);

  const refresh = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    let q = sb.from("posts").select("*, author:profiles(first_name, last_name), groupe:groupes(name, color), dossier:dossiers(id, name, color, parent_id), matiere:matieres(id, name, color, dossier_id)").eq("type", "annonce").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    if (currentProfile?.role === "prof" || currentProfile?.role === "coach") q = q.eq("author_id", currentProfile.id);
    const { data } = await q;
    if (data) setAnnonces(data as any[]);
  };

  const filteredAnnonces = useMemo(() => {
    if (!selectedGroupeIds || selectedGroupeIds.size === 0) return annonces;
    return annonces.filter(a => {
      if (!a.groupe_id && !a.dossier_id && !a.matiere_id) return true;
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

  const handleSubmit = (data: { title: string; content: string; pinned: boolean; attachments: Attachment[] }) => {
    const targetIds = selectedGroupeIds && selectedGroupeIds.size > 0 ? [...selectedGroupeIds] : [null];

    startTransition(async () => {
      if (editingAnnonce) {
        const res = await updateAnnonce(editingAnnonce.id, {
          title: data.title, content: data.content, pinned: data.pinned,
          groupe_id: editingAnnonce.groupe_id, dossier_id: editingAnnonce.dossier_id, matiere_id: editingAnnonce.matiere_id,
          attachments: data.attachments,
        });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        await refresh(); setView("list"); setEditingAnnonce(null);
        showToast("Annonce modifiée", "success");
      } else {
        let errored = false;
        for (const gid of targetIds) {
          const res = await createAnnonce({
            title: data.title, content: data.content, pinned: data.pinned,
            groupe_id: gid, dossier_id: null, matiere_id: null,
            attachments: data.attachments,
          });
          if ("error" in res) { showToast(res.error!, "error"); errored = true; break; }
        }
        if (!errored) {
          await refresh(); setView("list");
          showToast(targetIds.length > 1 ? `Annonce publiée dans ${targetIds.length} classes` : "Annonce publiée", "success");
        }
      }
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

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            {filteredAnnonces.length} annonce{filteredAnnonces.length !== 1 ? "s" : ""}
            {selectedGroupeIds && selectedGroupeIds.size > 0 && ` · filtrées par ${selectedGroupeIds.size} classe${selectedGroupeIds.size > 1 ? "s" : ""}`}
          </p>

          {filteredAnnonces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20" style={{ color: "rgba(255,255,255,0.3)" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(201,168,76,0.08)" }}>
                <Megaphone size={28} style={{ color: "rgba(201,168,76,0.4)" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                {!selectedGroupeIds || selectedGroupeIds.size === 0
                  ? "Sélectionne des classes à gauche"
                  : "Aucune annonce pour cette sélection"}
              </p>
              <p className="text-xs mt-1.5 max-w-xs text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
                {!selectedGroupeIds || selectedGroupeIds.size === 0
                  ? "Coche les formations, universités ou classes dans la sidebar pour voir et créer des annonces ciblées."
                  : "Clique sur « Nouvelle annonce » en haut à droite pour en créer une."}
              </p>
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
                          {a.pinned && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}><Pin size={9} /> Épinglée</span>}
                          {badge ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: badge.color + "20", color: badge.color }}>{badge.icon} {badge.label}</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}><Users size={9} className="inline mr-1" />Tous</span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-white">{a.title ?? "(sans titre)"}</h3>
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "rgba(255,255,255,0.5)" }}>{a.content}</p>
                        <AnnonceAttachmentsPreview attachments={a.attachments} variant="dark" />
                        <p className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>{authorName} · {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleTogglePin(a.id, a.pinned)} className="p-1.5 rounded-lg" style={{ color: a.pinned ? "#C9A84C" : "rgba(255,255,255,0.3)", backgroundColor: a.pinned ? "rgba(201,168,76,0.1)" : "transparent" }}><Pin size={12} /></button>
                        <button onClick={() => { setEditingAnnonce(a); setView("edit"); }} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.3)" }}><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.3)" }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── CREATE / EDIT VIEW (inline, like formulaire editor) ── */}
      {(view === "create" || view === "edit") && (
        <AnnonceEditor
          annonce={editingAnnonce}
          selectedGroupeIds={selectedGroupeIds}
          groupes={groupes}
          isPending={isPending}
          onBack={() => { setView("list"); setEditingAnnonce(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// ─── Inline Annonce Editor ────────────────────────────────────────────────────

function AnnonceEditor({ annonce, selectedGroupeIds, groupes, isPending, onBack, onSubmit }: {
  annonce: Annonce | null;
  selectedGroupeIds?: Set<string>;
  groupes: Groupe[];
  isPending: boolean;
  onBack: () => void;
  onSubmit: (data: { title: string; content: string; pinned: boolean; attachments: Attachment[] }) => void;
}) {
  const [title, setTitle] = useState(annonce?.title ?? "");
  const [content, setContent] = useState(annonce?.content ?? "");
  const [pinned, setPinned] = useState(annonce?.pinned ?? false);
  const [attachments, setAttachments] = useState<Attachment[]>(annonce?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCreate = !annonce;
  const hasTargets = selectedGroupeIds && selectedGroupeIds.size > 0;
  const targetNames = hasTargets ? [...selectedGroupeIds!].map(id => groupes.find(g => g.id === id)?.name ?? "?") : [];

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload-attachment", { method: "POST", body: fd });
        const json = await res.json();
        if (json.error) {
          setUploadError(json.error);
          continue;
        }
        setAttachments(prev => [...prev, { url: json.url, name: json.name, type: json.type, size: json.size }]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}
        onMouseOver={e => (e.currentTarget.style.color = "white")} onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
        <ArrowLeft size={12} /> Retour aux annonces
      </button>

      {isCreate && hasTargets && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
          <div className="flex items-center gap-2">
            <Users size={14} style={{ color: "#34D399" }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: "#34D399" }}>
                Destinataires : {selectedGroupeIds!.size} classe{selectedGroupeIds!.size > 1 ? "s" : ""}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(52,211,153,0.6)" }}>{targetNames.join(" · ")}</p>
            </div>
          </div>
        </div>
      )}

      {annonce && annonce.groupe_id && (
        <div className="p-3 rounded-xl" style={{ backgroundColor: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)" }}>
          <p className="text-xs" style={{ color: "#A78BFA" }}>Ciblée : {annonce.groupe?.name ?? "Classe"}</p>
        </div>
      )}

      <div className="p-5 rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titre de l'annonce..."
          className="w-full bg-transparent text-xl font-bold text-white outline-none placeholder:text-white/20 mb-4"
          autoFocus
        />

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={8}
          placeholder="Rédigez votre annonce..."
          className="w-full bg-transparent text-sm text-white/70 outline-none resize-none placeholder:text-white/20 leading-relaxed"
        />

        {/* Attachments zone */}
        {attachments.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              Pièces jointes ({attachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <div key={i} className="relative group/att">
                  {att.type === "image" ? (
                    <div className="relative rounded-lg overflow-hidden border border-white/10">
                      <img src={att.url} alt={att.name} className="h-24 w-auto max-w-[180px] object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[9px] text-white/70 px-1 truncate max-w-[160px]">{att.name}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                      <FileText size={14} style={{ color: "#F87171" }} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-white/80 truncate max-w-[150px]">{att.name}</p>
                        <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{formatSize(att.size)}</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                    style={{ backgroundColor: "#EF4444", color: "white" }}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload bar + actions */}
        <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "rgba(255,255,255,0.6)" }}>
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="rounded" style={{ accentColor: "#C9A84C" }} />
              Épingler en haut
            </label>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              className="hidden"
              onChange={e => handleFileUpload(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "white"; }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}>
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
              {uploading ? "Upload…" : "Joindre fichier"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onBack} className="px-3 py-1.5 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Annuler</button>
            <button
              onClick={() => onSubmit({ title: title.trim(), content: content.trim(), pinned, attachments })}
              disabled={isPending || uploading || !title.trim() || !content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
            >
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {isCreate
                ? hasTargets && selectedGroupeIds!.size > 1
                  ? `Publier (${selectedGroupeIds!.size} classes)`
                  : "Publier"
                : "Enregistrer"
              }
            </button>
          </div>
        </div>
        {uploadError && (
          <p className="text-[11px] mt-2" style={{ color: "#F87171" }}>
            {uploadError}
          </p>
        )}
      </div>
    </div>
  );
}

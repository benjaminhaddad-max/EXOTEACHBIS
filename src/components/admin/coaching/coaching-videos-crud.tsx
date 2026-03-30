"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Check, AlertCircle, Loader2, X,
  Video, FileText, Link2, Upload, ChevronDown, ChevronRight,
  GraduationCap, Building2, Users, File,
} from "lucide-react";
import { createCoachingVideo, updateCoachingVideo, deleteCoachingVideo } from "@/app/(admin)/admin/coaching/actions";
import type { CoachingVideo, CoachingResourceType, Dossier, Groupe } from "@/types/database";

interface CoachingVideosCrudProps {
  videos: CoachingVideo[];
  universities: Dossier[];
  dossiers: Dossier[];
  groupes: Groupe[];
}

type ResourceForm = {
  title: string;
  description: string;
  resource_type: CoachingResourceType;
  video_url: string;
  vimeo_id: string;
  file_url: string;
  category: "motivation" | "methode";
  groupe_ids: string[];
  order_index: number;
};

const EMPTY_FORM: ResourceForm = {
  title: "", description: "", resource_type: "video",
  video_url: "", vimeo_id: "", file_url: "",
  category: "motivation", groupe_ids: [], order_index: 0,
};

const RESOURCE_TYPE_LABELS: Record<CoachingResourceType, { label: string; icon: typeof Video }> = {
  video: { label: "Vidéo", icon: Video },
  pdf: { label: "PDF", icon: FileText },
  document: { label: "Document", icon: File },
  link: { label: "Lien", icon: Link2 },
};

export function CoachingVideosCrud({ videos: initialVideos, universities, dossiers, groupes }: CoachingVideosCrudProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceForm>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [uploading, setUploading] = useState(false);

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unisByOffer = useMemo(() => {
    const unis = dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index);
    const m = new Map<string, Dossier[]>();
    for (const u of unis) if (u.parent_id) {
      if (!m.has(u.parent_id)) m.set(u.parent_id, []);
      m.get(u.parent_id)!.push(u);
    }
    return m;
  }, [dossiers]);
  const groupesByUni = useMemo(() => {
    const m = new Map<string, Groupe[]>();
    for (const g of groupes) if (g.formation_dossier_id) {
      if (!m.has(g.formation_dossier_id)) m.set(g.formation_dossier_id, []);
      m.get(g.formation_dossier_id)!.push(g);
    }
    return m;
  }, [groupes]);

  const groupeMap = useMemo(() => new Map(groupes.map(g => [g.id, g])), [groupes]);
  const uniMap = useMemo(() => new Map(universities.map(u => [u.id, u])), [universities]);

  const toggleGroupeId = useCallback((gid: string) => {
    setForm(prev => {
      const s = new Set(prev.groupe_ids);
      if (s.has(gid)) s.delete(gid); else s.add(gid);
      return { ...prev, groupe_ids: Array.from(s) };
    });
  }, []);

  const toggleAllGroupesForUni = useCallback((uniId: string) => {
    const gids = (groupesByUni.get(uniId) ?? []).map(g => g.id);
    setForm(prev => {
      const s = new Set(prev.groupe_ids);
      const allSelected = gids.every(id => s.has(id));
      if (allSelected) gids.forEach(id => s.delete(id));
      else gids.forEach(id => s.add(id));
      return { ...prev, groupe_ids: Array.from(s) };
    });
  }, [groupesByUni]);

  const toggleAllGroupesForOffer = useCallback((offerId: string) => {
    const unis = unisByOffer.get(offerId) ?? [];
    const gids: string[] = [];
    for (const u of unis) (groupesByUni.get(u.id) ?? []).forEach(g => gids.push(g.id));
    setForm(prev => {
      const s = new Set(prev.groupe_ids);
      const allSelected = gids.every(id => s.has(id));
      if (allSelected) gids.forEach(id => s.delete(id));
      else gids.forEach(id => s.add(id));
      return { ...prev, groupe_ids: Array.from(s) };
    });
  }, [unisByOffer, groupesByUni]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };

  const openEdit = (v: CoachingVideo) => {
    setForm({
      title: v.title,
      description: v.description ?? "",
      resource_type: v.resource_type ?? "video",
      video_url: v.video_url ?? "",
      vimeo_id: v.vimeo_id ?? "",
      file_url: v.file_url ?? "",
      category: v.category,
      groupe_ids: v.groupe_ids ?? [],
      order_index: v.order_index,
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleFileUpload = async (file: globalThis.File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-attachment", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? "Échec de l'upload", "error"); return; }
      setForm(prev => ({ ...prev, file_url: json.url }));
      showToast("Fichier uploadé", "success");
    } catch {
      showToast("Erreur lors de l'upload", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) { showToast("Le titre est requis.", "error"); return; }
    if (form.groupe_ids.length === 0) { showToast("Sélectionnez au moins une classe de destination.", "error"); return; }

    startTransition(async () => {
      if (editingId) {
        const res = await updateCoachingVideo(editingId, {
          title: form.title,
          description: form.description || null,
          video_url: form.video_url || null,
          vimeo_id: form.vimeo_id || null,
          category: form.category,
          resource_type: form.resource_type,
          file_url: form.file_url || null,
          university_dossier_id: null,
          groupe_ids: form.groupe_ids,
          order_index: form.order_index,
        });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        setVideos(prev => prev.map(v => v.id === editingId ? {
          ...v, ...form,
          description: form.description || null,
          video_url: form.video_url || null,
          vimeo_id: form.vimeo_id || null,
          file_url: form.file_url || null,
          university_dossier_id: null,
        } : v));
        showToast("Ressource modifiée", "success");
      } else {
        const res = await createCoachingVideo({
          title: form.title,
          description: form.description || undefined,
          video_url: form.video_url || undefined,
          vimeo_id: form.vimeo_id || undefined,
          category: form.category,
          resource_type: form.resource_type,
          file_url: form.file_url || undefined,
          university_dossier_id: null,
          groupe_ids: form.groupe_ids,
          order_index: form.order_index,
        });
        if ("error" in res && res.error) { showToast(res.error, "error"); return; }
        if ("video" in res && res.video) setVideos(prev => [...prev, res.video as CoachingVideo]);
        showToast("Ressource créée", "success");
      }
      setShowForm(false);
    });
  };

  const handleDelete = (videoId: string) => {
    if (!confirm("Supprimer cette ressource ?")) return;
    startTransition(async () => {
      const res = await deleteCoachingVideo(videoId);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setVideos(prev => prev.filter(v => v.id !== videoId));
      showToast("Ressource supprimée", "success");
    });
  };

  const handleToggleVisible = (video: CoachingVideo) => {
    startTransition(async () => {
      const res = await updateCoachingVideo(video.id, { visible: !video.visible });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setVideos(prev => prev.map(v => v.id === video.id ? { ...v, visible: !v.visible } : v));
    });
  };

  const getTargetLabel = (v: CoachingVideo) => {
    const gids = v.groupe_ids ?? [];
    if (gids.length === 0) {
      if (v.university_dossier_id) return uniMap.get(v.university_dossier_id)?.name ?? "Fac";
      return "Toutes";
    }
    if (gids.length <= 2) return gids.map(id => groupeMap.get(id)?.name ?? "?").join(", ");
    return `${gids.length} classes`;
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Ressources complémentaires</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {/* Resource list */}
      <div className="space-y-2">
        {videos.sort((a, b) => a.order_index - b.order_index).map(v => {
          const rt = v.resource_type ?? "video";
          const TypeIcon = RESOURCE_TYPE_LABELS[rt]?.icon ?? Video;
          return (
            <div key={v.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", opacity: v.visible ? 1 : 0.5 }}>
              <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(201,168,76,0.12)" }}>
                <TypeIcon size={14} className="text-[#C9A84C]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{v.title}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: v.category === "motivation" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)", color: v.category === "motivation" ? "#FCA5A5" : "#93C5FD" }}>
                    {v.category === "motivation" ? "Motivation" : "Méthode"}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.1)", color: "#C9A84C" }}>
                    {RESOURCE_TYPE_LABELS[rt]?.label ?? "Vidéo"}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                    {getTargetLabel(v)}
                  </span>
                </div>
                {v.description && <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{v.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggleVisible(v)} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {v.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded-lg" style={{ color: "rgba(239,68,68,0.6)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {videos.length === 0 && (
          <p className="text-center text-xs py-8" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune ressource</p>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", backgroundColor: "#0e1e35" }}>
              <p className="text-sm font-bold text-white">{editingId ? "Modifier la ressource" : "Nouvelle ressource"}</p>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.4)" }}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Resource type selector */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Type de ressource</label>
                <div className="flex items-center gap-2">
                  {(Object.entries(RESOURCE_TYPE_LABELS) as [CoachingResourceType, { label: string; icon: typeof Video }][]).map(([key, { label, icon: Icon }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, resource_type: key }))}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor: form.resource_type === key ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                        color: form.resource_type === key ? "#C9A84C" : "rgba(255,255,255,0.5)",
                        border: `1px solid ${form.resource_type === key ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title + description */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Titre *</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Description</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
              </div>

              {/* Conditional fields based on resource_type */}
              {(form.resource_type === "video") && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>ID Vimeo</label>
                    <input value={form.vimeo_id} onChange={e => setForm({ ...form, vimeo_id: e.target.value })} placeholder="123456789"
                      className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Ou URL vidéo</label>
                    <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://..."
                      className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                  </div>
                </div>
              )}

              {(form.resource_type === "pdf" || form.resource_type === "document") && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Fichier</label>
                  {form.file_url ? (
                    <div className="flex items-center gap-2">
                      <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A84C] underline truncate flex-1">{form.file_url.split("/").pop()}</a>
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, file_url: "" }))} className="p-1 rounded text-red-400 hover:text-red-300"><X size={12} /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 w-full rounded-lg px-3 py-4 text-xs cursor-pointer transition-all hover:border-[#C9A84C]/40" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}>
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploading ? "Upload en cours..." : "Cliquez pour uploader un fichier (PDF, image)"}
                      <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              )}

              {form.resource_type === "link" && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>URL du lien</label>
                  <input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://..."
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
              )}

              {/* Category + Order */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Catégorie</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as "motivation" | "methode" })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <option value="motivation">Motivation</option>
                    <option value="methode">Méthode</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Ordre d&apos;affichage</label>
                  <input type="number" value={form.order_index} onChange={e => setForm({ ...form, order_index: parseInt(e.target.value) || 0 })}
                    className="w-24 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
              </div>

              {/* Destination tree: Formation → Université → Classe */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Destination * <span className="normal-case font-normal text-[10px]">({form.groupe_ids.length} classe{form.groupe_ids.length > 1 ? "s" : ""} sélectionnée{form.groupe_ids.length > 1 ? "s" : ""})</span>
                </label>
                <div className="rounded-xl overflow-hidden max-h-[240px] overflow-y-auto" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {offers.map(offer => <OfferNode key={offer.id} offer={offer} unisByOffer={unisByOffer} groupesByUni={groupesByUni} selectedIds={form.groupe_ids} onToggleGroupe={toggleGroupeId} onToggleUni={toggleAllGroupesForUni} onToggleOffer={toggleAllGroupesForOffer} />)}
                  {offers.length === 0 && <p className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune formation configurée</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>Annuler</button>
              <button onClick={handleSave} disabled={isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
                {isPending && <Loader2 size={11} className="animate-spin" />}
                {editingId ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* ─── Formation tree nodes ──────────────────────────────────────────────── */

function OfferNode({ offer, unisByOffer, groupesByUni, selectedIds, onToggleGroupe, onToggleUni, onToggleOffer }: {
  offer: Dossier;
  unisByOffer: Map<string, Dossier[]>;
  groupesByUni: Map<string, Groupe[]>;
  selectedIds: string[];
  onToggleGroupe: (id: string) => void;
  onToggleUni: (id: string) => void;
  onToggleOffer: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unis = unisByOffer.get(offer.id) ?? [];
  const allGids: string[] = [];
  for (const u of unis) (groupesByUni.get(u.id) ?? []).forEach(g => allGids.push(g.id));
  const selectedSet = new Set(selectedIds);
  const selectedCount = allGids.filter(id => selectedSet.has(id)).length;
  const allSelected = allGids.length > 0 && selectedCount === allGids.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors">
        {open ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
        <GraduationCap size={13} className="text-[#C9A84C] shrink-0" />
        <span className="flex-1 text-xs font-medium text-white truncate">{offer.name}</span>
        <button type="button" onClick={e => { e.stopPropagation(); onToggleOffer(offer.id); }}
          className="w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors"
          style={{ borderColor: allSelected || someSelected ? "#C9A84C" : "rgba(255,255,255,0.2)", backgroundColor: allSelected ? "#C9A84C" : someSelected ? "rgba(201,168,76,0.3)" : "transparent" }}>
          {allSelected && <Check size={10} className="text-[#0e1e35]" />}
          {someSelected && !allSelected && <div className="w-1.5 h-0.5 rounded-full bg-[#C9A84C]" />}
        </button>
      </button>
      {open && unis.map(uni => <UniNode key={uni.id} uni={uni} groupesByUni={groupesByUni} selectedIds={selectedIds} onToggleGroupe={onToggleGroupe} onToggleUni={onToggleUni} />)}
    </div>
  );
}

function UniNode({ uni, groupesByUni, selectedIds, onToggleGroupe, onToggleUni }: {
  uni: Dossier;
  groupesByUni: Map<string, Groupe[]>;
  selectedIds: string[];
  onToggleGroupe: (id: string) => void;
  onToggleUni: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const classes = groupesByUni.get(uni.id) ?? [];
  const selectedSet = new Set(selectedIds);
  const selectedCount = classes.filter(g => selectedSet.has(g.id)).length;
  const allSelected = classes.length > 0 && selectedCount === classes.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div className="pl-5">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.04] transition-colors">
        {open ? <ChevronDown size={11} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={11} style={{ color: "rgba(255,255,255,0.3)" }} />}
        <Building2 size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
        <span className="flex-1 text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{uni.name}</span>
        <button type="button" onClick={e => { e.stopPropagation(); onToggleUni(uni.id); }}
          className="w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors"
          style={{ borderColor: allSelected || someSelected ? "#C9A84C" : "rgba(255,255,255,0.2)", backgroundColor: allSelected ? "#C9A84C" : someSelected ? "rgba(201,168,76,0.3)" : "transparent" }}>
          {allSelected && <Check size={9} className="text-[#0e1e35]" />}
          {someSelected && !allSelected && <div className="w-1 h-0.5 rounded-full bg-[#C9A84C]" />}
        </button>
      </button>
      {open && classes.length > 0 && (
        <div className="pl-6 pb-1">
          {classes.map(g => {
            const isSelected = selectedSet.has(g.id);
            return (
              <button key={g.id} type="button" onClick={() => onToggleGroupe(g.id)} className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-white/[0.04] transition-colors rounded">
                <Users size={11} style={{ color: "rgba(255,255,255,0.3)" }} />
                <span className="flex-1 text-[10px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{g.name}</span>
                <div className="w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors"
                  style={{ borderColor: isSelected ? "#C9A84C" : "rgba(255,255,255,0.2)", backgroundColor: isSelected ? "#C9A84C" : "transparent" }}>
                  {isSelected && <Check size={9} className="text-[#0e1e35]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {open && classes.length === 0 && (
        <p className="pl-9 py-1 text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>Aucune classe</p>
      )}
    </div>
  );
}

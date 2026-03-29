"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Check, AlertCircle, Loader2, X } from "lucide-react";
import { createCoachingVideo, updateCoachingVideo, deleteCoachingVideo } from "@/app/(admin)/admin/coaching/actions";
import type { CoachingVideo, Dossier } from "@/types/database";

interface CoachingVideosCrudProps {
  videos: CoachingVideo[];
  universities: Dossier[];
}

type VideoForm = {
  title: string;
  description: string;
  video_url: string;
  vimeo_id: string;
  category: "motivation" | "methode";
  university_dossier_id: string;
  order_index: number;
};

const EMPTY_FORM: VideoForm = { title: "", description: "", video_url: "", vimeo_id: "", category: "motivation", university_dossier_id: "", order_index: 0 };

export function CoachingVideosCrud({ videos: initialVideos, universities }: CoachingVideosCrudProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VideoForm>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (video: CoachingVideo) => {
    setForm({
      title: video.title,
      description: video.description ?? "",
      video_url: video.video_url ?? "",
      vimeo_id: video.vimeo_id ?? "",
      category: video.category,
      university_dossier_id: video.university_dossier_id ?? "",
      order_index: video.order_index,
    });
    setEditingId(video.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.title.trim()) { showToast("Le titre est requis.", "error"); return; }
    startTransition(async () => {
      if (editingId) {
        const res = await updateCoachingVideo(editingId, {
          title: form.title,
          description: form.description || null,
          video_url: form.video_url || null,
          vimeo_id: form.vimeo_id || null,
          category: form.category,
          university_dossier_id: form.university_dossier_id || null,
          order_index: form.order_index,
        });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        setVideos((prev) => prev.map((v) => v.id === editingId ? { ...v, ...form, university_dossier_id: form.university_dossier_id || null, description: form.description || null, video_url: form.video_url || null, vimeo_id: form.vimeo_id || null } : v));
        showToast("Vidéo modifiée", "success");
      } else {
        const res = await createCoachingVideo({
          title: form.title,
          description: form.description || undefined,
          video_url: form.video_url || undefined,
          vimeo_id: form.vimeo_id || undefined,
          category: form.category,
          university_dossier_id: form.university_dossier_id || null,
          order_index: form.order_index,
        });
        if ("error" in res && res.error) { showToast(res.error, "error"); return; }
        if ("video" in res && res.video) setVideos((prev) => [...prev, res.video as CoachingVideo]);
        showToast("Vidéo créée", "success");
      }
      setShowForm(false);
    });
  };

  const handleDelete = (videoId: string) => {
    startTransition(async () => {
      const res = await deleteCoachingVideo(videoId);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      showToast("Vidéo supprimée", "success");
    });
  };

  const handleToggleVisible = (video: CoachingVideo) => {
    startTransition(async () => {
      const res = await updateCoachingVideo(video.id, { visible: !video.visible });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setVideos((prev) => prev.map((v) => v.id === video.id ? { ...v, visible: !v.visible } : v));
    });
  };

  const uniMap = new Map(universities.map((u) => [u.id, u]));

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Vidéos coaching</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {/* Video list */}
      <div className="space-y-2">
        {videos.sort((a, b) => a.order_index - b.order_index).map((v) => (
          <div key={v.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", opacity: v.visible ? 1 : 0.5 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{v.title}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: v.category === "motivation" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)", color: v.category === "motivation" ? "#FCA5A5" : "#93C5FD" }}>
                  {v.category === "motivation" ? "Motivation" : "Méthode"}
                </span>
                {v.university_dossier_id && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                    {uniMap.get(v.university_dossier_id)?.name ?? "Fac"}
                  </span>
                )}
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
        ))}
        {videos.length === 0 && (
          <p className="text-center text-xs py-8" style={{ color: "rgba(255,255,255,0.3)" }}>Aucune vidéo</p>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-bold text-white">{editingId ? "Modifier la vidéo" : "Nouvelle vidéo"}</p>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.4)" }}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Titre *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>ID Vimeo</label>
                  <input value={form.vimeo_id} onChange={(e) => setForm({ ...form, vimeo_id: e.target.value })} placeholder="123456789"
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Ou URL vidéo</label>
                  <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://..."
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Catégorie</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as "motivation" | "methode" })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <option value="motivation">Motivation</option>
                    <option value="methode">Méthode</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Université</label>
                  <select value={form.university_dossier_id} onChange={(e) => setForm({ ...form, university_dossier_id: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <option value="">Toutes les facs</option>
                    {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Ordre d&apos;affichage</label>
                <input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: parseInt(e.target.value) || 0 })}
                  className="w-24 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
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

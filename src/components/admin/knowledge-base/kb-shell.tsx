"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import {
  Plus, Search, FileText, FolderOpen, CheckCircle2, Clock, XCircle,
  Send, Eye, Trash2, Pencil, ChevronDown, ChevronRight, RefreshCw,
  Sparkles, BookOpen, Users, Calendar, GraduationCap, X, AlertCircle,
  Check, Loader2, Upload, Tag, Globe, Shield, Building2, BarChart3,
  Zap, Brain, Archive, Filter,
} from "lucide-react";
import type { KbArticle, KbCategory, KbArticleStatus, Dossier, Groupe } from "@/types/database";
import {
  createKbCategory, updateKbCategory, deleteKbCategory,
  createKbArticle, updateKbArticle, deleteKbArticle,
  submitKbArticle, approveKbArticle, rejectKbArticle,
  syncPlatformToKb,
} from "@/app/(admin)/admin/knowledge-base/actions";

// ─── Constants ──────────────────────────────────────────────

const STATUS_CONFIG: Record<KbArticleStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  draft: { label: "Brouillon", color: "#94A3B8", bg: "rgba(148,163,184,0.1)", icon: FileText },
  submitted: { label: "En attente", color: "#F59E0B", bg: "rgba(245,158,11,0.1)", icon: Clock },
  approved: { label: "Publié", color: "#10B981", bg: "rgba(16,185,129,0.1)", icon: CheckCircle2 },
  rejected: { label: "Rejeté", color: "#EF4444", bg: "rgba(239,68,68,0.1)", icon: XCircle },
};

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  GraduationCap, BookOpen, Users, Calendar, FileText, Globe, Shield, Building2, Brain,
};

interface KbShellProps {
  initialCategories: KbCategory[];
  initialArticles: KbArticle[];
  dossiers: Dossier[];
  groupes: Groupe[];
  stats: { totalArticles: number; pendingReview: number; unansweredQuestions: number; totalQuestions: number };
}

// ─── Main Component ──────────────────────────────────────────

export function KnowledgeBaseShell({ initialCategories, initialArticles, dossiers, groupes, stats: initialStats }: KbShellProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [articles, setArticles] = useState(initialArticles);
  const [stats] = useState(initialStats);
  const [isPending, startTransition] = useTransition();

  // UI state
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<KbArticleStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "auto">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(null);
  const [showArticleEditor, setShowArticleEditor] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<KbCategory | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const showToast = useCallback((msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── Category tree ────────────────────────────────────────

  const catTree = useMemo(() => {
    const roots: (KbCategory & { children: KbCategory[] })[] = [];
    const childMap = new Map<string, KbCategory[]>();
    for (const c of categories) {
      if (c.parent_id) {
        if (!childMap.has(c.parent_id)) childMap.set(c.parent_id, []);
        childMap.get(c.parent_id)!.push(c);
      }
    }
    for (const c of categories) {
      if (!c.parent_id) roots.push({ ...c, children: childMap.get(c.id) ?? [] });
    }
    return roots;
  }, [categories]);

  const articleCountByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      if (a.category_id) m.set(a.category_id, (m.get(a.category_id) ?? 0) + 1);
    }
    return m;
  }, [articles]);

  // ─── Filtered articles ────────────────────────────────────

  const filteredArticles = useMemo(() => {
    let list = articles;
    if (selectedCatId) {
      const childIds = new Set([selectedCatId, ...categories.filter(c => c.parent_id === selectedCatId).map(c => c.id)]);
      list = list.filter(a => a.category_id && childIds.has(a.category_id));
    }
    if (statusFilter !== "all") list = list.filter(a => a.status === statusFilter);
    if (sourceFilter === "manual") list = list.filter(a => a.source === "manual");
    if (sourceFilter === "auto") list = list.filter(a => a.source !== "manual");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.tags.some(t => t.includes(q)));
    }
    return list;
  }, [articles, selectedCatId, statusFilter, sourceFilter, searchQuery, categories]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    startTransition(async () => {
      const res = await syncPlatformToKb();
      if ("error" in res) { showToast(res.error!, "error"); }
      else if ("success" in res) {
        showToast(`Synchronisation terminée : ${(res as any).created} créés, ${(res as any).updated} mis à jour`, "success");
        window.location.reload();
      }
      setSyncing(false);
    });
  };

  const handleDeleteArticle = (id: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    startTransition(async () => {
      const res = await deleteKbArticle(id);
      if ("error" in res) showToast(res.error!, "error");
      else {
        setArticles(prev => prev.filter(a => a.id !== id));
        if (selectedArticle?.id === id) setSelectedArticle(null);
        showToast("Article supprimé", "success");
      }
    });
  };

  const handleApprove = (id: string) => {
    startTransition(async () => {
      const res = await approveKbArticle(id);
      if ("error" in res) showToast(res.error!, "error");
      else {
        setArticles(prev => prev.map(a => a.id === id ? { ...a, status: "approved" as const } : a));
        showToast("Article publié", "success");
      }
    });
  };

  const handleReject = (id: string) => {
    const comment = prompt("Raison du rejet :");
    if (!comment) return;
    startTransition(async () => {
      const res = await rejectKbArticle(id, comment);
      if ("error" in res) showToast(res.error!, "error");
      else {
        setArticles(prev => prev.map(a => a.id === id ? { ...a, status: "rejected" as const, review_comment: comment } : a));
        showToast("Article rejeté", "success");
      }
    });
  };

  const toggleCatExpand = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-[calc(100vh-9rem)] flex flex-col gap-4">
      {/* ═══ Stats Row ═══ */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {[
          { label: "Articles", value: stats.totalArticles, icon: FileText, color: "#3B82F6" },
          { label: "En attente", value: stats.pendingReview, icon: Clock, color: "#F59E0B" },
          { label: "Questions sans réponse", value: stats.unansweredQuestions, icon: AlertCircle, color: "#EF4444" },
          { label: "Questions chatbot", value: stats.totalQuestions, icon: Brain, color: "#8B5CF6" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white overflow-hidden flex">
        {/* ─── Sidebar: Categories ─── */}
        <div className="w-[260px] shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/60">
          <div className="px-3 pt-3 pb-2 flex items-center justify-between border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Catégories</p>
            <button onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }}
              className="p-1 rounded-lg text-gray-400 hover:text-[#0e1e35] hover:bg-gray-200/60 transition-colors">
              <Plus size={13} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {/* All articles */}
            <button onClick={() => setSelectedCatId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all ${!selectedCatId ? "bg-[#0e1e35] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              <FolderOpen size={13} />
              <span className="flex-1 font-medium">Tous les articles</span>
              <span className="text-[10px] opacity-60">{articles.length}</span>
            </button>

            {/* Category tree */}
            {catTree.map(cat => {
              const Icon = CATEGORY_ICONS[cat.icon ?? ""] ?? FileText;
              const isExpanded = expandedCats.has(cat.id);
              const count = (articleCountByCat.get(cat.id) ?? 0) + cat.children.reduce((s, c) => s + (articleCountByCat.get(c.id) ?? 0), 0);
              return (
                <div key={cat.id}>
                  <div className="flex items-center">
                    {cat.children.length > 0 && (
                      <button onClick={() => toggleCatExpand(cat.id)} className="p-0.5 text-gray-400">
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                    )}
                    <button onClick={() => setSelectedCatId(cat.id)}
                      className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-all ${selectedCatId === cat.id ? "bg-[#0e1e35] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                      <Icon size={13} style={{ color: selectedCatId === cat.id ? "white" : (cat.color ?? "#6B7280") }} />
                      <span className="flex-1 font-medium truncate">{cat.name}</span>
                      {count > 0 && <span className="text-[10px] opacity-60">{count}</span>}
                    </button>
                    <button onClick={() => { setEditingCategory(cat); setShowCategoryForm(true); }}
                      className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100">
                      <Pencil size={10} />
                    </button>
                  </div>
                  {isExpanded && cat.children.map(child => {
                    const ChildIcon = CATEGORY_ICONS[child.icon ?? ""] ?? FileText;
                    const childCount = articleCountByCat.get(child.id) ?? 0;
                    return (
                      <button key={child.id} onClick={() => setSelectedCatId(child.id)}
                        className={`w-full flex items-center gap-2 pl-8 pr-2 py-1.5 rounded-lg text-left text-[11px] transition-all ${selectedCatId === child.id ? "bg-[#0e1e35] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                        <ChildIcon size={11} style={{ color: selectedCatId === child.id ? "white" : (child.color ?? "#9CA3AF") }} />
                        <span className="flex-1 truncate">{child.name}</span>
                        {childCount > 0 && <span className="text-[10px] opacity-50">{childCount}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Sync button */}
          <div className="px-3 py-3 border-t border-gray-100">
            <button onClick={handleSync} disabled={syncing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50">
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {syncing ? "Synchronisation..." : "Sync auto depuis la plateforme"}
            </button>
          </div>
        </div>

        {/* ─── Article List ─── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un article..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-[#0e1e35]/30" />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1 shrink-0">
              {(["all", "draft", "submitted", "approved", "rejected"] as const).map(s => {
                const isActive = statusFilter === s;
                const conf = s === "all" ? null : STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${isActive ? "bg-[#0e1e35] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                    {s === "all" ? "Tous" : conf!.label}
                  </button>
                );
              })}
            </div>

            {/* Source filter */}
            <div className="flex items-center gap-1 shrink-0 border-l border-gray-200 pl-3">
              {(["all", "manual", "auto"] as const).map(s => (
                <button key={s} onClick={() => setSourceFilter(s)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${sourceFilter === s ? "bg-[#0e1e35] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  {s === "all" ? "Tout" : s === "manual" ? "Manuel" : "Auto"}
                </button>
              ))}
            </div>

            <button onClick={() => { setSelectedArticle(null); setShowArticleEditor(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1e35] text-white hover:bg-[#1a3050] transition-colors shrink-0">
              <Plus size={13} /> Nouvel article
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Archive size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Aucun article trouvé</p>
                <p className="text-xs mt-1">Créez un article ou synchronisez depuis la plateforme</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredArticles.map(article => {
                  const sc = STATUS_CONFIG[article.status];
                  const StatusIcon = sc.icon;
                  const isSelected = selectedArticle?.id === article.id;
                  return (
                    <button key={article.id} onClick={() => setSelectedArticle(article)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${isSelected ? "bg-blue-50/60" : "hover:bg-gray-50/60"}`}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: sc.bg }}>
                        <StatusIcon size={14} style={{ color: sc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{article.title}</p>
                          {article.source !== "manual" && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">Auto</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {article.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${article.category.color ?? "#6B7280"}15`, color: article.category.color ?? "#6B7280" }}>
                              {article.category.name}
                            </span>
                          )}
                          {article.tags.slice(0, 3).map(t => (
                            <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{t}</span>
                          ))}
                          <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                            {new Date(article.updated_at).toLocaleDateString("fr-FR")}
                          </span>
                        </div>
                        {article.summary && <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">{article.summary}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Article Detail / Preview ─── */}
        {selectedArticle && !showArticleEditor && (
          <div className="w-[400px] shrink-0 border-l border-gray-100 flex flex-col bg-white">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <p className="text-sm font-bold text-gray-900 truncate">{selectedArticle.title}</p>
              <button onClick={() => setSelectedArticle(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Status + actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ backgroundColor: STATUS_CONFIG[selectedArticle.status].bg, color: STATUS_CONFIG[selectedArticle.status].color }}>
                  {React.createElement(STATUS_CONFIG[selectedArticle.status].icon, { size: 11 })}
                  {STATUS_CONFIG[selectedArticle.status].label}
                </span>
                {selectedArticle.source !== "manual" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-600">
                    <Sparkles size={11} /> Auto-généré
                  </span>
                )}
                {selectedArticle.visibility !== "all" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-600">
                    <Shield size={11} /> {selectedArticle.visibility === "staff_only" ? "Staff" : selectedArticle.visibility}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {selectedArticle.status === "submitted" && (
                  <>
                    <button onClick={() => handleApprove(selectedArticle.id)} disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50">
                      <CheckCircle2 size={12} /> Valider
                    </button>
                    <button onClick={() => handleReject(selectedArticle.id)} disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50">
                      <XCircle size={12} /> Rejeter
                    </button>
                  </>
                )}
                {selectedArticle.status === "draft" && (
                  <button onClick={() => {
                    startTransition(async () => {
                      const res = await submitKbArticle(selectedArticle.id);
                      if ("error" in res) showToast(res.error!, "error");
                      else {
                        setArticles(prev => prev.map(a => a.id === selectedArticle.id ? { ...a, status: "submitted" as const } : a));
                        setSelectedArticle(prev => prev ? { ...prev, status: "submitted" } : prev);
                        showToast("Article soumis pour validation", "success");
                      }
                    });
                  }} disabled={isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
                    <Send size={12} /> Soumettre
                  </button>
                )}
                <button onClick={() => { setShowArticleEditor(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  <Pencil size={12} /> Modifier
                </button>
                <button onClick={() => handleDeleteArticle(selectedArticle.id)} disabled={isPending}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50">
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Meta */}
              <div className="space-y-2 text-[11px] text-gray-500">
                {selectedArticle.author && (
                  <p><span className="font-semibold text-gray-700">Auteur :</span> {selectedArticle.author.first_name} {selectedArticle.author.last_name}</p>
                )}
                {selectedArticle.category && (
                  <p><span className="font-semibold text-gray-700">Catégorie :</span> {selectedArticle.category.name}</p>
                )}
                {selectedArticle.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag size={10} className="text-gray-400" />
                    {selectedArticle.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">{t}</span>)}
                  </div>
                )}
                {selectedArticle.review_comment && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                    <p className="font-semibold text-red-600 mb-0.5">Commentaire du reviewer :</p>
                    <p className="text-red-500">{selectedArticle.review_comment}</p>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="border-t border-gray-100 pt-3">
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-[13px] leading-relaxed">
                  {selectedArticle.content}
                </div>
              </div>

              {/* Attachments */}
              {selectedArticle.attachments && selectedArticle.attachments.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[11px] font-semibold text-gray-700 mb-2">Pièces jointes</p>
                  <div className="space-y-1">
                    {selectedArticle.attachments.map((att, i) => (
                      <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-[11px] text-gray-600 transition-colors">
                        <FileText size={12} className="text-gray-400" />
                        <span className="truncate">{att.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Article Editor Modal ═══ */}
      {showArticleEditor && (
        <ArticleEditorModal
          article={selectedArticle}
          categories={categories}
          dossiers={dossiers}
          groupes={groupes}
          onClose={() => setShowArticleEditor(false)}
          onSaved={(article) => {
            if (selectedArticle) {
              setArticles(prev => prev.map(a => a.id === article.id ? article : a));
            } else {
              setArticles(prev => [article, ...prev]);
            }
            setSelectedArticle(article);
            setShowArticleEditor(false);
            showToast(selectedArticle ? "Article modifié" : "Article créé", "success");
          }}
          showToast={showToast}
        />
      )}

      {/* ═══ Category Form Modal ═══ */}
      {showCategoryForm && (
        <CategoryFormModal
          category={editingCategory}
          parentCategories={categories.filter(c => !c.parent_id)}
          onClose={() => { setShowCategoryForm(false); setEditingCategory(null); }}
          onSaved={(cat, isNew) => {
            if (isNew) setCategories(prev => [...prev, cat]);
            else setCategories(prev => prev.map(c => c.id === cat.id ? cat : c));
            setShowCategoryForm(false);
            setEditingCategory(null);
            showToast(isNew ? "Catégorie créée" : "Catégorie modifiée", "success");
          }}
          onDeleted={(id) => {
            setCategories(prev => prev.filter(c => c.id !== id));
            if (selectedCatId === id) setSelectedCatId(null);
            setShowCategoryForm(false);
            setEditingCategory(null);
            showToast("Catégorie supprimée", "success");
          }}
          showToast={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Article Editor Modal ─────────────────────────────────────

import React from "react";

function ArticleEditorModal({ article, categories, dossiers, groupes, onClose, onSaved, showToast }: {
  article: KbArticle | null;
  categories: KbCategory[];
  dossiers: Dossier[];
  groupes: Groupe[];
  onClose: () => void;
  onSaved: (a: KbArticle) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [categoryId, setCategoryId] = useState(article?.category_id ?? "");
  const [tags, setTags] = useState(article?.tags.join(", ") ?? "");
  const [visibility, setVisibility] = useState(article?.visibility ?? "all");
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string; size: number }[]>(article?.attachments ?? []);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-attachment", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? "Échec upload", "error"); return; }
      setAttachments(prev => [...prev, { name: file.name, url: json.url, type: json.type, size: file.size }]);
    } catch { showToast("Erreur upload", "error"); }
    finally { setUploading(false); }
  };

  const handleSave = (asDraft: boolean) => {
    if (!title.trim()) { showToast("Le titre est requis", "error"); return; }
    startTransition(async () => {
      const parsedTags = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      if (article) {
        const res = await updateKbArticle(article.id, {
          title, content, summary: summary || undefined,
          category_id: categoryId || null,
          tags: parsedTags, visibility: visibility as any,
          attachments,
        });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        onSaved({ ...article, title, content, summary, category_id: categoryId || null, tags: parsedTags, visibility: visibility as any, attachments, updated_at: new Date().toISOString() });
      } else {
        const res = await createKbArticle({
          title, content, summary: summary || undefined,
          category_id: categoryId || null,
          tags: parsedTags, visibility: visibility as any,
          status: asDraft ? "draft" : "approved",
          attachments,
        });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        if ("article" in res && res.article) onSaved(res.article as KbArticle);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
          <p className="text-sm font-bold text-gray-900">{article ? "Modifier l'article" : "Nouvel article"}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={14} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:border-[#0e1e35]/30" placeholder="Titre de l'article" />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Résumé</label>
            <input value={summary} onChange={e => setSummary(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:outline-none focus:border-[#0e1e35]/30" placeholder="Résumé court (pour le chatbot)" />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Contenu</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={12}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:border-[#0e1e35]/30 resize-none font-mono" placeholder="Contenu de l'article (Markdown supporté)" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Catégorie</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none">
                <option value="">Non classé</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.parent_id ? "  └ " : ""}{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Visibilité</label>
              <select value={visibility} onChange={e => setVisibility(e.target.value as any)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none">
                <option value="all">Tout le monde</option>
                <option value="staff_only">Staff uniquement</option>
                <option value="formation">Par formation</option>
                <option value="classe">Par classe</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tags</label>
              <input value={tags} onChange={e => setTags(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none" placeholder="tag1, tag2, ..." />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pièces jointes</label>
            <div className="space-y-1 mb-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                  <FileText size={12} className="text-gray-400" />
                  <span className="text-xs text-gray-600 flex-1 truncate">{att.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="p-0.5 text-red-400 hover:text-red-600"><X size={11} /></button>
                </div>
              ))}
            </div>
            <label className="flex items-center justify-center gap-2 w-full rounded-xl px-3 py-3 text-xs cursor-pointer border border-dashed border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Upload..." : "Ajouter un fichier"}
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-100">Annuler</button>
          {!article && (
            <button onClick={() => handleSave(true)} disabled={isPending}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50">
              {isPending && <Loader2 size={11} className="animate-spin" />} Brouillon
            </button>
          )}
          <button onClick={() => handleSave(false)} disabled={isPending}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0e1e35] text-white hover:bg-[#1a3050] disabled:opacity-50">
            {isPending && <Loader2 size={11} className="animate-spin" />} {article ? "Enregistrer" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Form Modal ──────────────────────────────────────

function CategoryFormModal({ category, parentCategories, onClose, onSaved, onDeleted, showToast }: {
  category: KbCategory | null;
  parentCategories: KbCategory[];
  onClose: () => void;
  onSaved: (c: KbCategory, isNew: boolean) => void;
  onDeleted: (id: string) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [parentId, setParentId] = useState(category?.parent_id ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "FileText");
  const [color, setColor] = useState(category?.color ?? "#3B82F6");
  const [isPending, startTransition] = useTransition();

  const iconOptions = ["FileText", "GraduationCap", "BookOpen", "Users", "Calendar", "Globe", "Shield", "Building2", "Brain"];
  const colorOptions = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#6366F1", "#14B8A6", "#F97316"];

  const handleSave = () => {
    if (!name.trim()) { showToast("Le nom est requis", "error"); return; }
    startTransition(async () => {
      if (category) {
        const res = await updateKbCategory(category.id, { name, description: description || null, parent_id: parentId || null, icon, color });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        onSaved({ ...category, name, description: description || null, parent_id: parentId || null, icon, color }, false);
      } else {
        const res = await createKbCategory({ name, description: description || undefined, parent_id: parentId || null, icon, color });
        if ("error" in res) { showToast(res.error!, "error"); return; }
        if ("category" in res && res.category) onSaved(res.category as KbCategory, true);
      }
    });
  };

  const handleDelete = () => {
    if (!category || !confirm("Supprimer cette catégorie et tous ses sous-éléments ?")) return;
    startTransition(async () => {
      const res = await deleteKbCategory(category.id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      onDeleted(category.id);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">{category ? "Modifier la catégorie" : "Nouvelle catégorie"}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Nom *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Catégorie parente</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none">
              <option value="">Aucune (racine)</option>
              {parentCategories.filter(c => c.id !== category?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Icon picker */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Icône</label>
            <div className="flex items-center gap-2 flex-wrap">
              {iconOptions.map(ico => {
                const Icon = CATEGORY_ICONS[ico] ?? FileText;
                return (
                  <button key={ico} type="button" onClick={() => setIcon(ico)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${icon === ico ? "bg-[#0e1e35] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Couleur</label>
            <div className="flex items-center gap-2 flex-wrap">
              {colorOptions.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-[#0e1e35]" : ""}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          {category ? (
            <button onClick={handleDelete} disabled={isPending} className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50">
              <Trash2 size={12} className="inline mr-1" /> Supprimer
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-xl text-xs text-gray-500 border border-gray-200 hover:bg-gray-50">Annuler</button>
            <button onClick={handleSave} disabled={isPending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0e1e35] text-white hover:bg-[#1a3050] disabled:opacity-50">
              {isPending && <Loader2 size={11} className="animate-spin" />} {category ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

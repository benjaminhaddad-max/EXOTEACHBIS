"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  Home, BookOpen, Loader2, GripVertical,
} from "lucide-react";
import type { Dossier, Cours } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

type DossierNode = Dossier & { children: DossierNode[] };

interface CacheEntry { cours: Cours[]; children: Dossier[] }

function buildTree(flat: Dossier[], parentId: string | null = null): DossierNode[] {
  return flat
    .filter((d) => d.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((d) => ({ ...d, children: buildTree(flat, d.id) }));
}

function getBreadcrumb(id: string | null, allDossiers: Dossier[]): Dossier[] {
  if (!id) return [];
  const d = allDossiers.find((x) => x.id === id);
  if (!d) return [];
  return [...getBreadcrumb(d.parent_id, allDossiers), d];
}

// ─── Tree node ────────────────────────────────────────────────────────────────
function TreeNode({
  node, depth, selectedId, expandedIds, onSelect, onToggle, onPrefetch,
}: {
  node: DossierNode; depth: number; selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (d: Dossier) => void;
  onToggle: (id: string) => void;
  onPrefetch: (d: Dossier) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors select-none ${
          isSelected ? "bg-navy/10 text-navy" : "hover:bg-gray-100 text-gray-600"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onMouseEnter={() => onPrefetch(node)}
        onClick={() => { onSelect(node); if (hasChildren) onToggle(node.id); }}
      >
        {hasChildren ? (
          <span className="w-4 h-4 flex items-center justify-center shrink-0 text-gray-400">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : <span className="w-4 shrink-0" />}
        {isExpanded
          ? <FolderOpen size={14} className="shrink-0 text-blue-400" />
          : <Folder size={14} className="shrink-0 text-gray-400" />}
        <span className="text-xs font-medium" style={{ wordBreak: "break-word", whiteSpace: "normal", lineHeight: 1.3 }}>
          {node.name}
        </span>
      </div>
      {isExpanded && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId}
          expandedIds={expandedIds} onSelect={onSelect} onToggle={onToggle} onPrefetch={onPrefetch} />
      ))}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

export function EleveCoursShell({ initialDossiers }: { initialDossiers: Dossier[] }) {
  const router = useRouter();
  const [allDossiers] = useState<Dossier[]>(initialDossiers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [coursList, setCoursList] = useState<Cours[]>([]);
  const [childDossiers, setChildDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(false);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cours-sidebar-width");
      return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
    }
    return DEFAULT_WIDTH;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Data cache
  const cache = useRef<Map<string, CacheEntry>>(new Map());

  const tree = buildTree(allDossiers);
  const selectedDossier = allDossiers.find((d) => d.id === selectedId) ?? null;
  const breadcrumb = getBreadcrumb(selectedId, allDossiers);

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Fetch with cache
  const fetchDossier = useCallback(async (dossier: Dossier): Promise<CacheEntry> => {
    if (cache.current.has(dossier.id)) {
      return cache.current.get(dossier.id)!;
    }
    const supabase = createClient();

    // Fetch cours directly in this dossier
    const { data: cours, error: coursError } = await supabase
      .from("cours").select("*")
      .eq("dossier_id", dossier.id).eq("visible", true).order("order_index");

    if (coursError) console.error("Error fetching cours:", coursError);

    // Also fetch cours via matières in this dossier
    const { data: matieres } = await supabase
      .from("matieres").select("id, name, dossier_id")
      .eq("dossier_id", dossier.id).eq("visible", true);

    let matiereCours: Cours[] = [];
    if (matieres && matieres.length > 0) {
      const matiereIds = matieres.map((m: any) => m.id);
      const { data: mc } = await supabase
        .from("cours").select("*")
        .in("matiere_id", matiereIds).eq("visible", true).order("order_index");
      matiereCours = mc ?? [];
    }

    // Merge and deduplicate
    const allCours = [...(cours ?? []), ...matiereCours];
    const uniqueCours = Array.from(new Map(allCours.map(c => [c.id, c])).values());

    const entry: CacheEntry = {
      cours: uniqueCours,
      children: allDossiers
        .filter((d) => d.parent_id === dossier.id)
        .sort((a, b) => a.order_index - b.order_index),
    };
    cache.current.set(dossier.id, entry);
    return entry;
  }, [allDossiers]);

  // Prefetch on hover (silent, no loading state)
  const prefetch = useCallback((dossier: Dossier) => {
    if (!cache.current.has(dossier.id)) {
      fetchDossier(dossier).catch(() => {});
    }
  }, [fetchDossier]);

  const selectDossier = useCallback(async (dossier: Dossier) => {
    setSelectedId(dossier.id);
    setExpandedIds((prev) => new Set([...prev, dossier.id]));

    if (cache.current.has(dossier.id)) {
      // Instant from cache
      const entry = cache.current.get(dossier.id)!;
      setCoursList(entry.cours);
      setChildDossiers(entry.children);
    } else {
      setLoading(true);
      try {
        const entry = await fetchDossier(dossier);
        setCoursList(entry.cours);
        setChildDossiers(entry.children);
      } catch (err) {
        console.error("Failed to load dossier:", err);
        setCoursList([]);
        setChildDossiers(
          allDossiers
            .filter((d) => d.parent_id === dossier.id)
            .sort((a, b) => a.order_index - b.order_index)
        );
      } finally {
        setLoading(false);
      }
    }
  }, [fetchDossier, allDossiers]);

  // Drag to resize
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSidebarWidth((w) => {
        localStorage.setItem("cours-sidebar-width", String(w));
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* LEFT: Resizable tree */}
      <div
        className="shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Arborescence</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tree.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} selectedId={selectedId}
              expandedIds={expandedIds} onSelect={selectDossier} onToggle={toggleExpanded}
              onPrefetch={prefetch} />
          ))}
        </div>
      </div>

      {/* DRAG HANDLE */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-navy/20 active:bg-navy/40 transition-colors flex items-center justify-center group relative"
        onMouseDown={onMouseDown}
      >
        <GripVertical size={12} className="text-gray-300 group-hover:text-gray-400 absolute" />
      </div>

      {/* RIGHT: Content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-[#F8F7FF]">
        {selectedDossier ? (
          <>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 px-5 py-3 border-b border-gray-200 text-xs text-gray-400">
              <button onClick={() => setSelectedId(null)}><Home size={12} /></button>
              {breadcrumb.map((d, i) => (
                <span key={d.id} className="flex items-center gap-1">
                  <ChevronRight size={11} />
                  <button
                    onClick={() => selectDossier(d)}
                    className={i === breadcrumb.length - 1 ? "font-semibold text-gray-700" : "hover:text-gray-600"}
                  >
                    {d.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-gray-300" />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Sous-dossiers */}
                  {childDossiers.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Sous-dossiers</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {childDossiers.map((child) => (
                          <button key={child.id} onClick={() => selectDossier(child)}
                            onMouseEnter={() => prefetch(child)}
                            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-navy/30 hover:bg-navy/5 transition-all text-left">
                            <Folder size={18} className="text-gray-400 shrink-0" />
                            <span className="text-sm font-medium text-gray-700 truncate">{child.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cours */}
                  {coursList.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Cours &amp; Exercices</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {coursList.map((c) => (
                          <button key={c.id} onClick={() => router.push(`/cours/${c.id}`)}
                            className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md hover:border-navy/20 transition-all text-left group">
                            <div className="aspect-video bg-navy/90 flex items-center justify-center relative">
                              <BookOpen size={28} className="text-white/30" />
                              <div className="absolute bottom-2 left-2 right-2">
                                <span className="inline-block bg-[#C9A84C]/90 text-[#0e1e35] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                  {selectedDossier.name}
                                </span>
                              </div>
                            </div>
                            <div className="p-3">
                              <p className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-navy transition-colors">{c.name}</p>
                              {c.description && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{c.description}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {childDossiers.length === 0 && coursList.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <FolderOpen size={40} className="text-gray-200 mb-3" />
                      <p className="text-sm text-gray-400">Ce dossier est vide</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <FolderOpen size={48} className="text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-400">Sélectionnez un dossier</p>
            <p className="mt-1 text-xs text-gray-300">pour voir les cours et exercices</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  Home, BookOpen, GripVertical, Layers, ArrowRight,
} from "lucide-react";
import type { Dossier, Cours, Matiere } from "@/types/database";

type DossierNode = Dossier & { children: DossierNode[] };

type FlashcardDeck = {
  id: string;
  name: string;
  description: string | null;
  matiere_id: string | null;
  cours_id: string | null;
  visible: boolean;
  nb_cards: number;
  matiere?: {
    name: string;
    color: string;
  } | null;
};

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
          ? <FolderOpen size={14} className="shrink-0" style={{ color: node.color || "#6B7280" }} />
          : <Folder size={14} className="shrink-0" style={{ color: node.color || "#9CA3AF" }} />}
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

export function EleveCoursShell({
  initialDossiers,
  initialMatieres,
  initialCours,
  initialFlashcardDecks,
}: {
  initialDossiers: Dossier[];
  initialMatieres: Matiere[];
  initialCours: Cours[];
  initialFlashcardDecks: FlashcardDeck[];
}) {
  const router = useRouter();
  const [allDossiers] = useState<Dossier[]>(initialDossiers);
  const [allMatieres] = useState<Matiere[]>(initialMatieres);
  const [allCours] = useState<Cours[]>(initialCours);
  const [allFlashcardDecks] = useState<FlashcardDeck[]>(initialFlashcardDecks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [coursList, setCoursList] = useState<Cours[]>([]);
  const [childDossiers, setChildDossiers] = useState<Dossier[]>([]);
  const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeck[]>([]);

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

  const tree = buildTree(allDossiers);
  const selectedDossier = allDossiers.find((d) => d.id === selectedId) ?? null;
  const breadcrumb = getBreadcrumb(selectedId, allDossiers);
  const matiereIdsByDossier = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const matiere of allMatieres) {
      const current = map.get(matiere.dossier_id) ?? [];
      current.push(matiere.id);
      map.set(matiere.dossier_id, current);
    }
    return map;
  }, [allMatieres]);

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectDossier = useCallback((dossier: Dossier) => {
    setSelectedId(dossier.id);
    setExpandedIds((prev) => new Set([...prev, dossier.id]));
    const childDossiersForSelection = allDossiers
      .filter((candidate) => candidate.parent_id === dossier.id)
      .sort((a, b) => a.order_index - b.order_index);
    const matiereIds = matiereIdsByDossier.get(dossier.id) ?? [];
    const matiereIdSet = new Set(matiereIds);
    const uniqueCours = Array.from(
      new Map(
        allCours
          .filter((cours) => cours.dossier_id === dossier.id || (cours.matiere_id ? matiereIdSet.has(cours.matiere_id) : false))
          .map((cours) => [cours.id, cours])
      ).values()
    );
    const coursIdSet = new Set(uniqueCours.map((cours) => cours.id));
    const flashcardDecksForSelection = allFlashcardDecks.filter(
      (deck) =>
        (deck.matiere_id ? matiereIdSet.has(deck.matiere_id) : false) ||
        (deck.cours_id ? coursIdSet.has(deck.cours_id) : false)
    );

    setChildDossiers(childDossiersForSelection);
    setCoursList(uniqueCours);
    setFlashcardDecks(flashcardDecksForSelection);
  }, [allCours, allDossiers, allFlashcardDecks, matiereIdsByDossier]);

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
        className="shrink-0 border-r border-gray-200 flex flex-col overflow-hidden"
        style={{ backgroundColor: "#F7F8FC", width: sidebarWidth }}
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Arborescence</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tree.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} selectedId={selectedId}
              expandedIds={expandedIds} onSelect={selectDossier} onToggle={toggleExpanded}
              onPrefetch={() => {}} />
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
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
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
              <div className="space-y-5">
                {/* Sous-dossiers — colored icons like admin */}
                {childDossiers.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Sous-dossiers</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {childDossiers.map((child) => (
                        <button key={child.id} onClick={() => selectDossier(child)}
                          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-navy/30 hover:shadow-sm transition-all text-left">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: (child.color || "#6B7280") + "18" }}
                          >
                            <Folder size={16} style={{ color: child.color || "#6B7280" }} />
                          </div>
                          <span className="text-sm font-medium text-gray-700 truncate">{child.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cours — premium navy cards (same as admin) */}
                {coursList.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Cours &amp; Exercices</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {coursList.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => router.push(`/cours/${c.id}`)}
                          className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_8px_32px_rgba(212,171,80,0.18)] hover:border-[rgba(212,171,80,0.45)] text-left"
                          style={{
                            background: "linear-gradient(160deg, #091525 0%, #162d4a 55%, #091525 100%)",
                            border: "1px solid rgba(212,171,80,0.22)",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,171,80,0.08)",
                          }}
                        >
                          <div className="relative overflow-hidden" style={{ minHeight: 130 }}>
                            {/* Shimmer top */}
                            <div className="absolute top-0 inset-x-0 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, rgba(212,171,80,0.45), transparent)" }} />
                            {/* Golden glow */}
                            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 100% 70% at 50% 30%, rgba(212,171,80,0.07) 0%, transparent 65%)" }} />

                            {/* Badge "Fiche de cours" + dossier name */}
                            <div className="relative z-10 flex items-center justify-between px-2.5 pt-2.5 pb-1">
                              <span
                                className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide whitespace-nowrap"
                                style={{ background: "rgba(212,171,80,0.12)", color: "rgba(212,171,80,0.80)", border: "1px solid rgba(212,171,80,0.20)" }}
                              >
                                Fiche de cours
                              </span>
                              <span className="truncate text-[9px] font-bold whitespace-nowrap tracking-wide" style={{ color: "rgba(212,171,80,0.75)" }}>
                                {selectedDossier?.name}
                              </span>
                            </div>

                            {/* Center: logo watermark */}
                            <div className="relative flex items-center justify-center" style={{ height: 48 }}>
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.13 }}>
                                <BookOpen size={32} className="text-white" />
                              </div>
                              <div className="absolute bottom-1 left-3 flex gap-1 pointer-events-none" style={{ opacity: 0.18 }}>
                                {[0,1,2].map(i => <div key={i} className="h-0.5 w-0.5 rounded-full bg-white" />)}
                              </div>
                              <div className="absolute bottom-1 right-3 flex gap-1 pointer-events-none" style={{ opacity: 0.18 }}>
                                {[0,1,2].map(i => <div key={i} className="h-0.5 w-0.5 rounded-full bg-white" />)}
                              </div>
                            </div>

                            {/* Gold separator */}
                            <div className="mx-2.5 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,171,80,0.35), transparent)" }} />

                            {/* Title */}
                            <div className="px-2.5 pt-2 pb-2.5">
                              <div
                                className="w-full rounded-xl px-2.5 py-2 text-center"
                                style={{
                                  background: "linear-gradient(135deg, rgba(212,171,80,0.13) 0%, rgba(212,171,80,0.05) 100%)",
                                  border: "1px solid rgba(212,171,80,0.28)",
                                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                                }}
                              >
                                <p className="text-[12px] font-extrabold text-white leading-snug line-clamp-2 tracking-wide">
                                  {c.name}
                                </p>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {flashcardDecks.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Flashcards</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {flashcardDecks.map((deck) => (
                        <button
                          key={deck.id}
                          onClick={() => router.push(`/cours/flashcards/${deck.id}`)}
                          className="group rounded-2xl border border-[#D7E4F6] bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#4FABDB]/45 hover:shadow-[0_10px_30px_rgba(18,49,77,0.08)]"
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div
                              className="flex h-11 w-11 items-center justify-center rounded-2xl"
                              style={{
                                backgroundColor: deck.matiere?.color ? `${deck.matiere.color}18` : "rgba(79,171,219,0.12)",
                                color: deck.matiere?.color ?? "#4FABDB",
                              }}
                            >
                              <Layers size={20} />
                            </div>
                            <span className="rounded-full bg-[#F4F8FC] px-2.5 py-1 text-[11px] font-semibold text-[#12314D]">
                              {deck.nb_cards} carte{deck.nb_cards !== 1 ? "s" : ""}
                            </span>
                          </div>

                          <h3 className="text-sm font-semibold text-[#12314D]">{deck.name}</h3>
                          {deck.description && (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#5B6B7D]">
                              {deck.description}
                            </p>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap gap-2">
                              {deck.matiere && (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                                  style={{ backgroundColor: deck.matiere.color }}
                                >
                                  {deck.matiere.name}
                                </span>
                              )}
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#4FABDB] transition-all group-hover:gap-1.5">
                              Réviser
                              <ArrowRight size={12} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {childDossiers.length === 0 && coursList.length === 0 && flashcardDecks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FolderOpen size={40} className="text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Ce dossier est vide</p>
                  </div>
                )}
              </div>
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

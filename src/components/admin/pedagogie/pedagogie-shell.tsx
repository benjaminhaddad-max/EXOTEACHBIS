"use client";

import { useState, useTransition, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown,
  Folder, FolderOpen, X, Eye, EyeOff, Upload,
  FileText, Loader2, Check, AlertCircle,
  Link as LinkIcon, Video, FileVideo, LayoutList, Search,
  FolderPlus, Home, GripVertical, BookOpen, Layers, Sparkles,
  Building2, Calendar, Clock, GraduationCap, ImagePlus, LayoutGrid,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Dossier, Ressource, Cours } from "@/types/database";
import { uploadPdf } from "@/lib/upload-pdf";
import { CoursDetailPanel } from "./cours-detail-panel";
import { DossierExercicesView } from "./dossier-exercices-view";
import {
  DOSSIER_TYPE_META,
  canCreateCourseInDossier,
  getAllowedChildTypes,
  getContentCreationLabel,
  getDefaultChildType,
  getDossierPathLabel,
  getOfferLabel,
  inferOfferFromAncestors,
} from "@/lib/pedagogie-structure";
import type { DossierNamePreset, FormationOfferSetting } from "@/lib/pedagogie-admin-settings";
import { getDossierSuggestions } from "@/lib/pedagogie-admin-settings";
import {
  getAllDossiers,
  createDossier, updateDossier, deleteDossier,
  createRessource, updateRessource, deleteRessource, getRessourcesByDossier,
  reorderDossiers, reorderRessources,
  getCourssByDossier, createCoursInDossier, updateCoursInDossier, deleteCoursFromDossier, reorderCours,
  installCanonicalOffers, bulkSetEtiquettes,
} from "@/app/(admin)/admin/pedagogie/actions";
import { TagInput } from "./tag-input";

// =============================================
// TYPES
// =============================================

type DossierNode = Dossier & { children: DossierNode[] };

type ModalState =
  | { type: "add_picker"; parentId: string | null }
  | { type: "create_dossier"; parentId: string | null }
  | { type: "edit_dossier"; dossier: Dossier }
  | { type: "create_ressource"; dossierId: string; ressourceType: string }
  | { type: "edit_ressource"; ressource: Ressource }
  | { type: "create_cours"; dossierId: string }
  | { type: "bulk_create_cours"; dossierId: string }
  | { type: "bulk_create_dossiers"; parentId: string | null }
  | { type: "edit_cours"; cours: Cours }
  | null;

const COLORS = [
  "#0e1e35", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316",
  "#C9A84C", "#6366F1", "#14B8A6", "#FB923C", "#A855F7",
];

// =============================================
// TREE HELPERS
// =============================================

function buildTree(flat: Dossier[], parentId: string | null = null): DossierNode[] {
  return flat
    .filter((d) => d.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((d) => ({ ...d, children: buildTree(flat, d.id) }));
}

// =============================================
// MAIN SHELL
// =============================================

export type DossierWithMatieres = Dossier & { matieres?: any[] };

const TREE_WIDTH_STORAGE_KEY = "pedagogie_tree_width_v1";
const TREE_MIN_WIDTH = 320;
const TREE_MAX_WIDTH = 720;

export function PedagogieShell({
  initialDossiers,
  formationOffers,
  dossierNamePresets,
  userRole = "admin",
}: {
  initialDossiers: Dossier[];
  formationOffers: FormationOfferSetting[];
  dossierNamePresets: DossierNamePreset[];
  userRole?: string;
}) {
  const canEdit = userRole === "admin" || userRole === "superadmin";
  const searchParams = useSearchParams();
  const [allDossiers, setAllDossiers] = useState<Dossier[]>(initialDossiers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCours, setSelectedCours] = useState<Cours | null>(null);
  const [dossierTab, setDossierTab] = useState<"contenu" | "exercices">("contenu");
  const [allCoursFlat, setAllCoursFlat] = useState<Cours[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [ressourcesMap, setRessourcesMap] = useState<Record<string, Ressource[]>>({});
  const [coursMap, setCoursMap] = useState<Record<string, Cours[]>>({});
  const [loadingRessources, setLoadingRessources] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<{ label: string; onConfirm: () => void } | null>(null);
  const [coursViewMode, setCoursViewMode] = useState<"cards" | "list">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("pedagogie-cours-view") as "cards" | "list") || "cards";
    return "cards";
  });
  const [selectedCoursIds, setSelectedCoursIds] = useState<Set<string>>(new Set());
  const [bulkEtiquettes, setBulkEtiquettes] = useState<string[]>([]);
  const [showBulkPopover, setShowBulkPopover] = useState(false);
  const [treeWidth, setTreeWidth] = useState(360);
  const [isResizingTree, setIsResizingTree] = useState(false);
  const treeWidthRef = useRef(treeWidth);
  const resizeStartRef = useRef<{ mouseX: number; width: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const tree: DossierNode[] = buildTree(allDossiers as Dossier[]);
  const hasOfferRoots = useMemo(
    () => allDossiers.some((d) => d.dossier_type === "offer" && !d.parent_id),
    [allDossiers]
  );
  const selectedDossier = allDossiers.find((d) => d.id === selectedId) ?? null;
  const childDossiers = allDossiers
    .filter((d) => d.parent_id === selectedId)
    .sort((a, b) => a.order_index - b.order_index);
  const ressources = selectedId ? (ressourcesMap[selectedId] ?? []) : [];
  const coursList = selectedId ? (coursMap[selectedId] ?? []) : [];
  const contentCreationLabel = getContentCreationLabel(selectedDossier?.dossier_type);

  // Breadcrumb
  const getBreadcrumb = (id: string | null): Dossier[] => {
    if (!id) return [];
    const d = allDossiers.find((x) => x.id === id);
    if (!d) return [];
    return [...getBreadcrumb(d.parent_id), d];
  };
  const breadcrumb = getBreadcrumb(selectedId);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Auto-select dossier from URL query param (when navigating back from a cours)
  useEffect(() => {
    const dossierId = searchParams.get("dossier");
    if (!dossierId) return;
    const dossier = initialDossiers.find((d) => d.id === dossierId);
    if (!dossier) return;
    // Expand all ancestors
    const expandAncestors = (id: string | null) => {
      if (!id) return;
      setExpandedIds((prev) => new Set([...prev, id]));
      const parent = initialDossiers.find((d) => d.id === id);
      if (parent?.parent_id) expandAncestors(parent.parent_id);
    };
    if (dossier.parent_id) expandAncestors(dossier.parent_id);
    selectDossier(dossier);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedWidth = Number(window.localStorage.getItem(TREE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(savedWidth) && savedWidth >= TREE_MIN_WIDTH && savedWidth <= TREE_MAX_WIDTH) {
      setTreeWidth(savedWidth);
    }
  }, []);

  useEffect(() => {
    if (!isResizingTree || typeof window === "undefined") return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const viewportMax = Math.min(TREE_MAX_WIDTH, Math.floor(window.innerWidth * 0.55));
      const delta = event.clientX - resizeStartRef.current.mouseX;
      const nextWidth = Math.max(
        TREE_MIN_WIDTH,
        Math.min(viewportMax, resizeStartRef.current.width + delta)
      );
      setTreeWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingTree(false);
      resizeStartRef.current = null;
      window.localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(treeWidthRef.current));
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingTree]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    treeWidthRef.current = treeWidth;
    window.localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(treeWidth));
  }, [treeWidth]);

  useEffect(() => {
    if (!selectedId) return;
    setExpandedIds((prev) => {
      if (prev.has(selectedId)) return prev;
      return new Set([...prev, selectedId]);
    });
  }, [selectedId]);

  const fetchDossierData = async (dossierId: string) => {
    // Utilise les Server Actions (createClient server-side) pour bypass RLS anon
    const [ressResult, coursResult] = await Promise.all([
      getRessourcesByDossier(dossierId),
      getCourssByDossier(dossierId),
    ]);
    const ressources = ressResult.data ?? [];
    const cours = ((coursResult.data ?? []) as Cours[]).sort((a, b) => {
      const oi = (a.order_index ?? 0) - (b.order_index ?? 0);
      if (oi !== 0) return oi;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
    // Auto-fix: si tous les order_index sont identiques, normaliser en base
    const allSameIndex = cours.length > 1 && cours.every((c) => c.order_index === cours[0].order_index);
    if (allSameIndex) {
      const updates = cours.map((c, i) => ({ id: c.id, order_index: i }));
      reorderCours(updates).catch(() => {});
      cours.forEach((c, i) => { c.order_index = i; });
    }
    return { ressources, cours };
  };

  const selectDossier = async (dossier: Dossier) => {
    setSelectedId(dossier.id);
    setSelectedCours(null);
    setDossierTab("contenu");
    setSelectedCoursIds(new Set());
    setShowBulkPopover(false);
    setExpandedIds((prev) => new Set([...prev, dossier.id]));
    // Toujours refetch (pas de cache stale après deploy)
    setLoadingRessources(true);
    const { ressources, cours } = await fetchDossierData(dossier.id);
    setRessourcesMap((prev) => ({ ...prev, [dossier.id]: ressources as Ressource[] }));
    setCoursMap((prev) => ({ ...prev, [dossier.id]: cours }));
    setAllCoursFlat((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      return [...prev, ...cours.filter((c) => !existingIds.has(c.id))];
    });
    setLoadingRessources(false);
  };

  const refreshAll = async () => {
    const result = await getAllDossiers();
    setAllDossiers(result.data as Dossier[]);
    if (selectedId) {
      const { ressources, cours } = await fetchDossierData(selectedId);
      setRessourcesMap((prev) => ({ ...prev, [selectedId]: ressources as Ressource[] }));
      setCoursMap((prev) => ({ ...prev, [selectedId]: cours }));
    }
  };

  // Drag end — sous-dossiers dans le panneau droit
  const handleDragEndChildren = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = childDossiers.findIndex((d) => d.id === active.id);
    const newIndex = childDossiers.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(childDossiers, oldIndex, newIndex);
    // Optimistic update
    setAllDossiers((prev) => {
      const others = prev.filter((d) => d.parent_id !== selectedId || !reordered.find((r) => r.id === d.id));
      return [...others, ...reordered.map((d, i) => ({ ...d, order_index: i }))];
    });
    await reorderDossiers(reordered.map((d, i) => ({ id: d.id, order_index: i })));
  };

  // Drag end — cours dans le panneau droit
  const handleDragEndCours = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedId) return;
    const list = coursMap[selectedId] ?? [];
    const oldIndex = list.findIndex((c) => c.id === active.id);
    const newIndex = list.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(list, oldIndex, newIndex);
    setCoursMap((prev) => ({ ...prev, [selectedId]: reordered }));
    await reorderCours(reordered.map((c, i) => ({ id: c.id, order_index: i })));
  };

  // Drag end — ressources dans le panneau droit
  const handleDragEndRessources = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedId) return;
    const list = ressourcesMap[selectedId] ?? [];
    const oldIndex = list.findIndex((r) => r.id === active.id);
    const newIndex = list.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(list, oldIndex, newIndex);
    setRessourcesMap((prev) => ({ ...prev, [selectedId]: reordered }));
    await reorderRessources(reordered.map((r, i) => ({ id: r.id, order_index: i })));
  };

  // Drag end — arbre gauche (même niveau parent)
  const handleDragEndTree = async (event: DragEndEvent, parentId: string | null) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const siblings = allDossiers
      .filter((d) => d.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index);
    const oldIndex = siblings.findIndex((d) => d.id === active.id);
    const newIndex = siblings.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(siblings, oldIndex, newIndex);
    setAllDossiers((prev) => {
      const others = prev.filter((d) => d.parent_id !== parentId);
      return [...others, ...reordered.map((d, i) => ({ ...d, order_index: i }))];
    });
    await reorderDossiers(reordered.map((d, i) => ({ id: d.id, order_index: i })));
  };

  const handleAction = async (action: () => Promise<{ error?: string; success?: boolean }>) => {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast("Sauvegardé", "success");
        setModal(null);
        await refreshAll();
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

      {/* ── LEFT: Arborescence ── */}
      <div
        className="flex flex-shrink-0 flex-col border-r border-gray-100 bg-[#F7F8FC]"
        style={{ width: treeWidth }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-navy px-4 py-3">
          <h2 className="text-sm font-semibold text-white/90">Arborescence</h2>
          {canEdit && (
            <div className="flex items-center gap-2">
              {!hasOfferRoots && (
                <button
                  onClick={() => handleAction(() => installCanonicalOffers(formationOffers))}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/70 transition hover:bg-white/10"
                >
                  Installer les offres
                </button>
              )}
              <button
                onClick={() => setModal({ type: "add_picker", parentId: null })}
                className="flex items-center gap-1 rounded-lg bg-gold/20 border border-gold/30 px-2.5 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/30"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderPlus className="mb-2 h-8 w-8 text-gray-200" />
              <p className="text-xs text-gray-400">Aucun dossier</p>
              {canEdit && (
                <button
                  onClick={() => setModal({ type: "add_picker", parentId: null })}
                  className="mt-2 text-xs text-navy underline"
                >
                  Créer le premier dossier
                </button>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEndTree(e, null)}
            >
              <SortableContext
                items={tree.map((n) => n.id)}
                strategy={verticalListSortingStrategy}
              >
                {tree.map((node) => (
                  <SortableTreeNode
                    key={node.id}
                    node={node}
                    selectedId={selectedId}
                    expandedIds={expandedIds}
                    sensors={sensors}
                    canEdit={canEdit}
                    onSelect={selectDossier}
                    onToggle={toggleExpanded}
                    onAdd={(parentId) => setModal({ type: "add_picker", parentId })}
                    onEdit={(d) => setModal({ type: "edit_dossier", dossier: d })}
                    onDelete={(d) => setConfirmDelete({ label: `le dossier "${d.name}"`, onConfirm: () => handleAction(() => deleteDossier(d.id)) })}
                    onDragEndChildren={handleDragEndTree}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner l'arborescence"
        onMouseDown={(event) => {
          resizeStartRef.current = {
            mouseX: event.clientX,
            width: treeWidthRef.current,
          };
          setIsResizingTree(true);
        }}
        onDoubleClick={() => {
          setTreeWidth(360);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(TREE_WIDTH_STORAGE_KEY, "360");
          }
        }}
        className={`group relative w-2 flex-shrink-0 cursor-col-resize bg-transparent transition ${isResizingTree ? "bg-navy/10" : ""}`}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition group-hover:bg-navy/30" />
      </div>

      {/* ── RIGHT: Contenu du dossier sélectionné ou cours détail ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedCours ? (
          <CoursDetailPanel cours={selectedCours} onBack={() => setSelectedCours(null)} onCoursUpdated={refreshAll} />
        ) : selectedDossier ? (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 px-5 pt-3 pb-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <button onClick={() => setSelectedId(null)} className="hover:text-gray-600">
                    <Home className="h-3 w-3" />
                  </button>
                  {breadcrumb.map((d, i) => (
                    <span key={d.id} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      <button
                        onClick={() => selectDossier(d)}
                        className={i === breadcrumb.length - 1 ? "font-semibold text-gray-700" : "hover:text-gray-600"}
                      >
                        {d.name}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-navy/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-navy/70">
                    {DOSSIER_TYPE_META[selectedDossier.dossier_type]?.shortLabel ?? "Dossier"}
                  </span>
                  {selectedDossier.etiquettes?.map((tag) => (
                    <span key={tag} className="rounded-full bg-gold/10 px-2 py-1 text-[10px] font-medium text-gold-dark">{tag}</span>
                  ))}
                  {selectedDossier.formation_offer && (
                    <span className="rounded-full bg-gold/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-dark">
                      {getOfferLabel(selectedDossier.formation_offer)}
                    </span>
                  )}
                  {canEdit && (
                    <>
                      <button
                        onClick={() => setModal({ type: "edit_dossier", dossier: selectedDossier })}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {dossierTab === "contenu" && (
                        <button
                          onClick={() => setModal({ type: "add_picker", parentId: selectedId })}
                          className="flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-navy-light"
                        >
                          <Plus className="h-4 w-4" />
                          Ajouter
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Tabs — Exercices tab only when there are cours cards */}
              <div className="flex gap-0">
                <button
                  onClick={() => setDossierTab("contenu")}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${dossierTab === "contenu" ? "border-navy text-navy" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Contenu
                </button>
                {coursList.length > 0 && (
                  <button
                    onClick={() => setDossierTab("exercices")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${dossierTab === "exercices" ? "border-gold text-gold-dark" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Exercices
                    <span className="ml-1 rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold">
                      {coursList.length}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Exercices tab */}
            {dossierTab === "exercices" ? (
              <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
                <DossierExercicesView
                  dossierId={selectedDossier.id}
                  dossierName={selectedDossier.name}
                  allDossiers={allDossiers}
                  onNewSerie={() => {}}
                />
              </div>
            ) : (

            /* Contenu tab */
            <div className="flex-1 overflow-y-auto p-5">
              {childDossiers.length === 0 && ressources.length === 0 && coursList.length === 0 && !loadingRessources ? (
                <EmptyDossier onAdd={canEdit ? () => setModal({ type: "add_picker", parentId: selectedId }) : undefined} />
              ) : (
                <div className="space-y-5">
                  {/* Sous-dossiers — drag & drop grille */}
                  {childDossiers.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-navy/40">
                        <span className="h-px flex-1 bg-navy/10" />
                        Sous-dossiers
                        <span className="h-px flex-1 bg-navy/10" />
                      </p>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndChildren}>
                        <SortableContext items={childDossiers.map((d) => d.id)} strategy={rectSortingStrategy}>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {childDossiers.map((child) => (
                              <SortableSubDossierCard
                                key={child.id}
                                dossier={child}
                                onClick={() => selectDossier(child)}
                                onEdit={canEdit ? () => setModal({ type: "edit_dossier", dossier: child }) : undefined}
                                onDelete={canEdit ? () => setConfirmDelete({ label: `le dossier "${child.name}"`, onConfirm: () => handleAction(() => deleteDossier(child.id)) }) : undefined}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {/* Cours — drag & drop grille ou liste */}
                  {loadingRessources ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  ) : coursList.length > 0 ? (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-px flex-1 bg-navy/10" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-navy/40">Cours</span>
                        <span className="h-px flex-1 bg-navy/10" />
                        <div className="flex gap-0.5 rounded-lg border border-gray-200 p-0.5">
                          <button
                            onClick={() => { setCoursViewMode("cards"); localStorage.setItem("pedagogie-cours-view", "cards"); }}
                            className={`rounded-md p-1 transition ${coursViewMode === "cards" ? "bg-navy/10 text-navy" : "text-gray-400 hover:text-gray-600"}`}
                            title="Vue cartes"
                          >
                            <LayoutGrid className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setCoursViewMode("list"); localStorage.setItem("pedagogie-cours-view", "list"); }}
                            className={`rounded-md p-1 transition ${coursViewMode === "list" ? "bg-navy/10 text-navy" : "text-gray-400 hover:text-gray-600"}`}
                            title="Vue liste"
                          >
                            <LayoutList className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {coursViewMode === "cards" ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCours}>
                          <SortableContext items={coursList.map((c) => c.id)} strategy={rectSortingStrategy}>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {coursList.map((c) => (
                                <SortableCoursCard
                                  key={c.id}
                                  cours={c}
                                  matiereLabel={selectedDossier?.dossier_type === "subject" ? "Chapitre" : selectedDossier?.name ?? ""}
                                  onSelect={() => setSelectedCours(c)}
                                  onEdit={canEdit ? () => setModal({ type: "edit_cours", cours: c }) : undefined}
                                  onDelete={canEdit ? () => setConfirmDelete({ label: `le cours "${c.name}"`, onConfirm: () => handleAction(() => deleteCoursFromDossier(c.id)) }) : undefined}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <>
                          {/* Bulk action bar */}
                          {canEdit && selectedCoursIds.size > 0 && (
                            <div className="mb-2 flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/5 px-3 py-2">
                              <span className="text-xs font-semibold text-gold-dark">{selectedCoursIds.size} cours sélectionné{selectedCoursIds.size > 1 ? "s" : ""}</span>
                              <button
                                type="button"
                                onClick={() => { setSelectedCoursIds(new Set(coursList.map((c) => c.id))); }}
                                className="text-[10px] font-medium text-navy/60 hover:text-navy underline"
                              >Tout sélectionner</button>
                              <button
                                type="button"
                                onClick={() => { setSelectedCoursIds(new Set()); }}
                                className="text-[10px] font-medium text-navy/60 hover:text-navy underline"
                              >Désélectionner</button>
                              <div className="ml-auto relative">
                                <button
                                  type="button"
                                  onClick={() => setShowBulkPopover(!showBulkPopover)}
                                  className="rounded-lg bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-dark hover:bg-gold/20 transition"
                                >Étiquettes</button>
                                {showBulkPopover && (
                                  <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                                    <p className="mb-2 text-xs font-semibold text-gray-700">Attribuer des étiquettes</p>
                                    <TagInput
                                      value={bulkEtiquettes}
                                      onChange={setBulkEtiquettes}
                                      suggestions={[...new Set(coursList.flatMap((c) => c.etiquettes ?? []))].sort()}
                                      placeholder="Taper puis Enter..."
                                    />
                                    <div className="mt-2 flex justify-end gap-2">
                                      <button type="button" onClick={() => { setShowBulkPopover(false); setBulkEtiquettes([]); }} className="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100">Annuler</button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await handleAction(() => bulkSetEtiquettes([...selectedCoursIds], bulkEtiquettes));
                                          setShowBulkPopover(false);
                                          setBulkEtiquettes([]);
                                          setSelectedCoursIds(new Set());
                                        }}
                                        className="rounded-lg bg-navy px-3 py-1 text-xs font-semibold text-white hover:bg-navy/90"
                                      >Appliquer</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCours}>
                            <SortableContext items={coursList.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-1.5">
                                {coursList.map((c) => (
                                  <SortableCoursRow
                                    key={c.id}
                                    cours={c}
                                    dossierId={selectedDossier?.id ?? ""}
                                    selected={selectedCoursIds.has(c.id)}
                                    onToggleSelect={canEdit ? () => {
                                      setSelectedCoursIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                        return next;
                                      });
                                    } : undefined}
                                    onSelect={() => setSelectedCours(c)}
                                    onEdit={canEdit ? () => setModal({ type: "edit_cours", cours: c }) : undefined}
                                    onDelete={canEdit ? () => setConfirmDelete({ label: `le cours "${c.name}"`, onConfirm: () => handleAction(() => deleteCoursFromDossier(c.id)) }) : undefined}
                                    onPdfUploaded={refreshAll}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </>
                      )}
                    </div>
                  ) : null}

                  {/* Ressources — drag & drop liste */}
                  {!loadingRessources && ressources.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-navy/40">
                        <span className="h-px flex-1 bg-navy/10" />
                        Ressources
                        <span className="h-px flex-1 bg-navy/10" />
                      </p>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndRessources}>
                        <SortableContext items={ressources.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {ressources.map((r) => (
                              <SortableRessourceRow
                                key={r.id}
                                ressource={r}
                                onEdit={canEdit ? () => setModal({ type: "edit_ressource", ressource: r }) : undefined}
                                onDelete={canEdit ? () => setConfirmDelete({ label: `la ressource "${r.titre}"`, onConfirm: () => handleAction(() => deleteRessource(r.id)) }) : undefined}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-navy/5 ring-1 ring-navy/10">
              <img src="/logo-ds.svg" alt="" className="h-16 w-16 object-contain opacity-60" />
            </div>
            <p className="text-sm font-semibold text-navy/60">Sélectionnez un dossier</p>
            <p className="mt-1.5 text-xs text-gray-400 max-w-[180px] leading-relaxed">Choisissez un dossier dans l'arborescence pour voir et gérer son contenu</p>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>

          {/* Picker "+" — style ExoTeach */}
          {modal.type === "add_picker" && (
            <AddPickerModal
              parentDossier={modal.parentId ? allDossiers.find((d) => d.id === modal.parentId) ?? null : null}
              onCreateDossier={() => setModal({ type: "create_dossier", parentId: modal.parentId })}
              onBulkCreateDossiers={() => setModal({ type: "bulk_create_dossiers", parentId: modal.parentId })}
              onCreateCours={() => {
                if (modal.parentId) {
                  setModal({ type: "create_cours", dossierId: modal.parentId });
                } else {
                  setModal(null);
                }
              }}
              onBulkCreateCours={() => {
                if (modal.parentId) {
                  setModal({ type: "bulk_create_cours", dossierId: modal.parentId });
                } else {
                  setModal(null);
                }
              }}
              onCreateRessource={(type) => {
                if (modal.parentId) {
                  setModal({ type: "create_ressource", dossierId: modal.parentId, ressourceType: type });
                } else {
                  setModal(null);
                }
              }}
              canAddContent={!!modal.parentId && canCreateCourseInDossier(allDossiers.find((d) => d.id === modal.parentId)?.dossier_type)}
              onClose={() => setModal(null)}
            />
          )}

          {modal.type === "create_dossier" && (
            <DossierForm
              title={modal.parentId ? "Nouveau sous-dossier" : "Nouveau dossier"}
              allDossiers={allDossiers}
              parentDossier={modal.parentId ? allDossiers.find((d) => d.id === modal.parentId) ?? null : null}
              onSubmit={(data) => handleAction(() => createDossier({ ...data, parent_id: modal.parentId }))}
              onClose={() => setModal(null)}
              isPending={isPending}
              formationOffers={formationOffers}
              dossierNamePresets={dossierNamePresets}
            />
          )}

          {modal.type === "edit_dossier" && (
            <DossierForm
              title="Modifier le dossier"
              allDossiers={allDossiers}
              parentDossier={modal.dossier.parent_id ? allDossiers.find((d) => d.id === modal.dossier.parent_id) ?? null : null}
              initialData={modal.dossier}
              onSubmit={(data) => handleAction(() => updateDossier(modal.dossier.id, data))}
              onClose={() => setModal(null)}
              isPending={isPending}
              formationOffers={formationOffers}
              dossierNamePresets={dossierNamePresets}
            />
          )}

          {modal.type === "create_ressource" && (
            <RessourceForm
              title="Nouveau contenu"
              dossierId={modal.dossierId}
              defaultType={modal.ressourceType}
              onSubmit={(data) => handleAction(() => createRessource({ ...data, dossier_id: modal.dossierId }))}
              onClose={() => setModal(null)}
              isPending={isPending}
            />
          )}

          {modal.type === "edit_ressource" && (
            <RessourceForm
              title="Modifier le contenu"
              dossierId={modal.ressource.dossier_id ?? ""}
              initialData={modal.ressource}
              onSubmit={(data) => handleAction(() => updateRessource(modal.ressource.id, data))}
              onClose={() => setModal(null)}
              isPending={isPending}
            />
          )}

          {modal.type === "create_cours" && (
            <CoursForm
              title={contentCreationLabel}
              dossierId={modal.dossierId}
              onSubmit={(data) => handleAction(() => createCoursInDossier({ ...data, dossier_id: modal.dossierId }))}
              onClose={() => setModal(null)}
              isPending={isPending}
            />
          )}

          {modal.type === "bulk_create_cours" && (
            <BulkCreateCoursModal
              dossierId={modal.dossierId}
              onCreated={() => { setModal(null); refreshAll(); }}
              onClose={() => setModal(null)}
            />
          )}

          {modal.type === "bulk_create_dossiers" && (
            <BulkCreateDossiersModal
              parentId={modal.parentId}
              parentDossier={modal.parentId ? allDossiers.find((d) => d.id === modal.parentId) ?? null : null}
              onCreated={() => { setModal(null); refreshAll(); }}
              onClose={() => setModal(null)}
            />
          )}

          {modal.type === "edit_cours" && (
            <CoursForm
              title="Modifier le cours"
              dossierId={modal.cours.dossier_id ?? ""}
              initialData={modal.cours}
              onSubmit={(data) => handleAction(() => updateCoursInDossier(modal.cours.id, data))}
              onClose={() => setModal(null)}
              isPending={isPending}
            />
          )}
        </ModalOverlay>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">Confirmer la suppression</h3>
              <p className="text-sm text-gray-500">
                Voulez-vous vraiment supprimer <span className="font-medium text-gray-700">{confirmDelete.label}</span> ? Cette action est irréversible.
              </p>
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={() => { confirmDelete.onConfirm(); setConfirmDelete(null); }}
                className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// BULK CREATE DOSSIERS MODAL
// =============================================

function BulkCreateDossiersModal({ parentId, parentDossier, onCreated, onClose }: {
  parentId: string | null;
  parentDossier: Dossier | null;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const childType = getDefaultChildType(parentDossier);
  const childLabel = DOSSIER_TYPE_META[childType]?.shortLabel ?? "Dossier";

  const names = input
    .split("\n")
    .map((line) => line.replace(/^\s*[-•●◦▪▸▹►]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((name) => name.length > 1);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setAnalyzing(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/extract-cours-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
      });
      const data = await res.json();
      if (data.courses && data.courses.length > 0) {
        setInput((prev) => {
          const existing = prev.trim();
          const newNames = data.courses.join("\n");
          return existing ? `${existing}\n${newNames}` : newNames;
        });
      } else if (data.error) {
        alert(`Erreur: ${data.error}`);
      } else {
        alert("Aucun nom trouvé dans l'image.");
      }
    } catch {
      alert("Erreur lors de l'analyse de l'image.");
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  }, [handleImageFile]);

  const handleCreate = async () => {
    if (names.length === 0 || creating) return;
    setCreating(true);
    let ok = 0;
    const errors: string[] = [];

    for (let i = 0; i < names.length; i++) {
      try {
        const res = await createDossier({
          name: names[i],
          dossier_type: childType,
          color: COLORS[i % COLORS.length],
          parent_id: parentId,
          order_index: i,
          visible: true,
        });
        if ("error" in res) errors.push(`${names[i]}: ${res.error}`);
        else ok++;
      } catch (e: any) {
        errors.push(`${names[i]}: ${e.message}`);
      }
    }

    setResult({ ok, errors });
    setCreating(false);
    if (ok > 0) onCreated();
  };

  return (
    <div className="rounded-2xl bg-white shadow-2xl overflow-hidden w-full max-w-md">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Créer plusieurs {childLabel.toLowerCase()}s</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="p-5 space-y-4">
        {/* Screenshot upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
            analyzing
              ? "border-blue-300 bg-blue-50"
              : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
            }}
          />
          {analyzing ? (
            <>
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
              <p className="text-xs text-blue-600 font-medium">Analyse du screenshot en cours...</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-gray-400" />
              <p className="text-xs text-gray-500 text-center">
                <span className="font-medium text-gray-700">Importer un screenshot</span>
                <br />
                Glissez une image ou cliquez pour extraire les noms
              </p>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Noms (un par ligne)</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={"Chimie générale\nBiologie cellulaire\nAnatomie\nPhysiologie\n..."}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
            autoFocus
          />
          {names.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">{names.length} {childLabel.toLowerCase()}{names.length > 1 ? "s" : ""} à créer</p>
          )}
        </div>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-xs ${result.errors.length > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
            <p className="font-semibold">{result.ok} créé{result.ok > 1 ? "s" : ""}</p>
            {result.errors.map((e, i) => <p key={i} className="text-red-600 mt-1">{e}</p>)}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Fermer
          </button>
          <button
            onClick={handleCreate}
            disabled={names.length === 0 || creating}
            className="flex-1 py-2 rounded-xl bg-[#0e1e35] text-white text-sm font-semibold hover:bg-[#1a2d4a] disabled:opacity-40 transition-colors"
          >
            {creating ? "Création..." : `Créer ${names.length} ${childLabel.toLowerCase()}${names.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// ADD PICKER MODAL — style ExoTeach
// =============================================

const CONTENT_TYPES = [
  { type: "pdf",   label: "PDF",   icon: <FileText className="h-8 w-8" />,  color: "text-red-500",  bg: "hover:bg-red-50 hover:border-red-200" },
  { type: "video", label: "Vidéo", icon: <Video className="h-8 w-8" />,     color: "text-blue-500", bg: "hover:bg-blue-50 hover:border-blue-200" },
  { type: "vimeo", label: "Vimeo", icon: <FileVideo className="h-8 w-8" />, color: "text-cyan-500", bg: "hover:bg-cyan-50 hover:border-cyan-200" },
  { type: "lien",  label: "Lien",  icon: <LinkIcon className="h-8 w-8" />,      color: "text-green-500",bg: "hover:bg-green-50 hover:border-green-200" },
];

function BulkCreateCoursModal({ dossierId, onCreated, onClose }: {
  dossierId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const courseNames = input
    .split("\n")
    .map((line) => line.replace(/^\s*[-•●◦▪▸▹►]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((name) => name.length > 1);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setAnalyzing(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/extract-cours-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
      });
      const data = await res.json();
      if (data.courses && data.courses.length > 0) {
        setInput((prev) => {
          const existing = prev.trim();
          const newNames = data.courses.join("\n");
          return existing ? `${existing}\n${newNames}` : newNames;
        });
      } else if (data.error) {
        alert(`Erreur: ${data.error}`);
      } else {
        alert("Aucun nom de cours trouvé dans l'image.");
      }
    } catch {
      alert("Erreur lors de l'analyse de l'image.");
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  }, [handleImageFile]);

  const handleCreate = async () => {
    if (courseNames.length === 0 || creating) return;
    setCreating(true);
    let ok = 0;
    const errors: string[] = [];

    // Fetch existing cours to start order_index after the last one
    const existing = await getCourssByDossier(dossierId);
    const startIndex = ("data" in existing && existing.data.length > 0)
      ? Math.max(...existing.data.map((c: any) => c.order_index ?? 0)) + 1
      : 0;

    for (let i = 0; i < courseNames.length; i++) {
      try {
        const res = await createCoursInDossier({
          dossier_id: dossierId,
          name: courseNames[i],
          visible: true,
          order_index: startIndex + i,
        });
        if ("error" in res) errors.push(`${courseNames[i]}: ${res.error}`);
        else ok++;
      } catch (e: any) {
        errors.push(`${courseNames[i]}: ${e.message}`);
      }
    }

    setResult({ ok, errors });
    setCreating(false);
    if (ok > 0) onCreated();
  };

  return (
    <div className="rounded-2xl bg-white shadow-2xl overflow-hidden w-full max-w-md">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Créer plusieurs cours</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
      </div>
      <div className="p-5 space-y-4">
        {/* Screenshot upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
            analyzing
              ? "border-blue-300 bg-blue-50"
              : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
            }}
          />
          {analyzing ? (
            <>
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
              <p className="text-xs text-blue-600 font-medium">Analyse du screenshot en cours...</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-gray-400" />
              <p className="text-xs text-gray-500 text-center">
                <span className="font-medium text-gray-700">Importer un screenshot</span>
                <br />
                Glissez une image ou cliquez pour extraire les noms de cours
              </p>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Noms des cours (un par ligne)</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={"Atomistique\nIsomérie\nLiaisons chimiques\nMolécules conjuguées\n..."}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
            autoFocus
          />
          {courseNames.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">{courseNames.length} cours à créer</p>
          )}
        </div>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-xs ${result.errors.length > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
            <p className="font-semibold">{result.ok} cours créé{result.ok > 1 ? "s" : ""}</p>
            {result.errors.map((e, i) => <p key={i} className="text-red-600 mt-1">{e}</p>)}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Fermer
          </button>
          <button
            onClick={handleCreate}
            disabled={courseNames.length === 0 || creating}
            className="flex-1 py-2 rounded-xl bg-[#0e1e35] text-white text-sm font-semibold hover:bg-[#1a2d4a] disabled:opacity-40 transition-colors"
          >
            {creating ? "Création..." : `Créer ${courseNames.length} cours`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPickerModal({
  parentDossier, onCreateDossier, onBulkCreateDossiers, onCreateCours, onBulkCreateCours, onCreateRessource, canAddContent, onClose,
}: {
  parentDossier: Dossier | null;
  onCreateDossier: () => void;
  onBulkCreateDossiers: () => void;
  onCreateCours: () => void;
  onBulkCreateCours: () => void;
  onCreateRessource: (type: string) => void;
  canAddContent: boolean;
  onClose: () => void;
}) {
  const allowedChildTypes = getAllowedChildTypes(parentDossier);
  const primaryChildType = allowedChildTypes[0];
  const canCreateChildren = !parentDossier || allowedChildTypes.length > 0;
  const childLabel = primaryChildType ? DOSSIER_TYPE_META[primaryChildType].label : "Dossier";
  const childDescription = allowedChildTypes.length > 0
    ? allowedChildTypes.map((type) => DOSSIER_TYPE_META[type].shortLabel).join(" / ")
    : "Aucun sous-niveau prévu";
  const courseLabel = getContentCreationLabel(parentDossier?.dossier_type);

  return (
    <div className="rounded-2xl bg-white shadow-2xl overflow-hidden w-full max-w-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Que voulez-vous ajouter ?</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Dossier */}
        <button
          onClick={onCreateDossier}
          disabled={!canCreateChildren}
          className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition enabled:hover:border-navy/30 enabled:hover:bg-navy/5 disabled:opacity-50"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-navy/5 text-navy transition group-hover:bg-navy/10">
            <FolderPlus className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {parentDossier ? `Créer ${/^[AEIOUÉÈÊÀ]/.test(childLabel) ? "une" : "un"} ${childLabel.toLowerCase()}` : "Créer une offre"}
            </p>
            <p className="text-xs text-gray-400">
              {parentDossier ? childDescription : "Installer un niveau racine métier"}
            </p>
          </div>
        </button>

        {/* Bulk create dossiers */}
        {canCreateChildren && (
          <button
            onClick={onBulkCreateDossiers}
            className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-orange-200 hover:bg-orange-50"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:bg-orange-100">
              <ImagePlus className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Créer depuis un screenshot
              </p>
              <p className="text-xs text-gray-400">Extraire les noms depuis une capture d'écran</p>
            </div>
          </button>
        )}

        {/* Cours */}
        {canAddContent && (
          <button
            onClick={onCreateCours}
            className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{courseLabel}</p>
              <p className="text-xs text-gray-400">Chapitre PDF + séries d'exercices</p>
            </div>
          </button>
        )}

        {/* Bulk create cours */}
        {canAddContent && (
          <button
            onClick={onBulkCreateCours}
            className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-teal-200 hover:bg-teal-50"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 transition group-hover:bg-teal-100">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Créer plusieurs cours</p>
              <p className="text-xs text-gray-400">Coller une liste de noms ou un screenshot</p>
            </div>
          </button>
        )}

        {/* Contenu */}
        {canAddContent ? (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Ajouter une ressource</p>
            <div className="grid grid-cols-4 gap-2">
              {CONTENT_TYPES.map(({ type, label, icon, color, bg }) => (
                <button
                  key={type}
                  onClick={() => onCreateRessource(type)}
                  className={`flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-3 text-center transition ${bg}`}
                >
                  <span className={color}>{icon}</span>
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Sélectionnez un dossier dans l'arborescence pour y ajouter du contenu.
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================
// SORTABLE TREE NODE (récursif avec DnD)
// =============================================

function SortableTreeNode({
  node, selectedId, expandedIds, depth = 0, sensors, canEdit = true,
  onSelect, onToggle, onAdd, onEdit, onDelete, onDragEndChildren,
}: {
  node: DossierNode;
  selectedId: string | null;
  expandedIds: Set<string>;
  depth?: number;
  sensors: ReturnType<typeof useSensors>;
  canEdit?: boolean;
  onSelect: (d: Dossier) => void;
  onToggle: (id: string) => void;
  onAdd: (parentId: string) => void;
  onEdit: (d: Dossier) => void;
  onDelete: (d: Dossier) => void;
  onDragEndChildren: (event: DragEndEvent, parentId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const expanded = expandedIds.has(node.id);
  const selected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div ref={setNodeRef} style={{ ...style, marginLeft: depth > 0 ? "12px" : 0 }}>
      <div className={`group mb-0.5 flex items-start gap-1 rounded-lg px-1 py-1.5 transition ${selected ? "bg-navy/10 ring-1 ring-navy/5" : "hover:bg-white/80"}`}>
        {canEdit && (
          <span
            {...attributes}
            {...listeners}
            className="mt-0.5 flex-shrink-0 cursor-grab touch-none p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        <div className="flex flex-1 items-start gap-1.5 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) {
                if (expanded) {
                  onToggle(node.id);
                  return;
                }
                onToggle(node.id);
                onSelect(node);
                return;
              }
              onSelect(node);
            }}
            className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-black/5"
          >
            {hasChildren
              ? expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              : <span className="w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onSelect(node)}
            className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
          >
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded overflow-hidden" style={{ backgroundColor: node.color + "20" }}>
              {node.icon_url
                ? <img src={node.icon_url} alt="" className="h-3.5 w-3.5 object-contain" />
                : <Folder className="h-3 w-3" style={{ color: node.color }} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block whitespace-normal break-words text-xs leading-snug ${selected ? "font-semibold text-navy" : "text-gray-700"}`}>
                {node.name}
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5">
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  {DOSSIER_TYPE_META[node.dossier_type]?.shortLabel ?? "Dossier"}
                </span>
                {node.etiquettes?.map((tag) => (
                  <span key={tag} className="rounded-full bg-gold/10 px-1.5 py-0.5 text-[9px] font-medium text-gold-dark">{tag}</span>
                ))}
              </span>
            </span>
            {!node.visible && <EyeOff className="mt-0.5 h-3 w-3 flex-shrink-0 text-gray-300" />}
          </button>
        </div>

        {canEdit && (
          <div className="mt-0.5 flex flex-shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
            <button onClick={(e) => { e.stopPropagation(); onAdd(node.id); }} className="rounded p-1 text-gray-400 hover:bg-navy/10 hover:text-navy" title="Ajouter">
              <Plus className="h-3 w-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEdit(node); }} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500" title="Modifier">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(node); }} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Supprimer">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Enfants récursifs avec DnD */}
      {expanded && hasChildren && (
        <div className="border-l border-gray-100 ml-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEndChildren(e, node.id)}>
            <SortableContext items={node.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {node.children.map((child) => (
                <SortableTreeNode
                  key={child.id}
                  node={child}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  depth={depth + 1}
                  sensors={sensors}
                  canEdit={canEdit}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  onAdd={onAdd}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDragEndChildren={onDragEndChildren}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

// =============================================
// SORTABLE SUB-DOSSIER CARD (grille drag & drop)
// =============================================

// Type-based visual styles for sub-dossier cards — Diploma Santé charte graphique
const CARD_STYLES: Record<string, { icon: typeof Folder; gradient: string; iconBg: string; iconColor: string; badgeBg: string; badgeText: string; border: string }> = {
  offer:      { icon: GraduationCap, gradient: "linear-gradient(145deg, #0e1e35 0%, #162d4a 50%, #1a3555 100%)", iconBg: "rgba(201,168,76,0.18)", iconColor: "#E3C286", badgeBg: "rgba(201,168,76,0.18)", badgeText: "#E3C286", border: "rgba(201,168,76,0.35)" },
  university: { icon: Building2,     gradient: "linear-gradient(145deg, #0e1e35 0%, #14253d 50%, #182c47 100%)", iconBg: "rgba(255,255,255,0.08)", iconColor: "#ffffff", badgeBg: "rgba(201,168,76,0.15)", badgeText: "#E3C286", border: "rgba(255,255,255,0.12)" },
  semester:   { icon: Calendar,      gradient: "linear-gradient(145deg, #111f33 0%, #15283e 50%, #1a3048 100%)", iconBg: "rgba(201,168,76,0.12)", iconColor: "#C9A84C", badgeBg: "rgba(201,168,76,0.12)", badgeText: "#C9A84C", border: "rgba(201,168,76,0.18)" },
  subject:    { icon: BookOpen,      gradient: "linear-gradient(145deg, #0e1e35 0%, #162d4a 50%, #1e3654 100%)", iconBg: "rgba(201,168,76,0.2)", iconColor: "#E3C286", badgeBg: "rgba(52,211,153,0.12)", badgeText: "#6EE7B7", border: "rgba(201,168,76,0.25)" },
  module:     { icon: Layers,        gradient: "linear-gradient(145deg, #101b2d 0%, #152438 50%, #1a2d42 100%)", iconBg: "rgba(201,168,76,0.12)", iconColor: "#D4B65C", badgeBg: "rgba(201,168,76,0.1)", badgeText: "#D4B65C", border: "rgba(201,168,76,0.15)" },
  option:     { icon: Sparkles,      gradient: "linear-gradient(145deg, #141e2c 0%, #1a2838 50%, #1e3040 100%)", iconBg: "rgba(251,191,36,0.12)", iconColor: "#FBBF24", badgeBg: "rgba(251,191,36,0.12)", badgeText: "#FBBF24", border: "rgba(251,191,36,0.18)" },
  period:     { icon: Clock,         gradient: "linear-gradient(145deg, #0e1a2b 0%, #132236 50%, #172a40 100%)", iconBg: "rgba(201,168,76,0.1)", iconColor: "#C9A84C", badgeBg: "rgba(201,168,76,0.1)", badgeText: "#C9A84C", border: "rgba(201,168,76,0.12)" },
  generic:    { icon: Folder,        gradient: "linear-gradient(145deg, #151f2e 0%, #1a2838 50%, #1e3040 100%)", iconBg: "rgba(255,255,255,0.06)", iconColor: "#94A3B8", badgeBg: "rgba(255,255,255,0.06)", badgeText: "#94A3B8", border: "rgba(255,255,255,0.08)" },
};

function SortableSubDossierCard({ dossier, onClick, onEdit, onDelete }: { dossier: Dossier; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dossier.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined };
  const cs = CARD_STYLES[dossier.dossier_type] ?? CARD_STYLES.generic;
  const CardIcon = cs.icon;

  return (
    <div ref={setNodeRef} style={style} className="group relative cursor-pointer rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_8px_30px_rgba(201,168,76,0.12)]">
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="absolute left-2 top-2 cursor-grab touch-none text-white/15 opacity-0 group-hover:opacity-100 active:cursor-grabbing z-10">
          <GripVertical className="h-4 w-4" />
        </span>
      )}

      <button onClick={onClick} className="relative flex flex-col items-center gap-2.5 w-full p-6 pb-5 text-center rounded-2xl overflow-hidden" style={{ background: cs.gradient, border: `1px solid ${cs.border}` }}>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "radial-gradient(circle at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)" }} />

        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl overflow-hidden backdrop-blur-sm" style={{ backgroundColor: cs.iconBg }}>
          {dossier.icon_url
            ? <img src={dossier.icon_url} alt="" className="h-7 w-7 object-contain" />
            : <CardIcon className="h-6 w-6" style={{ color: cs.iconColor }} />}
        </div>
        <p className="relative text-[13px] font-bold text-white/90 line-clamp-2 leading-snug min-h-[2.5rem] group-hover:text-white transition-colors">{dossier.name}</p>
        <span className="relative rounded-full px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-widest" style={{ backgroundColor: cs.badgeBg, color: cs.badgeText }}>
          {DOSSIER_TYPE_META[dossier.dossier_type]?.shortLabel ?? "Dossier"}
        </span>
        {dossier.etiquettes?.length > 0 && (
          <div className="relative mt-1 flex flex-wrap justify-center gap-1">
            {dossier.etiquettes.map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-medium text-white/70">{tag}</span>
            ))}
          </div>
        )}
      </button>

      {(onEdit || onDelete) && (
        <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 z-10">
          {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-white/70 transition"><Pencil className="h-3 w-3" /></button>}
          {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-white/30 hover:bg-red-500/20 hover:text-red-400 transition"><Trash2 className="h-3 w-3" /></button>}
        </div>
      )}
    </div>
  );
}

// =============================================
// SORTABLE RESSOURCE ROW
// =============================================

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pdf:   { label: "PDF",   color: "text-red-600 bg-red-50",     icon: <FileText className="h-4 w-4" /> },
  video: { label: "Vidéo", color: "text-blue-600 bg-blue-50",   icon: <Video className="h-4 w-4" /> },
  vimeo: { label: "Vimeo", color: "text-cyan-600 bg-cyan-50",   icon: <FileVideo className="h-4 w-4" /> },
  lien:  { label: "Lien",  color: "text-green-600 bg-green-50", icon: <LinkIcon className="h-4 w-4" /> },
};

function SortableRessourceRow({ ressource, onEdit, onDelete }: { ressource: Ressource; onEdit?: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ressource.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const meta = TYPE_META[ressource.type] ?? TYPE_META.lien;

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition hover:border-gray-200 hover:shadow">
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="flex-shrink-0 cursor-grab touch-none text-gray-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${meta.color}`}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">{ressource.titre}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
          {ressource.sous_titre && <span className="text-xs text-gray-400 truncate">{ressource.sous_titre}</span>}
          {!ressource.visible && <span className="text-xs text-gray-400">Masqué</span>}
        </div>
      </div>
      {(onEdit || onDelete) && (
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>}
          {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      )}
    </div>
  );
}

// =============================================
// SORTABLE COURS CARD (grille drag & drop)
// =============================================

function DiplomaLogoMini() {
  return (
    <img
      src="/logo-diploma-sante-white.svg"
      alt="Diploma Santé"
      style={{ width: 78, height: "auto" }}
    />
  );
}

function SortableCoursRow({ cours, dossierId, selected, onToggleSelect, onSelect, onEdit, onDelete, onPdfUploaded }: {
  cours: Cours;
  dossierId: string;
  selected?: boolean;
  onToggleSelect?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPdfUploaded?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cours.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const fileRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(cours.name);
  const hasPdf = !!cours.pdf_url;

  const commitRename = async () => {
    const trimmed = editName.trim();
    setEditing(false);
    if (!trimmed || trimmed === cours.name) { setEditName(cours.name); return; }
    await updateCoursInDossier(cours.id, { name: trimmed, visible: cours.visible });
    onPdfUploaded?.(); // reuse callback to refresh
  };

  const doUpload = async (file: File) => {
    if (file.type !== "application/pdf") return;
    setUploading(true);
    try {
      const result = await uploadPdf(file, `cours/${dossierId}`);
      if ("error" in result) {
        alert(result.error);
      } else {
        await updateCoursInDossier(cours.id, {
          name: cours.name,
          visible: cours.visible,
          pdf_url: result.url,
          pdf_path: result.path,
        });
        onPdfUploaded?.();
      }
    } catch {
      alert("Erreur lors de l'upload.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleFileDrop}
      className={`group flex items-center gap-3 rounded-xl border bg-white p-2.5 shadow-sm transition ${
        selected ? "border-gold/40 bg-gold/5 ring-1 ring-gold/20" : dragOver ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200" : "border-gray-100 hover:border-gray-200 hover:shadow"
      }`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          className="h-3.5 w-3.5 flex-shrink-0 rounded border-gray-300 text-gold accent-gold cursor-pointer"
        />
      )}
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="flex-shrink-0 cursor-grab touch-none text-gray-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      {editing ? (
        <input
          ref={nameInputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setEditName(cours.name); } }}
          className="min-w-0 flex-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-sm font-semibold text-gray-800 outline-none ring-2 ring-blue-200"
          autoFocus
        />
      ) : (
        <button
          onClick={onSelect}
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => nameInputRef.current?.select(), 0); }}
          className="min-w-0 flex-1 text-left flex items-center gap-2"
          title="Double-clic pour renommer"
        >
          <p className="truncate text-sm font-semibold text-gray-800">{cours.name}</p>
          {cours.etiquettes?.map((tag) => (
            <span key={tag} className="flex-shrink-0 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold-dark">{tag}</span>
          ))}
        </button>
      )}

      {/* PDF status / upload */}
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
      {uploading ? (
        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
      ) : hasPdf ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600 hover:bg-green-100 transition"
          title="Remplacer le PDF"
        >
          <Check className="h-3 w-3" /> PDF
        </button>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 hover:bg-orange-100 transition"
        >
          <Upload className="h-3 w-3" /> PDF
        </button>
      )}

      {(onEdit || onDelete) && (
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>}
          {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      )}
    </div>
  );
}

function SortableCoursCard({ cours, matiereLabel, onSelect, onEdit, onDelete }: { cours: Cours; matiereLabel?: string; onSelect?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cours.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: "linear-gradient(160deg, #091525 0%, #162d4a 55%, #091525 100%)",
        border: "1px solid rgba(212,171,80,0.22)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,171,80,0.08)",
      }}
      className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_8px_32px_rgba(212,171,80,0.18)] hover:border-[rgba(212,171,80,0.45)]"
    >
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="absolute left-2 top-2 z-20 cursor-grab touch-none text-white/20 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-3 w-3" />
        </span>
      )}

      <div onClick={onSelect} className="block cursor-pointer">
        <div className="relative overflow-hidden" style={{ minHeight: 130 }}>
          {/* Shimmer haut */}
          <div className="absolute top-0 inset-x-0 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, rgba(212,171,80,0.45), transparent)" }} />
          {/* Glow doré */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 100% 70% at 50% 30%, rgba(212,171,80,0.07) 0%, transparent 65%)" }} />

          {/* ── Ligne 1 : badge "Fiche de cours" + matière ── */}
          <div className="relative z-10 flex items-center justify-between px-2.5 pt-2.5 pb-1">
            <span
              className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide whitespace-nowrap"
              style={{ background: "rgba(212,171,80,0.12)", color: "rgba(212,171,80,0.80)", border: "1px solid rgba(212,171,80,0.20)" }}
            >
              Fiche de cours
            </span>
            <div className="flex items-center gap-1 min-w-0">
              {!cours.visible && (
                <span className="rounded-full px-1.5 py-0.5 text-[8px] font-medium text-amber-400/60 whitespace-nowrap" style={{ background: "rgba(251,191,36,0.08)" }}>Masqué</span>
              )}
              {matiereLabel && (
                <span className="truncate text-[9px] font-bold whitespace-nowrap tracking-wide" style={{ color: "rgba(212,171,80,0.75)" }}>
                  {matiereLabel}
                </span>
              )}
            </div>
          </div>

          {/* ── Zone centrale : logo filigrane ── */}
          <div className="relative flex items-center justify-center" style={{ height: 48 }}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.13 }}>
              <DiplomaLogoMini />
            </div>
            {/* Points déco */}
            <div className="absolute bottom-1 left-3 flex gap-1 pointer-events-none" style={{ opacity: 0.18 }}>
              {[0,1,2].map(i => <div key={i} className="h-0.5 w-0.5 rounded-full bg-white" />)}
            </div>
            <div className="absolute bottom-1 right-3 flex gap-1 pointer-events-none" style={{ opacity: 0.18 }}>
              {[0,1,2].map(i => <div key={i} className="h-0.5 w-0.5 rounded-full bg-white" />)}
            </div>
          </div>

          {/* Séparateur doré */}
          <div className="mx-2.5 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,171,80,0.35), transparent)" }} />

          {/* ── Ligne 3 : titre ── */}
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
                {cours.name}
              </p>
              {cours.etiquettes?.length > 0 && (
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {cours.etiquettes.map((tag) => (
                    <span key={tag} className="inline-block rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide" style={{ background: "rgba(212,171,80,0.12)", color: "rgba(212,171,80,0.80)", border: "1px solid rgba(212,171,80,0.20)" }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 z-20">
          {onEdit && (
            <button onClick={onEdit} className="rounded-lg p-1 text-white/50 hover:text-white transition" style={{ background: "rgba(212,171,80,0.15)" }}>
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="rounded-lg p-1 text-white/50 hover:bg-red-500 hover:text-white transition" style={{ background: "rgba(212,171,80,0.15)" }}>
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// EMPTY STATE
// =============================================

function EmptyDossier({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
      <Plus className="mb-3 h-10 w-10 text-gray-200" />
      <p className="text-sm font-medium text-gray-400">Dossier vide</p>
      <p className="mt-1 text-xs text-gray-300">{onAdd ? "Ajoutez des sous-dossiers ou du contenu" : "Aucun contenu disponible"}</p>
      {onAdd && (
        <button
          onClick={onAdd}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-light transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      )}
    </div>
  );
}

// =============================================
// DOSSIER FORM
// =============================================

function DossierForm({ title, allDossiers, parentDossier, initialData, onSubmit, onClose, isPending, formationOffers, dossierNamePresets }: {
  title: string;
  allDossiers: Dossier[];
  parentDossier?: Dossier | null;
  initialData?: Partial<Dossier>;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isPending: boolean;
  formationOffers: FormationOfferSetting[];
  dossierNamePresets: DossierNamePreset[];
}) {
  const initialParentId = initialData?.parent_id ?? parentDossier?.id ?? null;
  const [parentId, setParentId] = useState<string | null>(initialParentId);
  const selectedParent = parentId ? allDossiers.find((d) => d.id === parentId) ?? null : null;
  const allowedChildTypes = getAllowedChildTypes(selectedParent);
  const initialType =
    initialData?.dossier_type ??
    (selectedParent ? getDefaultChildType(selectedParent) : initialData ? "generic" : "offer");
  const inheritedOffer =
    initialData?.formation_offer ??
    (selectedParent ? inferOfferFromAncestors(selectedParent, allDossiers) : null) ??
    null;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [dossierType, setDossierType] = useState(initialType);
  const [formationOffer, setFormationOffer] = useState(inheritedOffer);
  const [color, setColor] = useState(initialData?.color ?? "#0e1e35");
  const [iconUrl, setIconUrl] = useState(initialData?.icon_url ?? "");
  const [visible, setVisible] = useState(initialData?.visible ?? true);
  const [etiquettes, setEtiquettes] = useState<string[]>(initialData?.etiquettes ?? []);
  const activeFormationOffers = formationOffers.filter((offer) => offer.enabled);
  const etiquetteSuggestions = useMemo(
    () => [...new Set(allDossiers.flatMap((d) => d.etiquettes ?? []))].sort(),
    [allDossiers]
  );
  const nameSuggestions = useMemo(
    () => getDossierSuggestions(dossierNamePresets, formationOffer, dossierType),
    [dossierNamePresets, formationOffer, dossierType]
  );

  useEffect(() => {
    if (!selectedParent && dossierType === "offer" && formationOffer) {
      const offer = formationOffers.find((item) => item.code === formationOffer);
      if (offer && (!initialData?.name || initialData.name === name)) {
        setName(offer.label);
      }
      if (offer && (!initialData?.color || initialData.color === color)) {
        setColor(offer.defaultColor);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formationOffer, dossierType, selectedParent]);

  useEffect(() => {
    if (selectedParent) {
      const allowed = getAllowedChildTypes(selectedParent);
      if (allowed.length > 0 && !allowed.includes(dossierType)) {
        setDossierType(allowed[0]);
      }
      const nextOffer = inferOfferFromAncestors(selectedParent, allDossiers);
      if (nextOffer) {
        setFormationOffer(nextOffer);
      }
    } else if (dossierType !== "offer") {
      setFormationOffer(initialData?.formation_offer ?? null);
    }
  }, [selectedParent, dossierType, allDossiers, initialData?.formation_offer]);

  const descendants = useMemo(() => {
    if (!initialData?.id) return new Set<string>();
    const ids = new Set<string>();
    const stack = [initialData.id];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      for (const dossier of allDossiers) {
        if (dossier.parent_id === currentId && !ids.has(dossier.id)) {
          ids.add(dossier.id);
          stack.push(dossier.id);
        }
      }
    }
    return ids;
  }, [allDossiers, initialData?.id]);

  const parentOptions = useMemo(
    () =>
      allDossiers
        .filter((dossier) =>
          dossier.id !== initialData?.id &&
          !descendants.has(dossier.id) &&
          getAllowedChildTypes(dossier).length > 0
        )
        .sort((a, b) =>
          getDossierPathLabel(a.id, allDossiers).localeCompare(
            getDossierPathLabel(b.id, allDossiers),
            "fr"
          )
        ),
    [allDossiers, descendants, initialData?.id]
  );

  return (
    <FormShell
      title={title}
      onClose={onClose}
      onSubmit={() => onSubmit({
        name,
        description,
        parent_id: parentId,
        dossier_type: dossierType,
        formation_offer: formationOffer,
        color,
        icon_url: iconUrl,
        visible,
        etiquettes,
      })}
      isPending={isPending}
    >
      <div className="rounded-xl bg-navy/5 px-3 py-2 text-xs text-navy/70">
        {selectedParent
          ? `Niveau parent: ${DOSSIER_TYPE_META[selectedParent.dossier_type]?.label ?? "Dossier"}`
          : "Racine métier de la plateforme"}
      </div>

      {!!initialData && (
        <FormField label="Parent">
          <select
            value={parentId ?? ""}
            onChange={(e) => setParentId(e.target.value || null)}
            className={inputCls}
          >
            <option value="">Racine</option>
            {parentOptions.map((dossier) => (
              <option key={dossier.id} value={dossier.id}>
                {getDossierPathLabel(dossier.id, allDossiers)}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {!selectedParent ? (
        <>
          <FormField label="Type de noeud">
            <select
              value={dossierType}
              onChange={(e) => setDossierType(e.target.value as any)}
              className={inputCls}
            >
              <option value="offer">{DOSSIER_TYPE_META.offer.label}</option>
              <option value="generic">{DOSSIER_TYPE_META.generic.label}</option>
              <option value="period">{DOSSIER_TYPE_META.period.label}</option>
              <option value="module">{DOSSIER_TYPE_META.module.label}</option>
              <option value="subject">{DOSSIER_TYPE_META.subject.label}</option>
            </select>
          </FormField>
          {dossierType === "offer" && (
            <FormField label="Offre de formation">
              <select
                value={formationOffer ?? ""}
                onChange={(e) => setFormationOffer((e.target.value || null) as any)}
                className={inputCls}
              >
                <option value="">Choisir une offre...</option>
                {activeFormationOffers.map((offer) => (
                  <option key={offer.code} value={offer.code}>
                    {offer.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </>
      ) : (
        <FormField label="Type de noeud">
          <select
            value={dossierType}
            onChange={(e) => setDossierType(e.target.value as any)}
            className={inputCls}
          >
            {allowedChildTypes.map((type) => (
              <option key={type} value={type}>
                {DOSSIER_TYPE_META[type].label}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Nom *">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Université Paris-Cité, S1, Oraux, UE1 Chimie..." required className={inputCls} />
      </FormField>
      {nameSuggestions.length > 0 && (
        <div className="rounded-xl border border-gold/20 bg-gold/5 px-3 py-2">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold-dark/80">
            Suggestions de noms
          </p>
          <div className="flex flex-wrap gap-2">
            {nameSuggestions.flatMap((preset) => preset.suggestions).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setName(suggestion)}
                className="rounded-full border border-gold/20 bg-white px-3 py-1 text-xs font-medium text-navy transition hover:border-gold/40 hover:bg-gold/10"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      <FormField label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description courte..." className={inputCls} />
      </FormField>
      <FormField label="Etiquettes">
        <TagInput value={etiquettes} onChange={setEtiquettes} suggestions={etiquetteSuggestions} placeholder="Ex: UE1, Tronc commun..." />
      </FormField>
      <IconPicker value={iconUrl} onChange={setIconUrl} />
      <ColorPicker value={color} onChange={setColor} />
      <VisibleToggle value={visible} onChange={setVisible} />
    </FormShell>
  );
}

// =============================================
// RESSOURCE FORM
// =============================================

function RessourceForm({ title, dossierId, defaultType = "pdf", initialData, onSubmit, onClose, isPending }: {
  title: string;
  dossierId: string;
  defaultType?: string;
  initialData?: Partial<Ressource>;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [titre, setTitre] = useState(initialData?.titre ?? "");
  const [sousTitre, setSousTitre] = useState(initialData?.sous_titre ?? "");
  const [type, setType] = useState(initialData?.type ?? defaultType);
  const [pdfUrl, setPdfUrl] = useState(initialData?.pdf_url ?? "");
  const [pdfPath, setPdfPath] = useState(initialData?.pdf_path ?? "");
  const [videoUrl, setVideoUrl] = useState(initialData?.video_url ?? "");
  const [vimeoId, setVimeoId] = useState(initialData?.vimeo_id ?? "");
  const [lienUrl, setLienUrl] = useState(initialData?.lien_url ?? "");
  const [lienLabel, setLienLabel] = useState(initialData?.lien_label ?? "");
  const [visible, setVisible] = useState(initialData?.visible ?? true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setUploadProgress("Format PDF requis"); return; }
    setUploading(true);
    setUploadProgress("Upload en cours...");
    const result = await uploadPdf(file, `ressources/${dossierId}`);
    if ("error" in result) { setUploadProgress(`Erreur: ${result.error}`); setUploading(false); return; }
    setPdfUrl(result.url);
    setPdfPath(result.path);
    setUploadProgress(file.name);
    setUploading(false);
  };

  return (
    <FormShell title={title} onClose={onClose} onSubmit={() => onSubmit({ titre, sous_titre: sousTitre, type, pdf_url: pdfUrl, pdf_path: pdfPath, video_url: videoUrl, vimeo_id: vimeoId, lien_url: lienUrl, lien_label: lienLabel, visible })} isPending={isPending}>
      <FormField label="Titre *">
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex: Cours introduction" required className={inputCls} />
      </FormField>
      <FormField label="Sous-titre">
        <input value={sousTitre} onChange={(e) => setSousTitre(e.target.value)} placeholder="Ex: Partie 1" className={inputCls} />
      </FormField>

      {/* Type selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-700">Type</label>
        <div className="grid grid-cols-4 gap-2">
          {(["pdf", "video", "vimeo", "lien"] as const).map((t) => {
            const m = TYPE_META[t];
            return (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-medium transition ${type === t ? "border-navy bg-navy/5 text-navy" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                <span className={type === t ? "text-navy" : m.color.split(" ")[0]}>{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {type === "pdf" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-700">Fichier PDF</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 p-3 transition hover:border-navy/30 hover:bg-gray-50">
            <Upload className="h-4 w-4 text-gray-400" />
            <span className="flex-1 text-sm text-gray-600">{uploadProgress || (pdfUrl ? "PDF chargé" : "Cliquer pour uploader")}</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
          </label>
          {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-1 text-xs text-blue-600 underline">Voir le PDF</a>}
          <div className="mt-2">
            <label className="mb-1 block text-xs text-gray-500">Ou URL directe</label>
            <input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="https://..." className={inputCls} />
          </div>
        </div>
      )}
      {type === "video" && (
        <FormField label="URL de la vidéo">
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." className={inputCls} />
        </FormField>
      )}
      {type === "vimeo" && (
        <FormField label="ID ou URL Vimeo">
          <input value={vimeoId} onChange={(e) => setVimeoId(e.target.value)} placeholder="Ex: 123456789" className={inputCls} />
        </FormField>
      )}
      {type === "lien" && (
        <>
          <FormField label="URL">
            <input value={lienUrl} onChange={(e) => setLienUrl(e.target.value)} placeholder="https://..." className={inputCls} />
          </FormField>
          <FormField label="Label">
            <input value={lienLabel} onChange={(e) => setLienLabel(e.target.value)} placeholder="Ex: Voir la ressource" className={inputCls} />
          </FormField>
        </>
      )}
      <VisibleToggle value={visible} onChange={setVisible} />
    </FormShell>
  );
}

// =============================================
// COURS FORM
// =============================================

function CoursForm({ title, dossierId, initialData, onSubmit, onClose, isPending }: {
  title: string;
  dossierId: string;
  initialData?: Partial<Cours>;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [pdfUrl, setPdfUrl] = useState(initialData?.pdf_url ?? "");
  const [pdfPath, setPdfPath] = useState(initialData?.pdf_path ?? "");
  const [nbPages, setNbPages] = useState(initialData?.nb_pages ?? 0);
  const [visible, setVisible] = useState(initialData?.visible ?? true);
  const [etiquettes, setEtiquettes] = useState<string[]>(initialData?.etiquettes ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setUploadProgress("Format PDF requis"); return; }
    setUploading(true);
    setUploadProgress("Upload en cours...");
    const result = await uploadPdf(file, `cours/${dossierId}`);
    if ("error" in result) { setUploadProgress(`Erreur: ${result.error}`); setUploading(false); return; }
    setPdfUrl(result.url);
    setPdfPath(result.path);
    setUploadProgress(file.name);
    setUploading(false);
  };

  return (
    <FormShell title={title} onClose={onClose} onSubmit={() => onSubmit({ name, description, pdf_url: pdfUrl, pdf_path: pdfPath, nb_pages: nbPages, visible, etiquettes })} isPending={isPending}>
      <FormField label="Nom du cours *">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Biochimie Structurale" required className={inputCls} />
      </FormField>
      <FormField label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description courte du cours..." className={inputCls} />
      </FormField>
      <FormField label="Etiquettes">
        <TagInput value={etiquettes} onChange={setEtiquettes} placeholder="Ex: Socle, Approfondissement..." />
      </FormField>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-700">Fiche PDF <span className="text-gray-400 font-normal">(optionnel)</span></label>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 transition ${uploading ? "border-indigo-200 bg-indigo-50/40 cursor-wait" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30"}`}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : <Upload className="h-4 w-4 text-gray-400" />}
          <span className="flex-1 text-sm text-gray-600">{uploadProgress || (pdfUrl ? "PDF chargé" : "Uploader la fiche de cours")}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
        </label>
        {pdfUrl && !uploading && <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-1 text-xs text-blue-600 underline">Voir le PDF</a>}
        <div className="mt-2">
          <label className="mb-1 block text-xs text-gray-500">Ou URL directe</label>
          <input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="https://..." className={inputCls} />
        </div>
      </div>
      <FormField label="Nombre de pages">
        <input type="number" min={0} value={nbPages} onChange={(e) => setNbPages(Number(e.target.value))} className={inputCls} />
      </FormField>
      <VisibleToggle value={visible} onChange={setVisible} />
    </FormShell>
  );
}

// =============================================
// ICON PICKER
// =============================================

function IconPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [query, setQuery] = useState("");
  const [icons, setIcons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query.trim())}&limit=32`);
      const data = await res.json();
      setIcons(data.icons ?? []);
    } catch { setIcons([]); }
    finally { setLoading(false); }
  };

  const getUrl = (id: string) => {
    const [prefix, name] = id.split(":");
    return `https://api.iconify.design/${prefix}/${name}.svg`;
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-700">Icône</label>
      {value && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <img src={value} alt="" className="h-5 w-5 object-contain" />
          <span className="flex-1 text-xs text-gray-500">Icône sélectionnée</span>
          <button type="button" onClick={() => onChange("")} className="text-xs text-red-500 hover:text-red-700">Retirer</button>
        </div>
      )}
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Ex: biology, law, book..." className={inputCls} />
        <button type="button" onClick={search} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Chercher
        </button>
      </div>
      {searched && !loading && icons.length === 0 && <p className="mt-1.5 text-xs text-gray-400">Aucun résultat.</p>}
      {icons.length > 0 && (
        <div className="mt-2 grid grid-cols-8 gap-1 max-h-32 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
          {icons.map((id) => {
            const url = getUrl(id);
            return (
              <button key={id} type="button" onClick={() => onChange(url)} title={id.split(":")[1]}
                className={`flex items-center justify-center rounded-lg p-1.5 transition hover:bg-white hover:shadow-sm ${value === url ? "bg-white ring-2 ring-[#0e1e35] shadow-sm" : ""}`}>
                <img src={url} alt={id} className="h-5 w-5 object-contain" loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================
// UI PRIMITIVES
// =============================================

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg">{children}</div>
    </div>
  );
}

function FormShell({ title, children, onClose, onSubmit, isPending }: {
  title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; isPending: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sticky top-0 bg-white z-10">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={onSubmit} disabled={isPending} className="flex items-center gap-2 rounded-lg bg-[#0e1e35] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60">
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-700">Couleur</label>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)}
            className="h-6 w-6 rounded-full transition hover:scale-110"
            style={{ backgroundColor: c, outline: value === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }} />
        ))}
      </div>
    </div>
  );
}

function VisibleToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {value ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
        <span className="text-xs font-medium text-gray-700">Visible aux étudiants</span>
      </div>
      <button type="button" onClick={() => onChange(!value)} className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-green-500" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#0e1e35] focus:outline-none focus:ring-1 focus:ring-[#0e1e35]/20";

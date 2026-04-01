"use client";

import { useState, useTransition, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, ChevronUp, Settings,
  Folder, FolderOpen, X, Eye, EyeOff, Upload,
  FileText, Loader2, Check, AlertCircle,
  Link as LinkIcon, Video, FileVideo, LayoutList, Search,
  FolderPlus, Home, GripVertical, BookOpen, Layers, Sparkles,
  Building2, Calendar, Clock, GraduationCap, ImagePlus, LayoutGrid, Link2, RotateCcw,
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
import {
  OfferIcon, SubOfferIcon, UniversityIcon, SemesterIcon, SubjectIcon,
  ModuleIcon, OptionIcon, PeriodIcon, GenericIcon, CoursIcon,
} from "./dossier-icons";
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
  installCanonicalOffers, bulkSetEtiquettes, renameEtiquette, bulkSetDossierEtiquettes, renameDossierEtiquette, bulkSetCoursVisible, bulkDeleteCours, bulkArchiveCours,
  cloneDossierTree, updateLinkedCours, getLinkedCoursCount, deleteLinkedCours, deleteLinkedCoursByCoursId, linkCoursToOtherDossier, getMissingCoursFromOtherOffers,
  updateUniversityLinkRules, getUniversityLinkRulesForDossier, getOffersForUniversity,
  addUniversityToOffer, removeUniversityFromOffer, getUniversitySubjectsSummary, moveDossiers, bulkSetDossierVisible,
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
  | { type: "clone_proposal"; sourceDossier: Dossier; targetDossierId: string; offerLabel: string }
  | { type: "linked_edit_confirm"; cours: Cours; data: any; linkedCount: number }
  | { type: "rattacher_cours"; coursIds: string[]; sourceDossierId: string }
  | { type: "missing_cours"; dossierId: string }
  | { type: "move_dossiers"; dossierIds: string[] }
  | null;

const COLORS = [
  "#0e1e35", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316",
  "#C9A84C", "#6366F1", "#14B8A6", "#FB923C", "#A855F7",
];

const SECTION_ORDER: Record<string, number> = { "Socle": 0, "Approfondissement": 1, "Perfectionnement": 2 };

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
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [allCoursFlat, setAllCoursFlat] = useState<Cours[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [ressourcesMap, setRessourcesMap] = useState<Record<string, Ressource[]>>({});
  const [coursMap, setCoursMap] = useState<Record<string, Cours[]>>({});
  const [loadingRessources, setLoadingRessources] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isFormPending, startFormTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<{ label: string; onConfirm: () => void } | null>(null);
  const [coursViewMode, setCoursViewMode] = useState<"cards" | "list">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("pedagogie-cours-view") as "cards" | "list") || "cards";
    return "cards";
  });
  const [dossierViewMode, setDossierViewMode] = useState<"cards" | "list">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("pedagogie-dossier-view") as "cards" | "list") || "cards";
    return "cards";
  });
  const [selectedCoursIds, setSelectedCoursIds] = useState<Set<string>>(new Set());
  const [emptySections, setEmptySections] = useState<string[]>([]);
  const [inlineCoursSection, setInlineCoursSection] = useState<string | null>(null);
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [selectedDossierIds, setSelectedDossierIds] = useState<Set<string>>(new Set());
  const [bulkEtiquettes, setBulkEtiquettes] = useState<string[]>([]);
  const [showBulkPopover, setShowBulkPopover] = useState(false);
  const [bulkDossierEtiquettes, setBulkDossierEtiquettes] = useState<string[]>([]);
  const [showBulkDossierPopover, setShowBulkDossierPopover] = useState(false);
  const [treeWidth, setTreeWidth] = useState(360);
  const [isResizingTree, setIsResizingTree] = useState(false);
  const treeWidthRef = useRef(treeWidth);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
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
  const coursGroups = useMemo(() => {
    const hasAnyEtiquette = coursList.some((c) => c.etiquettes?.length > 0);
    if (!hasAnyEtiquette && emptySections.length === 0) return null;
    const groupMap = new Map<string, Cours[]>();
    // Ensure empty sections exist
    for (const s of emptySections) {
      if (!groupMap.has(s)) groupMap.set(s, []);
    }
    for (const c of coursList) {
      const label = c.etiquettes?.[0] ?? "";
      if (!groupMap.has(label)) groupMap.set(label, []);
      groupMap.get(label)!.push(c);
    }
    // Sort by sectionOrder, then append any new sections not in the order
    const allLabels = [...groupMap.keys()];
    const ordered: string[] = [];
    for (const s of sectionOrder) {
      if (groupMap.has(s)) ordered.push(s);
    }
    for (const s of allLabels) {
      if (!ordered.includes(s)) ordered.push(s);
    }
    const groups = ordered.map((label) => ({ label, cours: groupMap.get(label) ?? [] }));
    return groups.length > 0 ? groups : null;
  }, [coursList, emptySections, sectionOrder]);
  const dossierGroups = useMemo(() => {
    const hasAnyEtiquette = childDossiers.some((d) => d.etiquettes?.length > 0);
    if (!hasAnyEtiquette) return null;
    const groups: { label: string; dossiers: Dossier[] }[] = [];
    const seen = new Map<string, number>();
    for (const d of childDossiers) {
      const label = d.etiquettes?.[0] ?? "";
      if (!seen.has(label)) {
        seen.set(label, groups.length);
        groups.push({ label, dossiers: [] });
      }
      groups[seen.get(label)!].dossiers.push(d);
    }
    return groups;
  }, [childDossiers]);
  const contentCreationLabel = getContentCreationLabel(selectedDossier?.dossier_type);

  // Check if university ancestor has link_rules → force sections from there
  const universityLinkRules = useMemo(() => {
    if (!selectedId) return null;
    let cur: string | null = selectedId;
    while (cur) {
      const d = allDossiers.find((dd) => dd.id === cur);
      if (!d) break;
      if (d.dossier_type === "university" && d.link_rules) {
        return d.link_rules as { sections: Record<string, string[]> };
      }
      cur = d.parent_id;
    }
    return null;
  }, [selectedId, allDossiers]);

  // Find current offer code from ancestors
  const currentOfferCode = useMemo(() => {
    if (!selectedId) return null;
    let cur: string | null = selectedId;
    while (cur) {
      const d = allDossiers.find((dd) => dd.id === cur);
      if (!d) break;
      if (d.dossier_type === "offer") return d.formation_offer;
      cur = d.parent_id;
    }
    return null;
  }, [selectedId, allDossiers]);

  // Filter sections to only those available for the current offer
  // A section is visible in an offer only if that offer is listed in its targets
  const linkRulesSections = useMemo(() => {
    if (!universityLinkRules || !currentOfferCode) return universityLinkRules ? Object.keys(universityLinkRules.sections) : null;
    return Object.entries(universityLinkRules.sections)
      .filter(([_, offers]) => offers.includes(currentOfferCode))
      .map(([name]) => name);
  }, [universityLinkRules, currentOfferCode]);

  // Compute section badges for child dossiers (subjects) based on their courses' etiquettes
  const getSectionBadges = useCallback((dossierId: string) => {
    const cours = coursMap[dossierId];
    if (!cours || cours.length === 0) return undefined;
    const sections = [...new Set(cours.map((c) => c.etiquettes?.[0]).filter(Boolean))] as string[];
    return sections.length > 0 ? sections : undefined;
  }, [coursMap]);

  // For CREATING courses: all sections allowed by link_rules for this offer
  const availableCourseSections = linkRulesSections
    ?? (coursGroups && coursGroups.length >= 2 ? coursGroups.map((g) => g.label).filter(Boolean) : undefined);

  const isPrepaOffer = currentOfferCode ? ["prepa_pass", "prepa_las", "prepa_lsps"].includes(currentOfferCode) : false;

  // For EXERCISES/SERIES: only sections that actually have courses in this matière
  const exerciseSections = useMemo(() => {
    if (!linkRulesSections) return undefined;
    const existingSections = [...new Set(coursList.map((c) => c.etiquettes?.[0]).filter(Boolean))] as string[];
    const filtered = linkRulesSections.filter((s) => existingSections.includes(s));
    return filtered.length > 0 ? filtered : undefined;
  }, [linkRulesSections, coursList]);

  const moveSectionByLabel = useCallback((label: string, direction: "up" | "down") => {
    const labels = coursGroups?.map((g) => g.label) ?? [];
    const idx = labels.indexOf(label);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= labels.length) return;
    const newOrder = [...labels];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setSectionOrder(newOrder);
  }, [coursGroups]);

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
    setSelectedDossierIds(new Set());
    setShowBulkPopover(false);
    setShowBulkDossierPopover(false);
    setEmptySections([]);
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

    // Preload courses for child subjects (for section badges)
    const childSubjects = allDossiers.filter((d) => d.parent_id === dossier.id && d.dossier_type === "subject");
    if (childSubjects.length > 0) {
      Promise.all(childSubjects.map(async (sub) => {
        if (coursMap[sub.id]) return; // already loaded
        const result = await getCourssByDossier(sub.id);
        const subCours = ((result.data ?? []) as Cours[]).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setCoursMap((prev) => ({ ...prev, [sub.id]: subCours }));
      }));
    }
  };

  const refreshAll = async () => {
    // Save scroll positions
    const treeScroll = treeScrollRef.current?.scrollTop ?? 0;
    const rightScroll = rightScrollRef.current?.scrollTop ?? 0;

    const result = await getAllDossiers();
    setAllDossiers(result.data as Dossier[]);
    if (selectedId) {
      const { ressources, cours } = await fetchDossierData(selectedId);
      setRessourcesMap((prev) => ({ ...prev, [selectedId]: ressources as Ressource[] }));
      setCoursMap((prev) => ({ ...prev, [selectedId]: cours }));
    }

    // Restore scroll positions after re-render
    requestAnimationFrame(() => {
      if (treeScrollRef.current) treeScrollRef.current.scrollTop = treeScroll;
      if (rightScrollRef.current) rightScrollRef.current.scrollTop = rightScroll;
    });
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
    startFormTransition(async () => {
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

  const [linkedDeleteChoice, setLinkedDeleteChoice] = useState<{ cours: Cours; count: number } | null>(null);
  const [sectionDeleteChoice, setSectionDeleteChoice] = useState<{ label: string; cours: Cours[] } | null>(null);

  const handleDeleteCours = (c: Cours) => {
    // Always check server-side if the cours is linked
    startTransition(async () => {
      const count = await getLinkedCoursCount(c.id);
      if (count > 1) {
        if (universityLinkRules) {
          // With link_rules, always delete everywhere — just confirm
          setConfirmDelete({
            label: `le cours "${c.name}" dans toutes les offres (${count})`,
            onConfirm: () => handleAction(() => deleteLinkedCoursByCoursId(c.id)),
          });
        } else {
          setLinkedDeleteChoice({ cours: c, count });
        }
      } else {
        setConfirmDelete({
          label: `le cours "${c.name}"`,
          onConfirm: () => handleAction(() => deleteCoursFromDossier(c.id)),
        });
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-white/10 shadow-2xl" style={{ backgroundColor: "#0e1e35" }}>

      {/* ── LEFT: Arborescence ── */}
      <div
        className="flex flex-shrink-0 flex-col border-r border-white/8"
        style={{ width: treeWidth, backgroundColor: "#0a1628" }}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #12314d 0%, #0e1e35 100%)" }}>
          <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.08) 0%, transparent 70%)" }} />
          <h2 className="relative text-sm font-bold text-white/90 tracking-wide">Arborescence</h2>
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
                onClick={() => { setShowGlobalSettings(!showGlobalSettings); if (!showGlobalSettings) setSelectedId(null); }}
                className={`rounded-lg border p-1.5 transition ${showGlobalSettings ? "bg-purple-500/20 border-purple-400/30 text-purple-300" : "border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"}`}
                title="Paramétrage global"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div ref={treeScrollRef} className="flex-1 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderPlus className="mb-2 h-8 w-8 text-white/20" />
              <p className="text-xs text-white/40">Aucun dossier</p>
              {canEdit && (
                <button
                  onClick={() => setModal({ type: "add_picker", parentId: null })}
                  className="mt-2 text-xs text-[#4fabdb] underline"
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
          {canEdit && (
            <button
              onClick={() => setModal({ type: "create_dossier", parentId: null })}
              className="mt-2 mx-2 mb-2 flex w-[calc(100%-16px)] items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 py-2 text-[11px] font-medium text-white/30 transition hover:border-white/20 hover:bg-white/5 hover:text-white/50"
            >
              <Plus className="h-3 w-3" /> Ajouter une offre
            </button>
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
        className={`group relative w-2 flex-shrink-0 cursor-col-resize bg-transparent transition ${isResizingTree ? "bg-[#C9A84C]/10" : ""}`}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/8 transition group-hover:bg-[#C9A84C]/30" />
      </div>

      {/* ── RIGHT: Contenu du dossier sélectionné ou cours détail ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {showGlobalSettings ? (
          <GlobalSettingsPanel
            allDossiers={allDossiers as Dossier[]}
            onSaved={refreshAll}
            onClose={() => setShowGlobalSettings(false)}
          />
        ) : selectedCours ? (
          <CoursDetailPanel cours={selectedCours} onBack={() => setSelectedCours(null)} onCoursUpdated={refreshAll} />
        ) : selectedDossier ? (
          <>
            {/* Header */}
            <div className="relative overflow-hidden" style={{ background: "linear-gradient(180deg, #12314d 0%, #0e1e35 100%)" }}>
              {/* Decorative gradients */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 120% at 80% -20%, rgba(201,168,76,0.06) 0%, transparent 60%)" }} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 40% 80% at 20% 100%, rgba(79,171,219,0.04) 0%, transparent 60%)" }} />
              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.2) 30%, rgba(79,171,219,0.2) 70%, transparent 100%)" }} />

              {/* Breadcrumb row */}
              <div className="relative px-5 pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <nav className="flex items-center gap-1.5 text-[11px]">
                    <button onClick={() => setSelectedId(null)} className="flex items-center justify-center h-6 w-6 rounded-lg bg-white/[0.04] border border-white/8 text-white/30 hover:text-[#C9A84C] hover:border-[#C9A84C]/30 hover:bg-[#C9A84C]/[0.06] transition-all duration-150">
                      <Home className="h-3 w-3" />
                    </button>
                    {breadcrumb.map((d, i) => {
                      const isLast = i === breadcrumb.length - 1;
                      const cs = CARD_STYLES[d.dossier_type] ?? CARD_STYLES.generic;
                      return (
                        <span key={d.id} className="flex items-center gap-1.5">
                          <ChevronRight className="h-2.5 w-2.5 text-white/15" />
                          <button
                            onClick={() => selectDossier(d)}
                            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all duration-150 ${
                              isLast
                                ? "bg-white/[0.06] border border-white/10 font-bold text-white"
                                : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"
                            }`}
                          >
                            {isLast && <cs.icon className="h-3 w-3 flex-shrink-0" />}
                            <span className={isLast ? "text-[12px]" : "text-[11px]"}>{d.name}</span>
                          </button>
                        </span>
                      );
                    })}
                  </nav>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-lg px-2.5 py-1 text-[8px] font-extrabold uppercase tracking-[0.15em]"
                      style={{ backgroundColor: (CARD_STYLES[selectedDossier.dossier_type] ?? CARD_STYLES.generic).badgeBg, color: (CARD_STYLES[selectedDossier.dossier_type] ?? CARD_STYLES.generic).badgeText, border: `1px solid ${(CARD_STYLES[selectedDossier.dossier_type] ?? CARD_STYLES.generic).iconColor}20` }}
                    >
                      {DOSSIER_TYPE_META[selectedDossier.dossier_type]?.shortLabel ?? "Dossier"}
                    </span>
                    {selectedDossier.etiquettes?.map((tag) => (
                      <span key={tag} className="rounded-lg bg-white/[0.05] border border-white/8 px-2 py-1 text-[9px] font-semibold text-white/50">{tag}</span>
                    ))}
                    {selectedDossier.formation_offer && (
                      <span className="rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#C9A84C]/80">
                        {getOfferLabel(selectedDossier.formation_offer)}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setModal({ type: "edit_dossier", dossier: selectedDossier })}
                        className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/8 bg-white/[0.03] text-white/25 hover:bg-white/[0.06] hover:text-[#C9A84C] hover:border-[#C9A84C]/30 transition-all duration-150"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tab bar */}
              <div className="relative px-5 flex gap-1">
                <button
                  onClick={() => setDossierTab("contenu")}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-all duration-200 ${
                    dossierTab === "contenu"
                      ? "text-[#7DD3FC] bg-white/[0.04]"
                      : "text-white/30 hover:text-white/60 hover:bg-white/[0.02]"
                  }`}
                >
                  <SubjectIcon className="h-3.5 w-3.5" />
                  Contenu
                  {dossierTab === "contenu" && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ background: "linear-gradient(90deg, #7DD3FC, #38BDF8)" }} />
                  )}
                </button>
                {coursList.length > 0 && (
                  <button
                    onClick={() => setDossierTab("exercices")}
                    className={`relative flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-all duration-200 ${
                      dossierTab === "exercices"
                        ? "text-[#C9A84C] bg-white/[0.04]"
                        : "text-white/30 hover:text-white/60 hover:bg-white/[0.02]"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Exercices
                    <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-extrabold ${dossierTab === "exercices" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "bg-white/[0.06] text-white/30"}`}>
                      {coursList.length}
                    </span>
                    {dossierTab === "exercices" && (
                      <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ background: "linear-gradient(90deg, #C9A84C, #E3C286)" }} />
                    )}
                  </button>
                )}
              </div>
            </div>

            {dossierTab === "exercices" ? (
              <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: "#0e1e35" }}>
                <DossierExercicesView
                  dossierId={selectedDossier.id}
                  dossierName={selectedDossier.name}
                  allDossiers={allDossiers}
                  availableSections={exerciseSections}
                  hiddenTabs={[
                    // Always hide Fabricateur
                    "acc_fabricator",
                    // Hide Annales for non-PREPA offers
                    ...(!currentOfferCode || ["terminale_sante", "paes_fr_eu", "premiere_elite"].includes(currentOfferCode) ? ["annales"] : []),
                  ]}
                  onNewSerie={() => {}}
                />
              </div>
            ) : (

            /* Contenu tab */
            <div ref={rightScrollRef} className="flex-1 overflow-y-auto p-5" style={{ backgroundColor: "#0e1e35" }}>
              {childDossiers.length === 0 && ressources.length === 0 && coursList.length === 0 && !loadingRessources ? (
                <EmptyDossier
                  onAdd={canEdit ? () => setModal({ type: "add_picker", parentId: selectedId }) : undefined}
                />
              ) : (
                <div className="space-y-5">
                  {/* Sous-dossiers — drag & drop grille ou liste */}
                  {childDossiers.length > 0 && (
                    <div>
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-[#C9A84C] to-[#C9A84C]/30" />
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/40">Sous-dossiers</span>
                          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold text-white/25">{childDossiers.length}</span>
                        </div>
                        <span className="h-px flex-1 bg-gradient-to-r from-white/8 to-transparent" />
                        <div className="flex gap-0.5 rounded-lg border border-white/8 bg-white/[0.02] p-0.5">
                          <button
                            onClick={() => { setDossierViewMode("cards"); localStorage.setItem("pedagogie-dossier-view", "cards"); }}
                            className={`rounded-md p-1.5 transition-all duration-150 ${dossierViewMode === "cards" ? "bg-[#C9A84C]/15 text-[#C9A84C] shadow-sm" : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"}`}
                            title="Vue cartes"
                          ><LayoutGrid className="h-3.5 w-3.5" /></button>
                          <button
                            onClick={() => { setDossierViewMode("list"); localStorage.setItem("pedagogie-dossier-view", "list"); }}
                            className={`rounded-md p-1.5 transition-all duration-150 ${dossierViewMode === "list" ? "bg-[#C9A84C]/15 text-[#C9A84C] shadow-sm" : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"}`}
                            title="Vue liste"
                          ><LayoutList className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>

                      {/* Bulk action bar for dossiers */}
                      {canEdit && selectedDossierIds.size > 0 && (
                        <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-2">
                          <span className="text-xs font-semibold text-[#C9A84C]">{selectedDossierIds.size} dossier{selectedDossierIds.size > 1 ? "s" : ""} sélectionné{selectedDossierIds.size > 1 ? "s" : ""}</span>
                          <button type="button" onClick={() => setSelectedDossierIds(new Set(childDossiers.map((d) => d.id)))} className="text-[10px] font-medium text-white/40 hover:text-white/70 underline">Tout sélectionner</button>
                          <button type="button" onClick={() => setSelectedDossierIds(new Set())} className="text-[10px] font-medium text-white/40 hover:text-white/70 underline">Désélectionner</button>
                          <button
                            type="button"
                            onClick={() => setModal({ type: "move_dossiers", dossierIds: [...selectedDossierIds] })}
                            className="rounded-lg bg-[#4fabdb]/15 px-3 py-1.5 text-xs font-semibold text-[#4fabdb] hover:bg-[#4fabdb]/25 transition flex items-center gap-1"
                          ><FolderOpen className="h-3 w-3" /> Déplacer</button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ids = [...selectedDossierIds];
                              const anyHidden = childDossiers.some((d) => ids.includes(d.id) && !d.visible);
                              await handleAction(() => bulkSetDossierVisible(ids, anyHidden));
                              setSelectedDossierIds(new Set());
                            }}
                            className="rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/25 transition flex items-center gap-1"
                          >
                            {childDossiers.some((d) => selectedDossierIds.has(d.id) && !d.visible) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            {childDossiers.some((d) => selectedDossierIds.has(d.id) && !d.visible) ? "Visible" : "Masquer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDelete({
                                label: `${selectedDossierIds.size} dossier${selectedDossierIds.size > 1 ? "s" : ""} et tout leur contenu`,
                                onConfirm: async () => {
                                  for (const id of selectedDossierIds) {
                                    await deleteDossier(id);
                                  }
                                  setSelectedDossierIds(new Set());
                                  await refreshAll();
                                },
                              });
                            }}
                            className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition flex items-center gap-1"
                          ><Trash2 className="h-3 w-3" /> Supprimer</button>
                          <div className="ml-auto relative">
                            <button type="button" onClick={() => setShowBulkDossierPopover(!showBulkDossierPopover)} className="rounded-lg bg-[#C9A84C]/15 px-3 py-1.5 text-xs font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/25 transition">Section</button>
                            {showBulkDossierPopover && (
                              <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-white/15 p-3 shadow-lg" style={{ backgroundColor: "#12314d" }}>
                                <p className="mb-2 text-xs font-semibold text-white/80">Placer dans la section</p>
                                {(() => {
                                  const existingSections = [...new Set(childDossiers.flatMap((d) => d.etiquettes ?? []).filter(Boolean))].sort();
                                  return (
                                    <div className="space-y-1.5">
                                      {existingSections.map((s) => (
                                        <button
                                          key={s}
                                          type="button"
                                          onClick={async () => {
                                            await handleAction(() => bulkSetDossierEtiquettes([...selectedDossierIds], [s]));
                                            setShowBulkDossierPopover(false);
                                            setSelectedDossierIds(new Set());
                                          }}
                                          className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm font-medium text-white/70 hover:bg-[#C9A84C]/10 hover:border-[#C9A84C]/30 transition"
                                        >{s}</button>
                                      ))}
                                      <div className="flex gap-1.5 pt-1">
                                        <input
                                          value={bulkDossierEtiquettes[0] ?? ""}
                                          onChange={(e) => setBulkDossierEtiquettes(e.target.value ? [e.target.value] : [])}
                                          placeholder="Nouvelle section..."
                                          className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#C9A84C]/40 focus:ring-1 focus:ring-[#C9A84C]/20"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && bulkDossierEtiquettes[0]?.trim()) {
                                              handleAction(() => bulkSetDossierEtiquettes([...selectedDossierIds], [bulkDossierEtiquettes[0].trim()]));
                                              setShowBulkDossierPopover(false);
                                              setBulkDossierEtiquettes([]);
                                              setSelectedDossierIds(new Set());
                                            }
                                          }}
                                        />
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!bulkDossierEtiquettes[0]?.trim()) return;
                                            await handleAction(() => bulkSetDossierEtiquettes([...selectedDossierIds], [bulkDossierEtiquettes[0].trim()]));
                                            setShowBulkDossierPopover(false);
                                            setBulkDossierEtiquettes([]);
                                            setSelectedDossierIds(new Set());
                                          }}
                                          className="rounded-lg bg-[#C9A84C] px-3 py-1.5 text-xs font-semibold text-[#0e1e35] hover:bg-[#b8993f]"
                                        >OK</button>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await handleAction(() => bulkSetDossierEtiquettes([...selectedDossierIds], []));
                                          setShowBulkDossierPopover(false);
                                          setSelectedDossierIds(new Set());
                                        }}
                                        className="w-full rounded-lg px-3 py-1.5 text-xs text-white/30 hover:text-red-400 hover:bg-red-500/10 transition"
                                      >Retirer de toute section</button>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {dossierViewMode === "cards" ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndChildren}>
                          <SortableContext items={childDossiers.map((d) => d.id)} strategy={rectSortingStrategy}>
                            {dossierGroups ? (
                              dossierGroups.map((group) => (
                                <div key={group.label || "__none__"}>
                                  <DossierEtiquetteSectionHeader
                                    label={group.label}
                                    dossierIds={group.dossiers.map((d) => d.id)}
                                    canEdit={canEdit}
                                    onRenamed={refreshAll}
                                    onDeleteSection={canEdit && group.label ? (mode) => {
                                      startTransition(async () => {
                                        if (mode === "remove") {
                                          await bulkSetDossierEtiquettes(group.dossiers.map((d) => d.id), []);
                                        }
                                        await refreshAll();
                                      });
                                    } : undefined}
                                  />
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-3">
                                    {group.dossiers.map((child) => (
                                      <SortableSubDossierCard
                                        key={child.id}
                                        dossier={child}
                                        onClick={() => selectDossier(child)}
                                        onEdit={canEdit ? () => setModal({ type: "edit_dossier", dossier: child }) : undefined}
                                        onDelete={canEdit ? () => setConfirmDelete({ label: `le dossier "${child.name}"`, onConfirm: () => handleAction(() => deleteDossier(child.id)) }) : undefined}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
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
                            )}
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndChildren}>
                          <SortableContext items={childDossiers.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-1.5">
                              {dossierGroups ? (
                                dossierGroups.map((group) => (
                                  <div key={group.label || "__none__"}>
                                    <DossierEtiquetteSectionHeader
                                      label={group.label}
                                      dossierIds={group.dossiers.map((d) => d.id)}
                                      canEdit={canEdit}
                                      onRenamed={refreshAll}
                                      onDeleteSection={canEdit && group.label ? (mode) => {
                                        startTransition(async () => {
                                          if (mode === "remove") {
                                            await bulkSetDossierEtiquettes(group.dossiers.map((d) => d.id), []);
                                          }
                                          await refreshAll();
                                        });
                                      } : undefined}
                                    />
                                    {group.dossiers.map((child) => (
                                      <div key={child.id} className="mb-1.5">
                                        <SortableSubDossierRow
                                          dossier={child}
                                          selected={selectedDossierIds.has(child.id)}
                                          sectionBadges={child.dossier_type === "subject" ? getSectionBadges(child.id) : undefined}
                                          onToggleSelect={canEdit ? () => {
                                            setSelectedDossierIds((prev) => {
                                              const next = new Set(prev);
                                              if (next.has(child.id)) next.delete(child.id); else next.add(child.id);
                                              return next;
                                            });
                                          } : undefined}
                                          onClick={() => selectDossier(child)}
                                          onEdit={canEdit ? () => setModal({ type: "edit_dossier", dossier: child }) : undefined}
                                          onDelete={canEdit ? () => setConfirmDelete({ label: `le dossier "${child.name}"`, onConfirm: () => handleAction(() => deleteDossier(child.id)) }) : undefined}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ))
                              ) : (
                                childDossiers.map((child) => (
                                  <SortableSubDossierRow
                                    key={child.id}
                                    dossier={child}
                                    selected={selectedDossierIds.has(child.id)}
                                    sectionBadges={child.dossier_type === "subject" ? getSectionBadges(child.id) : undefined}
                                    onToggleSelect={canEdit ? () => {
                                      setSelectedDossierIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(child.id)) next.delete(child.id); else next.add(child.id);
                                        return next;
                                      });
                                    } : undefined}
                                    onClick={() => selectDossier(child)}
                                    onEdit={canEdit ? () => setModal({ type: "edit_dossier", dossier: child }) : undefined}
                                    onDelete={canEdit ? () => setConfirmDelete({ label: `le dossier "${child.name}"`, onConfirm: () => handleAction(() => deleteDossier(child.id)) }) : undefined}
                                  />
                                ))
                              )}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  )}

                  {/* Bouton + sous les dossiers */}
                  {canEdit && selectedDossier && selectedDossier.dossier_type !== "subject" && (
                    <button
                      onClick={() => setModal({ type: "add_picker", parentId: selectedId })}
                      className="mt-3 mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/8 py-3.5 text-[12px] font-semibold text-white/30 transition-all duration-200 hover:border-[#C9A84C]/30 hover:bg-[#C9A84C]/[0.04] hover:text-[#C9A84C]/70 hover:shadow-[0_0_20px_rgba(201,168,76,0.04)]"
                    >
                      <Plus className="h-4 w-4" /> Ajouter du contenu
                    </button>
                  )}

                  {/* Cours — drag & drop grille ou liste */}
                  {loadingRessources ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                    </div>
                  ) : coursList.length > 0 ? (
                    <div>
                      {/* Link rules info banner */}
                      {universityLinkRules && currentOfferCode && canEdit && (
                        <div className="mb-3 rounded-xl border border-blue-100 bg-[#4fabdb]/10 px-4 py-3">
                          <p className="text-xs font-semibold text-blue-800 mb-1.5">🔗 Synchronisation automatique</p>
                          <div className="space-y-1">
                            {Object.entries(universityLinkRules.sections)
                              .filter(([_, offers]) => offers.includes(currentOfferCode!))
                              .sort(([a], [b]) => (SECTION_ORDER[a] ?? 99) - (SECTION_ORDER[b] ?? 99))
                              .map(([section, offers]) => {
                                const otherOffers = offers.filter((o) => o !== currentOfferCode);
                                if (otherOffers.length === 0) return (
                                  <p key={section} className="text-[11px] text-[#4fabdb]">
                                    <span className="font-semibold">{section}</span> — cours locaux, pas de synchronisation.
                                  </p>
                                );
                                const offerLabels = otherOffers.map((o) =>
                                  o === "prepa_pass" ? "PREPA PASS" : o === "prepa_las" ? "PREPA LAS" : o === "prepa_lsps" ? "PREPA LSPS" : o
                                );
                                return (
                                  <p key={section} className="text-[11px] text-[#4fabdb]">
                                    <span className="font-semibold">{section}</span> — synchronisé avec {offerLabels.join(" et ")}. Toute modification se répercute automatiquement.
                                  </p>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-[#4fabdb] to-[#4fabdb]/30" />
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/40">Cours</span>
                          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold text-white/25">{coursList.length}</span>
                        </div>
                        <span className="h-px flex-1 bg-gradient-to-r from-white/8 to-transparent" />
                        <div className="flex gap-0.5 rounded-lg border border-white/8 bg-white/[0.02] p-0.5">
                          <button
                            onClick={() => { setCoursViewMode("cards"); localStorage.setItem("pedagogie-cours-view", "cards"); }}
                            className={`rounded-md p-1.5 transition-all duration-150 ${coursViewMode === "cards" ? "bg-[#4fabdb]/15 text-[#4fabdb] shadow-sm" : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"}`}
                            title="Vue cartes"
                          >
                            <LayoutGrid className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setCoursViewMode("list"); localStorage.setItem("pedagogie-cours-view", "list"); }}
                            className={`rounded-md p-1.5 transition-all duration-150 ${coursViewMode === "list" ? "bg-[#4fabdb]/15 text-[#4fabdb] shadow-sm" : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"}`}
                            title="Vue liste"
                          >
                            <LayoutList className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {coursViewMode === "cards" ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCours}>
                          <SortableContext items={coursList.map((c) => c.id)} strategy={rectSortingStrategy}>
                            {coursGroups ? (
                              coursGroups.map((group, gi) => (
                                <div key={group.label || "__none__"}>
                                  <EtiquetteSectionHeader
                                    label={group.label}
                                    coursIds={group.cours.map((c) => c.id)}
                                    canEdit={canEdit}
                                    onRenamed={refreshAll}
                                    onMoveUp={canEdit && gi > 0 && group.label ? () => moveSectionByLabel(group.label, "up") : undefined}
                                    onMoveDown={canEdit && gi < (coursGroups?.length ?? 0) - 1 && group.label ? () => moveSectionByLabel(group.label, "down") : undefined}
                                    onDeleteSection={canEdit && group.label ? (mode) => {
                                      const coursInGroup = group.cours;
                                      const ids = coursInGroup.map((c) => c.id);
                                      if (mode === "remove_tag") {
                                        handleAction(() => bulkSetEtiquettes(ids, []));
                                      } else {
                                        setSectionDeleteChoice({ label: group.label, cours: coursInGroup });
                                      }
                                    } : undefined}
                                  />
                                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {group.cours.map((c) => (
                                      <SortableCoursCard
                                        key={c.id}
                                        cours={c}
                                        matiereLabel={selectedDossier?.dossier_type === "subject" ? "Chapitre" : selectedDossier?.name ?? ""}
                                        onSelect={() => setSelectedCours(c)}
                                        onEdit={canEdit ? () => setModal({ type: "edit_cours", cours: c }) : undefined}
                                        onDelete={canEdit ? () => handleDeleteCours(c) : undefined}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {coursList.map((c) => (
                                  <SortableCoursCard
                                    key={c.id}
                                    cours={c}
                                    matiereLabel={selectedDossier?.dossier_type === "subject" ? "Chapitre" : selectedDossier?.name ?? ""}
                                    onSelect={() => setSelectedCours(c)}
                                    onEdit={canEdit ? () => setModal({ type: "edit_cours", cours: c }) : undefined}
                                    onDelete={canEdit ? () => handleDeleteCours(c) : undefined}
                                  />
                                ))}
                              </div>
                            )}
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <>
                          {/* Bulk action bar */}
                          {canEdit && selectedCoursIds.size > 0 && (
                            <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/8 px-3 py-2">
                              <span className="text-xs font-semibold text-[#C9A84C]">{selectedCoursIds.size} cours sélectionné{selectedCoursIds.size > 1 ? "s" : ""}</span>
                              <button
                                type="button"
                                onClick={() => { setSelectedCoursIds(new Set(coursList.map((c) => c.id))); }}
                                className="text-[10px] font-medium text-[#4fabdb]/60 hover:text-[#4fabdb] underline"
                              >Tout sélectionner</button>
                              <button
                                type="button"
                                onClick={() => { setSelectedCoursIds(new Set()); }}
                                className="text-[10px] font-medium text-[#4fabdb]/60 hover:text-[#4fabdb] underline"
                              >Désélectionner</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const ids = [...selectedCoursIds];
                                  const anyHidden = coursList.some((c) => ids.includes(c.id) && !c.visible);
                                  await handleAction(() => bulkSetCoursVisible(ids, anyHidden));
                                  setSelectedCoursIds(new Set());
                                }}
                                className="rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/25 transition flex items-center gap-1"
                                title={coursList.some((c) => selectedCoursIds.has(c.id) && !c.visible) ? "Rendre visible" : "Masquer"}
                              >
                                {coursList.some((c) => selectedCoursIds.has(c.id) && !c.visible) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                {coursList.some((c) => selectedCoursIds.has(c.id) && !c.visible) ? "Visible" : "Masquer"}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleAction(() => bulkArchiveCours([...selectedCoursIds]));
                                  showToast(`${selectedCoursIds.size} cours archivé${selectedCoursIds.size > 1 ? "s" : ""}`, "success");
                                  setSelectedCoursIds(new Set());
                                }}
                                className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/15 transition flex items-center gap-1"
                              ><FolderOpen className="h-3 w-3" /> Archiver</button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDelete({
                                    label: `${selectedCoursIds.size} cours${universityLinkRules ? " (dans toutes les offres)" : ""}`,
                                    onConfirm: async () => {
                                      await handleAction(() => bulkDeleteCours([...selectedCoursIds]));
                                      setSelectedCoursIds(new Set());
                                    },
                                  });
                                }}
                                className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition flex items-center gap-1"
                              ><Trash2 className="h-3 w-3" /> Supprimer</button>
                              <div className="ml-auto relative">
                                <button
                                  type="button"
                                  onClick={() => setShowBulkPopover(!showBulkPopover)}
                                  className="rounded-lg bg-[#C9A84C]/15 px-3 py-1.5 text-xs font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/20 transition"
                                >Étiquettes</button>
                                {showBulkPopover && (
                                  <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-white/10 bg-[#12314d] p-3 shadow-lg">
                                    <p className="mb-2 text-xs font-semibold text-white/80">Attribuer des étiquettes</p>
                                    <TagInput
                                      value={bulkEtiquettes}
                                      onChange={setBulkEtiquettes}
                                      suggestions={[...new Set(coursList.flatMap((c) => c.etiquettes ?? []))].sort()}
                                      placeholder="Taper puis Enter..."
                                    />
                                    <div className="mt-2 flex justify-end gap-2">
                                      <button type="button" onClick={() => { setShowBulkPopover(false); setBulkEtiquettes([]); }} className="rounded-lg px-2.5 py-1 text-xs text-white/50 hover:bg-white/8">Annuler</button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await handleAction(() => bulkSetEtiquettes([...selectedCoursIds], bulkEtiquettes));
                                          setShowBulkPopover(false);
                                          setBulkEtiquettes([]);
                                          setSelectedCoursIds(new Set());
                                        }}
                                        className="rounded-lg bg-[#12314d] px-3 py-1 text-xs font-semibold text-white hover:bg-[#12314d]/90"
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
                                {coursGroups ? (
                                  coursGroups.map((group, gi) => (
                                    <div key={group.label || "__none__"}>
                                      <EtiquetteSectionHeader
                                        label={group.label}
                                        coursIds={group.cours.map((c) => c.id)}
                                        canEdit={canEdit}
                                        onRenamed={refreshAll}
                                        onMoveUp={canEdit && gi > 0 && group.label ? () => moveSectionByLabel(group.label, "up") : undefined}
                                        onMoveDown={canEdit && gi < (coursGroups?.length ?? 0) - 1 && group.label ? () => moveSectionByLabel(group.label, "down") : undefined}
                                        onDeleteSection={canEdit && group.label ? (mode) => {
                                          const coursInGroup = group.cours;
                                          const ids = coursInGroup.map((c) => c.id);
                                          if (mode === "remove_tag") {
                                            handleAction(() => bulkSetEtiquettes(ids, []));
                                          } else {
                                            setSectionDeleteChoice({ label: group.label, cours: coursInGroup });
                                          }
                                        } : undefined}
                                      />
                                      {group.cours.map((c) => (
                                        <div key={c.id} className="mb-1.5">
                                          <SortableCoursRow
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
                                            onDelete={canEdit ? () => handleDeleteCours(c) : undefined}
                                            onLink={undefined}
                                            availableSections={!universityLinkRules ? availableCourseSections : undefined}
                                            onMoveToSection={canEdit && !universityLinkRules ? (section) => handleAction(() => bulkSetEtiquettes([c.id], [section])) : undefined}
                                            onPdfUploaded={refreshAll}
                                          />
                                        </div>
                                      ))}
                                      {canEdit && selectedDossier && (
                                        <AddCoursInlineButton
                                          label={group.label ? `Ajouter dans ${group.label}` : "Ajouter un cours"}
                                          onClick={() => {
                                            setModal({ type: "create_cours", dossierId: selectedDossier.id });
                                            if (group.label) setInlineCoursSection(group.label);
                                          }}
                                        />
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <>
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
                                        onDelete={canEdit ? () => handleDeleteCours(c) : undefined}
                                        onLink={undefined}
                                        availableSections={!universityLinkRules ? availableCourseSections : undefined}
                                        onMoveToSection={canEdit && !universityLinkRules ? (section) => handleAction(() => bulkSetEtiquettes([c.id], [section])) : undefined}
                                        onPdfUploaded={refreshAll}
                                      />
                                    ))}
                                    {canEdit && selectedDossier && (
                                      <AddCoursInlineButton
                                        label="Ajouter un cours"
                                        onClick={() => setModal({ type: "create_cours", dossierId: selectedDossier.id })}
                                      />
                                    )}
                                  </>
                                )}
                                {canEdit && coursList.length > 0 && (
                                  <AddCategoryButton
                                    onAdd={(name) => {
                                      setEmptySections((prev) => prev.includes(name) ? prev : [...prev, name]);
                                    }}
                                  />
                                )}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </>
                      )}
                    </div>
                  ) : canEdit && selectedDossier && canCreateCourseInDossier(selectedDossier.dossier_type) ? (
                    <AddCoursInlineButton
                      label="Ajouter un cours"
                      onClick={() => setModal({ type: "create_cours", dossierId: selectedDossier.id })}
                    />
                  ) : null}

                  {/* Ressources — drag & drop liste */}
                  {!loadingRessources && ressources.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#4fabdb]/40">
                        <span className="h-px flex-1 bg-[#12314d]/10" />
                        Ressources
                        <span className="h-px flex-1 bg-[#12314d]/10" />
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
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#12314d]/5 ring-1 ring-white/10">
              <img src="/logo-ds.svg" alt="" className="h-16 w-16 object-contain opacity-60" />
            </div>
            <p className="text-sm font-semibold text-[#4fabdb]/60">Sélectionnez un dossier</p>
            <p className="mt-1.5 text-xs text-white/40 max-w-[180px] leading-relaxed">Choisissez un dossier dans l'arborescence pour voir et gérer son contenu</p>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {modal && (
        <ModalOverlay onClose={() => setModal(null)} wide={modal.type === "rattacher_cours" || modal.type === "missing_cours" || modal.type === "move_dossiers"}>

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
              onSubmit={(data) => {
                const parentId = modal.parentId;
                startTransition(async () => {
                  const result = await createDossier({ ...data, parent_id: parentId });
                  if (result.error) { showToast(result.error, "error"); return; }
                  showToast("Sauvegardé", "success");
                  setModal(null);
                  await refreshAll();
                  // Detect duplicate university for clone proposal
                  if (data.dossier_type === "university" && data.name) {
                    const refreshed = await getAllDossiers();
                    const parentDoss = allDossiers.find((d) => d.id === parentId);
                    const parentOffer = parentDoss ? inferOfferFromAncestors(parentDoss, allDossiers) : null;
                    const newDossier = (refreshed.data as Dossier[]).find(
                      (d) => d.name === data.name && d.parent_id === parentId && d.dossier_type === "university"
                    );
                    const refreshedDossiers = refreshed.data as Dossier[];
                    const duplicate = refreshedDossiers.find(
                      (d) =>
                        d.id !== newDossier?.id &&
                        d.name.toLowerCase() === data.name.toLowerCase() &&
                        d.dossier_type === "university" &&
                        inferOfferFromAncestors(d, refreshedDossiers) !== parentOffer &&
                        refreshedDossiers.some((child) => child.parent_id === d.id)
                    );
                    if (duplicate && newDossier) {
                      const dupOffer = inferOfferFromAncestors(duplicate, refreshed.data as Dossier[]);
                      setModal({
                        type: "clone_proposal",
                        sourceDossier: duplicate,
                        targetDossierId: newDossier.id,
                        offerLabel: getOfferLabel(dupOffer ?? ""),
                      });
                    }
                  }
                });
              }}
              onClose={() => setModal(null)}
              isPending={isFormPending}
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
              isPending={isFormPending}
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
              isPending={isFormPending}
            />
          )}

          {modal.type === "edit_ressource" && (
            <RessourceForm
              title="Modifier le contenu"
              dossierId={modal.ressource.dossier_id ?? ""}
              initialData={modal.ressource}
              onSubmit={(data) => handleAction(() => updateRessource(modal.ressource.id, data))}
              onClose={() => setModal(null)}
              isPending={isFormPending}
            />
          )}

          {modal.type === "create_cours" && (
            <CoursForm
              title={contentCreationLabel}
              dossierId={modal.dossierId}
              existingSections={availableCourseSections}
              showActualisation={isPrepaOffer}
              initialData={inlineCoursSection ? { etiquettes: [inlineCoursSection] } : undefined}
              onSwitchToBulk={() => setModal({ type: "bulk_create_cours", dossierId: modal.dossierId })}
              onSubmit={(data) => { setInlineCoursSection(null); handleAction(() => createCoursInDossier({ ...data, dossier_id: modal.dossierId })); }}
              onClose={() => { setInlineCoursSection(null); setModal(null); }}
              isPending={isFormPending}
            />
          )}

          {modal.type === "bulk_create_cours" && (
            <BulkCreateCoursModal
              dossierId={modal.dossierId}
              existingSections={availableCourseSections}
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
              showActualisation={isPrepaOffer}
              onSubmit={(data) => {
                const cours = modal.cours;
                startTransition(async () => {
                  const count = await getLinkedCoursCount(cours.id);
                  if (count > 1) {
                    if (universityLinkRules) {
                      // With link_rules, always propagate
                      await updateLinkedCours(cours.id, data, true);
                      showToast("Modifié partout", "success");
                      setModal(null);
                      await refreshAll();
                    } else {
                      setModal({ type: "linked_edit_confirm", cours, data, linkedCount: count });
                    }
                  } else {
                    await handleAction(() => updateCoursInDossier(cours.id, data));
                  }
                });
              }}
              onClose={() => setModal(null)}
              isPending={isFormPending}
            />
          )}

          {modal.type === "clone_proposal" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C9A84C]/15">
                <Link2 className="h-7 w-7 text-[#C9A84C]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#4fabdb]">Fac déjà existante</h3>
                <p className="mt-2 text-sm text-white/60">
                  <strong>{modal.sourceDossier.name}</strong> existe déjà dans <strong>{modal.offerLabel}</strong>.
                </p>
                <p className="mt-1 text-sm text-white/50">
                  Voulez-vous importer toute son arborescence (semestres, matières, cours) ?
                </p>
                <p className="mt-1 text-xs text-white/40">
                  Les cours seront liés — vous pourrez les modifier indépendamment ou propager les changements.
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setModal(null)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/5"
                >Non merci</button>
                <button
                  onClick={() => {
                    const source = modal.sourceDossier;
                    const target = modal.targetDossierId;
                    startTransition(async () => {
                      const result = await cloneDossierTree(source.id, target);
                      if (result.error) { showToast(result.error, "error"); }
                      else { showToast(`Importé : ${result.dossiersCreated} dossiers, ${result.coursCreated} cours`, "success"); }
                      setModal(null);
                      await refreshAll();
                    });
                  }}
                  disabled={isPending}
                  className="rounded-lg bg-[#12314d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12314d]/90 disabled:opacity-50"
                >{isPending ? "Import en cours..." : "Importer l'arborescence"}</button>
              </div>
            </div>
          )}

          {modal.type === "linked_edit_confirm" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4fabdb]/10">
                <Link2 className="h-7 w-7 text-[#4fabdb]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#4fabdb]">Cours lié</h3>
                <p className="mt-2 text-sm text-white/60">
                  Ce cours est lié à <strong>{modal.linkedCount - 1} autre{modal.linkedCount > 2 ? "s" : ""} offre{modal.linkedCount > 2 ? "s" : ""}</strong>.
                </p>
                <p className="mt-1 text-sm text-white/50">Appliquer les modifications partout ou seulement ici ?</p>
              </div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    const { cours, data } = modal;
                    startTransition(async () => {
                      await updateLinkedCours(cours.id, data, false);
                      showToast("Modifié ici uniquement (détaché)", "success");
                      setModal(null);
                      await refreshAll();
                    });
                  }}
                  disabled={isPending}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50"
                >Juste ici</button>
                <button
                  onClick={() => {
                    const { cours, data } = modal;
                    startTransition(async () => {
                      await updateLinkedCours(cours.id, data, true);
                      showToast("Modifié partout", "success");
                      setModal(null);
                      await refreshAll();
                    });
                  }}
                  disabled={isPending}
                  className="rounded-lg bg-[#12314d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12314d]/90 disabled:opacity-50"
                >Appliquer partout</button>
              </div>
            </div>
          )}

          {modal.type === "rattacher_cours" && (
            <RattacherCoursModal
              coursIds={modal.coursIds}
              sourceDossierId={modal.sourceDossierId}
              allDossiers={allDossiers as Dossier[]}
              isPending={isFormPending}
              onConfirm={(targetIds) => {
                startTransition(async () => {
                  let totalCount = 0;
                  let lastError: string | undefined;
                  for (const targetId of targetIds) {
                    const result = await linkCoursToOtherDossier(modal.coursIds, targetId);
                    if (result.error) lastError = result.error;
                    else totalCount += result.count ?? 0;
                  }
                  if (totalCount > 0) {
                    showToast(`${totalCount} cours rattaché${totalCount > 1 ? "s" : ""} dans ${targetIds.length} matière${targetIds.length > 1 ? "s" : ""}`, "success");
                    setSelectedCoursIds(new Set());
                  } else if (lastError) {
                    showToast(lastError, "error");
                  }
                  setModal(null);
                  await refreshAll();
                });
              }}
              onClose={() => setModal(null)}
            />
          )}

          {modal.type === "missing_cours" && (
            <MissingCoursModal
              dossierId={modal.dossierId}
              isPending={isFormPending}
              onImport={(coursIds) => {
                startTransition(async () => {
                  const result = await linkCoursToOtherDossier(coursIds, modal.dossierId);
                  if (result.error) {
                    showToast(result.error, "error");
                  } else {
                    showToast(`${result.count} cours importé${(result.count ?? 0) > 1 ? "s" : ""} depuis les autres offres`, "success");
                  }
                  setModal(null);
                  await refreshAll();
                });
              }}
              onClose={() => setModal(null)}
            />
          )}

          {modal.type === "move_dossiers" && (
            <MoveDossiersModal
              dossierIds={modal.dossierIds}
              allDossiers={allDossiers as Dossier[]}
              isPending={isFormPending}
              onMove={(targetId) => {
                startFormTransition(async () => {
                  await moveDossiers(modal.dossierIds, targetId);
                  {
                    showToast(`${modal.dossierIds.length} dossier${modal.dossierIds.length > 1 ? "s" : ""} déplacé${modal.dossierIds.length > 1 ? "s" : ""}`, "success");
                    setSelectedDossierIds(new Set());
                  }
                  setModal(null);
                  await refreshAll();
                });
              }}
              onClose={() => setModal(null)}
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
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[#12314d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">Confirmer la suppression</h3>
              <p className="text-sm text-white/50">
                Voulez-vous vraiment supprimer <span className="font-medium text-white/80">{confirmDelete.label}</span> ? Cette action est irréversible.
              </p>
            </div>
            <div className="flex gap-2 border-t border-white/8 px-6 py-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-white/10 py-2 text-sm font-medium text-white/60 hover:bg-white/5 transition"
              >
                Annuler
              </button>
              <button
                onClick={() => { confirmDelete.onConfirm(); setConfirmDelete(null); }}
                className="flex-1 rounded-xl bg-red-500/100 py-2 text-sm font-semibold text-white hover:bg-red-600 transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {linkedDeleteChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setLinkedDeleteChoice(null)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[#12314d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <Link2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">Cours lié</h3>
              <p className="text-sm text-white/50">
                <span className="font-medium text-white/80">{linkedDeleteChoice.cours.name}</span> est lié à <span className="font-medium text-white/80">{linkedDeleteChoice.count - 1} autre{linkedDeleteChoice.count > 2 ? "s" : ""} offre{linkedDeleteChoice.count > 2 ? "s" : ""}</span>.
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t border-white/8 px-6 py-4">
              <button
                onClick={() => {
                  const c = linkedDeleteChoice.cours;
                  setLinkedDeleteChoice(null);
                  handleAction(() => deleteCoursFromDossier(c.id));
                }}
                className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 transition"
              >
                Supprimer juste ici
              </button>
              <button
                onClick={() => {
                  const c = linkedDeleteChoice.cours;
                  setLinkedDeleteChoice(null);
                  handleAction(() => deleteLinkedCoursByCoursId(c.id));
                }}
                className="w-full rounded-xl bg-red-500/100 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition"
              >
                Supprimer dans toutes les offres ({linkedDeleteChoice.count})
              </button>
              <button
                onClick={() => setLinkedDeleteChoice(null)}
                className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {sectionDeleteChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSectionDeleteChoice(null)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[#12314d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <Link2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">Cours liés détectés</h3>
              <p className="text-sm text-white/50">
                Certains cours de <span className="font-medium text-white/80">{sectionDeleteChoice.label}</span> sont liés à d'autres offres.
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t border-white/8 px-6 py-4">
              <button
                onClick={() => {
                  const ids = sectionDeleteChoice.cours.map((c) => c.id);
                  setSectionDeleteChoice(null);
                  handleAction(async () => { for (const id of ids) await deleteCoursFromDossier(id); return { success: true }; });
                }}
                className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 transition"
              >
                Supprimer juste ici ({sectionDeleteChoice.cours.length} cours)
              </button>
              <button
                onClick={() => {
                  const allCours = sectionDeleteChoice.cours;
                  setSectionDeleteChoice(null);
                  handleAction(async () => {
                    for (const c of allCours) {
                      await deleteLinkedCoursByCoursId(c.id);
                    }
                    return { success: true };
                  });
                }}
                className="w-full rounded-xl bg-red-500/100 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition"
              >
                Supprimer dans toutes les offres
              </button>
              <button
                onClick={() => setSectionDeleteChoice(null)}
                className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition"
              >
                Annuler
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

  const allowedTypes = getAllowedChildTypes(parentDossier);
  const defaultChildType = getDefaultChildType(parentDossier);
  const [childType, setChildType] = useState(defaultChildType);
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
    <div className="rounded-2xl bg-[#12314d] shadow-2xl overflow-hidden w-full max-w-md">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Créer plusieurs dossiers</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8"><X className="h-4 w-4 text-white/50" /></button>
      </div>
      <div className="p-5 space-y-4">
        {/* Type selector */}
        {allowedTypes.length > 1 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/80">Type de dossier</label>
            <div className="flex flex-wrap gap-1.5">
              {allowedTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setChildType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    childType === t
                      ? "border-[#4fabdb] bg-[#12314d]/5 text-[#4fabdb]"
                      : "border-white/10 text-white/40 hover:border-white/15 hover:text-white/60"
                  }`}
                >{DOSSIER_TYPE_META[t]?.shortLabel ?? t}</button>
              ))}
            </div>
          </div>
        )}

        {/* Screenshot upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
            analyzing
              ? "border-[#4fabdb]/40 bg-[#4fabdb]/10"
              : "border-white/10 bg-white/5 hover:border-[#4fabdb]/40 hover:bg-[#4fabdb]/10"
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
              <p className="text-xs text-[#4fabdb] font-medium">Analyse du screenshot en cours...</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-white/40" />
              <p className="text-xs text-white/50 text-center">
                <span className="font-medium text-white/80">Importer un screenshot</span>
                <br />
                Glissez une image ou cliquez pour extraire les noms
              </p>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">Noms (un par ligne)</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={"Chimie générale\nBiologie cellulaire\nAnatomie\nPhysiologie\n..."}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4fabdb]/20 resize-none"
            autoFocus
          />
          {names.length > 0 && (
            <p className="mt-1 text-xs text-white/50">{names.length} {childLabel.toLowerCase()}{names.length > 1 ? "s" : ""} à créer</p>
          )}
        </div>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-xs ${result.errors.length > 0 ? "bg-amber-500/10 text-amber-700" : "bg-green-500/10 text-green-400"}`}>
            <p className="font-semibold">{result.ok} créé{result.ok > 1 ? "s" : ""}</p>
            {result.errors.map((e, i) => <p key={i} className="text-red-400 mt-1">{e}</p>)}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5">
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
  { type: "pdf",   label: "PDF",   icon: <FileText className="h-8 w-8" />,  color: "text-red-500",  bg: "hover:bg-red-500/15 hover:border-red-500/20" },
  { type: "video", label: "Vidéo", icon: <Video className="h-8 w-8" />,     color: "text-blue-500", bg: "hover:bg-[#4fabdb]/15 hover:border-[#4fabdb]/20" },
  { type: "vimeo", label: "Vimeo", icon: <FileVideo className="h-8 w-8" />, color: "text-cyan-500", bg: "hover:bg-cyan-50 hover:border-cyan-200" },
  { type: "lien",  label: "Lien",  icon: <LinkIcon className="h-8 w-8" />,      color: "text-green-500",bg: "hover:bg-green-500/10 hover:border-green-500/20" },
];

function BulkCreateCoursModal({ dossierId, existingSections, onCreated, onClose }: {
  dossierId: string;
  existingSections?: string[];
  onCreated: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);
  const [selectedSection, setSelectedSection] = useState("");
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
    if (existingSections && !selectedSection) return;
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
          ...(selectedSection ? { etiquettes: [selectedSection] } : {}),
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
    <div className="rounded-2xl bg-[#12314d] shadow-2xl overflow-hidden w-full max-w-md">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Créer plusieurs cours</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8"><X className="h-4 w-4 text-white/50" /></button>
      </div>
      <div className="p-5 space-y-4">
        {/* Screenshot upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${
            analyzing
              ? "border-[#4fabdb]/40 bg-[#4fabdb]/10"
              : "border-white/10 bg-white/5 hover:border-[#4fabdb]/40 hover:bg-[#4fabdb]/10"
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
              <p className="text-xs text-[#4fabdb] font-medium">Analyse du screenshot en cours...</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-white/40" />
              <p className="text-xs text-white/50 text-center">
                <span className="font-medium text-white/80">Importer un screenshot</span>
                <br />
                Glissez une image ou cliquez pour extraire les noms de cours
              </p>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">Noms des cours (un par ligne)</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={"Atomistique\nIsomérie\nLiaisons chimiques\nMolécules conjuguées\n..."}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4fabdb]/20 resize-none"
            autoFocus
          />
          {courseNames.length > 0 && (
            <p className="mt-1 text-xs text-white/50">{courseNames.length} cours à créer</p>
          )}
        </div>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-xs ${result.errors.length > 0 ? "bg-amber-500/10 text-amber-700" : "bg-green-500/10 text-green-400"}`}>
            <p className="font-semibold">{result.ok} cours créé{result.ok > 1 ? "s" : ""}</p>
            {result.errors.map((e, i) => <p key={i} className="text-red-400 mt-1">{e}</p>)}
          </div>
        )}

        {existingSections && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/80">Section *</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#4fabdb]/40 focus:ring-2 focus:ring-[#4fabdb]/20"
            >
              <option value="">— Choisir une section —</option>
              {existingSections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5">
            Fermer
          </button>
          <button
            onClick={handleCreate}
            disabled={courseNames.length === 0 || creating || (!!existingSections && !selectedSection)}
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
  const canCreateChildren = !parentDossier || allowedChildTypes.length > 0;
  const childLabel = allowedChildTypes.length === 1
    ? DOSSIER_TYPE_META[allowedChildTypes[0]].label
    : "sous-dossier";
  const childDescription = allowedChildTypes.length > 0
    ? allowedChildTypes.map((type) => DOSSIER_TYPE_META[type].shortLabel).join(" / ")
    : "Aucun sous-niveau prévu";
  const courseLabel = getContentCreationLabel(parentDossier?.dossier_type);

  return (
    <div className="rounded-2xl bg-[#12314d] shadow-2xl overflow-hidden w-full max-w-sm">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Que voulez-vous ajouter ?</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8">
          <X className="h-4 w-4 text-white/50" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Dossier */}
        <button
          onClick={onCreateDossier}
          disabled={!canCreateChildren}
          className="group flex w-full items-center gap-4 rounded-xl border border-white/10 p-4 text-left transition enabled:hover:border-[#4fabdb]/30 enabled:hover:bg-[#12314d]/5 disabled:opacity-50"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#12314d]/5 text-[#4fabdb] transition group-hover:bg-[#12314d]/10">
            <FolderPlus className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {parentDossier ? `Créer ${/^[AEIOUÉÈÊÀ]/.test(childLabel) ? "une" : "un"} ${childLabel.toLowerCase()}` : "Créer une offre"}
            </p>
            <p className="text-xs text-white/40">
              {parentDossier ? childDescription : "Installer un niveau racine métier"}
            </p>
          </div>
        </button>

        {/* Bulk create dossiers */}
        {canCreateChildren && (
          <button
            onClick={onBulkCreateDossiers}
            className="group flex w-full items-center gap-4 rounded-xl border border-white/10 p-4 text-left transition hover:border-orange-500/20 hover:bg-orange-500/10"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400 transition group-hover:bg-orange-500/20">
              <ImagePlus className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Créer depuis un screenshot
              </p>
              <p className="text-xs text-white/40">Extraire les noms depuis une capture d'écran</p>
            </div>
          </button>
        )}

        {/* Cours */}
        {canAddContent && (
          <button
            onClick={onCreateCours}
            className="group flex w-full items-center gap-4 rounded-xl border border-white/10 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{courseLabel}</p>
              <p className="text-xs text-white/40">Chapitre PDF + séries d'exercices</p>
            </div>
          </button>
        )}

        {/* Bulk create cours */}
        {canAddContent && (
          <button
            onClick={onBulkCreateCours}
            className="group flex w-full items-center gap-4 rounded-xl border border-white/10 p-4 text-left transition hover:border-teal-200 hover:bg-teal-50"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 transition group-hover:bg-teal-100">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Créer plusieurs cours</p>
              <p className="text-xs text-white/40">Coller une liste de noms ou un screenshot</p>
            </div>
          </button>
        )}

        {/* Contenu */}
        {canAddContent ? (
          <div>
            <p className="mb-2 text-xs font-medium text-white/50">Ajouter une ressource</p>
            <div className="grid grid-cols-4 gap-2">
              {CONTENT_TYPES.map(({ type, label, icon, color, bg }) => (
                <button
                  key={type}
                  onClick={() => onCreateRessource(type)}
                  className={`flex flex-col items-center gap-2 rounded-xl border border-white/10 p-3 text-center transition ${bg}`}
                >
                  <span className={color}>{icon}</span>
                  <span className="text-xs font-medium text-white/80">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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

  const nodeCs = CARD_STYLES[node.dossier_type] ?? CARD_STYLES.generic;
  const NodeIcon = nodeCs.icon;

  return (
    <div ref={setNodeRef} style={{ ...style, marginLeft: depth > 0 ? "14px" : 0 }}>
      <div
        className={`group relative mb-0.5 flex items-center gap-1.5 rounded-xl px-2 py-[7px] transition-all duration-200 ${
          selected
            ? "shadow-[inset_0_0_20px_rgba(201,168,76,0.06)]"
            : "hover:bg-white/[0.04]"
        }`}
        style={{
          borderLeft: selected ? `2px solid ${nodeCs.iconColor}` : "2px solid transparent",
          background: selected ? `linear-gradient(90deg, ${nodeCs.iconColor}12 0%, transparent 70%)` : undefined,
        }}
      >
        {canEdit && (
          <span {...attributes} {...listeners}
            className="flex-shrink-0 cursor-grab touch-none p-0.5 text-white/10 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
            <GripVertical className="h-3 w-3" />
          </span>
        )}

        <button type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) { if (expanded) { onToggle(node.id); return; } onToggle(node.id); onSelect(node); return; }
            onSelect(node);
          }}
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        >
          {hasChildren
            ? expanded ? <ChevronDown className="h-3 w-3 text-white/50" /> : <ChevronRight className="h-3 w-3 text-white/25" />
            : <span className="h-1 w-1 rounded-full bg-white/15" />}
        </button>

        <button type="button" onClick={() => onSelect(node)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
            style={{ backgroundColor: nodeCs.iconBg, boxShadow: selected ? `0 0 10px ${nodeCs.iconColor}30` : "none" }}
          >
            {node.icon_url
              ? <img src={node.icon_url} alt="" className="h-3.5 w-3.5 object-contain" />
              : <NodeIcon className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block whitespace-normal break-words text-[11px] leading-snug transition-colors ${selected ? "font-bold text-white" : "font-medium text-white/70 group-hover:text-white/90"}`}>
              {node.name}
            </span>
          </span>
          <span className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest opacity-60" style={{ backgroundColor: nodeCs.badgeBg, color: nodeCs.badgeText }}>
            {DOSSIER_TYPE_META[node.dossier_type]?.shortLabel ?? "Dossier"}
          </span>
          {!node.visible && <EyeOff className="h-3 w-3 flex-shrink-0 text-white/15" />}
        </button>

        {canEdit && (
          <div className="flex flex-shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); onEdit(node); }} className="rounded-md p-1 text-white/20 hover:bg-white/10 hover:text-[#4fabdb] transition-colors" title="Modifier">
              <Pencil className="h-2.5 w-2.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(node); }} className="rounded-md p-1 text-white/20 hover:bg-red-500/15 hover:text-red-400 transition-colors" title="Supprimer">
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="ml-[18px]" style={{ borderLeft: `1px solid ${nodeCs.iconColor}20` }}>
          {hasChildren && (
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
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// SORTABLE SUB-DOSSIER CARD (grille drag & drop)
// =============================================

// Type-based visual styles for sub-dossier cards — Diploma Santé charte graphique
type CardIconComponent = React.FC<React.SVGProps<SVGSVGElement>>;
const CARD_STYLES: Record<string, { icon: CardIconComponent; gradient: string; iconBg: string; iconColor: string; badgeBg: string; badgeText: string; border: string }> = {
  offer:      { icon: OfferIcon,      gradient: "linear-gradient(145deg, #0e1e35 0%, #162d4a 50%, #1a3555 100%)", iconBg: "rgba(201,168,76,0.18)", iconColor: "#E3C286", badgeBg: "rgba(201,168,76,0.18)", badgeText: "#E3C286", border: "rgba(201,168,76,0.35)" },
  sub_offer:  { icon: SubOfferIcon,   gradient: "linear-gradient(145deg, #0e1e35 0%, #162d4a 50%, #1a3555 100%)", iconBg: "rgba(201,168,76,0.14)", iconColor: "#E3C286", badgeBg: "rgba(201,168,76,0.14)", badgeText: "#E3C286", border: "rgba(201,168,76,0.28)" },
  university: { icon: UniversityIcon, gradient: "linear-gradient(145deg, #0e1e35 0%, #14253d 50%, #182c47 100%)", iconBg: "rgba(255,255,255,0.08)", iconColor: "#ffffff", badgeBg: "rgba(201,168,76,0.15)", badgeText: "#E3C286", border: "rgba(255,255,255,0.12)" },
  semester:   { icon: SemesterIcon,   gradient: "linear-gradient(145deg, #111f33 0%, #15283e 50%, #1a3048 100%)", iconBg: "rgba(201,168,76,0.12)", iconColor: "#C9A84C", badgeBg: "rgba(201,168,76,0.12)", badgeText: "#C9A84C", border: "rgba(201,168,76,0.18)" },
  subject:    { icon: SubjectIcon,    gradient: "linear-gradient(145deg, #0e1e35 0%, #162d4a 50%, #1e3654 100%)", iconBg: "rgba(201,168,76,0.2)", iconColor: "#E3C286", badgeBg: "rgba(52,211,153,0.12)", badgeText: "#6EE7B7", border: "rgba(201,168,76,0.25)" },
  module:     { icon: ModuleIcon,     gradient: "linear-gradient(145deg, #101b2d 0%, #152438 50%, #1a2d42 100%)", iconBg: "rgba(201,168,76,0.12)", iconColor: "#D4B65C", badgeBg: "rgba(201,168,76,0.1)", badgeText: "#D4B65C", border: "rgba(201,168,76,0.15)" },
  option:     { icon: OptionIcon,     gradient: "linear-gradient(145deg, #141e2c 0%, #1a2838 50%, #1e3040 100%)", iconBg: "rgba(251,191,36,0.12)", iconColor: "#FBBF24", badgeBg: "rgba(251,191,36,0.12)", badgeText: "#FBBF24", border: "rgba(251,191,36,0.18)" },
  period:     { icon: PeriodIcon,     gradient: "linear-gradient(145deg, #0e1a2b 0%, #132236 50%, #172a40 100%)", iconBg: "rgba(201,168,76,0.1)", iconColor: "#C9A84C", badgeBg: "rgba(201,168,76,0.1)", badgeText: "#C9A84C", border: "rgba(201,168,76,0.12)" },
  generic:    { icon: GenericIcon,    gradient: "linear-gradient(145deg, #151f2e 0%, #1a2838 50%, #1e3040 100%)", iconBg: "rgba(255,255,255,0.06)", iconColor: "#94A3B8", badgeBg: "rgba(255,255,255,0.06)", badgeText: "#94A3B8", border: "rgba(255,255,255,0.08)" },
};

function SortableSubDossierCard({ dossier, onClick, onEdit, onDelete }: { dossier: Dossier; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dossier.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined };
  const cs = CARD_STYLES[dossier.dossier_type] ?? CARD_STYLES.generic;
  const CardIcon = cs.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)]"
    >
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="absolute left-2.5 top-2.5 cursor-grab touch-none text-white/15 opacity-0 group-hover:opacity-100 active:cursor-grabbing z-20">
          <GripVertical className="h-4 w-4" />
        </span>
      )}

      <button
        onClick={onClick}
        className="relative flex flex-col items-center gap-3 w-full p-7 pb-5 text-center rounded-2xl overflow-hidden"
        style={{ background: cs.gradient, border: `1px solid ${cs.border}` }}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(ellipse at 50% -20%, ${cs.iconColor}15 0%, transparent 65%)` }} />
        <div className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `linear-gradient(90deg, transparent, ${cs.iconColor}40, transparent)` }} />

        <div
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden transition-all duration-300 group-hover:scale-110 group-hover:rotate-1"
          style={{ background: `linear-gradient(135deg, ${cs.iconColor}25 0%, ${cs.iconColor}08 100%)`, border: `1px solid ${cs.iconColor}30`, boxShadow: `0 4px 16px ${cs.iconColor}15` }}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `radial-gradient(circle, ${cs.iconColor}20 0%, transparent 70%)` }} />
          {dossier.icon_url
            ? <img src={dossier.icon_url} alt="" className="relative h-7 w-7 object-contain drop-shadow-sm" />
            : <CardIcon className="relative h-7 w-7 drop-shadow-sm" />}
        </div>

        <p className="relative text-[13px] font-bold text-white/90 line-clamp-2 leading-snug min-h-[2.5rem] group-hover:text-white transition-colors duration-200">{dossier.name}</p>

        <span
          className="relative rounded-lg px-2.5 py-1 text-[7px] font-extrabold uppercase tracking-[0.15em]"
          style={{ backgroundColor: cs.badgeBg, color: cs.badgeText, border: `1px solid ${cs.iconColor}20` }}
        >
          {DOSSIER_TYPE_META[dossier.dossier_type]?.shortLabel ?? "Dossier"}
        </span>

        {!dossier.visible && (
          <div className="absolute top-2.5 right-2.5 rounded-lg bg-red-500/10 p-1 text-red-400/50 z-10">
            <EyeOff className="h-3 w-3" />
          </div>
        )}
      </button>

      {(onEdit || onDelete) && (
        <div className="absolute right-2.5 bottom-2.5 flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-20">
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded-lg p-1.5 text-white/25 hover:bg-white/10 hover:text-[#4fabdb] transition-colors backdrop-blur-sm">
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded-lg p-1.5 text-white/25 hover:bg-red-500/15 hover:text-red-400 transition-colors backdrop-blur-sm">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SortableSubDossierRow({ dossier, selected, sectionBadges, onToggleSelect, onClick, onEdit, onDelete }: {
  dossier: Dossier;
  selected?: boolean;
  sectionBadges?: string[];
  onToggleSelect?: () => void;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dossier.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const cs = CARD_STYLES[dossier.dossier_type] ?? CARD_STYLES.generic;
  const CardIcon = cs.icon;
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(dossier.name);
  const renameRef = useRef<HTMLInputElement>(null);

  const commitRename = async () => {
    setRenaming(false);
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === dossier.name) { setRenameName(dossier.name); return; }
    await updateDossier(dossier.id, { name: trimmed, color: dossier.color, visible: dossier.visible });
    onEdit?.(); // reuse to trigger refresh
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeft: `3px solid ${selected ? cs.iconColor : "transparent"}` }}
      className={`group flex items-center gap-3.5 rounded-xl p-3 transition-all duration-200 ${
        selected
          ? "shadow-[0_0_20px_rgba(201,168,76,0.06)]"
          : "hover:shadow-[0_2px_16px_rgba(0,0,0,0.2)]"
      }`}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderLeftColor = cs.iconColor + "60"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderLeftColor = "transparent"; }}
    >
      <div className="absolute inset-0 rounded-xl transition-opacity duration-200 opacity-0 group-hover:opacity-100 pointer-events-none" style={{ background: `linear-gradient(90deg, ${cs.iconColor}08 0%, transparent 40%)` }} />

      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          className="relative z-10 h-3.5 w-3.5 flex-shrink-0 rounded border-white/20 cursor-pointer accent-[#C9A84C]"
        />
      )}
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="relative z-10 flex-shrink-0 cursor-grab touch-none text-white/10 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <div
        className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110"
        style={{ background: cs.gradient, border: `1px solid ${cs.border}`, boxShadow: selected ? `0 0 12px ${cs.iconColor}25` : "none" }}
      >
        {dossier.icon_url
          ? <img src={dossier.icon_url} alt="" className="h-5 w-5 object-contain" />
          : <CardIcon className="h-5 w-5" />}
      </div>
      {renaming ? (
        <input
          ref={renameRef}
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenaming(false); setRenameName(dossier.name); } }}
          className="relative z-10 min-w-0 flex-1 rounded-lg border border-[#C9A84C]/40 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white outline-none ring-2 ring-[#C9A84C]/20"
          autoFocus
        />
      ) : (
        <button onClick={onClick} className="relative z-10 min-w-0 flex-1 text-left flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-white/90 group-hover:text-white transition-colors">{dossier.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest" style={{ backgroundColor: cs.badgeBg, color: cs.badgeText }}>
                {DOSSIER_TYPE_META[dossier.dossier_type]?.shortLabel ?? "Dossier"}
              </span>
              {sectionBadges && sectionBadges.length > 0 && sectionBadges.map((badge) => (
                <span key={badge} className="rounded-md bg-[#C9A84C]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#C9A84C]/80">{badge}</span>
              ))}
            </div>
          </div>
        </button>
      )}
      {!dossier.visible && (
        <span className="relative z-10 flex-shrink-0 rounded-lg bg-red-500/10 p-1.5 text-red-400/60" title="Masqué pour les élèves">
          <EyeOff className="h-3.5 w-3.5" />
        </span>
      )}
      {!renaming && (onEdit || onDelete) && (
        <div className="relative z-10 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); setRenaming(true); setTimeout(() => renameRef.current?.select(), 0); }}
            className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-white/25 hover:bg-white/8 hover:text-[#4fabdb] transition-colors"
          >
            Renommer
          </button>
          {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-white/20 hover:bg-white/8 hover:text-[#4fabdb] transition-colors"><Pencil className="h-3.5 w-3.5" /></button>}
          {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-white/20 hover:bg-red-500/15 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      )}
    </div>
  );
}

function DossierEtiquetteSectionHeader({ label, dossierIds, canEdit, onRenamed, onDeleteSection }: {
  label: string;
  dossierIds: string[];
  canEdit: boolean;
  onRenamed: () => void;
  onDeleteSection?: (mode: "remove") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = async () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === label) { setEditValue(label); return; }
    await renameDossierEtiquette(dossierIds, label, trimmed);
    onRenamed();
  };

  if (!label) return null;

  return (
    <div className="group mb-1.5 mt-3 flex items-center gap-2 first:mt-0">
      <span className="h-px flex-1 bg-[#C9A84C]/20" />
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setEditValue(label); } }}
          className="rounded border border-[#C9A84C]/30 bg-[#C9A84C]/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#C9A84C] outline-none ring-1 ring-[#C9A84C]/20"
          autoFocus
        />
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]">{label}</span>
      )}
      <span className="text-[10px] text-[#C9A84C]/50">({dossierIds.length})</span>
      {canEdit && !editing && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
            className="rounded p-0.5 text-[#C9A84C]/40 hover:text-[#C9A84C]"
          ><Pencil className="h-3 w-3" /></button>
          {onDeleteSection && (
            <button
              onClick={() => onDeleteSection("remove")}
              className="rounded p-0.5 text-[#C9A84C]/40 hover:text-red-400"
            ><Trash2 className="h-3 w-3" /></button>
          )}
        </div>
      )}
      <span className="h-px flex-1 bg-[#C9A84C]/20" />
    </div>
  );
}

// =============================================
// SORTABLE RESSOURCE ROW
// =============================================

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pdf:   { label: "PDF",   color: "text-red-400 bg-red-500/10",     icon: <FileText className="h-4 w-4" /> },
  video: { label: "Vidéo", color: "text-[#4fabdb] bg-[#4fabdb]/10",   icon: <Video className="h-4 w-4" /> },
  vimeo: { label: "Vimeo", color: "text-cyan-600 bg-cyan-50",   icon: <FileVideo className="h-4 w-4" /> },
  lien:  { label: "Lien",  color: "text-green-400 bg-green-500/10", icon: <LinkIcon className="h-4 w-4" /> },
};

function SortableRessourceRow({ ressource, onEdit, onDelete }: { ressource: Ressource; onEdit?: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ressource.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const meta = TYPE_META[ressource.type] ?? TYPE_META.lien;

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-3 rounded-xl border border-white/8 bg-[#12314d] p-3 shadow-sm transition hover:border-white/10 hover:shadow">
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="flex-shrink-0 cursor-grab touch-none text-white/25 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${meta.color}`}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white/90">{ressource.titre}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
          {ressource.sous_titre && <span className="text-xs text-white/40 truncate">{ressource.sous_titre}</span>}
          {!ressource.visible && <span className="text-xs text-white/40">Masqué</span>}
        </div>
      </div>
      {(onEdit || onDelete) && (
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-white/40 hover:bg-[#4fabdb]/15 hover:text-[#4fabdb]"><Pencil className="h-4 w-4" /></button>}
          {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/15 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
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

function SortableCoursRow({ cours, dossierId, selected, onToggleSelect, onSelect, onEdit, onDelete, onLink, availableSections, onMoveToSection, onPdfUploaded }: {
  cours: Cours;
  dossierId: string;
  selected?: boolean;
  onToggleSelect?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onLink?: () => void;
  availableSections?: string[];
  onMoveToSection?: (section: string) => void;
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
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement>(null);
  const hasPdf = !!cours.pdf_url;

  useEffect(() => {
    if (!showSectionMenu) return;
    const handler = (e: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node)) setShowSectionMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSectionMenu]);

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
      style={{ ...style, borderLeft: `3px solid ${selected ? "#C9A84C" : "transparent"}` }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleFileDrop}
      className={`group relative flex items-center gap-3.5 rounded-xl p-3 transition-all duration-200 ${
        selected
          ? "shadow-[0_0_20px_rgba(201,168,76,0.08)]"
          : dragOver
            ? "ring-2 ring-[#4fabdb]/30"
            : "hover:shadow-[0_2px_16px_rgba(0,0,0,0.2)]"
      }`}
      onMouseEnter={(e) => { if (!selected && !dragOver) e.currentTarget.style.borderLeftColor = "rgba(201,168,76,0.4)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderLeftColor = "transparent"; }}
    >
      <div className="absolute inset-0 rounded-xl transition-opacity duration-200 opacity-0 group-hover:opacity-100 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.04) 0%, transparent 40%)" }} />

      {onToggleSelect && (
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect}
          className="relative z-10 h-3.5 w-3.5 flex-shrink-0 rounded border-white/20 cursor-pointer accent-[#C9A84C]" />
      )}
      {(onEdit || onDelete) && (
        <span {...attributes} {...listeners} className="relative z-10 flex-shrink-0 cursor-grab touch-none text-white/10 opacity-0 group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      )}

      {/* Miniature fiche DS */}
      <div
        className="relative z-10 flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 group-hover:scale-105 group-hover:shadow-[0_2px_12px_rgba(201,168,76,0.15)]"
        style={{ width: 36, height: 46, boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(201,168,76,0.2)" }}
      >
        <CoursIcon className="w-full h-full" />
      </div>

      {editing ? (
        <input
          ref={nameInputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setEditName(cours.name); } }}
          className="relative z-10 min-w-0 flex-1 rounded-lg border border-[#C9A84C]/40 bg-white/5 px-3 py-1.5 text-sm font-bold text-white outline-none ring-2 ring-[#C9A84C]/20"
          autoFocus
        />
      ) : (
        <div className="relative z-10 min-w-0 flex-1 flex items-center gap-2">
          {cours.linked_cours_id && <LinkedCoursIndicator cours={cours} />}
          <button onClick={onSelect} className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-bold text-white/90 group-hover:text-white transition-colors">{cours.name}</p>
            {cours.etiquettes && cours.etiquettes.length > 0 && (
              <div className="flex items-center gap-1.5 mt-0.5">
                {cours.etiquettes.map((tag) => (
                  <span key={tag} className="rounded-md bg-[#C9A84C]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#C9A84C]/70">{tag}</span>
                ))}
              </div>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => nameInputRef.current?.select(), 0); }}
            className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-medium text-white/25 opacity-0 group-hover:opacity-100 hover:bg-white/8 hover:text-[#C9A84C] transition-colors"
          >
            Renommer
          </button>
        </div>
      )}

      <div className="relative z-10 flex items-center gap-1.5">
        {(!cours.actualisation || cours.actualisation === "non_actualisee") && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 text-[9px] font-bold text-orange-400/80"><RotateCcw className="h-2.5 w-2.5" /> En attente d&apos;actualisation</span>
        )}
        {cours.actualisation === "aucun_changement" && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-white/[0.03] border border-white/8 px-2 py-0.5 text-[9px] font-bold text-white/30"><RotateCcw className="h-2.5 w-2.5" /> Aucun changement</span>
        )}
        {cours.actualisation === "actualisation" && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-[#4fabdb]/10 border border-[#4fabdb]/15 px-2 py-0.5 text-[9px] font-bold text-[#4fabdb]/80"><RotateCcw className="h-2.5 w-2.5" /> Actualisation classique</span>
        )}
        {cours.actualisation === "changements_notables" && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-400/80"><RotateCcw className="h-2.5 w-2.5" /> Changements notables</span>
        )}
        {cours.actualisation === "nouvelle_fiche" && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-green-500/10 border border-green-500/15 px-2 py-0.5 text-[9px] font-bold text-green-400/80"><RotateCcw className="h-2.5 w-2.5" /> Nouvelle fiche</span>
        )}

        {cours.visible ? (
          <span className="flex items-center rounded-lg bg-green-500/10 p-1.5 text-green-400/60"><Eye className="h-3 w-3" /></span>
        ) : (
          <span className="flex items-center rounded-lg bg-red-500/10 p-1.5 text-red-400/60"><EyeOff className="h-3 w-3" /></span>
        )}

        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
        {uploading ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[#C9A84C]" />
        ) : hasPdf ? (
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg bg-green-500/10 border border-green-500/15 px-2 py-1 text-[9px] font-bold text-green-400/70 hover:bg-green-500/20 transition-colors" title="Remplacer le PDF">
            <Check className="h-3 w-3" /> PDF
          </button>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg bg-orange-500/10 border border-orange-500/15 px-2 py-1 text-[9px] font-bold text-orange-400/70 hover:bg-orange-500/20 transition-colors">
            <Upload className="h-3 w-3" /> PDF
          </button>
        )}
      </div>

      {(onEdit || onDelete || onLink || onMoveToSection) && (
        <div className="relative z-10 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {onMoveToSection && availableSections && availableSections.length > 0 && (
            <div className="relative" ref={sectionMenuRef}>
              <button onClick={() => setShowSectionMenu(!showSectionMenu)} title="Section" className="rounded-lg p-1.5 text-white/20 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C] transition-colors"><Layers className="h-3.5 w-3.5" /></button>
              {showSectionMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-white/10 py-1 shadow-2xl backdrop-blur-xl" style={{ backgroundColor: "rgba(14,30,53,0.95)" }}>
                  {availableSections.map((s) => (
                    <button key={s} onClick={() => { onMoveToSection(s); setShowSectionMenu(false); }}
                      className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-white/5 transition-colors ${cours.etiquettes?.[0] === s ? "font-bold text-[#C9A84C]" : "text-white/60"}`}>
                      {s}{cours.etiquettes?.[0] === s ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onLink && <button onClick={onLink} title="Rattacher" className="rounded-lg p-1.5 text-white/20 hover:bg-purple-500/10 hover:text-purple-400 transition-colors"><Link2 className="h-3.5 w-3.5" /></button>}
          {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-white/20 hover:bg-white/8 hover:text-[#4fabdb] transition-colors"><Pencil className="h-3.5 w-3.5" /></button>}
          {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-white/20 hover:bg-red-500/10 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
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
            <button onClick={onDelete} className="rounded-lg p-1 text-white/50 hover:bg-red-500/15 hover:text-red-400 transition" style={{ background: "rgba(212,171,80,0.15)" }}>
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

function EmptyDossier({ onAdd, cloneSource, onClone }: {
  onAdd?: () => void;
  cloneSource?: { sourceDossier: Dossier; offerLabel: string };
  onClone?: (source: Dossier) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/8 py-16 text-center" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(201,168,76,0.03) 0%, transparent 60%)" }}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#C9A84C]/15 to-transparent mb-4">
        <Plus className="h-7 w-7 text-[#C9A84C]/40" />
      </div>
      <p className="text-sm font-semibold text-white/50">Dossier vide</p>
      <p className="mt-1 text-xs text-white/25">{onAdd ? "Ajoutez des sous-dossiers ou du contenu" : "Aucun contenu disponible"}</p>
      <div className="mt-5 flex flex-col items-center gap-2">
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-xl bg-[#C9A84C]/15 border border-[#C9A84C]/25 px-5 py-2.5 text-xs font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/25 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        )}
        {cloneSource && onClone && (
          <button
            onClick={() => onClone(cloneSource.sourceDossier)}
            className="flex items-center gap-1.5 rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/8 px-4 py-2 text-xs font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/15 transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            Importer depuis {cloneSource.offerLabel}
          </button>
        )}
      </div>
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
      <div className="rounded-xl bg-[#12314d]/5 px-3 py-2 text-xs text-[#4fabdb]/70">
        {selectedParent
          ? `Niveau parent: ${DOSSIER_TYPE_META[selectedParent.dossier_type]?.label ?? "Dossier"}`
          : "Racine métier de la plateforme"}
      </div>

      <FormField label="Nom *">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: PREPA PASS, Université Paris-Cité, S1, UE1 Chimie..." required className={inputCls} />
      </FormField>

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

      {nameSuggestions.length > 0 && (
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/8 px-3 py-2">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#C9A84C]/80">
            Suggestions de noms
          </p>
          <div className="flex flex-wrap gap-2">
            {nameSuggestions.flatMap((preset) => preset.suggestions).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setName(suggestion)}
                className="rounded-full border border-[#C9A84C]/20 bg-[#12314d] px-3 py-1 text-xs font-medium text-[#4fabdb] transition hover:border-[#C9A84C]/40 hover:bg-[#C9A84C]/15"
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
        <label className="mb-1.5 block text-xs font-medium text-white/80">Type</label>
        <div className="grid grid-cols-4 gap-2">
          {(["pdf", "video", "vimeo", "lien"] as const).map((t) => {
            const m = TYPE_META[t];
            return (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-medium transition ${type === t ? "border-[#4fabdb] bg-[#12314d]/5 text-[#4fabdb]" : "border-white/10 text-white/50 hover:border-white/15"}`}>
                <span className={type === t ? "text-[#4fabdb]" : m.color.split(" ")[0]}>{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {type === "pdf" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/80">Fichier PDF</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-white/10 p-3 transition hover:border-[#4fabdb]/30 hover:bg-white/5">
            <Upload className="h-4 w-4 text-white/40" />
            <span className="flex-1 text-sm text-white/60">{uploadProgress || (pdfUrl ? "PDF chargé" : "Cliquer pour uploader")}</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
          </label>
          {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-1 text-xs text-[#4fabdb] underline">Voir le PDF</a>}
          <div className="mt-2">
            <label className="mb-1 block text-xs text-white/50">Ou URL directe</label>
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

function CoursForm({ title, dossierId, initialData, existingSections, showActualisation, onSwitchToBulk, onSubmit, onClose, isPending }: {
  title: string;
  dossierId: string;
  initialData?: Partial<Cours>;
  existingSections?: string[];
  showActualisation?: boolean;
  onSwitchToBulk?: () => void;
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
  const [actualisation, setActualisation] = useState<string>(initialData?.actualisation ?? "non_actualisee");
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
    <FormShell title={title} onClose={onClose} onSubmit={() => {
      if (existingSections && etiquettes.length === 0) return;
      onSubmit({ name, description, pdf_url: pdfUrl, pdf_path: pdfPath, nb_pages: nbPages, visible, etiquettes, ...(showActualisation ? { actualisation } : {}) });
    }} isPending={isPending}>
      <FormField label="Nom du cours *">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Biochimie Structurale" required className={inputCls} />
      </FormField>
      <FormField label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description courte du cours..." className={inputCls} />
      </FormField>
      <FormField label={existingSections ? "Section *" : "Etiquettes"}>
        {existingSections ? (
          <select
            value={etiquettes[0] ?? ""}
            onChange={(e) => setEtiquettes(e.target.value ? [e.target.value] : [])}
            className={inputCls}
            required
          >
            <option value="">— Choisir une section —</option>
            {existingSections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <TagInput value={etiquettes} onChange={setEtiquettes} placeholder="Ex: Socle, Approfondissement..." />
        )}
      </FormField>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/80">Fiche PDF <span className="text-white/40 font-normal">(optionnel)</span></label>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 transition ${uploading ? "border-indigo-200 bg-indigo-50/40 cursor-wait" : "border-white/10 hover:border-indigo-300 hover:bg-indigo-50/30"}`}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : <Upload className="h-4 w-4 text-white/40" />}
          <span className="flex-1 text-sm text-white/60">{uploadProgress || (pdfUrl ? "PDF chargé" : "Uploader la fiche de cours")}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
        </label>
        {pdfUrl && !uploading && <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-1 text-xs text-[#4fabdb] underline">Voir le PDF</a>}
      </div>

      {/* Actualisation (only for PREPA formations) */}
      {showActualisation && (
        <FormField label="Actualisation">
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["non_actualisee", "Pas encore actualisée", "text-orange-400 bg-orange-500/10 border-orange-500/20"],
              ["aucun_changement", "Aucun changement", "text-white/60 bg-white/5 border-white/10"],
              ["actualisation", "Actualisation", "text-[#4fabdb] bg-[#4fabdb]/10 border-[#4fabdb]/20"],
              ["changements_notables", "Changements notables", "text-amber-400 bg-amber-500/10 border-amber-500/20"],
              ["nouvelle_fiche", "Nouvelle fiche", "text-green-400 bg-green-500/10 border-green-500/20"],
            ] as const).map(([val, label, colors]) => (
              <button
                key={val}
                type="button"
                onClick={() => setActualisation(val)}
                className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                  actualisation === val ? colors + " ring-1 ring-current/20" : "border-white/8 text-white/40 hover:border-white/10 hover:text-white/50"
                }`}
              >{label}</button>
            ))}
          </div>
        </FormField>
      )}

      {/* Switch to bulk/screenshot */}
      {onSwitchToBulk && !initialData?.id && (
        <button
          type="button"
          onClick={onSwitchToBulk}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-orange-500/20 bg-orange-500/10 py-2.5 text-xs font-medium text-orange-400 transition hover:bg-orange-500/20"
        >
          <ImagePlus className="h-4 w-4" /> Importer plusieurs cours par screenshot
        </button>
      )}

      {/* Visible */}
      <div
        className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition ${
          visible ? "border-green-500/20 bg-green-500/10" : "border-red-500/20 bg-red-500/10"
        }`}
        onClick={() => setVisible(!visible)}
      >
        <div className="flex items-center gap-2.5">
          {visible ? <Eye className="h-4 w-4 text-green-400" /> : <EyeOff className="h-4 w-4 text-red-400" />}
          <span className={`text-sm font-medium ${visible ? "text-green-400" : "text-red-500"}`}>
            {visible ? "Visible pour les étudiants" : "Masqué pour les étudiants"}
          </span>
        </div>
        <div className={`h-5 w-9 rounded-full transition-colors ${visible ? "bg-green-500/100" : "bg-white/25"}`}>
          <div className={`h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${visible ? "translate-x-4" : "translate-x-0.5"}`} />
        </div>
      </div>
    </FormShell>
  );
}

// =============================================
// ADD CATEGORY BUTTON
// =============================================

function LinkedCoursIndicator({ cours }: { cours: Cours }) {
  const [show, setShow] = useState(false);
  const [linkedOffers, setLinkedOffers] = useState<string[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (show) { setShow(false); return; }
    if (!linkedOffers && cours.linked_cours_id) {
      // Fetch linked courses to find their offer names
      try {
        const res = await fetch(`/api/linked-cours-offers?linkedId=${cours.linked_cours_id}&currentId=${cours.id}`);
        const data = await res.json();
        setLinkedOffers(data.offers ?? []);
      } catch {
        setLinkedOffers([]);
      }
    }
    setShow(true);
  };

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [show]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={handleClick}
        className="flex-shrink-0 rounded-full bg-[#4fabdb]/10 p-0.5 text-blue-400 hover:bg-[#4fabdb]/15 hover:text-[#4fabdb] transition"
        title="Cours lié — cliquer pour voir les détails"
      >
        <Link2 className="h-3 w-3" />
      </button>
      {show && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-xl border border-white/10 bg-[#12314d] p-3 shadow-lg">
          <p className="text-xs font-semibold text-white/90 mb-1.5">🔗 Cours lié</p>
          {linkedOffers === null ? (
            <Loader2 className="h-3 w-3 animate-spin text-white/40" />
          ) : linkedOffers.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] text-white/50">Également présent dans :</p>
              {linkedOffers.map((offer) => (
                <p key={offer} className="text-[11px] font-medium text-[#4fabdb]">• {offer}</p>
              ))}
              <p className="text-[10px] text-white/40 mt-2 pt-1.5 border-t border-white/8">Les modifications se répercutent automatiquement.</p>
            </div>
          ) : (
            <p className="text-[11px] text-white/40">Aucune autre offre liée</p>
          )}
        </div>
      )}
    </div>
  );
}

function MoveDossiersModal({ dossierIds, allDossiers, isPending, onMove, onClose }: {
  dossierIds: string[];
  allDossiers: Dossier[];
  isPending: boolean;
  onMove: (targetId: string) => void;
  onClose: () => void;
}) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const d of allDossiers) {
      if (d.dossier_type === "offer" || d.dossier_type === "sub_offer") set.add(d.id);
    }
    return set;
  });

  const excludeIds = new Set(dossierIds);
  const tree = buildTree(allDossiers, null);

  const renderNode = (node: DossierNode, depth: number): React.ReactNode => {
    if (excludeIds.has(node.id)) return null;
    const isSelected = node.id === selectedTarget;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const meta = DOSSIER_TYPE_META[node.dossier_type as keyof typeof DOSSIER_TYPE_META];

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition ${
            isSelected ? "bg-[#4fabdb]/15 ring-1 ring-blue-300" : "hover:bg-white/5"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setSelectedTarget(node.id)}
        >
          {hasChildren ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedIds((prev) => { const n = new Set(prev); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; }); }} className="flex-shrink-0 rounded p-0.5 hover:bg-white/15">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
            </button>
          ) : <span className="w-[18px] flex-shrink-0" />}
          <Folder className="h-4 w-4 flex-shrink-0 text-white/40" />
          <span className="flex-1 truncate">{node.name}</span>
          <span className="flex-shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-white/50">{meta?.shortLabel ?? node.dossier_type}</span>
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const pathLabel = selectedTarget ? getDossierPathLabel(selectedTarget, allDossiers) : null;

  return (
    <div className="rounded-2xl bg-[#12314d] shadow-2xl max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4fabdb]/15">
            <FolderOpen className="h-4 w-4 text-[#4fabdb]" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Déplacer {dossierIds.length} dossier{dossierIds.length > 1 ? "s" : ""}</h3>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8"><X className="h-4 w-4 text-white/50" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ maxHeight: "50vh" }}>
        {tree.map((node) => renderNode(node, 0))}
      </div>
      {pathLabel && (
        <div className="border-t border-white/8 px-5 py-2">
          <p className="text-xs text-white/50">Destination : <span className="font-medium text-[#4fabdb]">{pathLabel}</span></p>
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-white/8 px-5 py-4">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5">Annuler</button>
        <button
          onClick={() => selectedTarget && onMove(selectedTarget)}
          disabled={!selectedTarget || isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Déplacer ici
        </button>
      </div>
    </div>
  );
}

function AddCoursInlineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 py-2 text-xs font-medium text-white/40 transition hover:border-[#C9A84C]/30 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C]"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function AddCategoryButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onAdd(trimmed);
      setName("");
      setOpen(false);
    }
  };

  return (
    <div className="mt-3">
      {open ? (
        <div className="flex items-center gap-2">
          <div className="h-[2px] flex-1 bg-[#12314d]/10" />
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); setName(""); } }}
            onBlur={() => { setTimeout(() => { if (!name.trim()) setOpen(false); }, 200); }}
            placeholder="Nom de la catégorie..."
            className="rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/8 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#C9A84C] outline-none ring-2 ring-[#C9A84C]/20 w-44 text-center"
            autoFocus
          />
          <button onClick={submit} className="rounded-lg bg-[#12314d] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#12314d]/90 transition">OK</button>
          <button onClick={() => { setOpen(false); setName(""); }} className="text-[10px] text-white/40 hover:text-white/60">Annuler</button>
          <div className="h-[2px] flex-1 bg-[#12314d]/10" />
        </div>
      ) : (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="flex w-full items-center gap-2 group"
        >
          <div className="h-px flex-1 bg-[#12314d]/5 group-hover:bg-[#12314d]/10 transition" />
          <span className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#4fabdb]/15 px-3 py-1 text-[10px] font-semibold text-[#4fabdb]/30 transition group-hover:border-[#C9A84C]/30 group-hover:bg-[#C9A84C]/10 group-hover:text-[#C9A84C]">
            <Plus className="h-3 w-3" />
            Ajouter une catégorie
          </span>
          <div className="h-px flex-1 bg-[#12314d]/5 group-hover:bg-[#12314d]/10 transition" />
        </button>
      )}
    </div>
  );
}

// =============================================
// ETIQUETTE SECTION HEADER
// =============================================

function EtiquetteSectionHeader({ label, coursIds, canEdit, onRenamed, onDeleteSection, onMoveUp, onMoveDown }: {
  label: string;
  coursIds: string[];
  canEdit: boolean;
  onRenamed: () => void;
  onDeleteSection?: (mode: "remove_tag" | "delete_cours") => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [saving, startSaving] = useTransition();

  const commitRename = () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (!trimmed || trimmed === label) { setEditValue(label); return; }
    startSaving(async () => {
      await renameEtiquette(coursIds, label, trimmed);
      onRenamed();
    });
  };

  useEffect(() => {
    if (!showDeleteMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowDeleteMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDeleteMenu]);

  return (
    <div className="mt-5 mb-2 first:mt-0 group/section">
      <div className="flex items-center gap-3">
        <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-white/10" />
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setEditValue(label); } }}
            className="rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/8 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#C9A84C] outline-none ring-2 ring-[#C9A84C]/20 w-40 text-center"
            autoFocus
          />
        ) : label ? (
          <div className="relative flex items-center gap-1">
            <button
              onClick={canEdit ? () => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); } : undefined}
              className={`rounded-lg px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${canEdit ? "cursor-pointer hover:bg-[#C9A84C]/15" : ""}`}
              style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.15) 100%)", color: "#8B7030", border: "1px solid rgba(201,168,76,0.2)" }}
            >
              {saving ? "..." : label}
              <span className="ml-1.5 text-[9px] font-normal opacity-60">({coursIds.length})</span>
            </button>
            {canEdit && (onMoveUp || onMoveDown || onDeleteSection) && (
              <div className="relative flex items-center gap-0.5" ref={menuRef}>
                {onMoveUp && (
                  <button onClick={onMoveUp} className="rounded-md p-1 text-[#4fabdb]/20 opacity-0 group-hover/section:opacity-100 hover:bg-[#4fabdb]/15 hover:text-blue-500 transition" title="Monter">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                )}
                {onMoveDown && (
                  <button onClick={onMoveDown} className="rounded-md p-1 text-[#4fabdb]/20 opacity-0 group-hover/section:opacity-100 hover:bg-[#4fabdb]/15 hover:text-blue-500 transition" title="Descendre">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                )}
                {onDeleteSection && <button
                  onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                  className="rounded-md p-1 text-[#4fabdb]/20 opacity-0 group-hover/section:opacity-100 hover:bg-red-500/15 hover:text-red-400 transition"
                >
                  <Trash2 className="h-3 w-3" />
                </button>}
                {showDeleteMenu && onDeleteSection && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-xl border border-white/10 bg-[#12314d] py-1 shadow-lg">
                    <button
                      onClick={() => { setShowDeleteMenu(false); onDeleteSection("remove_tag"); }}
                      className="w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5 transition"
                    >
                      <span className="font-semibold">Retirer l'étiquette</span>
                      <span className="block text-[10px] text-white/40">Les cours restent, sans catégorie</span>
                    </button>
                    <button
                      onClick={() => { setShowDeleteMenu(false); onDeleteSection("delete_cours"); }}
                      className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/15 transition"
                    >
                      <span className="font-semibold">Supprimer les {coursIds.length} cours</span>
                      <span className="block text-[10px] text-red-400">Suppression définitive</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#4fabdb]/30">Autres</span>
        )}
        <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent via-white/10 to-white/10" />
      </div>
    </div>
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
      <label className="mb-1.5 block text-xs font-medium text-white/80">Icône</label>
      {value && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <img src={value} alt="" className="h-5 w-5 object-contain" />
          <span className="flex-1 text-xs text-white/50">Icône sélectionnée</span>
          <button type="button" onClick={() => onChange("")} className="text-xs text-red-500 hover:text-red-700">Retirer</button>
        </div>
      )}
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Ex: biology, law, book..." className={inputCls} />
        <button type="button" onClick={search} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/15 disabled:opacity-50 whitespace-nowrap">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Chercher
        </button>
      </div>
      {searched && !loading && icons.length === 0 && <p className="mt-1.5 text-xs text-white/40">Aucun résultat.</p>}
      {icons.length > 0 && (
        <div className="mt-2 grid grid-cols-8 gap-1 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
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

// =============================================
// GLOBAL SETTINGS PANEL
// =============================================

function GlobalSettingsPanel({ allDossiers, onSaved, onClose }: {
  allDossiers: Dossier[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const universities = useMemo(
    () => allDossiers.filter((d) => d.dossier_type === "university"),
    [allDossiers],
  );
  const [selectedUniId, setSelectedUniId] = useState<string | null>(
    universities.length > 0 ? universities[0].id : null,
  );

  const selectedUni = universities.find((u) => u.id === selectedUniId) ?? null;

  // Find parent offer name for each university
  const getOfferName = useCallback((uni: Dossier) => {
    let cur: string | null = uni.parent_id;
    while (cur) {
      const p = allDossiers.find((d) => d.id === cur);
      if (!p) break;
      if (p.dossier_type === "offer") return p.name;
      cur = p.parent_id;
    }
    return "";
  }, [allDossiers]);

  // Group universities by name
  const uniByName = useMemo(() => {
    const map = new Map<string, Dossier[]>();
    for (const u of universities) {
      const arr = map.get(u.name) ?? [];
      arr.push(u);
      map.set(u.name, arr);
    }
    return [...map.entries()];
  }, [universities]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100">
            <Settings className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#4fabdb]">Paramétrage</h2>
            <p className="text-xs text-white/50">Règles de liaison par université et formation</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-white/40 hover:bg-white/8 hover:text-white/60 transition">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: University list */}
        <div className="w-64 flex-shrink-0 border-r border-white/8 overflow-y-auto bg-white/5 p-3">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/40 px-2">Universités</p>
          <div className="space-y-1">
            {uniByName.map(([name, unis]) => (
              <button
                key={unis[0].id}
                onClick={() => setSelectedUniId(unis[0].id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                  selectedUniId && unis.some((u) => u.id === selectedUniId)
                    ? "bg-purple-100 text-purple-800 ring-1 ring-purple-200"
                    : "text-white/80 hover:bg-white/8"
                }`}
              >
                <p className="text-sm font-semibold truncate">{name}</p>
                <p className="text-[10px] text-white/40 truncate">{unis.map((u) => getOfferName(u)).filter(Boolean).join(", ")}</p>
              </button>
            ))}
          </div>
          {universities.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-white/40">
              Aucune université trouvée
            </p>
          )}
        </div>

        {/* Right: Settings for selected university */}
        <div className="flex-1 overflow-y-auto p-5">
          {selectedUni ? (
            <UniversitySettingsTab
              university={selectedUni}
              allDossiers={allDossiers}
              onSaved={onSaved}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-white/40">
              Sélectionnez une université
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================
// UNIVERSITY SETTINGS TAB
// =============================================

function UniversitySettingsTab({ university, allDossiers, onSaved }: { university: Dossier; allDossiers: Dossier[]; onSaved: () => void }) {
  const [linkRules, setLinkRules] = useState<{ sections: Record<string, string[]> }>(
    (university.link_rules as any) ?? { sections: {} }
  );
  const [availableOffers, setAvailableOffers] = useState<{ code: string; label: string; offerId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [togglingOffer, setTogglingOffer] = useState<string | null>(null);

  // All offers in the system
  const allOffers = useMemo(() => allDossiers.filter((d) => d.dossier_type === "offer"), [allDossiers]);

  // Which offers currently contain this university (by name)
  const offersWithThisUni = useMemo(() => {
    const unis = allDossiers.filter((d) => d.dossier_type === "university" && d.name === university.name);
    const result: { offerId: string; offerName: string; uniDossierId: string }[] = [];
    for (const u of unis) {
      let cur: string | null = u.parent_id;
      while (cur) {
        const p = allDossiers.find((d) => d.id === cur);
        if (!p) break;
        if (p.dossier_type === "offer") {
          result.push({ offerId: p.id, offerName: p.name, uniDossierId: u.id });
          break;
        }
        cur = p.parent_id;
      }
    }
    return result;
  }, [allDossiers, university.name]);

  const handleToggleOfferForUni = async (offer: Dossier) => {
    setTogglingOffer(offer.id);
    const existing = offersWithThisUni.find((o) => o.offerId === offer.id);
    if (existing) {
      const result = await removeUniversityFromOffer(existing.uniDossierId);
      if (result.error) alert(result.error);
    } else {
      const result = await addUniversityToOffer(university.name, offer.id, university.link_rules);
      if (result.error) alert(result.error);
    }
    setTogglingOffer(null);
    onSaved();
  };

  useEffect(() => {
    getOffersForUniversity(university.name).then((offers) => {
      setAvailableOffers(offers);
      setLoading(false);
    });
  }, [university.name]);

  // Reset when university changes
  useEffect(() => {
    setLinkRules((university.link_rules as any) ?? { sections: {} });
  }, [university.id, university.link_rules]);

  const sectionNames = Object.keys(linkRules.sections);

  const toggleOffer = (section: string, offerCode: string) => {
    setLinkRules((prev) => {
      const current = prev.sections[section] ?? [];
      const updated = current.includes(offerCode)
        ? current.filter((c) => c !== offerCode)
        : [...current, offerCode];
      return { sections: { ...prev.sections, [section]: updated } };
    });
  };

  const addSection = () => {
    const trimmed = newSectionName.trim();
    if (!trimmed || linkRules.sections[trimmed]) return;
    setLinkRules((prev) => ({ sections: { ...prev.sections, [trimmed]: [] } }));
    setNewSectionName("");
  };

  const removeSection = (name: string) => {
    setLinkRules((prev) => {
      const { [name]: _, ...rest } = prev.sections;
      return { sections: rest };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await updateUniversityLinkRules(
      university.id,
      sectionNames.length > 0 ? linkRules : null,
    );
    setSaving(false);
    if (result.error) alert(result.error);
    else onSaved();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-[#4fabdb]">Paramétrage — {university.name}</h3>
        <p className="mt-1 text-sm text-white/50">
          Configurez les sections de cours et leurs règles de liaison entre offres.
        </p>
      </div>

      {/* Offres rattachées */}
      <div className="mb-6 rounded-xl border border-white/10 bg-[#12314d] p-4">
        <h4 className="text-sm font-bold text-white/90 mb-3">Offres rattachées</h4>
        <div className="space-y-1.5">
          {allOffers.map((offer) => {
            const isAttached = offersWithThisUni.some((o) => o.offerId === offer.id);
            const isToggling = togglingOffer === offer.id;
            return (
              <label key={offer.id} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAttached}
                  disabled={isToggling}
                  onChange={() => handleToggleOfferForUni(offer)}
                  className="h-3.5 w-3.5 rounded border-white/15 text-purple-400 accent-purple-600"
                />
                <span className={`text-sm ${isAttached ? "text-white/90 font-medium" : "text-white/50"}`}>
                  {offer.name}
                </span>
                {isToggling && <Loader2 className="h-3 w-3 animate-spin text-white/40" />}
              </label>
            );
          })}
        </div>
      </div>

      {availableOffers.length === 0 ? (
        <div className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/50">
          Cette université n&apos;apparaît dans aucune offre.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-medium text-white/50">
            Offres contenant &quot;{university.name}&quot; : {availableOffers.map((o) => o.label).join(", ")}
          </p>

          {sectionNames.map((section) => (
            <div key={section} className="rounded-xl border border-white/10 bg-[#12314d] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white/90">{section}</h4>
                <button
                  onClick={() => removeSection(section)}
                  className="rounded-lg p-1 text-white/40 hover:bg-red-500/15 hover:text-red-400 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mb-2 text-[11px] text-white/40">
                Un cours &quot;{section}&quot; sera automatiquement lié dans :
              </p>
              <div className="space-y-1.5">
                {availableOffers.map((offer) => (
                  <label key={offer.code} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(linkRules.sections[section] ?? []).includes(offer.code)}
                      onChange={() => toggleOffer(section, offer.code)}
                      className="h-3.5 w-3.5 rounded border-white/15 text-purple-400 accent-purple-600"
                    />
                    <span className="text-sm text-white/80">{offer.label}</span>
                  </label>
                ))}
              </div>
              {(linkRules.sections[section] ?? []).length === 0 && (
                <p className="mt-2 text-[11px] text-white/40 italic">
                  Aucune offre cochée → cours local uniquement (pas de liaison)
                </p>
              )}
            </div>
          ))}

          <div className="flex items-center gap-2">
            <input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSection(); }}
              placeholder="Nouvelle section..."
              className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
            />
            <button
              onClick={addSection}
              disabled={!newSectionName.trim()}
              className="rounded-lg bg-purple-100 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-200 transition disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-[#12314d] py-2.5 text-sm font-semibold text-white hover:bg-[#12314d]/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Sauvegarder
          </button>

          {/* Récap matières et sections */}
          {sectionNames.length > 0 && (
            <SubjectSectionsSummary universityName={university.name} sectionNames={sectionNames} offersWithThisUni={offersWithThisUni} />
          )}
        </div>
      )}
    </div>
  );
}

function SubjectSectionsSummary({ universityName, sectionNames: rawSectionNames, offersWithThisUni }: {
  universityName: string;
  sectionNames: string[];
  offersWithThisUni: { offerId: string; offerName: string; uniDossierId: string }[];
}) {
  const sectionNames = [...rawSectionNames].sort((a, b) => (SECTION_ORDER[a] ?? 99) - (SECTION_ORDER[b] ?? 99));
  const [data, setData] = useState<{ subjectName: string; offerName: string; offerCode: string; sections: string[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUniversitySubjectsSummary(universityName).then((res) => {
      setData(res);
      setLoading(false);
    });
  }, [universityName]);

  // Group by subject name
  const subjects = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    for (const row of data) {
      if (!map.has(row.subjectName)) map.set(row.subjectName, new Map());
      map.get(row.subjectName)!.set(row.offerName, row.sections);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const OFFER_ORDER: Record<string, number> = { "PREPA PASS": 0, "PREPA LAS": 1, "PREPA LSPS": 2 };
  const offerNames = [...offersWithThisUni].sort((a, b) => (OFFER_ORDER[a.offerName] ?? 99) - (OFFER_ORDER[b.offerName] ?? 99)).map((o) => o.offerName);

  if (loading) {
    return <div className="mt-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>;
  }

  if (subjects.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="text-sm font-bold text-white/90 mb-3">Vue d&apos;ensemble des matières</h4>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="text-left px-3 py-2.5 font-semibold text-white/60 sticky left-0 bg-white/5">Matière</th>
              {offerNames.map((name) => (
                <th key={name} className="text-center px-2 py-2.5 font-semibold text-white/60 whitespace-nowrap">{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map(([subjectName, offerMap]) => (
              <tr key={subjectName} className="border-b border-white/8 hover:bg-white/5">
                <td className="px-3 py-2 font-medium text-white/90 sticky left-0 bg-[#12314d] whitespace-nowrap">{subjectName}</td>
                {offerNames.map((offerName) => {
                  const sections = offerMap.get(offerName) ?? [];
                  return (
                    <td key={offerName} className="px-2 py-2 text-center">
                      {sections.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-1">
                          {sectionNames.map((s) => (
                            <span
                              key={s}
                              className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                sections.includes(s)
                                  ? s === "Socle"
                                    ? "bg-[#4fabdb]/15 text-[#4fabdb]"
                                    : s === "Approfondissement"
                                      ? "bg-amber-100 text-amber-700"
                                      : s === "Perfectionnement"
                                        ? "bg-purple-100 text-purple-700"
                                        : "bg-white/8 text-white/60"
                                  : "bg-white/5 text-white/25"
                              }`}
                            >
                              {s.substring(0, 4).toUpperCase()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-white/40">
        {sectionNames.map((s, i) => (
          <span key={s}>
            <span className={`font-bold ${s === "Socle" ? "text-[#4fabdb]" : s === "Approfondissement" ? "text-amber-400" : s === "Perfectionnement" ? "text-purple-400" : "text-white/50"}`}>
              {s.substring(0, 4).toUpperCase()}
            </span>
            {" = " + s}
            {i < sectionNames.length - 1 ? " · " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

// =============================================
// MISSING COURS MODAL (cours manquants depuis les autres offres)
// =============================================

function MissingCoursModal({
  dossierId,
  isPending,
  onImport,
  onClose,
}: {
  dossierId: string;
  isPending: boolean;
  onImport: (coursIds: string[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<{ id: string; name: string; offerName: string; hasPdf: boolean; etiquettes: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getMissingCoursFromOtherOffers(dossierId).then((res) => {
      setItems(res.items);
      setLoading(false);
    });
  }, [dossierId]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === items.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(items.map((i) => i.id)));
  };

  // Group by offer
  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const arr = map.get(item.offerName) ?? [];
      arr.push(item);
      map.set(item.offerName, arr);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="rounded-2xl bg-[#12314d] shadow-2xl max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cours des autres offres</h3>
            <p className="text-xs text-white/50">Cours que vous n&apos;avez pas encore ici</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8">
          <X className="h-4 w-4 text-white/50" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: "55vh" }}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <Check className="mx-auto h-8 w-8 text-green-400" />
            <p className="mt-2 text-sm font-medium text-white/80">Tout est synchronisé</p>
            <p className="text-xs text-white/40">
              Tous les cours des autres offres sont déjà présents ici.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-white/50">{items.length} cours manquant{items.length > 1 ? "s" : ""}</p>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[10px] font-medium text-purple-400 hover:text-purple-800 underline"
              >{checkedIds.size === items.length ? "Tout désélectionner" : "Tout sélectionner"}</button>
            </div>
            {grouped.map(([offerName, offerItems]) => (
              <div key={offerName}>
                <div className="mb-2 flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-[#4fabdb]/50" />
                  <span className="text-xs font-bold text-[#4fabdb]/60">{offerName}</span>
                  <span className="h-px flex-1 bg-white/8" />
                </div>
                <div className="space-y-1.5">
                  {offerItems.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 transition cursor-pointer ${
                        checkedIds.has(item.id)
                          ? "border-purple-300 bg-purple-500/10"
                          : "border-white/8 hover:border-white/10 hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedIds.has(item.id)}
                        onChange={() => toggleCheck(item.id)}
                        className="h-3.5 w-3.5 rounded border-white/15 text-purple-400 accent-purple-600"
                      />
                      <span className="flex-1 truncate text-sm text-white/90">{item.name}</span>
                      {item.etiquettes?.length > 0 && (
                        <span className="rounded-full bg-[#C9A84C]/15 px-2 py-0.5 text-[10px] font-medium text-[#C9A84C]">
                          {item.etiquettes[0]}
                        </span>
                      )}
                      {item.hasPdf && (
                        <span className="rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">PDF</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
          <span className="text-xs text-white/50">
            {checkedIds.size > 0
              ? `${checkedIds.size} cours sélectionné${checkedIds.size > 1 ? "s" : ""}`
              : "Aucune sélection"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5"
            >Annuler</button>
            <button
              onClick={() => checkedIds.size > 0 && onImport([...checkedIds])}
              disabled={checkedIds.size === 0 || isPending}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Importer ici
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// RATTACHER COURS MODAL
// =============================================

function RattacherCoursModal({
  coursIds,
  sourceDossierId,
  allDossiers,
  isPending,
  onConfirm,
  onClose,
}: {
  coursIds: string[];
  sourceDossierId: string;
  allDossiers: Dossier[];
  isPending: boolean;
  onConfirm: (targetDossierIds: string[]) => void;
  onClose: () => void;
}) {
  const [checkedTargets, setCheckedTargets] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(allDossiers.map((d) => [d.id, d])), [allDossiers]);

  // Walk up from source dossier to find subject name, university name, and offer ID
  const { sourceSubjectName, sourceUniversityName, sourceOfferId } = useMemo(() => {
    let subjectName: string | null = null;
    let uniName: string | null = null;
    let offerId: string | null = null;
    // The sourceDossierId IS the subject dossier
    const sourceDossier = byId.get(sourceDossierId);
    if (sourceDossier?.dossier_type === "subject") subjectName = sourceDossier.name;
    let cur: string | null = sourceDossierId;
    while (cur) {
      const d = byId.get(cur);
      if (!d) break;
      if (d.dossier_type === "subject" && !subjectName) subjectName = d.name;
      if (d.dossier_type === "university" && !uniName) uniName = d.name;
      if (d.dossier_type === "offer") { offerId = d.id; break; }
      cur = d.parent_id;
    }
    return { sourceSubjectName: subjectName, sourceUniversityName: uniName, sourceOfferId: offerId };
  }, [sourceDossierId, byId]);

  // Find matching subject dossiers: same university name + same subject name, in other offers
  const targetSubjects = useMemo(() => {
    const results: { id: string; offerName: string; path: string }[] = [];
    if (!sourceUniversityName || !sourceSubjectName) return results;

    // Find all subject dossiers with the same name
    const candidateSubjects = allDossiers.filter(
      (d) => d.dossier_type === "subject" && d.name === sourceSubjectName && d.id !== sourceDossierId
    );

    for (const subj of candidateSubjects) {
      // Walk up to find university and offer
      let uniName: string | null = null;
      let offerName: string | null = null;
      let isInSameOffer = false;
      let cur: string | null = subj.parent_id;
      while (cur) {
        const p = byId.get(cur);
        if (!p) break;
        if (p.dossier_type === "university" && !uniName) uniName = p.name;
        if (p.dossier_type === "offer") {
          offerName = p.name;
          if (p.id === sourceOfferId) isInSameOffer = true;
          break;
        }
        cur = p.parent_id;
      }
      // Only include if same university, different offer
      if (uniName === sourceUniversityName && !isInSameOffer && offerName) {
        results.push({
          id: subj.id,
          offerName,
          path: getDossierPathLabel(subj.id, allDossiers),
        });
      }
    }
    return results;
  }, [allDossiers, byId, sourceSubjectName, sourceUniversityName, sourceOfferId, sourceDossierId]);

  const toggleCheck = (id: string) => {
    setCheckedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedTargets.size === targetSubjects.length) {
      setCheckedTargets(new Set());
    } else {
      setCheckedTargets(new Set(targetSubjects.map((t) => t.id)));
    }
  };

  return (
    <div className="rounded-2xl bg-[#12314d] shadow-2xl max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
            <Link2 className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Rattacher {coursIds.length} cours
            </h3>
            <p className="text-xs text-white/50">
              {sourceSubjectName ?? "Matière"} — {sourceUniversityName ?? ""}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8">
          <X className="h-4 w-4 text-white/50" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: "50vh" }}>
        {targetSubjects.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-white/50">
                Sélectionnez les offres cibles
              </p>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[10px] font-medium text-purple-400 hover:text-purple-800 underline"
              >{checkedTargets.size === targetSubjects.length ? "Tout désélectionner" : "Tout sélectionner"}</button>
            </div>
            {targetSubjects.map((target) => (
              <label
                key={target.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition cursor-pointer ${
                  checkedTargets.has(target.id)
                    ? "border-purple-300 bg-purple-500/10 ring-1 ring-purple-200"
                    : "border-white/8 hover:border-white/10 hover:bg-white/5"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedTargets.has(target.id)}
                  onChange={() => toggleCheck(target.id)}
                  className="h-4 w-4 rounded border-white/15 text-purple-400 accent-purple-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/90">{target.offerName}</p>
                  <p className="text-xs text-white/50 truncate">{target.path}</p>
                </div>
                <Layers className="h-4 w-4 flex-shrink-0 text-white/25" />
              </label>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-white/25" />
            <p className="mt-2 text-sm text-white/50">
              Aucune matière &quot;{sourceSubjectName}&quot; trouvée
            </p>
            <p className="text-xs text-white/40">
              dans {sourceUniversityName} pour les autres offres
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
        <span className="text-xs text-white/50">
          {checkedTargets.size > 0
            ? `${checkedTargets.size} offre${checkedTargets.size > 1 ? "s" : ""} sélectionnée${checkedTargets.size > 1 ? "s" : ""}`
            : "Aucune sélection"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5"
          >Annuler</button>
          <button
            onClick={() => checkedTargets.size > 0 && onConfirm([...checkedTargets])}
            disabled={checkedTargets.size === 0 || isPending}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Rattacher
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalOverlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 w-full ${wide ? "max-w-2xl" : "max-w-lg"}`}>{children}</div>
    </div>
  );
}

function FormShell({ title, children, onClose, onSubmit, isPending }: {
  title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; isPending: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#12314d] shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sticky top-0 bg-[#12314d] z-10">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/8">
          <X className="h-4 w-4 text-white/50" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5">Annuler</button>
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
      <label className="mb-1.5 block text-xs font-medium text-white/80">{label}</label>
      {children}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white/80">Couleur</label>
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
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {value ? <Eye className="h-4 w-4 text-green-400" /> : <EyeOff className="h-4 w-4 text-white/40" />}
        <span className="text-xs font-medium text-white/80">Visible aux étudiants</span>
      </div>
      <button type="button" onClick={() => onChange(!value)} className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-green-500/100" : "bg-white/25"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-white/90 placeholder:text-white/40 focus:border-[#0e1e35] focus:outline-none focus:ring-1 focus:ring-[#0e1e35]/20";

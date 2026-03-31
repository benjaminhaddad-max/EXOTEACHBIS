"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, FolderOpen,
  Home, BookOpen, Layers, ArrowRight, Search, GraduationCap, MessageCircleQuestion,
} from "lucide-react";
import type { Dossier, Cours, Matiere } from "@/types/database";
import { ExercicesShell } from "@/components/eleve/exercices-shell";
import { MatiereExercicesView, type SerieSummaryForStudent } from "@/components/eleve/matiere-exercices-view";
import { AskQuestionDrawer } from "@/components/qa/ask-question-drawer";
import type { DossierNode as ExerciceDossierNode, CoursNode as ExerciceCoursNode } from "@/app/(eleve)/exercices/actions";

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

function getBreadcrumb(id: string | null, allDossiers: Dossier[]): Dossier[] {
  if (!id) return [];
  const d = allDossiers.find((x) => x.id === id);
  if (!d) return [];
  return [...getBreadcrumb(d.parent_id, allDossiers), d];
}

function findExerciceNodeById(nodes: ExerciceDossierNode[], id: string): ExerciceDossierNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findExerciceNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function collectExerciceCoursIds(nodes: ExerciceDossierNode[]): string[] {
  const ids: string[] = [];
  const walk = (node: ExerciceDossierNode) => {
    ids.push(...node.cours.map((cours) => cours.id));
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

function isUniversityLikeDossier(dossier: Dossier): boolean {
  if (dossier.dossier_type === "university") return true;
  const name = dossier.name.toLowerCase();
  return (
    name.includes("universit") ||
    name.includes("facult") ||
    name.includes("paris-cité") ||
    name.includes("paris cite") ||
    name.includes("paris-nord") ||
    name.includes("sorbonne")
  );
}

function getDefaultStudentDossier(dossiers: Dossier[]): Dossier | null {
  const roots = dossiers.filter((d) => d.parent_id === null).sort((a, b) => a.order_index - b.order_index);
  if (roots.length !== 1) return roots[0] ?? null;

  // Walk down the tree as long as there is exactly 1 child — skip single-child levels
  let current = roots[0];
  while (true) {
    const children = dossiers
      .filter((d) => d.parent_id === current.id)
      .sort((a, b) => a.order_index - b.order_index);

    if (children.length === 1) {
      current = children[0];
    } else {
      return current;
    }
  }
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function EleveCoursShell({
  initialDossiers,
  initialMatieres,
  initialCours,
  initialFlashcardDecks,
  initialExerciceTree,
  initialExerciceCours,
  userId,
  initialSeries,
}: {
  initialDossiers: Dossier[];
  initialMatieres: Matiere[];
  initialCours: Cours[];
  initialFlashcardDecks: FlashcardDeck[];
  initialExerciceTree: ExerciceDossierNode[];
  initialExerciceCours: ExerciceCoursNode[];
  userId: string;
  initialSeries: SerieSummaryForStudent[];
}) {
  const router = useRouter();
  const [allDossiers] = useState<Dossier[]>(initialDossiers);
  const [allMatieres] = useState<Matiere[]>(initialMatieres);
  const [allCours] = useState<Cours[]>(initialCours);
  const [allFlashcardDecks] = useState<FlashcardDeck[]>(initialFlashcardDecks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coursList, setCoursList] = useState<Cours[]>([]);
  const [childDossiers, setChildDossiers] = useState<Dossier[]>([]);
  const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeck[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"cours" | "exercices" | "revisions" | "flashcards">("cours");
  const [qaDrawer, setQaDrawer] = useState<{
    contextType: "matiere" | "cours";
    dossierId?: string;
    matiereId?: string;
    coursId?: string;
    contextLabel?: string;
  } | null>(null);
  const rootDossiers = useMemo(
    () => allDossiers.filter((d) => d.parent_id === null).sort((a, b) => a.order_index - b.order_index),
    [allDossiers]
  );
  const selectedDossier = allDossiers.find((d) => d.id === selectedId) ?? null;
  const breadcrumb = getBreadcrumb(selectedId, allDossiers);
  const normalizedSearch = search.trim().toLowerCase();
  const matiereIdsByDossier = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const matiere of allMatieres) {
      const current = map.get(matiere.dossier_id) ?? [];
      current.push(matiere.id);
      map.set(matiere.dossier_id, current);
    }
    return map;
  }, [allMatieres]);

  const selectDossier = useCallback((dossier: Dossier) => {
    let target = dossier;

    // Auto-skip: if a dossier has exactly 1 child folder, drill into it directly
    while (true) {
      const children = allDossiers
        .filter((d) => d.parent_id === target.id)
        .sort((a, b) => a.order_index - b.order_index);

      if (children.length === 1) {
        target = children[0];
      } else {
        break;
      }
    }

    setSelectedId(target.id);
    setActiveTab("cours");
    const childDossiersForSelection = allDossiers
      .filter((candidate) => candidate.parent_id === target.id)
      .sort((a, b) => a.order_index - b.order_index);
    const matiereIds = matiereIdsByDossier.get(target.id) ?? [];
    const matiereIdSet = new Set(matiereIds);
    const uniqueCours = Array.from(
      new Map(
        allCours
          .filter((cours) => cours.dossier_id === target.id || (cours.matiere_id ? matiereIdSet.has(cours.matiere_id) : false))
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

  const filteredChildDossiers = useMemo(() => {
    if (!normalizedSearch) return childDossiers;
    return childDossiers.filter((child) => child.name.toLowerCase().includes(normalizedSearch));
  }, [childDossiers, normalizedSearch]);

  const filteredCoursList = useMemo(() => {
    if (!normalizedSearch) return coursList;
    return coursList.filter((cours) => cours.name.toLowerCase().includes(normalizedSearch));
  }, [coursList, normalizedSearch]);

  const filteredFlashcardDecks = useMemo(() => {
    if (!normalizedSearch) return flashcardDecks;
    return flashcardDecks.filter((deck) => {
      const haystack = `${deck.name} ${deck.description ?? ""} ${deck.matiere?.name ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [flashcardDecks, normalizedSearch]);

  const selectedExerciceRoots = useMemo(() => {
    if (!selectedDossier) return [];
    const node = findExerciceNodeById(initialExerciceTree, selectedDossier.id);
    return node ? [node] : [];
  }, [initialExerciceTree, selectedDossier]);

  const selectedExerciceCours = useMemo(() => {
    const ids = new Set(collectExerciceCoursIds(selectedExerciceRoots));
    return initialExerciceCours.filter((cours) => ids.has(cours.id));
  }, [initialExerciceCours, selectedExerciceRoots]);

  const exerciceQuestionCount = useMemo(
    () => selectedExerciceCours.reduce((sum, cours) => sum + cours.nb_questions, 0),
    [selectedExerciceCours]
  );
  const hasDirectLearningContent = useMemo(() => {
    if (!selectedDossier) return false;
    const directMatiereIds = matiereIdsByDossier.get(selectedDossier.id) ?? [];
    if (directMatiereIds.length > 0) return true;
    return allCours.some((cours) => cours.dossier_id === selectedDossier.id);
  }, [allCours, matiereIdsByDossier, selectedDossier]);

  useEffect(() => {
    if (selectedId) return;
    const preferred = getDefaultStudentDossier(allDossiers);
    if (!preferred) return;
    selectDossier(preferred);
  }, [allDossiers, selectedId, selectDossier]);

  // Count matières per child dossier for display
  const childMatiereCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const child of childDossiers) {
      const count = (matiereIdsByDossier.get(child.id) ?? []).length;
      // Also count sub-dossiers as navigable items
      const subDossierCount = allDossiers.filter((d) => d.parent_id === child.id).length;
      map.set(child.id, count || subDossierCount);
    }
    return map;
  }, [childDossiers, matiereIdsByDossier, allDossiers]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden bg-[#F4F6FA]">
        {selectedDossier ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
                {/* Hero header */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e1e35] via-[#142740] to-[#0e1e35] px-8 py-8">
                  <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#4FABDB]/10 blur-3xl" />
                  <div className="pointer-events-none absolute right-1/3 -bottom-20 h-40 w-40 rounded-full bg-[#C9A84C]/8 blur-3xl" />

                  <div className="relative">
                    {/* Ancestor pills */}
                    {breadcrumb.length > 1 && (
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        {breadcrumb.slice(0, -1).map((d) => (
                          <span
                            key={d.id}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-semibold tracking-wide text-white/70 backdrop-blur-sm"
                          >
                            {d.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Title row */}
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <h2 className="text-3xl font-extrabold tracking-tight text-white">
                          {selectedDossier.name}
                        </h2>
                        {selectedDossier.description && (
                          <p className="mt-1.5 text-sm text-white/50">{selectedDossier.description}</p>
                        )}
                        {(coursList.length > 0 || flashcardDecks.length > 0 || childDossiers.length > 0) && (
                          <div className="mt-3 flex items-center gap-3">
                            {childDossiers.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4FABDB]/15 px-3 py-1 text-xs font-semibold text-[#4FABDB]">
                                {childDossiers.length} {childDossiers.length > 1 ? "dossiers" : "dossier"}
                              </span>
                            )}
                            {coursList.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9A84C]/15 px-3 py-1 text-xs font-semibold text-[#C9A84C]">
                                {coursList.length} cours
                              </span>
                            )}
                            {flashcardDecks.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white/50">
                                {flashcardDecks.length} flashcards
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/10">
                        <GraduationCap size={26} className="text-[#C9A84C]" />
                      </div>
                    </div>

                    {/* Search bar */}
                    <div className="relative mt-6">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un cours, un chapitre ou une flashcard..."
                        className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#4FABDB]/40 focus:bg-white/10 focus:ring-2 focus:ring-[#4FABDB]/15"
                      />
                    </div>
                  </div>

                  {/* Tabs inside hero — only at matière level */}
                  {hasDirectLearningContent && childDossiers.length === 0 && (
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("cours")}
                        className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                          activeTab === "cours"
                            ? "bg-white text-[#0e1e35] shadow-sm"
                            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                        }`}
                      >
                        Cours
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("exercices")}
                        className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                          activeTab === "exercices"
                            ? "bg-white text-[#0e1e35] shadow-sm"
                            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                        }`}
                        disabled={selectedExerciceRoots.length === 0}
                      >
                        Exercices
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("revisions")}
                        className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                          activeTab === "revisions"
                            ? "bg-white text-[#0e1e35] shadow-sm"
                            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                        }`}
                      >
                        Révisions
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("flashcards")}
                        className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                          activeTab === "flashcards"
                            ? "bg-white text-[#0e1e35] shadow-sm"
                            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                        }`}
                      >
                        Flashcards
                      </button>
                    </div>
                  )}
                </div>

                {/* Child dossiers as proper cards */}
                {filteredChildDossiers.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredChildDossiers.map((child) => {
                      const itemCount = childMatiereCount.get(child.id) ?? 0;
                      return (
                        <div
                          key={child.id}
                          onClick={() => selectDossier(child)}
                          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(14,30,53,0.10)] hover:border-[#4FABDB]/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${child.color || "#4FABDB"}15` }}>
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: child.color || "#4FABDB" }} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const mat = allMatieres.find((m) => m.dossier_id === child.id);
                                  setQaDrawer({
                                    contextType: "matiere",
                                    dossierId: child.id,
                                    matiereId: mat?.id,
                                    contextLabel: child.name,
                                  });
                                }}
                                title="Poser une question"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#B0BACA] transition-all duration-200 hover:bg-[#4FABDB]/10 hover:text-[#4FABDB]"
                              >
                                <MessageCircleQuestion size={16} />
                              </button>
                              <ArrowRight size={16} className="mt-0.5 shrink-0 text-[#C0C8D4] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#4FABDB]" />
                            </div>
                          </div>
                          <h3 className="mt-3 text-[15px] font-semibold text-[#0e1e35]">{child.name}</h3>
                          {child.etiquettes?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {child.etiquettes.map((tag) => (
                                <span key={tag} className="inline-block rounded-full bg-[#4FABDB]/10 px-2 py-0.5 text-[10px] font-medium text-[#4FABDB]">{tag}</span>
                              ))}
                            </div>
                          )}
                          {child.description && (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8A98A9]">{child.description}</p>
                          )}
                          {itemCount > 0 && (
                            <p className="mt-2 text-[11px] font-medium text-[#4FABDB]">{itemCount} {itemCount > 1 ? "matières" : "matière"}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === "cours" && filteredCoursList.length > 0 && (
                  <div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {filteredCoursList.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => router.push(`/cours/${c.id}`)}
                          className="group cursor-pointer rounded-[24px] border border-[#DCE7F3] bg-white p-4 text-left shadow-[0_10px_30px_rgba(18,49,77,0.05)] transition hover:-translate-y-1 hover:border-[#4FABDB]/45 hover:shadow-[0_18px_40px_rgba(18,49,77,0.10)]"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4FABDB]/10 text-[#4FABDB]">
                              <BookOpen size={18} />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const mat = allMatieres.find((m) => m.id === c.matiere_id) ?? allMatieres.find((m) => m.dossier_id === c.dossier_id);
                                setQaDrawer({
                                  contextType: "cours",
                                  dossierId: c.dossier_id ?? undefined,
                                  matiereId: mat?.id ?? c.matiere_id ?? undefined,
                                  coursId: c.id,
                                  contextLabel: c.name,
                                });
                              }}
                              title="Poser une question"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#B0BACA] transition-all duration-200 hover:bg-[#4FABDB]/10 hover:text-[#4FABDB]"
                            >
                              <MessageCircleQuestion size={16} />
                            </button>
                          </div>
                          <h3 className="text-[15px] font-semibold leading-snug text-[#0e1e35]">{c.name}</h3>
                          <div className="mt-3 flex items-center justify-end">
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#D7E8F6] bg-[#F6FBFF] px-3 py-1 text-xs font-semibold text-[#4FABDB] transition-all duration-200 group-hover:translate-x-0.5 group-hover:border-[#4FABDB]/40 group-hover:bg-[#4FABDB] group-hover:text-white group-hover:shadow-[0_8px_18px_rgba(79,171,219,0.25)] group-active:scale-[0.97]">
                              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">Ouvrir</span>
                              <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


                {activeTab === "exercices" && selectedDossier && (() => {
                  const mIds = new Set(matiereIdsByDossier.get(selectedDossier.id) ?? []);
                  const cIds = new Set(coursList.map((c) => c.id));
                  const filtered = initialSeries.filter((s) =>
                    (s.matiere_id && mIds.has(s.matiere_id)) || (s.cours_id && cIds.has(s.cours_id))
                  );
                  return <MatiereExercicesView series={filtered} />;
                })()}

                {activeTab === "revisions" && selectedDossier && (() => {
                  const mIds = new Set(matiereIdsByDossier.get(selectedDossier.id) ?? []);
                  const cIds = new Set(coursList.map((c) => c.id));
                  const filtered = initialSeries.filter((s) =>
                    s.type === "revision" &&
                    ((s.matiere_id && mIds.has(s.matiere_id)) || (s.cours_id && cIds.has(s.cours_id)))
                  );
                  return <MatiereExercicesView series={filtered} />;
                })()}

                {activeTab === "flashcards" && (
                  filteredFlashcardDecks.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredFlashcardDecks.map((deck) => (
                        <button
                          key={deck.id}
                          onClick={() => router.push(`/cours/flashcards/${deck.id}`)}
                          className="group rounded-[24px] border border-[#D7E4F6] bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#4FABDB]/45 hover:shadow-[0_10px_30px_rgba(18,49,77,0.08)]"
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
                            <span className="rounded-full bg-[#F4F8FC] px-2.5 py-1 text-[11px] font-semibold text-[#0e1e35]">
                              {deck.nb_cards} carte{deck.nb_cards !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-[#0e1e35]">{deck.name}</h3>
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
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#D7E8F6] bg-[#F6FBFF] px-3 py-1 text-xs font-semibold text-[#2E6FA3] transition-all duration-200 group-hover:translate-x-0.5 group-hover:border-[#4FABDB]/40 group-hover:bg-[#EEF8FF] group-hover:text-[#0e1e35] group-hover:shadow-[0_8px_18px_rgba(79,171,219,0.18)] group-active:scale-[0.97]">
                              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">Réviser</span>
                              <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#D7E2EF] bg-white/70 py-16 text-center">
                      <Layers size={40} className="mb-3 text-[#D0D9E4]" />
                      <p className="text-sm font-medium text-[#7D8C9E]">Aucune flashcard disponible</p>
                      <p className="mt-1 text-xs text-[#A2AEBC]">Les flashcards seront ajoutées prochainement.</p>
                    </div>
                  )
                )}

                {activeTab === "cours" && filteredChildDossiers.length === 0 && filteredCoursList.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#D7E2EF] bg-white/70 py-16 text-center">
                    <FolderOpen size={40} className="mb-3 text-[#D0D9E4]" />
                    <p className="text-sm font-medium text-[#7D8C9E]">
                      {normalizedSearch ? "Aucun resultat pour cette recherche" : "Ce dossier est vide"}
                    </p>
                    <p className="mt-1 text-xs text-[#A2AEBC]">
                      {normalizedSearch ? "Essaie un autre mot-clé." : "Choisis un autre dossier pour continuer."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <FolderOpen size={48} className="mb-3 text-[#D5DDE8]" />
            <p className="text-sm font-medium text-[#7A8898]">Choisis une formation</p>
            <p className="mt-1 text-xs text-[#AAB4C0]">La navigation se fait ensuite directement avec les bulles.</p>
            {rootDossiers.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {rootDossiers.map((dossier) => (
                  <button
                    key={dossier.id}
                    type="button"
                    onClick={() => selectDossier(dossier)}
                    className="inline-flex items-center gap-2 rounded-full border border-[#DCE7F3] bg-white px-4 py-2 text-sm font-medium text-[#0e1e35] transition hover:-translate-y-0.5 hover:border-[#4FABDB]/40 hover:shadow-[0_10px_24px_rgba(18,49,77,0.08)]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: dossier.color || "#8FA2B7" }}
                    />
                    {dossier.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {qaDrawer && (
        <AskQuestionDrawer
          contextType={qaDrawer.contextType}
          dossierId={qaDrawer.dossierId}
          matiereId={qaDrawer.matiereId}
          coursId={qaDrawer.coursId}
          contextLabel={qaDrawer.contextLabel}
          onClose={() => setQaDrawer(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, Folder, FolderOpen,
  Home, BookOpen, Layers, ArrowRight, Search,
} from "lucide-react";
import type { Dossier, Cours, Matiere } from "@/types/database";
import { ExercicesShell } from "@/components/eleve/exercices-shell";
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

  let current = roots[0];
  if (isUniversityLikeDossier(current)) return current;

  while (true) {
    const children = dossiers
      .filter((d) => d.parent_id === current.id)
      .sort((a, b) => a.order_index - b.order_index);

    if (children.length !== 1) return current;
    if (isUniversityLikeDossier(children[0])) return children[0];
    current = children[0];
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
}: {
  initialDossiers: Dossier[];
  initialMatieres: Matiere[];
  initialCours: Cours[];
  initialFlashcardDecks: FlashcardDeck[];
  initialExerciceTree: ExerciceDossierNode[];
  initialExerciceCours: ExerciceCoursNode[];
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
  const [activeTab, setActiveTab] = useState<"cours" | "exercices">("cours");
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
    setSelectedId(dossier.id);
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#F9FBFE_0%,#FFFFFF_18%)]">
        {selectedDossier ? (
          <>
            <div className="border-b border-[#E8EDF5] px-5 py-3 text-xs text-[#8C98A8]">
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setSelectedId(null)} className="rounded-full bg-white p-1.5 shadow-sm ring-1 ring-[#E6EDF6]">
                  <Home size={12} />
                </button>
                {breadcrumb.map((d, i) => (
                  <span key={d.id} className="flex items-center gap-1.5">
                    <ChevronRight size={11} />
                    <button
                      onClick={() => selectDossier(d)}
                      className={`rounded-full px-2.5 py-1 transition-colors ${
                        i === breadcrumb.length - 1
                          ? "bg-[#12314D] text-white"
                          : "bg-white text-[#5F6F82] ring-1 ring-[#E6EDF6] hover:text-[#12314D]"
                      }`}
                    >
                      {d.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#E5EDF7] bg-white/95 p-5 shadow-[0_20px_50px_rgba(18,49,77,0.06)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF6FF] px-3 py-1 text-[11px] font-semibold text-[#2E6FA3]">
                        <Folder size={13} />
                        Dossier actif
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold tracking-tight text-[#12314D]">{selectedDossier.name}</h2>
                        <p className="mt-1 text-sm text-[#7B8A9A]">
                          Navigue rapidement avec les bulles ci-dessous ou recherche directement un cours.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-2xl bg-[#F7FAFD] px-4 py-3 ring-1 ring-[#E8EEF6]">
                        <div className="text-lg font-bold text-[#12314D]">{childDossiers.length}</div>
                        <div className="text-[11px] text-[#8A98A9]">Sous-dossiers</div>
                      </div>
                      <div className="rounded-2xl bg-[#F7FAFD] px-4 py-3 ring-1 ring-[#E8EEF6]">
                        <div className="text-lg font-bold text-[#12314D]">{coursList.length}</div>
                        <div className="text-[11px] text-[#8A98A9]">Cours</div>
                      </div>
                      <div className="rounded-2xl bg-[#F7FAFD] px-4 py-3 ring-1 ring-[#E8EEF6]">
                        <div className="text-lg font-bold text-[#12314D]">{flashcardDecks.length}</div>
                        <div className="text-[11px] text-[#8A98A9]">Flashcards</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AACBE]" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher un cours, un chapitre ou une flashcard..."
                      className="w-full rounded-2xl border border-[#DCE7F3] bg-[#F8FBFE] py-3 pl-11 pr-4 text-sm text-[#12314D] outline-none transition focus:border-[#4FABDB] focus:bg-white focus:ring-4 focus:ring-[#4FABDB]/10"
                    />
                  </div>

                  {filteredChildDossiers.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#90A0B2]">Navigation rapide</p>
                      <div className="flex flex-wrap gap-2.5">
                        {filteredChildDossiers.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => selectDossier(child)}
                            className="inline-flex items-center gap-2 rounded-full border border-[#DCE7F3] bg-white px-4 py-2 text-sm font-medium text-[#12314D] transition hover:-translate-y-0.5 hover:border-[#4FABDB]/40 hover:shadow-[0_10px_24px_rgba(18,49,77,0.08)]"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: child.color || "#8FA2B7" }}
                            />
                            {child.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("cours")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeTab === "cours"
                          ? "bg-[#12314D] text-white shadow-sm"
                          : "border border-[#DCE7F3] bg-white text-[#5F6F82] hover:text-[#12314D]"
                      }`}
                    >
                      Cours
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("exercices")}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeTab === "exercices"
                          ? "bg-[#12314D] text-white shadow-sm"
                          : "border border-[#DCE7F3] bg-white text-[#5F6F82] hover:text-[#12314D]"
                      }`}
                      disabled={selectedExerciceRoots.length === 0}
                    >
                      Exercices
                      {hasDirectLearningContent && exerciceQuestionCount > 0 ? ` · ${exerciceQuestionCount}` : ""}
                    </button>
                  </div>
                </div>

                {activeTab === "cours" && filteredCoursList.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#90A0B2]">Cours &amp; Exercices</p>
                      <span className="rounded-full bg-[#EEF6FF] px-3 py-1 text-[11px] font-semibold text-[#2E6FA3]">
                        {filteredCoursList.length} résultat{filteredCoursList.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {filteredCoursList.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => router.push(`/cours/${c.id}`)}
                          className="group rounded-[24px] border border-[#DCE7F3] bg-white p-4 text-left shadow-[0_10px_30px_rgba(18,49,77,0.05)] transition hover:-translate-y-1 hover:border-[#4FABDB]/45 hover:shadow-[0_18px_40px_rgba(18,49,77,0.10)]"
                        >
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF6FF] text-[#2E6FA3]">
                              <BookOpen size={18} />
                            </div>
                            <span className="rounded-full bg-[#F5F8FC] px-2.5 py-1 text-[11px] font-semibold text-[#63758A]">
                              {selectedDossier.name}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold leading-snug text-[#12314D]">{c.name}</h3>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <span className="text-xs text-[#8EA0B2]">Cours et exercices associes</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#D7E8F6] bg-[#F6FBFF] px-3 py-1 text-xs font-semibold text-[#2E6FA3] transition-all duration-200 group-hover:translate-x-0.5 group-hover:border-[#4FABDB]/40 group-hover:bg-[#EEF8FF] group-hover:text-[#12314D] group-hover:shadow-[0_8px_18px_rgba(79,171,219,0.18)] group-active:scale-[0.97]">
                              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">Ouvrir</span>
                              <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "cours" && filteredFlashcardDecks.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#90A0B2]">Flashcards</p>
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
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#D7E8F6] bg-[#F6FBFF] px-3 py-1 text-xs font-semibold text-[#2E6FA3] transition-all duration-200 group-hover:translate-x-0.5 group-hover:border-[#4FABDB]/40 group-hover:bg-[#EEF8FF] group-hover:text-[#12314D] group-hover:shadow-[0_8px_18px_rgba(79,171,219,0.18)] group-active:scale-[0.97]">
                              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">Réviser</span>
                              <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-1" />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "exercices" && selectedExerciceRoots.length > 0 && (
                  <div className="overflow-hidden rounded-[28px] border border-[#E5EDF7] bg-white shadow-[0_20px_50px_rgba(18,49,77,0.06)]">
                    <ExercicesShell tree={selectedExerciceRoots} allCours={selectedExerciceCours} />
                  </div>
                )}

                {activeTab === "exercices" && selectedExerciceRoots.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#D7E2EF] bg-white/70 py-16 text-center">
                    <Layers size={40} className="mb-3 text-[#D0D9E4]" />
                    <p className="text-sm font-medium text-[#7D8C9E]">Aucun exercice disponible à cette échelle</p>
                    <p className="mt-1 text-xs text-[#A2AEBC]">Descends dans une matière ou un chapitre pour t’entraîner.</p>
                  </div>
                )}

                {activeTab === "cours" && filteredChildDossiers.length === 0 && filteredCoursList.length === 0 && filteredFlashcardDecks.length === 0 && (
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
                    className="inline-flex items-center gap-2 rounded-full border border-[#DCE7F3] bg-white px-4 py-2 text-sm font-medium text-[#12314D] transition hover:-translate-y-0.5 hover:border-[#4FABDB]/40 hover:shadow-[0_10px_24px_rgba(18,49,77,0.08)]"
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
    </div>
  );
}

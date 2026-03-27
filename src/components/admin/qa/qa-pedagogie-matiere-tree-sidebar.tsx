"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Building2,
  Calendar,
  BookOpen,
  Layers,
  Check,
  Folder,
} from "lucide-react";
import { buildQaPedagogieChildrenMap } from "@/lib/qa-pedagogie-tree";
import type { Dossier, DossierType, Matiere } from "@/types/database";

function collectMatiereIdsInSubtree(
  rootId: string,
  childrenByParent: Map<string | null, Dossier[]>,
  matieresByDossier: Map<string, Matiere[]>,
): string[] {
  const matiereIds: string[] = [];
  const walk = (did: string) => {
    for (const mat of matieresByDossier.get(did) ?? []) matiereIds.push(mat.id);
    for (const ch of childrenByParent.get(did) ?? []) walk(ch.id);
  };
  walk(rootId);
  return matiereIds;
}

function DossierTypeIcon({ type, className }: { type: DossierType; className?: string }) {
  const cn = className ?? "w-3 h-3 shrink-0 text-gray-500";
  switch (type) {
    case "offer":
      return <GraduationCap className={cn} />;
    case "university":
      return <Building2 className={cn} />;
    case "semester":
    case "period":
      return <Calendar className={cn} />;
    case "subject":
      return <BookOpen className={cn} />;
    case "option":
    case "module":
      return <Layers className={cn} />;
    default:
      return <Folder className={cn} />;
  }
}

function ChkLight({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <div
      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
        checked ? "bg-blue-600 border-blue-600" : partial ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"
      }`}
    >
      {checked && <Check size={9} className="text-white" strokeWidth={3} />}
      {!checked && partial && <div className="w-1.5 h-1.5 rounded-sm bg-blue-500" />}
    </div>
  );
}

function MatiereBranch({
  matiere,
  depth,
  selectedMatiereIds,
  onToggleMatiere,
  threadCountByMatiereId,
}: {
  matiere: Matiere;
  depth: number;
  selectedMatiereIds: Set<string>;
  onToggleMatiere: (id: string) => void;
  threadCountByMatiereId: Record<string, number>;
}) {
  const cnt = threadCountByMatiereId[matiere.id] ?? 0;
  const isOn = selectedMatiereIds.has(matiere.id);
  const pad = depth * 10 + 36;

  return (
    <div
      className="flex items-center gap-0.5 py-0.5 rounded-md hover:bg-gray-50"
      style={{ paddingLeft: pad }}
    >
      <span className="w-5 shrink-0" />
      <button type="button" className="p-0.5 shrink-0" onClick={() => onToggleMatiere(matiere.id)}>
        <ChkLight checked={isOn} />
      </button>
      <button
        type="button"
        className="flex-1 min-w-0 flex items-center gap-1.5 py-1 pr-1 text-left"
        onClick={() => onToggleMatiere(matiere.id)}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: matiere.color }} />
        <BookOpen size={11} className="shrink-0 text-blue-700/70" />
        <span className={`flex-1 text-[10px] font-medium truncate ${isOn ? "text-blue-950" : "text-gray-700"}`}>
          {matiere.name}
        </span>
        {cnt > 0 && (
          <span className="text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-gray-200/80 text-gray-700 shrink-0">
            {cnt}
          </span>
        )}
      </button>
    </div>
  );
}

function DossierBranch({
  dossier,
  depth,
  childrenByParent,
  matieresByDossier,
  selectedMatiereIds,
  onToggleMatiere,
  onToggleDossierSubtree,
  threadCountByMatiereId,
}: {
  dossier: Dossier;
  depth: number;
  childrenByParent: Map<string | null, Dossier[]>;
  matieresByDossier: Map<string, Matiere[]>;
  selectedMatiereIds: Set<string>;
  onToggleMatiere: (id: string) => void;
  onToggleDossierSubtree: (dossierId: string) => void;
  threadCountByMatiereId: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = childrenByParent.get(dossier.id) ?? [];
  const mats = matieresByDossier.get(dossier.id) ?? [];
  const sm = useMemo(
    () => collectMatiereIdsInSubtree(dossier.id, childrenByParent, matieresByDossier),
    [dossier.id, childrenByParent, matieresByDossier]
  );
  const hasScope = sm.length > 0;
  const allOn = hasScope && sm.every(id => selectedMatiereIds.has(id));
  const someOn = sm.some(id => selectedMatiereIds.has(id));
  const hasBranch = children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-0.5 py-0.5 rounded-md hover:bg-gray-100/80"
        style={{ paddingLeft: depth * 10 + 4 }}
      >
        <button
          type="button"
          className="w-5 h-7 flex items-center justify-center shrink-0 text-gray-400"
          onClick={e => { e.stopPropagation(); setExpanded(p => !p); }}
          disabled={!hasBranch}
        >
          {hasBranch ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
        </button>
        <button type="button" className="p-0.5 shrink-0" onClick={() => onToggleDossierSubtree(dossier.id)}>
          <ChkLight checked={allOn} partial={!allOn && someOn} />
        </button>
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 pr-1 text-left"
          onClick={() => hasBranch && setExpanded(p => !p)}
        >
          {dossier.color ? (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dossier.color }} />
          ) : null}
          <DossierTypeIcon type={dossier.dossier_type} className="w-3 h-3 shrink-0 text-amber-700/80" />
          <span className="text-[11px] font-semibold text-gray-800 truncate">{dossier.name}</span>
        </button>
      </div>

      {expanded && hasBranch && (
        <div>
          {children.map(ch => (
            <DossierBranch
              key={ch.id}
              dossier={ch}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              matieresByDossier={matieresByDossier}
              selectedMatiereIds={selectedMatiereIds}
              onToggleMatiere={onToggleMatiere}
              onToggleDossierSubtree={onToggleDossierSubtree}
              threadCountByMatiereId={threadCountByMatiereId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function QaPedagogieMatiereTreeSidebar({
  dossiers,
  matieres,
  selectedMatiereIds,
  onToggleMatiere,
  onSelectAllMatieres,
  onSetMatiereSelection,
  threadCountByMatiereId = {},
}: {
  dossiers: Dossier[];
  matieres: Matiere[];
  selectedMatiereIds: Set<string>;
  onToggleMatiere: (id: string) => void;
  onSelectAllMatieres: () => void;
  onSetMatiereSelection: Dispatch<SetStateAction<Set<string>>>;
  threadCountByMatiereId?: Record<string, number>;
}) {
  const childrenByParent = useMemo(() => buildQaPedagogieChildrenMap(dossiers), [dossiers]);

  const matieresByDossier = useMemo(() => {
    const map = new Map<string, Matiere[]>();
    for (const mat of matieres) {
      // Exclure les matières fantômes nommées PASS / LAS / LSPS (erreurs de saisie en base)
      const n = mat.name.trim().toUpperCase();
      if (n === "PASS" || n === "LAS" || n === "LSPS" || n.startsWith("PASS ") || n.startsWith("LAS ") || n.startsWith("LSPS ")) continue;
      if (!map.has(mat.dossier_id)) map.set(mat.dossier_id, []);
      map.get(mat.dossier_id)!.push(mat);
    }
    for (const list of map.values()) list.sort((a, b) => a.order_index - b.order_index);
    return map;
  }, [matieres]);

  const roots = childrenByParent.get(null) ?? [];

  const handleToggleDossierSubtree = (dossierId: string) => {
    const matiereIds = collectMatiereIdsInSubtree(dossierId, childrenByParent, matieresByDossier);
    if (matiereIds.length === 0) return;
    const allOn = matiereIds.every(id => selectedMatiereIds.has(id));
    onSetMatiereSelection(prev => {
      const next = new Set(prev);
      if (allOn) for (const id of matiereIds) next.delete(id);
      else for (const id of matiereIds) next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col shrink-0 border-r border-gray-200 overflow-y-auto h-full bg-gray-50/80 w-[min(280px,32vw)]">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Pédagogie</p>
        <p className="text-[9px] text-gray-400 mt-0.5 leading-snug">
          Offre → université → semestre → matière
        </p>
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={onSelectAllMatieres}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            selectedMatiereIds.size === 0
              ? "bg-blue-50 text-blue-800 border border-blue-200"
              : "text-gray-600 border border-transparent hover:bg-gray-100"
          }`}
        >
          <Layers size={12} className={selectedMatiereIds.size === 0 ? "text-blue-600" : "text-gray-500"} />
          Toutes les questions
        </button>
      </div>

      <div className="px-1 pb-3 flex-1 min-h-0">
        {roots.length === 0 ? (
          <p className="text-[10px] text-gray-400 px-3 py-4">Aucun dossier pédagogique visible.</p>
        ) : (
          roots.map(d => (
            <DossierBranch
              key={d.id}
              dossier={d}
              depth={0}
              childrenByParent={childrenByParent}
              matieresByDossier={matieresByDossier}
              selectedMatiereIds={selectedMatiereIds}
              onToggleMatiere={onToggleMatiere}
              onToggleDossierSubtree={handleToggleDossierSubtree}
              threadCountByMatiereId={threadCountByMatiereId}
            />
          ))
        )}
      </div>
    </div>
  );
}

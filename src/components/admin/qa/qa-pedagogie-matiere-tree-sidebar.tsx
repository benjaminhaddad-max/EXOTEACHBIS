"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ChevronDown, ChevronRight, GraduationCap, Building2, Calendar, BookOpen, Layers, Check, Folder,
} from "lucide-react";
import type { Dossier, DossierType, Matiere } from "@/types/database";

function collectMatiereIdsInSubtree(
  rootId: string,
  childrenByParent: Map<string | null, Dossier[]>,
  matieresByDossier: Map<string, Matiere[]>
): string[] {
  const ids: string[] = [];
  const walk = (did: string) => {
    for (const m of matieresByDossier.get(did) ?? []) ids.push(m.id);
    for (const ch of childrenByParent.get(did) ?? []) walk(ch.id);
  };
  walk(rootId);
  return ids;
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

function DossierBranch({
  dossier,
  depth,
  childrenByParent,
  matieresByDossier,
  selectedMatiereIds,
  onToggleMatiere,
  onToggleSubtree,
  threadCountByMatiereId,
}: {
  dossier: Dossier;
  depth: number;
  childrenByParent: Map<string | null, Dossier[]>;
  matieresByDossier: Map<string, Matiere[]>;
  selectedMatiereIds: Set<string>;
  onToggleMatiere: (id: string) => void;
  onToggleSubtree: (dossierId: string) => void;
  threadCountByMatiereId: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = childrenByParent.get(dossier.id) ?? [];
  const mats = matieresByDossier.get(dossier.id) ?? [];
  const subtreeIds = useMemo(
    () => collectMatiereIdsInSubtree(dossier.id, childrenByParent, matieresByDossier),
    [dossier.id, childrenByParent, matieresByDossier]
  );
  const hasBranch = children.length > 0 || mats.length > 0;
  const allChecked = subtreeIds.length > 0 && subtreeIds.every(id => selectedMatiereIds.has(id));
  const someChecked = subtreeIds.some(id => selectedMatiereIds.has(id));

  return (
    <div>
      <div
        className="flex items-center gap-0.5 py-0.5 rounded-md hover:bg-gray-100/80"
        style={{ paddingLeft: depth * 10 + 4 }}
      >
        <button
          type="button"
          className="w-5 h-7 flex items-center justify-center shrink-0 text-gray-400"
          onClick={e => {
            e.stopPropagation();
            setExpanded(p => !p);
          }}
          disabled={!hasBranch}
        >
          {hasBranch ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
        </button>
        {subtreeIds.length > 0 ? (
          <button type="button" className="p-0.5 shrink-0" onClick={() => onToggleSubtree(dossier.id)}>
            <ChkLight checked={allChecked} partial={!allChecked && someChecked} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
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
          {mats.map(m => {
            const cnt = threadCountByMatiereId[m.id] ?? 0;
            const isOn = selectedMatiereIds.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggleMatiere(m.id)}
                className={`w-full flex items-center gap-2 py-1 pr-2 rounded-md text-left transition-colors ${
                  isOn ? "bg-blue-50/90" : "hover:bg-gray-50"
                }`}
                style={{ paddingLeft: depth * 10 + 36 }}
              >
                <ChkLight checked={isOn} />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                <BookOpen size={11} className="shrink-0 text-blue-700/70" />
                <span className={`flex-1 text-[10px] font-medium truncate ${isOn ? "text-blue-950" : "text-gray-700"}`}>
                  {m.name}
                </span>
                {cnt > 0 && (
                  <span className="text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-gray-200/80 text-gray-700 shrink-0">
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
          {children.map(ch => (
            <DossierBranch
              key={ch.id}
              dossier={ch}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              matieresByDossier={matieresByDossier}
              selectedMatiereIds={selectedMatiereIds}
              onToggleMatiere={onToggleMatiere}
              onToggleSubtree={onToggleSubtree}
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
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Dossier[]>();
    for (const d of dossiers) {
      const p = d.parent_id;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(d);
    }
    for (const list of m.values()) list.sort((a, b) => a.order_index - b.order_index);
    return m;
  }, [dossiers]);

  const matieresByDossier = useMemo(() => {
    const map = new Map<string, Matiere[]>();
    for (const mat of matieres) {
      if (!map.has(mat.dossier_id)) map.set(mat.dossier_id, []);
      map.get(mat.dossier_id)!.push(mat);
    }
    for (const list of map.values()) list.sort((a, b) => a.order_index - b.order_index);
    return map;
  }, [matieres]);

  const roots = childrenByParent.get(null) ?? [];

  const toggleSubtree = (dossierId: string) => {
    const ids = collectMatiereIdsInSubtree(dossierId, childrenByParent, matieresByDossier);
    if (ids.length === 0) return;
    onSetMatiereSelection(prev => {
      const next = new Set(prev);
      const allOn = ids.every(id => next.has(id));
      if (allOn) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col shrink-0 border-r border-gray-200 overflow-y-auto h-full bg-gray-50/80 w-[min(280px,32vw)]">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Pédagogie</p>
        <p className="text-[9px] text-gray-400 mt-0.5 leading-snug">Semestres, blocs et matières (comme Exercices)</p>
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
              onToggleSubtree={toggleSubtree}
              threadCountByMatiereId={threadCountByMatiereId}
            />
          ))
        )}
      </div>
    </div>
  );
}

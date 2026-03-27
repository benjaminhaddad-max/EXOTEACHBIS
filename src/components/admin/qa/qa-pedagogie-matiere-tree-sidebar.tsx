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

/** Retourne les classes de style selon le type de dossier */
function typeStyle(type: DossierType): {
  row: string;
  text: string;
  icon: string;
  iconSize: number;
} {
  switch (type) {
    case "offer":
      return {
        row: "hover:bg-indigo-50/60 rounded-lg",
        text: "text-[12px] font-bold text-indigo-900 tracking-tight",
        icon: "text-indigo-500",
        iconSize: 14,
      };
    case "university":
      return {
        row: "hover:bg-blue-50/50 rounded-md",
        text: "text-[11px] font-semibold text-blue-800",
        icon: "text-blue-500",
        iconSize: 13,
      };
    case "semester":
    case "period":
      return {
        row: "hover:bg-orange-50/40 rounded-md",
        text: "text-[10.5px] font-semibold text-orange-700",
        icon: "text-orange-400",
        iconSize: 12,
      };
    case "subject":
      return {
        row: "hover:bg-emerald-50/40 rounded-md",
        text: "text-[10px] font-medium text-emerald-800",
        icon: "text-emerald-500",
        iconSize: 11,
      };
    default:
      return {
        row: "hover:bg-gray-100/60 rounded-md",
        text: "text-[10px] font-medium text-gray-500",
        icon: "text-gray-400",
        iconSize: 11,
      };
  }
}

function DossierTypeIcon({ type, className }: { type: DossierType; className?: string }) {
  const cn = className ?? "w-3 h-3 shrink-0";
  switch (type) {
    case "offer":      return <GraduationCap className={cn} />;
    case "university": return <Building2 className={cn} />;
    case "semester":
    case "period":     return <Calendar className={cn} />;
    case "subject":    return <BookOpen className={cn} />;
    case "option":
    case "module":     return <Layers className={cn} />;
    default:           return <Folder className={cn} />;
  }
}

function ChkLight({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <div
      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
        checked
          ? "bg-blue-600 border-blue-600"
          : partial
          ? "border-blue-400 bg-blue-50"
          : "border-gray-300 bg-white"
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
  onToggleDossierSubtree,
  threadCountByMatiereId,
}: {
  dossier: Dossier;
  depth: number;
  childrenByParent: Map<string | null, Dossier[]>;
  matieresByDossier: Map<string, Matiere[]>;
  selectedMatiereIds: Set<string>;
  onToggleDossierSubtree: (dossierId: string) => void;
  threadCountByMatiereId: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = childrenByParent.get(dossier.id) ?? [];
  const sm = useMemo(
    () => collectMatiereIdsInSubtree(dossier.id, childrenByParent, matieresByDossier),
    [dossier.id, childrenByParent, matieresByDossier]
  );
  const allOn = sm.length > 0 && sm.every(id => selectedMatiereIds.has(id));
  const someOn = sm.some(id => selectedMatiereIds.has(id));
  const hasBranch = children.length > 0;

  // Compte de questions dans le sous-arbre
  const threadCount = sm.reduce((acc, id) => acc + (threadCountByMatiereId[id] ?? 0), 0);

  const style = typeStyle(dossier.dossier_type);

  return (
    <div>
      <div
        className={`flex items-center gap-0.5 py-0.5 ${style.row}`}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {/* Chevron expand */}
        <button
          type="button"
          className="w-5 h-6 flex items-center justify-center shrink-0 text-gray-300 hover:text-gray-500"
          onClick={e => { e.stopPropagation(); setExpanded(p => !p); }}
          disabled={!hasBranch}
        >
          {hasBranch ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
        </button>

        {/* Checkbox */}
        <button
          type="button"
          className="p-0.5 shrink-0"
          onClick={() => onToggleDossierSubtree(dossier.id)}
        >
          <ChkLight checked={allOn} partial={!allOn && someOn} />
        </button>

        {/* Label */}
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 pr-1 text-left"
          onClick={() => hasBranch && setExpanded(p => !p)}
        >
          <DossierTypeIcon
            type={dossier.dossier_type}
            className={`shrink-0 ${style.icon}`}
            style={{ width: style.iconSize, height: style.iconSize } as React.CSSProperties}
          />
          <span className={`flex-1 truncate ${style.text}`}>{dossier.name}</span>
          {threadCount > 0 && (
            <span className="text-[9px] tabular-nums px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium shrink-0">
              {threadCount}
            </span>
          )}
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
    <div className="flex flex-col shrink-0 border-r border-gray-200 overflow-y-auto h-full bg-gray-50/60 w-[min(280px,32vw)]">
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pédagogie</p>
      </div>

      <div className="px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={onSelectAllMatieres}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            selectedMatiereIds.size === 0
              ? "bg-blue-600 text-white shadow-sm"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <Layers size={13} />
          Toutes les questions
        </button>
      </div>

      <div className="px-2 pb-3 flex-1 min-h-0 space-y-0.5">
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
              onToggleDossierSubtree={handleToggleDossierSubtree}
              threadCountByMatiereId={threadCountByMatiereId}
            />
          ))
        )}
      </div>
    </div>
  );
}

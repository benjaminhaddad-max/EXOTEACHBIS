"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, Plus, GraduationCap, Building2,
  Calendar, BookOpen, Layers, Sparkles, Clock, Folder, Users,
  Pencil, Trash2, FolderPlus,
} from "lucide-react";
import type { Dossier, Groupe, Profile } from "@/types/database";
import type { DossierType } from "@/types/database";
import { DOSSIER_TYPE_META } from "@/lib/pedagogie-structure";

// ─── Icons & colors per dossier type ──────────────────────────────────────

const DTYPE_ICON: Record<string, typeof Folder> = {
  offer: GraduationCap,
  university: Building2,
  semester: Calendar,
  subject: BookOpen,
  module: Layers,
  option: Sparkles,
  period: Clock,
  generic: Folder,
};

const DTYPE_COLOR: Record<string, string> = {
  offer: "#C9A84C",
  university: "#A78BFA",
  semester: "#38BDF8",
  subject: "#34D399",
  module: "#F472B6",
  option: "#FBBF24",
  period: "#818CF8",
  generic: "#9CA3AF",
};

// ─── Types ────────────────────────────────────────────────────────────────

type DossierNode = Dossier & { children: DossierNode[] };

interface DossierGroupTreeProps {
  dossiers: Dossier[];
  groupes: Groupe[];
  users: Profile[];
  selectedGroupeId: string | null;
  selectedDossierId: string | null;
  onSelectGroup: (id: string) => void;
  onSelectDossier: (id: string) => void;
  onCreateGroup: (formationDossierId: string) => void;
  onCreateSubDossier?: (parentId: string) => void;
  onEditDossier?: (dossier: Dossier) => void;
  onDeleteDossier?: (id: string) => void;
}

// ─── Build tree ───────────────────────────────────────────────────────────

function buildDossierTree(dossiers: Dossier[]): DossierNode[] {
  const map = new Map<string, DossierNode>();
  for (const d of dossiers) map.set(d.id, { ...d, children: [] });

  const roots: DossierNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else if (!node.parent_id) {
      roots.push(node);
    }
  }

  // Sort children by order_index
  function sortChildren(nodes: DossierNode[]) {
    nodes.sort((a, b) => a.order_index - b.order_index);
    for (const n of nodes) sortChildren(n.children);
  }
  sortChildren(roots);

  return roots;
}

// ─── Component ────────────────────────────────────────────────────────────

export function DossierGroupTree({
  dossiers, groupes, users,
  selectedGroupeId, selectedDossierId,
  onSelectGroup, onSelectDossier, onCreateGroup,
  onCreateSubDossier, onEditDossier, onDeleteDossier,
}: DossierGroupTreeProps) {
  const tree = useMemo(() => buildDossierTree(dossiers), [dossiers]);

  // Index groups by formation_dossier_id
  const groupsByDossier = useMemo(() => {
    const map = new Map<string, Groupe[]>();
    for (const g of groupes) {
      if (g.formation_dossier_id) {
        if (!map.has(g.formation_dossier_id)) map.set(g.formation_dossier_id, []);
        map.get(g.formation_dossier_id)!.push(g);
      }
    }
    return map;
  }, [groupes]);

  // Count total members per group
  const memberCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      if (u.groupe_id) {
        map.set(u.groupe_id, (map.get(u.groupe_id) || 0) + 1);
      }
    }
    return map;
  }, [users]);

  if (tree.length === 0) {
    return (
      <p className="text-[11px] text-center py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
        Aucun dossier de formation
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map(node => (
        <DossierTreeNode
          key={node.id}
          node={node}
          depth={0}
          groupsByDossier={groupsByDossier}
          memberCountByGroup={memberCountByGroup}
          selectedGroupeId={selectedGroupeId}
          selectedDossierId={selectedDossierId}
          onSelectGroup={onSelectGroup}
          onSelectDossier={onSelectDossier}
          onCreateGroup={onCreateGroup}
          onCreateSubDossier={onCreateSubDossier}
          onEditDossier={onEditDossier}
          onDeleteDossier={onDeleteDossier}
          allDossiers={dossiers}
        />
      ))}
    </div>
  );
}

// ─── Recursive tree node ──────────────────────────────────────────────────

function DossierTreeNode({
  node, depth, groupsByDossier, memberCountByGroup,
  selectedGroupeId, selectedDossierId,
  onSelectGroup, onSelectDossier, onCreateGroup,
  onCreateSubDossier, onEditDossier, onDeleteDossier,
  allDossiers,
}: {
  node: DossierNode;
  depth: number;
  groupsByDossier: Map<string, Groupe[]>;
  memberCountByGroup: Map<string, number>;
  selectedGroupeId: string | null;
  selectedDossierId: string | null;
  onSelectGroup: (id: string) => void;
  onSelectDossier: (id: string) => void;
  onCreateGroup: (formationDossierId: string) => void;
  onCreateSubDossier?: (parentId: string) => void;
  onEditDossier?: (dossier: Dossier) => void;
  onDeleteDossier?: (id: string) => void;
  allDossiers: Dossier[];
}) {
  const [expanded, setExpanded] = useState(depth < 1); // Auto-expand first level
  const [hovered, setHovered] = useState(false);

  const linkedGroups = groupsByDossier.get(node.id) || [];
  const hasChildren = node.children.length > 0 || linkedGroups.length > 0;
  const isSelected = selectedDossierId === node.id;

  const Icon = DTYPE_ICON[node.dossier_type] || Folder;
  const accentColor = DTYPE_COLOR[node.dossier_type] || "#9CA3AF";
  const typeLabel = DOSSIER_TYPE_META[node.dossier_type]?.shortLabel || "";

  // Count total groups + members recursively
  const totalGroups = useMemo(() => {
    let count = linkedGroups.length;
    function walk(n: DossierNode) {
      count += (groupsByDossier.get(n.id) || []).length;
      for (const c of n.children) walk(c);
    }
    for (const c of node.children) walk(c);
    return count;
  }, [node, linkedGroups, groupsByDossier]);

  return (
    <div>
      {/* Dossier row */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          paddingLeft: depth * 14 + 4,
          backgroundColor: isSelected ? "rgba(201,168,76,0.12)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
          borderRadius: 6,
          marginBottom: 1,
        }}
        className="flex items-center gap-1 py-1 pr-1.5 cursor-pointer transition-colors"
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(p => !p); }}
          className="w-4 h-4 flex items-center justify-center shrink-0"
          style={{ color: hasChildren ? "rgba(255,255,255,0.4)" : "transparent" }}
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)
            : null}
        </button>

        {/* Icon + name */}
        <button
          onClick={() => onSelectDossier(node.id)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <Icon size={13} style={{ color: accentColor }} className="shrink-0" />
          <span className="text-[11px] truncate" style={{
            color: isSelected ? "#E3C286" : "rgba(255,255,255,0.75)",
            fontWeight: depth === 0 ? 700 : isSelected ? 600 : 500,
          }}>
            {node.name}
          </span>
        </button>

        {/* Stats + actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {totalGroups > 0 && !hovered && (
            <span className="text-[9px] px-1.5 rounded-full" style={{
              backgroundColor: "rgba(201,168,76,0.1)",
              color: "rgba(201,168,76,0.6)",
            }}>
              {totalGroups}
            </span>
          )}
          {hovered && (
            <div className="flex items-center gap-0.5">
              {onCreateSubDossier && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateSubDossier(node.id); }}
                  className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                  title="Ajouter un sous-dossier"
                >
                  <FolderPlus size={10} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onCreateGroup(node.id); }}
                className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-white/10"
                style={{ color: "rgba(255,255,255,0.4)" }}
                title="Créer une classe ici"
              >
                <Plus size={10} />
              </button>
              {onEditDossier && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditDossier(node); }}
                  className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  title="Renommer"
                >
                  <Pencil size={9} />
                </button>
              )}
              {onDeleteDossier && node.children.length === 0 && (groupsByDossier.get(node.id) || []).length === 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteDossier(node.id); }}
                  className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-red-500/20"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  title="Supprimer"
                >
                  <Trash2 size={9} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Children + linked groups */}
      {expanded && hasChildren && (
        <div>
          {/* Linked groups at this level */}
          {linkedGroups.map(g => {
            const memberCount = memberCountByGroup.get(g.id) || 0;
            const isGroupSelected = selectedGroupeId === g.id;
            return (
              <div
                key={g.id}
                onClick={() => onSelectGroup(g.id)}
                style={{
                  paddingLeft: (depth + 1) * 14 + 4,
                  backgroundColor: isGroupSelected ? "rgba(255,255,255,0.12)" : "transparent",
                  borderRadius: 6,
                  marginBottom: 1,
                }}
                className="flex items-center gap-1.5 py-1 pr-2 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  <Users size={10} style={{ color: g.color || "rgba(255,255,255,0.4)" }} />
                </span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-[11px] truncate flex-1" style={{
                  color: isGroupSelected ? "white" : "rgba(255,255,255,0.65)",
                  fontWeight: isGroupSelected ? 600 : 400,
                }}>
                  {g.name}
                </span>
                {memberCount > 0 && (
                  <span className="text-[9px] shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {memberCount}
                  </span>
                )}
              </div>
            );
          })}

          {/* Child dossiers */}
          {node.children.map(child => (
            <DossierTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              groupsByDossier={groupsByDossier}
              memberCountByGroup={memberCountByGroup}
              selectedGroupeId={selectedGroupeId}
              selectedDossierId={selectedDossierId}
              onSelectGroup={onSelectGroup}
              onSelectDossier={onSelectDossier}
              onCreateGroup={onCreateGroup}
              onCreateSubDossier={onCreateSubDossier}
              onEditDossier={onEditDossier}
              onDeleteDossier={onDeleteDossier}
              allDossiers={allDossiers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

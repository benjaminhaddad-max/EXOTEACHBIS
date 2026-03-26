"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, Plus, GraduationCap, Building2,
  Calendar, BookOpen, Layers, Sparkles, Clock, Folder, Users,
  Pencil, Trash2, FolderPlus, FileText,
} from "lucide-react";
import type { Dossier, Groupe, Profile } from "@/types/database";
import { DOSSIER_TYPE_META } from "@/lib/pedagogie-structure";

type CoursBasic = { id: string; name: string; dossier_id: string | null; matiere_id: string | null; order_index: number; visible: boolean };

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
  cours?: CoursBasic[];
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

// Only show offer + university levels in the admin tree
// Semesters/subjects/chapters are managed via checkboxes in the right panel
const ADMIN_TREE_TYPES = new Set(["offer", "university"]);

function buildDossierTree(dossiers: Dossier[]): DossierNode[] {
  // Filter to only show offer and university dossiers
  const filtered = dossiers.filter(d => ADMIN_TREE_TYPES.has(d.dossier_type));

  const map = new Map<string, DossierNode>();
  for (const d of filtered) map.set(d.id, { ...d, children: [] });

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
  dossiers, groupes, users, cours = [],
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

  // Index cours by dossier_id (chapters under subjects)
  const coursByDossier = useMemo(() => {
    const map = new Map<string, CoursBasic[]>();
    for (const c of cours) {
      const key = c.dossier_id;
      if (key) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
    }
    return map;
  }, [cours]);

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
          coursByDossier={coursByDossier}
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
  allDossiers, coursByDossier,
}: {
  node: DossierNode;
  depth: number;
  groupsByDossier: Map<string, Groupe[]>;
  coursByDossier: Map<string, CoursBasic[]>;
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
  const linkedCours = coursByDossier.get(node.id) || [];
  const hasChildren = node.children.length > 0 || linkedGroups.length > 0 || linkedCours.length > 0;
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
          paddingLeft: depth * 20 + 8,
          backgroundColor: isSelected ? "rgba(201,168,76,0.12)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
          borderRadius: 8,
          marginBottom: 2,
          borderLeft: isSelected ? "3px solid #C9A84C" : "3px solid transparent",
        }}
        className="flex items-center gap-2 py-2.5 pr-3 cursor-pointer transition-all"
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(p => !p); }}
          className="w-5 h-5 flex items-center justify-center shrink-0 rounded"
          style={{ color: hasChildren ? "rgba(255,255,255,0.45)" : "transparent" }}
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
            : null}
        </button>

        {/* Icon */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor + "18" }}>
          <Icon size={15} style={{ color: accentColor }} />
        </div>

        {/* Name */}
        <button
          onClick={() => onSelectDossier(node.id)}
          className="flex-1 min-w-0 text-left"
        >
          <span className="truncate block" style={{
            color: isSelected ? "#E3C286" : "rgba(255,255,255,0.85)",
            fontWeight: depth === 0 ? 700 : isSelected ? 600 : 500,
            fontSize: depth === 0 ? 14 : 13,
            lineHeight: "1.3",
          }}>
            {node.name}
          </span>
        </button>

        {/* Group count badge */}
        {totalGroups > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{
            backgroundColor: "rgba(201,168,76,0.12)",
            color: "#C9A84C",
          }}>
            {totalGroups}
          </span>
        )}
      </div>

      {/* Children + linked groups */}
      {expanded && hasChildren && (
        <div>
          {/* Cours/chapters under this dossier (leaf content) */}
          {linkedCours.length > 0 && (
            <div>
              {linkedCours.map(c => (
                <div
                  key={c.id}
                  style={{ paddingLeft: (depth + 1) * 14 + 4, marginBottom: 1 }}
                  className="flex items-center gap-1.5 py-0.5 text-[10px]"
                >
                  <FileText size={10} style={{ color: "rgba(255,255,255,0.25)" }} className="shrink-0" />
                  <span style={{ color: "rgba(255,255,255,0.5)" }} className="truncate">{c.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Child dossiers (content hierarchy) */}
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
              coursByDossier={coursByDossier}
            />
          ))}

          {/* Classes are NOT shown in the tree — managed in right panel */}
        </div>
      )}
    </div>
  );
}

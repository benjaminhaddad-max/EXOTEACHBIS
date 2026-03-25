"use client";

import { useState, useTransition, useMemo, useEffect, useCallback } from "react";
import {
  Users, Search, Pencil, Trash2, X, Check,
  AlertCircle, Loader2, Plus, ShieldCheck, GraduationCap,
  BookOpen, Crown, ChevronDown, ChevronRight, Folder,
  FolderOpen, UserMinus, Settings,
} from "lucide-react";
import type { Profile, Groupe, Dossier } from "@/types/database";
import {
  updateUserRole, updateUserGroupe,
  createGroupe, updateGroupe, deleteGroupe,
  toggleGroupeDossierAcces,
} from "@/app/(admin)/admin/utilisateurs/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupeNode = Groupe & { children: GroupeNode[] };
type DossierNode = Dossier & { children: DossierNode[] };
type Modal =
  | { type: "create_groupe"; parentId: string | null }
  | { type: "edit_groupe"; groupe: Groupe }
  | { type: "edit_user"; user: Profile }
  | null;
type Toast = { message: string; kind: "success" | "error" } | null;

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  superadmin: { label: "Super Admin", color: "text-red-300",    bg: "bg-red-500/15 border-red-500/30",    icon: <Crown size={11} /> },
  admin:      { label: "Admin",       color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/30", icon: <ShieldCheck size={11} /> },
  prof:       { label: "Professeur",  color: "text-blue-300",   bg: "bg-blue-500/15 border-blue-500/30",   icon: <BookOpen size={11} /> },
  eleve:      { label: "Élève",       color: "text-green-300",  bg: "bg-green-500/15 border-green-500/30",  icon: <GraduationCap size={11} /> },
};

const PALETTE = [
  "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6",
  "#EC4899","#06B6D4","#84CC16","#F97316","#6366F1","#C9A84C",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatar(u: Profile) {
  return (u.first_name?.[0] ?? u.email[0]).toUpperCase();
}

function fullName(u: Profile) {
  return (u.first_name || u.last_name)
    ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
    : u.email.split("@")[0];
}

function buildGroupTree(groupes: Groupe[]): GroupeNode[] {
  const map = new Map<string, GroupeNode>();
  const roots: GroupeNode[] = [];
  for (const g of groupes) map.set(g.id, { ...g, children: [] });
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function buildDossierTree(dossiers: Dossier[]): DossierNode[] {
  const map = new Map<string, DossierNode>();
  const roots: DossierNode[] = [];
  for (const d of dossiers) map.set(d.id, { ...d, children: [] });
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function UtilisateursShell({
  initialUsers,
  initialGroupes,
  initialDossiers,
}: {
  initialUsers: Profile[];
  initialGroupes: Groupe[];
  initialDossiers: Dossier[];
}) {
  const [view, setView] = useState<"comptes" | "groupe">("comptes");
  const [selectedGroupeId, setSelectedGroupeId] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [groupes, setGroupes] = useState<Groupe[]>(initialGroupes);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = useCallback((message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshUsers = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (data) setUsers(data as Profile[]);
  }, []);

  const refreshGroupes = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("groupes").select("*").order("name");
    if (data) setGroupes(data as Groupe[]);
  }, []);

  const handleDeleteGroupe = useCallback((id: string) => {
    if (!confirm("Supprimer ce groupe ? Les membres seront désassociés.")) return;
    startTransition(async () => {
      const res = await deleteGroupe(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      if (selectedGroupeId === id) { setSelectedGroupeId(null); setView("comptes"); }
      await Promise.all([refreshGroupes(), refreshUsers()]);
      showToast("Groupe supprimé", "success");
    });
  }, [selectedGroupeId, showToast, refreshGroupes, refreshUsers]);

  const handleSaveGroupe = useCallback((data: {
    id?: string; name: string; color: string; annee?: string; description?: string; parent_id?: string | null;
  }) => {
    startTransition(async () => {
      const res = data.id
        ? await updateGroupe(data.id, { name: data.name, color: data.color, annee: data.annee, description: data.description, parent_id: data.parent_id })
        : await createGroupe({ name: data.name, color: data.color, annee: data.annee, description: data.description, parent_id: data.parent_id });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      await refreshGroupes();
      setModal(null);
      showToast(data.id ? "Groupe mis à jour" : "Groupe créé", "success");
    });
  }, [showToast, refreshGroupes]);

  const handleSaveUser = useCallback((userId: string, changes: { role?: string; groupe_id?: string | null }) => {
    startTransition(async () => {
      if (changes.role !== undefined) {
        const res = await updateUserRole(userId, changes.role);
        if ("error" in res) { showToast(res.error!, "error"); return; }
      }
      if ("groupe_id" in changes) {
        const res = await updateUserGroupe(userId, changes.groupe_id ?? null);
        if ("error" in res) { showToast(res.error!, "error"); return; }
      }
      await refreshUsers();
      setModal(null);
      showToast("Modifié", "success");
    });
  }, [showToast, refreshUsers]);

  const groupTree = useMemo(() => buildGroupTree(groupes), [groupes]);
  const dossierTree = useMemo(() => buildDossierTree(initialDossiers), [initialDossiers]);
  const selectedGroupe = useMemo(() => groupes.find(g => g.id === selectedGroupeId) ?? null, [groupes, selectedGroupeId]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === "admin" || u.role === "superadmin").length,
    profs: users.filter(u => u.role === "prof").length,
    eleves: users.filter(u => u.role === "eleve").length,
  }), [users]);

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 8rem)" }}>

      {/* ── Left Panel ────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>

        {/* Header */}
        <div className="px-4 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h1 className="text-sm font-bold text-white">Administration</h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {stats.total} utilisateurs · {groupes.length} groupes
          </p>
        </div>

        {/* Stats pills */}
        <div className="px-3 py-2.5 flex flex-wrap gap-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-orange-300" style={{ backgroundColor: "rgba(249,115,22,0.1)" }}>
            {stats.admins} admin{stats.admins !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-blue-300" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
            {stats.profs} prof{stats.profs !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-green-300" style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
            {stats.eleves} élève{stats.eleves !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Comptes nav */}
        <button
          onClick={() => { setView("comptes"); setSelectedGroupeId(null); }}
          className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
          style={{
            backgroundColor: view === "comptes" ? "rgba(255,255,255,0.1)" : "transparent",
            color: view === "comptes" ? "white" : "rgba(255,255,255,0.55)",
            fontWeight: view === "comptes" ? 600 : 400,
          }}
        >
          <Users size={14} />
          Comptes
          <span className="ml-auto text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{users.length}</span>
        </button>

        {/* Groupes header */}
        <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Groupes
          </span>
          <button
            onClick={() => setModal({ type: "create_groupe", parentId: null })}
            title="Nouveau groupe racine"
            className="rounded p-0.5 transition-colors"
            style={{ color: "rgba(255,255,255,0.3)" }}
            onMouseOver={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Group tree */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {groupTree.length === 0 ? (
            <p className="text-[11px] text-center py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
              Aucun groupe
            </p>
          ) : (
            groupTree.map(node => (
              <GroupTreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedGroupeId}
                users={users}
                onSelect={(id) => { setView("groupe"); setSelectedGroupeId(id); }}
                onAddChild={(parentId) => setModal({ type: "create_groupe", parentId })}
                onEdit={(g) => setModal({ type: "edit_groupe", groupe: g })}
                onDelete={handleDeleteGroupe}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {view === "comptes" && (
          <ComptesView
            users={users}
            groupes={groupes}
            onEditUser={(u) => setModal({ type: "edit_user", user: u })}
          />
        )}
        {view === "groupe" && selectedGroupe && (
          <GroupeDetail
            groupe={selectedGroupe}
            allGroupes={groupes}
            allUsers={users}
            dossierTree={dossierTree}
            onEditGroupe={(g) => setModal({ type: "edit_groupe", groupe: g })}
            onDeleteGroupe={handleDeleteGroupe}
            onEditUser={(u) => setModal({ type: "edit_user", user: u })}
            onRemoveUser={(u) => handleSaveUser(u.id, { groupe_id: null })}
            onAddUser={(userId) => handleSaveUser(userId, { groupe_id: selectedGroupe.id })}
            showToast={showToast}
          />
        )}
        {view === "groupe" && !selectedGroupe && (
          <div className="flex items-center justify-center h-64 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            Sélectionner un groupe dans l&apos;arborescence
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modal?.type === "create_groupe" && (
        <GroupeFormModal
          parentId={modal.parentId}
          allGroupes={groupes}
          isPending={isPending}
          onSave={handleSaveGroupe}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "edit_groupe" && (
        <GroupeFormModal
          groupe={modal.groupe}
          parentId={modal.groupe.parent_id}
          allGroupes={groupes}
          isPending={isPending}
          onSave={handleSaveGroupe}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "edit_user" && (
        <EditUserModal
          user={modal.user}
          groupes={groupes}
          isPending={isPending}
          onSave={handleSaveUser}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── GroupTreeNode ─────────────────────────────────────────────────────────────

function GroupTreeNode({
  node, depth, selectedId, users, onSelect, onAddChild, onEdit, onDelete,
}: {
  node: GroupeNode;
  depth: number;
  selectedId: string | null;
  users: Profile[];
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (g: Groupe) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const memberCount = users.filter(u => u.groupe_id === node.id).length;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          paddingLeft: depth * 16 + 4,
          backgroundColor: isSelected ? "rgba(255,255,255,0.12)" : hovered ? "rgba(255,255,255,0.05)" : "transparent",
          borderRadius: 8,
          marginBottom: 1,
        }}
        className="flex items-center gap-1 py-1.5 pr-2 cursor-pointer transition-colors"
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(p => !p); }}
          className="w-4 h-4 flex items-center justify-center shrink-0 transition-colors"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : <span className="w-4" />}
        </button>

        {/* Color dot + name */}
        <button
          onClick={() => onSelect(node.id)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          <span className="text-sm truncate" style={{
            color: isSelected ? "white" : "rgba(255,255,255,0.7)",
            fontWeight: isSelected ? 600 : 400,
          }}>
            {node.name}
          </span>
          {memberCount > 0 && (
            <span className="ml-auto text-[10px] shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
              {memberCount}
            </span>
          )}
        </button>

        {/* Hover actions */}
        {hovered && (
          <div className="flex items-center gap-0.5 shrink-0 ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
              title="Ajouter un sous-groupe"
              className="p-1 rounded transition-colors"
              style={{ color: "rgba(255,255,255,0.3)" }}
              onMouseOver={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
              onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              <Plus size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(node); }}
              className="p-1 rounded transition-colors"
              style={{ color: "rgba(255,255,255,0.3)" }}
              onMouseOver={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
              onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
              className="p-1 rounded transition-colors"
              style={{ color: "rgba(255,255,255,0.3)" }}
              onMouseOver={e => (e.currentTarget.style.color = "rgb(248,113,113)")}
              onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <GroupTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              users={users}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ComptesView ──────────────────────────────────────────────────────────────

function ComptesView({
  users, groupes, onEditUser,
}: {
  users: Profile[];
  groupes: Groupe[];
  onEditUser: (u: Profile) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    if (q && !`${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(q)) return false;
    if (filterRole && u.role !== filterRole) return false;
    return true;
  }), [users, search, filterRole]);

  const groupMap = useMemo(() => {
    const m = new Map<string, Groupe>();
    for (const g of groupes) m.set(g.id, g);
    return m;
  }, [groupes]);

  return (
    <div className="p-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm text-white focus:outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { val: "", label: "Tous" },
            { val: "eleve", label: "Élèves" },
            { val: "prof", label: "Profs" },
            { val: "admin", label: "Admins" },
          ].map(f => (
            <button
              key={f.val}
              onClick={() => setFilterRole(f.val)}
              className="px-2.5 py-1 rounded-lg text-xs transition-colors"
              style={{
                backgroundColor: filterRole === f.val ? "rgba(255,255,255,0.15)" : "transparent",
                color: filterRole === f.val ? "white" : "rgba(255,255,255,0.4)",
                fontWeight: filterRole === f.val ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" }}>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Utilisateur</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Rôle</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Groupe</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.eleve;
              const groupe = u.groupe_id ? groupMap.get(u.groupe_id) : null;
              return (
                <tr key={u.id} className="transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)")}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ backgroundColor: groupe?.color ?? "#6366F1" }}>
                        {avatar(u)}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>{fullName(u)}</p>
                        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${rc.bg} ${rc.color}`}>
                      {rc.icon} {rc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {groupe ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: groupe.color }} />
                        {groupe.name}
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onEditUser(u)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseOver={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                      onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            Aucun utilisateur trouvé
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GroupeDetail ─────────────────────────────────────────────────────────────

function GroupeDetail({
  groupe, allGroupes, allUsers, dossierTree,
  onEditGroupe, onDeleteGroupe, onEditUser, onRemoveUser, onAddUser, showToast,
}: {
  groupe: Groupe;
  allGroupes: Groupe[];
  allUsers: Profile[];
  dossierTree: DossierNode[];
  onEditGroupe: (g: Groupe) => void;
  onDeleteGroupe: (id: string) => void;
  onEditUser: (u: Profile) => void;
  onRemoveUser: (u: Profile) => void;
  onAddUser: (userId: string) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [tab, setTab] = useState<"membres" | "acces" | "parametres">("membres");
  const members = useMemo(() => allUsers.filter(u => u.groupe_id === groupe.id), [allUsers, groupe.id]);
  const parentGroupe = groupe.parent_id ? allGroupes.find(g => g.id === groupe.parent_id) : null;

  // Reset tab when groupe changes
  useEffect(() => { setTab("membres"); }, [groupe.id]);

  return (
    <div className="p-5">
      {/* Group header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0"
          style={{ backgroundColor: groupe.color }}>
          {groupe.name[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-white">{groupe.name}</h2>
            {parentGroupe && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                <ChevronRight size={10} />
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: parentGroupe.color }} />
                {parentGroupe.name}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {members.length} membre{members.length !== 1 ? "s" : ""}
            {groupe.annee && ` · ${groupe.annee}`}
            {groupe.description && ` · ${groupe.description}`}
          </p>
        </div>
        <button
          onClick={() => onEditGroupe(groupe)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0"
          style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "white"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <Pencil size={11} /> Modifier
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {(["membres", "acces", "parametres"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === t ? "#C9A84C" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t ? "2px solid #C9A84C" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t === "membres" ? `Membres (${members.length})` : t === "acces" ? "Accès" : "Paramètres"}
          </button>
        ))}
      </div>

      {tab === "membres" && (
        <MembresTab
          groupe={groupe}
          members={members}
          allUsers={allUsers}
          onEditUser={onEditUser}
          onRemoveUser={onRemoveUser}
          onAddUser={onAddUser}
        />
      )}
      {tab === "acces" && (
        <AccesTab groupe={groupe} dossierTree={dossierTree} showToast={showToast} />
      )}
      {tab === "parametres" && (
        <ParamètresTab groupe={groupe} onEdit={onEditGroupe} onDelete={onDeleteGroupe} />
      )}
    </div>
  );
}

// ─── MembresTab ───────────────────────────────────────────────────────────────

function MembresTab({
  groupe, members, allUsers, onEditUser, onRemoveUser, onAddUser,
}: {
  groupe: Groupe;
  members: Profile[];
  allUsers: Profile[];
  onEditUser: (u: Profile) => void;
  onRemoveUser: (u: Profile) => void;
  onAddUser: (userId: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  const availableUsers = useMemo(() =>
    allUsers.filter(u => u.groupe_id !== groupe.id && (
      !addSearch || `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(addSearch.toLowerCase())
    )),
    [allUsers, groupe.id, addSearch]
  );

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowAdd(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            color: "rgba(255,255,255,0.7)",
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Plus size={12} /> Ajouter un membre
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="p-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)" }}>
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
              <input
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                placeholder="Rechercher un utilisateur..."
                autoFocus
                className="w-full bg-transparent pl-7 pr-2 py-1.5 text-xs text-white focus:outline-none"
                style={{ caretColor: "white" }}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableUsers.slice(0, 10).map(u => (
              <button
                key={u.id}
                onClick={() => { onAddUser(u.id); setShowAdd(false); setAddSearch(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: "#6366F1" }}>
                  {avatar(u)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>{fullName(u)}</p>
                  <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{u.email}</p>
                </div>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{ROLE_CONFIG[u.role]?.label}</span>
              </button>
            ))}
            {availableUsers.length === 0 && (
              <p className="text-[11px] text-center py-3" style={{ color: "rgba(255,255,255,0.3)" }}>Aucun résultat</p>
            )}
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Aucun membre dans ce groupe
        </div>
      ) : (
        <div className="space-y-1.5">
          {members.map(u => {
            const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.eleve;
            return (
              <div key={u.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)")}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ backgroundColor: groupe.color }}>
                  {avatar(u)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>{fullName(u)}</p>
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{u.email}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${rc.bg} ${rc.color}`}>
                  {rc.icon} {rc.label}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => onEditUser(u)} className="p-1.5 rounded-lg transition-colors"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                    onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => onRemoveUser(u)} title="Retirer du groupe" className="p-1.5 rounded-lg transition-colors"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgb(248,113,113)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(239,68,68,0.1)"; }}
                    onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
                    <UserMinus size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AccesTab ─────────────────────────────────────────────────────────────────

function AccesTab({
  groupe, dossierTree, showToast,
}: {
  groupe: Groupe;
  dossierTree: DossierNode[];
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [accessIds, setAccessIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("groupe_dossier_acces")
        .select("dossier_id")
        .eq("groupe_id", groupe.id);

      if (!cancelled) {
        if (error) {
          // Table missing = migration not run; otherwise show real error
          const msg = error.message?.includes("does not exist") || error.code === "42P01"
            ? "Migration SQL requise : exécutez 006_groupe_hierarchy_access.sql dans Supabase Dashboard > SQL Editor."
            : `Erreur : ${error.message}`;
          setLoadError(msg);
        } else if (data) {
          setAccessIds(new Set(data.map((r: { dossier_id: string }) => r.dossier_id)));
        }
        setLoading(false);
      }
    }

    load().catch((e: Error) => { if (!cancelled) { setLoadError(`Erreur : ${e?.message ?? "inconnue"}`); setLoading(false); } });
    return () => { cancelled = true; };
  }, [groupe.id]);

  async function toggle(dossierId: string) {
    setTogglingIds(prev => new Set([...prev, dossierId]));
    try {
      const result = await toggleGroupeDossierAcces(groupe.id, dossierId);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        setAccessIds(prev => {
          const next = new Set(prev);
          if (next.has(dossierId)) next.delete(dossierId);
          else next.add(dossierId);
          return next;
        });
      }
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(dossierId);
        return next;
      });
    }
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 size={20} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
    </div>
  );

  if (loadError) return (
    <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "rgb(252,165,165)" }}>
      <p className="font-medium mb-1">Erreur de chargement</p>
      <p className="text-[12px] opacity-80">{loadError}</p>
    </div>
  );

  if (dossierTree.length === 0) return (
    <div className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
      Aucun dossier disponible
    </div>
  );

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
        Cochez les dossiers et sous-dossiers auxquels ce groupe a accès.
      </p>
      <div className="space-y-0.5">
        {dossierTree.map(d => (
          <DossierAccessNode
            key={d.id}
            node={d}
            depth={0}
            accessIds={accessIds}
            togglingIds={togglingIds}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

function DossierAccessNode({
  node, depth, accessIds, togglingIds, onToggle,
}: {
  node: DossierNode;
  depth: number;
  accessIds: Set<string>;
  togglingIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const hasAccess = accessIds.has(node.id);
  const isToggling = togglingIds.has(node.id);

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 pr-2 rounded-lg transition-colors"
        style={{ paddingLeft: depth * 20 + 4 }}
        onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
        onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <button
          onClick={() => hasChildren && setExpanded(p => !p)}
          className="w-4 h-4 flex items-center justify-center shrink-0"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : <span className="w-4" />}
        </button>

        <div className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: node.color }}>
          {hasAccess ? <FolderOpen size={14} /> : <Folder size={14} />}
        </div>

        <span className="text-sm flex-1 truncate" style={{ color: hasAccess ? "white" : "rgba(255,255,255,0.5)", fontWeight: hasAccess ? 500 : 400 }}>
          {node.name}
        </span>

        <button
          onClick={() => onToggle(node.id)}
          disabled={isToggling}
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all"
          style={{
            backgroundColor: hasAccess ? "#C9A84C" : "transparent",
            border: hasAccess ? "none" : "1px solid rgba(255,255,255,0.2)",
            color: hasAccess ? "#0e1e35" : "transparent",
          }}
          onMouseOver={e => {
            if (!hasAccess) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.5)";
          }}
          onMouseOut={e => {
            if (!hasAccess) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
          }}
        >
          {isToggling
            ? <Loader2 size={10} className="animate-spin" style={{ color: hasAccess ? "#0e1e35" : "rgba(255,255,255,0.5)" }} />
            : <Check size={11} />}
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <DossierAccessNode
              key={child.id}
              node={child}
              depth={depth + 1}
              accessIds={accessIds}
              togglingIds={togglingIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ParamètresTab ────────────────────────────────────────────────────────────

function ParamètresTab({
  groupe, onEdit, onDelete,
}: {
  groupe: Groupe;
  onEdit: (g: Groupe) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={() => onEdit(groupe)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
        onMouseOut={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: groupe.color + "33" }}>
            <Pencil size={14} style={{ color: groupe.color }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-white">Modifier le groupe</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Nom, couleur, description, groupe parent</p>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.3)" }} />
      </button>

      <button
        onClick={() => onDelete(groupe.id)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
        style={{ backgroundColor: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}
        onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.1)")}
        onMouseOut={e => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.05)")}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
            <Trash2 size={14} className="text-red-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-red-400">Supprimer le groupe</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Les membres seront désassociés</p>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.3)" }} />
      </button>
    </div>
  );
}

// ─── GroupeFormModal ──────────────────────────────────────────────────────────

function GroupeFormModal({
  groupe, parentId, allGroupes, isPending, onSave, onClose,
}: {
  groupe?: Groupe;
  parentId: string | null;
  allGroupes: Groupe[];
  isPending: boolean;
  onSave: (data: { id?: string; name: string; color: string; annee?: string; description?: string; parent_id?: string | null }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(groupe?.name ?? "");
  const [color, setColor] = useState(groupe?.color ?? "#6366F1");
  const [annee, setAnnee] = useState(groupe?.annee ?? "");
  const [description, setDescription] = useState(groupe?.description ?? "");
  const [selectedParentId, setSelectedParentId] = useState<string | null>(groupe?.parent_id ?? parentId);

  const availableParents = allGroupes.filter(g => g.id !== groupe?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-bold text-white">
            {groupe ? "Modifier le groupe" : "Nouveau groupe"}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "white"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Nom *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="PASS 2025"
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Groupe parent</label>
            <select
              value={selectedParentId ?? ""}
              onChange={e => setSelectedParentId(e.target.value || null)}
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="">Aucun (groupe racine)</option>
              {availableParents.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Couleur</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-6 h-6 rounded-full transition-transform"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? "scale(1.3)" : "scale(1)",
                    outline: color === c ? "2px solid rgba(255,255,255,0.6)" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Année</label>
            <input
              value={annee}
              onChange={e => setAnnee(e.target.value)}
              placeholder="2024-2025"
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description optionnelle..."
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            Annuler
          </button>
          <button
            onClick={() => onSave({ id: groupe?.id, name, color, annee: annee || undefined, description: description || undefined, parent_id: selectedParentId })}
            disabled={!name.trim() || isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
          >
            {isPending && <Loader2 size={11} className="animate-spin" />}
            {groupe ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditUserModal ────────────────────────────────────────────────────────────

function EditUserModal({
  user, groupes, isPending, onSave, onClose,
}: {
  user: Profile;
  groupes: Groupe[];
  isPending: boolean;
  onSave: (userId: string, changes: { role?: string; groupe_id?: string | null }) => void;
  onClose: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [groupeId, setGroupeId] = useState<string | null>(user.groupe_id);

  const hasChanges = role !== user.role || groupeId !== user.groupe_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: "#6366F1" }}>
              {avatar(user)}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{fullName(user)}</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}>
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Role */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Rôle</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(ROLE_CONFIG).map(([key, rc]) => (
                <button
                  key={key}
                  onClick={() => setRole(key as Profile["role"])}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${role === key ? `${rc.bg} ${rc.color} border-current` : "border-white/10 text-white/40 hover:bg-white/5"}`}
                >
                  {rc.icon} {rc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Groupe */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Groupe</label>
            <select
              value={groupeId ?? ""}
              onChange={e => setGroupeId(e.target.value || null)}
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="">Aucun groupe</option>
              {groupes.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            Annuler
          </button>
          <button
            onClick={() => onSave(user.id, { role, groupe_id: groupeId })}
            disabled={!hasChanges || isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
          >
            {isPending && <Loader2 size={11} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

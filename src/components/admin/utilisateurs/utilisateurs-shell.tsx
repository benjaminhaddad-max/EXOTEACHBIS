"use client";

import { useState, useTransition, useMemo, useEffect, useCallback } from "react";
import {
  Users, Search, Pencil, Trash2, X, Check,
  AlertCircle, Loader2, Plus, ShieldCheck, GraduationCap,
  BookOpen, Crown, ChevronDown, ChevronRight, Folder,
  FolderOpen, UserMinus, Settings, LogIn, Mail, Phone, Building2, FileText, Copy, Layers,
} from "lucide-react";
import type {
  Profile,
  Groupe,
  Dossier,
  Matiere,
  Filiere,
  UserRole,
  GroupeDossierAcces,
  ProfileDossierAcces,
  ProfileDossierAccesExclusion,
} from "@/types/database";
import {
  updateUserAdminProfile,
  createUserAdminProfile,
  createGroupe, updateGroupe, deleteGroupe,
  setGroupeDossierAcces as saveGroupeDossierAcces,
  savePedagogieAdminSettings,
} from "@/app/(admin)/admin/utilisateurs/actions";
import {
  createDossier as createDossierAction,
  updateDossier as updateDossierAction,
  deleteDossier as deleteDossierAction,
} from "@/app/(admin)/admin/pedagogie/actions";
import { DOSSIER_TYPE_META, getDossierPathLabel, inferOfferFromAncestors } from "@/lib/pedagogie-structure";
import type { DossierNamePreset, FormationOfferSetting } from "@/lib/pedagogie-admin-settings";
import { expandDossierTree } from "@/lib/access-scope";
import { DossierGroupTree } from "./dossier-group-tree";
import { PedagogicalTeamSection } from "./pedagogical-team-section";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupeNode = Groupe & { children: GroupeNode[] };
type DossierNode = Dossier & { children: DossierNode[] };
type Modal =
  | { type: "create_groupe"; parentId: string | null; formationDossierId?: string | null }
  | { type: "edit_groupe"; groupe: Groupe }
  | { type: "edit_user"; user: Profile }
  | { type: "create_user" }
  | null;
type Toast = { message: string; kind: "success" | "error" } | null;
type ProfMatiereAssignment = { prof_id: string; matiere_id: string; role_type?: string; groupe_id?: string | null };
type OfferGroupBucket = {
  code: string;
  label: string;
  color: string;
  rootDossierId: string | null;
  groups: GroupeNode[];
};
type AdminUserChanges = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  role?: UserRole;
  groupe_id?: string | null;
  filiere_id?: string | null;
  access_dossier_id?: string | null;
  access_dossier_ids?: string[];
  excluded_access_dossier_ids?: string[];
  matiere_ids?: string[];
  matiere_roles?: { matiere_id: string; role_type: string; groupe_id?: string | null }[];
  etiquettes?: string[];
  niveau_initial?: number | null;
  mental_initial?: number | null;
  niveau_progressif?: number | null;
  mental_progressif?: number | null;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  superadmin: { label: "Super Admin", color: "text-red-300",    bg: "bg-red-500/15 border-red-500/30",    icon: <Crown size={11} /> },
  admin:      { label: "Admin",       color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/30", icon: <ShieldCheck size={11} /> },
  coach:      { label: "Coach",       color: "text-cyan-300",   bg: "bg-cyan-500/15 border-cyan-500/30",   icon: <Users size={11} /> },
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

function filterDossierTreeByAllowedIds(nodes: DossierNode[], allowedIds: Set<string>): DossierNode[] {
  return nodes
    .filter((node) => allowedIds.has(node.id))
    .map((node) => ({
      ...node,
      children: filterDossierTreeByAllowedIds(node.children, allowedIds),
    }));
}

function getGroupeInheritedFormationDossierId(
  groupeId: string | null | undefined,
  groupeMap: Map<string, Groupe>
) {
  let currentId = groupeId ?? null;

  while (currentId) {
    const groupe = groupeMap.get(currentId);
    if (!groupe) break;
    if (groupe.formation_dossier_id) {
      return groupe.formation_dossier_id;
    }
    currentId = groupe.parent_id;
  }

  return null;
}

function getGroupeFormationOfferCode(
  groupe: Groupe,
  groupeMap: Map<string, Groupe>,
  dossierMap: Map<string, Dossier>
) {
  const formationDossierId = getGroupeInheritedFormationDossierId(groupe.id, groupeMap);
  if (!formationDossierId) return null;
  const formationDossier = dossierMap.get(formationDossierId);
  if (!formationDossier) return null;
  return inferOfferFromAncestors(formationDossier, [...dossierMap.values()]);
}

function collectNodeIds(node: DossierNode): string[] {
  return [node.id, ...node.children.flatMap(collectNodeIds)];
}

function buildAccessMap<T extends { dossier_id: string }>(
  rows: T[],
  key: keyof T
) {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const ownerId = row[key];
    if (typeof ownerId !== "string") continue;
    const current = map.get(ownerId) ?? [];
    current.push(row.dossier_id);
    map.set(ownerId, current);
  }
  return map;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function UtilisateursShell({
  initialUsers,
  initialGroupes,
  initialDossiers,
  initialMatieres,
  initialFilieres,
  initialProfMatieres,
  initialGroupeDossierAcces,
  initialProfileDossierAcces,
  initialProfileDossierAccessExclusions,
  initialFormationOffers,
  initialDossierNamePresets,
  initialCours = [],
  initialGroupeCoursAcces = [],
  initialCoachingProfiles = [],
}: {
  initialUsers: Profile[];
  initialGroupes: Groupe[];
  initialDossiers: Dossier[];
  initialMatieres: Matiere[];
  initialFilieres: Filiere[];
  initialProfMatieres: ProfMatiereAssignment[];
  initialGroupeDossierAcces: GroupeDossierAcces[];
  initialProfileDossierAcces: ProfileDossierAcces[];
  initialProfileDossierAccessExclusions: ProfileDossierAccesExclusion[];
  initialFormationOffers: FormationOfferSetting[];
  initialDossierNamePresets: DossierNamePreset[];
  initialCours?: { id: string; name: string; dossier_id: string | null; matiere_id: string | null; order_index: number; visible: boolean }[];
  initialGroupeCoursAcces?: { groupe_id: string; cours_id: string }[];
  initialCoachingProfiles?: { student_id: string; niveau_initial: number | null; mental_initial: number | null; niveau_progressif: number | null; mental_progressif: number | null }[];
}) {
  const [view, setView] = useState<"comptes" | "groupe" | "administration" | "dossier_summary">("comptes");
  const [selectedGroupeId, setSelectedGroupeId] = useState<string | null>(null);
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [groupes, setGroupes] = useState<Groupe[]>(initialGroupes);
  const [profMatieres, setProfMatieres] = useState<ProfMatiereAssignment[]>(initialProfMatieres);
  const coachingProfileMap = useMemo(() => new Map(initialCoachingProfiles.map(p => [p.student_id, p])), [initialCoachingProfiles]);
  const [groupeDossierAcces, setGroupeDossierAcces] = useState<GroupeDossierAcces[]>(initialGroupeDossierAcces);
  const [groupeCoursAcces, setGroupeCoursAcces] = useState<{ groupe_id: string; cours_id: string }[]>(initialGroupeCoursAcces);
  const [profileDossierAcces, setProfileDossierAcces] = useState<ProfileDossierAcces[]>(initialProfileDossierAcces);
  const [profileDossierAccessExclusions, setProfileDossierAccessExclusions] = useState<ProfileDossierAccesExclusion[]>(initialProfileDossierAccessExclusions);
  const [formationOffers, setFormationOffers] = useState<FormationOfferSetting[]>(initialFormationOffers);
  const [dossierNamePresets, setDossierNamePresets] = useState<DossierNamePreset[]>(initialDossierNamePresets);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [createClassModal, setCreateClassModal] = useState<{ dossierId: string; groupCount: number } | null>(null);

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

  const refreshProfMatieres = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("prof_matieres").select("prof_id, matiere_id, role_type, groupe_id");
    if (data) setProfMatieres(data as ProfMatiereAssignment[]);
  }, []);

  const refreshGroupes = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("groupes").select("*").order("name");
    if (data) setGroupes(data as Groupe[]);
  }, []);

  const refreshGroupeDossierAcces = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("groupe_dossier_acces").select("groupe_id, dossier_id");
    if (data) setGroupeDossierAcces(data as GroupeDossierAcces[]);
  }, []);

  const refreshProfileDossierAcces = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("profile_dossier_acces").select("profile_id, dossier_id");
    if (data) setProfileDossierAcces(data as ProfileDossierAcces[]);
  }, []);

  const refreshProfileDossierAccessExclusions = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.from("profile_dossier_access_exclusions").select("profile_id, dossier_id");
    if (data) setProfileDossierAccessExclusions(data as ProfileDossierAccesExclusion[]);
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
    id?: string; name: string; color: string; annee?: string; description?: string; parent_id?: string | null; formation_dossier_id?: string | null;
  }) => {
    startTransition(async () => {
      const res = data.id
        ? await updateGroupe(data.id, { name: data.name, color: data.color, annee: data.annee, description: data.description, parent_id: data.parent_id, formation_dossier_id: data.formation_dossier_id })
        : await createGroupe({ name: data.name, color: data.color, annee: data.annee, description: data.description, parent_id: data.parent_id, formation_dossier_id: data.formation_dossier_id });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      await refreshGroupes();
      setModal(null);
      showToast(data.id ? "Groupe mis à jour" : "Groupe créé", "success");
    });
  }, [showToast, refreshGroupes]);

  const [savingUser, setSavingUser] = useState(false);
  const handleSaveUser = useCallback(async (userId: string, changes: AdminUserChanges) => {
    setSavingUser(true);
    try {
      // Add timeout to prevent infinite spinner
      const timeoutPromise = new Promise<{ error: string }>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout — la sauvegarde a pris trop de temps")), 15000)
      );
      const res = await Promise.race([
        updateUserAdminProfile({ userId, ...changes }),
        timeoutPromise,
      ]);
      if ("error" in res) { showToast(res.error!, "error"); setSavingUser(false); return; }
      // Refresh data (but don't block on it)
      Promise.all([refreshUsers(), refreshProfMatieres(), refreshProfileDossierAcces(), refreshProfileDossierAccessExclusions()]).catch(() => {});
      setModal(null);
      showToast("Modifié", "success");
    } catch (err: any) {
      showToast("Erreur: " + (err?.message ?? "inconnue"), "error");
    } finally {
      setSavingUser(false);
    }
  }, [showToast, refreshUsers, refreshProfMatieres, refreshProfileDossierAcces, refreshProfileDossierAccessExclusions]);

  const handleCreateUser = useCallback(async (data: { first_name: string; last_name: string; email: string; password: string; role: UserRole; groupe_id?: string | null }) => {
    setSavingUser(true);
    try {
      const res = await createUserAdminProfile(data);
      if ("error" in res) { showToast(res.error!, "error"); setSavingUser(false); return; }
      Promise.all([refreshUsers(), refreshProfMatieres()]).catch(() => {});
      setModal(null);
      showToast("Utilisateur créé", "success");
    } catch (err: any) {
      showToast("Erreur: " + (err?.message ?? "inconnue"), "error");
    } finally {
      setSavingUser(false);
    }
  }, [showToast, refreshUsers, refreshProfMatieres]);

  const handleSaveGroupeAccess = useCallback((groupeId: string, dossierIds: string[]) => {
    startTransition(async () => {
      const res = await saveGroupeDossierAcces(groupeId, dossierIds);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      await Promise.all([refreshGroupeDossierAcces(), refreshUsers()]);
      showToast("Accès de classe mis à jour", "success");
    });
  }, [refreshGroupeDossierAcces, refreshUsers, showToast]);

  const handleSaveAdministration = useCallback((nextFormationOffers: FormationOfferSetting[], nextDossierNamePresets: DossierNamePreset[]) => {
    startTransition(async () => {
      const res = await savePedagogieAdminSettings({
        formationOffers: nextFormationOffers,
        dossierNamePresets: nextDossierNamePresets,
      });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setFormationOffers(nextFormationOffers);
      setDossierNamePresets(nextDossierNamePresets);
      showToast("Administration pédagogique mise à jour", "success");
    });
  }, [showToast]);

  const groupTree = useMemo(() => buildGroupTree(groupes), [groupes]);
  const dossierTree = useMemo(() => buildDossierTree(initialDossiers), [initialDossiers]);
  const selectedGroupe = useMemo(() => groupes.find(g => g.id === selectedGroupeId) ?? null, [groupes, selectedGroupeId]);
  const groupeMap = useMemo(() => new Map(groupes.map((groupe) => [groupe.id, groupe])), [groupes]);
  const dossierMap = useMemo(() => new Map(initialDossiers.map((dossier) => [dossier.id, dossier])), [initialDossiers]);
  const offerBuckets = useMemo<OfferGroupBucket[]>(() => {
    const rootOfferDossiersByCode = new Map<string, string | null>();
    for (const dossier of initialDossiers) {
      if (dossier.dossier_type === "offer" && dossier.formation_offer && !rootOfferDossiersByCode.has(dossier.formation_offer)) {
        rootOfferDossiersByCode.set(dossier.formation_offer, dossier.id);
      }
    }

    const rootsByOffer = new Map<string, GroupeNode[]>();
    const unassignedRoots: GroupeNode[] = [];

    for (const node of groupTree) {
      const offerCode = getGroupeFormationOfferCode(node, groupeMap, dossierMap);
      if (!offerCode) {
        unassignedRoots.push(node);
        continue;
      }
      const current = rootsByOffer.get(offerCode) ?? [];
      current.push(node);
      rootsByOffer.set(offerCode, current);
    }

    const configuredBuckets = formationOffers.map((offer) => ({
      code: offer.code,
      label: offer.label,
      color: offer.defaultColor,
      rootDossierId: rootOfferDossiersByCode.get(offer.code) ?? null,
      groups: rootsByOffer.get(offer.code) ?? [],
    }));

    if (unassignedRoots.length === 0) return configuredBuckets;

    return [
      ...configuredBuckets,
      {
        code: "__sans_offre__",
        label: "Sans offre liée",
        color: "#64748B",
        rootDossierId: null,
        groups: unassignedRoots,
      },
    ];
  }, [formationOffers, groupeMap, dossierMap, groupTree, initialDossiers]);
  const profMatieresByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const assignment of profMatieres) {
      const current = map.get(assignment.prof_id) ?? [];
      current.push(assignment.matiere_id);
      map.set(assignment.prof_id, current);
    }
    return map;
  }, [profMatieres]);
  const groupeAccessById = useMemo(
    () => buildAccessMap(groupeDossierAcces, "groupe_id"),
    [groupeDossierAcces]
  );
  const profileAccessById = useMemo(
    () => buildAccessMap(profileDossierAcces, "profile_id"),
    [profileDossierAcces]
  );
  const profileAccessExclusionsById = useMemo(
    () => buildAccessMap(profileDossierAccessExclusions, "profile_id"),
    [profileDossierAccessExclusions]
  );

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === "admin" || u.role === "superadmin").length,
    coachs: users.filter(u => u.role === "coach").length,
    profs: users.filter(u => u.role === "prof").length,
    eleves: users.filter(u => u.role === "eleve").length,
  }), [users]);

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 8rem)" }}>

      {/* ── Left Panel ────────────────────────────────────────────────────── */}
      <div className="w-[380px] flex-shrink-0 flex flex-col" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h1 className="text-base font-bold text-white">Administration</h1>
            <div className="flex items-center gap-2 mt-1.5">
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
          </div>
          <button
            onClick={() => { setView("comptes"); setSelectedGroupeId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: view === "comptes" ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)",
              color: view === "comptes" ? "#C9A84C" : "rgba(255,255,255,0.5)",
              border: view === "comptes" ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Users size={12} />
            Liste des utilisateurs
          </button>
        </div>

        {/* Arborescence header */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Formations & Classes
          </span>
        </div>

        {/* Dossier tree with groups */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <DossierGroupTree
            dossiers={initialDossiers}
            groupes={groupes}
            users={users}
            cours={initialCours ?? []}
            selectedGroupeId={selectedGroupeId}
            selectedDossierId={selectedDossierId}
            onSelectGroup={(id) => { setView("groupe"); setSelectedGroupeId(id); setSelectedDossierId(null); }}
            onSelectDossier={(id) => { setView("dossier_summary"); setSelectedDossierId(id); setSelectedGroupeId(null); }}
            onCreateGroup={(dossierId) => setModal({ type: "create_groupe", parentId: null, formationDossierId: dossierId })}
            onCreateSubDossier={(parentId) => {
              const parent = initialDossiers.find(d => d.id === parentId);
              const name = prompt("Nom du sous-dossier :");
              if (!name?.trim()) return;
              startTransition(async () => {
                const res = await createDossierAction({
                  parent_id: parentId,
                  name: name.trim(),
                  dossier_type: parent?.dossier_type === "offer" ? "university" : parent?.dossier_type === "university" ? "semester" : "subject",
                  formation_offer: parent?.formation_offer ?? null,
                  color: parent?.color ?? "#374151",
                  visible: true,
                });
                if ("error" in res) { showToast(res.error!, "error"); return; }
                showToast("Sous-dossier créé", "success");
                window.location.reload();
              });
            }}
            onEditDossier={(dossier) => {
              const newName = prompt("Renommer :", dossier.name);
              if (!newName?.trim() || newName.trim() === dossier.name) return;
              startTransition(async () => {
                const res = await updateDossierAction(dossier.id, { name: newName.trim(), color: dossier.color, visible: dossier.visible });
                if ("error" in res) { showToast(res.error!, "error"); return; }
                showToast("Renommé", "success");
                window.location.reload();
              });
            }}
            onDeleteDossier={(id) => {
              if (!confirm("Supprimer ce dossier ?")) return;
              startTransition(async () => {
                const res = await deleteDossierAction(id);
                if ("error" in res) { showToast(res.error!, "error"); return; }
                showToast("Supprimé", "success");
                window.location.reload();
              });
            }}
          />
        </div>
      </div>

      {/* ── Right Panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {view === "comptes" && (
          <ComptesView
            users={users}
            groupes={groupes}
            dossiers={initialDossiers}
            filieres={initialFilieres}
            matieres={initialMatieres}
            profMatieresByUser={profMatieresByUser}
            profMatieres={profMatieres}
            groupeAccessById={groupeAccessById}
            profileAccessById={profileAccessById}
            onEditUser={(u) => setModal({ type: "edit_user", user: u })}
            onCreateUser={() => setModal({ type: "create_user" })}
          />
        )}
        {view === "groupe" && selectedGroupe && (
          <GroupeDetail
            groupe={selectedGroupe}
            allGroupes={groupes}
            allUsers={users}
            dossierTree={dossierTree}
            dossierList={initialDossiers}
            accessIds={groupeAccessById.get(selectedGroupe.id) ?? []}
            groupeAccessById={groupeAccessById}
            isPending={isPending}
            onEditGroupe={(g) => setModal({ type: "edit_groupe", groupe: g })}
            onDeleteGroupe={handleDeleteGroupe}
            onEditUser={(u) => setModal({ type: "edit_user", user: u })}
            onRemoveUser={(u) => handleSaveUser(u.id, { groupe_id: null })}
            onAddUser={(userId) => handleSaveUser(userId, { groupe_id: selectedGroupe.id })}
            onSaveAccess={handleSaveGroupeAccess}
            showToast={showToast}
          />
        )}
        {view === "groupe" && !selectedGroupe && (
          <div className="flex items-center justify-center h-64 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            Sélectionner un groupe dans l&apos;arborescence
          </div>
        )}
        {view === "dossier_summary" && selectedDossierId && (() => {
          const dossier = initialDossiers.find(d => d.id === selectedDossierId);
          if (!dossier) return null;
          const meta = DOSSIER_TYPE_META[dossier.dossier_type] as { shortLabel?: string } | undefined;

          // Get groups directly linked to this dossier
          const directGroups = groupes.filter(g => g.formation_dossier_id === dossier.id);

          // Build breadcrumb
          const pathParts: string[] = [dossier.name];
          let bp = dossier;
          while (bp.parent_id) {
            const par = initialDossiers.find(d => d.id === bp.parent_id);
            if (!par) break;
            pathParts.unshift(par.name);
            bp = par;
          }

          // Build sub-tree rooted at this dossier (for access checkboxes)
          const subTree = dossierTree.length > 0
            ? (function findNode(nodes: DossierNode[]): DossierNode[] {
                for (const n of nodes) {
                  if (n.id === dossier.id) return n.children;
                  const found = findNode(n.children);
                  if (found.length > 0) return found;
                }
                return [];
              })(dossierTree)
            : [];

          return (
            <div className="p-6 overflow-auto max-h-[calc(100vh-12rem)]">
              {/* Header — clean full path */}
              <div className="mb-6 rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #0e1e35, #1a2d4a)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(201,168,76,0.15)" }}>
                    <Building2 size={20} style={{ color: "#C9A84C" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white truncate">{pathParts.join("  ·  ")}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                        {meta?.shortLabel ?? dossier.dossier_type}
                      </span>
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {directGroups.length} classe{directGroups.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const n = prompt("Renommer :", dossier.name);
                      if (n?.trim() && n.trim() !== dossier.name) {
                        startTransition(async () => {
                          await updateDossierAction(dossier.id, { name: n.trim(), color: dossier.color, visible: dossier.visible });
                          window.location.reload();
                        });
                      }
                    }}
                    className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
                    title="Renommer"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              {/* Classes with expandable access trees */}
              {(directGroups.length > 0 || true) && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Classes ({directGroups.length})
                    </h3>
                  </div>

                  {directGroups.map(g => {
                    const members = users.filter(u => u.groupe_id === g.id);
                    const groupAccessIds = groupeDossierAcces
                      .filter(a => a.groupe_id === g.id)
                      .map(a => a.dossier_id);
                    const groupCoursAccessIds = new Set(
                      groupeCoursAcces.filter(a => a.groupe_id === g.id).map(a => a.cours_id)
                    );

                    return (
                      <details key={g.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden group/class">
                        <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                          <ChevronRight size={14} className="text-gray-400 transition-transform group-open/class:rotate-90 shrink-0" />
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-gray-800">{g.name}</span>
                            <span className="text-[10px] text-gray-400 ml-2">{members.length} membre{members.length !== 1 ? "s" : ""}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              const newName = prompt("Renommer la classe :", g.name);
                              if (newName?.trim() && newName.trim() !== g.name) {
                                startTransition(async () => {
                                  await updateGroupe(g.id, { name: newName.trim(), color: g.color });
                                  window.location.reload();
                                });
                              }
                            }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Renommer"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              if (confirm(`Supprimer "${g.name}" ?`)) {
                                startTransition(async () => {
                                  await deleteGroupe(g.id);
                                  window.location.reload();
                                });
                              }
                            }}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={12} />
                          </button>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                            {groupAccessIds.length} accès
                          </span>
                        </summary>

                        <div className="border-t border-gray-100 px-3 py-3">
                          <p className="text-[10px] text-gray-400 mb-2">
                            Cochez les contenus auxquels cette classe aura accès :
                          </p>
                          {/* Enhanced checkbox tree with search + bulk actions */}
                          <ContentAccessTree
                            groupeId={g.id}
                            dossierId={dossier.id}
                            initialDossiers={initialDossiers}
                            initialCours={initialCours ?? []}
                            groupAccessIds={groupAccessIds}
                            groupCoursAccessIds={groupCoursAccessIds}
                            setGroupeDossierAcces={setGroupeDossierAcces}
                            setGroupeCoursAcces={setGroupeCoursAcces}
                            saveGroupeDossierAcces={saveGroupeDossierAcces}
                          />

                          {/* Members — separated by role */}
                          <InlineClassMembers
                            members={members}
                            groupeId={g.id}
                            allCoaches={users.filter(u => u.role === "coach")}
                            groupeColor={g.color}
                            onManage={() => { setView("groupe"); setSelectedGroupeId(g.id); setSelectedDossierId(null); }}
                            onClickUser={(u) => setModal({ type: "edit_user", user: u })}
                          />
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}

              {/* Add class — button + custom modal */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setCreateClassModal({ dossierId: dossier.id, groupCount: directGroups.length })}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors border-2 border-dashed border-gray-300 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  <Plus size={14} />
                  Ajouter une classe
                </button>
              </div>

              {/* Pedagogical team */}
              <PedagogicalTeamSection
                universityId={dossier.id}
                dossiers={initialDossiers}
                users={users}
                groupes={groupes}
                profMatieres={profMatieres as any[]}
                onUpdate={() => window.location.reload()}
              />
            </div>
          );
        })()}
        {view === "administration" && (
          <AdministrationView
            formationOffers={formationOffers}
            dossierNamePresets={dossierNamePresets}
            offerBuckets={offerBuckets}
            allUsers={users}
            allGroupes={groupes}
            dossierTree={dossierTree}
            dossierList={initialDossiers}
            groupeAccessById={groupeAccessById}
            isPending={isPending}
            onSave={handleSaveAdministration}
            onCreateGroupe={(formationDossierId) => setModal({ type: "create_groupe", parentId: null, formationDossierId })}
            onEditGroupe={(groupe) => setModal({ type: "edit_groupe", groupe })}
            onDeleteGroupe={handleDeleteGroupe}
            onEditUser={(user) => setModal({ type: "edit_user", user })}
            onRemoveUser={(user) => handleSaveUser(user.id, { groupe_id: null })}
            onAddUser={(userId, groupeId) => handleSaveUser(userId, { groupe_id: groupeId })}
            onSaveAccess={handleSaveGroupeAccess}
            showToast={showToast}
          />
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modal?.type === "create_groupe" && (
        <GroupeFormModal
          parentId={modal.parentId}
          initialFormationDossierId={modal.formationDossierId ?? null}
          allGroupes={groupes}
          dossiers={initialDossiers}
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
          dossiers={initialDossiers}
          isPending={isPending}
          onSave={handleSaveGroupe}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "edit_user" && (
        <EditUserModal
          key={modal.user.id}
          user={modal.user}
          groupes={groupes}
          dossiers={initialDossiers}
          dossierTree={dossierTree}
          matieres={initialMatieres}
          filieres={initialFilieres}
          cours={initialCours}
          selectedMatiereIds={profMatieresByUser.get(modal.user.id) ?? []}
          profMatiereRows={profMatieres.filter((pm) => pm.prof_id === modal.user.id)}
          directAccessIds={profileAccessById.get(modal.user.id) ?? (modal.user.access_dossier_id ? [modal.user.access_dossier_id] : [])}
          excludedAccessIds={profileAccessExclusionsById.get(modal.user.id) ?? []}
          groupeAccessById={groupeAccessById}
          coachingProfile={coachingProfileMap.get(modal.user.id) ?? null}
          isPending={savingUser || isPending}
          onSave={handleSaveUser}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "create_user" && (
        <CreateUserModal
          groupes={groupes}
          dossiers={initialDossiers}
          isPending={savingUser || isPending}
          onCreate={handleCreateUser}
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

      {/* Create class modal */}
      {createClassModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateClassModal(null)} />
          <div className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: "#162233" }}>
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-bold text-white">Nouvelle classe</h3>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>La classe sera créée dans cette université</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const name = (formData.get("className") as string)?.trim();
                if (!name) return;
                const { dossierId, groupCount } = createClassModal;
                setCreateClassModal(null);
                startTransition(async () => {
                  const res = await createGroupe({
                    name,
                    formation_dossier_id: dossierId,
                    color: ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"][groupCount % 6],
                    annee: "2026-2027",
                  });
                  if ("error" in res) { showToast(res.error!, "error"); return; }
                  showToast("Classe créée !", "success");
                  window.location.reload();
                });
              }}
              className="px-6 pb-6 space-y-4"
            >
              <input
                name="className"
                type="text"
                autoFocus
                placeholder="Ex: Classe 5, TD Groupe A..."
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCreateClassModal(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdministrationView({
  formationOffers,
  dossierNamePresets,
  offerBuckets,
  allUsers,
  allGroupes,
  dossierTree,
  dossierList,
  groupeAccessById,
  isPending,
  onSave,
  onCreateGroupe,
  onEditGroupe,
  onDeleteGroupe,
  onEditUser,
  onRemoveUser,
  onAddUser,
  onSaveAccess,
  showToast,
}: {
  formationOffers: FormationOfferSetting[];
  dossierNamePresets: DossierNamePreset[];
  offerBuckets: OfferGroupBucket[];
  allUsers: Profile[];
  allGroupes: Groupe[];
  dossierTree: DossierNode[];
  dossierList: Dossier[];
  groupeAccessById: Map<string, string[]>;
  isPending: boolean;
  onSave: (formationOffers: FormationOfferSetting[], dossierNamePresets: DossierNamePreset[]) => void;
  onCreateGroupe: (formationDossierId: string | null) => void;
  onEditGroupe: (groupe: Groupe) => void;
  onDeleteGroupe: (id: string) => void;
  onEditUser: (user: Profile) => void;
  onRemoveUser: (user: Profile) => void;
  onAddUser: (userId: string, groupeId: string) => void;
  onSaveAccess: (groupeId: string, dossierIds: string[]) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [offers, setOffers] = useState<FormationOfferSetting[]>(formationOffers);
  const [presets, setPresets] = useState<DossierNamePreset[]>(dossierNamePresets);
  const [selectedOfferCode, setSelectedOfferCode] = useState<string>(offerBuckets[0]?.code ?? "");
  const [selectedAdminGroupeId, setSelectedAdminGroupeId] = useState<string | null>(offerBuckets[0]?.groups[0]?.id ?? null);

  const slugifyOfferCode = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  useEffect(() => setOffers(formationOffers), [formationOffers]);
  useEffect(() => setPresets(dossierNamePresets), [dossierNamePresets]);
  useEffect(() => {
    if (!offerBuckets.some((bucket) => bucket.code === selectedOfferCode)) {
      setSelectedOfferCode(offerBuckets[0]?.code ?? "");
    }
  }, [offerBuckets, selectedOfferCode]);

  const selectedOfferBucket = useMemo(
    () => offerBuckets.find((bucket) => bucket.code === selectedOfferCode) ?? offerBuckets[0] ?? null,
    [offerBuckets, selectedOfferCode]
  );

  useEffect(() => {
    if (!selectedOfferBucket) {
      setSelectedAdminGroupeId(null);
      return;
    }

    const selectedStillExists = selectedOfferBucket.groups.some((group) => group.id === selectedAdminGroupeId);
    if (!selectedStillExists) {
      setSelectedAdminGroupeId(selectedOfferBucket.groups[0]?.id ?? null);
    }
  }, [selectedAdminGroupeId, selectedOfferBucket]);

  const selectedAdminGroupe = useMemo(
    () => allGroupes.find((groupe) => groupe.id === selectedAdminGroupeId) ?? null,
    [allGroupes, selectedAdminGroupeId]
  );
  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.code === selectedOfferCode) ?? offers[0] ?? null,
    [offers, selectedOfferCode]
  );

  const normalizedInitialOffers = JSON.stringify(formationOffers);
  const normalizedInitialPresets = JSON.stringify(dossierNamePresets);
  const normalizedOffers = JSON.stringify(offers);
  const normalizedPresets = JSON.stringify(presets);
  const hasChanges = normalizedInitialOffers !== normalizedOffers || normalizedInitialPresets !== normalizedPresets;

  const upsertOfferCode = (offerCode: string, nextCodeRaw: string) => {
    const nextCode = slugifyOfferCode(nextCodeRaw);
    if (!nextCode || nextCode === offerCode) return;

    setOffers((prev) =>
      prev.map((item) => (item.code === offerCode ? { ...item, code: nextCode } : item))
    );
    setPresets((prev) =>
      prev.map((item) =>
        item.formationOffer === offerCode ? { ...item, formationOffer: nextCode } : item
      )
    );
  };

  const handleAddOffer = () => {
    const baseCode = "nouvelle_offre";
    let candidate = baseCode;
    let suffix = 2;
    const existingCodes = new Set(offers.map((offer) => offer.code));

    while (existingCodes.has(candidate)) {
      candidate = `${baseCode}_${suffix}`;
      suffix += 1;
    }

    setOffers((prev) => [
      ...prev,
      {
        code: candidate,
        label: "Nouvelle offre",
        description: "Nouvelle offre à configurer.",
        defaultColor: "#0e1e35",
        enabled: true,
        orderIndex: prev.length,
      },
    ]);
  };

  const handleDeleteOffer = (offerCode: string) => {
    if (!confirm("Supprimer cette offre de formation ? Les presets liés seront aussi retirés.")) return;

    setOffers((prev) =>
      prev
        .filter((offer) => offer.code !== offerCode)
        .map((offer, index) => ({ ...offer, orderIndex: index }))
    );
    setPresets((prev) => prev.filter((preset) => preset.formationOffer !== offerCode));
  };

  return (
    <div className="p-5">
      <section className="rounded-2xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Formations & classes</h2>
              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                Clique sur une offre pour la modifier, ou sur une classe pour gérer ses utilisateurs et ses accès.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddOffer}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ backgroundColor: "rgba(201,168,76,0.16)", color: "#F5D78E" }}
            >
              <Plus size={12} className="mr-1 inline-block" />
              Ajouter une offre
            </button>
          </div>
          <div className="mt-3 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Les suggestions de noms restent en fond, mais ne prennent plus de place ici.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            {offerBuckets.map((bucket) => {
              const isSelected = selectedOfferBucket?.code === bucket.code;
              return (
                <div
                  key={bucket.code}
                  className="rounded-2xl p-3 transition-colors"
                  style={{
                    backgroundColor: isSelected ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isSelected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOfferCode(bucket.code);
                        setSelectedAdminGroupeId(null);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: bucket.color }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{bucket.label}</p>
                        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {bucket.groups.length} classe{bucket.groups.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreateGroupe(bucket.rootDossierId)}
                      className="rounded-lg p-2 text-xs font-semibold"
                      style={{ backgroundColor: "rgba(201,168,76,0.14)", color: "#F5D78E" }}
                      title={`Créer une classe dans ${bucket.label}`}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {bucket.groups.length === 0 ? (
                    <p className="rounded-xl px-3 py-2 text-[11px]" style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)" }}>
                      Aucune classe dans cette offre pour l&apos;instant.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {bucket.groups.map((group) => {
                        const memberCount = allUsers.filter((user) => user.groupe_id === group.id).length;
                        const accessCount = (groupeAccessById.get(group.id) ?? []).length;
                        const selected = selectedAdminGroupeId === group.id;
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => {
                              setSelectedOfferCode(bucket.code);
                              setSelectedAdminGroupeId(group.id);
                            }}
                            className="w-full rounded-xl px-3 py-2 text-left transition-colors"
                            style={{
                              backgroundColor: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                              border: `1px solid ${selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                              <span className="truncate text-sm font-medium text-white">{group.name}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                              <span>{memberCount} membre{memberCount !== 1 ? "s" : ""}</span>
                              <span>{accessCount} accès</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {selectedAdminGroupe ? (
              <GroupeDetail
                groupe={selectedAdminGroupe}
                allGroupes={allGroupes}
                allUsers={allUsers}
                dossierTree={dossierTree}
                dossierList={dossierList}
                accessIds={groupeAccessById.get(selectedAdminGroupe.id) ?? []}
                groupeAccessById={groupeAccessById}
                isPending={isPending}
                onEditGroupe={onEditGroupe}
                onDeleteGroupe={onDeleteGroupe}
                onEditUser={onEditUser}
                onRemoveUser={onRemoveUser}
                onAddUser={(userId) => onAddUser(userId, selectedAdminGroupe.id)}
                onSaveAccess={onSaveAccess}
                showToast={showToast}
              />
            ) : selectedOffer ? (
              <OfferEditorPanel
                offer={selectedOffer}
                offerIndex={offers.findIndex((item) => item.code === selectedOffer.code)}
                offerCount={offers.length}
                linkedClassCount={selectedOfferBucket?.groups.length ?? 0}
                hasChanges={hasChanges}
                isPending={isPending}
                onChange={(changes) => setOffers((prev) => prev.map((item) => item.code === selectedOffer.code ? { ...item, ...changes } : item))}
                onChangeCode={(nextCodeRaw) => upsertOfferCode(selectedOffer.code, nextCodeRaw)}
                onMoveUp={() => setOffers((prev) => {
                  const index = prev.findIndex((item) => item.code === selectedOffer.code);
                  if (index <= 0) return prev;
                  const next = [...prev];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  return next.map((item, itemIndex) => ({ ...item, orderIndex: itemIndex }));
                })}
                onMoveDown={() => setOffers((prev) => {
                  const index = prev.findIndex((item) => item.code === selectedOffer.code);
                  if (index === -1 || index >= prev.length - 1) return prev;
                  const next = [...prev];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  return next.map((item, itemIndex) => ({ ...item, orderIndex: itemIndex }));
                })}
                onDelete={() => handleDeleteOffer(selectedOffer.code)}
                onSave={() => onSave(offers, presets)}
                onCreateClass={() => onCreateGroupe(selectedOfferBucket?.rootDossierId ?? null)}
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                <p className="text-sm font-semibold text-white">Aucune offre disponible</p>
                <p className="mt-2 max-w-md text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Crée une offre de formation, puis tu pourras y rattacher des classes et leurs accès.
                </p>
                <button
                  type="button"
                  onClick={handleAddOffer}
                  className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
                >
                  Créer une offre
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function OfferEditorPanel({
  offer,
  offerIndex,
  offerCount,
  linkedClassCount,
  hasChanges,
  isPending,
  onChange,
  onChangeCode,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSave,
  onCreateClass,
}: {
  offer: FormationOfferSetting;
  offerIndex: number;
  offerCount: number;
  linkedClassCount: number;
  hasChanges: boolean;
  isPending: boolean;
  onChange: (changes: Partial<FormationOfferSetting>) => void;
  onChangeCode: (nextCode: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCreateClass: () => void;
}) {
  return (
    <div className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: offer.defaultColor }} />
            <h3 className="truncate text-lg font-bold text-white">{offer.label}</h3>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: offer.enabled ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.06)",
                color: offer.enabled ? "#86EFAC" : "rgba(255,255,255,0.5)",
              }}
            >
              {offer.enabled ? "Active" : "Masquée"}
            </span>
          </div>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            {linkedClassCount} classe{linkedClassCount !== 1 ? "s" : ""} rattachée{linkedClassCount !== 1 ? "s" : ""} à cette offre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ enabled: !offer.enabled })}
            className="rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.72)" }}
          >
            {offer.enabled ? "Masquer l’offre" : "Activer l’offre"}
          </button>
          <button
            type="button"
            onClick={onCreateClass}
            className="rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ backgroundColor: "rgba(201,168,76,0.16)", color: "#F5D78E" }}
          >
            <Plus size={12} className="mr-1 inline-block" />
            Ajouter une classe
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-red-300"
            style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
          >
            <Trash2 size={12} className="mr-1 inline-block" />
            Supprimer l’offre
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Code</label>
          <input
            value={offer.code}
            onChange={(e) => onChangeCode(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Nom affiché</label>
          <input
            value={offer.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="w-full rounded-xl px-3 py-2 text-sm text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Couleur</label>
          <input
            value={offer.defaultColor}
            onChange={(e) => onChange({ defaultColor: e.target.value })}
            className="w-full rounded-xl px-3 py-2 text-sm text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Description</label>
        <textarea
          value={offer.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="w-full rounded-xl px-3 py-2 text-sm text-white"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offerIndex <= 0}
            onClick={onMoveUp}
            className="rounded-lg px-3 py-1.5 text-xs disabled:opacity-30"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.72)" }}
          >
            Monter
          </button>
          <button
            type="button"
            disabled={offerIndex === -1 || offerIndex >= offerCount - 1}
            onClick={onMoveDown}
            className="rounded-lg px-3 py-1.5 text-xs disabled:opacity-30"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.72)" }}
          >
            Descendre
          </button>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={!hasChanges || isPending}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Enregistrer la formation
        </button>
      </div>
    </div>
  );
}

// ─── GroupTreeNode ─────────────────────────────────────────────────────────────

function OfferGroupSection({
  bucket,
  selectedId,
  users,
  onSelect,
  onAddRootGroup,
  onAddChild,
  onEdit,
  onDelete,
}: {
  bucket: OfferGroupBucket;
  selectedId: string | null;
  users: Profile[];
  onSelect: (id: string) => void;
  onAddRootGroup: (formationDossierId: string | null) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (g: Groupe) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalMembers = bucket.groups.reduce((count, group) => count + users.filter((user) => user.groupe_id === group.id).length, 0);

  return (
    <div className="mb-2 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-white">{bucket.label}</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            {bucket.groups.length} groupe{bucket.groups.length !== 1 ? "s" : ""}{totalMembers > 0 ? ` · ${totalMembers} membres` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAddRootGroup(bucket.rootDossierId)}
          className="rounded p-1 transition-colors"
          style={{ color: "rgba(255,255,255,0.35)" }}
          onMouseOver={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
          onMouseOut={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          title={bucket.code === "__sans_offre__" ? "Ajouter un groupe sans offre liée" : `Ajouter un groupe dans ${bucket.label}`}
        >
          <Plus size={12} />
        </button>
      </div>

      {expanded && (
        <div className="px-2 pb-2">
          {bucket.groups.length === 0 ? (
            <p className="px-3 py-2 text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              Aucun groupe pour cette offre
            </p>
          ) : (
            bucket.groups.map((node) => (
              <GroupTreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                users={users}
                onSelect={onSelect}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

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
  users, groupes, dossiers, filieres, matieres, profMatieresByUser, profMatieres, groupeAccessById, profileAccessById, onEditUser, onCreateUser,
}: {
  users: Profile[];
  groupes: Groupe[];
  dossiers: Dossier[];
  filieres: Filiere[];
  matieres: Matiere[];
  profMatieresByUser: Map<string, string[]>;
  profMatieres: ProfMatiereAssignment[];
  groupeAccessById: Map<string, string[]>;
  profileAccessById: Map<string, string[]>;
  onEditUser: (u: Profile) => void;
  onCreateUser: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterFormationId, setFilterFormationId] = useState("");
  const [filterSubOfferId, setFilterSubOfferId] = useState("");
  const [filterUniversityId, setFilterUniversityId] = useState("");
  const [filterGroupeId, setFilterGroupeId] = useState("");

  // Build group → formation/university mapping
  const dMap = useMemo(() => new Map(dossiers.map(d => [d.id, d])), [dossiers]);

  const getUniversityForGroup = (g: Groupe) => {
    if (!g.formation_dossier_id) return null;
    const d = dMap.get(g.formation_dossier_id);
    return d?.dossier_type === "university" ? d : null;
  };

  const getFormationForGroup = (g: Groupe) => {
    if (!g.formation_dossier_id) return null;
    let d: Dossier | undefined = dMap.get(g.formation_dossier_id);
    while (d) {
      if (d.dossier_type === "offer") return d;
      d = d.parent_id ? dMap.get(d.parent_id) : undefined;
    }
    return null;
  };

  // Build group membership map for fast lookup
  const userGroupeIds = useMemo(() => {
    const m = new Map<string, string>(); // userId → groupeId
    for (const u of users) if (u.groupe_id) m.set(u.id, u.groupe_id);
    return m;
  }, [users]);

  // Helper: get all descendant IDs of a dossier
  const getDescendantIds = useCallback((rootId: string): Set<string> => {
    const ids = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const d of dossiers) {
        if (d.parent_id === parentId && !ids.has(d.id)) {
          ids.add(d.id);
          queue.push(d.id);
        }
      }
    }
    return ids;
  }, [dossiers]);

  // Helper: check if group belongs to a dossier subtree
  const groupBelongsToSubtree = useCallback((g: Groupe, rootId: string): boolean => {
    if (!g.formation_dossier_id) return false;
    if (g.formation_dossier_id === rootId) return true;
    const descendants = getDescendantIds(rootId);
    return descendants.has(g.formation_dossier_id);
  }, [getDescendantIds]);

  // Formations (offers)
  const formations = useMemo(() => {
    return dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index).map(d => {
      const formGroupes = groupes.filter(g => getFormationForGroup(g)?.id === d.id);
      const count = users.filter(u => u.groupe_id && formGroupes.some(g => g.id === u.groupe_id)).length;
      return { id: d.id, name: d.name, count };
    });
  }, [dossiers, groupes, users]);

  // Sub-offers (only when formation is selected and has sub_offer children)
  const filteredSubOffers = useMemo(() => {
    if (!filterFormationId) return [];
    return dossiers.filter(d => d.dossier_type === "sub_offer" && d.parent_id === filterFormationId).sort((a, b) => a.order_index - b.order_index).map(d => {
      const subGroupes = groupes.filter(g => groupBelongsToSubtree(g, d.id));
      const count = users.filter(u => u.groupe_id && subGroupes.some(g => g.id === u.groupe_id)).length;
      return { id: d.id, name: d.name, count };
    });
  }, [dossiers, groupes, users, filterFormationId, groupBelongsToSubtree]);

  // Universities (filtered by selected formation or sub-offer)
  const filteredUniversities = useMemo(() => {
    let unis = dossiers.filter(d => d.dossier_type === "university");
    if (filterSubOfferId) {
      // Show universities under this sub-offer (direct or nested)
      const descendants = getDescendantIds(filterSubOfferId);
      unis = unis.filter(d => d.parent_id === filterSubOfferId || descendants.has(d.id));
    } else if (filterFormationId) {
      // Show universities anywhere under this formation
      const descendants = getDescendantIds(filterFormationId);
      unis = unis.filter(d => descendants.has(d.id) || d.parent_id === filterFormationId);
    }
    return unis.sort((a, b) => a.order_index - b.order_index).map(d => {
      const uniGroupes = groupes.filter(g => groupBelongsToSubtree(g, d.id));
      const count = users.filter(u => u.groupe_id && uniGroupes.some(g => g.id === u.groupe_id)).length;
      return { id: d.id, name: d.name, count };
    });
  }, [dossiers, groupes, users, filterFormationId, filterSubOfferId, getDescendantIds, groupBelongsToSubtree]);

  // Classes (filtered by selected university or higher)
  const filteredClasses = useMemo(() => {
    let cls = groupes.filter(g => g.formation_dossier_id);
    if (filterUniversityId) {
      cls = cls.filter(g => groupBelongsToSubtree(g, filterUniversityId));
    } else if (filterSubOfferId) {
      cls = cls.filter(g => groupBelongsToSubtree(g, filterSubOfferId));
    } else if (filterFormationId) {
      cls = cls.filter(g => getFormationForGroup(g)?.id === filterFormationId);
    }
    return cls.map(g => {
      const count = users.filter(u => u.groupe_id === g.id).length;
      const uni = getUniversityForGroup(g);
      return { id: g.id, name: g.name, uniName: uni?.name ?? "", count, color: g.color };
    });
  }, [groupes, users, filterUniversityId, filterSubOfferId, filterFormationId, groupBelongsToSubtree]);

  // Filtered users
  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    if (q && !`${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(q)) return false;
    if (filterRole === "admin" && !["admin", "superadmin"].includes(u.role)) return false;
    if (filterRole && filterRole !== "admin" && u.role !== filterRole) return false;
    if (filterGroupeId && u.groupe_id !== filterGroupeId) return false;
    if (filterUniversityId && !filterGroupeId) {
      const uniGroupes = groupes.filter(g => groupBelongsToSubtree(g, filterUniversityId));
      if (!uniGroupes.some(g => g.id === u.groupe_id)) return false;
    }
    if (filterSubOfferId && !filterUniversityId && !filterGroupeId) {
      const subGroupes = groupes.filter(g => groupBelongsToSubtree(g, filterSubOfferId));
      if (!subGroupes.some(g => g.id === u.groupe_id)) return false;
    }
    if (filterFormationId && !filterSubOfferId && !filterUniversityId && !filterGroupeId) {
      const formGroupes = groupes.filter(g => getFormationForGroup(g)?.id === filterFormationId);
      if (!formGroupes.some(g => g.id === u.groupe_id)) return false;
    }
    return true;
  }), [users, search, filterRole, filterGroupeId, filterUniversityId, filterSubOfferId, filterFormationId, groupes, groupBelongsToSubtree]);

  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(() => filtered.slice(page * perPage, (page + 1) * perPage), [filtered, page, perPage]);

  useEffect(() => { setPage(0); }, [search, filterRole, filterGroupeId, filterUniversityId, filterSubOfferId, filterFormationId, perPage]);

  const groupMap = useMemo(() => {
    const m = new Map<string, Groupe>();
    for (const g of groupes) m.set(g.id, g);
    return m;
  }, [groupes]);
  const filiereMap = useMemo(() => new Map(filieres.map((filiere) => [filiere.id, filiere])), [filieres]);
  const matiereMap = useMemo(() => new Map(matieres.map((matiere) => [matiere.id, matiere])), [matieres]);

  const profGroupesByUser = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const pm of profMatieres) {
      if (pm.groupe_id) {
        if (!m.has(pm.prof_id)) m.set(pm.prof_id, new Set());
        m.get(pm.prof_id)!.add(pm.groupe_id);
      }
    }
    return m;
  }, [profMatieres]);

  const getAncestorChain = (dossierId: string | null): Dossier[] => {
    const chain: Dossier[] = [];
    let id = dossierId;
    while (id) {
      const d = dMap.get(id);
      if (!d) break;
      chain.unshift(d);
      id = d.parent_id;
    }
    return chain;
  };

  // Build prof detail summaries: matières grouped by formation+university, split by role_type
  type ProfFormationGroup = { formation: string; university: string | null; matieres: string[] };
  type ProfDetail = { cours: ProfFormationGroup[]; contenu: ProfFormationGroup[] };
  const profDetailSummary = useMemo(() => {
    const map = new Map<string, { cours: Map<string, { uni: string | null; mats: string[] }>; contenu: Map<string, { uni: string | null; mats: string[] }> }>();
    for (const pm of profMatieres) {
      if (!map.has(pm.prof_id)) map.set(pm.prof_id, { cours: new Map(), contenu: new Map() });
      const entry = map.get(pm.prof_id)!;
      const matiere = matiereMap.get(pm.matiere_id);
      if (!matiere) continue;
      const matDossier = matiere.dossier_id ? dMap.get(matiere.dossier_id) : null;
      const chain = matDossier ? getAncestorChain(matDossier.id) : [];
      const offer = chain.find(d => d.dossier_type === "offer");
      const uni = chain.find(d => d.dossier_type === "university");
      const groupKey = `${offer?.name ?? "Autre"}||${uni?.name ?? ""}`;
      const formationLabel = offer?.name ?? "Autre";
      const uniLabel = uni?.name?.replace("Université ", "") ?? null;
      const addTo = (target: Map<string, { uni: string | null; mats: string[] }>) => {
        if (!target.has(groupKey)) target.set(groupKey, { uni: uniLabel, mats: [] });
        const arr = target.get(groupKey)!;
        if (!arr.mats.includes(matiere.name)) arr.mats.push(matiere.name);
      };
      if (pm.role_type === "cours" || !pm.role_type) addTo(entry.cours);
      if (pm.role_type === "contenu" || pm.role_type === "qa") addTo(entry.contenu);
    }
    const result = new Map<string, ProfDetail>();
    for (const [profId, entry] of map) {
      const toGroups = (m: Map<string, { uni: string | null; mats: string[] }>) =>
        [...m.entries()].map(([key, v]) => ({ formation: key.split("||")[0], university: v.uni, matieres: v.mats }));
      result.set(profId, { cours: toGroups(entry.cours), contenu: toGroups(entry.contenu) });
    }
    return result;
  }, [profMatieres, matiereMap, dMap]);

  const getUserFormationInfo = (u: Profile) => {
    if (u.role === "eleve") {
      const groupe = u.groupe_id ? groupMap.get(u.groupe_id) : null;
      if (!groupe) return { formation: null, university: null, classe: null };
      const formDossier = groupe.formation_dossier_id ? dMap.get(groupe.formation_dossier_id) : null;
      const chain = formDossier ? getAncestorChain(formDossier.id) : [];
      const offer = chain.find(d => d.dossier_type === "offer");
      const subOffer = chain.find(d => d.dossier_type === "sub_offer");
      const uni = chain.find(d => d.dossier_type === "university");
      return { formation: subOffer ?? offer ?? null, university: uni ?? null, classe: groupe };
    }
    if (u.role === "prof") {
      const gIds = profGroupesByUser.get(u.id);
      if (!gIds || gIds.size === 0) return { formation: null, university: null, classe: null };
      const formations = new Set<string>();
      const universities = new Set<string>();
      const classes: Groupe[] = [];
      for (const gid of gIds) {
        const g = groupMap.get(gid);
        if (!g) continue;
        classes.push(g);
        const formD = g.formation_dossier_id ? dMap.get(g.formation_dossier_id) : null;
        const chain = formD ? getAncestorChain(formD.id) : [];
        const offer = chain.find(d => d.dossier_type === "offer");
        const subOffer = chain.find(d => d.dossier_type === "sub_offer");
        const uni = chain.find(d => d.dossier_type === "university");
        if (subOffer) formations.add(subOffer.name); else if (offer) formations.add(offer.name);
        if (uni) universities.add(uni.name);
      }
      return { formationNames: [...formations], universityNames: [...universities], classes };
    }
    if (u.role === "coach") {
      const groupe = u.groupe_id ? groupMap.get(u.groupe_id) : null;
      if (!groupe) return { formation: null, university: null, classe: null };
      const formDossier = groupe.formation_dossier_id ? dMap.get(groupe.formation_dossier_id) : null;
      const chain = formDossier ? getAncestorChain(formDossier.id) : [];
      const offer = chain.find(d => d.dossier_type === "offer");
      const subOffer = chain.find(d => d.dossier_type === "sub_offer");
      const uni = chain.find(d => d.dossier_type === "university");
      return { formation: subOffer ?? offer ?? null, university: uni ?? null, classe: groupe };
    }
    return { formation: null, university: null, classe: null };
  };

  return (
    <div className="p-5">
      {/* Search + Create */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un utilisateur..."
            className="w-full rounded-lg pl-8 pr-3 py-2 text-sm text-white focus:outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>
        <button
          onClick={onCreateUser}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0"
          style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
        >
          <Plus size={13} />
          Créer un utilisateur
        </button>
      </div>

      {/* Pill filters — cascading: Formation → Sous-offre → Université → Classe → Rôle */}
      <div className="rounded-xl p-3 mb-4 space-y-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Formation */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Formation</span>
          {[{ id: "", name: "Tout", count: users.length }, ...formations].map(f => (
            <button key={f.id} onClick={() => { setFilterFormationId(f.id); setFilterSubOfferId(""); setFilterUniversityId(""); setFilterGroupeId(""); }}
              className="px-2.5 py-1 rounded-full text-[11px] transition-all flex items-center gap-1.5"
              style={{ backgroundColor: filterFormationId === f.id ? "#0e1e35" : "rgba(255,255,255,0.06)", color: filterFormationId === f.id ? "white" : "rgba(255,255,255,0.5)", fontWeight: filterFormationId === f.id ? 600 : 400, border: filterFormationId === f.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
              {f.name} <span className="text-[9px] opacity-60">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Sous-offre — only show when formation has sub-offers */}
        {filterFormationId && filteredSubOffers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Sous-offre</span>
            {[{ id: "", name: "Toutes", count: filtered.length }, ...filteredSubOffers].map(f => (
              <button key={f.id} onClick={() => { setFilterSubOfferId(f.id); setFilterUniversityId(""); setFilterGroupeId(""); }}
                className="px-2.5 py-1 rounded-full text-[11px] transition-all flex items-center gap-1.5"
                style={{ backgroundColor: filterSubOfferId === f.id ? "#0e1e35" : "rgba(255,255,255,0.06)", color: filterSubOfferId === f.id ? "white" : "rgba(255,255,255,0.5)", fontWeight: filterSubOfferId === f.id ? 600 : 400, border: filterSubOfferId === f.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                {f.name} <span className="text-[9px] opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Université — show when formation or sub-offer is selected */}
        {filterFormationId && filteredUniversities.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Université</span>
            {[{ id: "", name: "Toutes", count: filtered.length }, ...filteredUniversities].map(f => (
              <button key={f.id} onClick={() => { setFilterUniversityId(f.id); setFilterGroupeId(""); }}
                className="px-2.5 py-1 rounded-full text-[11px] transition-all flex items-center gap-1.5"
                style={{ backgroundColor: filterUniversityId === f.id ? "#0e1e35" : "rgba(255,255,255,0.06)", color: filterUniversityId === f.id ? "white" : "rgba(255,255,255,0.5)", fontWeight: filterUniversityId === f.id ? 600 : 400, border: filterUniversityId === f.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                {f.name.replace("Université ", "")} <span className="text-[9px] opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Classe — show when university is selected */}
        {filterUniversityId && filteredClasses.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Classe</span>
            {[{ id: "", name: "Toutes", uniName: "", count: filtered.length, color: "" }, ...filteredClasses].map(f => (
              <button key={f.id} onClick={() => setFilterGroupeId(f.id)}
                className="px-2.5 py-1 rounded-full text-[11px] transition-all flex items-center gap-1.5"
                style={{ backgroundColor: filterGroupeId === f.id ? "#0e1e35" : "rgba(255,255,255,0.06)", color: filterGroupeId === f.id ? "white" : "rgba(255,255,255,0.5)", fontWeight: filterGroupeId === f.id ? 600 : 400, border: filterGroupeId === f.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                {f.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />}
                {f.name} <span className="text-[9px] opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Rôle */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Rôle</span>
          {[
            { val: "", label: "Tout", count: users.length },
            { val: "eleve", label: "Élèves", count: users.filter(u => u.role === "eleve").length },
            { val: "coach", label: "Coachs", count: users.filter(u => u.role === "coach").length },
            { val: "prof", label: "Profs", count: users.filter(u => u.role === "prof").length },
            { val: "admin", label: "Admins", count: users.filter(u => ["admin", "superadmin"].includes(u.role)).length },
          ].map(f => (
            <button key={f.val} onClick={() => setFilterRole(f.val)}
              className="px-2.5 py-1 rounded-full text-[11px] transition-all flex items-center gap-1.5"
              style={{ backgroundColor: filterRole === f.val ? "#0e1e35" : "rgba(255,255,255,0.06)", color: filterRole === f.val ? "white" : "rgba(255,255,255,0.5)", fontWeight: filterRole === f.val ? 600 : 400, border: filterRole === f.val ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
              {f.label} <span className="text-[9px] opacity-60">{f.count}</span>
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
              <th colSpan={3} className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Activité</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {paged.map(u => {
              const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.eleve;
              const groupe = u.groupe_id ? groupMap.get(u.groupe_id) : null;
              const info = getUserFormationInfo(u);
              const assignedMatieres = (profMatieresByUser.get(u.id) ?? [])
                .map((matiereId) => matiereMap.get(matiereId)?.name)
                .filter(Boolean) as string[];
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
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.9)" }}>{fullName(u)}</p>
                        <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${rc.bg} ${rc.color}`}>
                      {rc.icon} {rc.label}
                    </span>
                  </td>
                  {u.role === "prof" ? (() => {
                    const detail = profDetailSummary.get(u.id);
                    const hasCours = detail && detail.cours.length > 0;
                    const hasContenu = detail && detail.contenu.length > 0;
                    if (!hasCours && !hasContenu) {
                      return (
                        <td colSpan={3} className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            Aucune matière assignée
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td colSpan={3} className="px-4 py-2.5">
                        <div className="space-y-1.5">
                          {/* Cours section */}
                          {hasCours && detail.cours.map(g => (
                            <div key={`cours-${g.formation}-${g.university}`}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0" style={{ backgroundColor: "rgba(52,211,153,0.12)", color: "rgba(52,211,153,0.9)" }}>
                                  <BookOpen size={9} /> Cours
                                </span>
                                <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>{g.formation}</span>
                                {g.university && <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>· {g.university}</span>}
                                <span className="text-[9px] font-medium" style={{ color: "rgba(52,211,153,0.5)" }}>({g.matieres.length})</span>
                              </div>
                              <div className="flex flex-wrap gap-1 pl-4">
                                {g.matieres.map(m => (
                                  <span key={m} className="inline-flex px-1.5 py-0.5 rounded text-[9px]" style={{ backgroundColor: "rgba(52,211,153,0.08)", color: "rgba(52,211,153,0.75)", border: "1px solid rgba(52,211,153,0.12)" }}>{m}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                          {/* Contenu section */}
                          {hasContenu && detail.contenu.map(g => (
                            <div key={`contenu-${g.formation}-${g.university}`}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0" style={{ backgroundColor: "rgba(96,165,250,0.12)", color: "rgba(96,165,250,0.9)" }}>
                                  <FileText size={9} /> Contenu
                                </span>
                                <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>{g.formation}</span>
                                {g.university && <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>· {g.university}</span>}
                                <span className="text-[9px] font-medium" style={{ color: "rgba(96,165,250,0.5)" }}>({g.matieres.length})</span>
                              </div>
                              <div className="flex flex-wrap gap-1 pl-4">
                                {g.matieres.map(m => (
                                  <span key={m} className="inline-flex px-1.5 py-0.5 rounded text-[9px]" style={{ backgroundColor: "rgba(96,165,250,0.08)", color: "rgba(96,165,250,0.75)", border: "1px solid rgba(96,165,250,0.12)" }}>{m}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })() : (
                    <td colSpan={3} className="px-4 py-3">
                      {info.classe ? (
                        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: info.classe.color }} />
                          {info.classe.name}
                        </span>
                      ) : u.role === "coach" ? (
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Multi-classes</span>
                      ) : (
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/admin/impersonate", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId: u.id }),
                            });
                            const data = await res.json();
                            if (data.access_token) {
                              const url = window.location.origin + "/impersonate#access_token=" + data.access_token + "&refresh_token=" + data.refresh_token;
                              window.open(url, "_blank");
                            } else alert(data.error || "Erreur");
                          } catch { alert("Erreur réseau"); }
                        }}
                        title="Se connecter en tant que cet utilisateur"
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "rgba(201,168,76,0.5)" }}
                        onMouseOver={e => (e.currentTarget.style.color = "#C9A84C")}
                        onMouseOut={e => (e.currentTarget.style.color = "rgba(201,168,76,0.5)")}
                      >
                        <LogIn size={13} />
                      </button>
                      <button
                        onClick={() => onEditUser(u)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                        onMouseOver={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
                        onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
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

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Par page</span>
            <div className="flex gap-1">
              {[25, 50, 100, 200].map(n => (
                <button key={n} onClick={() => setPerPage(n)}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors"
                  style={{
                    backgroundColor: perPage === n ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                    color: perPage === n ? "#C9A84C" : "rgba(255,255,255,0.35)",
                    border: perPage === n ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
              {page * perPage + 1}–{Math.min((page + 1) * perPage, filtered.length)} sur {filtered.length}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-25"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
                ‹
              </button>
              {totalPages <= 7 ? (
                Array.from({ length: totalPages }).map((_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors min-w-[28px]"
                    style={{
                      backgroundColor: page === i ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                      color: page === i ? "#C9A84C" : "rgba(255,255,255,0.4)",
                      border: page === i ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    }}>
                    {i + 1}
                  </button>
                ))
              ) : (
                <>
                  {[0, 1].map(i => (
                    <button key={i} onClick={() => setPage(i)}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors min-w-[28px]"
                      style={{
                        backgroundColor: page === i ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                        color: page === i ? "#C9A84C" : "rgba(255,255,255,0.4)",
                        border: page === i ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.06)",
                      }}>
                      {i + 1}
                    </button>
                  ))}
                  <span className="text-[11px] px-1" style={{ color: "rgba(255,255,255,0.2)" }}>…</span>
                  {page > 2 && page < totalPages - 3 && (
                    <>
                      <button onClick={() => setPage(page)}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold min-w-[28px]"
                        style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}>
                        {page + 1}
                      </button>
                      <span className="text-[11px] px-1" style={{ color: "rgba(255,255,255,0.2)" }}>…</span>
                    </>
                  )}
                  {[totalPages - 2, totalPages - 1].map(i => (
                    <button key={i} onClick={() => setPage(i)}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors min-w-[28px]"
                      style={{
                        backgroundColor: page === i ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                        color: page === i ? "#C9A84C" : "rgba(255,255,255,0.4)",
                        border: page === i ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.06)",
                      }}>
                      {i + 1}
                    </button>
                  ))}
                </>
              )}
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-25"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GroupeDetail ─────────────────────────────────────────────────────────────

function GroupeDetail({
  groupe, allGroupes, allUsers, dossierTree, dossierList, accessIds,
  groupeAccessById,
  isPending, onEditGroupe, onDeleteGroupe, onEditUser, onRemoveUser, onAddUser, onSaveAccess, showToast,
}: {
  groupe: Groupe;
  allGroupes: Groupe[];
  allUsers: Profile[];
  dossierTree: DossierNode[];
  dossierList: Dossier[];
  accessIds: string[];
  groupeAccessById: Map<string, string[]>;
  isPending: boolean;
  onEditGroupe: (g: Groupe) => void;
  onDeleteGroupe: (id: string) => void;
  onEditUser: (u: Profile) => void;
  onRemoveUser: (u: Profile) => void;
  onAddUser: (userId: string) => void;
  onSaveAccess: (groupeId: string, dossierIds: string[]) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [tab, setTab] = useState<"membres" | "acces" | "parametres">("acces");
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
        <AccesTab
          groupe={groupe}
          allGroupes={allGroupes}
          groupeAccessById={groupeAccessById}
          dossierTree={dossierTree}
          dossierList={dossierList}
          initialAccessIds={accessIds}
          isPending={isPending}
          onSave={onSaveAccess}
          showToast={showToast}
        />
      )}
      {tab === "parametres" && (
        <ParamètresTab groupe={groupe} onEdit={onEditGroupe} onDelete={onDeleteGroupe} />
      )}
    </div>
  );
}

// ─── ContentAccessTree ───────────────────────────────────────────────────────
type CoursItem = { id: string; name: string; dossier_id: string | null; matiere_id: string | null; order_index: number; visible: boolean };

function ContentAccessTree({
  groupeId, dossierId, initialDossiers, initialCours,
  groupAccessIds, groupCoursAccessIds,
  setGroupeDossierAcces, setGroupeCoursAcces, saveGroupeDossierAcces,
}: {
  groupeId: string;
  dossierId: string;
  initialDossiers: Dossier[];
  initialCours: CoursItem[];
  groupAccessIds: string[];
  groupCoursAccessIds: Set<string>;
  setGroupeDossierAcces: React.Dispatch<React.SetStateAction<{ groupe_id: string; dossier_id: string; created_at: string }[]>>;
  setGroupeCoursAcces: React.Dispatch<React.SetStateAction<{ groupe_id: string; cours_id: string }[]>>;
  saveGroupeDossierAcces: (groupeId: string, dossierIds: string[]) => Promise<any>;
}) {
  const [contentSearch, setContentSearch] = useState("");
  const cq = contentSearch.toLowerCase();

  const children = initialDossiers.filter(d => d.parent_id === dossierId).sort((a, b) => a.order_index - b.order_index);
  const accessSet = new Set(groupAccessIds);

  // Gather all dossier IDs and cours IDs under this tree for bulk operations
  const allDossierIds = useMemo(() => {
    const ids: string[] = [];
    children.forEach(child => {
      ids.push(child.id);
      initialDossiers.filter(d => d.parent_id === child.id).forEach(sub => ids.push(sub.id));
    });
    return ids;
  }, [children, initialDossiers]);

  const allCoursIds = useMemo(() => {
    const ids: string[] = [];
    children.forEach(child => {
      initialCours.filter(c => c.dossier_id === child.id).forEach(c => ids.push(c.id));
      initialDossiers.filter(d => d.parent_id === child.id).forEach(sub => {
        initialCours.filter(c => c.dossier_id === sub.id).forEach(c => ids.push(c.id));
      });
    });
    return ids;
  }, [children, initialDossiers, initialCours]);

  const allDossierChecked = allDossierIds.length > 0 && allDossierIds.every(id => accessSet.has(id));
  const allCoursChecked = allCoursIds.length > 0 && allCoursIds.every(id => groupCoursAccessIds.has(id));
  const allChecked = allDossierChecked && allCoursChecked;
  const noneChecked = allDossierIds.every(id => !accessSet.has(id)) && allCoursIds.every(id => !groupCoursAccessIds.has(id));

  const toggleAccess = (dosId: string) => {
    const has = accessSet.has(dosId);
    const next = has ? groupAccessIds.filter(id => id !== dosId) : [...groupAccessIds, dosId];
    setGroupeDossierAcces(prev => [
      ...prev.filter(a => a.groupe_id !== groupeId),
      ...next.map(did => ({ groupe_id: groupeId, dossier_id: did, created_at: "" }))
    ]);
    saveGroupeDossierAcces(groupeId, next).catch(() => {});
  };

  const bulkToggleDossiers = (ids: string[], check: boolean) => {
    const current = new Set(groupAccessIds);
    if (check) ids.forEach(id => current.add(id));
    else ids.forEach(id => current.delete(id));
    const next = Array.from(current);
    setGroupeDossierAcces(prev => [
      ...prev.filter(a => a.groupe_id !== groupeId),
      ...next.map(did => ({ groupe_id: groupeId, dossier_id: did, created_at: "" }))
    ]);
    saveGroupeDossierAcces(groupeId, next).catch(() => {});
  };

  const bulkToggleCours = (ids: string[], check: boolean) => {
    const sb = createBrowserClient();
    if (check) {
      const toAdd = ids.filter(id => !groupCoursAccessIds.has(id));
      if (toAdd.length === 0) return;
      setGroupeCoursAcces(prev => [...prev, ...toAdd.map(id => ({ groupe_id: groupeId, cours_id: id }))]);
      sb.from("groupe_cours_acces").insert(toAdd.map(id => ({ groupe_id: groupeId, cours_id: id }))).then(() => {});
    } else {
      const toRemove = ids.filter(id => groupCoursAccessIds.has(id));
      if (toRemove.length === 0) return;
      setGroupeCoursAcces(prev => prev.filter(a => !(a.groupe_id === groupeId && toRemove.includes(a.cours_id))));
      const removeSet = new Set(toRemove);
      removeSet.forEach(cid => {
        sb.from("groupe_cours_acces").delete().eq("groupe_id", groupeId).eq("cours_id", cid).then(() => {});
      });
    }
  };

  const toggleAll = (check: boolean) => {
    bulkToggleDossiers(allDossierIds, check);
    bulkToggleCours(allCoursIds, check);
  };

  // Helpers for per-semester bulk
  const getSemesterDossierIds = (childId: string) => {
    const ids = [childId];
    initialDossiers.filter(d => d.parent_id === childId).forEach(sub => ids.push(sub.id));
    return ids;
  };
  const getSemesterCoursIds = (childId: string) => {
    const ids: string[] = [];
    initialCours.filter(c => c.dossier_id === childId).forEach(c => ids.push(c.id));
    initialDossiers.filter(d => d.parent_id === childId).forEach(sub => {
      initialCours.filter(c => c.dossier_id === sub.id).forEach(c => ids.push(c.id));
    });
    return ids;
  };

  const toggleCoursAccess = (coursId: string) => {
    const has = groupCoursAccessIds.has(coursId);
    setGroupeCoursAcces(prev => has
      ? prev.filter(a => !(a.groupe_id === groupeId && a.cours_id === coursId))
      : [...prev, { groupe_id: groupeId, cours_id: coursId }]
    );
    const sb = createBrowserClient();
    if (has) {
      sb.from("groupe_cours_acces").delete().eq("groupe_id", groupeId).eq("cours_id", coursId).then(() => {});
    } else {
      sb.from("groupe_cours_acces").insert({ groupe_id: groupeId, cours_id: coursId }).then(() => {});
    }
  };

  const matchesSearch = (name: string) => !cq || name.toLowerCase().includes(cq);

  return (
    <div className="space-y-2">
      {/* Toolbar: search + bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={contentSearch}
            onChange={e => setContentSearch(e.target.value)}
            placeholder="Filtrer les contenus..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-7 pr-2 py-1.5 text-[11px] outline-none focus:border-emerald-300 focus:ring-1 focus:ring-emerald-100"
          />
        </div>
        <button
          onClick={() => toggleAll(true)}
          disabled={allChecked}
          className="text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition-colors border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-default"
        >
          Tout cocher
        </button>
        <button
          onClick={() => toggleAll(false)}
          disabled={noneChecked}
          className="text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition-colors border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
        >
          Tout décocher
        </button>
      </div>

      {/* Tree */}
      <div className="space-y-0.5">
        {children.map(child => {
          const subChildren = initialDossiers.filter(d => d.parent_id === child.id).sort((a, b) => a.order_index - b.order_index);
          const childMeta = DOSSIER_TYPE_META[child.dossier_type] as { shortLabel?: string } | undefined;
          const childCours = initialCours.filter(c => c.dossier_id === child.id);
          const hasContent = subChildren.length > 0 || childCours.length > 0;

          // Search filtering
          const filteredSubChildren = subChildren.filter(sub => {
            if (matchesSearch(sub.name)) return true;
            return initialCours.filter(c => c.dossier_id === sub.id).some(c => matchesSearch(c.name));
          });
          const filteredChildCours = childCours.filter(c => matchesSearch(c.name));
          const childVisible = matchesSearch(child.name) || filteredSubChildren.length > 0 || filteredChildCours.length > 0;
          if (cq && !childVisible) return null;

          // Per-semester bulk state
          const semDosIds = getSemesterDossierIds(child.id);
          const semCoursIds = getSemesterCoursIds(child.id);
          const semAllDosChecked = semDosIds.every(id => accessSet.has(id));
          const semAllCoursChecked = semCoursIds.length === 0 || semCoursIds.every(id => groupCoursAccessIds.has(id));
          const semAllChecked = semAllDosChecked && semAllCoursChecked;

          return (
            <details key={child.id} className="group/sem" open={accessSet.has(child.id) || !!cq}>
              <summary className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                {hasContent && <ChevronRight size={12} className="text-gray-400 transition-transform group-open/sem:rotate-90 shrink-0" />}
                {!hasContent && <span className="w-3" />}
                <input
                  type="checkbox"
                  checked={accessSet.has(child.id)}
                  onChange={(e) => { e.stopPropagation(); toggleAccess(child.id); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-gray-800 flex-1">{child.name}</span>
                {/* Per-semester toggle */}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); bulkToggleDossiers(semDosIds, !semAllChecked); bulkToggleCours(semCoursIds, !semAllChecked); }}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                  title={semAllChecked ? "Tout décocher" : "Tout cocher"}
                >
                  {semAllChecked ? "Aucun" : "Tous"}
                </button>
                <span className="text-[9px] text-gray-400 uppercase">{childMeta?.shortLabel ?? ""}</span>
              </summary>

              {/* Sub-level: matières under semester */}
              {subChildren.length > 0 && (
                <div className="ml-9 space-y-0.5 pb-1">
                  {(cq ? filteredSubChildren : subChildren).map(sub => {
                    const subMeta = DOSSIER_TYPE_META[sub.dossier_type] as { shortLabel?: string } | undefined;
                    const subCours2 = initialCours.filter(c => c.dossier_id === sub.id);
                    const filteredCours2 = cq ? subCours2.filter(c => matchesSearch(c.name) || matchesSearch(sub.name)) : subCours2;
                    const hasCours = subCours2.length > 0;

                    // Per-matiere bulk
                    const matCoursIds = subCours2.map(c => c.id);
                    const matAllCoursChecked = matCoursIds.length > 0 && matCoursIds.every(id => groupCoursAccessIds.has(id));

                    return (
                      <details key={sub.id} className="group/mat" open={!!cq}>
                        <summary className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          {hasCours && <ChevronRight size={10} className="text-gray-400 transition-transform group-open/mat:rotate-90 shrink-0" />}
                          {!hasCours && <span className="w-2.5" />}
                          <input
                            type="checkbox"
                            checked={accessSet.has(sub.id)}
                            onChange={(e) => { e.stopPropagation(); toggleAccess(sub.id); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-xs text-gray-700 flex-1">{sub.name}</span>
                          {hasCours && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); bulkToggleCours(matCoursIds, !matAllCoursChecked); }}
                              className="text-[8px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                              title={matAllCoursChecked ? "Décocher les cours" : "Cocher les cours"}
                            >
                              {matAllCoursChecked ? "Aucun" : "Tous"}
                            </button>
                          )}
                          <span className="text-[8px] text-gray-400 uppercase">{subMeta?.shortLabel ?? ""}</span>
                        </summary>
                        {filteredCours2.length > 0 && (
                          <div className="ml-7 space-y-0">
                            {filteredCours2.map(c => (
                              <label key={c.id} className="flex items-center gap-2 py-0.5 px-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={groupCoursAccessIds.has(c.id)}
                                  onChange={() => toggleCoursAccess(c.id)}
                                  className="w-3 h-3 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-[11px] text-gray-600">{c.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}

              {/* Cours directly under this child */}
              {childCours.length > 0 && subChildren.length === 0 && (
                <div className="ml-9 space-y-0 pb-1">
                  {(cq ? filteredChildCours : childCours).map(c => (
                    <label key={c.id} className="flex items-center gap-2 py-0.5 px-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupCoursAccessIds.has(c.id)}
                        onChange={() => toggleCoursAccess(c.id)}
                        className="w-3 h-3 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-[11px] text-gray-600">{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </details>
          );
        })}
        {children.length === 0 && (
          <p className="text-xs text-gray-400 py-2">Aucun contenu sous ce dossier</p>
        )}
      </div>
    </div>
  );
}

// ─── MembresTab ───────────────────────────────────────────────────────────────

function InlineClassMembers({ members, groupeId, allCoaches, groupeColor, onManage, onClickUser }: { members: Profile[]; groupeId: string; allCoaches: Profile[]; groupeColor: string; onManage: () => void; onClickUser?: (u: Profile) => void }) {
  const [search, setSearch] = useState("");
  const [elevesExpanded, setElevesExpanded] = useState(false);
  // Coach assignments for this class
  const [coachIds, setCoachIds] = useState<Set<string>>(new Set());
  const [coachLoaded, setCoachLoaded] = useState(false);
  const [showCoachAdd, setShowCoachAdd] = useState(false);
  const [addCoachId, setAddCoachId] = useState("");

  useEffect(() => {
    const sb = createBrowserClient();
    sb.from("coach_groupe_assignments").select("coach_id").eq("groupe_id", groupeId).then(({ data }) => {
      setCoachIds(new Set((data ?? []).map(r => r.coach_id)));
      setCoachLoaded(true);
    });
  }, [groupeId]);

  const assignedCoaches = allCoaches.filter(c => coachIds.has(c.id));
  const availableCoaches = allCoaches.filter(c => !coachIds.has(c.id));

  const toggleCoach = (coachId: string, add: boolean) => {
    const sb = createBrowserClient();
    if (add) {
      setCoachIds(prev => new Set([...prev, coachId]));
      sb.from("coach_groupe_assignments").upsert({ coach_id: coachId, groupe_id: groupeId }, { onConflict: "coach_id,groupe_id" }).then(() => {});
    } else {
      setCoachIds(prev => { const n = new Set(prev); n.delete(coachId); return n; });
      sb.from("coach_groupe_assignments").delete().eq("coach_id", coachId).eq("groupe_id", groupeId).then(() => {});
    }
    setShowCoachAdd(false);
    setAddCoachId("");
  };

  const profs = members.filter(u => ["prof"].includes(u.role));
  const eleves = members.filter(u => u.role === "eleve");
  const admins = members.filter(u => ["admin", "superadmin"].includes(u.role));

  const q = search.toLowerCase();
  const filterUser = (u: Profile) => !q || `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(q);

  const filteredProfs = profs.filter(filterUser);
  const filteredEleves = eleves.filter(filterUser);
  const filteredAdmins = admins.filter(filterUser);

  // Show expanded if searching
  const showAllEleves = elevesExpanded || !!q;
  const ELEVES_PREVIEW = 8;
  const displayedEleves = showAllEleves ? filteredEleves : filteredEleves.slice(0, ELEVES_PREVIEW);
  const hasMoreEleves = !showAllEleves && filteredEleves.length > ELEVES_PREVIEW;

  const MemberCard = ({ u, color }: { u: Profile; color: string }) => (
    <button
      onClick={() => onClickUser ? onClickUser(u) : onManage()}
      className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-gray-50 transition"
      title={`${u.first_name ?? ""} ${u.last_name ?? ""}\n${u.email}`}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ backgroundColor: color }}>
        {(u.first_name?.[0] || "").toUpperCase()}{(u.last_name?.[0] || "").toUpperCase()}
      </div>
      <span className="text-[9px] text-gray-700 truncate w-full text-center leading-tight font-medium">
        {u.first_name ?? ""} {(u.last_name ?? "").charAt(0)}.
      </span>
    </button>
  );

  return (
    <div className="mt-3 pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between px-2 mb-2">
        <p className="text-[10px] font-bold uppercase text-gray-400">Membres ({members.length})</p>
        <button onClick={onManage} className="text-[9px] font-medium text-blue-600 hover:text-blue-800">+ Gérer</button>
      </div>

      {/* Always show search when there are members */}
      {members.length > 0 && (
        <div className="relative mb-2 px-1">
          <Search size={11} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un membre..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-7 pr-2 py-1.5 text-[11px] outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
          />
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-[10px] text-gray-400 px-2 py-2">Aucun membre</p>
      ) : (
        <div className="space-y-3 px-1">
          {/* Professeurs */}
          {filteredProfs.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase text-amber-500 mb-1 px-1">Professeurs ({filteredProfs.length})</p>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1">
                {filteredProfs.map(u => <MemberCard key={u.id} u={u} color="#D97706" />)}
              </div>
            </div>
          )}

          {/* Coachs — from coach_groupe_assignments */}
          {coachLoaded && (
            <div>
              <div className="flex items-center justify-between mb-1 px-1">
                <p className="text-[9px] font-bold uppercase text-orange-400">Coachs ({assignedCoaches.length})</p>
                {!showCoachAdd && (
                  <button onClick={() => setShowCoachAdd(true)} className="text-[9px] font-medium text-blue-600 hover:text-blue-800">+ Ajouter</button>
                )}
              </div>
              {assignedCoaches.length > 0 && (
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1">
                  {assignedCoaches.filter(filterUser).map(u => (
                    <div key={u.id} className="relative group/coachcard">
                      <MemberCard u={u} color="#EA580C" />
                      <button
                        onClick={() => toggleCoach(u.id, false)}
                        className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/coachcard:opacity-100 transition-opacity"
                        title="Retirer"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {assignedCoaches.length === 0 && !showCoachAdd && (
                <p className="text-[10px] text-gray-400 px-1">Aucun coach assigné</p>
              )}
              {showCoachAdd && (
                <div className="flex items-center gap-2 mt-1 px-1">
                  <select
                    autoFocus
                    value={addCoachId}
                    onChange={e => setAddCoachId(e.target.value)}
                    className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-100 bg-white"
                  >
                    <option value="">Choisir un coach...</option>
                    {availableCoaches.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { if (addCoachId) toggleCoach(addCoachId, true); }}
                    disabled={!addCoachId}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg bg-orange-500 text-white font-medium disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button onClick={() => { setShowCoachAdd(false); setAddCoachId(""); }} className="text-[10px] text-gray-500 hover:text-gray-700">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Élèves — collapsible when many */}
          {filteredEleves.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1 px-1">
                <p className="text-[9px] font-bold uppercase text-blue-400">Élèves ({filteredEleves.length})</p>
                {eleves.length > ELEVES_PREVIEW && !q && (
                  <button
                    onClick={() => setElevesExpanded(p => !p)}
                    className="text-[9px] font-medium text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    {elevesExpanded ? "Réduire" : `Voir tous (${filteredEleves.length})`}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1">
                {displayedEleves.map(u => <MemberCard key={u.id} u={u} color={groupeColor} />)}
              </div>
              {hasMoreEleves && (
                <button
                  onClick={() => setElevesExpanded(true)}
                  className="w-full mt-1 py-1.5 text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-medium"
                >
                  + {filteredEleves.length - ELEVES_PREVIEW} autres élèves
                </button>
              )}
            </div>
          )}

          {/* Admins (if any) */}
          {filteredAdmins.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase text-red-400 mb-1 px-1">Admins ({filteredAdmins.length})</p>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1">
                {filteredAdmins.map(u => <MemberCard key={u.id} u={u} color="#EF4444" />)}
              </div>
            </div>
          )}

          {filteredProfs.length === 0 && filteredEleves.length === 0 && filteredAdmins.length === 0 && (
            <p className="text-[10px] text-gray-400 text-center py-2">Aucun résultat</p>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [memberSearch, setMemberSearch] = useState("");

  const availableUsers = useMemo(() =>
    allUsers.filter(u => u.groupe_id !== groupe.id && (
      !addSearch || `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(addSearch.toLowerCase())
    )),
    [allUsers, groupe.id, addSearch]
  );

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(u => `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`.toLowerCase().includes(q));
  }, [members, memberSearch]);

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

      {/* Search bar */}
      {members.length > 0 && (
        <div className="mb-3 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            placeholder="Rechercher un membre..."
            className="w-full bg-transparent pl-9 pr-3 py-2 text-xs text-white rounded-lg focus:outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.1)", caretColor: "white" }}
          />
        </div>
      )}

      {filteredMembers.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          {members.length === 0 ? "Aucun membre dans ce groupe" : "Aucun résultat"}
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {filteredMembers.map(u => {
            const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.eleve;
            return (
              <div key={u.id} className="group relative flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center transition-colors cursor-pointer"
                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)")}
                onClick={() => onEditUser(u)}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: groupe.color }}>
                  {avatar(u)}
                </div>
                <p className="text-[11px] font-medium leading-tight truncate w-full" style={{ color: "rgba(255,255,255,0.9)" }}>
                  {u.first_name ?? ""} {(u.last_name ?? "").charAt(0)}.
                </p>
                <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${rc.bg} ${rc.color}`}>
                  {rc.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveUser(u); }}
                  title="Retirer du groupe"
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "rgba(239,68,68,0.9)", color: "white" }}>
                  <UserMinus size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AccesTab ─────────────────────────────────────────────────────────────────

function countSelectedNodes(node: DossierNode, ids: Set<string>) {
  return collectNodeIds(node).reduce((count, nodeId) => count + (ids.has(nodeId) ? 1 : 0), 0);
}

function collectExpandableIds(nodes: DossierNode[]) {
  const ids = new Set<string>();
  const visit = (node: DossierNode) => {
    if (node.children.length > 0) ids.add(node.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

function getAncestorIds(nodeId: string, parentMap: Map<string, string | null>) {
  const ancestors: string[] = [];
  let current = parentMap.get(nodeId) ?? null;
  while (current) {
    ancestors.push(current);
    current = parentMap.get(current) ?? null;
  }
  return ancestors;
}

function AccessScopeTree({
  dossierTree,
  dossierList,
  selectedIds,
  inheritedIds = [],
  onChange,
  disabled = false,
  readOnly = false,
  accent = "gold",
}: {
  dossierTree: DossierNode[];
  dossierList: Dossier[];
  selectedIds: string[];
  inheritedIds?: string[];
  onChange?: (nextIds: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  accent?: "gold" | "green" | "red";
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const inheritedSet = useMemo(() => new Set(inheritedIds), [inheritedIds]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectExpandableIds(dossierTree));
  const [accessSearch, setAccessSearch] = useState("");

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of collectExpandableIds(dossierTree)) next.add(id);
      return next;
    });
  }, [dossierTree]);

  const parentMap = useMemo(
    () => new Map(dossierList.map((dossier) => [dossier.id, dossier.parent_id])),
    [dossierList]
  );

  const handleToggle = (node: DossierNode) => {
    if (readOnly || disabled || !onChange) return;

    const next = new Set(selectedSet);
    const subtreeIds = collectNodeIds(node);
    const descendantIds = subtreeIds.slice(1);
    const isDirectSelected = next.has(node.id);

    if (isDirectSelected) {
      subtreeIds.forEach((id) => next.delete(id));
      onChange([...next]);
      return;
    }

    descendantIds.forEach((id) => next.delete(id));
    for (const ancestorId of getAncestorIds(node.id, parentMap)) {
      next.delete(ancestorId);
    }
    next.add(node.id);
    onChange([...next]);
  };

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  if (dossierTree.length === 0) {
    return (
      <div className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
        Aucun dossier disponible
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="mb-3 relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
        <input
          value={accessSearch}
          onChange={e => setAccessSearch(e.target.value)}
          placeholder="Rechercher un contenu..."
          className="w-full bg-transparent pl-9 pr-3 py-2 text-xs text-white rounded-lg focus:outline-none"
          style={{ border: "1px solid rgba(255,255,255,0.1)", caretColor: "white" }}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!readOnly && (
          <button
            type="button"
            onClick={() => onChange?.([])}
            disabled={disabled || selectedIds.length === 0}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.72)" }}
          >
            Tout décocher
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpandedIds(collectExpandableIds(dossierTree))}
          className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.62)" }}
        >
          Tout déplier
        </button>
        <button
          type="button"
          onClick={() => setExpandedIds(new Set())}
          className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.62)" }}
        >
          Tout replier
        </button>
      </div>

      <div className="space-y-1">
        {dossierTree.filter(node => {
          if (!accessSearch.trim()) return true;
          const q = accessSearch.toLowerCase();
          // Show node if it or any descendant matches
          const matches = (n: DossierNode): boolean =>
            n.name.toLowerCase().includes(q) || n.children.some(matches);
          return matches(node);
        }).map((node) => (
          <AccessScopeTreeNode
            key={node.id}
            node={node}
            dossierList={dossierList}
            depth={0}
            selectedSet={selectedSet}
            inheritedSet={inheritedSet}
            expandedIds={accessSearch.trim() ? new Set(dossierList.map(d => d.id)) : expandedIds}
            readOnly={readOnly}
            disabled={disabled}
            accent={accent}
            onToggleExpanded={toggleExpanded}
            onToggleSelection={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}

function AccessScopeTreeNode({
  node,
  dossierList,
  depth,
  selectedSet,
  inheritedSet,
  expandedIds,
  readOnly,
  disabled,
  accent,
  onToggleExpanded,
  onToggleSelection,
}: {
  node: DossierNode;
  dossierList: Dossier[];
  depth: number;
  selectedSet: Set<string>;
  inheritedSet: Set<string>;
  expandedIds: Set<string>;
  readOnly: boolean;
  disabled: boolean;
  accent: "gold" | "green" | "red";
  onToggleExpanded: (nodeId: string) => void;
  onToggleSelection: (node: DossierNode) => void;
}) {
  const expanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const directChecked = selectedSet.has(node.id);
  const inheritedChecked = !directChecked && inheritedSet.has(node.id);
  const selectedDescendants = node.children.reduce((count, child) => count + countSelectedNodes(child, selectedSet), 0);
  const inheritedDescendants = node.children.reduce((count, child) => count + countSelectedNodes(child, inheritedSet), 0);
  const partial = !directChecked && selectedDescendants > 0;
  const inheritedPartial = !inheritedChecked && inheritedDescendants > 0;
  const accentColor =
    accent === "gold" ? "#E3C286" :
    accent === "green" ? "#86EFAC" :
    "#FCA5A5";
  const accentBg =
    accent === "gold" ? "rgba(201,168,76,0.16)" :
    accent === "green" ? "rgba(16,185,129,0.16)" :
    "rgba(239,68,68,0.16)";

  return (
    <div>
      <div
        className="flex items-start gap-2 rounded-2xl px-2 py-2 transition-colors"
        style={{
          marginLeft: depth * 18,
          backgroundColor: directChecked || inheritedChecked || partial || inheritedPartial
            ? "rgba(255,255,255,0.05)"
            : "transparent",
        }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpanded(node.id)}
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
        </button>

        <button
          type="button"
          onClick={() => onToggleSelection(node)}
          disabled={readOnly || disabled}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all disabled:cursor-default"
          style={{
            borderColor: directChecked || partial ? accentColor : inheritedChecked || inheritedPartial ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.18)",
            backgroundColor: directChecked ? accentColor : partial ? accentBg : inheritedChecked ? "rgba(255,255,255,0.08)" : "transparent",
            color: directChecked ? "#0e1e35" : partial || inheritedChecked || inheritedPartial ? accentColor : "transparent",
          }}
        >
          {directChecked ? (
            <Check size={11} />
          ) : partial || inheritedChecked || inheritedPartial ? (
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: accentColor }} />
          ) : null}
        </button>

        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${node.color}22`, color: node.color }}>
          {directChecked || inheritedChecked ? <FolderOpen size={14} /> : <Folder size={14} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium leading-tight" style={{ color: directChecked || inheritedChecked || partial || inheritedPartial ? "white" : "rgba(255,255,255,0.72)" }}>
              {node.name}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}>
              {DOSSIER_TYPE_META[node.dossier_type]?.shortLabel ?? "Dossier"}
            </span>
            {directChecked && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: accentBg, color: accentColor }}>
                {accent === "red" ? "Retiré" : "Direct"}
              </span>
            )}
            {inheritedChecked && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#C7D2FE" }}>
                Hérité
              </span>
            )}
            {partial && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: accentBg, color: accentColor }}>
                {selectedDescendants} sous-niveau{selectedDescendants > 1 ? "x" : ""}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.38)" }}>
            {getDossierPathLabel(node.id, dossierList) || node.name}
          </p>
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <AccessScopeTreeNode
              key={child.id}
              node={child}
              dossierList={dossierList}
              depth={depth + 1}
              selectedSet={selectedSet}
              inheritedSet={inheritedSet}
              expandedIds={expandedIds}
              readOnly={readOnly}
              disabled={disabled}
              accent={accent}
              onToggleExpanded={onToggleExpanded}
              onToggleSelection={onToggleSelection}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccessBadges({
  title,
  dossierIds,
  dossiers,
  accent = "gold",
  emptyLabel,
}: {
  title: string;
  dossierIds: string[];
  dossiers: Dossier[];
  accent?: "gold" | "green" | "red";
  emptyLabel: string;
}) {
  const bg =
    accent === "gold" ? "rgba(201,168,76,0.14)" :
    accent === "green" ? "rgba(16,185,129,0.14)" :
    "rgba(239,68,68,0.14)";
  const color =
    accent === "gold" ? "#F5D78E" :
    accent === "green" ? "#86EFAC" :
    "#FCA5A5";

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {dossierIds.length === 0 ? (
          <span className="rounded-full px-3 py-1 text-[11px]" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}>
            {emptyLabel}
          </span>
        ) : (
          dossierIds.map((dossierId) => (
            <span
              key={dossierId}
              className="inline-flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-[11px]"
              style={{ backgroundColor: bg, color }}
            >
              <Folder size={10} />
              <span className="truncate">{getDossierPathLabel(dossierId, dossiers)}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function AccesTab({
  groupe,
  allGroupes,
  groupeAccessById,
  dossierTree,
  dossierList,
  initialAccessIds,
  isPending,
  onSave,
}: {
  groupe: Groupe;
  allGroupes: Groupe[];
  groupeAccessById: Map<string, string[]>;
  dossierTree: DossierNode[];
  dossierList: Dossier[];
  initialAccessIds: string[];
  isPending: boolean;
  onSave: (groupeId: string, dossierIds: string[]) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [accessIds, setAccessIds] = useState<string[]>(initialAccessIds);
  const [showDuplicateDropdown, setShowDuplicateDropdown] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<Groupe | null>(null);

  useEffect(() => {
    setAccessIds(initialAccessIds);
  }, [initialAccessIds, groupe.id]);

  const normalizedInitial = [...initialAccessIds].sort().join("|");
  const normalizedCurrent = [...accessIds].sort().join("|");
  const hasChanges = normalizedInitial !== normalizedCurrent;

  // Other groups that have at least one access set (exclude current)
  const groupesWithAccess = useMemo(
    () => allGroupes.filter(g => g.id !== groupe.id && (groupeAccessById.get(g.id) ?? []).length > 0),
    [allGroupes, groupe.id, groupeAccessById]
  );

  function handleDuplicate(source: Groupe) {
    const sourceIds = groupeAccessById.get(source.id) ?? [];
    setAccessIds(sourceIds);
    setShowDuplicateDropdown(false);
    setDuplicateConfirm(source);
    setTimeout(() => setDuplicateConfirm(null), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.16)" }}>
        <p className="text-sm font-semibold" style={{ color: "#A7F3D0" }}>
          Les membres de cette classe héritent automatiquement de ce périmètre.
        </p>
        <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
          Tu peux donc définir le niveau d&apos;accès une seule fois ici, puis simplement rattacher les élèves ou les professeurs à la bonne classe.
        </p>
      </div>

      {/* Duplicate from another class */}
      {groupesWithAccess.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDuplicateDropdown(p => !p)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all w-full"
            style={{
              backgroundColor: showDuplicateDropdown ? "rgba(201,168,76,0.15)" : "rgba(201,168,76,0.08)",
              border: "1px solid rgba(201,168,76,0.25)",
              color: "#E3C286",
            }}
          >
            <Copy size={13} />
            Dupliquer les accès d&apos;une autre classe
            <ChevronDown size={12} className="ml-auto" style={{ transform: showDuplicateDropdown ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>

          {showDuplicateDropdown && (
            <div
              className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-hidden"
              style={{ backgroundColor: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
            >
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                Choisir la classe source
              </p>
              <div className="max-h-48 overflow-y-auto">
                {groupesWithAccess.map(g => {
                  const count = (groupeAccessById.get(g.id) ?? []).length;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => handleDuplicate(g)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                      style={{ color: "rgba(255,255,255,0.8)" }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: g.color }}>
                        {g.name[0].toUpperCase()}
                      </span>
                      <span className="flex-1 text-xs font-medium truncate">{g.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "rgba(52,211,153,0.12)", color: "#34D399" }}>
                        {count} accès
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation banner after duplicate */}
      {duplicateConfirm && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)", color: "#E3C286" }}>
          <Check size={13} />
          Accès de <strong className="mx-1">{duplicateConfirm.name}</strong> appliqués — modifie ou enregistre ci-dessous.
        </div>
      )}

      <AccessBadges
        title="Accès de la classe"
        dossierIds={accessIds}
        dossiers={dossierList}
        accent="green"
        emptyLabel="Aucun accès de classe défini"
      />

      <AccessScopeTree
        dossierTree={dossierTree}
        dossierList={dossierList}
        selectedIds={accessIds}
        onChange={setAccessIds}
        disabled={isPending}
        accent="green"
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSave(groupe.id, accessIds)}
          disabled={!hasChanges || isPending}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#34D399", color: "#052e28" }}
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Enregistrer les accès de classe
        </button>
      </div>
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
  groupe, parentId, initialFormationDossierId, allGroupes, dossiers, isPending, onSave, onClose,
}: {
  groupe?: Groupe;
  parentId: string | null;
  initialFormationDossierId?: string | null;
  allGroupes: Groupe[];
  dossiers: Dossier[];
  isPending: boolean;
  onSave: (data: { id?: string; name: string; color: string; annee?: string; description?: string; parent_id?: string | null; formation_dossier_id?: string | null }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(groupe?.name ?? "");
  const [color, setColor] = useState(groupe?.color ?? "#6366F1");
  const [annee, setAnnee] = useState(groupe?.annee ?? "");
  const [description, setDescription] = useState(groupe?.description ?? "");
  const [selectedParentId, setSelectedParentId] = useState<string | null>(groupe?.parent_id ?? parentId);
  const [formationDossierId, setFormationDossierId] = useState<string | null>(groupe?.formation_dossier_id ?? initialFormationDossierId ?? null);
  const dossierMap = useMemo(() => new Map(dossiers.map((dossier) => [dossier.id, dossier])), [dossiers]);
  const offerRoots = useMemo(
    () =>
      dossiers
        .filter((dossier) => dossier.dossier_type === "offer")
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [dossiers]
  );

  const getOfferRootId = useCallback((dossierId: string | null | undefined) => {
    let currentId = dossierId ?? null;
    while (currentId) {
      const current = dossierMap.get(currentId);
      if (!current) break;
      if (current.dossier_type === "offer") return current.id;
      currentId = current.parent_id;
    }
    return null;
  }, [dossierMap]);

  const initialOfferRootId = useMemo(
    () => getOfferRootId(groupe?.formation_dossier_id ?? initialFormationDossierId ?? null),
    [getOfferRootId, groupe?.formation_dossier_id, initialFormationDossierId]
  );
  const [offerRootId, setOfferRootId] = useState<string | null>(initialOfferRootId ?? offerRoots[0]?.id ?? null);

  useEffect(() => {
    setOfferRootId(initialOfferRootId ?? offerRoots[0]?.id ?? null);
  }, [initialOfferRootId, offerRoots]);

  const selectedOfferRoot = useMemo(
    () => offerRoots.find((offer) => offer.id === offerRootId) ?? null,
    [offerRootId, offerRoots]
  );
  const isUniversityScopedOffer = ["prepa_pass", "prepa_las", "prepa_lsps"].includes(selectedOfferRoot?.formation_offer ?? "");

  const offerAnchorOptions = useMemo(() => {
    if (!selectedOfferRoot) return [];

    const directChildren = dossiers
      .filter((dossier) => dossier.parent_id === selectedOfferRoot.id)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    const options = isUniversityScopedOffer
      ? directChildren.filter((dossier) => dossier.dossier_type === "university")
      : [
          selectedOfferRoot,
          ...directChildren.filter((dossier) => dossier.dossier_type !== "subject"),
        ];

    if (formationDossierId && !options.some((option) => option.id === formationDossierId)) {
      const current = dossierMap.get(formationDossierId);
      if (current && getOfferRootId(current.id) === selectedOfferRoot.id) {
        return [current, ...options];
      }
    }

    return options;
  }, [dossiers, dossierMap, formationDossierId, getOfferRootId, isUniversityScopedOffer, selectedOfferRoot]);

  useEffect(() => {
    if (!selectedOfferRoot) {
      setFormationDossierId(null);
      return;
    }

    if (offerAnchorOptions.some((option) => option.id === formationDossierId)) {
      return;
    }

    const defaultOption = offerAnchorOptions[0] ?? null;
    setFormationDossierId(defaultOption?.id ?? selectedOfferRoot.id);
  }, [formationDossierId, offerAnchorOptions, selectedOfferRoot]);

  const availableParents = useMemo(
    () =>
      allGroupes.filter((currentGroup) => {
        if (currentGroup.id === groupe?.id) return false;
        if (!offerRootId) return true;
        return getOfferRootId(currentGroup.formation_dossier_id) === offerRootId;
      }),
    [allGroupes, getOfferRootId, groupe?.id, offerRootId]
  );
  const selectedParent = useMemo(
    () => allGroupes.find((currentGroup) => currentGroup.id === selectedParentId) ?? null,
    [allGroupes, selectedParentId]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-bold text-white">
            {groupe ? "Modifier la classe / promo" : "Nouvelle classe / promo"}
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
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Offre de formation</label>
            <div className="grid grid-cols-2 gap-2">
              {offerRoots.map((offer) => {
                const selected = offer.id === offerRootId;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => {
                      setOfferRootId(offer.id);
                      setSelectedParentId(null);
                    }}
                    className="rounded-xl p-3 text-left transition-colors"
                    style={{
                      backgroundColor: selected ? "rgba(201,168,76,0.16)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${selected ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: offer.color }} />
                      <p className="text-sm font-semibold text-white">{offer.name}</p>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {DOSSIER_TYPE_META[offer.dossier_type]?.shortLabel ?? "Offre"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
              {isUniversityScopedOffer ? "Université de rattachement" : "Niveau de rattachement"}
            </label>
            <div className="space-y-2">
              {offerAnchorOptions.map((option) => {
                const selected = formationDossierId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormationDossierId(option.id)}
                    className="w-full rounded-xl px-3 py-3 text-left transition-colors"
                    style={{
                      backgroundColor: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${selected ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {option.dossier_type === "university" ? (
                        <Building2 size={14} style={{ color: "#86EFAC" }} />
                      ) : (
                        <FolderOpen size={14} style={{ color: "#93C5FD" }} />
                      )}
                      <p className="text-sm font-medium text-white">{option.name}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                      >
                        {DOSSIER_TYPE_META[option.dossier_type]?.shortLabel ?? "Dossier"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {getDossierPathLabel(option.id, dossiers)}
                    </p>
                  </button>
                );
              })}
              {offerAnchorOptions.length === 0 && (
                <div
                  className="rounded-xl px-3 py-3 text-xs"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}
                >
                  {isUniversityScopedOffer
                    ? "Ajoute d’abord une université dans l’arborescence de cette offre pour pouvoir y rattacher une classe."
                    : "Ajoute d’abord un niveau pédagogique dans cette offre pour pouvoir y rattacher une classe."}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
              Promo / classe parente
            </label>
            {selectedParent ? (
              <div className="mb-2 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-medium text-white">{selectedParent.name}</p>
                <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Sous-groupe de cette promo / classe
                </p>
              </div>
            ) : null}
            <select
              value={selectedParentId ?? ""}
              onChange={e => setSelectedParentId(e.target.value || null)}
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="">Aucune, créer une classe racine</option>
              {availableParents.map((currentGroup) => (
                <option key={currentGroup.id} value={currentGroup.id}>
                  {currentGroup.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              Utilise ça seulement si tu crées une sous-classe dans une promo existante.
            </p>
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
            onClick={() => onSave({ id: groupe?.id, name, color, annee: annee || undefined, description: description || undefined, parent_id: selectedParentId, formation_dossier_id: formationDossierId })}
            disabled={!name.trim() || !formationDossierId || isPending}
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

// ─── CreateUserModal ──────────────────────────────────────────────────────────

function CreateUserModal({
  groupes, dossiers, isPending, onCreate, onClose,
}: {
  groupes: Groupe[];
  dossiers: Dossier[];
  isPending: boolean;
  onCreate: (data: { first_name: string; last_name: string; email: string; password: string; role: UserRole; groupe_id?: string | null }) => void;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("eleve");
  const [groupeId, setGroupeId] = useState<string | null>(null);
  const [selOffer, setSelOffer] = useState("");
  const [selUni, setSelUni] = useState("");

  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unis = useMemo(() => selOffer ? dossiers.filter(d => d.dossier_type === "university" && d.parent_id === selOffer) : [], [dossiers, selOffer]);
  const classes = useMemo(() => selUni ? groupes.filter(g => g.formation_dossier_id === selUni) : [], [groupes, selUni]);

  const canSubmit = email.trim() && password.length >= 6;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: "#C9A84C" }}>
              <Plus size={14} />
            </div>
            <p className="text-sm font-bold text-white">Créer un utilisateur</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}>
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(90vh-144px)]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Prénom</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Nom</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Email *</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }} />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                  className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Mot de passe *</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Min. 6 caractères"
                className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Rôle</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(ROLE_CONFIG).map(([key, rc]) => (
                <button key={key} onClick={() => setRole(key as UserRole)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${role === key ? `${rc.bg} ${rc.color} border-current` : "border-white/10 text-white/40 hover:bg-white/5"}`}>
                  {rc.icon} {rc.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Classe (optionnel)</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Formation</span>
                <button onClick={() => { setSelOffer(""); setSelUni(""); setGroupeId(null); }}
                  className="px-2.5 py-1 rounded-full text-[11px]"
                  style={{ backgroundColor: !selOffer ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: !selOffer ? "#E3C286" : "rgba(255,255,255,0.5)", border: !selOffer ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                  Aucune
                </button>
                {offers.map(o => (
                  <button key={o.id} onClick={() => { setSelOffer(o.id); setSelUni(""); setGroupeId(null); }}
                    className="px-2.5 py-1 rounded-full text-[11px]"
                    style={{ backgroundColor: selOffer === o.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: selOffer === o.id ? "#E3C286" : "rgba(255,255,255,0.5)", border: selOffer === o.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                    {o.name}
                  </button>
                ))}
              </div>
              {selOffer && unis.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Université</span>
                  {unis.map(u => (
                    <button key={u.id} onClick={() => { setSelUni(u.id); setGroupeId(null); }}
                      className="px-2.5 py-1 rounded-full text-[11px]"
                      style={{ backgroundColor: selUni === u.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: selUni === u.id ? "#E3C286" : "rgba(255,255,255,0.5)", border: selUni === u.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                      {u.name.replace("Université ", "")}
                    </button>
                  ))}
                </div>
              )}
              {selUni && classes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Classe</span>
                  {classes.map(c => (
                    <button key={c.id} onClick={() => setGroupeId(c.id)}
                      className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5"
                      style={{ backgroundColor: groupeId === c.id ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", color: groupeId === c.id ? "#6EE7B7" : "rgba(255,255,255,0.5)", border: groupeId === c.id ? "1px solid rgba(52,211,153,0.3)" : "1px solid transparent" }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            Annuler
          </button>
          <button
            onClick={() => onCreate({ first_name: firstName, last_name: lastName, email, password, role, groupe_id: groupeId })}
            disabled={!canSubmit || isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
            {isPending && <Loader2 size={11} className="animate-spin" />}
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditUserModal ────────────────────────────────────────────────────────────

function EditUserModal({
  user, groupes, dossiers, dossierTree, matieres, filieres, cours, selectedMatiereIds, profMatiereRows, directAccessIds, excludedAccessIds, groupeAccessById, coachingProfile, isPending, onSave, onClose,
}: {
  user: Profile;
  groupes: Groupe[];
  dossiers: Dossier[];
  dossierTree: DossierNode[];
  matieres: Matiere[];
  cours: { id: string; name: string; dossier_id: string | null; matiere_id: string | null; order_index: number; visible: boolean }[];
  filieres: Filiere[];
  selectedMatiereIds: string[];
  profMatiereRows: ProfMatiereAssignment[];
  directAccessIds: string[];
  excludedAccessIds: string[];
  groupeAccessById: Map<string, string[]>;
  coachingProfile: { student_id: string; niveau_initial: number | null; mental_initial: number | null; niveau_progressif: number | null; mental_progressif: number | null } | null;
  isPending: boolean;
  onSave: (userId: string, changes: AdminUserChanges) => void;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState(user.role);
  const [etiquettes, setEtiquettes] = useState<string[]>(user.etiquettes ?? []);
  const [newEtiquette, setNewEtiquette] = useState("");
  const [niveauInitial, setNiveauInitial] = useState<number>(coachingProfile?.niveau_initial ?? 50);
  const [mentalInitial, setMentalInitial] = useState<number>(coachingProfile?.mental_initial ?? 50);
  const [niveauProgressif, setNiveauProgressif] = useState<number>(coachingProfile?.niveau_progressif ?? 50);
  const [mentalProgressif, setMentalProgressif] = useState<number>(coachingProfile?.mental_progressif ?? 50);
  const [groupeId, setGroupeId] = useState<string | null>(user.groupe_id);
  // Cascade state for class selector
  const [selOfferForUser, setSelOfferForUser] = useState(() => {
    if (!user.groupe_id) return "";
    const g = groupes.find(gr => gr.id === user.groupe_id);
    if (!g?.formation_dossier_id) return "";
    let d = dossiers.find(dd => dd.id === g.formation_dossier_id);
    while (d) { if (d.dossier_type === "offer") return d.id; d = d.parent_id ? dossiers.find(dd => dd.id === d!.parent_id) : undefined; }
    return "";
  });
  const [selUniForUser, setSelUniForUser] = useState(() => {
    if (!user.groupe_id) return "";
    const g = groupes.find(gr => gr.id === user.groupe_id);
    if (!g?.formation_dossier_id) return "";
    const d = dossiers.find(dd => dd.id === g.formation_dossier_id);
    return d?.dossier_type === "university" ? d.id : "";
  });
  const [filiereId, setFiliereId] = useState<string | null>(user.filiere_id);
  const [personalAccessIds, setPersonalAccessIds] = useState<string[]>(directAccessIds);
  const [excludedInheritedAccessIds, setExcludedInheritedAccessIds] = useState<string[]>(excludedAccessIds);
  const [matiereIds, setMatiereIds] = useState<string[]>(selectedMatiereIds);
  // Role-type specific matiere assignments (2 sections: cours + qa/contenu merged)
  // coursAssignments: Map<matiere_id, Set<groupe_id>> — each matière maps to the classes assigned
  const [coursAssignments, setCoursAssignments] = useState<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    for (const r of profMatiereRows.filter((r) => r.role_type === "cours" || !r.role_type)) {
      if (!map.has(r.matiere_id)) map.set(r.matiere_id, new Set());
      if (r.groupe_id) map.get(r.matiere_id)!.add(r.groupe_id);
    }
    return map;
  });
  const [qaContenuMatIds, setQaContenuMatIds] = useState<string[]>(profMatiereRows.filter((r) => r.role_type === "qa" || r.role_type === "contenu").map((r) => r.matiere_id));
  // Coach class assignments
  const [coachGroupeIds, setCoachGroupeIds] = useState<Set<string>>(new Set());
  const [coachGroupeIdsLoaded, setCoachGroupeIdsLoaded] = useState(false);
  useEffect(() => {
    if (user.role !== "coach" && role !== "coach") return;
    const sb = createBrowserClient();
    sb.from("coach_groupe_assignments").select("groupe_id").eq("coach_id", user.id).then(({ data }) => {
      setCoachGroupeIds(new Set((data ?? []).map(r => r.groupe_id)));
      setCoachGroupeIdsLoaded(true);
    });
  }, [user.id, user.role, role]);
  const [coachFormation, setCoachFormation] = useState("");
  const [coachUni, setCoachUni] = useState("");
  // Cascade filters per section — auto-detect from existing assignments
  const [coursFormation, setCoursFormation] = useState(() => {
    const coursRows = profMatiereRows.filter(r => r.role_type === "cours" || !r.role_type);
    if (coursRows.length === 0) return "";
    // Find formation from first matiere's dossier ancestry
    const firstMat = matieres.find(m => m.id === coursRows[0].matiere_id);
    if (!firstMat?.dossier_id) return "";
    let d = dossiers.find(dd => dd.id === firstMat.dossier_id);
    while (d) { if (d.dossier_type === "offer") return d.id; d = d.parent_id ? dossiers.find(dd => dd.id === d!.parent_id) : undefined; }
    return "";
  });
  const [coursUni, setCoursUni] = useState(() => {
    const coursRows = profMatiereRows.filter(r => r.role_type === "cours" || !r.role_type);
    if (coursRows.length === 0) return "";
    const firstMat = matieres.find(m => m.id === coursRows[0].matiere_id);
    if (!firstMat?.dossier_id) return "";
    let d = dossiers.find(dd => dd.id === firstMat.dossier_id);
    while (d) { if (d.dossier_type === "university") return d.id; d = d.parent_id ? dossiers.find(dd => dd.id === d!.parent_id) : undefined; }
    return "";
  });
  const [qaFormation, setQaFormation] = useState(() => {
    const qaRows = profMatiereRows.filter(r => r.role_type === "qa" || r.role_type === "contenu");
    if (qaRows.length === 0) return "";
    const firstMat = matieres.find(m => m.id === qaRows[0].matiere_id);
    if (!firstMat?.dossier_id) return "";
    let d = dossiers.find(dd => dd.id === firstMat.dossier_id);
    while (d) { if (d.dossier_type === "offer") return d.id; d = d.parent_id ? dossiers.find(dd => dd.id === d!.parent_id) : undefined; }
    return "";
  });
  const [qaUni, setQaUni] = useState(() => {
    const qaRows = profMatiereRows.filter(r => r.role_type === "qa" || r.role_type === "contenu");
    if (qaRows.length === 0) return "";
    const firstMat = matieres.find(m => m.id === qaRows[0].matiere_id);
    if (!firstMat?.dossier_id) return "";
    let d = dossiers.find(dd => dd.id === firstMat.dossier_id);
    while (d) { if (d.dossier_type === "university") return d.id; d = d.parent_id ? dossiers.find(dd => dd.id === d!.parent_id) : undefined; }
    return "";
  });
  const groupeMap = useMemo(() => new Map(groupes.map((groupe) => [groupe.id, groupe])), [groupes]);
  const currentSelectedMatiereSignature = [...selectedMatiereIds].sort().join("|");
  const currentDirectAccessSignature = [...directAccessIds].sort().join("|");
  const currentExcludedAccessSignature = [...excludedAccessIds].sort().join("|");
  const initialCoursAssignmentSignature = useMemo(() => {
    const entries: string[] = [];
    for (const r of profMatiereRows.filter((r) => r.role_type === "cours" || !r.role_type)) {
      entries.push(`${r.matiere_id}:${r.groupe_id ?? ""}`);
    }
    return entries.sort().join("|");
  }, [profMatiereRows]);
  const initialQaMatSignature = useMemo(() => profMatiereRows.filter((r) => r.role_type === "qa" || r.role_type === "contenu").map((r) => r.matiere_id).sort().join("|"), [profMatiereRows]);

  useEffect(() => {
    setPersonalAccessIds(directAccessIds);
  }, [currentDirectAccessSignature, user.id]);

  useEffect(() => {
    setExcludedInheritedAccessIds(excludedAccessIds);
  }, [currentExcludedAccessSignature, user.id]);

  useEffect(() => {
    setMatiereIds(selectedMatiereIds);
  }, [currentSelectedMatiereSignature, user.id]);

  const matieresByDossier = useMemo(() => {
    const map = new Map<string, Matiere[]>();
    for (const matiere of matieres) {
      const current = map.get(matiere.dossier_id) ?? [];
      current.push(matiere);
      map.set(matiere.dossier_id, current);
    }
    return map;
  }, [matieres]);

  const normalizedCurrentMatieres = currentSelectedMatiereSignature;
  const normalizedNextMatieres = [...matiereIds].sort().join("|");
  const normalizedCurrentDirectAccess = currentDirectAccessSignature;
  const normalizedNextDirectAccess = [...personalAccessIds].sort().join("|");
  const normalizedCurrentExcludedAccess = currentExcludedAccessSignature;
  const normalizedNextExcludedAccess = [...excludedInheritedAccessIds].sort().join("|");
  const inheritedAccessIds = groupeId ? (groupeAccessById.get(groupeId) ?? []) : [];
  const inheritedExpandedSet = useMemo(
    () => expandDossierTree(dossiers, inheritedAccessIds),
    [dossiers, inheritedAccessIds]
  );
  const personalExpandedSet = useMemo(
    () => expandDossierTree(dossiers, personalAccessIds),
    [dossiers, personalAccessIds]
  );
  const excludedExpandedSet = useMemo(
    () => expandDossierTree(dossiers, excludedInheritedAccessIds),
    [dossiers, excludedInheritedAccessIds]
  );
  const inheritedExpandedIds = useMemo(
    () => [...inheritedExpandedSet],
    [inheritedExpandedSet]
  );
  const inheritedTree = useMemo(
    () => filterDossierTreeByAllowedIds(dossierTree, new Set(inheritedExpandedIds)),
    [dossierTree, inheritedExpandedIds]
  );
  const hasChanges =
    firstName !== (user.first_name ?? "") ||
    lastName !== (user.last_name ?? "") ||
    email !== user.email ||
    phone !== (user.phone ?? "") ||
    role !== user.role ||
    groupeId !== user.groupe_id ||
    filiereId !== user.filiere_id ||
    normalizedCurrentDirectAccess !== normalizedNextDirectAccess ||
    normalizedCurrentExcludedAccess !== normalizedNextExcludedAccess ||
    normalizedCurrentMatieres !== normalizedNextMatieres ||
    initialCoursAssignmentSignature !== (() => {
      const entries: string[] = [];
      for (const [matId, groupeIds] of coursAssignments) {
        if (groupeIds.size === 0) entries.push(`${matId}:`);
        else for (const gid of groupeIds) entries.push(`${matId}:${gid}`);
      }
      return entries.sort().join("|");
    })() ||
    initialQaMatSignature !== [...qaContenuMatIds].sort().join("|") ||
    niveauInitial !== (coachingProfile?.niveau_initial ?? 50) ||
    mentalInitial !== (coachingProfile?.mental_initial ?? 50) ||
    niveauProgressif !== (coachingProfile?.niveau_progressif ?? 50) ||
    mentalProgressif !== (coachingProfile?.mental_progressif ?? 50);

  const toggleCoursMatiere = (matiereId: string) => {
    setCoursAssignments((prev) => {
      const next = new Map(prev);
      if (next.has(matiereId)) next.delete(matiereId);
      else next.set(matiereId, new Set());
      return next;
    });
  };

  const toggleCoursGroupe = (matiereId: string, groupeId: string) => {
    setCoursAssignments((prev) => {
      const next = new Map(prev);
      const groupes = new Set(next.get(matiereId) ?? []);
      if (groupes.has(groupeId)) groupes.delete(groupeId);
      else groupes.add(groupeId);
      next.set(matiereId, groupes);
      return next;
    });
  };

  const toggleQaMatiere = (matiereId: string) => {
    setQaContenuMatIds((prev) => prev.includes(matiereId) ? prev.filter((id) => id !== matiereId) : [...prev, matiereId]);
  };

  const toggleMatiere = (matiereId: string) => {
    setMatiereIds((prev) =>
      prev.includes(matiereId)
        ? prev.filter((id) => id !== matiereId)
        : [...prev, matiereId]
    );
  };

  const toggleContentAccess = ({
    dossierId,
    hasInheritedAccess,
    hasPersonalAccess,
    hasExcludedAccess,
    hasExactPersonalAccess,
    hasExactExclusion,
  }: {
    dossierId: string;
    hasInheritedAccess: boolean;
    hasPersonalAccess: boolean;
    hasExcludedAccess: boolean;
    hasExactPersonalAccess: boolean;
    hasExactExclusion: boolean;
  }) => {
    const nextPersonal = new Set(personalAccessIds);
    const nextExcluded = new Set(excludedInheritedAccessIds);
    const hasEffectiveAccess = (hasInheritedAccess && !hasExcludedAccess) || hasPersonalAccess;

    if (hasEffectiveAccess) {
      if (hasExactPersonalAccess) {
        nextPersonal.delete(dossierId);
      }

      if (hasInheritedAccess) {
        nextExcluded.add(dossierId);
      }
    } else {
      if (hasExactExclusion) {
        nextExcluded.delete(dossierId);
      }

      const stillBlockedByAncestorExclusion = hasExcludedAccess && !hasExactExclusion;
      if (!hasInheritedAccess || stillBlockedByAncestorExclusion) {
        nextPersonal.add(dossierId);
      }
    }

    setPersonalAccessIds([...nextPersonal]);
    setExcludedInheritedAccessIds([...nextExcluded]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden" style={{ backgroundColor: "#0e1e35", border: "1px solid rgba(255,255,255,0.1)" }}>
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

        <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(90vh-144px)]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Prénom</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Nom</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Email</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }} />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Téléphone</label>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }} />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+33..."
                  className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>
          </div>

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

          {role !== "prof" && role !== "coach" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Classe</label>
              {(() => {
                const offers = dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index);
                const unis = selOfferForUser ? dossiers.filter(d => d.dossier_type === "university" && d.parent_id === selOfferForUser) : [];
                const classes = selUniForUser ? groupes.filter(g => g.formation_dossier_id === selUniForUser) : [];
                const currentGroup = groupeId ? groupes.find(g => g.id === groupeId) : null;
                const currentUni = currentGroup?.formation_dossier_id ? dossiers.find(d => d.id === currentGroup.formation_dossier_id) : null;

                return (
                  <div className="space-y-2">
                    {/* Step 1: Formation */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Formation</span>
                      <button onClick={() => { setSelOfferForUser(""); setSelUniForUser(""); setGroupeId(null); }}
                        className="px-2.5 py-1 rounded-full text-[11px]"
                        style={{ backgroundColor: !selOfferForUser ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: !selOfferForUser ? "#E3C286" : "rgba(255,255,255,0.5)", border: !selOfferForUser ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                        Aucune
                      </button>
                      {offers.map(o => (
                        <button key={o.id} onClick={() => { setSelOfferForUser(o.id); setSelUniForUser(""); setGroupeId(null); }}
                          className="px-2.5 py-1 rounded-full text-[11px]"
                          style={{ backgroundColor: selOfferForUser === o.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: selOfferForUser === o.id ? "#E3C286" : "rgba(255,255,255,0.5)", border: selOfferForUser === o.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                          {o.name}
                        </button>
                      ))}
                    </div>

                    {/* Step 2: University */}
                    {selOfferForUser && unis.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Université</span>
                        {unis.map(u => (
                          <button key={u.id} onClick={() => { setSelUniForUser(u.id); setGroupeId(null); }}
                            className="px-2.5 py-1 rounded-full text-[11px]"
                            style={{ backgroundColor: selUniForUser === u.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: selUniForUser === u.id ? "#E3C286" : "rgba(255,255,255,0.5)", border: selUniForUser === u.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                            {u.name.replace("Université ", "")}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Step 3: Class */}
                    {selUniForUser && classes.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Classe</span>
                        {classes.map(c => (
                          <button key={c.id} onClick={() => setGroupeId(c.id)}
                            className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5"
                            style={{ backgroundColor: groupeId === c.id ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", color: groupeId === c.id ? "#6EE7B7" : "rgba(255,255,255,0.5)", border: groupeId === c.id ? "1px solid rgba(52,211,153,0.3)" : "1px solid transparent" }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Current selection summary */}
                    {groupeId && currentGroup && (
                      <p className="text-[10px] mt-1" style={{ color: "rgba(52,211,153,0.7)" }}>
                        ✓ {currentGroup.name}{currentUni ? ` · ${currentUni.name}` : ""}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Filière santé — masqué pour l'instant */}
          </div>}

          {/* Accès individuels — checkbox tree like classes */}
          {groupeId && role !== "coach" && (() => {
            // Find the university dossier for this group
            const grp = groupes.find(g => g.id === groupeId);
            const uniDossier = grp?.formation_dossier_id ? dossiers.find(d => d.id === grp.formation_dossier_id) : null;
            if (!uniDossier) return null;

            // Get children of the university (semesters, modules)
            const children = dossiers.filter(d => d.parent_id === uniDossier.id).sort((a, b) => a.order_index - b.order_index);

            // Merged access: inherited from class + personal
            const classAccessSet = new Set(inheritedAccessIds);
            const personalAccessSet = new Set(personalAccessIds);
            const excludedSet = new Set(excludedInheritedAccessIds);

            return (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Accès au contenu
                </label>
                <p className="text-[9px] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  🟢 = accès via la classe · 🟡 = accès perso · Décochez pour retirer un accès hérité
                </p>
                <div className="rounded-xl p-3 space-y-0.5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {children.map(child => {
                    const subChildren = dossiers.filter(d => d.parent_id === child.id).sort((a, b) => a.order_index - b.order_index);
                    const childMeta = DOSSIER_TYPE_META[child.dossier_type] as { shortLabel?: string } | undefined;
                    const isClassAccess = inheritedExpandedSet.has(child.id);
                    const isPersonalAccess = personalExpandedSet.has(child.id);
                    const isExcluded = excludedExpandedSet.has(child.id);
                    const isExactPersonalAccess = personalAccessSet.has(child.id);
                    const isExactExcluded = excludedSet.has(child.id);
                    const hasAccess = (isClassAccess && !isExcluded) || isPersonalAccess;

                    return (
                      <details key={child.id} className="group/sem">
                        <summary className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer list-none [&::-webkit-details-marker]:hidden" style={{ backgroundColor: hasAccess ? "rgba(52,211,153,0.04)" : "transparent" }}>
                          {subChildren.length > 0 && <ChevronRight size={12} className="text-white/30 transition-transform group-open/sem:rotate-90 shrink-0" />}
                          {subChildren.length === 0 && <span className="w-3" />}
                          <input
                            type="checkbox"
                            checked={hasAccess}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleContentAccess({
                                dossierId: child.id,
                                hasInheritedAccess: isClassAccess,
                                hasPersonalAccess: isPersonalAccess,
                                hasExcludedAccess: isExcluded,
                                hasExactPersonalAccess: isExactPersonalAccess,
                                hasExactExclusion: isExactExcluded,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-500 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-medium flex-1" style={{ color: hasAccess ? "white" : "rgba(255,255,255,0.5)" }}>{child.name}</span>
                          {classAccessSet.has(child.id) && !isExcluded && <span className="text-[8px] px-1.5 rounded-full" style={{ backgroundColor: "rgba(52,211,153,0.15)", color: "#6EE7B7" }}>classe</span>}
                          {isExactPersonalAccess && <span className="text-[8px] px-1.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#E3C286" }}>perso</span>}
                          {isExactExcluded && <span className="text-[8px] px-1.5 rounded-full" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>retiré</span>}
                          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>{childMeta?.shortLabel ?? ""}</span>
                        </summary>
                        {subChildren.length > 0 && (
                          <div className="ml-9 space-y-0.5 pb-1">
                            {subChildren.map(sub => {
                              const subMeta2 = DOSSIER_TYPE_META[sub.dossier_type] as { shortLabel?: string } | undefined;
                              const subIsClass = inheritedExpandedSet.has(sub.id);
                              const subIsPersonal = personalExpandedSet.has(sub.id);
                              const subIsExcluded = excludedExpandedSet.has(sub.id);
                              const subIsExactPersonal = personalAccessSet.has(sub.id);
                              const subIsExactExcluded = excludedSet.has(sub.id);
                              const subHasAccess = (subIsClass && !subIsExcluded) || subIsPersonal;
                              const subCours = cours.filter(c => c.dossier_id === sub.id);
                              return (
                                <details key={sub.id} className="group/mat2">
                                  <summary className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer list-none [&::-webkit-details-marker]:hidden" style={{ backgroundColor: subHasAccess ? "rgba(52,211,153,0.03)" : "transparent" }}>
                                    {subCours.length > 0 && <ChevronRight size={10} className="text-white/25 transition-transform group-open/mat2:rotate-90 shrink-0" />}
                                    {subCours.length === 0 && <span className="w-2.5" />}
                                    <input
                                      type="checkbox"
                                      checked={subHasAccess}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleContentAccess({
                                          dossierId: sub.id,
                                          hasInheritedAccess: subIsClass,
                                          hasPersonalAccess: subIsPersonal,
                                          hasExcludedAccess: subIsExcluded,
                                          hasExactPersonalAccess: subIsExactPersonal,
                                          hasExactExclusion: subIsExactExcluded,
                                        });
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-3.5 h-3.5 rounded border-gray-500 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-xs flex-1" style={{ color: subHasAccess ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)" }}>{sub.name}</span>
                                    <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.2)" }}>{subMeta2?.shortLabel ?? ""}</span>
                                  </summary>
                                  {subCours.length > 0 && (
                                    <div className="ml-6 space-y-0 pb-1">
                                      {subCours.map(c => {
                                        const coursChecked = subHasAccess; // Inherit from parent matière for now
                                        return (
                                          <label key={c.id} className="flex items-center gap-2 py-0.5 px-2 cursor-pointer rounded hover:bg-white/[0.02]">
                                            <input
                                              type="checkbox"
                                              checked={coursChecked}
                                              onChange={() => {
                                                // For now, toggling a cours toggles its parent matière.
                                                toggleContentAccess({
                                                  dossierId: sub.id,
                                                  hasInheritedAccess: subIsClass,
                                                  hasPersonalAccess: subIsPersonal,
                                                  hasExcludedAccess: subIsExcluded,
                                                  hasExactPersonalAccess: subIsExactPersonal,
                                                  hasExactExclusion: subIsExactExcluded,
                                                });
                                              }}
                                              className="w-3 h-3 rounded border-gray-600 text-emerald-600 focus:ring-emerald-500"
                                            />
                                            <span className="text-[11px]" style={{ color: coursChecked ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>{c.name}</span>
                                            <span className="text-[8px] ml-auto" style={{ color: "rgba(255,255,255,0.15)" }}>Chapitre</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </details>
                              );
                            })}
                          </div>
                        )}
                      </details>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Coaching — coach multi-class assignment */}
          {role === "coach" && (() => {
            const offers = dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index);
            const unis = coachFormation ? dossiers.filter(d => d.dossier_type === "university" && d.parent_id === coachFormation) : [];
            const classes = coachUni ? groupes.filter(g => g.formation_dossier_id === coachUni) : [];

            const toggleCoachGroupe = (gid: string) => {
              const next = new Set(coachGroupeIds);
              const sb = createBrowserClient();
              if (next.has(gid)) {
                next.delete(gid);
                sb.from("coach_groupe_assignments").delete().eq("coach_id", user.id).eq("groupe_id", gid).then(() => {});
              } else {
                next.add(gid);
                sb.from("coach_groupe_assignments").upsert({ coach_id: user.id, groupe_id: gid }, { onConflict: "coach_id,groupe_id" }).then(() => {});
              }
              setCoachGroupeIds(next);
            };

            // Show all assigned classes across all formations
            const assignedClasses = groupes.filter(g => coachGroupeIds.has(g.id));

            return (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Coaching — Classes assignées</label>

                {/* Assigned classes summary */}
                {assignedClasses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {assignedClasses.map(c => {
                      const uni = dossiers.find(d => d.id === c.formation_dossier_id);
                      return (
                        <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: "rgba(52,211,153,0.12)", color: "#6EE7B7", border: "1px solid rgba(52,211,153,0.25)" }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}{uni ? ` · ${uni.name.replace("Université ", "")}` : ""}
                          <button onClick={() => toggleCoachGroupe(c.id)} className="ml-0.5 hover:text-red-400 transition-colors">
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Selector: Formation → Université → Classes (checkboxes) */}
                <div className="space-y-2 rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Formation</span>
                    {offers.map(o => (
                      <button key={o.id} onClick={() => { setCoachFormation(o.id); setCoachUni(""); }}
                        className="px-2.5 py-1 rounded-full text-[11px]"
                        style={{ backgroundColor: coachFormation === o.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: coachFormation === o.id ? "#E3C286" : "rgba(255,255,255,0.5)", border: coachFormation === o.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                        {o.name}
                      </button>
                    ))}
                  </div>

                  {coachFormation && unis.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Université</span>
                      {unis.map(u => (
                        <button key={u.id} onClick={() => setCoachUni(u.id)}
                          className="px-2.5 py-1 rounded-full text-[11px]"
                          style={{ backgroundColor: coachUni === u.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)", color: coachUni === u.id ? "#E3C286" : "rgba(255,255,255,0.5)", border: coachUni === u.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid transparent" }}>
                          {u.name.replace("Université ", "")}
                        </button>
                      ))}
                    </div>
                  )}

                  {coachUni && classes.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>Classes</span>
                      {classes.map(c => (
                        <button key={c.id} onClick={() => toggleCoachGroupe(c.id)}
                          className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5"
                          style={{ backgroundColor: coachGroupeIds.has(c.id) ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", color: coachGroupeIds.has(c.id) ? "#6EE7B7" : "rgba(255,255,255,0.5)", border: coachGroupeIds.has(c.id) ? "1px solid rgba(52,211,153,0.3)" : "1px solid transparent" }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                          {coachGroupeIds.has(c.id) && <Check size={10} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Étiquettes */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Étiquettes</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {etiquettes.map((tag, i) => (
                <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#E3C286", border: "1px solid rgba(201,168,76,0.25)" }}>
                  {tag}
                  <button onClick={() => setEtiquettes(prev => prev.filter((_, j) => j !== i))}
                    className="hover:text-red-400 transition-colors"><X size={10} /></button>
                </span>
              ))}
              {etiquettes.length === 0 && <span className="text-[11px] italic" style={{ color: "rgba(255,255,255,0.25)" }}>Aucune étiquette</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newEtiquette}
                onChange={e => setNewEtiquette(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newEtiquette.trim()) {
                    e.preventDefault();
                    if (!etiquettes.includes(newEtiquette.trim())) setEtiquettes(prev => [...prev, newEtiquette.trim()]);
                    setNewEtiquette("");
                  }
                }}
                placeholder="Ajouter une étiquette…"
                className="flex-1 px-3 py-1.5 rounded-lg text-[11px] text-white placeholder:text-white/25 outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <button
                onClick={() => {
                  if (newEtiquette.trim() && !etiquettes.includes(newEtiquette.trim())) {
                    setEtiquettes(prev => [...prev, newEtiquette.trim()]);
                    setNewEtiquette("");
                  }
                }}
                disabled={!newEtiquette.trim()}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold disabled:opacity-30 transition-colors"
                style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Statut Initial & Progressif — only for students */}
          {(role === "eleve") && (
            <div className="space-y-5">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide block mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>Statut Initial</label>
                <div className="grid grid-cols-2 gap-4">
                  <StatutSlider label="Niveau" value={niveauInitial} onChange={setNiveauInitial} />
                  <StatutSlider label="Mental" value={mentalInitial} onChange={setMentalInitial} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide block mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>Statut Progressif</label>
                <div className="grid grid-cols-2 gap-4">
                  <StatutSlider label="Niveau" value={niveauProgressif} onChange={setNiveauProgressif} />
                  <StatutSlider label="Mental" value={mentalProgressif} onChange={setMentalProgressif} />
                </div>
              </div>
            </div>
          )}

          {role === "prof" && (() => {
            // Build formation offers & universities from dossiers
            const offers = dossiers.filter((d) => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index);

            const getUnisForOffer = (offerId: string) =>
              dossiers.filter((d) => d.dossier_type === "university" && d.parent_id === offerId).sort((a, b) => a.order_index - b.order_index);

            const getGroupesForUni = (uniId: string) =>
              groupes.filter((g) => g.formation_dossier_id === uniId);

            const getMatieresForUni = (uniId: string) => {
              const descendantIds = new Set<string>();
              const walk = (pid: string) => { descendantIds.add(pid); dossiers.filter((d) => d.parent_id === pid).forEach((d) => walk(d.id)); };
              walk(uniId);
              return dossiers
                .filter((d) => descendantIds.has(d.id) && d.dossier_type === "subject" && (matieresByDossier.get(d.id)?.length ?? 0) > 0)
                .flatMap((d) => (matieresByDossier.get(d.id) ?? []).map((m) => ({ ...m, dossierLabel: getDossierPathLabel(d.id, dossiers) })));
            };

            // Build tree: group matières by their parent folder (semester/module)
            const buildMatiereTree = (rootId: string) => {
              type TreeNode = { dossier: Dossier; matieres: { id: string; name: string; color: string }[]; children: TreeNode[] };
              const buildNode = (parentId: string): TreeNode[] => {
                return dossiers.filter(d => d.parent_id === parentId).sort((a, b) => a.order_index - b.order_index).map(d => {
                  const mats = (matieresByDossier.get(d.id) ?? []).map(m => ({ id: m.id, name: m.name, color: m.color }));
                  const children = buildNode(d.id);
                  // Only include if it has matières or has children with matières
                  if (mats.length === 0 && children.length === 0) return null;
                  return { dossier: d, matieres: mats, children };
                }).filter(Boolean) as TreeNode[];
              };
              return buildNode(rootId);
            };

            // Group matières by their dossier label for display (kept for flat list fallback)
            const groupByDossierLabel = (mats: { dossierLabel: string; id: string; name: string; color: string }[]) => {
              const map = new Map<string, typeof mats>();
              for (const m of mats) { const arr = map.get(m.dossierLabel) ?? []; arr.push(m); map.set(m.dossierLabel, arr); }
              return [...map.entries()];
            };

            const PillFilter = ({ items, value, onChange, color, badges }: { items: { id: string; name: string }[]; value: string; onChange: (v: string) => void; color: string; badges?: Map<string, number> }) => (
              <div className="flex flex-wrap gap-1">
                {items.map((item) => {
                  const active = value === item.id;
                  const badge = badges?.get(item.id) ?? 0;
                  return (
                    <button key={item.id} type="button" onClick={() => onChange(active ? "" : item.id)}
                      className="relative rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"
                      style={{
                        borderColor: active ? color + "99" : "rgba(255,255,255,0.08)",
                        backgroundColor: active ? color + "22" : "rgba(255,255,255,0.02)",
                        color: active ? color : "rgba(255,255,255,0.45)",
                      }}>
                      {item.name.replace("Université ", "")}
                      {badge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[8px] font-bold text-white px-0.5" style={{ backgroundColor: "#EF4444" }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );

            const coursUnis = coursFormation ? getUnisForOffer(coursFormation) : [];
            const coursRootId = coursUni || (coursFormation && coursUnis.length === 0 ? coursFormation : "");
            const coursTree = coursRootId ? buildMatiereTree(coursRootId) : [];
            const allUniGroupes = coursUni
              ? groupes.filter((g) => g.formation_dossier_id === coursUni)
              : (coursFormation && coursUnis.length === 0) ? groupes.filter((g) => g.formation_dossier_id === coursFormation) : [];

            const qaUnis = qaFormation ? getUnisForOffer(qaFormation) : [];
            const qaRootId = qaUni || (qaFormation && qaUnis.length === 0 ? qaFormation : "");
            const qaTree = qaRootId ? buildMatiereTree(qaRootId) : [];

            // Recursively collect ALL matières from a tree node and all descendants
            type TreeNodeType = { dossier: Dossier; matieres: { id: string; name: string; color: string }[]; children: TreeNodeType[] };
            const getAllMatieres = (n: TreeNodeType): { id: string; name: string; color: string }[] => [
              ...n.matieres,
              ...n.children.flatMap(c => getAllMatieres(c)),
            ];

            // Compute badge counts: how many matières assigned per offer
            const coursBadges = new Map<string, number>();
            const qaBadges = new Map<string, number>();
            for (const offr of offers) {
              // Get all matière IDs under this offer
              const descendantIds = new Set<string>();
              const walkD = (pid: string) => { descendantIds.add(pid); dossiers.filter((d) => d.parent_id === pid).forEach((d) => walkD(d.id)); };
              walkD(offr.id);
              const matIdsUnderOffer = matieres.filter(m => descendantIds.has(m.dossier_id)).map(m => m.id);
              const coursCount = matIdsUnderOffer.filter(id => coursAssignments.has(id)).length;
              const qaCount = matIdsUnderOffer.filter(id => qaContenuMatIds.includes(id)).length;
              if (coursCount > 0) coursBadges.set(offr.id, coursCount);
              if (qaCount > 0) qaBadges.set(offr.id, qaCount);
            }
            // Also for university-level badges
            const coursUniBadges = new Map<string, number>();
            const qaUniBadges = new Map<string, number>();
            if (coursFormation) {
              for (const uniItem of coursUnis) {
                const desc = new Set<string>();
                const wk = (pid: string) => { desc.add(pid); dossiers.filter(d => d.parent_id === pid).forEach(d => wk(d.id)); };
                wk(uniItem.id);
                const matIds = matieres.filter(m => desc.has(m.dossier_id)).map(m => m.id);
                const c = matIds.filter(id => coursAssignments.has(id)).length;
                if (c > 0) coursUniBadges.set(uniItem.id, c);
              }
            }
            if (qaFormation) {
              for (const uniItem of qaUnis) {
                const desc = new Set<string>();
                const wk = (pid: string) => { desc.add(pid); dossiers.filter(d => d.parent_id === pid).forEach(d => wk(d.id)); };
                wk(uniItem.id);
                const matIds = matieres.filter(m => desc.has(m.dossier_id)).map(m => m.id);
                const c = matIds.filter(id => qaContenuMatIds.includes(id)).length;
                if (c > 0) qaUniBadges.set(uniItem.id, c);
              }
            }

            return (
            <div className="space-y-5">
              {/* ── Section 1: Donne cours ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#60A5FA" }} />
                  <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Donne cours</label>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>— Emploi du temps & planning</span>
                </div>
                <div className="rounded-xl p-3 space-y-2.5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {/* Formation */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest shrink-0 w-16" style={{ color: "rgba(255,255,255,0.3)" }}>Formation</span>
                    <PillFilter items={offers} value={coursFormation} onChange={(v) => { setCoursFormation(v); setCoursUni(""); }} color="#60A5FA" badges={coursBadges} />
                  </div>
                  {/* Université */}
                  {coursFormation && coursUnis.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest shrink-0 w-16" style={{ color: "rgba(255,255,255,0.3)" }}>Université</span>
                      <PillFilter items={coursUnis} value={coursUni} onChange={setCoursUni} color="#60A5FA" badges={coursUniBadges} />
                    </div>
                  )}
                  {/* Matières tree */}
                  {coursTree.length > 0 && (
                    <div className="mt-1 pt-2 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {coursTree.map(node => {
                        const allMats = getAllMatieres(node);
                        const allNodeMatIds = allMats.map(m => m.id);
                        const allChecked = allNodeMatIds.length > 0 && allNodeMatIds.every(id => coursAssignments.has(id));
                        const someChecked = allNodeMatIds.some(id => coursAssignments.has(id));
                        return (
                          <details key={node.dossier.id} open={someChecked || allChecked}>
                            <summary className="flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer hover:bg-white/[0.04] list-none [&::-webkit-details-marker]:hidden" style={{ backgroundColor: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.08)" }}>
                              <ChevronRight size={11} className="text-[#C9A84C]/40 transition-transform [details[open]>&]:rotate-90" />
                              <Layers size={11} className="text-[#C9A84C]/60 shrink-0" />
                              <span className="text-[11px] font-bold tracking-wide" style={{ color: "#C9A84C" }}>{node.dossier.name}</span>
                              <span className="ml-auto text-[9px]" style={{ color: someChecked ? "#60A5FA" : "rgba(255,255,255,0.2)" }}>
                                {allNodeMatIds.filter(id => coursAssignments.has(id)).length}/{allNodeMatIds.length}
                              </span>
                            </summary>
                            <div className="ml-5 space-y-0.5 pb-1">
                              {allMats.map(m => {
                                const checked = coursAssignments.has(m.id);
                                const assignedGroupes = coursAssignments.get(m.id) ?? new Set<string>();
                                return (
                                  <div key={m.id}>
                                    <label className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-white/[0.03]">
                                      <input type="checkbox" checked={checked} onChange={() => toggleCoursMatiere(m.id)}
                                        className="w-3.5 h-3.5 rounded border-gray-500 text-blue-500 focus:ring-blue-400/30" />
                                      <span className="text-[11px]" style={{ color: checked ? "#60A5FA" : "rgba(255,255,255,0.55)" }}>{m.name}</span>
                                      {checked && assignedGroupes.size > 0 && (
                                        <span className="ml-auto text-[9px] text-blue-400/50">{assignedGroupes.size} cl.</span>
                                      )}
                                    </label>
                                    {checked && allUniGroupes.length > 0 && (
                                      <div className="ml-8 mt-0.5 mb-1 flex flex-wrap gap-1">
                                        {allUniGroupes.map(g => {
                                          const gChecked = assignedGroupes.has(g.id);
                                          return (
                                            <button key={g.id} type="button" onClick={() => toggleCoursGroupe(m.id, g.id)}
                                              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors"
                                              style={{ backgroundColor: gChecked ? "#60A5FA22" : "rgba(255,255,255,0.03)", color: gChecked ? "#60A5FA" : "rgba(255,255,255,0.35)" }}>
                                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: gChecked ? "#60A5FA" : g.color }} />
                                              {g.name}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                  {!coursFormation && <p className="text-[11px] py-1 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>Sélectionnez une formation</p>}
                </div>
              </div>

              {/* ── Section 2: Q&A & Contenu ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#FBBF24" }} />
                  <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Q&A & Contenu</label>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>— Répond aux questions & crée du contenu</span>
                </div>
                <div className="rounded-xl p-3 space-y-2.5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {/* Formation */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest shrink-0 w-16" style={{ color: "rgba(255,255,255,0.3)" }}>Formation</span>
                    <PillFilter items={offers} value={qaFormation} onChange={(v) => { setQaFormation(v); setQaUni(""); }} color="#FBBF24" badges={qaBadges} />
                  </div>
                  {/* Université */}
                  {qaFormation && qaUnis.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest shrink-0 w-16" style={{ color: "rgba(255,255,255,0.3)" }}>Université</span>
                      <PillFilter items={qaUnis} value={qaUni} onChange={setQaUni} color="#FBBF24" badges={qaUniBadges} />
                    </div>
                  )}
                  {/* Matières tree */}
                  {qaTree.length > 0 && (
                    <div className="mt-1 pt-2 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {qaTree.map(node => {
                        const allMats = getAllMatieres(node);
                        const allNodeMatIds = allMats.map(m => m.id);
                        const someChecked = allNodeMatIds.some(id => qaContenuMatIds.includes(id));
                        return (
                          <details key={node.dossier.id} open={someChecked}>
                            <summary className="flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer hover:bg-white/[0.04] list-none [&::-webkit-details-marker]:hidden" style={{ backgroundColor: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.08)" }}>
                              <ChevronRight size={11} className="text-[#C9A84C]/40 transition-transform [details[open]>&]:rotate-90" />
                              <Layers size={11} className="text-[#C9A84C]/60 shrink-0" />
                              <span className="text-[11px] font-bold tracking-wide" style={{ color: "#C9A84C" }}>{node.dossier.name}</span>
                              <span className="ml-auto text-[9px]" style={{ color: someChecked ? "#FBBF24" : "rgba(255,255,255,0.2)" }}>
                                {allNodeMatIds.filter(id => qaContenuMatIds.includes(id)).length}/{allNodeMatIds.length}
                              </span>
                            </summary>
                            <div className="ml-5 space-y-0.5 pb-1">
                              {allMats.map(m => {
                                const checked = qaContenuMatIds.includes(m.id);
                                return (
                                  <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-white/[0.03]">
                                    <input type="checkbox" checked={checked} onChange={() => toggleQaMatiere(m.id)}
                                      className="w-3.5 h-3.5 rounded border-gray-500 text-amber-500 focus:ring-amber-400/30" />
                                    <span className="text-[11px]" style={{ color: checked ? "#FBBF24" : "rgba(255,255,255,0.55)" }}>{m.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                  {!qaFormation && <p className="text-[11px] py-1 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>Sélectionnez une formation</p>}
                </div>
              </div>
            </div>
            );
          })()}

          {role !== "prof" && selectedMatiereIds.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
              En changeant le rôle, les matières professeur actuellement assignées seront retirées.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div />
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)")}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
              Annuler
            </button>
            <button
              onClick={() => onSave(user.id, {
                first_name: firstName,
                last_name: lastName,
                email,
                phone,
                role,
                groupe_id: groupeId,
                filiere_id: filiereId,
                access_dossier_id: personalAccessIds[0] ?? null,
                access_dossier_ids: personalAccessIds,
                excluded_access_dossier_ids: excludedInheritedAccessIds,
                matiere_ids: matiereIds,
                matiere_roles: [
                  ...Array.from(coursAssignments.entries()).flatMap(([matId, groupeIds]) =>
                    groupeIds.size > 0
                      ? Array.from(groupeIds).map((gid) => ({ matiere_id: matId, role_type: "cours", groupe_id: gid }))
                      : [{ matiere_id: matId, role_type: "cours", groupe_id: null as string | null }]
                  ),
                  ...qaContenuMatIds.map((id) => ({ matiere_id: id, role_type: "qa" })),
                ],
                etiquettes,
                niveau_initial: niveauInitial,
                mental_initial: mentalInitial,
                niveau_progressif: niveauProgressif,
                mental_progressif: mentalProgressif,
              })}
              disabled={!hasChanges || isPending || !email.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
            >
              {isPending && <Loader2 size={11} className="animate-spin" />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── StatutSlider ─────────────────────────────────────────────────────────────

function statutColor(value: number): string {
  // Red (0) → Yellow (50) → Green (100)
  if (value <= 50) {
    const r = 239;
    const g = Math.round(68 + (value / 50) * (180 - 68));
    const b = 68;
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(239 - ((value - 50) / 50) * (239 - 34));
  const g = Math.round(180 + ((value - 50) / 50) * (197 - 180));
  const b = Math.round(68 - ((value - 50) / 50) * (68 - 94));
  return `rgb(${r},${g},${b})`;
}

function statutLabel(value: number): string {
  if (value <= 25) return "Fragile";
  if (value <= 45) return "Moyen -";
  if (value <= 55) return "Moyen";
  if (value <= 75) return "Moyen +";
  return "Fort";
}

function StatutSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const color = statutColor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold" style={{ color }}>{value}</span>
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>{statutLabel(value)}</span>
        </div>
      </div>
      <div className="relative">
        {/* Track background — gradient red to green */}
        <div className="h-2 rounded-full" style={{ background: "linear-gradient(to right, #ef4444, #eab308, #22c55e)" }} />
        {/* Filled portion */}
        <div className="absolute top-0 left-0 h-2 rounded-full" style={{ width: `${value}%`, background: `linear-gradient(to right, #ef4444, ${color})`, opacity: 0.9 }} />
        {/* Thumb indicator */}
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 shadow-md" style={{ left: `calc(${value}% - 7px)`, backgroundColor: color, borderColor: "rgba(255,255,255,0.8)" }} />
        {/* Invisible range input on top for interaction */}
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ margin: 0 }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[8px]" style={{ color: "rgba(239,68,68,0.5)" }}>Fragile</span>
        <span className="text-[8px]" style={{ color: "rgba(34,197,94,0.5)" }}>Fort</span>
      </div>
    </div>
  );
}

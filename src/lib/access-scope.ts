import type { Dossier, Profile, UserRole } from "@/types/database";

type MinimalSupabase = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

export interface AccessScopeProfile {
  id: string;
  role: UserRole;
  groupe_id: string | null;
  access_dossier_id: string | null;
}

export interface AccessScope {
  profile: AccessScopeProfile | null;
  unrestricted: boolean;
  allowedDossierIds: Set<string>;
}

type GroupeAccessRow = {
  id: string;
  parent_id: string | null;
  formation_dossier_id: string | null;
};

export function expandDossierTree(
  dossiers: Pick<Dossier, "id" | "parent_id">[],
  rootIds: string[]
) {
  const childrenByParent = new Map<string | null, string[]>();

  for (const dossier of dossiers) {
    const siblings = childrenByParent.get(dossier.parent_id) ?? [];
    siblings.push(dossier.id);
    childrenByParent.set(dossier.parent_id, siblings);
  }

  const visited = new Set<string>();
  const stack = [...rootIds];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) continue;

    visited.add(currentId);

    for (const childId of childrenByParent.get(currentId) ?? []) {
      stack.push(childId);
    }
  }

  return visited;
}

export function includeDossierAncestors(
  dossiers: Pick<Dossier, "id" | "parent_id">[],
  allowedIds: Set<string>
) {
  const parentById = new Map(dossiers.map((d) => [d.id, d.parent_id]));
  const withAncestors = new Set(allowedIds);

  for (const id of allowedIds) {
    let currentId = parentById.get(id) ?? null;
    while (currentId) {
      if (withAncestors.has(currentId)) break;
      withAncestors.add(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }

  return withAncestors;
}

function getInheritedFormationDossierId(
  groupeId: string | null | undefined,
  groupes: GroupeAccessRow[]
) {
  const groupeMap = new Map(groupes.map((g) => [g.id, g]));
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

export async function getAccessScopeForUser(
  supabase: MinimalSupabase,
  userId: string
): Promise<AccessScope> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, groupe_id, access_dossier_id")
    .eq("id", userId)
    .single();

  const typedProfile = (profile ?? null) as AccessScopeProfile | null;

  if (!typedProfile) {
    return {
      profile: null,
      unrestricted: false,
      allowedDossierIds: new Set<string>(),
    };
  }

  if (typedProfile.role === "admin" || typedProfile.role === "superadmin") {
    return {
      profile: typedProfile,
      unrestricted: true,
      allowedDossierIds: new Set<string>(),
    };
  }

  const [dossiersRes, groupesRes, groupAccessRes, profileAccessRes, profileExclusionRes] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, parent_id")
      .eq("visible", true),
    supabase
      .from("groupes")
      .select("id, parent_id, formation_dossier_id"),
    typedProfile.groupe_id
      ? supabase
          .from("groupe_dossier_acces")
          .select("dossier_id")
          .eq("groupe_id", typedProfile.groupe_id)
      : Promise.resolve({ data: [] }),
    supabase
      .from("profile_dossier_acces")
      .select("dossier_id")
      .eq("profile_id", userId),
    supabase
      .from("profile_dossier_access_exclusions")
      .select("dossier_id")
      .eq("profile_id", userId),
  ]);

  const groupRootIds = new Set<string>();
  const profileRootIds = new Set<string>();

  if (typedProfile.access_dossier_id) {
    profileRootIds.add(typedProfile.access_dossier_id);
  }

  const inheritedFormationDossierId = getInheritedFormationDossierId(
    typedProfile.groupe_id,
    (groupesRes.data ?? []) as GroupeAccessRow[]
  );
  if (inheritedFormationDossierId) {
    groupRootIds.add(inheritedFormationDossierId);
  }

  for (const access of profileAccessRes.data ?? []) {
    if (access?.dossier_id) {
      profileRootIds.add(access.dossier_id);
    }
  }

  for (const access of groupAccessRes.data ?? []) {
    if (access?.dossier_id) {
      groupRootIds.add(access.dossier_id);
    }
  }

  const exclusions = (profileExclusionRes.data ?? [])
    .map((access: any) => access?.dossier_id)
    .filter(Boolean) as string[];

  const dossiers = (dossiersRes.data ?? []) as Pick<Dossier, "id" | "parent_id">[];
  const inheritedAllowedIds = expandDossierTree(dossiers, [...groupRootIds]);
  const personalAllowedIds = expandDossierTree(dossiers, [...profileRootIds]);
  const excludedIds = expandDossierTree(dossiers, exclusions);
  const allowedDossierIds = new Set<string>();

  inheritedAllowedIds.forEach((id) => {
    if (!excludedIds.has(id)) {
      allowedDossierIds.add(id);
    }
  });
  personalAllowedIds.forEach((id) => {
    allowedDossierIds.add(id);
  });

  const allowedWithAncestors = includeDossierAncestors(dossiers, allowedDossierIds);

  return {
    profile: typedProfile,
    unrestricted: false,
    allowedDossierIds: allowedWithAncestors,
  };
}

export function filterDossiersByAccess<T extends Pick<Dossier, "id">>(
  dossiers: T[],
  scope: AccessScope
) {
  if (scope.unrestricted) return dossiers;
  return dossiers.filter((dossier) => scope.allowedDossierIds.has(dossier.id));
}

export function canAccessDossier(
  dossierId: string | null | undefined,
  scope: AccessScope
) {
  if (scope.unrestricted) return true;
  if (!dossierId) return false;
  return scope.allowedDossierIds.has(dossierId);
}

export function canAccessMatiere(
  matiere: { dossier_id?: string | null; dossier?: { id?: string | null } | null },
  scope: AccessScope
) {
  const dossierId = matiere.dossier_id ?? matiere.dossier?.id ?? null;
  return canAccessDossier(dossierId, scope);
}

export function canAccessCours(
  cours: {
    dossier_id?: string | null;
    dossier?: { id?: string | null } | null;
    matiere_id?: string | null;
    matiere?: {
      dossier_id?: string | null;
      dossier?: { id?: string | null } | null;
    } | null;
  },
  scope: AccessScope
) {
  const dossierId =
    cours.dossier_id ??
    cours.dossier?.id ??
    cours.matiere?.dossier_id ??
    cours.matiere?.dossier?.id ??
    null;

  return canAccessDossier(dossierId, scope);
}

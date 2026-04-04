"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { KbArticleStatus, KbArticleVisibility, KbArticleSource } from "@/types/database";

const KB_PATH = "/admin/knowledge-base";

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  if (!profile) return { error: "Profil introuvable" };
  if (profile.role !== "superadmin") return { error: "Accès réservé au super-administrateur" };
  return { profile };
}

async function requireAdminOrAbove() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };
  const { data: profile } = await supabase.from("profiles").select("id, role, first_name, last_name").eq("id", user.id).single();
  if (!profile) return { error: "Profil introuvable" };
  if (!["admin", "superadmin"].includes(profile.role)) return { error: "Accès réservé aux administrateurs" };
  return { profile };
}

// ─── Categories ──────────────────────────────────────────────

export async function getKbCategories() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kb_categories")
    .select("*")
    .order("order_index");
  if (error) return { error: error.message };
  return { categories: data ?? [] };
}

export async function createKbCategory(data: {
  name: string;
  slug?: string;
  description?: string;
  parent_id?: string | null;
  icon?: string;
  color?: string;
  order_index?: number;
}) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const { data: cat, error } = await admin
    .from("kb_categories")
    .insert({
      name: data.name.trim(),
      slug,
      description: data.description?.trim() || null,
      parent_id: data.parent_id ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      order_index: data.order_index ?? 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true, category: cat };
}

export async function updateKbCategory(id: string, data: {
  name?: string;
  slug?: string;
  description?: string | null;
  parent_id?: string | null;
  icon?: string | null;
  color?: string | null;
  order_index?: number;
}) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.slug !== undefined) update.slug = data.slug;
  if (data.description !== undefined) update.description = data.description?.trim() || null;
  if (data.parent_id !== undefined) update.parent_id = data.parent_id;
  if (data.icon !== undefined) update.icon = data.icon;
  if (data.color !== undefined) update.color = data.color;
  if (data.order_index !== undefined) update.order_index = data.order_index;

  const { error } = await admin.from("kb_categories").update(update).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

export async function deleteKbCategory(id: string) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("kb_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

// ─── Articles ────────────────────────────────────────────────

export async function getKbArticles(filters?: {
  category_id?: string;
  status?: KbArticleStatus;
  source?: KbArticleSource;
  search?: string;
}) {
  const admin = createAdminClient();
  let query = admin
    .from("kb_articles")
    .select("*, category:kb_categories(id,name,slug,color,icon), author:profiles!kb_articles_author_id_fkey(id,first_name,last_name,role)")
    .order("updated_at", { ascending: false });

  if (filters?.category_id) query = query.eq("category_id", filters.category_id);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.source) query = query.eq("source", filters.source);
  if (filters?.search) query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) return { error: error.message };
  return { articles: data ?? [] };
}

export async function createKbArticle(data: {
  title: string;
  content: string;
  content_html?: string;
  summary?: string;
  category_id?: string | null;
  tags?: string[];
  visibility?: KbArticleVisibility;
  formation_dossier_ids?: string[];
  groupe_ids?: string[];
  allowed_roles?: string[];
  status?: KbArticleStatus;
  source?: KbArticleSource;
  source_ref?: string;
  attachments?: { name: string; url: string; type: string; size: number }[];
}) {
  const auth = await requireAdminOrAbove();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const status = data.status ?? "draft";

  const insertData: Record<string, unknown> = {
    title: data.title.trim(),
    content: data.content,
    content_html: data.content_html || null,
    summary: data.summary?.trim() || null,
    category_id: data.category_id ?? null,
    tags: data.tags ?? [],
    visibility: data.visibility ?? "all",
    formation_dossier_ids: data.formation_dossier_ids ?? [],
    groupe_ids: data.groupe_ids ?? [],
    allowed_roles: data.allowed_roles ?? [],
    status,
    source: data.source ?? "manual",
    source_ref: data.source_ref ?? null,
    attachments: JSON.stringify(data.attachments ?? []),
    author_id: auth.profile.id,
  };

  if (status === "submitted") {
    insertData.submitted_by = auth.profile.id;
    insertData.submitted_at = new Date().toISOString();
  }
  if (status === "approved") {
    insertData.reviewed_by = auth.profile.id;
    insertData.reviewed_at = new Date().toISOString();
    insertData.published_at = new Date().toISOString();
  }

  const { data: article, error } = await admin
    .from("kb_articles")
    .insert(insertData)
    .select("*, category:kb_categories(id,name,slug,color,icon)")
    .single();

  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true, article };
}

export async function updateKbArticle(id: string, data: {
  title?: string;
  content?: string;
  content_html?: string;
  summary?: string;
  category_id?: string | null;
  tags?: string[];
  visibility?: KbArticleVisibility;
  formation_dossier_ids?: string[];
  groupe_ids?: string[];
  allowed_roles?: string[];
  attachments?: { name: string; url: string; type: string; size: number }[];
}) {
  const auth = await requireAdminOrAbove();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.title !== undefined) update.title = data.title.trim();
  if (data.content !== undefined) update.content = data.content;
  if (data.content_html !== undefined) update.content_html = data.content_html;
  if (data.summary !== undefined) update.summary = data.summary?.trim() || null;
  if (data.category_id !== undefined) update.category_id = data.category_id;
  if (data.tags !== undefined) update.tags = data.tags;
  if (data.visibility !== undefined) update.visibility = data.visibility;
  if (data.formation_dossier_ids !== undefined) update.formation_dossier_ids = data.formation_dossier_ids;
  if (data.groupe_ids !== undefined) update.groupe_ids = data.groupe_ids;
  if (data.allowed_roles !== undefined) update.allowed_roles = data.allowed_roles;
  if (data.attachments !== undefined) update.attachments = JSON.stringify(data.attachments);

  const { error } = await admin.from("kb_articles").update(update).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

export async function deleteKbArticle(id: string) {
  const auth = await requireAdminOrAbove();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("kb_articles").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

// ─── Workflow ────────────────────────────────────────────────

export async function submitKbArticle(id: string) {
  const auth = await requireAdminOrAbove();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("kb_articles").update({
    status: "submitted",
    submitted_by: auth.profile.id,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

export async function approveKbArticle(id: string) {
  const auth = await requireAdminOrAbove();
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  // Save current version before approving
  const { data: article } = await admin.from("kb_articles").select("title, content, content_html, author_id").eq("id", id).single();
  if (article) {
    const { data: lastVersion } = await admin
      .from("kb_article_versions")
      .select("version_number")
      .eq("article_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    await admin.from("kb_article_versions").insert({
      article_id: id,
      version_number: (lastVersion?.version_number ?? 0) + 1,
      title: article.title,
      content: article.content,
      content_html: article.content_html,
      author_id: article.author_id,
      change_note: "Publication validée",
    });
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("kb_articles").update({
    status: "approved",
    reviewed_by: auth.profile.id,
    reviewed_at: now,
    published_at: now,
    updated_at: now,
  }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

export async function rejectKbArticle(id: string, comment: string) {
  const auth = await requireAdminOrAbove();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("kb_articles").update({
    status: "rejected",
    reviewed_by: auth.profile.id,
    reviewed_at: new Date().toISOString(),
    review_comment: comment.trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(KB_PATH);
  return { success: true };
}

// ─── Auto-enrichment: sync platform data into KB ────────────

export async function syncPlatformToKb() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  let created = 0;
  let updated = 0;

  // Ensure auto-sync categories exist
  const autoCategories = [
    { slug: "formations", name: "Formations & Classes", icon: "GraduationCap", color: "#3B82F6" },
    { slug: "matieres-pedagogie", name: "Matières & Pédagogie", icon: "BookOpen", color: "#8B5CF6" },
    { slug: "personnel", name: "Personnel & Contacts", icon: "Users", color: "#10B981" },
    { slug: "plannings", name: "Plannings & Calendriers", icon: "Calendar", color: "#F59E0B" },
    { slug: "procedures", name: "Procédures & Règlement", icon: "FileText", color: "#EF4444" },
    { slug: "coaching", name: "Coaching — Général", icon: "HeartHandshake", color: "#EC4899" },
  ];

  const catMap = new Map<string, string>();
  for (const cat of autoCategories) {
    const { data: existing } = await admin.from("kb_categories").select("id").eq("slug", cat.slug).single();
    if (existing) {
      catMap.set(cat.slug, existing.id);
    } else {
      const { data: newCat } = await admin.from("kb_categories")
        .insert({ name: cat.name, slug: cat.slug, icon: cat.icon, color: cat.color, order_index: autoCategories.indexOf(cat) })
        .select("id").single();
      if (newCat) { catMap.set(cat.slug, newCat.id); created++; }
    }
  }

  // Sync formations (dossiers offer + university)
  const { data: dossiers } = await admin.from("dossiers").select("*").in("dossier_type", ["offer", "university"]).order("order_index");
  const { data: groupes } = await admin.from("groupes").select("*").order("name");

  if (dossiers && catMap.has("formations")) {
    for (const d of dossiers) {
      const ref = `dossiers:${d.id}`;
      const { data: existing } = await admin.from("kb_articles").select("id").eq("source_ref", ref).single();

      const classes = d.dossier_type === "university"
        ? (groupes ?? []).filter(g => g.formation_dossier_id === d.id).map(g => g.name).join(", ")
        : "";

      const content = [
        `# ${d.name}`,
        `**Type** : ${d.dossier_type === "offer" ? "Formation" : "Université"}`,
        d.dossier_type === "university" && classes ? `**Classes** : ${classes}` : "",
      ].filter(Boolean).join("\n\n");

      if (existing) {
        await admin.from("kb_articles").update({ title: d.name, content, updated_at: new Date().toISOString() }).eq("id", existing.id);
        updated++;
      } else {
        await admin.from("kb_articles").insert({
          title: d.name,
          content,
          category_id: catMap.get("formations"),
          source: "auto_platform",
          source_ref: ref,
          status: "approved",
          published_at: new Date().toISOString(),
          visibility: "all",
          tags: [d.dossier_type, d.name.toLowerCase()],
        });
        created++;
      }
    }
  }

  // Sync matières
  const { data: matieres } = await admin.from("matieres").select("*, dossier:dossiers(name)").order("name");
  if (matieres && catMap.has("matieres-pedagogie")) {
    for (const m of matieres) {
      const ref = `matieres:${m.id}`;
      const { data: existing } = await admin.from("kb_articles").select("id").eq("source_ref", ref).single();
      const content = [
        `# ${m.name}`,
        (m as any).dossier?.name ? `**Rattachée à** : ${(m as any).dossier.name}` : "",
        m.color ? `**Couleur** : ${m.color}` : "",
      ].filter(Boolean).join("\n\n");

      if (existing) {
        await admin.from("kb_articles").update({ title: m.name, content, updated_at: new Date().toISOString() }).eq("id", existing.id);
        updated++;
      } else {
        await admin.from("kb_articles").insert({
          title: m.name,
          content,
          category_id: catMap.get("matieres-pedagogie"),
          source: "auto_platform",
          source_ref: ref,
          status: "approved",
          published_at: new Date().toISOString(),
          visibility: "all",
          tags: ["matiere", m.name.toLowerCase()],
        });
        created++;
      }
    }
  }

  // Sync personnel (profs, coaches, admins)
  const { data: staff } = await admin.from("profiles").select("*").in("role", ["prof", "coach", "admin", "superadmin"]).order("last_name");
  if (staff && catMap.has("personnel")) {
    // Get prof_matieres for matière assignments
    const { data: profMatieres } = await admin.from("prof_matieres").select("prof_id, matiere_id");
    const profMatMap = new Map<string, string[]>();
    for (const pm of (profMatieres ?? [])) {
      if (!profMatMap.has(pm.prof_id)) profMatMap.set(pm.prof_id, []);
      profMatMap.get(pm.prof_id)!.push(pm.matiere_id);
    }

    for (const p of staff) {
      const ref = `profiles:${p.id}`;
      const { data: existing } = await admin.from("kb_articles").select("id").eq("source_ref", ref).single();
      const roleFr = p.role === "prof" ? "Professeur" : p.role === "coach" ? "Coach" : p.role === "admin" ? "Administrateur" : "Super Administrateur";

      const matIds = profMatMap.get(p.id) ?? [];
      const matNames = matIds.length > 0 && matieres
        ? matieres.filter(m => matIds.includes(m.id)).map(m => m.name).join(", ")
        : "";

      const content = [
        `# ${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        `**Rôle** : ${roleFr}`,
        p.email ? `**Email** : ${p.email}` : "",
        matNames ? `**Matières** : ${matNames}` : "",
      ].filter(Boolean).join("\n\n");

      if (existing) {
        await admin.from("kb_articles").update({ title: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), content, updated_at: new Date().toISOString() }).eq("id", existing.id);
        updated++;
      } else {
        await admin.from("kb_articles").insert({
          title: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          content,
          category_id: catMap.get("personnel"),
          source: "auto_platform",
          source_ref: ref,
          status: "approved",
          published_at: new Date().toISOString(),
          visibility: "staff_only",
          tags: ["personnel", p.role, (p.last_name ?? "").toLowerCase()],
        });
        created++;
      }
    }
  }

  // ─── Create coaching categories per formation ───
  if (dossiers) {
    const formationDossiers = dossiers.filter(d => d.dossier_type === "offer" || d.dossier_type === "university");
    for (const formation of formationDossiers) {
      const slug = `coaching-${formation.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
      const { data: existing } = await admin.from("kb_categories").select("id").eq("slug", slug).single();
      if (existing) {
        catMap.set(slug, existing.id);
      } else {
        const { data: newCat } = await admin.from("kb_categories")
          .insert({
            name: `Coaching — ${formation.name}`,
            slug,
            icon: "HeartHandshake",
            color: "#EC4899",
            order_index: 10 + formationDossiers.indexOf(formation),
          })
          .select("id").single();
        if (newCat) { catMap.set(slug, newCat.id); created++; }
      }

      const parentId = catMap.get(slug);
      if (parentId) {
        const subCats = [
          { suffix: "orga", name: "Organisation & Planning", icon: "Calendar", color: "#F59E0B" },
          { suffix: "matieres", name: "Matières & Révisions", icon: "BookOpen", color: "#8B5CF6" },
          { suffix: "examens", name: "Examens & Concours", icon: "Target", color: "#EF4444" },
          { suffix: "methode", name: "Méthodologie", icon: "Stethoscope", color: "#10B981" },
        ];
        for (const sub of subCats) {
          const subSlug = `${slug}-${sub.suffix}`;
          const { data: existingSub } = await admin.from("kb_categories").select("id").eq("slug", subSlug).single();
          if (!existingSub) {
            await admin.from("kb_categories").insert({
              name: sub.name,
              slug: subSlug,
              parent_id: parentId,
              icon: sub.icon,
              color: sub.color,
              order_index: subCats.indexOf(sub),
            });
            created++;
          }
        }
      }
    }
  }

  // ─── Create per-formation sub-categories for matières & pédagogie ───
  if (dossiers && catMap.has("matieres-pedagogie")) {
    const matPedaParent = catMap.get("matieres-pedagogie")!;
    const formationDossiers = dossiers.filter(d => d.dossier_type === "offer" || d.dossier_type === "university");
    for (const formation of formationDossiers) {
      const subSlug = `matieres-${formation.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
      const { data: existing } = await admin.from("kb_categories").select("id").eq("slug", subSlug).single();
      if (!existing) {
        await admin.from("kb_categories").insert({
          name: formation.name,
          slug: subSlug,
          parent_id: matPedaParent,
          icon: "School",
          color: formation.color || "#3B82F6",
          order_index: formationDossiers.indexOf(formation),
        });
        created++;
      }
    }
  }

  // ─── Create per-formation sub-categories for formations & classes ───
  if (dossiers && catMap.has("formations")) {
    const formationsParent = catMap.get("formations")!;
    const formationDossiers = dossiers.filter(d => d.dossier_type === "offer" || d.dossier_type === "university");
    for (const formation of formationDossiers) {
      const subSlug = `formations-${formation.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
      const { data: existing } = await admin.from("kb_categories").select("id").eq("slug", subSlug).single();
      if (!existing) {
        await admin.from("kb_categories").insert({
          name: formation.name,
          slug: subSlug,
          parent_id: formationsParent,
          icon: "GraduationCap",
          color: formation.color || "#3B82F6",
          order_index: formationDossiers.indexOf(formation),
        });
        created++;
      }
    }
  }

  revalidatePath(KB_PATH);
  return { success: true, created, updated };
}

// ─── Analytics ──────────────────────────────────────────────

export async function getKbStats() {
  const admin = createAdminClient();

  const [articlesRes, pendingRes, unansweredRes, logsRes] = await Promise.all([
    admin.from("kb_articles").select("id", { count: "exact", head: true }),
    admin.from("kb_articles").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    admin.from("kb_chat_logs").select("id", { count: "exact", head: true }).eq("had_answer", false),
    admin.from("kb_chat_logs").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalArticles: articlesRes.count ?? 0,
    pendingReview: pendingRes.count ?? 0,
    unansweredQuestions: unansweredRes.count ?? 0,
    totalQuestions: logsRes.count ?? 0,
  };
}

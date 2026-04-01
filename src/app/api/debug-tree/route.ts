import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = createAdminClient();
  const { data: dossiers } = await admin.from("dossiers").select("id, name, parent_id, dossier_type, visible").order("order_index");
  const { data: matieres } = await admin.from("matieres").select("id, name, dossier_id, visible").order("order_index");
  if (!dossiers) return NextResponse.json({ error: "no dossiers" });

  const offers = dossiers.filter(d => !d.parent_id && (d.dossier_type === "offer" || d.dossier_type === "generic"));

  const buildTree = (parentId: string, depth: number): string[] => {
    const lines: string[] = [];
    const children = dossiers.filter(d => d.parent_id === parentId);
    for (const c of children) {
      const mat = (matieres ?? []).find(m => m.dossier_id === c.id);
      const indent = "  ".repeat(depth);
      lines.push(`${indent}[${c.dossier_type}${c.visible ? "" : " HIDDEN"}] ${c.name}${mat ? ` (matiere: ${mat.name})` : ""}`);
      lines.push(...buildTree(c.id, depth + 1));
    }
    return lines;
  };

  const tree: Record<string, string[]> = {};
  for (const o of offers) {
    tree[o.name] = [`[${o.dossier_type}] ${o.name}`, ...buildTree(o.id, 1)];
  }

  return NextResponse.json(tree);
}

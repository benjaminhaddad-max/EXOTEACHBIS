import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const linkedId = searchParams.get("linkedId");
  const currentId = searchParams.get("currentId");

  if (!linkedId) return NextResponse.json({ offers: [] });

  const supabase = await createClient();

  // Get all courses with same linked_cours_id (except current)
  const { data: linkedCours } = await supabase
    .from("cours")
    .select("id, dossier_id")
    .eq("linked_cours_id", linkedId)
    .neq("id", currentId ?? "");

  if (!linkedCours?.length) return NextResponse.json({ offers: [] });

  // Get all dossiers to walk up to offer
  const { data: allDossiers } = await supabase
    .from("dossiers")
    .select("id, name, parent_id, dossier_type");

  if (!allDossiers) return NextResponse.json({ offers: [] });

  const byId = new Map(allDossiers.map((d) => [d.id, d]));

  const offers: string[] = [];
  for (const c of linkedCours) {
    let cur: string | null = c.dossier_id;
    let offerName = "";
    while (cur) {
      const d = byId.get(cur);
      if (!d) break;
      if (d.dossier_type === "offer") { offerName = d.name; break; }
      cur = d.parent_id;
    }
    if (offerName && !offers.includes(offerName)) offers.push(offerName);
  }

  return NextResponse.json({ offers });
}

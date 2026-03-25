import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Vérifie si les colonnes existent déjà
async function columnExists(supabase: any, table: string, column: string): Promise<boolean> {
  const { data } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_name", table)
    .eq("column_name", column)
    .single();
  return !!data;
}

export async function GET() {
  // This route checks migration status — actual DDL must be run in Supabase SQL Editor
  const status = {
    instruction: "Run the following SQL in Supabase Dashboard > SQL Editor",
    sql_006: `
ALTER TABLE public.cours ADD COLUMN IF NOT EXISTS dossier_id uuid REFERENCES public.dossiers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cours_dossier ON public.cours(dossier_id);
    `.trim(),
  };

  return NextResponse.json(status);
}

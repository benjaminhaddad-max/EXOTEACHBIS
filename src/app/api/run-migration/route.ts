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
  return NextResponse.json({
    instruction: "Run migration 052 in Supabase Dashboard > SQL Editor",
    sql: `
CREATE TABLE IF NOT EXISTS public.series_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  intro_text TEXT,
  image_url TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.series_sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Authenticated can read series_sections" ON public.series_sections FOR SELECT USING (auth.uid() IS NOT NULL); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage series_sections" ON public.series_sections FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin','prof'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.series_questions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.series_sections(id) ON DELETE SET NULL;
    `.trim(),
  });
}

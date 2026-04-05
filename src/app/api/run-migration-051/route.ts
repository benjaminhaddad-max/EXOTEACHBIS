"use server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { db: { schema: "public" } });

  // Add columns using raw SQL via rpc or direct query
  const { error: e1 } = await supabase.rpc("exec_migration", {
    sql: "ALTER TABLE public.examens_series ADD COLUMN IF NOT EXISTS sujet_url TEXT, ADD COLUMN IF NOT EXISTS correction_url TEXT;"
  }).single();

  if (e1) {
    // Fallback: try individual column additions via Supabase client
    // Check if columns already exist by trying to select them
    const { error: testErr } = await supabase
      .from("examens_series")
      .select("sujet_url")
      .limit(1);

    if (testErr) {
      return NextResponse.json({
        ok: false,
        error: e1.message,
        fallback_error: testErr.message,
        instruction: "Run this SQL in Supabase Dashboard > SQL Editor: ALTER TABLE public.examens_series ADD COLUMN IF NOT EXISTS sujet_url TEXT, ADD COLUMN IF NOT EXISTS correction_url TEXT;"
      });
    }

    return NextResponse.json({ ok: true, message: "Columns already exist" });
  }

  return NextResponse.json({ ok: true, message: "Migration applied" });
}

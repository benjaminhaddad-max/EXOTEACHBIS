import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Redirect to login after clearing server-side session/cookies
  return NextResponse.json({ success: true });
}

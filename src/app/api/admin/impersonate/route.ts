import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // 1. Vérifier que le caller est superadmin
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "superadmin") {
      return NextResponse.json({ error: "Réservé aux super admins" }, { status: 403 });
    }

    // 2. Récupérer l'email du user cible
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId requis" }, { status: 400 });
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single();

    if (!target?.email) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    // 3. Générer une session via service role
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Utiliser generateLink pour obtenir les tokens directement
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });

    if (linkErr || !linkData) {
      return NextResponse.json({ error: linkErr?.message || "Échec" }, { status: 500 });
    }

    // Vérifier le token côté serveur pour obtenir une vraie session
    const { data: session, error: verifyErr } = await admin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyErr || !session.session) {
      return NextResponse.json({ error: verifyErr?.message || "Vérification échouée" }, { status: 500 });
    }

    // 4. Retourner access_token + refresh_token — le client va les utiliser pour se connecter
    return NextResponse.json({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

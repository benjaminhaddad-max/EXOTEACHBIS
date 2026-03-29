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

    const callerRole = profile?.role;
    if (callerRole !== "superadmin" && callerRole !== "coach") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // 2. Récupérer l'email du user cible
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId requis" }, { status: 400 });
    }

    // Pour les coaches : vérifier que l'élève est dans un de leurs groupes
    if (callerRole === "coach") {
      const { data: coachGroupes } = await supabase
        .from("coach_groupe_assignments")
        .select("groupe_id")
        .eq("coach_id", user.id);

      const coachGroupeIds = (coachGroupes ?? []).map((g) => g.groupe_id);

      if (coachGroupeIds.length === 0) {
        return NextResponse.json({ error: "Aucun groupe assigné" }, { status: 403 });
      }

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("role, groupe_id")
        .eq("id", userId)
        .single();

      if (!targetProfile || targetProfile.role !== "eleve") {
        return NextResponse.json({ error: "Seuls les élèves peuvent être impersonnés" }, { status: 403 });
      }

      if (!targetProfile.groupe_id || !coachGroupeIds.includes(targetProfile.groupe_id)) {
        return NextResponse.json({ error: "Cet élève n'est pas dans vos classes" }, { status: 403 });
      }
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

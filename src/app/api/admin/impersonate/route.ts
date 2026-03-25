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

    // 3. Générer un magic link via service role (bypasses all auth)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });

    if (linkErr || !linkData) {
      return NextResponse.json({ error: linkErr?.message || "Échec génération lien" }, { status: 500 });
    }

    // Le hashed_token est dans les properties du lien
    const token = linkData.properties?.hashed_token;
    if (!token) {
      return NextResponse.json({ error: "Token non généré" }, { status: 500 });
    }

    // 4. Construire l'URL de vérification OTP
    const redirectUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=${encodeURIComponent(req.nextUrl.origin + "/dashboard")}`;

    return NextResponse.json({ url: redirectUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

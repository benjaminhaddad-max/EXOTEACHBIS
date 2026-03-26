import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  const isAuthRoute = pathname === "/login" || pathname === "/register";
  const isApiRoute = pathname.startsWith("/api/");
  const isAdminRoute = pathname.startsWith("/admin");
  const isScopedStaffAllowedAdminRoute = pathname === "/admin/annonces";

  // Routes API publiques (seed, migrate)
  if (isApiRoute) return supabaseResponse;

  // Pas connecté → login
  if (!user && !isAuthRoute && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile?.role ?? user.user_metadata?.role ?? "eleve") as UserRole;
    const isAdmin = role === "admin" || role === "superadmin";

    // Connecté sur page auth → rediriger
    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = isAdmin ? "/admin/dashboard" : ["prof", "coach"].includes(role) ? "/admin/annonces" : "/dashboard";
      return NextResponse.redirect(url);
    }

    // Élève ou staff limité qui tente d'accéder à /admin → dashboard
    if (isAdminRoute && !isAdmin && !((role === "prof" || role === "coach") && isScopedStaffAllowedAdminRoute)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Les admins peuvent accéder aux routes étudiants (séries, cours, exercices…)
    // pour avoir la même expérience que les élèves + les outils d'édition admin
  }

  return supabaseResponse;
}

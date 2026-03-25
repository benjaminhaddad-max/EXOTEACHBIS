import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { Users, GraduationCap, BookOpen, ShieldCheck } from "lucide-react";
import type { Profile, Groupe } from "@/types/database";

export const dynamic = "force-dynamic";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  superadmin: <ShieldCheck size={12} />,
  admin: <ShieldCheck size={12} />,
  prof: <BookOpen size={12} />,
  eleve: <GraduationCap size={12} />,
};
const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  prof: "Professeur",
  eleve: "Élève",
};
const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-100 text-red-700",
  admin: "bg-orange-100 text-orange-700",
  prof: "bg-blue-100 text-blue-700",
  eleve: "bg-green-100 text-green-700",
};

export default async function EquipePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("groupe_id")
    .eq("id", user!.id)
    .single();

  // Staff (profs + admins)
  const { data: staff } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "superadmin", "prof"])
    .order("role")
    .order("first_name");

  // My groupe + members
  let myGroupe: Groupe | null = null;
  let membres: Profile[] = [];

  if (myProfile?.groupe_id) {
    const [groupeRes, membresRes] = await Promise.all([
      supabase.from("groupes").select("*").eq("id", myProfile.groupe_id).single(),
      supabase.from("profiles").select("*").eq("groupe_id", myProfile.groupe_id).order("first_name"),
    ]);
    myGroupe = groupeRes.data as Groupe;
    membres = (membresRes.data ?? []) as Profile[];
  }

  const staffList = (staff ?? []) as Profile[];

  return (
    <div>
      <Header title="Équipe" />

      <div className="space-y-8">
        {/* Mon groupe */}
        {myGroupe && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: myGroupe.color }} />
              <h2 className="text-base font-semibold text-gray-900">Ma promotion — {myGroupe.name}</h2>
              {myGroupe.annee && (
                <span className="text-xs text-gray-400">{myGroupe.annee}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {membres.map((m) => (
                <ProfileCard key={m.id} profile={m} isMe={m.id === user!.id} />
              ))}
            </div>
          </section>
        )}

        {/* Équipe pédagogique */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Équipe pédagogique</h2>
          {staffList.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun membre du staff pour l'instant.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {staffList.map((m) => (
                <ProfileCard key={m.id} profile={m} isMe={m.id === user!.id} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfileCard({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email.split("@")[0];
  const initial = name[0]?.toUpperCase() ?? "?";
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;
  const roleColor = ROLE_COLORS[profile.role] ?? "bg-gray-100 text-gray-600";
  const roleIcon = ROLE_ICONS[profile.role];

  return (
    <div className={`rounded-xl border ${isMe ? "border-navy/30 bg-navy/5" : "border-gray-200 bg-white"} shadow-sm p-4 text-center space-y-2`}>
      <div className="mx-auto w-12 h-12 rounded-full bg-navy/10 flex items-center justify-center text-navy text-lg font-bold">
        {initial}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        {isMe && <p className="text-xs text-navy">(vous)</p>}
      </div>
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${roleColor}`}>
        {roleIcon} {roleLabel}
      </span>
    </div>
  );
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const COLORS = ["#6366F1", "#EC4899", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316"];

const FIRST_NAMES = [
  "Alice", "Benjamin", "Chloé", "David", "Emma",
  "Félix", "Gabrielle", "Hugo", "Inès", "Jules",
  "Léa", "Maxime", "Nina", "Oscar", "Pauline",
  "Quentin", "Rose", "Samuel", "Théa", "Ulysse",
];
const LAST_NAMES = [
  "Martin", "Bernard", "Thomas", "Robert", "Richard",
  "Petit", "Durand", "Leroy", "Moreau", "Simon",
  "Laurent", "Lefèvre", "Michel", "Garcia", "David",
  "Bertrand", "Roux", "Vincent", "Fournier", "Morel",
];

export async function POST() {
  const admin = createAdminClient();
  const log: string[] = [];
  let userIndex = 0;

  try {
    // 1. Load all dossiers and existing groupes
    const { data: dossiers } = await admin.from("dossiers").select("*").eq("visible", true).order("order_index");
    const { data: existingGroupes } = await admin.from("groupes").select("*");
    if (!dossiers) return NextResponse.json({ error: "No dossiers" }, { status: 500 });

    const offers = dossiers.filter(d => !d.parent_id && (d.dossier_type === "offer" || d.dossier_type === "generic"));
    log.push(`Found ${offers.length} offers: ${offers.map(o => o.name).join(", ")}`);

    // Helper: get all descendant dossier IDs for content access
    const getAllDescendantIds = (parentId: string): string[] => {
      const ids = [parentId];
      for (const d of dossiers!.filter(d => d.parent_id === parentId)) {
        ids.push(...getAllDescendantIds(d.id));
      }
      return ids;
    };

    // Helper: create a user
    const createUser = async (firstName: string, lastName: string, email: string, groupeId: string) => {
      const password = "Test1234!";
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, role: "eleve" },
      });
      if (authErr) {
        log.push(`  ⚠ User ${email}: ${authErr.message}`);
        return null;
      }
      // Update profile
      await admin.from("profiles").update({
        first_name: firstName,
        last_name: lastName,
        role: "eleve",
        groupe_id: groupeId,
        updated_at: new Date().toISOString(),
      }).eq("id", authUser.user.id);
      return authUser.user.id;
    };

    // Helper: create 2 classes + 10 users (5 per class) for a given formation_dossier_id
    const createClassesAndUsers = async (formationDossierId: string, contextName: string, accessRootId: string) => {
      const colorIdx = Math.floor(Math.random() * COLORS.length);
      const classes: { id: string; name: string }[] = [];

      for (let c = 1; c <= 2; c++) {
        const className = `Classe ${c}`;
        // Check if class already exists
        const existing = (existingGroupes ?? []).find(g => g.name === className && g.formation_dossier_id === formationDossierId);
        if (existing) {
          classes.push({ id: existing.id, name: existing.name });
          log.push(`  ✓ Classe existante: ${className} (${contextName})`);
        } else {
          const { data: grp, error: grpErr } = await admin.from("groupes").insert({
            name: className,
            color: COLORS[(colorIdx + c) % COLORS.length],
            formation_dossier_id: formationDossierId,
            annee: "2025-2026",
          }).select("*").single();
          if (grpErr) { log.push(`  ✗ Classe ${className}: ${grpErr.message}`); continue; }
          classes.push({ id: grp.id, name: grp.name });
          log.push(`  + Classe créée: ${className} (${contextName})`);
        }
      }

      // Grant access: all dossiers under the root
      const accessIds = getAllDescendantIds(accessRootId);
      for (const cls of classes) {
        // Upsert access
        const records = accessIds.map(did => ({ groupe_id: cls.id, dossier_id: did }));
        const { error: accErr } = await admin.from("groupe_dossier_acces").upsert(records, { onConflict: "groupe_id,dossier_id" });
        if (accErr) log.push(`  ⚠ Accès ${cls.name}: ${accErr.message}`);
        else log.push(`  ✓ Accès: ${accessIds.length} dossiers pour ${cls.name}`);
      }

      // Create 5 users per class = 10 total
      for (const cls of classes) {
        for (let u = 0; u < 5; u++) {
          const fn = FIRST_NAMES[userIndex % FIRST_NAMES.length];
          const ln = LAST_NAMES[userIndex % LAST_NAMES.length];
          const suffix = userIndex + 1;
          const email = `eleve${suffix}@test-exoteach.fr`;
          userIndex++;

          const userId = await createUser(fn, ln, email, cls.id);
          if (userId) log.push(`    + ${fn} ${ln} (${email}) → ${cls.name}`);
        }
      }
    };

    // 2. Process each offer
    for (const offer of offers) {
      log.push(`\n=== ${offer.name} ===`);

      const subOffers = dossiers.filter(d => d.parent_id === offer.id && d.dossier_type === "sub_offer");
      const universities = dossiers.filter(d => d.parent_id === offer.id && d.dossier_type === "university");

      if (subOffers.length > 0) {
        // Offer has sub-offers → check each sub-offer for universities
        for (const sub of subOffers) {
          const subUnis = dossiers.filter(d => d.parent_id === sub.id && d.dossier_type === "university");
          if (subUnis.length > 0) {
            for (const uni of subUnis) {
              log.push(`\n  [${offer.name} > ${sub.name} > ${uni.name}]`);
              await createClassesAndUsers(uni.id, `${sub.name} > ${uni.name}`, uni.id);
            }
          } else {
            // Sub-offer without universities → classes on the sub-offer
            log.push(`\n  [${offer.name} > ${sub.name}] (pas d'université)`);
            await createClassesAndUsers(sub.id, sub.name, sub.id);
          }
        }
      } else if (universities.length > 0) {
        // Offer has direct universities
        for (const uni of universities) {
          log.push(`\n  [${offer.name} > ${uni.name}]`);
          await createClassesAndUsers(uni.id, uni.name, uni.id);
        }
      } else {
        // Offer without any sub-structure → classes directly on the offer
        log.push(`\n  [${offer.name}] (pas d'université ni sous-offre)`);
        await createClassesAndUsers(offer.id, offer.name, offer.id);
      }
    }

    log.push(`\n✅ Terminé ! ${userIndex} utilisateurs créés.`);
    return NextResponse.json({ success: true, usersCreated: userIndex, log });
  } catch (err: any) {
    log.push(`\n❌ Erreur: ${err.message}`);
    return NextResponse.json({ error: err.message, log }, { status: 500 });
  }
}

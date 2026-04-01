import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PROF_NAMES = [
  { first: "Dr. Marie", last: "Dupont" },
  { first: "Prof. Jean", last: "Mercier" },
  { first: "Dr. Claire", last: "Fontaine" },
  { first: "Prof. Antoine", last: "Garnier" },
  { first: "Dr. Sophie", last: "Blanchard" },
  { first: "Prof. Lucas", last: "Chevalier" },
  { first: "Dr. Émilie", last: "Rousseau" },
  { first: "Prof. Nicolas", last: "Perrin" },
  { first: "Dr. Camille", last: "André" },
  { first: "Prof. Thomas", last: "Lemoine" },
  { first: "Dr. Julie", last: "Girard" },
  { first: "Prof. Marc", last: "Bonnet" },
  { first: "Dr. Isabelle", last: "Faure" },
  { first: "Prof. Philippe", last: "Renard" },
  { first: "Dr. Nathalie", last: "Picard" },
];

const COACH_NAMES = [
  { first: "Coach Sarah", last: "Morin" },
  { first: "Coach Romain", last: "Lefevre" },
  { first: "Coach Anaïs", last: "Gautier" },
  { first: "Coach Julien", last: "Marchand" },
  { first: "Coach Laura", last: "Colin" },
  { first: "Coach Mathieu", last: "Dumas" },
];

export async function POST() {
  const admin = createAdminClient();
  const log: string[] = [];
  let profIndex = 0;
  let coachIndex = 0;

  try {
    const { data: dossiers } = await admin.from("dossiers").select("*").eq("visible", true).order("order_index");
    const { data: groupes } = await admin.from("groupes").select("*");
    const { data: matieres } = await admin.from("matieres").select("*").order("order_index");
    if (!dossiers || !matieres) return NextResponse.json({ error: "No data" }, { status: 500 });

    const offers = dossiers.filter(d => !d.parent_id && (d.dossier_type === "offer" || d.dossier_type === "generic"));

    // --- Helpers ---

    const createUser = async (firstName: string, lastName: string, email: string, role: "prof" | "coach") => {
      const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (existing) {
        log.push(`  ✓ ${email} existe déjà`);
        // Clear old prof_matieres for re-assignment
        if (role === "prof") await admin.from("prof_matieres").delete().eq("prof_id", existing.id);
        return existing.id;
      }
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email, password: "Test1234!", email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, role },
      });
      if (authErr) { log.push(`  ⚠ ${email}: ${authErr.message}`); return null; }
      await admin.from("profiles").update({
        first_name: firstName, last_name: lastName, role, updated_at: new Date().toISOString(),
      }).eq("id", authUser.user.id);
      return authUser.user.id;
    };

    const getSubjects = (rootId: string): typeof dossiers => {
      const subjects: typeof dossiers = [];
      const collect = (parentId: string) => {
        for (const d of dossiers!.filter(d => d.parent_id === parentId)) {
          if (d.dossier_type === "subject") subjects.push(d);
          collect(d.id);
        }
      };
      collect(rootId);
      return subjects;
    };

    const ensureMatiere = async (subject: { id: string; name: string; color: string }) => {
      let mat = matieres!.find(m => m.dossier_id === subject.id);
      if (mat) return mat;
      const { data: newMat, error } = await admin.from("matieres").insert({
        name: subject.name, color: subject.color || "#3B82F6", dossier_id: subject.id, visible: true,
      }).select("*").single();
      if (error) { log.push(`    ⚠ matière ${subject.name}: ${error.message}`); return null; }
      matieres!.push(newMat);
      return newMat;
    };

    const getUniversities = (rootId: string): typeof dossiers => {
      const unis: typeof dossiers = [];
      const collect = (parentId: string) => {
        for (const d of dossiers!.filter(d => d.parent_id === parentId)) {
          if (d.dossier_type === "university") unis.push(d);
          else if (d.dossier_type === "sub_offer" || d.dossier_type === "offer") collect(d.id);
        }
      };
      collect(rootId);
      return unis;
    };

    const getGroupesForUni = (uniId: string) => (groupes ?? []).filter(g => g.formation_dossier_id === uniId);

    // --- Process each offer ---

    for (const offer of offers) {
      log.push(`\n=== ${offer.name} ===`);

      const subjects = getSubjects(offer.id);
      const universities = getUniversities(offer.id);
      const allGroupeIds = universities.length > 0
        ? universities.flatMap(u => getGroupesForUni(u.id).map(g => g.id))
        : (groupes ?? []).filter(g => g.formation_dossier_id === offer.id).map(g => g.id);

      if (subjects.length === 0) {
        log.push(`  (pas de matières/subjects)`);
        continue;
      }

      // Ensure all matieres exist
      const subjectMatieres: { subject: (typeof subjects)[0]; matiere: any }[] = [];
      for (const s of subjects) {
        const mat = await ensureMatiere(s);
        if (mat) subjectMatieres.push({ subject: s, matiere: mat });
      }

      log.push(`  ${subjectMatieres.length} matières, ${allGroupeIds.length} classes`);

      // Split ALL matières into 3 buckets so every matière is covered
      const third = Math.ceil(subjectMatieres.length / 3);
      const bucketCours = subjectMatieres.slice(0, third);
      const bucketContenu = subjectMatieres.slice(third, third * 2);
      const bucketBoth = subjectMatieres.slice(third * 2);

      // TYPE 1: Prof "cours" — donne cours à toutes les classes
      {
        const pn = PROF_NAMES[profIndex % PROF_NAMES.length];
        const email = `prof.cours.${profIndex + 1}@test-exoteach.fr`;
        profIndex++;
        const userId = await createUser(pn.first, pn.last, email, "prof");
        if (userId && bucketCours.length > 0) {
          const records = bucketCours.flatMap(sm =>
            allGroupeIds.length > 0
              ? allGroupeIds.map(gid => ({ prof_id: userId, matiere_id: sm.matiere.id, role_type: "cours", groupe_id: gid }))
              : [{ prof_id: userId, matiere_id: sm.matiere.id, role_type: "cours", groupe_id: null }]
          );
          await admin.from("prof_matieres").insert(records);
          log.push(`  + ${pn.first} ${pn.last} (${email}) — COURS [${bucketCours.length}]: ${bucketCours.map(m => m.subject.name).join(", ")}`);
        }
      }

      // TYPE 2: Prof "contenu" — responsable contenu uniquement
      {
        const pn = PROF_NAMES[profIndex % PROF_NAMES.length];
        const email = `prof.contenu.${profIndex + 1}@test-exoteach.fr`;
        profIndex++;
        const userId = await createUser(pn.first, pn.last, email, "prof");
        if (userId && bucketContenu.length > 0) {
          const records = bucketContenu.map(sm => ({
            prof_id: userId, matiere_id: sm.matiere.id, role_type: "contenu", groupe_id: null as string | null,
          }));
          await admin.from("prof_matieres").insert(records);
          log.push(`  + ${pn.first} ${pn.last} (${email}) — CONTENU [${bucketContenu.length}]: ${bucketContenu.map(m => m.subject.name).join(", ")}`);
        }
      }

      // TYPE 3: Prof "cours + contenu" — fait les deux
      {
        const pn = PROF_NAMES[profIndex % PROF_NAMES.length];
        const email = `prof.both.${profIndex + 1}@test-exoteach.fr`;
        profIndex++;
        const userId = await createUser(pn.first, pn.last, email, "prof");
        if (userId && bucketBoth.length > 0) {
          const coursRecords = bucketBoth.flatMap(sm =>
            allGroupeIds.length > 0
              ? allGroupeIds.map(gid => ({ prof_id: userId, matiere_id: sm.matiere.id, role_type: "cours", groupe_id: gid }))
              : [{ prof_id: userId, matiere_id: sm.matiere.id, role_type: "cours", groupe_id: null }]
          );
          const contenuRecords = bucketBoth.map(sm => ({
            prof_id: userId, matiere_id: sm.matiere.id, role_type: "contenu", groupe_id: null as string | null,
          }));
          await admin.from("prof_matieres").insert([...coursRecords, ...contenuRecords]);
          log.push(`  + ${pn.first} ${pn.last} (${email}) — COURS+CONTENU [${bucketBoth.length}]: ${bucketBoth.map(m => m.subject.name).join(", ")}`);
        }
      }

      // COACH — assigné à toutes les classes de l'offre
      {
        const cn = COACH_NAMES[coachIndex % COACH_NAMES.length];
        const email = `coach.${coachIndex + 1}@test-exoteach.fr`;
        coachIndex++;
        const userId = await createUser(cn.first, cn.last, email, "coach");
        if (userId && allGroupeIds.length > 0) {
          await admin.from("coach_groupe_assignments").upsert(
            allGroupeIds.map(gid => ({ coach_id: userId, groupe_id: gid })),
            { onConflict: "coach_id,groupe_id" }
          );
          log.push(`  + ${cn.first} ${cn.last} (${email}) — COACH: ${allGroupeIds.length} classes`);
        }
      }
    }

    log.push(`\n✅ Terminé ! ${profIndex} profs + ${coachIndex} coachs.`);
    log.push(`Chaque matière de chaque formation est couverte par au moins 1 prof.`);
    return NextResponse.json({ success: true, profsCreated: profIndex, coachsCreated: coachIndex, log });
  } catch (err: any) {
    log.push(`\n❌ Erreur: ${err.message}`);
    return NextResponse.json({ error: err.message, log }, { status: 500 });
  }
}

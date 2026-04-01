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
    // 1. Load structure
    const { data: dossiers } = await admin.from("dossiers").select("*").eq("visible", true).order("order_index");
    const { data: groupes } = await admin.from("groupes").select("*");
    const { data: matieres } = await admin.from("matieres").select("*").eq("visible", true).order("order_index");
    if (!dossiers || !matieres) return NextResponse.json({ error: "No data" }, { status: 500 });

    const offers = dossiers.filter(d => !d.parent_id && (d.dossier_type === "offer" || d.dossier_type === "generic"));

    // Helper: create a user
    const createUser = async (firstName: string, lastName: string, email: string, role: "prof" | "coach") => {
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email,
        password: "Test1234!",
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, role },
      });
      if (authErr) {
        log.push(`  ⚠ ${email}: ${authErr.message}`);
        return null;
      }
      await admin.from("profiles").update({
        first_name: firstName, last_name: lastName, role, updated_at: new Date().toISOString(),
      }).eq("id", authUser.user.id);
      return authUser.user.id;
    };

    // Helper: get all subject dossiers under a root
    const getSubjects = (rootId: string): typeof dossiers => {
      const subjects: typeof dossiers = [];
      const collect = (parentId: string) => {
        for (const d of dossiers!.filter(d => d.parent_id === parentId)) {
          if (d.dossier_type === "subject") subjects.push(d);
          else collect(d.id);
        }
      };
      collect(rootId);
      return subjects;
    };

    // Helper: get all universities under a root
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

    // Helper: get groupes for a university
    const getGroupesForUni = (uniId: string) => (groupes ?? []).filter(g => g.formation_dossier_id === uniId);

    // 2. For each offer, create profs and coachs
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

      // Get or find matieres linked to subjects
      const subjectMatieres = subjects.map(s => {
        const mat = matieres.find(m => m.dossier_id === s.id);
        return { subject: s, matiere: mat };
      }).filter(sm => sm.matiere);

      log.push(`  ${subjectMatieres.length} matières, ${allGroupeIds.length} classes`);

      // --- Create 3 types of profs per offer ---

      // TYPE 1: Prof "cours" — teaches classes (2 matières, assigned to all classes)
      {
        const pn = PROF_NAMES[profIndex % PROF_NAMES.length];
        const email = `prof.cours.${profIndex + 1}@test-exoteach.fr`;
        profIndex++;
        const userId = await createUser(pn.first, pn.last, email, "prof");
        if (userId) {
          // Assign 2 matières with role "cours" + all groupes
          const assignMats = subjectMatieres.slice(0, Math.min(2, subjectMatieres.length));
          const records = assignMats.flatMap(sm =>
            allGroupeIds.length > 0
              ? allGroupeIds.map(gid => ({ prof_id: userId, matiere_id: sm.matiere!.id, role_type: "cours", groupe_id: gid }))
              : [{ prof_id: userId, matiere_id: sm.matiere!.id, role_type: "cours", groupe_id: null }]
          );
          if (records.length > 0) {
            await admin.from("prof_matieres").insert(records);
          }
          log.push(`  + ${pn.first} ${pn.last} (${email}) — COURS: ${assignMats.map(m => m.subject.name).join(", ")}`);
        }
      }

      // TYPE 2: Prof "contenu" — creates content only (2 matières, no classes)
      {
        const pn = PROF_NAMES[profIndex % PROF_NAMES.length];
        const email = `prof.contenu.${profIndex + 1}@test-exoteach.fr`;
        profIndex++;
        const userId = await createUser(pn.first, pn.last, email, "prof");
        if (userId) {
          const assignMats = subjectMatieres.slice(2, Math.min(4, subjectMatieres.length));
          if (assignMats.length === 0 && subjectMatieres.length > 0) {
            assignMats.push(...subjectMatieres.slice(0, 1));
          }
          const records = assignMats.map(sm => ({ prof_id: userId, matiere_id: sm.matiere!.id, role_type: "contenu", groupe_id: null }));
          if (records.length > 0) {
            await admin.from("prof_matieres").insert(records);
          }
          log.push(`  + ${pn.first} ${pn.last} (${email}) — CONTENU: ${assignMats.map(m => m.subject.name).join(", ")}`);
        }
      }

      // TYPE 3: Prof "cours + contenu" — does both (3 matières, cours on all classes + contenu)
      {
        const pn = PROF_NAMES[profIndex % PROF_NAMES.length];
        const email = `prof.both.${profIndex + 1}@test-exoteach.fr`;
        profIndex++;
        const userId = await createUser(pn.first, pn.last, email, "prof");
        if (userId) {
          const assignMats = subjectMatieres.slice(0, Math.min(3, subjectMatieres.length));
          const coursRecords = assignMats.flatMap(sm =>
            allGroupeIds.length > 0
              ? allGroupeIds.map(gid => ({ prof_id: userId, matiere_id: sm.matiere!.id, role_type: "cours", groupe_id: gid }))
              : [{ prof_id: userId, matiere_id: sm.matiere!.id, role_type: "cours", groupe_id: null }]
          );
          const contenuRecords = assignMats.map(sm => ({ prof_id: userId, matiere_id: sm.matiere!.id, role_type: "contenu", groupe_id: null }));
          const allRecords = [...coursRecords, ...contenuRecords];
          if (allRecords.length > 0) {
            await admin.from("prof_matieres").insert(allRecords);
          }
          log.push(`  + ${pn.first} ${pn.last} (${email}) — COURS+CONTENU: ${assignMats.map(m => m.subject.name).join(", ")}`);
        }
      }

      // --- Create 1 coach per offer, assigned to all classes ---
      {
        const cn = COACH_NAMES[coachIndex % COACH_NAMES.length];
        const email = `coach.${coachIndex + 1}@test-exoteach.fr`;
        coachIndex++;
        const userId = await createUser(cn.first, cn.last, email, "coach");
        if (userId && allGroupeIds.length > 0) {
          const records = allGroupeIds.map(gid => ({ coach_id: userId, groupe_id: gid }));
          await admin.from("coach_groupe_assignments").upsert(records, { onConflict: "coach_id,groupe_id" });
          log.push(`  + ${cn.first} ${cn.last} (${email}) — COACH: ${allGroupeIds.length} classes`);
        } else if (userId) {
          log.push(`  + ${cn.first} ${cn.last} (${email}) — COACH (aucune classe)`);
        }
      }
    }

    log.push(`\n✅ Terminé ! ${profIndex} profs + ${coachIndex} coachs créés.`);
    return NextResponse.json({ success: true, profsCreated: profIndex, coachsCreated: coachIndex, log });
  } catch (err: any) {
    log.push(`\n❌ Erreur: ${err.message}`);
    return NextResponse.json({ error: err.message, log }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// UUIDs fixes pour le seed (pour que les liens entre tables soient cohérents)
const IDS = {
  // Users
  admin: "00000000-0000-0000-0000-000000000001",
  prof: "00000000-0000-0000-0000-000000000002",
  eleve1: "00000000-0000-0000-0000-000000000003",
  eleve2: "00000000-0000-0000-0000-000000000004",

  // Groupes
  groupePass: "10000000-0000-0000-0000-000000000001",
  groupeLas: "10000000-0000-0000-0000-000000000002",

  // Dossiers
  ue1: "20000000-0000-0000-0000-000000000001",
  ue2: "20000000-0000-0000-0000-000000000002",
  ue4: "20000000-0000-0000-0000-000000000003",

  // Matieres
  biochimie: "30000000-0000-0000-0000-000000000001",
  bioMol: "30000000-0000-0000-0000-000000000002",
  bioCel: "30000000-0000-0000-0000-000000000003",
  histologie: "30000000-0000-0000-0000-000000000004",
  stats: "30000000-0000-0000-0000-000000000005",

  // Cours
  cours: {
    bio1: "40000000-0000-0000-0000-000000000001",
    bio2: "40000000-0000-0000-0000-000000000002",
    bio3: "40000000-0000-0000-0000-000000000003",
    mol1: "40000000-0000-0000-0000-000000000004",
    mol2: "40000000-0000-0000-0000-000000000005",
    cel1: "40000000-0000-0000-0000-000000000006",
    cel2: "40000000-0000-0000-0000-000000000007",
    his1: "40000000-0000-0000-0000-000000000008",
    his2: "40000000-0000-0000-0000-000000000009",
    sta1: "40000000-0000-0000-0000-000000000010",
    sta2: "40000000-0000-0000-0000-000000000011",
  },

  // Séries
  serieBiochimie: "50000000-0000-0000-0000-000000000001",
  serieCellulaire: "50000000-0000-0000-0000-000000000002",
  serieConcoursB: "50000000-0000-0000-0000-000000000003",
  serieHisto: "50000000-0000-0000-0000-000000000004",

  // Examen
  examen1: "60000000-0000-0000-0000-000000000001",

  // Flashcard decks
  deckBiochimie: "70000000-0000-0000-0000-000000000001",
  deckCellulaire: "70000000-0000-0000-0000-000000000002",
};

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // =============================================
    // 1. Créer les utilisateurs demo
    // =============================================
    const users = [
      {
        id: IDS.admin,
        email: "admin@diplomasante.fr",
        password: "Demo1234!",
        role: "superadmin",
        first_name: "Sophie",
        last_name: "Martin",
      },
      {
        id: IDS.prof,
        email: "prof@diplomasante.fr",
        password: "Demo1234!",
        role: "prof",
        first_name: "Dr. Paul",
        last_name: "Lefèvre",
      },
      {
        id: IDS.eleve1,
        email: "eleve1@diplomasante.fr",
        password: "Demo1234!",
        role: "eleve",
        first_name: "Camille",
        last_name: "Dubois",
      },
      {
        id: IDS.eleve2,
        email: "eleve2@diplomasante.fr",
        password: "Demo1234!",
        role: "eleve",
        first_name: "Thomas",
        last_name: "Bernard",
      },
    ];

    for (const u of users) {
      const { error } = await supabase.auth.admin.createUser({
        user_metadata: { first_name: u.first_name, last_name: u.last_name, role: u.role },
        email: u.email,
        password: u.password,
        email_confirm: true,
      });
      if (error && !error.message.includes("already been registered")) {
        console.error("User create error:", error.message);
      }
    }

    // Récupérer les IDs réels des users créés (auth peut assigner d'autres UUIDs)
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const userMap: Record<string, string> = {};
    for (const u of authUsers?.users ?? []) {
      const email = u.email!;
      userMap[email] = u.id;
    }

    const adminId = userMap["admin@diplomasante.fr"] ?? IDS.admin;
    const profId = userMap["prof@diplomasante.fr"] ?? IDS.prof;
    const eleve1Id = userMap["eleve1@diplomasante.fr"] ?? IDS.eleve1;
    const eleve2Id = userMap["eleve2@diplomasante.fr"] ?? IDS.eleve2;

    // Mettre à jour les rôles et noms dans profiles
    await supabase.from("profiles").upsert([
      { id: adminId, email: "admin@diplomasante.fr", first_name: "Sophie", last_name: "Martin", role: "superadmin" },
      { id: profId, email: "prof@diplomasante.fr", first_name: "Dr. Paul", last_name: "Lefèvre", role: "prof" },
      { id: eleve1Id, email: "eleve1@diplomasante.fr", first_name: "Camille", last_name: "Dubois", role: "eleve" },
      { id: eleve2Id, email: "eleve2@diplomasante.fr", first_name: "Thomas", last_name: "Bernard", role: "eleve" },
    ]);

    // =============================================
    // 2. Groupes
    // =============================================
    await supabase.from("groupes").upsert([
      { id: IDS.groupePass, name: "Promo PASS 2025", annee: "2024-2025", description: "Première année commune aux études de santé — Parcours accès spécifique santé", color: "#6366F1" },
      { id: IDS.groupeLas, name: "Promo L.AS 2025", annee: "2024-2025", description: "Licence avec accès santé — voie alternative PASS", color: "#10B981" },
    ]);

    // Assigner les élèves au groupe PASS
    await supabase.from("profiles").update({ groupe_id: IDS.groupePass }).in("id", [eleve1Id, eleve2Id]);

    // =============================================
    // 3. Dossiers (UE)
    // =============================================
    await supabase.from("dossiers").upsert([
      { id: IDS.ue1, name: "UE1 — Biomolécules et Grandes Fonctions", description: "Chimie générale, organique et biochimie fondamentale", color: "#6366F1", order_index: 0 },
      { id: IDS.ue2, name: "UE2 — La Cellule et les Tissus", description: "Biologie cellulaire, histologie et organogenèse", color: "#10B981", order_index: 1 },
      { id: IDS.ue4, name: "UE4 — Évaluation des Méthodes Diagnostiques", description: "Statistiques, épidémiologie et santé publique", color: "#F59E0B", order_index: 2 },
    ]);

    // =============================================
    // 4. Matières
    // =============================================
    await supabase.from("matieres").upsert([
      { id: IDS.biochimie, dossier_id: IDS.ue1, name: "Biochimie Structurale", description: "Structure et propriétés des biomolécules (glucides, lipides, protéines)", color: "#6366F1", order_index: 0 },
      { id: IDS.bioMol, dossier_id: IDS.ue1, name: "Biologie Moléculaire", description: "ADN, ARN, réplication, transcription et traduction", color: "#8B5CF6", order_index: 1 },
      { id: IDS.bioCel, dossier_id: IDS.ue2, name: "Biologie Cellulaire", description: "Structure cellulaire, organites et cycle cellulaire", color: "#10B981", order_index: 0 },
      { id: IDS.histologie, dossier_id: IDS.ue2, name: "Histologie", description: "Organisation des tissus et des organes", color: "#14B8A6", order_index: 1 },
      { id: IDS.stats, dossier_id: IDS.ue4, name: "Statistiques Médicales", description: "Épidémiologie, tests statistiques et lecture critique d'articles", color: "#F59E0B", order_index: 0 },
    ]);

    // =============================================
    // 5. Cours
    // =============================================
    await supabase.from("cours").upsert([
      // Biochimie Structurale (3 cours)
      { id: IDS.cours.bio1, matiere_id: IDS.biochimie, name: "Les Acides Aminés", description: "Structure, classification et propriétés des 20 acides aminés standards", order_index: 0, nb_pages: 28 },
      { id: IDS.cours.bio2, matiere_id: IDS.biochimie, name: "Structure des Protéines", description: "Niveaux de structure (primaire, secondaire, tertiaire, quaternaire) et liaisons impliquées", order_index: 1, nb_pages: 35 },
      { id: IDS.cours.bio3, matiere_id: IDS.biochimie, name: "Enzymologie", description: "Catalyse enzymatique, cinétique de Michaelis-Menten, inhibitions", order_index: 2, nb_pages: 42 },
      // Biologie Moléculaire (2 cours)
      { id: IDS.cours.mol1, matiere_id: IDS.bioMol, name: "Structure de l'ADN", description: "Double hélice, liaison hydrogène, compaction chromosomique", order_index: 0, nb_pages: 24 },
      { id: IDS.cours.mol2, matiere_id: IDS.bioMol, name: "Réplication de l'ADN", description: "Mécanismes de réplication, enzymes impliquées, fidélité de la copie", order_index: 1, nb_pages: 30 },
      // Biologie Cellulaire (2 cours)
      { id: IDS.cours.cel1, matiere_id: IDS.bioCel, name: "La Membrane Plasmique", description: "Bicouche lipidique, protéines membranaires, transport membranaire", order_index: 0, nb_pages: 31 },
      { id: IDS.cours.cel2, matiere_id: IDS.bioCel, name: "Le Cycle Cellulaire", description: "Phases du cycle, points de contrôle, mitose et méiose", order_index: 1, nb_pages: 38 },
      // Histologie (2 cours)
      { id: IDS.cours.his1, matiere_id: IDS.histologie, name: "Les Tissus Épithéliaux", description: "Classification, fonctions et localisation des épithéliums", order_index: 0, nb_pages: 26 },
      { id: IDS.cours.his2, matiere_id: IDS.histologie, name: "Les Tissus Conjonctifs", description: "Tissu conjonctif lâche, dense, cartilage et os", order_index: 1, nb_pages: 33 },
      // Statistiques Médicales (2 cours)
      { id: IDS.cours.sta1, matiere_id: IDS.stats, name: "Épidémiologie Descriptive", description: "Mesures de fréquence, biais, prévalence, incidence", order_index: 0, nb_pages: 29 },
      { id: IDS.cours.sta2, matiere_id: IDS.stats, name: "Tests Statistiques", description: "Tests paramétriques et non paramétriques, p-value, intervalles de confiance", order_index: 1, nb_pages: 36 },
    ]);

    // =============================================
    // 6. Questions (10 par matière = 50 questions)
    // =============================================
    const questions: any[] = [];
    const options: any[] = [];
    let qIdx = 0;
    let oIdx = 0;

    const addQ = (
      matiere_id: string,
      cours_id: string | null,
      text: string,
      explanation: string,
      difficulty: number,
      opts: { label: string; text: string; correct: boolean }[]
    ) => {
      const qId = `00000000-0000-0000-0000-${String(qIdx).padStart(12, "0")}`;
      qIdx++;
      questions.push({ id: qId, matiere_id, cours_id, text, explanation, type: "qcm_unique", difficulty });
      opts.forEach((o, i) => {
        const optId = `00000000-0000-0000-0001-${String(oIdx++).padStart(12, "0")}`;
        options.push({ id: optId, question_id: qId, label: o.label, text: o.text, is_correct: o.correct, order_index: i });
      });
      return qId;
    };

    // --- Biochimie Structurale ---
    const bioQIds = [
      addQ(IDS.biochimie, IDS.cours.bio1, "Quelle est la charge globale de la glycine à pH 7,4 ?", "La glycine (pKa1=2,34, pKa2=9,60) est sous forme zwitterionique à pH 7,4, donc sa charge globale est nulle.", 2,
        [{ label:"A", text:"−1", correct:false}, {label:"B", text:"0 (zwitterion)", correct:true}, {label:"C", text:"+1", correct:false}, {label:"D", text:"+2", correct:false}, {label:"E", text:"Dépend de la concentration", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio1, "Quel acide aminé possède un cycle indole dans sa chaîne latérale ?", "Le tryptophane est le seul acide aminé dont la chaîne latérale contient un noyau indole (bicyclique, aromatique).", 2,
        [{ label:"A", text:"Phénylalanine", correct:false}, {label:"B", text:"Tyrosine", correct:false}, {label:"C", text:"Histidine", correct:false}, {label:"D", text:"Tryptophane", correct:true}, {label:"E", text:"Méthionine", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio2, "Quelle liaison est responsable de la structure secondaire en hélice α ?", "La structure en hélice α est stabilisée par des liaisons hydrogène entre le groupement C=O d'un résidu n et le N-H du résidu n+4.", 2,
        [{label:"A", text:"Liaisons disulfure", correct:false}, {label:"B", text:"Liaisons ioniques", correct:false}, {label:"C", text:"Liaisons hydrogène", correct:true}, {label:"D", text:"Liaisons covalentes", correct:false}, {label:"E", text:"Forces de Van der Waals", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio2, "Quel acide aminé est impliqué dans la formation de ponts disulfure ?", "La cystéine possède un groupement thiol (−SH) qui peut s'oxyder pour former un pont disulfure (−S−S−) avec une autre cystéine.", 2,
        [{label:"A", text:"Méthionine", correct:false}, {label:"B", text:"Cystéine", correct:true}, {label:"C", text:"Sérine", correct:false}, {label:"D", text:"Thréonine", correct:false}, {label:"E", text:"Asparagine", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio3, "Le Km d'une enzyme représente :", "Le Km (constante de Michaelis) est la concentration en substrat pour laquelle la vitesse de réaction est égale à Vmax/2. Il reflète l'affinité de l'enzyme pour son substrat (Km faible = forte affinité).", 3,
        [{label:"A", text:"La concentration en substrat pour laquelle V = Vmax", correct:false}, {label:"B", text:"La concentration en substrat pour laquelle V = Vmax/2", correct:true}, {label:"C", text:"La vitesse maximale de la réaction", correct:false}, {label:"D", text:"La quantité d'enzyme présente", correct:false}, {label:"E", text:"Le pH optimal de l'enzyme", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio3, "Un inhibiteur compétitif :", "Un inhibiteur compétitif entre en compétition avec le substrat pour le site actif de l'enzyme. Il augmente le Km apparent mais ne modifie pas le Vmax.", 3,
        [{label:"A", text:"Diminue le Vmax et augmente le Km", correct:false}, {label:"B", text:"Augmente le Km apparent sans modifier le Vmax", correct:true}, {label:"C", text:"Diminue le Km et le Vmax", correct:false}, {label:"D", text:"N'a aucun effet sur le Km", correct:false}, {label:"E", text:"Se fixe sur le site allostérique uniquement", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio1, "Le point isoélectrique (pI) correspond :", "Le pI est le pH auquel la charge nette de la protéine (ou de l'acide aminé) est nulle. Pour un acide aminé diprotique : pI = (pKa1 + pKa2)/2.", 2,
        [{label:"A", text:"Au pH où la protéine est la plus soluble", correct:false}, {label:"B", text:"Au pH de dénaturation de la protéine", correct:false}, {label:"C", text:"Au pH où la charge nette est nulle", correct:true}, {label:"D", text:"Au pH optimal d'activité enzymatique", correct:false}, {label:"E", text:"Au pH où la protéine est chargée positivement", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio2, "La structure quaternaire d'une protéine décrit :", "La structure quaternaire décrit l'assemblage de plusieurs chaînes polypeptidiques (sous-unités) en une protéine multimérique fonctionnelle (ex : hémoglobine = 2α + 2β).", 3,
        [{label:"A", text:"Le repliement d'une seule chaîne polypeptidique", correct:false}, {label:"B", text:"L'assemblage de plusieurs sous-unités polypeptidiques", correct:true}, {label:"C", text:"La séquence en acides aminés", correct:false}, {label:"D", text:"Les structures en hélices α uniquement", correct:false}, {label:"E", text:"Les liaisons peptidiques de la chaîne principale", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio3, "L'hémoglobine présente une cinétique :", "L'hémoglobine est une protéine allostérique avec coopérativité positive (courbe sigmoïde). Elle ne suit pas la cinétique hyperbolique de Michaelis-Menten.", 4,
        [{label:"A", text:"Hyperbolique (Michaelis-Menten classique)", correct:false}, {label:"B", text:"Linéaire", correct:false}, {label:"C", text:"Sigmoïde (coopérativité positive)", correct:true}, {label:"D", text:"Exponentielle décroissante", correct:false}, {label:"E", text:"Identique à la myoglobine", correct:false}]),
      addQ(IDS.biochimie, IDS.cours.bio1, "Parmi les acides aminés suivants, lequel est essentiel chez l'adulte ?", "La leucine est un acide aminé essentiel : l'organisme humain ne peut pas le synthétiser et doit donc l'obtenir par l'alimentation.", 2,
        [{label:"A", text:"Alanine", correct:false}, {label:"B", text:"Glutamine", correct:false}, {label:"C", text:"Leucine", correct:true}, {label:"D", text:"Sérine", correct:false}, {label:"E", text:"Aspartate", correct:false}]),
    ];

    // --- Biologie Moléculaire ---
    const molQIds = [
      addQ(IDS.bioMol, IDS.cours.mol1, "Quelle base purique est présente dans l'ADN mais absente dans l'ARN ?", "L'ADN et l'ARN contiennent tous deux l'adénine et la guanine (purines). La thymine est une base pyrimidique spécifique de l'ADN ; l'ARN contient à la place l'uracile.", 2,
        [{label:"A", text:"Adénine", correct:false}, {label:"B", text:"Guanine", correct:false}, {label:"C", text:"Cytosine", correct:false}, {label:"D", text:"Thymine", correct:true}, {label:"E", text:"Uracile", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol1, "Combien de liaisons hydrogène relient G-C dans la double hélice d'ADN ?", "La paire G-C est reliée par 3 liaisons hydrogène (contre 2 pour A-T), ce qui lui confère une plus grande stabilité thermique.", 2,
        [{label:"A", text:"1", correct:false}, {label:"B", text:"2", correct:false}, {label:"C", text:"3", correct:true}, {label:"D", text:"4", correct:false}, {label:"E", text:"5", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol2, "L'ADN polymérase synthétise l'ADN dans quel sens ?", "L'ADN polymérase synthétise toujours dans le sens 5'→3', en ajoutant des nucléotides à l'extrémité 3'-OH libre du brin néosynthétisé.", 2,
        [{label:"A", text:"3'→5' uniquement", correct:false}, {label:"B", text:"5'→3' uniquement", correct:true}, {label:"C", text:"Les deux sens simultanément", correct:false}, {label:"D", text:"Dépend du type de cellule", correct:false}, {label:"E", text:"Sans direction préférentielle", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol2, "Quel enzyme brise temporairement les liaisons entre brins d'ADN lors de la réplication ?", "L'hélicase est l'enzyme qui déroule la double hélice en rompant les liaisons hydrogène entre les bases complémentaires pour créer la fourche de réplication.", 3,
        [{label:"A", text:"ADN ligase", correct:false}, {label:"B", text:"ADN polymérase", correct:false}, {label:"C", text:"Hélicase", correct:true}, {label:"D", text:"Primase", correct:false}, {label:"E", text:"Topoisomérase", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol2, "Le fragment d'Okazaki se forme sur :", "La réplication étant semi-discontinue, le brin retardé (lagging strand) est synthétisé par fragments discontinus appelés fragments d'Okazaki, dans le sens 5'→3' en s'éloignant de la fourche.", 3,
        [{label:"A", text:"Le brin continu (leading strand)", correct:false}, {label:"B", text:"Le brin retardé (lagging strand)", correct:true}, {label:"C", text:"Les deux brins à la fois", correct:false}, {label:"D", text:"L'ARN matriciel", correct:false}, {label:"E", text:"Le chromosome circulaire uniquement", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol1, "Le nucléosome est constitué de :", "Un nucléosome = ADN enroulé (environ 147 pb) autour d'un octamère d'histones (H2A, H2B, H3, H4 — 2 copies de chaque).", 3,
        [{label:"A", text:"ADN + ARN ribosomique", correct:false}, {label:"B", text:"ADN enroulé autour d'un octamère d'histones", correct:true}, {label:"C", text:"Uniquement des protéines histones sans ADN", correct:false}, {label:"D", text:"ARNm + protéines ribosomiques", correct:false}, {label:"E", text:"ADN + topoisomérases", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol2, "La primase est indispensable car :", "L'ADN polymérase ne peut pas initier de novo une nouvelle chaîne : elle a besoin d'une amorce (primer) ARN, synthétisée par la primase, pour ajouter des nucléotides à l'extrémité 3'-OH.", 3,
        [{label:"A", text:"Elle déroule la double hélice d'ADN", correct:false}, {label:"B", text:"Elle synthétise l'amorce ARN indispensable à l'ADN pol", correct:true}, {label:"C", text:"Elle répare les mésappariements", correct:false}, {label:"D", text:"Elle ligature les fragments d'Okazaki", correct:false}, {label:"E", text:"Elle méthyle les bases pour protéger l'ADN", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol1, "La règle de Chargaff stipule que :", "Dans l'ADN bicaténaire, [A] = [T] et [G] = [C]. Le taux de G+C varie selon les espèces mais est constant entre individus d'une même espèce.", 2,
        [{label:"A", text:"Le taux d'adénine est toujours supérieur à la thymine", correct:false}, {label:"B", text:"[A] = [T] et [G] = [C] dans l'ADN double brin", correct:true}, {label:"C", text:"L'ARN contient autant de G que de C", correct:false}, {label:"D", text:"La quantité d'ADN varie selon les tissus", correct:false}, {label:"E", text:"Tous les organismes ont le même taux G+C", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol2, "Quelle enzyme reconstitue le brin d'ADN après retrait des amorces ARN ?", "Après retrait des amorces ARN (par ARNase H ou ADN pol I chez les procaryotes), c'est l'ADN polymérase I (chez les procaryotes) ou δ/ε (chez les eucaryotes) qui comble les lacunes.", 4,
        [{label:"A", text:"ADN ligase", correct:false}, {label:"B", text:"Hélicase", correct:false}, {label:"C", text:"ADN polymérase (comblement des lacunes)", correct:true}, {label:"D", text:"Topoisomérase II", correct:false}, {label:"E", text:"Primase", correct:false}]),
      addQ(IDS.bioMol, IDS.cours.mol1, "L'hétérochromatine est caractérisée par :", "L'hétérochromatine est une chromatine condensée, transcriptionnellement inactive, riche en séquences répétées. Elle contraste avec l'euchromatine, décondensée et active.", 3,
        [{label:"A", text:"Une chromatine décondensée et active", correct:false}, {label:"B", text:"Une forte activité de transcription", correct:false}, {label:"C", text:"Une chromatine condensée et transcriptionnellement inactive", correct:true}, {label:"D", text:"L'absence d'histones", correct:false}, {label:"E", text:"Une réplication précoce en phase S", correct:false}]),
    ];

    // --- Biologie Cellulaire ---
    const celQIds = [
      addQ(IDS.bioCel, IDS.cours.cel1, "La fluidité de la membrane plasmique est principalement régulée par :", "Le cholestérol est le principal régulateur de la fluidité membranaire : à haute température, il rigidifie la membrane ; à basse température, il l'empêche de se solidifier.", 2,
        [{label:"A", text:"Les protéines intégrales", correct:false}, {label:"B", text:"Le cholestérol", correct:true}, {label:"C", text:"Les glycoprotéines", correct:false}, {label:"D", text:"Les protéines périphériques", correct:false}, {label:"E", text:"Les ions calcium", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel1, "Quelle protéine membranaire est responsable de la pompe Na⁺/K⁺ ?", "La Na⁺/K⁺-ATPase est une protéine de transport active qui expulse 3 Na⁺ et fait entrer 2 K⁺ par cycle ATP hydrolysé, maintenant le potentiel de repos de la cellule.", 3,
        [{label:"A", text:"Aquaporine", correct:false}, {label:"B", text:"Na⁺/K⁺-ATPase", correct:true}, {label:"C", text:"GLUT-4", correct:false}, {label:"D", text:"Canal potassique", correct:false}, {label:"E", text:"Pompe à protons vacuolaire", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel2, "En quelle phase du cycle cellulaire l'ADN est-il répliqué ?", "La phase S (Synthèse) est la phase pendant laquelle l'ADN est répliqué de façon semi-conservative. Elle est précédée de G1 et suivie de G2.", 2,
        [{label:"A", text:"Phase G1", correct:false}, {label:"B", text:"Phase S", correct:true}, {label:"C", text:"Phase G2", correct:false}, {label:"D", text:"Mitose (phase M)", correct:false}, {label:"E", text:"Phase G0", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel2, "Le point de restriction R du cycle cellulaire se situe :", "Le point de restriction (point R) est le principal point de contrôle de G1. Une fois ce point franchi, la cellule s'engage irréversiblement dans le cycle, même en l'absence de facteurs de croissance.", 3,
        [{label:"A", text:"En phase G2, avant la mitose", correct:false}, {label:"B", text:"En phase G1, avant l'entrée en phase S", correct:true}, {label:"C", text:"Au début de la mitose", correct:false}, {label:"D", text:"Pendant la phase S", correct:false}, {label:"E", text:"En cytocinèse", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel1, "Les jonctions serrées (tight junctions) ont pour rôle principal :", "Les jonctions serrées forment une ceinture étanche entre cellules épithéliales adjacentes, empêchant la diffusion paracellulaire de molécules et maintenant la polarité cellulaire.", 3,
        [{label:"A", text:"Permettre la communication entre cellules via des ions", correct:false}, {label:"B", text:"Ancrer le cytosquelette à la matrice extracellulaire", correct:false}, {label:"C", text:"Constituer une barrière étanche entre cellules épithéliales", correct:true}, {label:"D", text:"Transmettre des forces mécaniques entre cellules", correct:false}, {label:"E", text:"Permettre la migration cellulaire", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel2, "Les cyclines sont :", "Les cyclines sont des protéines régulatrices dont la concentration oscille au cours du cycle cellulaire. Elles activent les kinases dépendantes des cyclines (CDK) pour déclencher les transitions de phase.", 3,
        [{label:"A", text:"Des enzymes qui dégradent l'ADN endommagé", correct:false}, {label:"B", text:"Des protéines régulatrices du cycle cellulaire activant les CDK", correct:true}, {label:"C", text:"Des protéines de structure de la mitochondrie", correct:false}, {label:"D", text:"Des canaux ioniques nucléaires", correct:false}, {label:"E", text:"Des composants du complexe de cohésine uniquement", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel1, "L'endocytose médiée par récepteur utilise :", "L'endocytose médiée par récepteur (récepteur-dépendante) implique la clathrine pour former des vésicules à partir de puits recouverts à la surface cellulaire.", 3,
        [{label:"A", text:"La cavéoline uniquement", correct:false}, {label:"B", text:"La clathrine pour former des puits recouverts", correct:true}, {label:"C", text:"Le réticulum endoplasmique directement", correct:false}, {label:"D", text:"Les filaments d'actine sans vésicules", correct:false}, {label:"E", text:"Le complexe ESCRT", correct:false}]),
      addQ(IDS.bioCel, IDS.cours.cel2, "La télomérase est active :", "La télomérase est une transcriptase inverse qui allonge les télomères. Elle est active dans les cellules souches, les cellules germinales et la majorité des cellules cancéreuses, mais absente dans la plupart des cellules somatiques différenciées.", 4,
        [{label:"A", text:"Dans toutes les cellules somatiques adultes", correct:false}, {label:"B", text:"Uniquement en phase G2", correct:false}, {label:"C", text:"Dans les cellules cancéreuses et les cellules souches", correct:true}, {label:"D", text:"Uniquement chez l'embryon", correct:false}, {label:"E", text:"Dans les neurones matures exclusivement", correct:false}]),
    ];

    // --- Histologie ---
    const histoQIds = [
      addQ(IDS.histologie, IDS.cours.his1, "Quel épithélium tapisse la surface interne de l'intestin grêle ?", "L'intestin grêle est recouvert d'un épithélium prismatique simple (cylindrique) avec des microvillosités formant la bordure en brosse (villosités intestinales + entérocytes).", 2,
        [{label:"A", text:"Épithélium pavimenteux stratifié", correct:false}, {label:"B", text:"Épithélium cubique simple", correct:false}, {label:"C", text:"Épithélium prismatique simple avec microvillosités", correct:true}, {label:"D", text:"Épithélium pseudostratifié cilié", correct:false}, {label:"E", text:"Épithélium transitionnel (urothélium)", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his1, "L'épithélium pseudostratifié cilié est caractéristique de :", "L'épithélium pseudostratifié cilié (épithélium respiratoire) tapisse les voies aériennes supérieures (trachée, bronches). Toutes les cellules sont en contact avec la membrane basale mais n'arrivent pas toutes à la surface.", 2,
        [{label:"A", text:"L'œsophage", correct:false}, {label:"B", text:"La trachée et les bronches", correct:true}, {label:"C", text:"La peau", correct:false}, {label:"D", text:"La muqueuse gastrique", correct:false}, {label:"E", text:"Le rein", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his2, "Les fibroblastes ont pour rôle principal :", "Les fibroblastes sont les cellules les plus abondantes du tissu conjonctif. Ils synthétisent les composants de la matrice extracellulaire : fibres de collagène, élastine et protéoglycanes.", 2,
        [{label:"A", text:"La phagocytose des débris cellulaires", correct:false}, {label:"B", text:"La production d'anticorps", correct:false}, {label:"C", text:"La synthèse des fibres de collagène et de la matrice ECM", correct:true}, {label:"D", text:"La contraction des tissus", correct:false}, {label:"E", text:"Le stockage des lipides", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his2, "Le cartilage hyalin se distingue du cartilage élastique par :", "Le cartilage hyalin contient principalement du collagène de type II et des protéoglycanes. Le cartilage élastique contient en plus de nombreuses fibres élastiques qui lui confèrent sa flexibilité.", 3,
        [{label:"A", text:"L'absence totale de chondrocytes", correct:false}, {label:"B", text:"La présence de fibres élastiques abondantes dans l'élastique", correct:true}, {label:"C", text:"Une matrice plus dense en collagène de type I dans l'hyalin", correct:false}, {label:"D", text:"L'absence de périchondre dans l'hyalin", correct:false}, {label:"E", text:"Une vascularisation plus importante dans l'hyalin", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his1, "La membrane basale est composée principalement de :", "La membrane basale est constituée de laminine, collagène de type IV, nidogène (entactine) et protéoglycanes à héparane sulfate. Elle sépare l'épithélium du tissu conjonctif sous-jacent.", 3,
        [{label:"A", text:"Collagène de type I et fibronectine", correct:false}, {label:"B", text:"Collagène de type IV, laminine, nidogène", correct:true}, {label:"C", text:"Élastine et protéoglycanes dermatan sulfate uniquement", correct:false}, {label:"D", text:"Actine et myosine", correct:false}, {label:"E", text:"Immunoglobulines et albumine", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his2, "Le tissu osseux compact est caractérisé par :", "Le tissu osseux compact (ou cortical) est organisé en ostéons (systèmes de Havers) : cylindres concentriques de lamelles osseuses autour d'un canal de Havers contenant vaisseaux et nerfs.", 3,
        [{label:"A", text:"Des trabécules osseuses séparées par des espaces médullaires", correct:false}, {label:"B", text:"L'absence de cellules osseuses", correct:false}, {label:"C", text:"Une organisation en ostéons (systèmes de Havers)", correct:true}, {label:"D", text:"Une minéralisation absente", correct:false}, {label:"E", text:"Une localisation exclusivement crânienne", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his1, "L'épithélium transitionnel (urothélium) se trouve dans :", "L'épithélium transitionnel (urothélium) tapisse les voies excrétrices urinaires : bassinet, uretères, vessie et urètre proximal. Il est capable de s'étirer sans se déchirer.", 2,
        [{label:"A", text:"L'intestin grêle", correct:false}, {label:"B", text:"La trachée", correct:false}, {label:"C", text:"La vessie et les uretères", correct:true}, {label:"D", text:"La cavité buccale", correct:false}, {label:"E", text:"Le foie", correct:false}]),
      addQ(IDS.histologie, IDS.cours.his2, "L'ostéoclaste est responsable de :", "L'ostéoclaste est une cellule multinucléée d'origine hématopoïétique (macrophagique) qui résorbe la matrice osseuse minéralisée en acidifiant le microenvironnement et en sécrétant des enzymes lysosomales.", 3,
        [{label:"A", text:"La synthèse de l'ostéoïde", correct:false}, {label:"B", text:"La résorption osseuse (dégradation de la matrice)", correct:true}, {label:"C", text:"La minéralisation du collagène", correct:false}, {label:"D", text:"La formation du cartilage de conjugaison", correct:false}, {label:"E", text:"La synthèse de la parathormone", correct:false}]),
    ];

    // --- Statistiques Médicales ---
    addQ(IDS.stats, IDS.cours.sta1, "La prévalence d'une maladie est définie comme :", "La prévalence est la proportion de cas (anciens + nouveaux) d'une maladie dans une population à un instant donné ou sur une période. Elle mesure la charge de morbidité.", 2,
      [{label:"A", text:"Le nombre de nouveaux cas sur une période", correct:false}, {label:"B", text:"La proportion de cas existants dans une population à un instant donné", correct:true}, {label:"C", text:"Le risque de développer la maladie sur une vie entière", correct:false}, {label:"D", text:"Le taux de mortalité lié à la maladie", correct:false}, {label:"E", text:"Le nombre de cas par rapport aux décès", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta1, "La sensibilité d'un test diagnostique est :", "La sensibilité = VP / (VP + FN). C'est la capacité du test à détecter les vrais positifs (malades). Un test très sensible a peu de faux négatifs.", 3,
      [{label:"A", text:"La proportion de vrais négatifs parmi les non-malades", correct:false}, {label:"B", text:"La proportion de vrais positifs parmi les malades", correct:true}, {label:"C", text:"La probabilité d'avoir la maladie si le test est positif", correct:false}, {label:"D", text:"Le taux de faux positifs du test", correct:false}, {label:"E", text:"La reproductibilité du test", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta2, "Une valeur p < 0,05 signifie :", "La p-value est la probabilité d'obtenir un résultat au moins aussi extrême si l'hypothèse nulle (H0) est vraie. Si p < 0,05 (seuil α conventionnel), on rejette H0 et le résultat est dit statistiquement significatif.", 3,
      [{label:"A", text:"La probabilité que l'hypothèse nulle soit vraie est de 5%", correct:false}, {label:"B", text:"Le résultat a une probabilité < 5% sous H0, rejet de H0", correct:true}, {label:"C", text:"L'effet observé est cliniquement important", correct:false}, {label:"D", text:"L'étude a une puissance de 95%", correct:false}, {label:"E", text:"Le test a une sensibilité de 95%", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta2, "Un intervalle de confiance à 95% signifie :", "L'IC 95% est l'intervalle calculé de telle sorte que, si l'on répétait l'étude un grand nombre de fois, 95% des intervalles construits contiendraient la vraie valeur du paramètre.", 3,
      [{label:"A", text:"Il y a 95% de chance que la vraie valeur soit dans cet intervalle", correct:false}, {label:"B", text:"En répétant l'expérience, 95% des IC contiendraient la vraie valeur", correct:true}, {label:"C", text:"95% des sujets ont des valeurs dans cet intervalle", correct:false}, {label:"D", text:"La probabilité d'erreur de type II est de 5%", correct:false}, {label:"E", text:"La puissance du test est de 95%", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta1, "Un biais de sélection survient lorsque :", "Un biais de sélection se produit quand la façon dont les participants sont recrutés/sélectionnés introduit une distorsion systématique entre les groupes comparés, rendant les résultats non généralisables.", 3,
      [{label:"A", text:"Les mesures sont réalisées de manière non reproductible", correct:false}, {label:"B", text:"La sélection des participants introduit une distorsion systématique", correct:true}, {label:"C", text:"L'investigateur connaît le groupe d'appartenance des sujets", correct:false}, {label:"D", text:"Le questionnaire comporte des questions ambiguës", correct:false}, {label:"E", text:"La taille de l'échantillon est insuffisante", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta2, "Le test de Chi-2 est utilisé pour :", "Le test du Chi-2 (χ²) est un test non paramétrique qui compare des distributions de fréquences observées à des fréquences théoriques ou compare deux variables qualitatives entre elles.", 3,
      [{label:"A", text:"Comparer deux moyennes de variables continues normales", correct:false}, {label:"B", text:"Comparer des proportions ou tester l'indépendance de variables qualitatives", correct:true}, {label:"C", text:"Calculer la corrélation entre deux variables quantitatives continues", correct:false}, {label:"D", text:"Comparer des médianes de variables non paramétriques", correct:false}, {label:"E", text:"Analyser la survie au cours du temps", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta1, "L'incidence d'une maladie mesure :", "L'incidence mesure le nombre de nouveaux cas d'une maladie apparus dans une population exposée au risque, sur une période de temps définie. C'est une mesure dynamique du risque.", 2,
      [{label:"A", text:"La proportion de malades dans une population à un moment précis", correct:false}, {label:"B", text:"Le nombre de nouveaux cas dans une population sur une période", correct:true}, {label:"C", text:"La proportion de guérisons parmi les malades traités", correct:false}, {label:"D", text:"La mortalité spécifique à une maladie", correct:false}, {label:"E", text:"La durée moyenne d'une maladie", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta2, "Le risque relatif (RR) d'une valeur supérieure à 1 indique :", "Un RR > 1 signifie que l'exposition est associée à un risque accru de développer la maladie. RR = Risque(exposés) / Risque(non-exposés). Si RR = 2, les exposés ont 2 fois plus de risque.", 3,
      [{label:"A", text:"Un facteur protecteur contre la maladie", correct:false}, {label:"B", text:"Un facteur de risque associé à une augmentation du risque", correct:true}, {label:"C", text:"Une absence d'association entre exposition et maladie", correct:false}, {label:"D", text:"Un biais dans l'étude", correct:false}, {label:"E", text:"Une erreur de type I", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta1, "L'odds ratio (OR) est particulièrement utilisé dans :", "L'OR est la mesure d'association utilisée dans les études cas-témoins où l'on ne peut pas calculer le risque relatif (la proportion de malades n'est pas représentative de la population). OR ≈ RR si la maladie est rare.", 3,
      [{label:"A", text:"Les essais cliniques randomisés", correct:false}, {label:"B", text:"Les études de cohorte prospective", correct:false}, {label:"C", text:"Les études cas-témoins", correct:true}, {label:"D", text:"Les études écologiques uniquement", correct:false}, {label:"E", text:"Les méta-analyses de survie", correct:false}]);
    addQ(IDS.stats, IDS.cours.sta2, "La puissance statistique d'un test est :", "La puissance (1−β) est la probabilité de rejeter H0 quand elle est effectivement fausse (détecter un vrai effet). Elle dépend de la taille de l'échantillon, de la taille de l'effet et du seuil α choisi.", 4,
      [{label:"A", text:"La probabilité de commettre une erreur de type I", correct:false}, {label:"B", text:"La probabilité de rejeter H0 quand elle est fausse (1−β)", correct:true}, {label:"C", text:"La précision des mesures biologiques", correct:false}, {label:"D", text:"La valeur de p obtenue", correct:false}, {label:"E", text:"La taille de l'échantillon uniquement", correct:false}]);

    // Insérer questions par batch
    for (let i = 0; i < questions.length; i += 10) {
      const batch = questions.slice(i, i + 10);
      const { error } = await supabase.from("questions").upsert(batch);
      if (error) console.error("Questions batch error:", error.message);
    }
    // Insérer options par batch
    for (let i = 0; i < options.length; i += 50) {
      const batch = options.slice(i, i + 50);
      const { error } = await supabase.from("options").upsert(batch);
      if (error) console.error("Options batch error:", error.message);
    }

    // =============================================
    // 7. Séries
    // =============================================
    const allQIds = [...bioQIds, ...molQIds, ...celQIds, ...histoQIds];

    await supabase.from("series").upsert([
      { id: IDS.serieBiochimie, matiere_id: IDS.biochimie, name: "Biochimie Structurale — Entraînement", description: "10 questions pour maîtriser les bases : acides aminés, protéines et enzymologie", type: "entrainement", timed: false, visible: true },
      { id: IDS.serieCellulaire, matiere_id: IDS.bioCel, name: "Biologie Cellulaire — Révisions", description: "8 questions sur la membrane plasmique et le cycle cellulaire", type: "revision", timed: false, visible: true },
      { id: IDS.serieConcoursB, name: "UE1 & UE2 — Concours Blanc #1", description: "20 questions chronométrées couvrant UE1 et UE2 — conditions réelles de concours", type: "concours_blanc", timed: true, duration_minutes: 30, score_definitif: true, visible: true },
      { id: IDS.serieHisto, matiere_id: IDS.histologie, name: "Histologie — QCM rapide", description: "8 questions essentielles sur les tissus épithéliaux et conjonctifs", type: "entrainement", timed: false, visible: true },
    ]);

    // Lier questions aux séries
    const seriesQuestionsToInsert: any[] = [];

    // Série biochimie : 10 questions biochimie
    bioQIds.forEach((qId, idx) => {
      seriesQuestionsToInsert.push({ series_id: IDS.serieBiochimie, question_id: qId, order_index: idx });
    });

    // Série cellulaire : 8 questions biologie cellulaire
    celQIds.slice(0, 8).forEach((qId, idx) => {
      seriesQuestionsToInsert.push({ series_id: IDS.serieCellulaire, question_id: qId, order_index: idx });
    });

    // Concours blanc : 10 biochimie + 10 mol
    [...bioQIds.slice(0, 10), ...molQIds.slice(0, 10)].forEach((qId, idx) => {
      seriesQuestionsToInsert.push({ series_id: IDS.serieConcoursB, question_id: qId, order_index: idx });
    });

    // Série histologie : 8 questions histologie
    histoQIds.slice(0, 8).forEach((qId, idx) => {
      seriesQuestionsToInsert.push({ series_id: IDS.serieHisto, question_id: qId, order_index: idx });
    });

    await supabase.from("series_questions").upsert(seriesQuestionsToInsert);

    // =============================================
    // 8. Examen blanc
    // =============================================
    await supabase.from("examens").upsert([{
      id: IDS.examen1,
      name: "Examen Blanc PASS S1",
      description: "Simulation complète des épreuves du premier semestre. Conditions réelles : 3 heures, tous sujets UE1 et UE2. Résultats communiqués sous 48h.",
      debut_at: "2026-03-28T08:00:00+01:00",
      fin_at: "2026-03-28T11:00:00+01:00",
      visible: true,
    }]);

    await supabase.from("examens_series").upsert([
      { examen_id: IDS.examen1, series_id: IDS.serieConcoursB, order_index: 0 },
    ]);

    await supabase.from("examens_groupes").upsert([
      { examen_id: IDS.examen1, groupe_id: IDS.groupePass },
    ]);

    // =============================================
    // 9. Événements planning
    // =============================================
    await supabase.from("events").upsert([
      { id: "e0000001-0000-0000-0000-000000000001", title: "Cours — Enzymologie avancée", description: "Cours magistral sur la cinétique enzymatique et les inhibitions. Salle Amphi A.", start_at: "2026-03-25T09:00:00+01:00", end_at: "2026-03-25T11:00:00+01:00", type: "cours", groupe_id: IDS.groupePass, location: "Amphi A — Bâtiment Sciences", created_by: adminId },
      { id: "e0000001-0000-0000-0000-000000000002", title: "TD — Biologie Moléculaire", description: "Travaux dirigés : exercices sur la réplication de l'ADN et les fragments d'Okazaki.", start_at: "2026-03-26T14:00:00+01:00", end_at: "2026-03-26T16:00:00+01:00", type: "cours", groupe_id: IDS.groupePass, location: "Salle 204", created_by: profId },
      { id: "e0000001-0000-0000-0000-000000000003", title: "Réunion pédagogique — Bilan S1", description: "Réunion de l'équipe pédagogique pour faire le point sur les résultats du premier semestre.", start_at: "2026-03-27T12:00:00+01:00", end_at: "2026-03-27T13:30:00+01:00", type: "reunion", zoom_link: "https://zoom.us/j/123456789", created_by: adminId },
      { id: "e0000001-0000-0000-0000-000000000004", title: "Examen Blanc PASS S1", description: "Simulation complète des épreuves. Présentez-vous 15 min à l'avance. Carte d'étudiant obligatoire.", start_at: "2026-03-28T08:00:00+01:00", end_at: "2026-03-28T11:00:00+01:00", type: "examen", groupe_id: IDS.groupePass, location: "Salle des examens — Bâtiment Principal", created_by: adminId },
      { id: "e0000001-0000-0000-0000-000000000005", title: "Cours — Histologie des tissus conjonctifs", description: "Cours avec coupes histologiques commentées. Apportez vos atlas.", start_at: "2026-04-02T09:00:00+02:00", end_at: "2026-04-02T11:30:00+02:00", type: "cours", groupe_id: IDS.groupePass, location: "Salle de microscopie", created_by: profId },
      { id: "e0000001-0000-0000-0000-000000000006", title: "Session de révisions — Statistiques médicales", description: "Questions-réponses interactives. Préparez vos questions sur les tests statistiques.", start_at: "2026-04-08T16:00:00+02:00", end_at: "2026-04-08T18:00:00+02:00", type: "cours", groupe_id: IDS.groupePass, zoom_link: "https://zoom.us/j/987654321", created_by: profId },
    ]);

    // =============================================
    // 10. Posts (annonces + forum)
    // =============================================
    await supabase.from("posts").upsert([
      // Annonces
      {
        id: "p0000001-0000-0000-0000-000000000001",
        author_id: adminId,
        groupe_id: IDS.groupePass,
        title: "Bienvenue sur ExoTeach — Rentrée 2024-2025",
        content: "Bienvenue à tous les étudiants de la Promo PASS 2025 ! Votre espace de travail est maintenant disponible avec l'ensemble des ressources pour le premier semestre.\n\nVous trouverez dans la section Pédagogie l'arborescence complète des UE1, UE2 et UE4 avec tous les cours au format PDF. La section Exercices vous donne accès à la banque de QCM par matière.\n\nN'hésitez pas à utiliser le Forum pour poser vos questions. L'équipe pédagogique répond sous 24h.\n\nBonne rentrée et bon courage ! 💪",
        type: "annonce",
        pinned: true,
      },
      {
        id: "p0000001-0000-0000-0000-000000000002",
        author_id: profId,
        groupe_id: IDS.groupePass,
        title: "Rappel — Examen Blanc du 28 mars",
        content: "Je vous rappelle que l'Examen Blanc PASS S1 aura lieu le samedi 28 mars de 8h à 11h dans la Salle des examens.\n\nMerci de vous présenter 15 minutes avant le début avec votre carte d'étudiant. Les téléphones portables doivent être éteints et rangés.\n\nPour vous préparer, je vous recommande de faire les séries UE1 & UE2 — Concours Blanc #1 dans la section Exercices. Bon courage !",
        type: "annonce",
        pinned: false,
      },
      // Forum questions
      {
        id: "p0000001-0000-0000-0000-000000000010",
        author_id: eleve1Id,
        cours_id: IDS.cours.bio3,
        title: "Différence entre inhibiteur compétitif et non compétitif ?",
        content: "Bonjour, je n'arrive pas à bien différencier l'inhibition compétitive de l'inhibition non compétitive dans le cours sur l'enzymologie. Est-ce que quelqu'un peut m'expliquer la différence principale sur le graphique de Michaelis-Menten ? Merci !",
        type: "forum_question",
      },
      {
        id: "p0000001-0000-0000-0000-000000000011",
        author_id: profId,
        parent_id: "p0000001-0000-0000-0000-000000000010",
        content: "Bonne question ! La différence clé : l'inhibiteur compétitif se fixe sur le SITE ACTIF (compétition avec le substrat), donc il augmente le Km apparent (apparente moins d'affinité) mais le Vmax reste inchangé (avec assez de substrat, on peut saturer l'enzyme). L'inhibiteur non compétitif se fixe sur un site allostérique et modifie la conformation — il diminue le Vmax mais le Km reste identique. Sur un graphique double-réciproque (Lineweaver-Burk) : compétitif = même ordonnée à l'origine (même Vmax), non compétitif = même abscisse à l'origine (même Km).",
        type: "forum_reply",
      },
      {
        id: "p0000001-0000-0000-0000-000000000020",
        author_id: eleve2Id,
        cours_id: IDS.cours.mol2,
        title: "Pourquoi la réplication est-elle semi-discontinue ?",
        content: "Dans le cours sur la réplication, on dit que la synthèse est semi-discontinue, mais je ne comprends pas pourquoi on ne peut pas synthétiser le brin retardé en continu dans le sens 3'→5'. Quelqu'un peut m'aider ?",
        type: "forum_question",
      },
      {
        id: "p0000001-0000-0000-0000-000000000021",
        author_id: profId,
        parent_id: "p0000001-0000-0000-0000-000000000020",
        content: "Excellente question ! L'ADN polymérase ne peut synthétiser QUE dans le sens 5'→3'. C'est une contrainte biochimique fondamentale : elle ajoute des nucléotides sur l'extrémité 3'-OH libre. Les deux brins matriciels étant antiparallèles, sur la fourche de réplication : un brin (leading) peut être synthétisé en continu dans le sens de progression ; l'autre (lagging) doit être synthétisé en sens inverse, par fragments (d'Okazaki), en 5'→3'. Ces fragments sont ensuite ligaturés. C'est ça la semi-discontinuité !",
        type: "forum_reply",
      },
    ]);

    // =============================================
    // 11. Flashcards
    // =============================================
    await supabase.from("flashcard_decks").upsert([
      { id: IDS.deckBiochimie, matiere_id: IDS.biochimie, name: "Acides Aminés Essentiels", description: "Mémorisez les 9 acides aminés essentiels et leurs caractéristiques", visible: true },
      { id: IDS.deckCellulaire, matiere_id: IDS.bioCel, name: "Phases du Cycle Cellulaire", description: "Les étapes du cycle cellulaire et leurs points de contrôle", visible: true },
    ]);

    await supabase.from("flashcards").upsert([
      // Deck biochimie
      { id: "fc000001-0000-0000-0000-000000000001", deck_id: IDS.deckBiochimie, front: "Quels sont les 9 acides aminés essentiels ?", back: "His, Ile, Leu, Lys, Met, Phe, Thr, Trp, Val\nMoyen mnémotechnique : « HIFLIPMTV » ou « HILVT + MetPheTrp »", order_index: 0 },
      { id: "fc000001-0000-0000-0000-000000000002", deck_id: IDS.deckBiochimie, front: "La Leucine (Leu, L) — Propriété principale ?", back: "Acide aminé essentiel, aliphatique hydrophobe. Chaîne latérale isobutyle. Impliqué dans les structures en leucine zipper (protéines de liaison à l'ADN).", order_index: 1 },
      { id: "fc000001-0000-0000-0000-000000000003", deck_id: IDS.deckBiochimie, front: "Le Tryptophane (Trp, W) — Propriété principale ?", back: "Acide aminé essentiel aromatique, avec un noyau indole. Plus grosse chaîne latérale. Précurseur de la sérotonine et de la mélatonine.", order_index: 2 },
      { id: "fc000001-0000-0000-0000-000000000004", deck_id: IDS.deckBiochimie, front: "Formule du pI pour un acide aminé neutre ?", back: "pI = (pKa1 + pKa2) / 2\nOù pKa1 est la constante du groupement α-COOH et pKa2 celle du groupement α-NH3+", order_index: 3 },
      { id: "fc000001-0000-0000-0000-000000000005", deck_id: IDS.deckBiochimie, front: "Quelle liaison forme la structure primaire des protéines ?", back: "La liaison peptidique (amide) : −CO−NH− entre le groupement carboxyle d'un acide aminé et le groupement amine du suivant, avec perte d'eau (réaction de condensation).", order_index: 4 },
      // Deck cycle cellulaire
      { id: "fc000002-0000-0000-0000-000000000001", deck_id: IDS.deckCellulaire, front: "Quelles sont les phases du cycle cellulaire ?", back: "G1 → S → G2 → M (Mitose)\n+ Phase G0 (quiescence)\n- G1 : croissance cellulaire\n- S : réplication de l'ADN\n- G2 : préparation à la division\n- M : mitose (PMAT : Prophase, Métaphase, Anaphase, Télophase)", order_index: 0 },
      { id: "fc000002-0000-0000-0000-000000000002", deck_id: IDS.deckCellulaire, front: "Qu'est-ce que le point de restriction (R) ?", back: "Point de contrôle en fin de G1. Une fois franchi, la cellule s'engage irréversiblement dans le cycle même sans facteurs de croissance. Contrôlé par la phosphorylation de Rb (rétinoblastome) par CDK4/6-CyclineD.", order_index: 1 },
      { id: "fc000002-0000-0000-0000-000000000003", deck_id: IDS.deckCellulaire, front: "Rôle des CDK (Kinases dépendantes des cyclines) ?", back: "Les CDK phosphorylent des substrats clés pour déclencher les transitions de phase. Elles sont activées par les cyclines (dont la concentration oscille) et inhibées par des inhibiteurs de CDK (CKI comme p21, p27).", order_index: 2 },
      { id: "fc000002-0000-0000-0000-000000000004", deck_id: IDS.deckCellulaire, front: "Quelle cycline est active en phase S ?", back: "Cycline E (transition G1/S) et Cycline A (phase S et G2). La Cycline B est active en mitose (Cycline B-CDK1 = MPF : Facteur Promoteur de la Mitose).", order_index: 3 },
    ]);

    // =============================================
    // 12. Notifications pour eleve1
    // =============================================
    await supabase.from("notifications").upsert([
      { id: "n0000001-0000-0000-0000-000000000001", user_id: eleve1Id, type: "annonce", title: "Nouvelle annonce : Bienvenue sur ExoTeach", body: "Sophie Martin a publié une annonce pour votre promotion.", link: "/annonces", read: false },
      { id: "n0000001-0000-0000-0000-000000000002", user_id: eleve1Id, type: "examen", title: "Examen Blanc PASS S1 — Dans 5 jours", body: "L'examen blanc aura lieu le 28 mars de 8h à 11h. Préparez-vous !", link: "/agenda", read: false },
      { id: "n0000001-0000-0000-0000-000000000003", user_id: eleve1Id, type: "forum_reply", title: "Dr. Paul Lefèvre a répondu à votre question", body: "Différence entre inhibiteur compétitif et non compétitif ?", link: "/forum", read: true },
      { id: "n0000001-0000-0000-0000-000000000004", user_id: eleve1Id, type: "nouveau_cours", title: "Nouveau cours disponible : Enzymologie", body: "Un nouveau cours a été ajouté en Biochimie Structurale.", link: "/cours", read: true },
    ]);

    return NextResponse.json({
      ok: true,
      message: "Base de données seedée avec succès !",
      summary: {
        users: 4,
        groupes: 2,
        dossiers: 3,
        matieres: 5,
        cours: 11,
        questions: questions.length,
        options: options.length,
        series: 4,
        examens: 1,
        events: 6,
        posts: 6,
        flashcard_decks: 2,
        flashcards: 9,
        notifications: 4,
      },
    });
  } catch (err: any) {
    console.error("Seed error:", err);
    return NextResponse.json({ error: err.message ?? "Erreur inconnue" }, { status: 500 });
  }
}

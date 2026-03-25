import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = 'https://uylrllyffpypqmitmbme.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5bHJsbHlmZnB5cHFtaXRtYm1lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI2MDY4MiwiZXhwIjoyMDg5ODM2NjgyfQ.L6looQIfJg2q8Fi8D2Fy390_NMJmsFBJVgbPi1g9xdw';

const s = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Data scraped from https://diploma.exoteach.com/elearning/#/serie/correction/418 ──

const SERIE_NAME = 'Atomistique #1';
const SERIE_TYPE = 'qcm_supplementaires';
const DUREE = 8;

const QUESTIONS = [
  {
    text: 'Concernant les propositions suivantes, indiquez laquelle (ou lesquelles) est (ou sont) exacte(s) :',
    options: [
      { label: 'A', text: 'Le fer ${}_{26}^{54}\\textrm{Fe}$ possède 26 protons et 54 neutrons', is_correct: false, justification: '26 protons (Z = 26) et (A - Z) = 54 - 26 = 28 neutrons' },
      { label: 'B', text: "L'atome de carbone ${}_{6}^{12}\\textrm{C}$ est composé de 6 protons, 6 neutrons et 6 électrons.", is_correct: true, justification: "Z = 6, nombre de neutrons = (A - Z) = 12 - 6 = 6. Dans l'état fondamental l'atome est électriquement neutre donc nombre de protons = nombre d'électrons → 6 électrons." },
      { label: 'C', text: '${}_{92}^{238}\\textrm{U}$ et ${}_{91}^{238}\\textrm{Pa}$ sont isotopes.', is_correct: false, justification: 'Isotopes = même élément chimique (même Z) mais nombre de neutrons différent.' },
      { label: 'D', text: "La masse de l'électron vaut 1800 fois la masse du proton.", is_correct: false, justification: "C'est la masse du proton qui vaut 1800 fois celle de l'électron." },
      { label: 'E', text: 'Le neutron et le proton ont sensiblement la même masse.', is_correct: true, justification: '$1{,}7 \\times 10^{-27}$ kg' },
    ],
  },
  {
    text: "Le chlore est un élément chimique dont le noyau est composé de 17 protons et 18 neutrons pour l'isotope le plus abondant. On donne Z = 11 pour le sodium Na.\nConcernant les propositions suivantes, indiquez laquelle (ou lesquelles) est (ou sont) exacte(s) :",
    options: [
      { label: 'A', text: "Le volume d'un atome est environ 12 fois celui du noyau, ce qui prouve que l'atome est quasiment vide.", is_correct: false, justification: 'Volume atome = $10^{12}$ fois celui du noyau.' },
      { label: 'B', text: 'Le Chlore et le Brome possèdent le même nombre d\'électrons de valence.', is_correct: true, justification: "Le chlore et le brome appartiennent à la même colonne (colonne 17 = famille des halogènes) du tableau périodique → même nombre d'électrons de valence (7)." },
      { label: 'C', text: 'Le chlore a une masse molaire d\'environ 35 g/mol.', is_correct: true, justification: "En ne considérant que l'isotope le plus abondant et en négligeant la masse des électrons par rapport à celle des neutrons et des protons." },
      { label: 'D', text: 'La masse atomique du chlore est environ 17 uma.', is_correct: false, justification: 'Environ 35 uma (17 protons + 18 neutrons = 35). La valeur 17 correspond au numéro atomique Z.' },
      { label: 'E', text: 'L\'ion Na$^+$ possède 12 électrons.', is_correct: false, justification: "10 électrons (Na possède 11 électrons, on lui retire 1 pour former Na$^+$)." },
    ],
  },
  {
    text: 'Le chlore existe sous deux isotopes : ${}^{35}\\textrm{Cl}$ et ${}^{38}\\textrm{Cl}$ et la masse molaire du chlore vaut 35,45 g/mol',
    options: [
      { label: 'A', text: "L'abondance du ${}^{35}\\textrm{Cl}$ est supérieure à 90%", is_correct: false, justification: "Soit x l'abondance du ${}^{35}$Cl et y celle du ${}^{38}$Cl : x + y = 1.\n$35{,}45 = 35x + 38(1-x) \\Rightarrow 3x = 2{,}55 \\Rightarrow x = 76\\%$.\nAbondance ${}^{35}$Cl = 76%, ${}^{38}$Cl = 24%." },
      { label: 'B', text: "L'abondance du ${}^{35}\\textrm{Cl}$ est inférieure à 70%", is_correct: false, justification: 'Voir item A : elle est supérieure à 70%.' },
      { label: 'C', text: "L'abondance du ${}^{35}\\textrm{Cl}$ est 50%", is_correct: false, justification: 'Voir item A.' },
      { label: 'D', text: "L'abondance du ${}^{38}\\textrm{Cl}$ est la même que l'abondance de ${}^{35}\\textrm{Cl}$", is_correct: false, justification: "Cela revient à l'item C qui est fausse." },
      { label: 'E', text: "On retrouve plus de ${}^{35}\\textrm{Cl}$ que de ${}^{38}\\textrm{Cl}$ dans la nature.", is_correct: true, justification: 'Voir item A : 76% vs 24%.' },
    ],
  },
  {
    text: 'Concernant les propositions suivantes, indiquez laquelle (ou lesquelles) est (ou sont) exacte(s) :',
    options: [
      { label: 'A', text: 'La combinaison (1 ; 2 ; 0) correspond à une orbitale 1p.', is_correct: false, justification: "N'existe pas car $0 \\leq l \\leq n-1$ (impossible d'avoir $l=2$ quand $n=1$)." },
      { label: 'B', text: 'La combinaison (3 ; 1 ; 2) correspond à une orbitale 3d.', is_correct: false, justification: '$l = 1$ donc on a une orbitale p, pas d.' },
      { label: 'C', text: 'La combinaison (2 ; 0 ; −1) correspond à une orbitale 2s.', is_correct: false, justification: "N'existe pas car si $l = 0$ alors $m = 0$ nécessairement." },
      { label: 'D', text: 'La combinaison (5 ; 3 ; 2) correspond à une orbitale 5f.', is_correct: true, justification: 'Les orbitales f sont caractérisées par $l = 3$ et il existe bien des orbitales f dans la couche $n = 5$.' },
      { label: 'E', text: 'La combinaison (4 ; 1 ; 0) correspond à une orbitale 4s.', is_correct: false, justification: '$l = 1$ donc orbitale 4p.' },
    ],
  },
  {
    text: 'Concernant les propositions suivantes, indiquez laquelle (ou lesquelles) est (ou sont) exacte(s) :',
    options: [
      { label: 'A', text: 'Il existe 5 orbitales atomiques de type p', is_correct: false, justification: '3 orbitales p ($m$ prend 3 valeurs pour $l=1$) et 5 orbitales d ($m$ prend 5 valeurs pour $l=2$).' },
      { label: 'B', text: 'Dans la couche $n = 2$, il y a 9 orbitales atomiques.', is_correct: false, justification: 'Nombre d\'orbitales = $n^2 = 4$ (1 orbitale 2s + 3 orbitales 2p).' },
      { label: 'C', text: 'La combinaison d\'électron $n=2$ ; $m=-1$ ; $s=+\\frac{1}{2}$ caractérise 3 électrons au maximum', is_correct: false, justification: '1 seul uniquement : $(2,1,-1,+\\frac{1}{2})$, car deux électrons d\'une même orbitale ne peuvent pas avoir le même moment magnétique de spin.' },
      { label: 'D', text: 'Dans la sous-couche 4d, il y a un maximum de 5 électrons ayant un spin $+\\frac{1}{2}$.', is_correct: true, justification: '5 orbitales d → 5 électrons avec spin $+\\frac{1}{2}$ et 5 avec spin $-\\frac{1}{2}$.' },
      { label: 'E', text: "Les orbitales d'une sous-couche p sont de symétrie de révolution suivant les axes x, y et z.", is_correct: true, justification: '' },
    ],
  },
];

async function run() {
  // 1. Find cours "Atomistique"
  const { data: coursList, error: cErr } = await s
    .from('cours')
    .select('id, name')
    .ilike('name', '%atomistique%');

  if (cErr || !coursList?.length) {
    console.error('Cours not found:', cErr?.message);
    process.exit(1);
  }

  const cours = coursList[0];
  console.log('✓ Cours:', cours.name, cours.id);

  // 2. Delete existing series for this cours
  const { data: oldSeries } = await s.from('series').select('id').eq('cours_id', cours.id);
  if (oldSeries?.length) {
    const ids = oldSeries.map(s => s.id);
    await s.from('series_questions').delete().in('series_id', ids);
    await s.from('series').delete().in('id', ids);
    console.log(`✓ Supprimé ${ids.length} série(s) existante(s)`);
  }

  // 3. Delete existing questions for this cours
  const { data: oldQuestions } = await s.from('questions').select('id').eq('cours_id', cours.id);
  if (oldQuestions?.length) {
    const ids = oldQuestions.map(q => q.id);
    await s.from('options').delete().in('question_id', ids);
    await s.from('questions').delete().in('id', ids);
    console.log(`✓ Supprimé ${ids.length} question(s) existante(s)`);
  }

  // 4. Insert new questions
  const insertedIds = [];
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const { data: qData, error: qErr } = await s
      .from('questions')
      .insert({
        cours_id: cours.id,
        text: q.text,
        type: 'qcm_multiple',
        difficulty: 2,
        tags: ['atomistique'],
      })
      .select('id')
      .single();

    if (qErr) { console.error('Q insert error:', qErr.message); continue; }

    // Insert options
    const opts = q.options.map(opt => ({
      question_id: qData.id,
      label: opt.label,
      text: opt.text,
      is_correct: opt.is_correct,
      justification: opt.justification || null,
    }));
    const { error: oErr } = await s.from('options').insert(opts);
    if (oErr) console.error('Option insert error:', oErr.message);

    insertedIds.push(qData.id);
    console.log(`✓ Q${i + 1} insérée`);
  }

  // 5. Create série
  const { data: serieData, error: sErr } = await s
    .from('series')
    .insert({
      cours_id: cours.id,
      name: SERIE_NAME,
      type: SERIE_TYPE,
      duration_minutes: DUREE,
      visible: true,
      timed: true,
    })
    .select('id')
    .single();

  if (sErr) { console.error('Serie insert error:', sErr.message); process.exit(1); }
  console.log('✓ Série créée:', serieData.id);

  // 6. Link questions to serie
  const links = insertedIds.map((qid, i) => ({
    series_id: serieData.id,
    question_id: qid,
    order_index: i,
  }));
  const { error: lErr } = await s.from('series_questions').insert(links);
  if (lErr) console.error('Link error:', lErr.message);
  else console.log(`✓ ${links.length} questions liées à la série`);

  console.log('\n🎉 Import terminé !');
}

run().catch(console.error);

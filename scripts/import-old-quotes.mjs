/**
 * Import des devis de l'ancien CRM (Sellsy) dans crm_quotes + crm_quote_lines
 * Usage: node scripts/import-old-quotes.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zttstemfpybkjurmcxhs.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dHN0ZW1mcHlia2p1cm1jeGhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyMjg3MiwiZXhwIjoyMDg3MTk4ODcyfQ.79o0KNaYs-wMW6t91HmLqnYKRvNqGJxM63p6YLDR2So";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helper: parse "DD/MM/YYYY" → "YYYY-MM-DD" ──
function parseDate(str) {
  const [d, m, y] = str.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ── Helper: add N days to "YYYY-MM-DD" ──
function addDays(isoDate, n) {
  const dt = new Date(isoDate);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ── 29 devis extraits des PDFs ──
const QUOTES = [
  {
    ref: "M-FAC-77", date: "13/01/2026", client: "EHPAD Les Résidences de la Mosane",
    effectifs: 12, duration: null, tva: 20, totalTTC: 2880,
    lines: [{ description: "GEM RCN en Ehpad", quantity: 2, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-96", date: "28/01/2026", client: "EHPAD LES RESIDENCES DE LA MOSANE",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "THERAPIES NON MEDICAMENTEUSES", quantity: 1, unit_price: 2400 }],
  },
  {
    ref: "M-FAC-105", date: "09/02/2026", client: "EHPAD Sainte-Elisabeth",
    effectifs: 12, duration: "1 jours soit 7 heures", tva: 20, totalTTC: 1440,
    lines: [{ description: "Le circuit du médicament : sécurisation et bonnes pratiques", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-106", date: "09/02/2026", client: "EHPAD Sainte-Elisabeth",
    effectifs: 12, duration: "1 jours soit 7 heures", tva: 20, totalTTC: 1440,
    lines: [{ description: "RGPD et DPO en EHPAD : sécuriser les données personnelles et les pratiques professionnelles", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-107", date: "09/02/2026", client: "EHPAD Sainte-Elisabeth",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "Recommandations des bonnes pratiques professionnelles en EHPAD", quantity: 1, unit_price: 2400 }],
  },
  {
    ref: "M-FAC-16", date: "19/09/2025", client: "CENTRE CANTOLOUP LAVALLEE",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "Communication bienveillante entre professionnels", quantity: 1, unit_price: 2400 }],
  },
  {
    ref: "M-FAC-73", date: "12/01/2026", client: "CENTRE HOSPITALIER LOUIS BRUNET D'ALLAUCH",
    effectifs: 12, duration: null, tva: 20, totalTTC: 23520,
    lines: [
      { description: "L'acte transfusionnel", quantity: 1, unit_price: 1200 },
      { description: "Droit des résidents", quantity: 2, unit_price: 1200 },
      { description: "Accompagnement des personnes en situation de handicap et troubles neuros", quantity: 2, unit_price: 1200 },
      { description: "Aide à la rédaction des rapports circonstanciels", quantity: 2, unit_price: 1200 },
      { description: "Bientraitance en établissement de santé", quantity: 2, unit_price: 1200 },
      { description: "Méthodologie d'un projet de santé", quantity: 2, unit_price: 1200 },
      { description: "Communication digitale dans un établissement de santé", quantity: 8, unit_price: 500 },
      { description: "Utiliser l'intelligence artificielle dans les pratiques professionnelles de santé", quantity: 2, unit_price: 1200 },
    ],
  },
  {
    ref: "M-FAC-72", date: "08/01/2026", client: "EHPAD Résidence Pierre d'Arcis",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 5760,
    lines: [
      { description: "Le toucher relationnel", quantity: 1, unit_price: 2400 },
      { description: "Éthique et décision dans les soins", quantity: 1, unit_price: 2400 },
    ],
  },
  {
    ref: "M-FAC-64", date: "22/12/2025", client: "MAISON DE RETRAITE DE GAYETTE",
    effectifs: 12, duration: null, tva: 20, totalTTC: 27840,
    lines: [
      { description: "Démarche Snoezelen", quantity: 1, unit_price: 2400 },
      { description: "Le toucher relationnel", quantity: 1, unit_price: 2400 },
      { description: "Soins palliatifs et accompagnement en fin de vie", quantity: 1, unit_price: 2400 },
      { description: "Gestion du stress chez les professionnels", quantity: 1, unit_price: 1200 },
      { description: "Gestion des troubles du comportement", quantity: 1, unit_price: 2400 },
      { description: "La socio-esthétique", quantity: 1, unit_price: 2400 },
      { description: "Soins des pieds", quantity: 1, unit_price: 1200 },
      { description: "Élaboration du Projet Personnalisé", quantity: 1, unit_price: 2400 },
      { description: "Découverte et initiation à l'hypnose en Ehpad", quantity: 1, unit_price: 2400 },
      { description: "Hygiène bucco-dentaire", quantity: 1, unit_price: 2400 },
      { description: "Les fondamentaux de Word", quantity: 1, unit_price: 800 },
      { description: "Les fondamentaux d'Excel", quantity: 1, unit_price: 800 },
    ],
  },
  {
    ref: "M-FAC-108", date: "09/02/2026", client: "MAISON DE RETRAITE DE GAYETTE",
    effectifs: 12, duration: "1 jour soit 7 heures", tva: 20, totalTTC: 1440,
    lines: [{ description: "Gestion du stress chez les professionnels", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-109", date: "09/02/2026", client: "MAISON DE RETRAITE DE GAYETTE",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "Gestion des troubles du comportement", quantity: 1, unit_price: 2400 }],
  },
  {
    ref: "M-FAC-9", date: "31/07/2025", client: "UNICIL",
    effectifs: 12, duration: "2 jours", tva: 20, totalTTC: 5280,
    lines: [{ description: "Gérer avec sérénité les relations avec les locataires", quantity: 2, unit_price: 2200 }],
  },
  {
    ref: "M-FAC-63", date: "22/12/2025", client: "UNICIL",
    effectifs: 48, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 10560,
    lines: [{ description: "Gérer avec sérénité les relations avec les locataires", quantity: 4, unit_price: 2200 }],
  },
  {
    ref: "M-FAC-8", date: "15/07/2025", client: "CENTRE COMMUNAL D'ACTION SOCIALE (CCAS) VEYNES",
    effectifs: 12, duration: "2 jours", tva: 20, totalTTC: 8640,
    lines: [
      { description: "L'hygiène bucco-dentaire des résidents en EHPAD", quantity: 1, unit_price: 2400 },
      { description: "L'accompagnement de fin de vie", quantity: 1, unit_price: 2400 },
      { description: "Techniques de soins non médicamenteuses de la maladie d'Alzheimer", quantity: 1, unit_price: 2400 },
    ],
  },
  {
    ref: "M-FAC-7", date: "04/07/2025", client: "CÔTE D'AZUR HABITAT",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "Les charges récupérables", quantity: 2, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-94", date: "26/01/2026", client: "RÉSIDENCE SAINT CLAIR",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "SIMULATEUR DE VIEILLISSEMENT ET TOILETTE BIENVEILLANTE", quantity: 2, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-93", date: "26/01/2026", client: "RÉSIDENCE SAINT CLAIR",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "RELAXATION ET SOPHROLOGIE", quantity: 2, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-92", date: "26/01/2026", client: "RÉSIDENCE SAINT CLAIR",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "SOINS PALLIATIF", quantity: 2, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-17", date: "22/09/2025", client: "GRAND DELTA HABITAT",
    effectifs: 12, duration: "7 heures soit 1 jour", tva: 20, totalTTC: 1080,
    lines: [{ description: "Gestes et postures", quantity: 1, unit_price: 900 }],
  },
  {
    ref: "M-FAC-111", date: "10/02/2026", client: "GRAND DELTA HABITAT",
    effectifs: 10, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "Le surendettement et la procédure de rétablissement personnel", quantity: 1, unit_price: 2400 }],
  },
  {
    ref: "M-FAC-19", date: "30/09/2025", client: "PAYS D'AIX HABITAT METROPOLE",
    effectifs: 10, duration: null, tva: 20, totalTTC: 12120,
    lines: [
      { description: "H0B0 BS BE Manoeuvre - INITIAL", quantity: 6, unit_price: 1500 },
      { description: "H0B0 BS BE Manoeuvre - RECYCLAGE", quantity: 1, unit_price: 1100 },
    ],
  },
  {
    ref: "M-FAC-38", date: "20/11/2025", client: "Résidence Ehpad Les Tamaris",
    effectifs: 12, duration: "1 jour soit 7 heures", tva: 20, totalTTC: 1440,
    lines: [{ description: "Technique non médicamenteuse", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-20", date: "20/11/2025", client: "Résidence Ehpad Les Tamaris",
    effectifs: 12, duration: "1 jour soit 7 heures", tva: 20, totalTTC: 1440,
    lines: [{ description: "Trouble psychiatrique", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-22", date: "21/10/2025", client: "MGEN ACTION SANITAIRE ET SOCIALE",
    effectifs: 12, duration: "2 jours soit 14 heures", tva: 20, totalTTC: 2880,
    lines: [{ description: "Appliquer la méthode Montessori en Ehpad : autonomie, respect et stimulation des résidents", quantity: 1, unit_price: 2400 }],
  },
  {
    ref: "M-FAC-28", date: "05/11/2025", client: "EHPAD XAVIER MARIN",
    effectifs: 12, duration: "1 jour", tva: 20, totalTTC: 1440,
    lines: [{ description: "La pair aidance en EHPAD un levier de bientraitance et de soutien mutuel", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-27", date: "05/11/2025", client: "EHPAD XAVIER MARIN",
    effectifs: 12, duration: "1 jour", tva: 20, totalTTC: 1440,
    lines: [{ description: "Anxiété, angoisse : répondre aux demandes de réassurance en Ehpad", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-29", date: "05/11/2025", client: "MAISON DE RETRAITE PASTEUR DE CARCES",
    effectifs: 12, duration: "1 jour", tva: 20, totalTTC: 1440,
    lines: [{ description: "Gestion de la relation avec les proches aidants en SSIAD", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-39", date: "24/11/2025", client: "LES CHARMETTES",
    effectifs: 12, duration: "1 jour soit 7 heures", tva: 20, totalTTC: 7200,
    lines: [
      { description: "Les thérapies non-médicamenteuses", quantity: 2, unit_price: 1200 },
      { description: "Rappel HACCP", quantity: 1, unit_price: 1200 },
      { description: "Le circuit du médicament", quantity: 2, unit_price: 1200 },
    ],
  },
  {
    ref: "M-FAC-41", date: "01/12/2025", client: "LA CHRYSALIDE DE MARTIGUES",
    effectifs: 12, duration: null, tva: 20, totalTTC: 7200,
    lines: [
      { description: "Initiation HACCP", quantity: 1, unit_price: 1200 },
      { description: "Conduites addictives", quantity: 1, unit_price: 2400 },
      { description: "Troubles du comportement", quantity: 1, unit_price: 2400 },
    ],
  },
  {
    ref: "M-FAC-47", date: "04/12/2025", client: "Clinique SMR St Christophe",
    effectifs: 12, duration: "1 jour soit 7 heures", tva: 20, totalTTC: 1440,
    lines: [{ description: "La communication avec les familles des patients", quantity: 1, unit_price: 1200 }],
  },
  {
    ref: "M-FAC-100", date: "03/02/2026", client: "SOVEBAT - CHALENCON Alexandre",
    effectifs: 1, duration: "8 heures soit 1 jour", tva: 20, totalTTC: 420,
    lines: [{ description: "Intelligence Artificielle Opérationnelle : transformer son métier avec les IA génératives", quantity: 1, unit_price: 350 }],
  },
];

// ── Normalise un nom pour le matching ──
function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Fuzzy match : client PDF → prospect DB ──
function findProspect(clientName, prospects) {
  const cn = norm(clientName);

  // 1. Exact normalized match
  const exact = prospects.find((p) => norm(p.company_name) === cn);
  if (exact) return exact;

  // 2. One contains the other
  const contains = prospects.find(
    (p) => norm(p.company_name).includes(cn) || cn.includes(norm(p.company_name))
  );
  if (contains) return contains;

  // 3. Key words overlap (at least 2 significant words in common)
  const cnWords = cn.split(" ").filter((w) => w.length > 2);
  let bestMatch = null;
  let bestScore = 0;
  for (const p of prospects) {
    const pWords = norm(p.company_name).split(" ").filter((w) => w.length > 2);
    const common = cnWords.filter((w) => pWords.includes(w)).length;
    if (common > bestScore) {
      bestScore = common;
      bestMatch = p;
    }
  }
  if (bestScore >= 2) return bestMatch;

  return null;
}

// ── Main ──
async function main() {
  console.log("=== Import des 29 devis de l'ancien CRM ===\n");

  // 1. Get MR FORMATION entity
  const { data: entity } = await supabase
    .from("entities")
    .select("id")
    .eq("slug", "mr-formation")
    .single();

  if (!entity) {
    console.error("Entity MR FORMATION introuvable !");
    process.exit(1);
  }
  console.log(`Entity MR FORMATION: ${entity.id}\n`);

  // 2. Fetch all prospects for this entity
  const { data: prospects } = await supabase
    .from("crm_prospects")
    .select("id, company_name, status")
    .eq("entity_id", entity.id);

  console.log(`${prospects.length} prospects trouvés dans le CRM\n`);

  // 3. Match each quote client to a prospect
  const mapping = [];
  const unmatched = [];

  for (const q of QUOTES) {
    const prospect = findProspect(q.client, prospects);
    if (prospect) {
      mapping.push({ quote: q, prospect });
    } else {
      unmatched.push(q);
    }
  }

  // 4. Show mapping
  console.log("── Mapping devis → prospect ──");
  for (const m of mapping) {
    console.log(
      `  ${m.quote.ref} | "${m.quote.client}" → "${m.prospect.company_name}" (${m.prospect.status}) [${m.quote.totalTTC} € TTC]`
    );
  }

  if (unmatched.length > 0) {
    console.log("\n!! DEVIS NON MATCHE :");
    for (const u of unmatched) {
      console.log(`  ${u.ref} | "${u.client}" → AUCUN PROSPECT TROUVÉ`);
    }
    console.log("\nCréez ces prospects manuellement et relancez le script.");
  }

  console.log(`\n${mapping.length} devis à importer, ${unmatched.length} non matchés\n`);

  if (mapping.length === 0) {
    console.log("Rien à importer.");
    return;
  }

  // 5. Check for existing quotes to avoid duplicates
  const refs = mapping.map((m) => m.quote.ref);
  const { data: existing } = await supabase
    .from("crm_quotes")
    .select("reference")
    .eq("entity_id", entity.id)
    .in("reference", refs);

  const existingRefs = new Set((existing ?? []).map((e) => e.reference));
  const toInsert = mapping.filter((m) => !existingRefs.has(m.quote.ref));

  if (existingRefs.size > 0) {
    console.log(`${existingRefs.size} devis déjà existants (ignorés) : ${[...existingRefs].join(", ")}`);
  }

  if (toInsert.length === 0) {
    console.log("Tous les devis sont déjà importés !");
    return;
  }

  console.log(`Insertion de ${toInsert.length} devis...\n`);

  // 6. Insert quotes
  let totalInserted = 0;
  let totalAmount = 0;

  for (const { quote, prospect } of toInsert) {
    const isoDate = parseDate(quote.date);
    const validUntil = addDays(isoDate, 30);
    const notesJson = JSON.stringify({
      lines: quote.lines,
      tva: quote.tva,
      effectifs: quote.effectifs,
      duration: quote.duration,
      imported_from: "sellsy",
      original_ref: quote.ref,
    });

    const { data: inserted, error } = await supabase
      .from("crm_quotes")
      .insert({
        entity_id: entity.id,
        reference: quote.ref,
        prospect_id: prospect.id,
        amount: quote.totalTTC,
        status: "accepted",
        valid_until: validUntil,
        tva: quote.tva,
        effectifs: quote.effectifs,
        duration: quote.duration,
        notes: notesJson,
        created_at: isoDate + "T10:00:00Z",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  ERREUR ${quote.ref}: ${error.message}`);
      continue;
    }

    // Insert line items
    const lineRows = quote.lines.map((l) => ({
      quote_id: inserted.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
    }));

    const { error: linesError } = await supabase
      .from("crm_quote_lines")
      .insert(lineRows);

    if (linesError) {
      console.error(`  ERREUR lignes ${quote.ref}: ${linesError.message}`);
    }

    totalInserted++;
    totalAmount += quote.totalTTC;
    console.log(`  OK ${quote.ref} → ${prospect.company_name} (${quote.totalTTC} € TTC)`);
  }

  console.log(`\n=== Résultat ===`);
  console.log(`${totalInserted} devis importés`);
  console.log(`Montant total TTC : ${totalAmount.toLocaleString("fr-FR")} €`);
  console.log(`${unmatched.length} devis non matchés`);
}

main().catch(console.error);

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/import-legacy
 * Import ~10 entries from the old CRM data (clients, learners, trainers)
 * Restricted to super_admin / admin
 * One-shot import — safe to call multiple times (uses upsert on SIRET for clients)
 */

// ── Sample data extracted from "Data Mr formation" Excel files ──

const SAMPLE_CLIENTS = [
  {
    company_name: "13 HABITAT",
    siret: "78285569600020",
    email: "slaouadi@13habitat.fr",
    contact_name: "SLAOUADI",
    phone: null,
    address: "80 RUE ALBE",
    city: "Marseille",
    postal_code: "13004",
  },
  {
    company_name: "AEMS ASSOC ENTRAIDE MEDICO SOCIALE",
    siret: "44799061500018",
    email: "c.bares@collinestemusse.fr",
    contact_name: "BARES",
    phone: "04 94 27 26 89",
    address: "RUE URANIE",
    city: "TOULON",
    postal_code: "83100",
  },
  {
    company_name: "ASSOC LA MAISON",
    siret: "39775450800034",
    email: "mdefresne@lamaisondegardanne.fr",
    contact_name: "DEFRESNE",
    phone: null,
    address: "1100 RTE BLANCHE",
    city: "GARDANNE",
    postal_code: "13120",
  },
  {
    company_name: "ASSOCIATION LES AGES",
    siret: "42012234300015",
    email: "m.malki@lesages.fr",
    contact_name: "MALKI",
    phone: "05 49 46 41 23",
    address: "20 Route DE PAIZAY LE SEC, LA PUYE",
    city: "LA PUYE",
    postal_code: "86260",
  },
  {
    company_name: "ASSOCIATION SAINT CAMILLE",
    siret: "78390977300013",
    email: "cadre-sante@stcamille-arras.fr",
    contact_name: "DESSENE",
    phone: "03 21 22 70 14",
    address: "17 Rue DU MARCHE AU FILE",
    city: "ARRAS",
    postal_code: "62000",
  },
  {
    company_name: "AU BOIS JOLI",
    siret: "95720147800014",
    email: "direction@leboisjoli91.com",
    contact_name: "BLE",
    phone: "01 69 25 60 00",
    address: "1 Rue DU REGARD",
    city: "GRIGNY",
    postal_code: "91350",
  },
  {
    company_name: "BTP EMPLOI",
    siret: "84497547400017",
    email: "rh@btpemploi.fr",
    contact_name: null,
    phone: null,
    address: "56 BOULEVARD MICHELET",
    city: "MARSEILLE",
    postal_code: "13008",
  },
  {
    company_name: "CENTRE COMMUNAL D'ACTION SOCIALE (CCAS) VEYNES",
    siret: "26050012900085",
    email: "adj@ouleta.fr",
    contact_name: "PORTIER Clarisse",
    phone: null,
    address: "AVENUE OLYMPE DE GOUGES",
    city: "VEYNES",
    postal_code: "05400",
  },
  {
    company_name: "CHRYSALIDE GARDANNE-DE-FRANCE",
    siret: "50952791300027",
    email: "damir@chrysalidegdf.com",
    contact_name: "AMIR",
    phone: null,
    address: "Chemin de la Blaque",
    city: "GARDANNE",
    postal_code: "13120",
  },
  {
    company_name: "HOPITAL DU GIER",
    siret: "26420009300011",
    email: "allegrini.lucie@hdg30.fr",
    contact_name: "ALLEGRINI",
    phone: null,
    address: "19 Rue Victor Hugo",
    city: "SAINT-CHAMOND",
    postal_code: "42400",
  },
];

const SAMPLE_LEARNERS = [
  { last_name: "ABAD", first_name: "Lydie", email: "Lydie.abad@assurance-maladie.fr" },
  { last_name: "ABED", first_name: "Sarah", email: "sabed@13habitat.fr" },
  { last_name: "ALLEGRINI", first_name: "Lucie", email: "allegrini.lucie@hdg30.fr" },
  { last_name: "AMIR", first_name: "Delphine", email: "damir@chrysalidegdf.com" },
  { last_name: "ARAB", first_name: "Salima", email: "sarab@13habitat.fr" },
  { last_name: "ARIETA", first_name: "Joëlle", email: "arietajoelle@gmail.com" },
  { last_name: "ARTIGUES", first_name: "Karine", email: "karine.artigues@assurance-maladie.fr" },
  { last_name: "ATTAMNA", first_name: "Karima", email: "karima.attamna@assurance-maladie.fr" },
  { last_name: "OLIVIERI", first_name: "Nathalie", email: null },
  { last_name: "ABITBOL", first_name: "Jennyfer", email: null },
];

const SAMPLE_TRAINERS = [
  { last_name: "MARTINEAU", first_name: "Brigitte", hourly_rate: 71.43, type: "external" as const },
  { last_name: "VICHOT", first_name: "Marc", hourly_rate: null, type: "internal" as const },
  { last_name: "MICHEL", first_name: "Aurelie", hourly_rate: null, type: "external" as const },
  { last_name: "MARGUERIE", first_name: "Morgane", hourly_rate: 78.57, type: "external" as const },
  { last_name: "TUAILLON", first_name: "Eglantine", hourly_rate: null, type: "external" as const },
  { last_name: "BAKIRCILAR", first_name: "Christophe", hourly_rate: null, type: "external" as const },
  { last_name: "CALDARONE", first_name: "Elisabeth", hourly_rate: 71.43, type: "external" as const },
  { last_name: "FADY", first_name: "Corinne", hourly_rate: null, type: "external" as const },
  { last_name: "MOSCHETTI", first_name: "Johanna", hourly_rate: null, type: "external" as const },
  { last_name: "VERDOT", first_name: "Élodie", hourly_rate: 71.43, type: "external" as const },
];

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Auth check
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("entity_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.entity_id || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const entityId = profile.entity_id;
  const results = { clients: 0, learners: 0, trainers: 0, errors: [] as string[] };

  // ── Import Clients ──
  for (const c of SAMPLE_CLIENTS) {
    // Check if client already exists by SIRET
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("entity_id", entityId)
      .eq("siret", c.siret)
      .maybeSingle();

    if (existing) continue; // Skip duplicates

    const { error } = await supabase.from("clients").insert({
      entity_id: entityId,
      company_name: c.company_name,
      siret: c.siret,
      address: c.address,
      city: c.city,
      postal_code: c.postal_code,
      status: "active",
      notes: `Import ancien CRM — Contact: ${c.contact_name ?? "N/A"}, Email: ${c.email}`,
    });

    if (error) {
      results.errors.push(`Client "${c.company_name}": ${error.message}`);
    } else {
      results.clients++;
    }
  }

  // ── Import Learners ──
  // Link to matching client by email domain when possible
  const { data: allClients } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("entity_id", entityId);

  for (const l of SAMPLE_LEARNERS) {
    // Check duplicate by name
    const { data: existing } = await supabase
      .from("learners")
      .select("id")
      .eq("entity_id", entityId)
      .eq("last_name", l.last_name)
      .eq("first_name", l.first_name)
      .maybeSingle();

    if (existing) continue;

    // Try to match client by email domain
    let clientId: string | null = null;
    if (l.email) {
      const domain = l.email.split("@")[1]?.toLowerCase();
      if (domain === "13habitat.fr") {
        clientId = allClients?.find((c) => c.company_name === "13 HABITAT")?.id ?? null;
      } else if (domain === "hdg30.fr") {
        clientId = allClients?.find((c) => c.company_name === "HOPITAL DU GIER")?.id ?? null;
      } else if (domain === "chrysalidegdf.com") {
        clientId = allClients?.find((c) => c.company_name.includes("CHRYSALIDE"))?.id ?? null;
      }
    }

    const { error } = await supabase.from("learners").insert({
      entity_id: entityId,
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email,
      client_id: clientId,
    });

    if (error) {
      results.errors.push(`Learner "${l.last_name} ${l.first_name}": ${error.message}`);
    } else {
      results.learners++;
    }
  }

  // ── Import Trainers ──
  for (const t of SAMPLE_TRAINERS) {
    // Check duplicate by name
    const { data: existing } = await supabase
      .from("trainers")
      .select("id")
      .eq("entity_id", entityId)
      .eq("last_name", t.last_name)
      .eq("first_name", t.first_name)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from("trainers").insert({
      entity_id: entityId,
      first_name: t.first_name,
      last_name: t.last_name,
      type: t.type,
      hourly_rate: t.hourly_rate,
    });

    if (error) {
      results.errors.push(`Trainer "${t.last_name} ${t.first_name}": ${error.message}`);
    } else {
      results.trainers++;
    }
  }

  return NextResponse.json({
    message: `Import terminé : ${results.clients} clients, ${results.learners} apprenants, ${results.trainers} formateurs`,
    details: results,
  });
}

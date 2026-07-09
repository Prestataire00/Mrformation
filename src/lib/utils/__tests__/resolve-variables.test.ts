import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveVariables,
  resolveDocumentVariables,
  getResolvedVariablesMap,
  findUnresolvedVariables,
  renderUnsignedCell,
  VARIABLE_KEYS,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import type { Session, Client, Learner, Trainer } from "@/lib/types";

// Helpers de fabrication minimaux — on remplit que ce dont chaque test a besoin.
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    entity_id: "entity-1",
    training_id: null,
    title: "Formation Habilitation Électrique B1V",
    start_date: "2026-05-15T09:00:00Z",
    end_date: "2026-05-16T17:00:00Z",
    location: "Aix-en-Provence",
    mode: "presentiel",
    status: "upcoming",
    max_participants: null,
    trainer_id: null,
    notes: null,
    type: "intra",
    domain: null,
    description: null,
    total_price: 1500,
    planned_hours: 14,
    visio_link: null,
    manager_id: null,
    program_id: null,
    is_planned: true,
    is_completed: false,
    is_dpc: false,
    is_subcontracted: false,
    catalog_pre_registration: false,
    updated_at: "2026-05-01T00:00:00Z",
    created_at: "2026-05-01T00:00:00Z",
    formation_convention_documents: [],
    formation_evaluation_assignments: [],
    formation_satisfaction_assignments: [],
    formation_elearning_assignments: [],
    enrollments: [],
    ...overrides,
  } as Session;
}

function makeLearner(overrides: Partial<Learner> = {}): Learner {
  return {
    id: "learner-1",
    profile_id: null,
    client_id: "client-1",
    entity_id: "entity-1",
    first_name: "Pierre",
    last_name: "MARTIN",
    email: "pierre.martin@example.com",
    phone: "0601020304",
    job_title: null,
    learner_type: "salarie",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Learner;
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    entity_id: "entity-1",
    company_name: "Acme SAS",
    siret: "12345678901234",
    address: "10 rue Paradis",
    postal_code: "13001",
    city: "Marseille",
    website: null,
    sector: null,
    naf_code: null,
    bpf_category: null,
    status: "active",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    contacts: [],
    ...overrides,
  } as Client;
}

function makeTrainer(overrides: Partial<Trainer> = {}): Trainer {
  return {
    id: "trainer-1",
    profile_id: null,
    entity_id: "entity-1",
    first_name: "Karim",
    last_name: "AZIZI",
    email: null,
    phone: null,
    type: "internal",
    bio: null,
    hourly_rate: null,
    availability_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Trainer;
}

const FULL_ENTITY: ResolveContext["entity"] = {
  siret: "11122233344455",
  nda: "13123456789",
  address: "1 cours Mirabeau",
  postal_code: "13100",
  city: "Aix-en-Provence",
  email: "contact@mr-formation.fr",
  phone: "0488123456",
  website: "https://mr-formation.fr",
  president_name: "Loris VICHOT",
  signature_text: null,
  stamp_url: "https://example.com/stamp.png",
  signature_url: "https://example.com/sig.png",
  logo_url: "https://example.com/logo.png",
};

describe("resolveVariables — basics", () => {
  it("remplace {{nom_apprenant}} par prénom + nom", () => {
    const result = resolveVariables("Bonjour {{nom_apprenant}}", {
      learner: makeLearner(),
    });
    expect(result).toBe("Bonjour Pierre MARTIN");
  });

  it("remplace plusieurs occurrences de la même variable (replaceAll)", () => {
    const result = resolveVariables(
      "{{nom_apprenant}} confirme par {{nom_apprenant}} sa présence",
      { learner: makeLearner() },
    );
    expect(result).toBe("Pierre MARTIN confirme par Pierre MARTIN sa présence");
  });

  it("retourne le placeholder fallback si la donnée est absente (NULL learner)", () => {
    const result = resolveVariables("Bonjour {{nom_apprenant}}", {});
    expect(result).toBe("Bonjour [Nom apprenant]");
  });

  it("ne génère JAMAIS la chaîne 'undefined' dans le résultat", () => {
    // Cas pathologique : tout est null
    const result = resolveVariables(
      "Apprenant: {{nom_apprenant}}, Client: {{nom_client}}, Date: {{date_formation}}, Tél: {{telephone_client}}",
      {},
    );
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
  });

  it("alias `resolveDocumentVariables` doit être identique à `resolveVariables`", () => {
    expect(resolveDocumentVariables).toBe(resolveVariables);
  });
});

describe("resolveVariables — formatage dates", () => {
  it("formate les dates session en format français dd/MM/yyyy", () => {
    const session = makeSession({
      start_date: "2026-05-15T09:00:00Z",
      end_date: "2026-05-16T17:00:00Z",
    });
    const result = resolveVariables(
      "Du {{date_debut}} au {{date_fin}}",
      { session },
    );
    expect(result).toMatch(/Du \d{2}\/\d{2}\/\d{4} au \d{2}\/\d{2}\/\d{4}/);
  });

  it("résout {{date_today}} avec la date courante au format français", () => {
    const result = resolveVariables("Aujourd'hui : {{date_today}}", {});
    expect(result).toMatch(/^Aujourd'hui : \d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("resolveVariables — entity organisme", () => {
  it("résout {{siret_organisme}} et {{adresse_organisme}} depuis entity", () => {
    const result = resolveVariables(
      "SIRET: {{siret_organisme}}, Adresse: {{adresse_organisme}}",
      { entity: FULL_ENTITY },
    );
    expect(result).toBe(
      "SIRET: 11122233344455, Adresse: 1 cours Mirabeau 13100 Aix-en-Provence",
    );
  });

  it("résout les alias Sellsy [%…%] organisme (format des emails) depuis entity", () => {
    // Chemin exact utilisé par les emails d'automation et manuels : le catalogue
    // UI insère du [%Libellé%], résolu via ALIAS_TO_VARIABLE_KEY → entity.
    const result = resolveVariables(
      "[%Nom de l'organisme%] — SIRET [%SIRET de l'organisme%]",
      { entity: { ...FULL_ENTITY, name: "MR FORMATION" } },
    );
    expect(result).toBe("MR FORMATION — SIRET 11122233344455");
  });

  it("résout {{logo_organisme}} en balise <img> si logo_url présent", () => {
    const result = resolveVariables("{{logo_organisme}}", {
      entity: FULL_ENTITY,
    });
    expect(result).toContain('<img src="https://example.com/logo.png"');
    expect(result).toContain('alt="Logo"');
  });

  it("retourne chaîne vide pour {{logo_organisme}} si logo_url absent", () => {
    const result = resolveVariables("[{{logo_organisme}}]", {
      entity: { ...FULL_ENTITY, logo_url: null },
    });
    expect(result).toBe("[]");
  });

  it("fallback `[SIRET organisme]` si entity absent", () => {
    const result = resolveVariables("SIRET: {{siret_organisme}}", {});
    expect(result).toBe("SIRET: [SIRET organisme]");
  });
});

describe("resolveVariables — multi-entreprises (filter par client)", () => {
  it("filtre la liste des apprenants par client_id si client fourni", () => {
    const session = makeSession({
      enrollments: [
        { id: "e1", learner_id: "l1", client_id: "client-A", session_id: "s1", learner: { id: "l1", first_name: "Alice", last_name: "DUPONT" } as Learner } as never,
        { id: "e2", learner_id: "l2", client_id: "client-B", session_id: "s1", learner: { id: "l2", first_name: "Bob", last_name: "SMITH" } as Learner } as never,
        { id: "e3", learner_id: "l3", client_id: "client-A", session_id: "s1", learner: { id: "l3", first_name: "Claire", last_name: "DURAND" } as Learner } as never,
      ],
    });
    const clientA = makeClient({ id: "client-A", company_name: "Client A" });
    const result = resolveVariables("{{liste_apprenants}}", {
      session,
      client: clientA,
    });
    expect(result).toBe("DUPONT Alice, DURAND Claire");
    expect(result).not.toContain("Bob");
  });

  it("retourne tous les apprenants en INTRA (pas de client)", () => {
    const session = makeSession({
      enrollments: [
        { id: "e1", learner_id: "l1", client_id: null, session_id: "s1", learner: { id: "l1", first_name: "Alice", last_name: "DUPONT" } as Learner } as never,
        { id: "e2", learner_id: "l2", client_id: null, session_id: "s1", learner: { id: "l2", first_name: "Bob", last_name: "SMITH" } as Learner } as never,
      ],
    });
    const result = resolveVariables("{{liste_apprenants}}", { session });
    expect(result).toContain("DUPONT Alice");
    expect(result).toContain("SMITH Bob");
  });
});

describe("getResolvedVariablesMap", () => {
  it("retourne un Record<string,string> avec les clés SANS délimiteurs", () => {
    const map = getResolvedVariablesMap({
      learner: makeLearner(),
      session: makeSession(),
    });
    expect(map.nom_apprenant).toBe("Pierre MARTIN");
    expect(map.titre_formation).toBe("Formation Habilitation Électrique B1V");
    // Pas de délimiteurs dans les clés
    expect(map["{{nom_apprenant}}"]).toBeUndefined();
  });

  it("remplace les placeholders [...] par chaîne vide (docxtemplater-friendly)", () => {
    const map = getResolvedVariablesMap({}); // tout vide
    // Au lieu de "[Nom apprenant]" on doit avoir ""
    expect(map.nom_apprenant).toBe("");
    expect(map.titre_formation).toBe("");
    expect(map.siret_organisme).toBe("");
  });

  it("contient toutes les clés du catalogue VARIABLE_KEYS", () => {
    const map = getResolvedVariablesMap({});
    const expectedKeys = VARIABLE_KEYS.map((k) => k.replace(/^\{\{|\}\}$/g, ""));
    for (const key of expectedKeys) {
      expect(map).toHaveProperty(key);
    }
  });
});

describe("Format Loris/Sellsy `[%libellé%]`", () => {
  it("résout `[%Nom du client%]` via l'alias map", () => {
    const result = resolveVariables("Bénéficiaire : [%Nom du client%]", {
      client: makeClient(),
    });
    expect(result).toBe("Bénéficiaire : Acme SAS");
  });

  it("résout `[%Nom de l'organisme%]` (variable Story B-Convention)", () => {
    const result = resolveVariables("Organisme : [%Nom de l'organisme%]", {
      entity: { ...FULL_ENTITY, name: "MR Formation" },
    });
    expect(result).toBe("Organisme : MR Formation");
  });

  it("résout `[%Ville de l'organisme%]` depuis entity.city", () => {
    const result = resolveVariables("À [%Ville de l'organisme%]", {
      entity: FULL_ENTITY,
    });
    expect(result).toBe("À Aix-en-Provence");
  });

  it("résout `[%Dates de la formation%]` en combo 'Du X au Y'", () => {
    const result = resolveVariables("Dates : [%Dates de la formation%]", {
      session: makeSession({
        start_date: "2026-05-15T09:00:00Z",
        end_date: "2026-05-16T17:00:00Z",
      }),
    });
    expect(result).toMatch(/Dates : Du \d{2}\/\d{2}\/\d{4} au \d{2}\/\d{2}\/\d{4}/);
  });

  it("`[%Dates de la formation%]` : 'Le X' si date_debut === date_fin (1 jour)", () => {
    const result = resolveVariables("[%Dates de la formation%]", {
      session: makeSession({
        start_date: "2026-05-15T09:00:00Z",
        end_date: "2026-05-15T17:00:00Z",
      }),
    });
    expect(result).toMatch(/^Le \d{2}\/\d{2}\/\d{4}$/);
  });

  it("résout `[%Type d'action de formation%]` selon training.classification", () => {
    const result1 = resolveVariables("[%Type d'action de formation%]", {
      session: makeSession({
        training: { classification: "reglementaire" } as never,
      }),
    });
    expect(result1).toBe("Action de formation réglementaire");

    const result2 = resolveVariables("[%Type d'action de formation%]", {
      session: makeSession({
        training: { classification: "certifiant" } as never,
      }),
    });
    expect(result2).toBe("Action de formation certifiante");
  });

  it("résout `[%Tableau des coûts du client%]` en table HTML", () => {
    const result = resolveVariables("Coûts : [%Tableau des coûts du client%]", {
      session: makeSession({ total_price: 1500, title: "Habilitation B1V" }),
    });
    expect(result).toContain("<table");
    expect(result).toContain("Habilitation B1V");
    expect(result).toContain("1500.00 €"); // HT
    expect(result).toContain("300.00 €");  // TVA 20%
    expect(result).toContain("1800.00 €"); // TTC
  });

  it("garde `[%libellé inconnu%]` visible si pas d'alias (pour audit)", () => {
    const result = resolveVariables("Test [%Libellé inexistant%]", {});
    expect(result).toBe("Test [%Libellé inexistant%]");
    // findUnresolvedVariables détecte désormais aussi le format Sellsy [%…%]
    expect(findUnresolvedVariables(result)).toEqual(["[%Libellé inexistant%]"]);
  });

  it("résout `[%xxx%]` ET `{{xxx}}` dans le même template", () => {
    const result = resolveVariables(
      "Mr {{nom_client}} alias [%Nom du client%]",
      { client: makeClient() },
    );
    expect(result).toBe("Mr Acme SAS alias Acme SAS");
  });
});

describe("findUnresolvedVariables", () => {
  it("liste les {{xxx}} restantes après résolution", () => {
    const partial = resolveVariables("{{nom_apprenant}} {{variable_inconnue}}", {
      learner: makeLearner(),
    });
    expect(findUnresolvedVariables(partial)).toEqual(["{{variable_inconnue}}"]);
  });

  it("retourne [] si tout est résolu", () => {
    const result = resolveVariables("Bonjour {{nom_apprenant}}", {
      learner: makeLearner(),
    });
    expect(findUnresolvedVariables(result)).toEqual([]);
  });

  it("dédoublonne les variables qui apparaissent plusieurs fois", () => {
    expect(findUnresolvedVariables("{{a}} {{b}} {{a}} {{b}}")).toEqual([
      "{{a}}",
      "{{b}}",
    ]);
  });

  it("détecte aussi les balises Sellsy [%Libellé%] non résolues", () => {
    expect(findUnresolvedVariables("Bonjour [%Date de fin de la formation%]")).toEqual([
      "[%Date de fin de la formation%]",
    ]);
  });

  it("détecte les deux formats mélangés ({{…}} + [%…%])", () => {
    expect(
      findUnresolvedVariables("{{inconnu}} et [%Autre libellé%]"),
    ).toEqual(["{{inconnu}}", "[%Autre libellé%]"]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Tests pour renderUnsignedCell (Story émargement status fix 2026-05-17)
// Voir docs/superpowers/specs/2026-05-17-emargement-collectif-fix-default-status-design.md
// ───────────────────────────────────────────────────────────────────────

describe("renderUnsignedCell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("session passée → 'Non signé' rouge avec class status-unsigned", () => {
    const html = renderUnsignedCell("2026-01-15T17:00:00Z");
    expect(html).toContain("Non signé");
    expect(html).toContain("status-unsigned");
  });

  it("session à venir → cellule vide", () => {
    const html = renderUnsignedCell("2030-06-15T17:00:00Z");
    expect(html).toBe("");
  });

  it("session end_date = null → cellule vide (fallback safe)", () => {
    expect(renderUnsignedCell(null)).toBe("");
  });

  it("session end_date = undefined → cellule vide (fallback safe)", () => {
    expect(renderUnsignedCell(undefined)).toBe("");
  });

  it("session end_date dans le futur immédiat (1 jour) → cellule vide", () => {
    const html = renderUnsignedCell("2026-05-18T17:00:00Z");
    expect(html).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pédagogie V2 Epic 2.5 — Phase B Task 12
// {{identifiant_apprenant}} et durcissement {{email_apprenant}} pour ignorer
// les emails synthétiques `<username>@learner.<entity>.local`.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveVariables — {{identifiant_apprenant}} (Epic 2.5)", () => {
  it("retourne `learner.username` quand présent (cas nominal Epic 2.5)", () => {
    const learner = makeLearner({
      email: "pierre.martin@example.com",
    });
    // `username` n'est pas dans le type TS Learner (colonne ajoutée par
    // add_learner_username_credentials.sql). On l'ajoute via cast contrôlé.
    (learner as unknown as Record<string, string>).username = "pierre.martin";

    const result = resolveVariables("Identifiant : {{identifiant_apprenant}}", {
      learner,
    });
    expect(result).toBe("Identifiant : pierre.martin");
  });

  it("fallback sur l'email réel si pas de username (apprenants pré-Epic 2.5)", () => {
    const learner = makeLearner({ email: "pierre.martin@example.com" });
    // pas de `username` sur ce learner

    const result = resolveVariables("Identifiant : {{identifiant_apprenant}}", {
      learner,
    });
    expect(result).toBe("Identifiant : pierre.martin@example.com");
  });

  it("retourne chaîne vide quand ni username ni email (pas de 'undefined')", () => {
    const learner = makeLearner({ email: null });

    const result = resolveVariables("Id:[{{identifiant_apprenant}}]", { learner });
    expect(result).toBe("Id:[]");
    expect(result).not.toContain("undefined");
  });

  it("learner null → chaîne vide", () => {
    const result = resolveVariables("Id:[{{identifiant_apprenant}}]", {});
    expect(result).toBe("Id:[]");
  });
});

describe("resolveVariables — {{email_apprenant}} (durcissement Epic 2.5)", () => {
  it("retourne l'email réel quand l'apprenant a un vrai email", () => {
    const result = resolveVariables("Email : {{email_apprenant}}", {
      learner: makeLearner({ email: "pierre.martin@example.com" }),
    });
    expect(result).toBe("Email : pierre.martin@example.com");
  });

  it("retourne chaîne vide quand l'email est synthétique (@learner.*.local)", () => {
    const result = resolveVariables("Email : [{{email_apprenant}}]", {
      learner: makeLearner({
        email: "pierre.martin@learner.mr-formation.local",
      }),
    });
    expect(result).toBe("Email : []");
  });

  it("retourne chaîne vide pour un email synthétique slug C3V", () => {
    const result = resolveVariables("[{{email_apprenant}}]", {
      learner: makeLearner({
        email: "marie.dupont@learner.c3v-formation.local",
      }),
    });
    expect(result).toBe("[]");
  });

  it("retourne chaîne vide quand learner.email = null (au lieu du placeholder)", () => {
    const result = resolveVariables("[{{email_apprenant}}]", {
      learner: makeLearner({ email: null }),
    });
    // Avant Phase B Task 12 : renvoyait "[Email apprenant]".
    // Maintenant : chaîne vide, on n'expose pas de placeholder visible
    // dans les documents officiels quand l'apprenant n'a pas d'email réel.
    expect(result).toBe("[]");
  });

  it("learner null → chaîne vide (pas de 'undefined')", () => {
    const result = resolveVariables("[{{email_apprenant}}]", {});
    expect(result).toBe("[]");
  });

  it("ne confond pas un email réel contenant 'learner' avec un email synthétique", () => {
    // Cas piège : un vrai utilisateur dont l'email contient "learner"
    const result = resolveVariables("{{email_apprenant}}", {
      learner: makeLearner({ email: "learner.test@example.com" }),
    });
    expect(result).toBe("learner.test@example.com");
  });
});

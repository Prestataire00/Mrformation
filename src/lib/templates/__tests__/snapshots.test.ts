/**
 * Snapshot tests E2E pour les 6 templates HTML les plus critiques
 * (couverts par F1/F2.x/F3 livrés dans cette session).
 *
 * Objectif : détecter toute régression silencieuse dans :
 * - Les variables résolues par `resolveDocumentVariables` (renommage, suppression
 *   d'alias dans ALIAS_TO_VARIABLE_KEY)
 * - Les templates HTML eux-mêmes (modif involontaire de structure)
 *
 * Approche : on snapshote le HTML résolu (output de resolveDocumentVariables).
 * Si un test casse, lire le diff — si la régression est volontaire, mettre à
 * jour le snapshot via `npx vitest -u`.
 *
 * Story E4 — Tests E2E snapshot PDF (FR-DOC-40, simplifiée : on snapshote
 * le HTML pré-PDF plutôt que le PDF binaire qui est trop fragile en CI).
 */

import { describe, it, expect } from "vitest";
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import { CONVOCATION_APPRENANT_HTML, CONVOCATION_APPRENANT_FOOTER_TEMPLATE } from "@/lib/templates/convocation-apprenant";
import { CERTIFICAT_REALISATION_HTML, CERTIFICAT_REALISATION_FOOTER_TEMPLATE } from "@/lib/templates/certificat-realisation";
import { ATTESTATION_ASSIDUITE_HTML, ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE } from "@/lib/templates/attestation-assiduite";
import { EMARGEMENT_INDIVIDUEL_HTML, EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE } from "@/lib/templates/emargement-individuel";
import { CONVENTION_ENTREPRISE_HTML, CONVENTION_FOOTER_TEMPLATE } from "@/lib/templates/convention-entreprise";
import { CONVENTION_INTERVENTION_HTML, CONVENTION_INTERVENTION_FOOTER_TEMPLATE } from "@/lib/templates/convention-intervention";
import type { Session, Learner, Client, Trainer } from "@/lib/types";

// ─── Fixtures (dates fixes pour snapshots stables) ──────────────────────

const FIXED_SESSION_UPDATED_AT = "2026-05-01T00:00:00Z";

function makeSession(): Session {
  return {
    id: "session-snap-1",
    entity_id: "entity-snap-1",
    training_id: "training-snap-1",
    title: "Habilitation Électrique B1V",
    start_date: "2026-06-15T09:00:00Z",
    end_date: "2026-06-16T17:00:00Z",
    location: "Aix-en-Provence",
    mode: "presentiel",
    status: "upcoming",
    max_participants: 10,
    trainer_id: null,
    notes: null,
    type: "inter",
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
    updated_at: FIXED_SESSION_UPDATED_AT,
    created_at: "2026-05-01T00:00:00Z",
    formation_convention_documents: [],
    formation_evaluation_assignments: [],
    formation_satisfaction_assignments: [],
    formation_elearning_assignments: [],
    enrollments: [],
    training: {
      id: "training-snap-1",
      entity_id: "entity-snap-1",
      title: "Habilitation Électrique B1V",
      code: "HAB-B1V",
      description: "Formation habilitation électrique B1V pour personnel électricien",
      objectives: "Maîtriser les règles de sécurité électrique",
      target_audience: "Électriciens en activité",
      prerequisites: "Aucun",
      methods: "Présentiel + mises en situation",
      assessment_methods: "QCM + évaluation pratique",
      handicap_accessibility: "Accessible aux personnes en situation de handicap",
      validation_modalities: "Délivrance attestation",
      duration: "14h",
      domain: "électrique",
      level: "initial",
      certificateur: null,
      certificateur_id: null,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    } as unknown as Session["training"],
    formation_time_slots: [
      {
        id: "slot-1",
        session_id: "session-snap-1",
        start_time: "2026-06-15T09:00:00Z",
        end_time: "2026-06-15T17:00:00Z",
        is_pause: false,
        created_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "slot-2",
        session_id: "session-snap-1",
        start_time: "2026-06-16T09:00:00Z",
        end_time: "2026-06-16T17:00:00Z",
        is_pause: false,
        created_at: "2026-05-01T00:00:00Z",
      },
    ],
  } as unknown as Session;
}

function makeLearner(): Learner {
  return {
    id: "learner-snap-1",
    profile_id: null,
    client_id: "client-snap-1",
    entity_id: "entity-snap-1",
    first_name: "Pierre",
    last_name: "MARTIN",
    email: "pierre.martin@example.com",
    phone: "0601020304",
    job_title: "Électricien",
    learner_type: "salarie",
    created_at: "2026-01-01T00:00:00Z",
  } as Learner;
}

function makeClient(): Client {
  return {
    id: "client-snap-1",
    entity_id: "entity-snap-1",
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
    contacts: [
      {
        id: "contact-1",
        client_id: "client-snap-1",
        first_name: "Marie",
        last_name: "DURAND",
        email: "marie.durand@acme.fr",
        phone: "0411223344",
        job_title: "Responsable formation",
        is_primary: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
  } as Client;
}

function makeTrainer(): Trainer {
  return {
    id: "trainer-snap-1",
    profile_id: null,
    entity_id: "entity-snap-1",
    first_name: "Karim",
    last_name: "AZIZI",
    email: "karim.azizi@formation.fr",
    phone: "0612345678",
    type: "internal",
    bio: "Formateur électricien expérimenté",
    hourly_rate: 80,
    availability_notes: null,
    created_at: "2026-01-01T00:00:00Z",
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

// QR data URL fixe pour snapshot stable (sinon dépend du moment de génération)
const FIXED_QR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==";

// ─── Tests par doc_type ─────────────────────────────────────────────────

describe("Templates snapshots — couvre F1/F2.x/F3", () => {
  it("convocation-apprenant : HTML + footer résolus correctement", () => {
    const context: ResolveContext = {
      session: makeSession(),
      learner: makeLearner(),
      entity: FULL_ENTITY,
      extranetQrDataUrl: FIXED_QR_DATA_URL,
    };
    const html = resolveDocumentVariables(CONVOCATION_APPRENANT_HTML, context);
    const footer = resolveDocumentVariables(CONVOCATION_APPRENANT_FOOTER_TEMPLATE, context);
    expect({ html, footer }).toMatchSnapshot();
  });

  it("certificat-realisation : HTML + footer résolus avec learner + client", () => {
    const context: ResolveContext = {
      session: makeSession(),
      learner: makeLearner(),
      client: makeClient(),
      entity: FULL_ENTITY,
    };
    const html = resolveDocumentVariables(CERTIFICAT_REALISATION_HTML, context);
    const footer = resolveDocumentVariables(CERTIFICAT_REALISATION_FOOTER_TEMPLATE, context);
    expect({ html, footer }).toMatchSnapshot();
  });

  it("attestation-assiduite : HTML + footer avec présence signalée", () => {
    const context: ResolveContext = {
      session: makeSession(),
      learner: makeLearner(),
      entity: FULL_ENTITY,
      signedLearnerIds: new Set(["learner-snap-1"]),
    };
    const html = resolveDocumentVariables(ATTESTATION_ASSIDUITE_HTML, context);
    const footer = resolveDocumentVariables(ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE, context);
    expect({ html, footer }).toMatchSnapshot();
  });

  it("emargement-individuel : HTML + footer avec time_slots + signatures", () => {
    const context: ResolveContext = {
      session: makeSession(),
      learner: makeLearner(),
      entity: FULL_ENTITY,
      signedLearnerIds: new Set(["learner-snap-1"]),
      signaturesById: new Map(),
    };
    const html = resolveDocumentVariables(EMARGEMENT_INDIVIDUEL_HTML, context);
    const footer = resolveDocumentVariables(EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE, context);
    expect({ html, footer }).toMatchSnapshot();
  });

  it("convention-entreprise : HTML + footer avec client + contacts", () => {
    const context: ResolveContext = {
      session: makeSession(),
      client: makeClient(),
      entity: FULL_ENTITY,
    };
    const html = resolveDocumentVariables(CONVENTION_ENTREPRISE_HTML, context);
    const footer = resolveDocumentVariables(CONVENTION_FOOTER_TEMPLATE, context);
    expect({ html, footer }).toMatchSnapshot();
  });

  it("convention-intervention : HTML + footer avec trainer + cost_ht custom var", () => {
    const trainerWithCost = {
      ...makeTrainer(),
      _agreed_cost_ht: 1200,
    } as Trainer & { _agreed_cost_ht: number | null };
    const context: ResolveContext = {
      session: makeSession(),
      trainer: trainerWithCost,
      entity: FULL_ENTITY,
    };
    const html = resolveDocumentVariables(CONVENTION_INTERVENTION_HTML, context);
    const footer = resolveDocumentVariables(CONVENTION_INTERVENTION_FOOTER_TEMPLATE, context);
    expect({ html, footer }).toMatchSnapshot();
  });
});

// ─── Test régression : variables non résolues ───────────────────────────

describe("Templates régression : aucune balise [%...%] non résolue dans output", () => {
  const UNRESOLVED_PATTERN = /\[%[^%]+%\]/g;

  it.each([
    ["convocation-apprenant", CONVOCATION_APPRENANT_HTML, "learner"],
    ["certificat-realisation", CERTIFICAT_REALISATION_HTML, "learner"],
    ["attestation-assiduite", ATTESTATION_ASSIDUITE_HTML, "learner"],
    ["emargement-individuel", EMARGEMENT_INDIVIDUEL_HTML, "learner"],
    ["convention-entreprise", CONVENTION_ENTREPRISE_HTML, "company"],
    ["convention-intervention", CONVENTION_INTERVENTION_HTML, "trainer"],
  ])("%s : aucune variable orpheline après résolution", (_name, templateHtml, contextType) => {
    let context: ResolveContext;
    if (contextType === "learner") {
      context = {
        session: makeSession(),
        learner: makeLearner(),
        client: makeClient(),
        entity: FULL_ENTITY,
        extranetQrDataUrl: FIXED_QR_DATA_URL,
        signedLearnerIds: new Set(["learner-snap-1"]),
        signaturesById: new Map(),
      };
    } else if (contextType === "company") {
      context = {
        session: makeSession(),
        client: makeClient(),
        entity: FULL_ENTITY,
      };
    } else {
      const trainerWithCost = {
        ...makeTrainer(),
        _agreed_cost_ht: 1200,
      } as Trainer & { _agreed_cost_ht: number | null };
      context = {
        session: makeSession(),
        trainer: trainerWithCost,
        entity: FULL_ENTITY,
      };
    }
    const resolved = resolveDocumentVariables(templateHtml, context);
    const orphans = resolved.match(UNRESOLVED_PATTERN);
    expect(orphans, `Balises non résolues trouvées : ${orphans?.join(", ")}`).toBeNull();
  });
});

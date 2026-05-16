/**
 * POST /api/documents/generate-programme-mock
 *
 * Génère un Programme de formation avec DONNÉES FACTICES — reproduit
 * exactement l'exemple Loris (Programme-Formation-mrformation.pdf) :
 * formation "Accompagner les Managers de Proximité" sur 2 jours, 4 créneaux,
 * 6 modules pédagogiques avec contenu + animation, satisfaction 99.6%.
 *
 * Pas de body. Tous rôles admin/super_admin (test interne). Retourne le PDF
 * pour validation visuelle du template.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  PROGRAMME_FORMATION_HTML,
  PROGRAMME_FORMATION_FOOTER_TEMPLATE,
} from "@/lib/templates/programme-formation";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session } from "@/lib/types";

export async function POST(_request: NextRequest) {
  try {
    const supabase = createClient();

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
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // Programme mocké riche, modules avec slots/days/animation_items
    const mockProgram = {
      id: "mock-program-id",
      entity_id: profile.entity_id,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      description:
        "Donner aux managers de proximité des outils et méthodes afin qu'ils puissent prendre la suite des formations gestionnaires et les accompagner au quotidien dans les relations tendues.",
      objectives: [
        "Pratiquer l'écoute active avec le gestionnaire pour entendre et voir les signes de difficulté",
        "Développer la confiance et favoriser la parole du gestionnaire",
        "Favoriser la relation gagnant-gagnant tout en restant factuel",
        "Favoriser la parole de groupe et donner un cadre commun clair",
        "Faciliter les relations pour des échanges constructifs : soutenir le gestionnaire dans le respect de la politique tout en satisfaisant le locataire.",
      ].join("\n"),
      version: 1,
      is_active: true,
      created_at: "2025-05-05T00:00:00Z",
      updated_at: "2025-05-05T00:00:00Z",
      content: {
        target_audience: "Managers de Proximité.",
        prerequisites: "aucun",
        duration_days: 2,
        access_delay_days: 10,
        access_modality: "",
        satisfaction_rate: 99.6,
        team_description: "",
        pedagogical_resources: [
          "Alternance d'apports théoriques et d'ateliers pratiques. Mises en situation et analyse de situations.",
          "Pour faciliter l'ancrage et conformément à l'ADN MR FORMATION, nos ateliers utilisent la Ludo pédagogie : jeux, simulations, quizz…",
          "Remise d'un support de synthèse",
        ],
        evaluation_methods: [
          "Évaluation des acquis en cours de formation via des mises en situation analysées et des exercices pratiques.",
          "Quizz d'évaluation des acquis en fin de formation",
          "Évaluation de l'impact de la formation « à chaud »",
          "Formation sanctionnée par une attestation",
        ],
        modules: [
          // ── Jour 1 - Matin ──
          {
            id: 0,
            day_number: 1,
            slot: "matin",
            title: "0 – échanges sur le contenu de la formation pour les gestionnaires",
            topics: [
              "Présentation du module tronc commun gestionnaires – questions/réponses/précisions",
              "Présentation objectifs et contenu tronc commun et parcours à la carte MP",
            ],
            animation_items: [
              "Ice breaker — Photolangage : comment je vis les relations avec les gestionnaires (permet de démarrer de manière agréable et constructive)",
              "Jeu : la baguette magique : imaginer une situation rêvée puis définir comment tendre vers cette situation",
            ],
          },
          {
            id: 1,
            day_number: 1,
            slot: "matin",
            title: "1 – le rôle du MP dans la pérennité de la formation : prendre le relai",
            topics: [
              "Autodiagnostic : combien de temps je passe avec mes équipes (en groupe en individuel) pour quoi ?",
              "Organiser mon temps pour mieux accompagner",
            ],
            animation_items: [
              "Atelier : Cartographie du temps que je passe avec mon équipe / mes autres missions et périodicité",
            ],
          },
          // ── Jour 1 - Après-midi ──
          {
            id: 2,
            day_number: 1,
            slot: "aprem",
            title: "2 – comment accompagner les gestionnaires pour qu'ils abordent leur quotidien avec sérénité ?",
            topics: [
              "Les techniques de communication au service de la relation : écoute active-questionnement-reformulation – empathie et bienveillance",
              "Savoir distinguer faits opinions et sentiments pour mieux cerner le besoin du gestionnaire",
              "Gérer ses émotions pour gagner en efficacité",
              "Choix entre individuel et collectif",
            ],
            animation_items: [
              "Atelier : Création d'une charte du MP « servant-leader » : pour que mon équipe aborde le quotidien avec sérénité, je…… (entre 5 et 10 points)",
              "Atelier : Quelles situations pour l'individuel, ou pour le collectif ?",
              "Mises en situation : pratiquer l'écoute active, reformuler et questionner",
              "Mises en situation : pratiquer l'empathie et la communication bienveillante",
              "Exercice pratique : S'en tenir aux faits et aller à l'essentiel",
            ],
          },
          // ── Jour 2 - Matin ──
          {
            id: 3,
            day_number: 2,
            slot: "matin",
            title: "3 – accompagner individuellement",
            topics: [
              "Développer son écoute pour mieux relever les signes de difficultés du gestionnaire",
              "Rechercher les causes sans « investiguer »",
              "Favoriser la parole du gestionnaire, développer son empathie",
              "Savoir rester factuel",
              "Soutenir le gestionnaire tout en satisfaisant le locataire",
              "Organiser des temps d'échanges",
              "Organiser ses disponibilités, poser un cadre",
            ],
            animation_items: [
              "Exercices : les questions ouvertes et fermées ; la reformulation",
              "Atelier : Quelles situations pour l'individuel ? Quelles méthodes pour un entretien individuel ? Comment poser le cadre ?",
              "Échanges d'expériences : Les difficultés rencontrées lorsque je communique en individuel ; comment je pourrais mieux organiser sans perdre de temps ?",
              "Échanges d'expériences : Comment faire quand le locataire s'en prend au gestionnaire ? Quel est mon rôle ?",
            ],
          },
          // ── Jour 2 - Après-midi ──
          {
            id: 4,
            day_number: 2,
            slot: "aprem",
            title: "4 – accompagner collectivement",
            topics: [
              "Organiser des temps collectifs : pourquoi, comment ?",
              "Favoriser les échanges entre gestionnaires pour faire émerger leurs bonnes pratiques",
              "Aborder et résoudre une problématique grâce au collectif (méthodes et outils)",
              "Poser un cadre commun clair et concret",
            ],
            animation_items: [
              "Ateliers : Quel intérêt j'ai à manager un groupe ?",
              "Avantages et limites des actions collectives",
              "Déroulement d'une décision prise en collectif",
            ],
          },
          {
            id: 5,
            day_number: 2,
            slot: "aprem",
            title: "5 – établir un plan d'action",
            topics: ["Comment je vais organiser le suivi de la formation"],
            animation_items: [
              "Plan d'action personnel",
              "Mises en situation : Simulation d'une réunion collective avec pour objectif la résolution d'un problème : poser le cadre et formuler l'objectif",
            ],
          },
        ],
      },
    };

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      training_id: null,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      location: "UNICIL, 11 RUE ARMENY 13006 MARSEILLE",
      mode: "presentiel",
      status: "completed",
      max_participants: 10,
      trainer_id: null,
      notes: null,
      type: "intra",
      domain: null,
      description: null,
      total_price: 1900,
      planned_hours: 14,
      visio_link: null,
      manager_id: null,
      program_id: "mock-program-id",
      is_planned: true,
      is_completed: true,
      is_dpc: false,
      is_subcontracted: false,
      catalog_pre_registration: false,
      updated_at: "2025-01-10T00:00:00Z",
      created_at: "2024-12-01T00:00:00Z",
      training: {
        id: "mock-training",
        entity_id: profile.entity_id,
        program_id: "mock-program-id",
        title: "Manager de proximité",
        description: null,
        objectives: null,
        duration_hours: 14,
        max_participants: 10,
        price_per_person: 190,
        category: null,
        certification: null,
        prerequisites: null,
        classification: null,
        nsf_code: null,
        nsf_label: null,
        bpf_objective: null,
        bpf_funding_type: null,
        is_active: true,
        created_at: "2025-05-05T00:00:00Z",
        updated_at: "2025-05-05T00:00:00Z",
      },
      enrollments: [],
      program: mockProgram,
      formation_trainers: [],
      formation_convention_documents: [],
      formation_evaluation_assignments: [],
      formation_satisfaction_assignments: [],
      formation_elearning_assignments: [],
    } as unknown as Session;

    const context: ResolveContext = { session: mockSession, entity };
    const resolvedHtml = resolveDocumentVariables(PROGRAMME_FORMATION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(PROGRAMME_FORMATION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "programme_formation_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "programme_formation_mock",
        session_updated_at: new Date().toISOString(),
      },
      options: {
        format: "A4",
        margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: resolvedFooter,
      },
    });

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
      mock: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating mock programme") },
      { status: 500 },
    );
  }
}

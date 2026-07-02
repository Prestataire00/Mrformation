import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSystemTemplate } from "@/lib/templates/registry";
import {
  SECONDARY_DOC_TYPES,
  SECONDARY_TEMPLATE_CATEGORIES,
  isSecondaryDocType,
} from "@/lib/templates/secondary-categories";
import {
  insertDocs,
  getDocKeysForSession,
  deleteDocsByDocType,
} from "@/lib/services/documents-store";
import {
  listCustomTypes,
  isCustomDocType,
} from "@/lib/services/custom-secondary-doc-types";
import type { CustomSecondaryDocType } from "@/lib/types";

/**
 * POST /api/documents/attribute-secondary
 *
 * Story h-22 (Epic H) — code review fixes (2026-05-19).
 * Étendu (docs-secondaires-custom) : accepte aussi les types secondaires
 * CUSTOM actifs de l'entité (catalogue en base), résolus via `template_id`.
 *
 * Attribue 1..N documents secondaires à une session de formation.
 *
 * Mapping ownerType → rows DB (table unifiée `documents`) :
 * - "learner"  → 1 row par learner enrôlé
 * - "trainer"  → 1 row par trainer assigné
 * - "session"  → 1 row attaché à la première entreprise (owner_type='company').
 *   Skip si la session n'a aucune entreprise.
 *
 * Legacy : owner/template résolus via le registry système (getSystemTemplate).
 * Custom : owner/template/label résolus via la définition en base ; le type
 * custom est forcé non-signable (requires_signature=false) en v1 et porte le
 * template_id uploadé (contourne l'invariant registry).
 *
 * Idempotence : `documents_unique_source_owner` UNIQUE INDEX + `insertDocs()`.
 * Accès : admin + super_admin uniquement (RLS + filter entity_id en défense).
 */

const SECONDARY_DOC_TYPES_SET = new Set<string>(SECONDARY_DOC_TYPES);

const bodySchema = z.object({
  formationId: z.string().uuid(),
  // Types custom acceptés → validation stricte déléguée à la résolution
  // (legacy set ∪ catalogue custom actif de l'entité).
  docTypes: z.array(z.string().min(1)).min(1).max(50),
});

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  const { user, profile } = auth as {
    user: { id: string };
    profile: { entity_id: string; role: string };
  };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const { formationId, docTypes } = parsed.data;

  // Service client : on bypasse RLS pour faire les INSERT/SELECT côté serveur.
  // Tous les SELECTs filtrent explicitement par entity_id (défense en profondeur,
  // CLAUDE.md règle 2). Pattern aligné avec h-17 / signature-request-batch.
  let dbClient;
  try {
    dbClient = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Configuration serveur incomplète" },
      { status: 500 },
    );
  }

  try {
    // Vérifier que la session appartient bien à l'entité du user.
    const { data: session, error: sessionErr } = await dbClient
      .from("sessions")
      .select("id, entity_id")
      .eq("id", formationId)
      .eq("entity_id", profile.entity_id)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: "Session introuvable ou hors de votre entité" },
        { status: 404 },
      );
    }

    // Catalogue custom actif de l'entité (résolution owner/template/label).
    const customRes = await listCustomTypes(dbClient, profile.entity_id);
    if (!customRes.ok) throw new Error(customRes.error.message);
    const customByDocType = new Map<string, CustomSecondaryDocType>(
      customRes.types.map((t) => [t.doc_type, t]),
    );

    // Validation d'appartenance : chaque docType doit être legacy secondaire
    // OU un custom actif de l'entité. Sinon → rejet (défense).
    const invalidTypes = docTypes.filter(
      (d) => !SECONDARY_DOC_TYPES_SET.has(d) && !customByDocType.has(d),
    );
    if (invalidTypes.length > 0) {
      return NextResponse.json(
        { error: "Doc types inconnus ou hors de votre entité", invalidTypes },
        { status: 400 },
      );
    }

    // Charger learners/trainers/companies de la session.
    // `.range(0, 9999)` lève le cap Supabase 1000 rows pour grosses INTER.
    const [enrollmentsRes, trainersRes, companiesRes] = await Promise.all([
      dbClient
        .from("enrollments")
        .select("learner_id")
        .eq("session_id", formationId)
        .not("learner_id", "is", null)
        .range(0, 9999),
      dbClient
        .from("formation_trainers")
        .select("trainer_id")
        .eq("session_id", formationId)
        .not("trainer_id", "is", null)
        .range(0, 9999),
      dbClient
        .from("formation_companies")
        .select("client_id")
        .eq("session_id", formationId)
        .not("client_id", "is", null)
        .range(0, 9999),
    ]);

    if (enrollmentsRes.error) throw enrollmentsRes.error;
    if (trainersRes.error) throw trainersRes.error;
    if (companiesRes.error) throw companiesRes.error;

    const learnerIds = (enrollmentsRes.data ?? [])
      .map((e) => e.learner_id as string | null)
      .filter((id): id is string => !!id);
    const trainerIds = (trainersRes.data ?? [])
      .map((t) => t.trainer_id as string | null)
      .filter((id): id is string => !!id);
    const companyIds = (companiesRes.data ?? [])
      .map((c) => c.client_id as string | null)
      .filter((id): id is string => !!id);

    // Idempotence : rows existantes pour cette session, filtrées côté code.
    const existingKeysList = await getDocKeysForSession(dbClient, formationId);
    const existingKeys = new Set(
      existingKeysList
        .filter((d) => docTypes.includes(d.doc_type))
        .map((d) => `${d.doc_type}|${d.owner_type ?? ""}|${d.owner_id ?? ""}`),
    );

    const rowsToInsert: Array<{
      entity_id: string;
      session_id: string;
      doc_type: string;
      owner_type: "learner" | "company" | "trainer";
      owner_id: string;
      requires_signature: boolean;
      template_id: string | null;
      custom_label?: string;
    }> = [];

    const skippedByMissingOwner: string[] = [];

    for (const docType of docTypes) {
      // Résolution owner/template/label/signature selon legacy vs custom.
      let ownerKind: "learner" | "trainer" | "session" | "company";
      let templateId: string | null;
      let requiresSignature: boolean;
      let customLabel: string | undefined;

      const custom = customByDocType.get(docType);
      if (custom) {
        ownerKind = custom.owner_type; // learner | trainer | session
        templateId = custom.template_id;
        requiresSignature = false; // custom non-signable en v1
        customLabel = custom.label;
      } else {
        const tmpl = getSystemTemplate(docType);
        if (!tmpl) {
          // Invariant : SECONDARY_DOC_TYPES_SET ⊂ SYSTEM_TEMPLATES_BY_DOC_TYPE.
          console.error(
            `[attribute-secondary] invariant violated : ${docType} not in registry`,
          );
          skippedByMissingOwner.push(docType);
          continue;
        }
        ownerKind = tmpl.ownerType;
        templateId = null;
        requiresSignature = isSecondaryDocType(docType)
          ? !!SECONDARY_TEMPLATE_CATEGORIES[docType].signable
          : false;
        customLabel = undefined;
      }

      let owners: Array<{ type: "learner" | "company" | "trainer"; id: string }> = [];
      if (ownerKind === "learner") {
        owners = learnerIds.map((id) => ({ type: "learner" as const, id }));
      } else if (ownerKind === "trainer") {
        owners = trainerIds.map((id) => ({ type: "trainer" as const, id }));
      } else if (ownerKind === "session") {
        // 1 row par session, attaché à la première entreprise.
        if (companyIds.length > 0) {
          owners = [{ type: "company" as const, id: companyIds[0] }];
        }
      }
      // ownerKind === "company" (jamais pour les secondaires) → owners vide → skip.

      if (owners.length === 0) {
        skippedByMissingOwner.push(docType);
        continue;
      }

      for (const owner of owners) {
        const key = `${docType}|${owner.type}|${owner.id}`;
        if (existingKeys.has(key)) continue;
        rowsToInsert.push({
          entity_id: profile.entity_id,
          session_id: formationId,
          doc_type: docType,
          owner_type: owner.type,
          owner_id: owner.id,
          requires_signature: requiresSignature,
          template_id: templateId,
          ...(customLabel ? { custom_label: customLabel } : {}),
        });
      }
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        created: 0,
        skippedByMissingOwner,
        message:
          skippedByMissingOwner.length > 0
            ? "Aucun document attribué : pas d'owner trouvé (la session n'a pas de learners/trainers/clients pour ces docs)."
            : "Tous les documents demandés sont déjà attribués à cette session.",
      });
    }

    const { inserted } = await insertDocs(dbClient, rowsToInsert);

    logAudit({
      supabase: dbClient,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "documents",
      resourceId: formationId,
      details: {
        kind: "documents_secondaires_attribues",
        docTypes,
        rowsCreated: inserted,
        skippedByMissingOwner,
      },
    });

    return NextResponse.json({
      created: inserted,
      docTypes,
      skippedByMissingOwner,
    });
  } catch (err) {
    console.error("[attribute-secondary] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "attribute-secondary") },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/documents/attribute-secondary?formationId=…&docType=…
 *
 * Désattribution (CAP-1) : retire d'une session TOUTES les lignes `documents`
 * d'un type secondaire (tous destinataires), après confirmation côté UI.
 * Scopé entité + session ; le type peut être ré-attribué ensuite.
 *
 * Restreint aux types secondaires (legacy ou custom) pour ne jamais toucher un
 * document officiel (convention, etc.). Accès admin + super_admin.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  const { user, profile } = auth as {
    user: { id: string };
    profile: { entity_id: string; role: string };
  };

  const { searchParams } = new URL(request.url);
  const formationId = searchParams.get("formationId");
  const docType = searchParams.get("docType");

  if (!formationId || !docType) {
    return NextResponse.json(
      { error: "Les paramètres formationId et docType sont requis." },
      { status: 400 },
    );
  }

  // Garde : uniquement des types secondaires (legacy ou custom).
  if (!isSecondaryDocType(docType) && !isCustomDocType(docType)) {
    return NextResponse.json(
      { error: "Seuls les documents secondaires peuvent être désattribués." },
      { status: 400 },
    );
  }

  let dbClient;
  try {
    dbClient = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Configuration serveur incomplète" },
      { status: 500 },
    );
  }

  try {
    // Vérifier que la session appartient à l'entité du user.
    const { data: session, error: sessionErr } = await dbClient
      .from("sessions")
      .select("id, entity_id")
      .eq("id", formationId)
      .eq("entity_id", profile.entity_id)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: "Session introuvable ou hors de votre entité" },
        { status: 404 },
      );
    }

    const result = await deleteDocsByDocType(
      dbClient,
      profile.entity_id,
      formationId,
      docType,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: sanitizeError(new Error(result.error.message), "attribute-secondary DELETE") },
        { status: 500 },
      );
    }

    logAudit({
      supabase: dbClient,
      entityId: profile.entity_id,
      userId: user.id,
      action: "delete",
      resourceType: "documents",
      resourceId: formationId,
      details: {
        kind: "document_secondaire_desattribue",
        docType,
        deleted: result.deleted,
      },
    });

    return NextResponse.json({ deleted: result.deleted });
  } catch (err) {
    console.error("[attribute-secondary DELETE] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "attribute-secondary DELETE") },
      { status: 500 },
    );
  }
}

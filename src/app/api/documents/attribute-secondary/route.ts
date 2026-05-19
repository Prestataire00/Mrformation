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
} from "@/lib/templates/secondary-categories";

/**
 * POST /api/documents/attribute-secondary
 *
 * Story h-22 (Epic H).
 *
 * Attribue 1..N documents secondaires à une session de formation. Pour chaque
 * doc_type :
 * - ownerType "learner" → 1 row par learner enrôlé
 * - ownerType "trainer" → 1 row par trainer assigné
 * - ownerType "session" → 1 row par client de la formation (suivant le pattern
 *   STATIC_DOCS existant pour cgv/programme_formation/etc, où les docs session
 *   sont attachés à chaque company de la session). Si la session n'a pas de
 *   client, fallback sur 1 row company avec owner_id = first trainer ou skip.
 *
 * Idempotent : si une row (session_id, doc_type, owner_type, owner_id) existe
 * déjà, elle est skippée (pas d'erreur).
 *
 * Accès : admin + super_admin uniquement.
 */

const SECONDARY_DOC_TYPES_SET = new Set<string>(SECONDARY_DOC_TYPES);

const bodySchema = z.object({
  formationId: z.string().uuid(),
  docTypes: z.array(z.string()).min(1).max(50),
});

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

  // Validation : tous les doc_types doivent être des secondaires h-22.
  // Refuser explicitement les doc_types officiels (gérés via TabConventionDocs
  // initializeDefaultDocs) ou inconnus.
  const invalidTypes = docTypes.filter((d) => !SECONDARY_DOC_TYPES_SET.has(d));
  if (invalidTypes.length > 0) {
    return NextResponse.json(
      {
        error: "Doc types non secondaires ou inconnus",
        invalidTypes,
      },
      { status: 400 },
    );
  }

  // Service client : on bypasse RLS pour faire les INSERT côté serveur après
  // validation manuelle du role + entity_id (pattern h-17 / signature-request-batch).
  let dbClient;
  try {
    dbClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
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

    // Charger learners, trainers, companies de la session.
    const [enrollmentsRes, trainersRes, companiesRes, existingDocsRes] =
      await Promise.all([
        dbClient
          .from("enrollments")
          .select("learner_id")
          .eq("session_id", formationId)
          .not("learner_id", "is", null),
        dbClient
          .from("formation_trainers")
          .select("trainer_id")
          .eq("formation_id", formationId)
          .not("trainer_id", "is", null),
        dbClient
          .from("formation_companies")
          .select("client_id")
          .eq("formation_id", formationId)
          .not("client_id", "is", null),
        dbClient
          .from("formation_convention_documents")
          .select("doc_type, owner_type, owner_id")
          .eq("session_id", formationId)
          .in("doc_type", docTypes),
      ]);

    if (enrollmentsRes.error) throw enrollmentsRes.error;
    if (trainersRes.error) throw trainersRes.error;
    if (companiesRes.error) throw companiesRes.error;
    if (existingDocsRes.error) throw existingDocsRes.error;

    const learnerIds = (enrollmentsRes.data ?? [])
      .map((e) => e.learner_id as string | null)
      .filter((id): id is string => !!id);
    const trainerIds = (trainersRes.data ?? [])
      .map((t) => t.trainer_id as string | null)
      .filter((id): id is string => !!id);
    const companyIds = (companiesRes.data ?? [])
      .map((c) => c.client_id as string | null)
      .filter((id): id is string => !!id);

    // Index des rows existantes pour idempotence
    const existingKeys = new Set(
      (existingDocsRes.data ?? []).map(
        (d) => `${d.doc_type}|${d.owner_type}|${d.owner_id}`,
      ),
    );

    const rowsToInsert: Array<{
      entity_id: string;
      session_id: string;
      doc_type: string;
      owner_type: "learner" | "company" | "trainer";
      owner_id: string;
      requires_signature: boolean;
      template_id: null;
    }> = [];

    const skippedByMissingOwner: string[] = [];

    for (const docType of docTypes) {
      const tmpl = getSystemTemplate(docType);
      if (!tmpl) {
        // Ne devrait jamais arriver (validation SECONDARY_DOC_TYPES_SET ci-dessus).
        continue;
      }
      const requiresSignature = !!SECONDARY_TEMPLATE_CATEGORIES[
        docType as keyof typeof SECONDARY_TEMPLATE_CATEGORIES
      ]?.signable;

      // Mapper le ownerType du registry vers les owners DB :
      // - learner / trainer : direct
      // - session : attaché à chaque company (pattern STATIC_DOCS existant)
      let owners: Array<{ type: "learner" | "company" | "trainer"; id: string }> = [];
      if (tmpl.ownerType === "learner") {
        owners = learnerIds.map((id) => ({ type: "learner" as const, id }));
      } else if (tmpl.ownerType === "trainer") {
        owners = trainerIds.map((id) => ({ type: "trainer" as const, id }));
      } else if (tmpl.ownerType === "session") {
        // Pas de 4e valeur "session" dans owner_type CHECK → on attache à company.
        // Si la session n'a pas de company (rare), on attache au premier trainer.
        if (companyIds.length > 0) {
          owners = companyIds.map((id) => ({ type: "company" as const, id }));
        } else if (trainerIds.length > 0) {
          owners = [{ type: "trainer", id: trainerIds[0] }];
        }
      }

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
          template_id: null,
        });
      }
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        created: 0,
        skippedByMissingOwner,
        message:
          skippedByMissingOwner.length > 0
            ? "Aucun document attribué : pas de owner trouvé (la session n'a pas de learners/trainers/clients pour ces docs)."
            : "Tous les documents demandés sont déjà attribués à cette session.",
      });
    }

    const { error: insertErr } = await dbClient
      .from("formation_convention_documents")
      .insert(rowsToInsert);

    if (insertErr) throw insertErr;

    // Audit log (fire-and-forget)
    logAudit({
      supabase: dbClient,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "formation_convention_documents",
      resourceId: formationId,
      details: {
        kind: "documents_secondaires_attribues",
        docTypes,
        rowsCreated: rowsToInsert.length,
        skippedByMissingOwner,
      },
    });

    return NextResponse.json({
      created: rowsToInsert.length,
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

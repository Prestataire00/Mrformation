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
import { insertDocs, getDocKeysForSession } from "@/lib/services/documents-store";

/**
 * POST /api/documents/attribute-secondary
 *
 * Story h-22 (Epic H) — code review fixes (2026-05-19).
 *
 * Attribue 1..N documents secondaires à une session de formation.
 *
 * Mapping ownerType registry → rows DB (table unifiée `documents`) :
 * - "learner"  → 1 row par learner enrôlé
 * - "trainer"  → 1 row par trainer assigné
 * - "session"  → 1 row attaché à la première entreprise (owner_type='company',
 *   owner_id=firstCompanyId). Sémantique : ces docs (bilan_poe, reponses_*,
 *   resultats_*) sont des synthèses uniques par session, pas par participant.
 *   On évite la fan-out par company pour ne pas dupliquer le PDF.
 *   Skip si la session n'a aucune entreprise.
 *   TODO v2 : promouvoir owner_type='session' quand `ConventionOwnerType`
 *   (legacy UI shape) sera étendue dans une story dédiée.
 *
 * Idempotence : déléguée à `documents_unique_source_owner` UNIQUE INDEX +
 * `insertDocs()` qui ignore les doublons (PG 23505) et renvoie le nombre
 * réel de lignes créées via `{ inserted }` — c'est ce compte exact, et non
 * `rowsToInsert.length`, qui est renvoyé dans `created`.
 *
 * Accès : admin + super_admin uniquement (RLS + filter entity_id en défense).
 */

const SECONDARY_DOC_TYPES_SET = new Set<string>(SECONDARY_DOC_TYPES);

const bodySchema = z.object({
  formationId: z.string().uuid(),
  docTypes: z.array(z.enum(SECONDARY_DOC_TYPES)).min(1).max(50),
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

  // Sanity check : SECONDARY_DOC_TYPES_SET utilisé en défense (z.enum déjà strict).
  const invalidTypes = docTypes.filter((d) => !SECONDARY_DOC_TYPES_SET.has(d));
  if (invalidTypes.length > 0) {
    return NextResponse.json(
      { error: "Doc types non secondaires", invalidTypes },
      { status: 400 },
    );
  }

  // Service client : on bypasse RLS pour faire les INSERT/SELECT côté serveur.
  // Tous les SELECTs filtrent explicitement par entity_id (défense en profondeur,
  // CLAUDE.md règle 2). Pattern aligné avec h-17 / signature-request-batch.
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

    // Charger learners/trainers/companies de la session.
    // Sécurité multi-tenant : la session a déjà été vérifiée comme
    // appartenant à profile.entity_id ci-dessus ; ses enrollments /
    // formation_trainers / formation_companies en découlent par FK.
    // ⚠️ Ces 3 tables de liaison n'ont PAS de colonne entity_id, et leur
    // clé de session est `session_id` (pas `formation_id`).
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

    // Idempotence : on lit les rows existantes dans la table unifiée `documents`
    // pour cette session, puis on filtre côté code. `insertDocs` swallow aussi
    // les conflits 23505 (UNIQUE INDEX) en deuxième défense anti-concurrence.
    const existingKeysList = await getDocKeysForSession(dbClient, formationId);
    const existingKeys = new Set(
      existingKeysList
        .filter((d) => docTypes.includes(d.doc_type as typeof docTypes[number]))
        .map((d) => `${d.doc_type}|${d.owner_type ?? ""}|${d.owner_id ?? ""}`),
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
        // Invariant : SECONDARY_DOC_TYPES_SET ⊂ SYSTEM_TEMPLATES_BY_DOC_TYPE.
        // Si on arrive ici, c'est qu'un nouveau type a été ajouté à
        // secondary-categories.ts sans entry dans registry.ts.
        console.error(
          `[attribute-secondary] invariant violated : ${docType} not in registry`,
        );
        skippedByMissingOwner.push(docType);
        continue;
      }
      const requiresSignature = !!SECONDARY_TEMPLATE_CATEGORIES[docType].signable;

      let owners: Array<{ type: "learner" | "company" | "trainer"; id: string }> = [];
      if (tmpl.ownerType === "learner") {
        owners = learnerIds.map((id) => ({ type: "learner" as const, id }));
      } else if (tmpl.ownerType === "trainer") {
        owners = trainerIds.map((id) => ({ type: "trainer" as const, id }));
      } else if (tmpl.ownerType === "session") {
        // D1 résolu en code review 2026-05-19 : 1 row par session, attaché à
        // la première entreprise. Pas de duplication par company ni de
        // fallback trainer (semantique trompeuse).
        if (companyIds.length > 0) {
          owners = [{ type: "company" as const, id: companyIds[0] }];
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
            ? "Aucun document attribué : pas d'owner trouvé (la session n'a pas de learners/trainers/clients pour ces docs)."
            : "Tous les documents demandés sont déjà attribués à cette session.",
      });
    }

    // INSERT via documents-store (table unifiée `documents`, source de vérité
    // depuis Epic B / PR #105). Idempotent via UNIQUE INDEX
    // `documents_unique_source_owner`. `inserted` = compte réel (gère le cas
    // d'une attribution concurrente où une ligne aurait été créée entre le
    // SELECT existingKeys ci-dessus et cet INSERT).
    const { inserted } = await insertDocs(dbClient, rowsToInsert);

    // Audit log — sync void avec error-handling interne (cf src/lib/audit-log.ts).
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

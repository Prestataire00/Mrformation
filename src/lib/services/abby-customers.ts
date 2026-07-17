import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeDbError } from "@/lib/api-error";
import {
  searchOrganizations,
  type createAbbyClient,
} from "@/lib/abby/client";
import type {
  AbbyCustomerResolution,
  AbbyRecipientData,
  AbbyRecipientRef,
} from "@/lib/types/abby";

// Résolution des clients facturés (Epic 2 — FR-5/FR-6, AD-10).
// `resolveRecipient` est PUR EN ÉCRITURE : consommé par la préview (3.2,
// read-only) et par la saga (3.3, qui seule persiste via persistCustomerLink).

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

type AbbyClient = ReturnType<typeof createAbbyClient>;

/** SIRET normalisé (chiffres seuls) — les imports Sellsy/LORIS bypassent Zod. */
function normalizeSiret(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

const ERR_NON_RATTACHEE =
  "Fiche destinataire non rattachée (facture importée ?) — rattacher un destinataire avant le push";
const ERR_AUTRE_ENTITE = "Destinataire introuvable dans cette entité";

/**
 * Lit et normalise le destinataire polymorphe d'une facture.
 * ⚠️ `financier` → `formation_financiers` (PAS `financeurs`) : table sans
 * entity_id (isolation via la session), sans SIRET, email via la FK financeur_id.
 * « Fiche non rattachée » est un cas NOMINAL (imports LORIS : recipient_id
 * aléatoires) — distinct de l'erreur d'isolation.
 */
export async function readRecipient(
  supabase: SupabaseClient,
  entityId: string,
  recipientType: AbbyRecipientRef["type"],
  recipientId: string
): Promise<ServiceResult<{ recipient: AbbyRecipientData }>> {
  if (recipientType === "company") {
    const { data, error } = await supabase
      .from("clients")
      .select("entity_id, company_name, siret, address, postal_code, city")
      .eq("id", recipientId)
      .maybeSingle();
    if (error) {
      return { ok: false, error: { message: sanitizeDbError(error, "abby readRecipient clients") } };
    }
    if (!data) return { ok: false, error: { message: ERR_NON_RATTACHEE } };
    const row = data as {
      entity_id: string;
      company_name: string;
      siret: string | null;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    };
    if (row.entity_id !== entityId) {
      return { ok: false, error: { message: ERR_AUTRE_ENTITE } };
    }
    return {
      ok: true,
      recipient: {
        kind: "organization",
        name: row.company_name,
        siret: normalizeSiret(row.siret),
        email: null, // clients n'a pas de colonne email — tranché en 2.2
        address: row.address,
        postalCode: row.postal_code,
        city: row.city,
      },
    };
  }

  if (recipientType === "learner") {
    const { data, error } = await supabase
      .from("learners")
      .select("entity_id, first_name, last_name, email")
      .eq("id", recipientId)
      .maybeSingle();
    if (error) {
      return { ok: false, error: { message: sanitizeDbError(error, "abby readRecipient learners") } };
    }
    if (!data) return { ok: false, error: { message: ERR_NON_RATTACHEE } };
    const row = data as {
      entity_id: string;
      first_name: string;
      last_name: string;
      email: string | null;
    };
    if (row.entity_id !== entityId) {
      return { ok: false, error: { message: ERR_AUTRE_ENTITE } };
    }
    return {
      ok: true,
      recipient: {
        kind: "contact",
        name: `${row.first_name} ${row.last_name}`.trim(),
        siret: null,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
      },
    };
  }

  // financier → formation_financiers (isolation via la session de la ligne)
  const { data, error } = await supabase
    .from("formation_financiers")
    .select("name, type, financeur:financeurs(email), session:sessions!inner(entity_id)")
    .eq("id", recipientId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby readRecipient financiers") },
    };
  }
  if (!data) return { ok: false, error: { message: ERR_NON_RATTACHEE } };
  // Cast via unknown : supabase-js (sans types de schéma) infère les
  // jointures en tableaux, mais PostgREST retourne un OBJET pour une FK
  // many-to-one (financeur_id, session_id) — shape vérifié au runtime
  const row = data as unknown as {
    name: string;
    type: string | null;
    financeur: { email: string | null } | null;
    session: { entity_id: string } | null;
  };
  if (row.session?.entity_id !== entityId) {
    return { ok: false, error: { message: ERR_AUTRE_ENTITE } };
  }
  return {
    ok: true,
    recipient: {
      kind: "organization",
      name: row.name,
      siret: null, // pas de SIRET financeur dans le LMS
      email: row.financeur?.email ?? null,
    },
  };
}

/**
 * Résout un destinataire vers un client Abby, en trois issues :
 * `linked` (liaison persistée TOUJOURS réutilisée — FR-5), `auto_linkable`
 * (organization Abby au SIRET exactement identique — FR-6, NON persisté ici),
 * `to_create` (tout le reste, y compris match sur nom seul — décision FR-6).
 *
 * Dérogation AD-10 assumée (spine amendé 17/07) : la recherche Abby n'est
 * lancée QUE si un critère d'auto-liaison existe (organization avec SIRET
 * LMS) — chercher contacts/sans-SIRET serait du code mort.
 */
export async function resolveRecipient(
  supabase: SupabaseClient,
  abbyClient: AbbyClient,
  entityId: string,
  ref: AbbyRecipientRef
): Promise<ServiceResult<{ resolution: AbbyCustomerResolution }>> {
  const { data: link, error: linkError } = await supabase
    .from("abby_customer_links")
    .select("abby_customer_id, abby_customer_type")
    .eq("entity_id", entityId)
    .eq("recipient_type", ref.type)
    .eq("recipient_id", ref.id)
    .maybeSingle();
  if (linkError) {
    return {
      ok: false,
      error: { message: sanitizeDbError(linkError, "abby resolve link") },
    };
  }
  if (link) {
    const row = link as {
      abby_customer_id: string;
      abby_customer_type: "contact" | "organization";
    };
    return {
      ok: true,
      resolution: {
        outcome: "linked",
        abbyCustomerId: row.abby_customer_id,
        abbyCustomerType: row.abby_customer_type,
      },
    };
  }

  const read = await readRecipient(supabase, entityId, ref.type, ref.id);
  if (!read.ok) return read;
  const recipient = read.recipient;

  if (recipient.kind === "organization" && recipient.siret) {
    const candidates = await searchOrganizations(abbyClient, recipient.name);
    const match = candidates.find(
      (c) => normalizeSiret(c.siret) === recipient.siret
    );
    if (match) {
      return {
        ok: true,
        resolution: {
          outcome: "auto_linkable",
          abbyCustomerId: match.id,
          abbyCustomerType: "organization",
        },
      };
    }
  }

  return { ok: true, resolution: { outcome: "to_create", recipient } };
}

/**
 * Persiste la liaison destinataire ↔ client Abby.
 * ⚠️ UNIQUE ÉCRIVAIN : l'étape 1 de la saga (AD-10) — JAMAIS la préview
 * (AD-21 : read-only côté Abby ET côté base).
 */
export async function persistCustomerLink(
  supabase: SupabaseClient,
  entityId: string,
  ref: AbbyRecipientRef,
  abbyCustomerId: string,
  abbyCustomerType: "contact" | "organization"
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase.from("abby_customer_links").upsert(
    {
      entity_id: entityId,
      recipient_type: ref.type,
      recipient_id: ref.id,
      abby_customer_id: abbyCustomerId,
      abby_customer_type: abbyCustomerType,
    },
    { onConflict: "entity_id,recipient_type,recipient_id" }
  );
  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby persist link") },
    };
  }
  return { ok: true };
}

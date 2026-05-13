import type { Session, Enrollment, FormationCompany, FormationConventionDocument } from "@/lib/types";

/**
 * Helpers multi-entreprises pour la convention de formation (PR 13).
 *
 * Distinction INTRA / INTER :
 *  - INTRA : 1 seule entreprise, tous les apprenants lui sont rattachés (auto-assign virtuel,
 *    même si enrollments.client_id est null pour des données legacy).
 *  - INTER : N entreprises, filtrage strict par enrollments.client_id.
 *
 * Pièce critique : 1 convention par entreprise, avec apprenants filtrés et montant spécifique
 * (formation_companies.amount), pas le total session.
 */

export function getCompaniesForFormation(formation: Session): FormationCompany[] {
  const list = formation.formation_companies ?? [];
  return [...list].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
}

export function isIntraFormation(formation: Session): boolean {
  return getCompaniesForFormation(formation).length === 1;
}

export type FormationKind = "intra" | "inter" | "unset";

/**
 * Détermine le type d'une formation à partir du nombre d'entreprises rattachées.
 * - 0 entreprises → "unset" (formation incomplète, pas de badge à afficher).
 * - 1 entreprise  → "intra" (mono-client).
 * - 2+ entreprises → "inter" (multi-clients).
 *
 * Source de vérité canonique pour le badge INTRA/INTER (cf. Story 3.1).
 * Le champ legacy `sessions.type` n'est plus utilisé pour cette détection.
 */
export function getFormationKind(formation: Session): FormationKind {
  const count = getCompaniesForFormation(formation).length;
  if (count === 0) return "unset";
  if (count === 1) return "intra";
  return "inter";
}

export function getLearnersForCompany(formation: Session, companyId: string): Enrollment[] {
  const enrollments = formation.enrollments ?? [];
  if (isIntraFormation(formation)) {
    return enrollments;
  }
  return enrollments.filter((e) => e.client_id === companyId);
}

export function getAmountForCompany(formation: Session, companyId: string): number | null {
  const fc = getCompaniesForFormation(formation).find((c) => c.client_id === companyId);
  if (!fc) return null;
  if (fc.amount === null || fc.amount === undefined) return null;
  if (fc.amount === 0) return null;
  return fc.amount;
}

export type CompanyExportValidation = { ok: true } | { ok: false; reason: string };

export function validateCompanyExport(formation: Session, companyId: string): CompanyExportValidation {
  const companies = getCompaniesForFormation(formation);
  const fc = companies.find((c) => c.client_id === companyId);
  if (!fc) {
    return { ok: false, reason: "Entreprise inconnue pour cette formation" };
  }

  // En INTER : tous les apprenants doivent avoir un client_id renseigné
  if (!isIntraFormation(formation)) {
    const enrollments = formation.enrollments ?? [];
    const orphans = enrollments.filter((e) => !e.client_id);
    if (orphans.length > 0) {
      return {
        ok: false,
        reason: `${orphans.length} apprenant(s) sans entreprise rattachée — complétez le rattachement avant l'export`,
      };
    }
  }

  // Le montant pour cette entreprise doit être défini (NULL/0 considéré comme manquant)
  if (getAmountForCompany(formation, companyId) === null) {
    return {
      ok: false,
      reason: "Le montant pour cette entreprise n'est pas défini — saisissez-le dans l'onglet Finances",
    };
  }

  return { ok: true };
}

export type ReconciliationStatus = "ok" | "shortfall" | "overshoot" | "no-target";

export interface ReconciliationResult {
  sum: number;          // somme des formation_companies.amount (0 si aucune valeur)
  target: number | null; // formation.total_price, null si non défini
  delta: number;         // sum - target ; 0 si target null
  status: ReconciliationStatus;
}

/**
 * Calcule l'état de réconciliation entre la somme des montants par entreprise
 * (formation_companies.amount) et le prix total de la session (sessions.total_price).
 *
 * - "no-target" : total_price non défini → pas de réconciliation possible.
 * - "ok" : sum === target (tolérance 0.01 pour éviter les false positives float).
 * - "shortfall" : sum < target → reste à attribuer.
 * - "overshoot" : sum > target → dépassement.
 *
 * Tolérance float : la comparaison utilise |delta| < 0.01.
 */
export function computeAmountsReconciliation(formation: Session): ReconciliationResult {
  const companies = getCompaniesForFormation(formation);
  const sum = companies.reduce((acc, fc) => acc + (fc.amount ?? 0), 0);
  const target = formation.total_price ?? null;

  if (target === null) {
    return { sum, target: null, delta: 0, status: "no-target" };
  }

  const delta = sum - target;
  if (Math.abs(delta) < 0.01) {
    return { sum, target, delta, status: "ok" };
  }
  if (delta < 0) {
    return { sum, target, delta, status: "shortfall" };
  }
  return { sum, target, delta, status: "overshoot" };
}

/**
 * Détermine les apprenants AJOUTÉS à une entreprise APRÈS la confirmation d'une convention figée.
 * Ces apprenants ne sont pas couverts par la convention figée et nécessitent un avenant (Story 3.5).
 *
 * Retourne [] si :
 * - Le doc n'est pas de type owner_type "company" (n'a pas de notion d'apprenants couverts).
 * - Le doc n'est pas confirmed/figé (apprenants sont implicitement re-inclus à chaque export).
 * - confirmed_at n'est pas défini (impossible de comparer dates).
 *
 * Sinon, retourne les enrollments de l'entreprise (owner_id) dont enrolled_at > confirmed_at.
 */
export function findUncoveredLearners(
  formation: Session,
  doc: Pick<FormationConventionDocument, "owner_type" | "owner_id" | "is_confirmed" | "confirmed_at">
): Enrollment[] {
  if (doc.owner_type !== "company") return [];
  if (!doc.is_confirmed || !doc.confirmed_at) return [];

  const confirmedAt = new Date(doc.confirmed_at).getTime();
  const learners = getLearnersForCompany(formation, doc.owner_id);
  return learners.filter((e) => {
    if (!e.enrolled_at) return false;
    return new Date(e.enrolled_at).getTime() > confirmedAt;
  });
}

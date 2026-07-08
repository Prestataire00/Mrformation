/**
 * Décision de visibilité d'un questionnaire dans le portail APPRENANT.
 *
 * Contexte : la table `questionnaire_sessions` (que lit le portail apprenant)
 * est alimentée par un trigger SQL qui mirrore TOUTE attribution
 * (`formation_evaluation_assignments` / `formation_satisfaction_assignments`),
 * SANS distinction de cible. Or le bilan formateur (destiné au FORMATEUR) et les
 * questionnaires entreprise/manager/financeur ne doivent JAMAIS s'afficher à
 * l'apprenant. On les exclut ici à la lecture.
 *
 * Choix produit : côté apprenant, TOUS les questionnaires qui le concernent sont
 * visibles d'emblée (pré, post, satisfaction) — pas de temporisation. Seule la
 * cible filtre (formateur/entreprise exclus).
 *
 * On décide à partir du `quality_indicator_type` du questionnaire lui-même
 * (lu depuis `questionnaires`, que l'apprenant lit déjà pour le titre) — et NON
 * des tables d'assignment, dont la RLS côté apprenant est incertaine (un filtre
 * qui échouerait à lire ferait « fuiter » le questionnaire formateur).
 */

/** Indicateurs qualité destinés à un NON-apprenant (formateur, entreprise, etc.). */
const NON_LEARNER_INDICATORS = new Set<string>([
  "quest_formateurs",
  "quest_entreprises",
  "quest_managers",
  "quest_financeurs",
]);

/**
 * Vrai si le questionnaire doit être visible pour l'apprenant.
 *
 * @param qualityIndicatorType `quality_indicator_type` du questionnaire
 *        (null/legacy → visible, comportement historique préservé).
 */
export function isLearnerQuestionnaireVisible(
  qualityIndicatorType: string | null | undefined,
): boolean {
  // Legacy / non typé → visible comme avant.
  if (!qualityIndicatorType) return true;
  // Destiné au formateur / à l'entreprise → jamais visible pour l'apprenant.
  return !NON_LEARNER_INDICATORS.has(qualityIndicatorType);
}

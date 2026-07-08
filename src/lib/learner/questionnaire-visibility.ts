/**
 * Décision de visibilité d'un questionnaire dans le portail APPRENANT.
 *
 * Contexte : la table `questionnaire_sessions` (que lit le portail apprenant)
 * est alimentée par un trigger SQL qui mirrore TOUTE attribution
 * (`formation_evaluation_assignments` / `formation_satisfaction_assignments`),
 * SANS distinction de cible ni de moment. Or :
 *   - le bilan formateur (destiné au FORMATEUR) et les questionnaires entreprise
 *     ne doivent JAMAIS s'afficher à l'apprenant ;
 *   - les questionnaires « fin de formation » (auto-éval post, satisfaction)
 *     ne doivent apparaître qu'une fois la session terminée — sinon l'apprenant
 *     répondrait à la satisfaction dès le premier jour.
 *
 * On décide à partir du `quality_indicator_type` du questionnaire lui-même
 * (lu depuis la table `questionnaires`, que l'apprenant lit déjà pour le titre)
 * — et NON des tables d'assignment, dont la RLS côté apprenant est incertaine
 * (un filtre qui échouerait à lire ferait « fuiter » le questionnaire formateur).
 */

/** Indicateurs qualité destinés à un NON-apprenant (formateur, entreprise, etc.). */
const NON_LEARNER_INDICATORS = new Set<string>([
  "quest_formateurs",
  "quest_entreprises",
  "quest_managers",
  "quest_financeurs",
]);

/** Indicateurs « fin de formation » : visibles seulement une fois la session terminée. */
const AFTER_INDICATORS = new Set<string>([
  "auto_eval_post",
  "satisfaction_chaud",
  "satisfaction_froid",
]);

/**
 * Vrai si le questionnaire doit être visible pour l'apprenant.
 *
 * @param qualityIndicatorType  `quality_indicator_type` du questionnaire
 *        (peut être null/legacy → visible, comportement historique préservé).
 * @param sessionEnded  Vrai si la session est terminée (statut completed OU
 *        end_date passée) — porte d'ouverture des questionnaires « fin ».
 */
export function isLearnerQuestionnaireVisible(
  qualityIndicatorType: string | null | undefined,
  sessionEnded: boolean,
): boolean {
  // Legacy / non typé → visible comme avant.
  if (!qualityIndicatorType) return true;
  // Destiné au formateur / à l'entreprise → jamais visible pour l'apprenant.
  if (NON_LEARNER_INDICATORS.has(qualityIndicatorType)) return false;
  // « Fin de formation » → visible seulement une fois la session terminée.
  if (AFTER_INDICATORS.has(qualityIndicatorType)) return sessionEnded;
  // Pré (auto_eval_pre), pendant (eval_pendant), autres → visible.
  return true;
}

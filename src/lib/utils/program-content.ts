/**
 * Helper de routage template v2 / legacy pour le PDF Programme de formation.
 *
 * Lot A2 — Le PDF au format des 2 exemples client (template v2) ne s'applique
 * qu'aux programmes dont le `content` JSONB porte la structure enrichie livrée
 * par A1 (objectifs généraux racine et/ou séquences avec objectifs
 * opérationnels / contenus détaillés). Les programmes legacy restent rendus par
 * le template `programme-formation.ts` (aucune régression).
 *
 * Partagé par les routes `generate-programme` et `generate-program-preview`.
 */

function isNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * Vrai si `content` porte au moins un marqueur de la structure enrichie A1 :
 *  - `general_objectives` (array non vide) à la racine, OU
 *  - au moins un module avec `operational_objectives` ou `content_details`
 *    (array non vide).
 *
 * Sert à choisir le template v2 vs legacy avant résolution des variables.
 */
export function isEnrichedProgramContent(content: unknown): boolean {
  if (content === null || typeof content !== "object") return false;
  const c = content as Record<string, unknown>;

  if (isNonEmptyStringArray(c.general_objectives)) return true;

  const modules = c.modules;
  if (!Array.isArray(modules)) return false;

  return modules.some((m) => {
    if (m === null || typeof m !== "object") return false;
    const mod = m as Record<string, unknown>;
    return (
      isNonEmptyStringArray(mod.operational_objectives) ||
      isNonEmptyStringArray(mod.content_details)
    );
  });
}

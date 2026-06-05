/**
 * Feature flags du chantier Pédagogie V2 (cf. spec
 * bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md).
 *
 * Convention : 1 flag par epic, dépendances explicites entre flags.
 * Le code doit checker `isPedagogieV2EpicNEnabled()` à chaque point de
 * branchement du nouveau comportement, et faire un fallback explicite
 * vers l'ancien comportement quand le flag est OFF.
 *
 * Stockage : variables d'env Netlify (process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_<N>).
 *
 * ⚠ Préfixe `NEXT_PUBLIC_` obligatoire : ces flags doivent être lisibles
 * dans les Client Components Next.js (le hub /admin/elearning est marqué
 * "use client"). Sans NEXT_PUBLIC_, la variable n'est pas injectée dans
 * le bundle client et `process.env[name]` est `undefined` au runtime.
 * Le flag n'est pas un secret (boolean fonctionnel), l'exposition dans
 * le bundle client est acceptée.
 *
 * Acceptée comme TRUE uniquement la valeur littérale "true" (strict, pour
 * éviter les confusions "1", "yes", etc.).
 */

function flagOn(name: string): boolean {
  return process.env[name] === "true";
}

/**
 * Helper inverse de `flagOn` : retourne TRUE par défaut (var non définie ou
 * autre valeur que "false"), seulement FALSE si explicitement `"false"`.
 *
 * Utilisé pour les flags Pédagogie V2 Epic 1-5 qui ont été validés en prod
 * le 04/06/2026 (cf. commit 0b2ef45 "Epic 1-3 confirmés fonctionnels en prod").
 * Le rollout progressif via flag opt-in n'a plus de valeur à ce stade, et
 * un oubli côté env vars Netlify cause une fausse régression visible (cf.
 * incident du 05/06 — bouton "Nouveau cours" réapparu en prod alors que le
 * code était inchangé). On garde l'opt-OUT au cas où un rollback express
 * serait nécessaire (NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_N=false).
 */
function flagOnByDefault(name: string): boolean {
  return process.env[name] !== "false";
}

/**
 * Epic 1 — Fondations data : nouvelles tables session_elearning_courses
 * et program_elearning_courses actives, suppression du chemin UI legacy
 * "Nouveau cours" du hub (programs.content.type='elearning').
 *
 * ⚠ Par défaut ON depuis 06/2026 (validé prod). Opt-out via env var =false.
 */
export function isPedagogieV2Epic1Enabled(): boolean {
  return flagOnByDefault("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1");
}

/**
 * Epic 2 — Pipeline d'inscription enrichi : snapshot programme → session
 * (copy program_elearning_courses → session_elearning_courses à la création
 * de session) + auto-enrôlement des apprenants aux e-learning de la session.
 *
 * ⚠ Par défaut ON depuis 06/2026 (validé prod). Opt-out via env var =false.
 */
export function isPedagogieV2Epic2Enabled(): boolean {
  return flagOnByDefault("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2");
}

/**
 * Epic 3 — UX admin : section "E-learning par défaut" sur la fiche programme
 * + (futur Epic 3.5) onglet E-learning attaché sur la fiche session + UI opt-out.
 *
 * ⚠ Par défaut ON depuis 06/2026 (validé prod). Opt-out via env var =false.
 */
export function isPedagogieV2Epic3Enabled(): boolean {
  return flagOnByDefault("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_3");
}

/**
 * Epic 4 — UX apprenant : sur la page /learner/my-trainings, affiche les
 * modules e-learning attachés à chaque session (via session_elearning_courses)
 * avec leur état d'avancement (via elearning_enrollments) et lien direct
 * vers la page /learner/courses/[id].
 *
 * ⚠ Par défaut ON depuis 06/2026 (validé prod). Opt-out via env var =false.
 */
export function isPedagogieV2Epic4Enabled(): boolean {
  return flagOnByDefault("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_4");
}

/**
 * Epic 5 — Visibilité multi-acteurs : matrice apprenant × module e-learning
 * affichant l'avancement de la cohorte d'une session. Visible côté formateur
 * (/trainer/sessions) et admin (fiche formation, future intégration).
 *
 * ⚠ Par défaut ON depuis 06/2026 (validé prod). Opt-out via env var =false.
 */
export function isPedagogieV2Epic5Enabled(): boolean {
  return flagOnByDefault("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_5");
}

/**
 * Epic 2.5 — Auth apprenant sans email + PDF identifiants.
 *
 * Permet : (a) la résolution username → email (route POST /api/auth/resolve-username),
 * (b) le bulk import d'apprenants sans email avec génération d'un PDF de
 * credentials, (c) le forçage du changement de mot de passe à la 1re connexion,
 * (d) la régénération de credentials par l'admin.
 *
 * Pré-requis activation : migrations Phase A + B + audit_event_types
 * exécutées en prod.
 */
export function isPedagogieV2Epic25Enabled(): boolean {
  return flagOn("NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2_5");
}

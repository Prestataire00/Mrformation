export type Role = "super_admin" | "admin" | "commercial" | "trainer" | "client" | "learner";

/**
 * h-17 (Epic H) : helper centralisé pour autoriser l'accès au CRM.
 *
 * 4 cas autorisés :
 *  - super_admin / admin : toujours OK (admin produit)
 *  - commercial          : toujours OK (rôle métier dédié CRM)
 *  - trainer + has_crm_access=true : OK (trainer ayant accès CRM en
 *    parallèle de son rôle pédagogique, scope sales reps via les
 *    policies `crm-access.sql` qui filtrent par assigned_to/created_by)
 *
 * À utiliser dans toutes les routes API CRM ouvertes à commercial+trainer
 * (prospects, quotes, tags) en remplacement des checks dupliqués
 * `if (!["admin","super_admin"].includes(profile.role) && !profile.has_crm_access)`.
 *
 * Note : les routes admin-only (suivi, automations, notifications)
 * gardent leur check direct sur ["admin","super_admin"] et N'utilisent
 * PAS ce helper.
 */
export function isCrmAuthorized(profile: { role: Role | string; has_crm_access?: boolean | null }): boolean {
  if (profile.role === "super_admin" || profile.role === "admin" || profile.role === "commercial") {
    return true;
  }
  if (profile.role === "trainer" && profile.has_crm_access === true) {
    return true;
  }
  return false;
}

/**
 * Règles de pages UI — premier match gagne, du plus spécifique au plus large.
 * Utilise Array (ordre garanti) plutôt que Record.
 */
export const PAGE_PERMISSIONS: Array<[string, Role[]]> = [
  // Exception dans /admin : les trainers peuvent accéder à la signature
  ["/admin/signatures", ["super_admin", "admin", "trainer"]],
  // CRM : accessible par super_admin, admin et commercial
  ["/admin/crm",        ["super_admin", "admin", "commercial"]],
  // Users management : super_admin et admin (restrictions fines dans le composant)
  ["/admin/users",      ["super_admin", "admin"]],
  // Reste du /admin : super_admin et admin uniquement
  ["/admin",            ["super_admin", "admin"]],
  // Portails utilisateurs
  ["/trainer",          ["super_admin", "admin", "trainer"]],
  ["/client",           ["super_admin", "admin", "client"]],
  ["/learner",          ["super_admin", "admin", "learner"]],
];

/**
 * Règles API — premier match gagne, du plus spécifique au plus large.
 *
 * Note : certaines sous-routes /api/elearning/* réservées à l'admin
 * (publish, generate, gamma…) contiennent des segments dynamiques
 * ([courseId]) qui ne peuvent pas être matchés par un simple préfixe.
 * Ces routes sont protégées par leur propre requireRole(["admin"]) dans le handler.
 */
export const API_PERMISSIONS: Array<[string, Role[]]> = [
  // ── Admin uniquement ───────────────────────────────────────────────────────
  ["/api/admin",                   ["super_admin", "admin"]],
  // Exception : le scoring IA de prospect est ouvert au CRM (commercial).
  ["/api/ai/score-prospect",       ["super_admin", "admin", "commercial"]],
  ["/api/ai",                      ["super_admin", "admin"]],
  ["/api/emails",                  ["super_admin", "admin"]],
  ["/api/infogreffe",              ["super_admin", "admin"]],
  ["/api/pappers",                 ["super_admin", "admin", "commercial"]],
  ["/api/clients",                 ["super_admin", "admin"]],
  ["/api/trainers",                ["super_admin", "admin"]],
  // NB ordre : `/api/trainers` (pluriel, gestion admin) AVANT `/api/trainer`
  // (singulier, espace formateur) — le matching est first-match, sinon le
  // singulier ombrerait le pluriel.
  ["/api/trainer",                 ["super_admin", "admin", "trainer"]],
  ["/api/learner",                 ["super_admin", "admin", "learner"]],
  ["/api/trainings",               ["super_admin", "admin"]],

  // ── CRM : admin + commercial + trainer (tasks) ──────────────────────────────
  ["/api/crm/suivi",               ["super_admin", "admin"]],
  ["/api/crm/tasks",               ["super_admin", "admin", "commercial", "trainer"]],
  ["/api/crm",                     ["super_admin", "admin", "commercial"]],

  // ── Admin + Trainer ────────────────────────────────────────────────────────
  ["/api/sessions",                ["super_admin", "admin", "trainer"]],
  ["/api/programs",                ["super_admin", "admin", "trainer"]],

  // ── Admin + Trainer + Learner ──────────────────────────────────────────────
  // Auto-signature apprenant retirée : l'émargement passe par /api/emargement/sign (QR).
  ["/api/signatures",              ["super_admin", "admin", "trainer"]],
  ["/api/questionnaires",          ["super_admin", "admin", "trainer", "learner"]],

  // ── Tous les rôles authentifiés ────────────────────────────────────────────
  ["/api/documents",               ["super_admin", "admin", "commercial", "trainer", "client", "learner"]],
  // Endpoint partagé signed-URL (contrôle rôle+entité dans le handler).
  ["/api/storage",                 ["super_admin", "admin", "commercial", "trainer"]],

  // ── E-learning : sous-règles spécifiques en premier, catch-all en dernier ──
  ["/api/elearning/final-exam",    ["super_admin", "admin", "learner"]],
  ["/api/elearning/quiz",          ["super_admin", "admin", "learner"]],
  ["/api/elearning/progress",      ["super_admin", "admin", "learner"]],
  ["/api/elearning/scores",        ["super_admin", "admin", "learner"]],
  ["/api/elearning",               ["super_admin", "admin", "learner"]],

];

/**
 * Résout les rôles autorisés pour un chemin via la première règle dont le
 * préfixe matche (les tables sont ordonnées du plus spécifique au plus général).
 * Retourne `null` si aucune règle ne matche. Source unique partagée par le
 * middleware (PAGE_PERMISSIONS + API_PERMISSIONS).
 */
export function findMatchingRoles(
  pathname: string,
  table: Array<[string, Role[]]>,
): Role[] | null {
  for (const [prefix, allowedRoles] of table) {
    if (pathname.startsWith(prefix)) return allowedRoles;
  }
  return null;
}

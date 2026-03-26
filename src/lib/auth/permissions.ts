export type Role = "super_admin" | "admin" | "commercial" | "trainer" | "client" | "learner";

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
  ["/api/ai",                      ["super_admin", "admin"]],
  ["/api/emails",                  ["super_admin", "admin"]],
  ["/api/infogreffe",              ["super_admin", "admin"]],
  ["/api/pappers",                 ["super_admin", "admin"]],
  ["/api/clients",                 ["super_admin", "admin"]],
  ["/api/trainers",                ["super_admin", "admin"]],
  ["/api/trainings",               ["super_admin", "admin"]],

  // ── CRM : admin + commercial + trainer (tasks) ──────────────────────────────
  ["/api/crm/suivi",               ["super_admin", "admin"]],
  ["/api/crm/tasks",               ["super_admin", "admin", "commercial", "trainer"]],
  ["/api/crm",                     ["super_admin", "admin", "commercial"]],

  // ── Admin + Trainer ────────────────────────────────────────────────────────
  ["/api/sessions",                ["super_admin", "admin", "trainer"]],
  ["/api/programs",                ["super_admin", "admin", "trainer"]],

  // ── Admin + Trainer + Learner ──────────────────────────────────────────────
  ["/api/signatures",              ["super_admin", "admin", "trainer", "learner"]],
  ["/api/questionnaires",          ["super_admin", "admin", "trainer", "learner"]],

  // ── Tous les rôles authentifiés ────────────────────────────────────────────
  ["/api/documents",               ["super_admin", "admin", "commercial", "trainer", "client", "learner"]],

  // ── E-learning : sous-règles spécifiques en premier, catch-all en dernier ──
  ["/api/elearning/final-exam",    ["super_admin", "admin", "learner"]],
  ["/api/elearning/quiz",          ["super_admin", "admin", "learner"]],
  ["/api/elearning/progress",      ["super_admin", "admin", "learner"]],
  ["/api/elearning/scores",        ["super_admin", "admin", "learner"]],
  ["/api/elearning",               ["super_admin", "admin", "learner"]],

];

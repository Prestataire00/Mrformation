export type Role = "admin" | "trainer" | "client" | "learner";

/**
 * Règles de pages UI — premier match gagne, du plus spécifique au plus large.
 * Utilise Array (ordre garanti) plutôt que Record.
 */
export const PAGE_PERMISSIONS: Array<[string, Role[]]> = [
  // Exception dans /admin : les trainers peuvent accéder à la signature
  ["/admin/signatures", ["admin", "trainer"]],
  // Reste du /admin : admin uniquement
  ["/admin",            ["admin"]],
  // Portails utilisateurs
  ["/trainer",          ["admin", "trainer"]],
  ["/client",           ["admin", "client"]],
  ["/learner",          ["admin", "learner"]],
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
  ["/api/admin",                   ["admin"]],
  ["/api/ai",                      ["admin"]],
  ["/api/emails",                  ["admin"]],
  ["/api/infogreffe",              ["admin"]],
  ["/api/pappers",                 ["admin"]],
  ["/api/clients",                 ["admin"]],
  ["/api/trainers",                ["admin"]],
  ["/api/trainings",               ["admin"]],
  ["/api/crm",                     ["admin"]],

  // ── Admin + Trainer ────────────────────────────────────────────────────────
  ["/api/sessions",                ["admin", "trainer"]],
  ["/api/programs",                ["admin", "trainer"]],

  // ── Admin + Trainer + Learner ──────────────────────────────────────────────
  ["/api/signatures",              ["admin", "trainer", "learner"]],
  ["/api/questionnaires",          ["admin", "trainer", "learner"]],

  // ── Tous les rôles authentifiés ────────────────────────────────────────────
  ["/api/documents",               ["admin", "trainer", "client", "learner"]],

  // ── E-learning : sous-règles spécifiques en premier, catch-all en dernier ──
  ["/api/elearning/final-exam",    ["admin", "learner"]],
  ["/api/elearning/quiz",          ["admin", "learner"]],
  ["/api/elearning/progress",      ["admin", "learner"]],
  ["/api/elearning/scores",        ["admin", "learner"]],
  ["/api/elearning",               ["admin", "learner"]],

  // ── Auto-inscription ───────────────────────────────────────────────────────
  ["/api/enrollments/self-enroll", ["learner"]],
];

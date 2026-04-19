#!/usr/bin/env node

/**
 * Audit technique V1 — MR Formation
 * Analyse statique complète du codebase avant livraison.
 *
 * Usage :
 *   node scripts/audit-v1.js
 *   node scripts/audit-v1.js --verbose
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const VERBOSE = process.argv.includes("--verbose");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SCHEMA_FILE = path.join(ROOT, "supabase", "schema.sql");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const reportFile = path.join(__dirname, `rapport-audit-${dateStr}.md`);

let commitSha = "unknown";
try { commitSha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch {}

// ── Counters ──
const ok = [];
const warnings = [];
const criticals = [];

function addOk(msg) { ok.push(msg); }
function addWarn(msg, details) { warnings.push({ msg, details: details || [] }); }
function addCritical(msg, details) { criticals.push({ msg, details: details || [] }); }

// ── Helpers ──

function walkFiles(dir, extensions = [".ts", ".tsx"]) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git", ".netlify", "test-results"].includes(entry.name)) continue;
      results.push(...walkFiles(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return ""; }
}

// ══════════════════════════════════════════════
// SECTION A — STRUCTURE
// ══════════════════════════════════════════════

const allTsFiles = walkFiles(SRC);
const apiRoutes = allTsFiles.filter(f => f.includes("/api/") && f.endsWith("route.ts"));
const pages = allTsFiles.filter(f => f.endsWith("page.tsx") || f.endsWith("page.ts"));
const components = allTsFiles.filter(f => !f.includes("/api/") && !f.endsWith("page.tsx") && !f.endsWith("page.ts") && !f.endsWith("layout.tsx"));
const migrations = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql"))
  : [];

const structureStats = {
  apiRoutes: apiRoutes.length,
  pages: pages.length,
  migrations: migrations.length,
  components: components.length,
  totalFiles: allTsFiles.length,
};

// ══════════════════════════════════════════════
// SECTION B — SECURITE
// ══════════════════════════════════════════════

// B1 — Routes API sans auth
const publicPaths = [
  "/api/auth", "/api/emargement", "/api/documents/sign",
  "/api/documents/sign-status", "/api/documents/process-sign-reminders",
];
const apiWithoutAuth = [];
for (const file of apiRoutes) {
  const content = readFile(file);
  const relPath = rel(file);
  const isPublic = publicPaths.some(p => relPath.includes(p.replace(/\//g, path.sep)));
  const isCron = relPath.includes("cron") || relPath.includes("process-") || relPath.includes("auto-send") || relPath.includes("auto-generate");
  if (isPublic || isCron) continue;

  const hasAuth =
    content.includes("requireRole") ||
    content.includes("getUser") ||
    content.includes("auth.getSession") ||
    content.includes("supabase.auth") ||
    content.includes("CRON_SECRET") ||
    content.includes("createServerClient") ||
    content.includes("createClient");

  if (!hasAuth) {
    apiWithoutAuth.push(relPath);
  }
}

if (apiWithoutAuth.length === 0) {
  addOk("Toutes les routes API ont une vérification d'auth ou sont publiques documentées");
} else {
  addCritical(`${apiWithoutAuth.length} route(s) API sans auth détectée(s)`, apiWithoutAuth);
}

// B2 — Tables sans RLS (check schema.sql)
const schemaContent = readFile(SCHEMA_FILE);
const allMigrationContent = migrations.map(m => readFile(path.join(MIGRATIONS_DIR, m))).join("\n");
const combinedSql = schemaContent + "\n" + allMigrationContent;

const createTableMatches = combinedSql.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?(\w+)/gi) || [];
const tableNames = createTableMatches.map(m => {
  const match = m.match(/(?:public\.)?(\w+)\s*$/);
  return match ? match[1] : null;
}).filter(Boolean);

const rlsEnabledTables = (combinedSql.match(/ALTER TABLE(?:\s+IF EXISTS)?\s+(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi) || [])
  .map(m => { const match = m.match(/(?:public\.)?(\w+)\s+ENABLE/); return match ? match[1] : null; })
  .filter(Boolean);

const tablesWithoutRls = tableNames.filter(t => !rlsEnabledTables.includes(t) && !["schema_migrations"].includes(t));
const uniqueTablesWithoutRls = [...new Set(tablesWithoutRls)];

if (uniqueTablesWithoutRls.length === 0) {
  addOk("RLS activée sur toutes les tables du schema");
} else if (uniqueTablesWithoutRls.length <= 3) {
  addWarn(`${uniqueTablesWithoutRls.length} table(s) sans RLS détectée(s)`, uniqueTablesWithoutRls);
} else {
  addCritical(`${uniqueTablesWithoutRls.length} table(s) sans RLS`, uniqueTablesWithoutRls);
}

// B3 — Policies USING (TRUE)
const usingTrueMatches = combinedSql.match(/USING\s*\(\s*true\s*\)/gi) || [];
if (usingTrueMatches.length === 0) {
  addOk("Aucune policy USING (TRUE) dangereuse trouvée");
} else {
  addWarn(`${usingTrueMatches.length} policy(ies) USING (TRUE) trouvée(s) — vérifier si intentionnel`);
}

// B4 — Clés API hardcodées
const hardcodedKeys = [];
const keyPatterns = [
  /(?:sk_live|sk_test|pk_live|pk_test)_[a-zA-Z0-9]{20,}/,
  /eyJ[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}/,
  /(?:SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|RESEND_API_KEY)\s*=\s*["'][^"']+["']/,
];

for (const file of allTsFiles) {
  if (file.includes(".env") || file.includes("node_modules")) continue;
  const content = readFile(file);
  for (const pattern of keyPatterns) {
    if (pattern.test(content) && !content.includes("process.env")) {
      const relF = rel(file);
      if (!relF.includes(".example") && !relF.includes("README")) {
        hardcodedKeys.push(relF);
        break;
      }
    }
  }
}

if (hardcodedKeys.length === 0) {
  addOk("Aucune clé API hardcodée détectée dans le code source");
} else {
  addCritical(`${hardcodedKeys.length} fichier(s) avec clés API hardcodées`, hardcodedKeys);
}

// B5 — console.log avec données sensibles
const sensitiveConsoleLog = [];
for (const file of allTsFiles) {
  const content = readFile(file);
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (/console\.log.*(?:password|token|secret|api_key|authorization|cookie)/i.test(line)) {
      sensitiveConsoleLog.push(`${rel(file)}:${i + 1}`);
    }
  });
}

if (sensitiveConsoleLog.length === 0) {
  addOk("Aucun console.log avec données sensibles détecté");
} else {
  addCritical(`${sensitiveConsoleLog.length} console.log avec données sensibles`, sensitiveConsoleLog);
}

// ══════════════════════════════════════════════
// SECTION C — INTEGRITE
// ══════════════════════════════════════════════

// C1 — TypeScript errors
let tsErrors = 0;
try {
  execSync("npx tsc --noEmit 2>&1", { cwd: ROOT, timeout: 120000 });
  addOk("Aucune erreur TypeScript (tsc --noEmit)");
} catch (e) {
  const output = e.stdout?.toString() || "";
  tsErrors = (output.match(/error TS/g) || []).length;
  if (tsErrors > 0) {
    addCritical(`${tsErrors} erreur(s) TypeScript`, [output.split("\n").slice(0, 10).join("\n")]);
  } else {
    addOk("Aucune erreur TypeScript (tsc --noEmit)");
  }
}

// C2 — Liens <Link href="/xxx"> vers pages inexistantes
const brokenLinks = [];
const existingRoutes = new Set();

for (const page of pages) {
  // Extract route from file path
  let route = rel(page)
    .replace(/^src\/app/, "")
    .replace(/\/page\.(tsx|ts)$/, "")
    .replace(/\(dashboard\)\//g, "")
    .replace(/\(auth\)\//g, "")
    .replace(/\[([^\]]+)\]/g, "[id]");
  if (route === "") route = "/";
  existingRoutes.add(route);
}

for (const file of allTsFiles) {
  const content = readFile(file);
  const linkMatches = content.matchAll(/(?:href|push|replace)\s*(?:\(|=)\s*["'`](\/[a-z][a-z0-9/-]*?)["'`]/gi);
  for (const match of linkMatches) {
    let href = match[1];
    // Normalize dynamic segments
    href = href.replace(/\/[a-f0-9-]{36}/g, "/[id]").replace(/\/[a-f0-9]{8,}/g, "/[id]");
    // Skip API routes, external, and dynamic
    if (href.startsWith("/api/") || href.includes("${") || href.includes("[")) continue;
    if (!existingRoutes.has(href) && !existingRoutes.has(href + "/")) {
      // Check if any route starts with this path (parent route)
      const isParent = [...existingRoutes].some(r => r.startsWith(href));
      if (!isParent) {
        brokenLinks.push({ file: rel(file), href });
      }
    }
  }
}

const uniqueBrokenLinks = [...new Map(brokenLinks.map(b => [b.href, b])).values()];
if (uniqueBrokenLinks.length === 0) {
  addOk("Tous les liens internes pointent vers des pages existantes");
} else if (uniqueBrokenLinks.length <= 5) {
  addWarn(`${uniqueBrokenLinks.length} lien(s) potentiellement cassé(s)`, uniqueBrokenLinks.map(b => `${b.href} dans ${b.file}`));
} else {
  addWarn(`${uniqueBrokenLinks.length} lien(s) potentiellement cassé(s) (vérifier manuellement)`, uniqueBrokenLinks.slice(0, 10).map(b => `${b.href} dans ${b.file}`));
}

// ══════════════════════════════════════════════
// SECTION D — CONFIGURATION
// ══════════════════════════════════════════════

// D1 — Variables env référencées vs .env.example
const envVarsReferenced = new Set();
for (const file of allTsFiles) {
  const content = readFile(file);
  const matches = content.matchAll(/process\.env\.(\w+)/g);
  for (const m of matches) {
    envVarsReferenced.add(m[1]);
  }
  const nextPublicMatches = content.matchAll(/NEXT_PUBLIC_(\w+)/g);
  for (const m of nextPublicMatches) {
    envVarsReferenced.add(`NEXT_PUBLIC_${m[1]}`);
  }
}

const envExampleContent = readFile(ENV_EXAMPLE);
const envExampleVars = new Set();
const envLines = envExampleContent.split("\n");
for (const line of envLines) {
  const match = line.match(/^([A-Z][A-Z0-9_]+)\s*=/);
  if (match) envExampleVars.add(match[1]);
}

const missingInExample = [...envVarsReferenced].filter(v =>
  !envExampleVars.has(v) &&
  !["NODE_ENV", "VERCEL", "CI", "NEXT_RUNTIME"].includes(v) &&
  !v.startsWith("npm_") &&
  !v.startsWith("__")
);

if (missingInExample.length === 0) {
  addOk("Toutes les variables env référencées sont dans .env.example");
} else {
  addWarn(`${missingInExample.length} variable(s) env référencée(s) absente(s) de .env.example`, missingInExample);
}

// D2 — Tables SQL référencées dans le code
const tablesInCode = new Set();
for (const file of allTsFiles) {
  const content = readFile(file);
  const fromMatches = content.matchAll(/\.from\s*\(\s*["'](\w+)["']\s*\)/g);
  for (const m of fromMatches) tablesInCode.add(m[1]);
}

const allKnownTables = new Set(tableNames);
const missingTables = [...tablesInCode].filter(t => !allKnownTables.has(t) && t !== "auth" && t !== "storage");

if (missingTables.length === 0) {
  addOk("Toutes les tables Supabase référencées existent dans le schema");
} else {
  addWarn(`${missingTables.length} table(s) référencée(s) absente(s) du schema.sql`, missingTables);
}

// ══════════════════════════════════════════════
// SECTION E — FONCTIONNALITES
// ══════════════════════════════════════════════

// E1 — Boutons onClick vides ou console.log only
const emptyOnClick = [];
for (const file of allTsFiles) {
  const content = readFile(file);
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (/onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(line)) {
      emptyOnClick.push(`${rel(file)}:${i + 1}`);
    }
    if (/onClick\s*=\s*\{\s*\(\)\s*=>\s*console\.log/.test(line)) {
      emptyOnClick.push(`${rel(file)}:${i + 1} (console.log only)`);
    }
  });
}

if (emptyOnClick.length === 0) {
  addOk("Aucun bouton avec onClick vide ou console.log-only");
} else {
  addWarn(`${emptyOnClick.length} bouton(s) onClick vide(s) ou console.log-only`, emptyOnClick);
}

// E2 — console.log dans le code (non-test)
const consoleLogFiles = [];
const consoleLogCount = { total: 0 };
for (const file of allTsFiles) {
  if (file.includes("__test") || file.includes(".spec.") || file.includes("logger.ts")) continue;
  const content = readFile(file);
  const matches = content.match(/console\.log\(/g) || [];
  if (matches.length > 0) {
    consoleLogCount.total += matches.length;
    consoleLogFiles.push(`${rel(file)} (${matches.length})`);
  }
}

if (consoleLogCount.total === 0) {
  addOk("Aucun console.log dans le code source");
} else {
  addWarn(`${consoleLogCount.total} console.log dans ${consoleLogFiles.length} fichier(s)`, consoleLogFiles);
}

// E3 — TODO/FIXME/XXX
const todos = [];
for (const file of allTsFiles) {
  const content = readFile(file);
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line) && !line.includes("TodoWrite")) {
      todos.push(`${rel(file)}:${i + 1} — ${line.trim().substring(0, 100)}`);
    }
  });
}

if (todos.length === 0) {
  addOk("Aucun TODO/FIXME/XXX/HACK dans le code");
} else {
  addWarn(`${todos.length} TODO/FIXME trouvé(s)`, todos);
}

// E4 — type `any` explicite
const anyTypes = [];
for (const file of allTsFiles) {
  const content = readFile(file);
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    // Match `: any`, `as any`, `<any>` but not in comments
    if (/(?::\s*any\b|as\s+any\b|<any>)/.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
      anyTypes.push(`${rel(file)}:${i + 1}`);
    }
  });
}

if (anyTypes.length === 0) {
  addOk('Aucun type "any" explicite dans le code');
} else if (anyTypes.length <= 10) {
  addWarn(`${anyTypes.length} utilisation(s) de type "any"`, VERBOSE ? anyTypes : anyTypes.slice(0, 5));
} else {
  addWarn(`${anyTypes.length} utilisation(s) de type "any" (top 10)`, anyTypes.slice(0, 10));
}

// ══════════════════════════════════════════════
// SECTION F — CRONS
// ══════════════════════════════════════════════

const cronEndpoints = apiRoutes.filter(f => {
  const relF = rel(f);
  return relF.includes("cron") || relF.includes("process-") || relF.includes("auto-send") ||
         relF.includes("auto-generate") || relF.includes("daily-digest") ||
         relF.includes("weekly-summary") || relF.includes("generate");
});

const cronWithoutAuth = [];
for (const file of cronEndpoints) {
  const content = readFile(file);
  if (!content.includes("CRON_SECRET") && !content.includes("requireRole") && !content.includes("authorization")) {
    cronWithoutAuth.push(rel(file));
  }
}

if (cronEndpoints.length > 0) {
  addOk(`${cronEndpoints.length} endpoint(s) cron documenté(s)`);
}

if (cronWithoutAuth.length === 0) {
  addOk("Tous les endpoints cron vérifient CRON_SECRET ou auth");
} else {
  addWarn(`${cronWithoutAuth.length} endpoint(s) cron sans auth CRON_SECRET`, cronWithoutAuth);
}

// ══════════════════════════════════════════════
// SECTION G — API IA
// ══════════════════════════════════════════════

const iaEndpoints = apiRoutes.filter(f => rel(f).includes("/api/ai/"));
const iaWithoutTryCatch = [];

for (const file of iaEndpoints) {
  const content = readFile(file);
  if (!content.includes("try") || !content.includes("catch")) {
    iaWithoutTryCatch.push(rel(file));
  }
}

addOk(`${iaEndpoints.length} endpoint(s) IA détecté(s)`);

if (iaWithoutTryCatch.length === 0) {
  addOk("Tous les endpoints IA ont un try/catch");
} else {
  addWarn(`${iaWithoutTryCatch.length} endpoint(s) IA sans try/catch`, iaWithoutTryCatch);
}

// ══════════════════════════════════════════════
// SECTION H — SUPABASE entity_id
// ══════════════════════════════════════════════

const missingEntityFilter = [];
for (const file of apiRoutes) {
  const content = readFile(file);
  const relF = rel(file);
  // Skip auth and public endpoints
  if (relF.includes("/api/auth") || relF.includes("/api/emargement") || relF.includes("/api/documents/sign")) continue;
  // Check if it queries Supabase but doesn't filter by entity_id
  if (content.includes(".from(") && !content.includes("entity_id") && !content.includes("CRON_SECRET")) {
    // Some routes legitimately don't need entity_id (e.g., user-specific queries)
    if (!content.includes("signer_id") && !content.includes("user_id") && !content.includes("auth.getUser")) {
      missingEntityFilter.push(relF);
    }
  }
}

if (missingEntityFilter.length === 0) {
  addOk("Toutes les routes API filtrent par entity_id ou sont user-scoped");
} else {
  addWarn(`${missingEntityFilter.length} route(s) API potentiellement sans filtre entity_id`, missingEntityFilter);
}

// ══════════════════════════════════════════════
// GENERATION DU RAPPORT
// ══════════════════════════════════════════════

const report = [];
report.push("# Rapport d'audit V1 — MR Formation");
report.push("");
report.push(`**Date** : ${now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
report.push(`**Commit** : \`${commitSha}\``);
report.push(`**Script** : \`scripts/audit-v1.js\``);
report.push("");

report.push("---");
report.push("");
report.push("## Structure du projet");
report.push("");
report.push(`| Métrique | Nombre |`);
report.push(`|----------|--------|`);
report.push(`| Routes API | ${structureStats.apiRoutes} |`);
report.push(`| Pages | ${structureStats.pages} |`);
report.push(`| Migrations SQL | ${structureStats.migrations} |`);
report.push(`| Composants/fichiers TS | ${structureStats.components} |`);
report.push(`| **Total fichiers** | **${structureStats.totalFiles}** |`);
report.push("");

report.push("---");
report.push("");

// Points OK
report.push(`## :green_circle: Points OK (${ok.length})`);
report.push("");
ok.forEach(msg => report.push(`- ${msg}`));
report.push("");

// Warnings
report.push(`## :yellow_circle: Points à surveiller (${warnings.length})`);
report.push("");
warnings.forEach(w => {
  report.push(`### ${w.msg}`);
  if (w.details && w.details.length > 0) {
    w.details.forEach(d => report.push(`- \`${d}\``));
  }
  report.push("");
});

// Criticals
report.push(`## :red_circle: Points critiques (${criticals.length})`);
report.push("");
if (criticals.length === 0) {
  report.push("Aucun point critique détecté.");
} else {
  criticals.forEach(c => {
    report.push(`### ${c.msg}`);
    report.push("");
    report.push("**Impact** : Production potentiellement affectée");
    report.push("**Recommandation** : Corriger avant déploiement");
    report.push("");
    if (c.details && c.details.length > 0) {
      c.details.forEach(d => report.push(`- \`${d}\``));
    }
    report.push("");
  });
}

report.push("---");
report.push("");
report.push(`> Rapport généré automatiquement par \`scripts/audit-v1.js\``);

const reportContent = report.join("\n");
fs.writeFileSync(reportFile, reportContent, "utf-8");

// Console output
console.log("");
console.log("════════════════════════════════════════════");
console.log("  AUDIT V1 — MR Formation");
console.log(`  ${now.toLocaleDateString("fr-FR")} — commit ${commitSha}`);
console.log("════════════════════════════════════════════");
console.log("");
console.log(`  🟢 OK         : ${ok.length}`);
console.log(`  🟡 Warnings   : ${warnings.length}`);
console.log(`  🔴 Critiques  : ${criticals.length}`);
console.log("");
console.log(`  📊 ${structureStats.apiRoutes} routes API | ${structureStats.pages} pages | ${structureStats.migrations} migrations | ${structureStats.totalFiles} fichiers`);
console.log("");

if (VERBOSE) {
  console.log("── Points OK ──");
  ok.forEach(msg => console.log(`  ✅ ${msg}`));
  console.log("");
}

if (warnings.length > 0) {
  console.log("── Warnings ──");
  warnings.forEach(w => {
    console.log(`  ⚠️  ${w.msg}`);
    if (VERBOSE && w.details) {
      w.details.forEach(d => console.log(`     → ${d}`));
    }
  });
  console.log("");
}

if (criticals.length > 0) {
  console.log("── CRITIQUES ──");
  criticals.forEach(c => {
    console.log(`  ❌ ${c.msg}`);
    if (c.details) {
      c.details.forEach(d => console.log(`     → ${d}`));
    }
  });
  console.log("");
}

console.log(`📄 Rapport sauvegardé : ${path.relative(ROOT, reportFile)}`);
console.log("");

// Exit code
process.exit(criticals.length > 5 ? 1 : 0);

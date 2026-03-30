#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const REPORT_DIR = path.join(ROOT, "scripts");

const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const reportFile = path.join(REPORT_DIR, `rapport-audit-${dateStr}.txt`);

let pass = 0;
let fail = 0;
let warn = 0;
const lines = [];

function log(line = "") { lines.push(line); }
function logPass(msg) { log(`✅ PASS — ${msg}`); pass++; }
function logFail(msg) { log(`❌ FAIL — ${msg}`); fail++; }
function logWarn(msg) { log(`⚠️  WARN — ${msg}`); warn++; }

// ── Helpers ──

function walkFiles(dir, ext = ".ts") {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      results.push(...walkFiles(full, ext));
    } else if (entry.name.endsWith(ext) || entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

// ══════════════════════════════════════════════
log("========================================");
log("RAPPORT D'AUDIT — MR FORMATION LMS");
log(`Date : ${now.toLocaleString("fr-FR")}`);
log("========================================");
log();

// ── 1. VARIABLES EMAIL ──

log("─── 1. VARIABLES EMAIL ───");
log();

const allSrcFiles = walkFiles(SRC);
const emailSendFiles = allSrcFiles.filter((f) => {
  const content = fs.readFileSync(f, "utf-8");
  return content.includes('"/api/emails/send"') || content.includes("'/api/emails/send'");
});

const filesWithoutResolve = [];
for (const f of emailSendFiles) {
  const content = fs.readFileSync(f, "utf-8");
  // Skip API route itself and cron routes
  if (f.includes("api/emails/send/route")) continue;
  if (f.includes("api/emails/process-scheduled")) continue;
  if (f.includes("api/formations/automation-rules/run")) continue;
  if (!content.includes("resolveVariables")) {
    filesWithoutResolve.push(rel(f));
  }
}

if (filesWithoutResolve.length === 0) {
  logPass("Tous les fichiers d'envoi email utilisent resolveVariables() ou construisent le body manuellement");
} else {
  logWarn(`${filesWithoutResolve.length} fichier(s) appellent /api/emails/send sans resolveVariables()`);
  filesWithoutResolve.forEach((f) => log(`  → ${f}`));
}
log();

// ── 2. VARIABLES NON SUPPORTÉES ──

log("─── 2. VARIABLES NON SUPPORTÉES ───");
log();

const resolveFile = path.join(SRC, "lib", "utils", "resolve-variables.ts");
const resolveContent = fs.existsSync(resolveFile) ? fs.readFileSync(resolveFile, "utf-8") : "";
const supportedVars = new Set();
const supportedMatches = resolveContent.match(/"\{\{[^}]+\}\}"/g) || [];
supportedMatches.forEach((m) => supportedVars.add(m.replace(/"/g, "")));

const usedVars = new Set();
const varUsageFiles = {};
for (const f of allSrcFiles) {
  const content = fs.readFileSync(f, "utf-8");
  const filteredContent = content
    .split("\n")
    .filter((line) =>
      !line.includes(".match(") &&
      !line.includes(".replace(") &&
      !line.includes("regex") &&
      !line.includes("// ") &&
      !line.includes("test(")
    )
    .join("\n");
  const matches = filteredContent.match(/\{\{[a-z_]+\}\}/g) || [];
  for (const v of matches) {
    usedVars.add(v);
    if (!varUsageFiles[v]) varUsageFiles[v] = [];
    if (!varUsageFiles[v].includes(rel(f))) varUsageFiles[v].push(rel(f));
  }
}

const unsupported = [...usedVars].filter((v) => !supportedVars.has(v));
if (unsupported.length === 0) {
  logPass("Toutes les variables {{}} utilisées sont définies dans resolve-variables.ts");
} else {
  logWarn(`${unsupported.length} variable(s) utilisées mais non définies`);
  unsupported.forEach((v) => {
    log(`  → ${v}`);
    (varUsageFiles[v] || []).slice(0, 3).forEach((f) => log(`    dans: ${f}`));
  });
}
log(`  Variables supportées (${supportedVars.size}) : ${[...supportedVars].join(", ")}`);
log();

// ── 3. MIGRATIONS SQL ──

log("─── 3. MIGRATIONS SQL ───");
log();

const migrationsTracked = path.join(REPORT_DIR, "migrations-executees.json");
const migrationFiles = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
  : [];

if (fs.existsSync(migrationsTracked)) {
  const executed = JSON.parse(fs.readFileSync(migrationsTracked, "utf-8"));
  const executedSet = new Set(executed);
  const notExecuted = migrationFiles.filter((f) => !executedSet.has(f));
  if (notExecuted.length === 0) {
    logPass(`${migrationFiles.length} migrations toutes tracées`);
  } else {
    logFail(`${notExecuted.length} migration(s) non tracées`);
    notExecuted.forEach((f) => log(`  → supabase/migrations/${f}`));
  }
} else {
  logWarn(`Fichier scripts/migrations-executees.json introuvable — impossible de vérifier`);
  log(`  ${migrationFiles.length} fichiers de migration trouvés :`);
  migrationFiles.forEach((f) => log(`  → ${f}`));
}
log();

// ── 4. VARIABLES D'ENVIRONNEMENT ──

log("─── 4. VARIABLES D'ENVIRONNEMENT ───");
log();

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
];

const envLocalPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf-8");
  const missing = requiredEnvVars.filter((v) => !envContent.includes(v));
  if (missing.length === 0) {
    logPass("Toutes les variables d'environnement sont dans .env.local");
  } else {
    logWarn(`${missing.length} variable(s) manquantes dans .env.local`);
    missing.forEach((v) => log(`  → ${v}`));
  }
} else {
  logWarn("Pas de .env.local — les variables doivent être dans Netlify Dashboard");
  requiredEnvVars.forEach((v) => log(`  Requis : ${v}`));
}
log();

// ── 5. CLÉS API EXPOSÉES ──

log("─── 5. CLÉS API EXPOSÉES ───");
log();

const keyPatterns = [
  { name: "Resend", regex: /re_[a-zA-Z0-9]{20,}/g },
  { name: "OpenAI", regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: "JWT hardcodé", regex: /eyJ[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}/g },
];

const exposedFiles = [];
for (const f of allSrcFiles) {
  const content = fs.readFileSync(f, "utf-8");
  for (const { name, regex } of keyPatterns) {
    if (regex.test(content)) {
      exposedFiles.push({ file: rel(f), type: name });
    }
    regex.lastIndex = 0;
  }
}

if (exposedFiles.length === 0) {
  logPass("Aucune clé API exposée dans src/");
} else {
  logFail(`${exposedFiles.length} clé(s) API potentiellement exposée(s)`);
  exposedFiles.forEach(({ file, type }) => log(`  → ${file} (${type})`));
}
log();

// ── 6. CONSOLE.LOG EN PROD ──

log("─── 6. CONSOLE.LOG EN PROD ───");
log();

const consoleLogFiles = [];
for (const f of allSrcFiles) {
  if (f.includes(".test.") || f.includes("__tests__")) continue;
  const content = fs.readFileSync(f, "utf-8");
  const matches = content.match(/console\.(log|warn|error)\(/g) || [];
  if (matches.length > 3) {
    consoleLogFiles.push({ file: rel(f), count: matches.length });
  }
}

if (consoleLogFiles.length === 0) {
  logPass("Aucun fichier avec plus de 3 console.log");
} else {
  logWarn(`${consoleLogFiles.length} fichier(s) avec plus de 3 console.log/warn/error`);
  consoleLogFiles.sort((a, b) => b.count - a.count);
  consoleLogFiles.slice(0, 10).forEach(({ file, count }) => log(`  → ${file} (${count})`));
}
log();

// ── 7. ROUTES API SANS AUTH ──

log("─── 7. ROUTES API SANS AUTH ───");
log();

const apiDir = path.join(SRC, "app", "api");
const apiRoutes = walkFiles(apiDir).filter((f) => f.endsWith("route.ts"));
const unprotectedRoutes = [];

const PUBLIC_ROUTES = [
  "emargement/sign",
  "auth/gmail/callback",
];

for (const f of apiRoutes) {
  if (PUBLIC_ROUTES.some((p) => f.includes(p))) continue;
  const content = fs.readFileSync(f, "utf-8");
  const hasRequireRole = content.includes("requireRole");
  const hasCronSecret = content.includes("CRON_SECRET");
  const hasAuthCheck = content.includes("auth.getUser") || content.includes("getUser()");
  if (!hasRequireRole && !hasCronSecret && !hasAuthCheck) {
    unprotectedRoutes.push(rel(f));
  }
}

if (unprotectedRoutes.length === 0) {
  logPass("Toutes les routes API sont protégées");
} else {
  logFail(`${unprotectedRoutes.length} route(s) API sans protection`);
  unprotectedRoutes.forEach((f) => log(`  → ${f}`));
}
log();

// ── 8. TYPAGE TYPESCRIPT ──

log("─── 8. TYPAGE TYPESCRIPT ───");
log();

try {
  const { execSync } = require("child_process");
  const tscOutput = execSync("./node_modules/.bin/tsc --noEmit 2>&1", { cwd: ROOT, encoding: "utf-8", timeout: 120000 });
  const errorLines = tscOutput.split("\n").filter((l) => l.includes("error TS"));
  if (errorLines.length === 0) {
    logPass("0 erreur TypeScript");
  } else {
    logFail(`${errorLines.length} erreur(s) TypeScript`);
    errorLines.slice(0, 10).forEach((l) => log(`  → ${l.trim()}`));
    if (errorLines.length > 10) log(`  ... et ${errorLines.length - 10} autres`);
  }
} catch (err) {
  const output = (err.stdout || "") + (err.stderr || "");
  const errorLines = output.split("\n").filter((l) => l.includes("error TS"));
  if (errorLines.length === 0) {
    logPass("0 erreur TypeScript");
  } else {
    logFail(`${errorLines.length} erreur(s) TypeScript`);
    errorLines.slice(0, 10).forEach((l) => log(`  → ${l.trim()}`));
    if (errorLines.length > 10) log(`  ... et ${errorLines.length - 10} autres`);
  }
}
log();

// ── RÉSUMÉ ──

log("========================================");
log(`RÉSUMÉ : ${pass} PASS / ${fail} FAIL / ${warn} WARN`);
log("========================================");

// Write report
const report = lines.join("\n");
fs.writeFileSync(reportFile, report, "utf-8");
console.log(report);
console.log(`\nRapport écrit dans : ${rel(reportFile)}`);

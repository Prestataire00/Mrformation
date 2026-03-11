// Migration parsers for Visio/Sellsy Excel exports

export interface ParsedLearner {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  sessions_count: number;
}

export interface ParsedClient {
  company_name: string;
  phone: string | null;
  email: string | null;
  sector: string | null;
}

export interface ParsedTrainer {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
}

// ── Cleaning helpers ────────────────────────────────────────────────────────

const PLACEHOLDER_EMAILS = [
  "contact@mrformation.fr",
  "contact+1@mrformation.fr",
  "contact@mrformation.fr ",
];

export function cleanEmail(val: unknown): string | null {
  if (val === null || val === undefined || val === "" || val === "-") return null;
  const str = String(val).trim().toLowerCase();
  if (str === "0" || str === "na" || str === "n/a") return null;
  if (PLACEHOLDER_EMAILS.includes(str)) return null;
  // Basic email validation
  if (!str.includes("@")) return null;
  return str;
}

export function cleanPhone(val: unknown): string | null {
  if (val === null || val === undefined || val === "" || val === "-") return null;
  const str = String(val).trim();
  if (str === "0" || str === "0000" || str === "00") return null;
  // Remove non-digit chars except +
  const cleaned = str.replace(/[^\d+]/g, "");
  if (cleaned.length < 4) return null;
  return cleaned;
}

export function cleanSpecialty(val: unknown): string | null {
  if (val === null || val === undefined || val === "" || val === "-") return null;
  const str = String(val).trim();
  if (str.toUpperCase() === "NA" || str.toUpperCase() === "N/A") return null;
  return str;
}

/**
 * Split a full name into first_name and last_name.
 *
 * Observed patterns in the data:
 * - "ABAD Lydie" → last_name: ABAD, first_name: Lydie
 * - "OLIVIERI Nathalie" → last_name: OLIVIERI, first_name: Nathalie
 * - "ACCESS FORMATION" → last_name: ACCESS FORMATION, first_name: "" (company)
 * - ". Herve" → last_name: ., first_name: Herve
 *
 * Heuristic: Find the first word that starts with a lowercase or has mixed case
 * after the leading uppercase words → that's the start of the first name.
 */
export function splitName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { first_name: "", last_name: "" };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: "", last_name: parts[0] };
  }

  // Find the index where the first name starts
  // A first name starts with a lowercase letter or has mixed casing (e.g., "Lydie")
  let firstNameIndex = -1;
  for (let i = 1; i < parts.length; i++) {
    const word = parts[i];
    // Skip dots, hyphens
    if (word.length <= 1 && !word.match(/[a-zA-Z]/)) continue;
    // Check if word is NOT all-uppercase (meaning it's a first name)
    if (word !== word.toUpperCase()) {
      firstNameIndex = i;
      break;
    }
  }

  if (firstNameIndex === -1) {
    // All words are uppercase → likely a company name or all-caps name
    // Treat last word as first name if there are exactly 2 words
    if (parts.length === 2) {
      return { first_name: parts[1], last_name: parts[0] };
    }
    // More than 2 all-caps words → company name
    return { first_name: "", last_name: trimmed };
  }

  const lastName = parts.slice(0, firstNameIndex).join(" ");
  const firstName = parts.slice(firstNameIndex).join(" ");

  return { first_name: firstName, last_name: lastName };
}

// ── Excel row parsers ───────────────────────────────────────────────────────

interface ExcelRow {
  [key: string]: unknown;
}

export function parseApprenants(rows: ExcelRow[]): ParsedLearner[] {
  return rows.map((row) => {
    const { first_name, last_name } = splitName(String(row.Nom ?? ""));
    return {
      first_name,
      last_name,
      email: cleanEmail(row.Email),
      phone: cleanPhone(row.Tel),
      sessions_count: typeof row.Sessions === "number" ? row.Sessions : 0,
    };
  });
}

export function parseEntreprises(rows: ExcelRow[]): ParsedClient[] {
  return rows.map((row) => ({
    company_name: String(row.Nom ?? "").trim(),
    phone: cleanPhone(row.Tel),
    email: cleanEmail(row.Email),
    sector: null,
  }));
}

export function parseFinanceurs(rows: ExcelRow[]): ParsedClient[] {
  return rows.map((row) => ({
    company_name: String(row.Nom ?? "").trim(),
    phone: null,
    email: null,
    sector: "financeur",
  }));
}

export function parseFormateurs(rows: ExcelRow[]): ParsedTrainer[] {
  return rows.map((row) => {
    const { first_name, last_name } = splitName(String(row.Nom ?? ""));
    return {
      first_name,
      last_name,
      email: cleanEmail(row.Email),
      phone: cleanPhone(row.Tel),
      specialty: cleanSpecialty(row["Spécialité"] ?? row.Specialite),
    };
  });
}

// ── Deduplication ───────────────────────────────────────────────────────────

export function deduplicateLearners(items: ParsedLearner[]): {
  unique: ParsedLearner[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: ParsedLearner[] = [];
  let duplicates = 0;

  for (const item of items) {
    const key = `${item.last_name.toLowerCase()}_${item.first_name.toLowerCase()}_${item.email ?? ""}`;
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

export function deduplicateClients(items: ParsedClient[]): {
  unique: ParsedClient[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: ParsedClient[] = [];
  let duplicates = 0;

  for (const item of items) {
    const key = item.company_name.toLowerCase().trim();
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

export function deduplicateTrainers(items: ParsedTrainer[]): {
  unique: ParsedTrainer[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: ParsedTrainer[] = [];
  let duplicates = 0;

  for (const item of items) {
    const key = `${item.last_name.toLowerCase()}_${item.first_name.toLowerCase()}_${item.email ?? ""}`;
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

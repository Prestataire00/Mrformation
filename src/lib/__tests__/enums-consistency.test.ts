import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { elearningCourseTypeEnum } from "@/lib/validations/elearning";
import type { CourseType } from "@/lib/types/elearning";
import { COURSE_TYPE_OPTIONS } from "@/lib/types/elearning";
import type { BpfFundingType, BpfObjective } from "@/lib/types";
import { programHubFormSchema } from "@/lib/validations/program";
import { BPF_FUNDING_LABELS, BPF_OBJECTIVE_LABELS } from "@/lib/bpf-calculator";

// ─── Helpers: extract enum values from Zod v4 schemas ───────────────

/**
 * Extracts string enum values from a Zod v4 schema field that may be wrapped
 * in z.preprocess() (pipe) → z.nullable() → z.enum([...]).
 * Walks the _zod.def chain until we find type === "enum".
 */
/**
 * Walks a Zod v4 schema's internal _zod.def structure to find enum entries.
 * Handles pipe (preprocess), nullable, optional wrappings.
 */
function extractZodEnumValues(field: unknown): string[] {
  interface ZodInternals {
    _zod?: {
      def?: {
        type?: string;
        entries?: Record<string, string>;
        innerType?: ZodInternals;
        out?: ZodInternals;
        in?: ZodInternals;
      };
    };
  }

  function walk(schema: ZodInternals): string[] | null {
    const def = schema._zod?.def;
    if (!def?.type) return null;

    if (def.type === "enum" && def.entries) {
      return Object.keys(def.entries);
    }
    if ((def.type === "nullable" || def.type === "optional") && def.innerType) {
      return walk(def.innerType);
    }
    if (def.type === "pipe") {
      if (def.out) {
        const r = walk(def.out);
        if (r) return r;
      }
      if (def.in) {
        const r = walk(def.in);
        if (r) return r;
      }
    }
    return null;
  }

  const result = walk(field as ZodInternals);
  if (!result) {
    throw new Error("Could not extract enum values from Zod field");
  }
  return result;
}

// ─── Helpers: parse DB CHECK constraints from migration SQL ─────────

function parseDbCheckValues(sql: string, columnName: string): string[] {
  // Match the FIRST occurrence of: column_name IN ('val1', 'val2', ...)
  // Use a regex that finds the column name followed by IN (...)
  const pattern = new RegExp(
    `${columnName}\\s+IN\\s*\\(([^)]+)\\)`,
    "i",
  );
  const match = sql.match(pattern);
  if (!match) {
    throw new Error(`Could not find CHECK constraint for "${columnName}" in migration SQL`);
  }
  return match[1]
    .split(",")
    .map((v) => v.trim().replace(/^'|'$/g, ""))
    .filter((v) => v.length > 0);
}

// ─── Load migration SQL ─────────────────────────────────────────────

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/bpf-auto-calculation.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf-8");

// ─── Canonical values (from DB CHECK in migration) ──────────────────

const DB_FUNDING_VALUES = parseDbCheckValues(migrationSql, "bpf_funding_type").sort();
const DB_OBJECTIVE_VALUES = parseDbCheckValues(migrationSql, "bpf_objective").sort();

// ─── TS type canonical values (compile-time verified) ───────────────

const TS_FUNDING_VALUES: readonly BpfFundingType[] = [
  "entreprise_privee", "apprentissage", "professionnalisation",
  "reconversion_alternance", "conge_transition", "cpf",
  "dispositif_chomeurs", "non_salaries", "plan_developpement",
  "pouvoir_public_agents", "instances_europeennes", "etat",
  "conseil_regional", "pole_emploi", "autres_publics",
  "individuel", "organisme_formation", "autre",
] as const satisfies readonly BpfFundingType[];

const TS_OBJECTIVE_VALUES: readonly BpfObjective[] = [
  "rncp_6_8", "rncp_5", "rncp_4", "rncp_3", "rncp_2", "rncp_cqp",
  "certification_rs", "cqp_non_enregistre", "autre_pro",
  "bilan_competences", "vae",
] as const satisfies readonly BpfObjective[];

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe("enums-consistency : CourseType ↔ Zod ↔ DB CHECK", () => {
  it("elearningCourseTypeEnum contient exactement les 3 valeurs DB", () => {
    const values = [...elearningCourseTypeEnum.options].sort();
    expect(values).toEqual(["complete", "presentation", "quiz"]);
  });

  it("COURSE_TYPE_OPTIONS couvre exactement les 3 valeurs (1 option par valeur)", () => {
    const optionValues = COURSE_TYPE_OPTIONS.map((o) => o.value).sort();
    expect(optionValues).toEqual(["complete", "presentation", "quiz"]);
  });

  it("Type CourseType est bien restreint aux 3 valeurs (compile-time check via runtime sample)", () => {
    const samples: CourseType[] = ["presentation", "quiz", "complete"];
    expect(samples).toHaveLength(3);
  });
});

describe("enums-consistency : BpfFundingType — TS ↔ Zod ↔ DB CHECK (18 valeurs)", () => {
  const zodFundingValues = extractZodEnumValues(
    programHubFormSchema.shape.bpf_funding_type,
  ).sort();

  it("DB CHECK programs.bpf_funding_type contient exactement 18 valeurs", () => {
    expect(DB_FUNDING_VALUES).toHaveLength(18);
  });

  it("TS BpfFundingType contient exactement 18 valeurs canonical alignées DB", () => {
    expect([...TS_FUNDING_VALUES].sort()).toEqual(DB_FUNDING_VALUES);
  });

  it("Zod programHubFormSchema.bpf_funding_type === DB CHECK (18 valeurs)", () => {
    const missing = DB_FUNDING_VALUES.filter((v) => !zodFundingValues.includes(v));
    const extra = zodFundingValues.filter((v) => !DB_FUNDING_VALUES.includes(v));

    if (missing.length > 0 || extra.length > 0) {
      const msg = [
        `Zod has ${zodFundingValues.length} values but DB CHECK has ${DB_FUNDING_VALUES.length}`,
        missing.length > 0 ? `missing from Zod: ${missing.join(", ")}` : null,
        extra.length > 0 ? `extra in Zod (not in DB): ${extra.join(", ")}` : null,
      ].filter(Boolean).join(". ");
      expect.fail(msg);
    }

    expect(zodFundingValues).toEqual(DB_FUNDING_VALUES);
  });
});

describe("enums-consistency : BpfObjective — TS ↔ Zod ↔ DB CHECK (11 valeurs)", () => {
  const zodObjectiveValues = extractZodEnumValues(
    programHubFormSchema.shape.bpf_objective,
  ).sort();

  it("DB CHECK programs.bpf_objective contient exactement 11 valeurs", () => {
    expect(DB_OBJECTIVE_VALUES).toHaveLength(11);
  });

  it("TS BpfObjective contient exactement 11 valeurs canonical alignées DB", () => {
    expect([...TS_OBJECTIVE_VALUES].sort()).toEqual(DB_OBJECTIVE_VALUES);
  });

  it("Zod programHubFormSchema.bpf_objective === DB CHECK (11 valeurs)", () => {
    const missing = DB_OBJECTIVE_VALUES.filter((v) => !zodObjectiveValues.includes(v));
    const extra = zodObjectiveValues.filter((v) => !DB_OBJECTIVE_VALUES.includes(v));

    if (missing.length > 0 || extra.length > 0) {
      const msg = [
        `Zod has ${zodObjectiveValues.length} values but DB CHECK has ${DB_OBJECTIVE_VALUES.length}`,
        missing.length > 0 ? `missing from Zod: ${missing.join(", ")}` : null,
        extra.length > 0 ? `extra in Zod (not in DB): ${extra.join(", ")}` : null,
      ].filter(Boolean).join(". ");
      expect.fail(msg);
    }

    expect(zodObjectiveValues).toEqual(DB_OBJECTIVE_VALUES);
  });
});

describe("enums-consistency : BPF labels coverage (bpf-calculator.ts)", () => {
  it("BPF_FUNDING_LABELS couvre exactement les 18 valeurs canonical", () => {
    const labelKeys = Object.keys(BPF_FUNDING_LABELS).sort();
    expect(labelKeys).toEqual(DB_FUNDING_VALUES);
    expect(labelKeys).toHaveLength(18);
  });

  it("BPF_OBJECTIVE_LABELS couvre exactement les 11 valeurs canonical", () => {
    const labelKeys = Object.keys(BPF_OBJECTIVE_LABELS).sort();
    expect(labelKeys).toEqual(DB_OBJECTIVE_VALUES);
    expect(labelKeys).toHaveLength(11);
  });

  it("Aucun label orphelin (clé sans valeur canonical)", () => {
    const fundingOrphans = Object.keys(BPF_FUNDING_LABELS).filter(
      (k) => !DB_FUNDING_VALUES.includes(k),
    );
    const objectiveOrphans = Object.keys(BPF_OBJECTIVE_LABELS).filter(
      (k) => !DB_OBJECTIVE_VALUES.includes(k),
    );
    expect(fundingOrphans).toEqual([]);
    expect(objectiveOrphans).toEqual([]);
  });
});

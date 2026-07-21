import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Garde de non-régression FR-20 (story 4.4, AD-6/AD-11) : les colonnes
// `abby_*` ne sont JAMAIS une source pour le BPF, les exports ou les
// rapprochements. Cette garde STRUCTURELLE rougit si un futur dev ajoute
// `abby_state` (ou toute colonne abby_) à un select d'agrégat ou d'export.
//
// Les select strings ne sont pas typées → seul un test qui inspecte le
// SOURCE peut verrouiller l'invariant contre une régression future.

const ROOT = process.cwd();

/** Les 6 surfaces d'agrégat/export de formation_invoices (inventaire 4.4). */
const AGGREGATE_EXPORT_FILES = [
  "src/lib/services/bpf-report-service.ts", // fetchBPFData + fetchBPFDataForSession
  "src/app/(dashboard)/admin/reports/factures/page.tsx", // export CSV factures
  "src/app/(dashboard)/admin/page.tsx", // dashboard CA réalisé/prévisionnel
  "src/app/(dashboard)/admin/affacturage/page.tsx", // liste affacturable
  "src/app/api/affacturage/route.ts", // total affacturé
  "src/lib/dashboard/revenue.ts", // type InvoiceLite + calcul CA
];

/** Extrait les littéraux `.select("…")` d'un source (guillemets simples/doubles). */
function selectLiterals(source: string): string[] {
  const out: string[] = [];
  const re = /\.select\(\s*(["'`])([\s\S]*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[2]);
  return out;
}

/** Fichiers qui DOIVENT porter un select facturation (sentinelle anti-rot).
 * `revenue.ts` en est exclu : c'est un fichier de type + calcul pur, son
 * select vit dans admin/page.tsx. */
const FILES_WITH_INVOICE_SELECT = AGGREGATE_EXPORT_FILES.filter(
  (f) => f !== "src/lib/dashboard/revenue.ts"
);

describe("FR-20 — aucune colonne abby_ dans un select d'agrégat/export de factures", () => {
  it.each(AGGREGATE_EXPORT_FILES)(
    "%s : aucun select d'agrégat (contenant amount) ne contient abby_",
    (relPath) => {
      const source = readFileSync(join(ROOT, relPath), "utf8");
      // Discriminant : un select d'AGRÉGAT/EXPORT de facture contient `amount`.
      // Ça exclut par nature le verrou 3.5 (`.select("abby_push_state")`,
      // sans amount) et tout select non-facture du fichier.
      const invoiceSelects = selectLiterals(source).filter((sel) =>
        sel.includes("amount")
      );
      for (const sel of invoiceSelects) {
        expect(sel, `select d'agrégat/export contient abby_ : « ${sel} »`).not.toMatch(
          /abby_/
        );
      }
    }
  );

  it.each(FILES_WITH_INVOICE_SELECT)(
    "%s porte bien ≥1 select facturation (sentinelle : la liste ne rote pas en silence)",
    (relPath) => {
      const source = readFileSync(join(ROOT, relPath), "utf8");
      const hasAmountSelect = selectLiterals(source).some((sel) =>
        sel.includes("amount")
      );
      expect(hasAmountSelect).toBe(true);
    }
  );

  it("aucune de ces 6 surfaces n'utilise select(\"*\") sur formation_invoices (colonnes explicites obligatoires)", () => {
    // ⚠️ ANGLE MORT documenté : `formations/[id]/invoices/route.ts:21` fait
    // bien `select("*")` (route d'ÉDITION, hors périmètre agrégat) et tire
    // physiquement les abby_* ; le CA/marge de TabFinances est sûr
    // fonctionnellement (il somme `amount`, jamais `abby_state`) mais N'EST
    // PAS couvert par cette garde token. Les 6 surfaces d'AGRÉGAT/EXPORT
    // ci-dessous, elles, doivent rester en colonnes explicites.
    for (const relPath of AGGREGATE_EXPORT_FILES) {
      const source = readFileSync(join(ROOT, relPath), "utf8");
      const starOnInvoices =
        /from\(\s*["'`]formation_invoices["'`]\s*\)[\s\S]{0,120}?\.select\(\s*["'`]\*["'`]/.test(
          source
        );
      expect(starOnInvoices, `${relPath} utilise select("*") sur formation_invoices`).toBe(
        false
      );
    }
  });
});

describe("FR-20 — les types d'entrée des calculs de facturation excluent structurellement abby_", () => {
  it.each([
    ["src/lib/bpf-calculator.ts", "InvoiceForBPF"],
    ["src/lib/bpf-calculator.ts", "InvoiceForDataGaps"],
    ["src/lib/bpf-calculator.ts", "SessionBpfInvoice"],
    ["src/lib/bpf-calculator.ts", "DepositProgressInvoice"],
    ["src/lib/dashboard/revenue.ts", "InvoiceLite"], // type du calcul de CA
  ])("%s : %s ne déclare aucun champ abby_", (relPath, typeName) => {
    const source = readFileSync(join(ROOT, relPath), "utf8");
    const re = new RegExp(`interface ${typeName}\\s*\\{([\\s\\S]*?)\\}`);
    const body = re.exec(source)?.[1];
    expect(body, `type ${typeName} introuvable`).toBeDefined();
    expect(body, `${typeName} déclare un champ abby_`).not.toMatch(/abby_/);
  });
});

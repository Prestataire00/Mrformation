// Recette Abby en MODE TEST (story abby-1-5) — QO-1 (rendu TVA), QO-3
// (numérotation test), cycle asset (AD-23).
//
// Run : ABBY_RECETTE_KEY=<clé> node scripts/abby-recette-mode-test.mjs
// Sortie PDF : $ABBY_RECETTE_OUT ou <tmpdir>/abby-recette/
//
// GARDE VIE-OU-MORT : aucune écriture ne part si le compte n'est pas en mode
// test ET n'est pas le compte MR attendu — re-vérifiée avant chaque finalize.
//
// NB outillage de recette : ce script utilise le SDK directement (hors
// src/lib/abby) — exception assumée à AD-2, qui régit le code de prod.

import Abby from "@abby-inc/node";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SIRET_MR_ATTENDU = "91311329600036";
const SIRET_FACTICE_TEST = "00000000000000"; // jamais celui d'une société réelle
const OUT = process.env.ABBY_RECETTE_OUT || join(tmpdir(), "abby-recette");

const key = process.env.ABBY_RECETTE_KEY;
if (!key) {
  console.error(
    "ABBY_RECETTE_KEY manquante. Run : ABBY_RECETTE_KEY=<clé MR> node scripts/abby-recette-mode-test.mjs"
  );
  process.exit(1);
}

const abby = new Abby(key, { timeout: 15000 });
mkdirSync(OUT, { recursive: true });

const findings = { steps: [], numbers: {}, constats: [] };
const log = (m) => console.log(`[recette] ${m}`);
const record = (name, data) => {
  findings.steps.push({ name, ...data });
  log(`${name} → ${JSON.stringify(data).slice(0, 300)}`);
};

async function assertTestMode(moment) {
  let company;
  try {
    const { data } = await abby.company.getMe({});
    company = data?.company;
  } catch (err) {
    console.error(`[GARDE:${moment}] getMe en échec (${err?.status ?? "réseau"}) — ARRÊT.`);
    process.exit(1);
  }
  const mode = company?.isInTestMode;
  const siret = company?.siret == null ? null : String(company.siret);
  const testOk = mode === 1 || mode === true; // allowlist stricte
  const siretOk = siret === SIRET_MR_ATTENDU;
  log(`[GARDE:${moment}] SIRET=${siret} isInTestMode=${JSON.stringify(mode)}`);
  if (!testOk || !siretOk) {
    console.error(
      `[GARDE:${moment}] REFUS — compte ${siretOk ? "attendu" : "INATTENDU"}, mode test ${testOk ? "actif" : "INACTIF"}. ARRÊT, aucune écriture.`
    );
    process.exit(1);
  }
}

async function savePdf(billingId, filename) {
  const { data } = await abby.billing.downloadPdf({ path: { billingId } });
  const buf = Buffer.from(await data.arrayBuffer());
  const p = join(OUT, filename);
  writeFileSync(p, buf);
  record(`pdf:${filename}`, { bytes: buf.length, path: p });
  return p;
}

function lines(vatCode) {
  return [
    {
      designation: "Formation test recette LMS — cas arrondi",
      unitPrice: 123456, // 1234,56 €
      quantity: 1,
      quantityUnit: "unit",
      type: "service_delivery",
      vatCode,
      isTaxIncluded: false,
    },
    {
      designation: "Formation test recette LMS — heures",
      unitPrice: 50000, // 500,00 €
      quantity: 2,
      quantityUnit: "hour",
      type: "service_delivery",
      vatCode,
      isTaxIncluded: false,
    },
  ];
}

async function setTimeline(invoiceId) {
  // ⚠️ emittedAt est en SECONDES (constat du 16/07 : les millisecondes sont
  // ACCEPTÉES sans erreur puis interprétées comme des secondes → date 58509).
  await abby.invoice.updateTimeline({
    path: { invoiceId },
    body: { emittedAt: Math.floor(Date.now() / 1000), paymentDelay: "thirty_days" },
  });
}

async function buildInvoice(customerId, label, vatCode, generalInformations) {
  const { data: draft } = await abby.invoice.createInvoiceByContactOrOrganizationId({
    path: { customerId },
  });
  record(`facture:${label}:brouillon`, { id: draft.id, state: draft.state, test: draft.test });

  await abby.billing.updateLines({ path: { billingId: draft.id }, body: { lines: lines(vatCode) } });
  await setTimeline(draft.id);
  await abby.invoice.updateInvoiceGeneralInformations({
    path: { invoiceId: draft.id },
    body: generalInformations,
  });

  const { data: before } = await abby.invoice.getInvoice({ path: { invoiceId: draft.id } });
  record(`facture:${label}:avant-finalize`, {
    finalizable: before.finalizable,
    finalizeRequirements: before.finalizeRequirements,
  });

  await assertTestMode(`finalize:${label}`);
  await abby.billing.finalize({ path: { billingId: draft.id } });

  const { data: fin } = await abby.invoice.getInvoice({ path: { invoiceId: draft.id } });
  findings.numbers[label] = { id: fin.id, number: fin.number, state: fin.state, test: fin.test };
  record(`facture:${label}:finalisée`, findings.numbers[label]);
  return fin;
}

// ─── Run ───────────────────────────────────────────────────────────────────
await assertTestMode("démarrage");

// 1. Organization de test — réutilisée si un run précédent l'a créée
// (évite l'accumulation dans le compte test), sinon créée SANS siret
// (constat pour validation.ts)
let orgId;
try {
  const { data: existing } = await abby.organization.retrieveOrganizations({
    query: { page: 1, limit: 10, search: "TEST RECETTE LMS" },
  });
  const found = (existing.docs ?? existing)?.[0];
  if (found?.id) {
    orgId = found.id;
    record("organization:réutilisée", { id: orgId });
  }
} catch {
  // liste indisponible → on créera
}
if (!orgId) try {
  const { data: org } = await abby.organization.createOrganization({
    body: { name: "TEST RECETTE LMS — à supprimer", emails: ["test-recette@example.invalid"] },
  });
  orgId = org.id;
  findings.constats.push("createOrganization accepte l'absence de siret");
  record("organization:sans-siret", { id: orgId });
} catch (err) {
  record("organization:sans-siret:échec", { status: err?.status, message: String(err?.message).slice(0, 200) });
  findings.constats.push(`createOrganization REFUSE sans siret (status ${err?.status}) — champ requis pour validation.ts`);
  const { data: org } = await abby.organization.createOrganization({
    body: {
      name: "TEST RECETTE LMS — à supprimer",
      emails: ["test-recette@example.invalid"],
      siret: SIRET_FACTICE_TEST,
    },
  });
  orgId = org.id;
  record("organization:avec-siret-factice", { id: orgId });
}

// 2. Facture (a) assujettie 20 % — le régime réel actuel des 2 entités
await buildInvoice(orgId, "a-tva20", "FR_2000", {});

// 3. Facture (b) exonérée art. 261-4-4°
const invoiceB = await buildInvoice(orgId, "b-exoneree", "FR_00HT", {
  vatMention: "vat_exemption",
  footerNote: "TVA non applicable, article 261-4-4° du CGI.",
});

await savePdf(findings.numbers["a-tva20"].id, "facture-a-tva20.pdf");
await savePdf(invoiceB.id, "facture-b-exoneree.pdf");

// 4. Cycle asset (avoir) depuis la facture (b) finalisée — AD-23
const { data: assetCreated } = await abby.invoice.createAsset({ path: { invoiceId: invoiceB.id } });
record("asset:créé", { raw: JSON.stringify(assetCreated).slice(0, 500) });
const assetId = assetCreated.id;

const { data: assetRead } = await abby.asset.getAsset({ path: { assetId } });
record("asset:lu", {
  state: assetRead.state,
  linesCount: Array.isArray(assetRead.lines) ? assetRead.lines.length : "n/a",
  raw: JSON.stringify(assetRead).slice(0, 600),
});

// billing.updateLines accepte-t-il un assetId ? (avoir partiel — constat AD-23)
try {
  await abby.billing.updateLines({
    path: { billingId: assetId },
    body: { lines: [lines("FR_00HT")[0]] },
  });
  findings.constats.push("billing.updateLines ACCEPTE un assetId (avoir partiel possible)");
} catch (err) {
  findings.constats.push(
    `billing.updateLines REFUSE un assetId (status ${err?.status}) — avoir = compensation intégrale uniquement`
  );
}

try {
  await abby.asset.updateGeneralInformations({
    path: { assetId },
    body: { footerNote: "TVA non applicable, article 261-4-4° du CGI." },
  });
  findings.constats.push("asset.updateGeneralInformations OK");
} catch (err) {
  findings.constats.push(`asset.updateGeneralInformations en échec (status ${err?.status})`);
}

await assertTestMode("finalize:avoir");
await abby.billing.finalize({ path: { billingId: assetId } });
const { data: assetFin } = await abby.asset.getAsset({ path: { assetId } });
findings.numbers["avoir"] = { id: assetFin.id, number: assetFin.number, state: assetFin.state };
record("asset:finalisé", findings.numbers["avoir"]);
await savePdf(assetId, "avoir-test.pdf");

// 5. Post-run : le compte est toujours en mode test (QO-3)
await assertTestMode("post-run");

console.log("\n═══ RÉCAPITULATIF JSON ═══");
console.log(JSON.stringify(findings, null, 2));

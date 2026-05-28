import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/page.tsx",
);

const pageSource = readFileSync(PAGE_PATH, "utf-8");

describe("em-c-6 — History Detail en Sheet slide-in droite", () => {
  it("importe Sheet shadcn (au lieu d'utiliser Dialog pour le détail historique)", () => {
    expect(pageSource).toMatch(
      /import \{ Sheet, SheetContent, SheetHeader, SheetTitle \} from "@\/components\/ui\/sheet"/,
    );
  });

  it("le détail historique utilise <Sheet> avec side='right' au lieu de Dialog", () => {
    // Le bloc commence par "em-c-6 : History Detail SHEET"
    const sheetBlock = pageSource.substring(
      pageSource.indexOf("em-c-6 : History Detail SHEET"),
      pageSource.indexOf("em-c-6 : History Detail SHEET") + 3000,
    );
    expect(sheetBlock).toMatch(/<Sheet open=\{detailDialogOpen\} onOpenChange=\{setDetailDialogOpen\}>/);
    expect(sheetBlock).toMatch(/<SheetContent\s+side="right"/);
    expect(sheetBlock).toMatch(/<SheetHeader>[\s\S]+?<SheetTitle/);
  });

  it("le Sheet utilise max-w-xl pour width responsive (UX-DR7 ~480px)", () => {
    const sheetBlock = pageSource.substring(
      pageSource.indexOf("em-c-6 : History Detail SHEET"),
      pageSource.indexOf("em-c-6 : History Detail SHEET") + 3000,
    );
    expect(sheetBlock).toMatch(/sm:max-w-xl/);
  });

  it("le Sheet est scrollable (overflow-y-auto)", () => {
    const sheetBlock = pageSource.substring(
      pageSource.indexOf("em-c-6 : History Detail SHEET"),
      pageSource.indexOf("em-c-6 : History Detail SHEET") + 3000,
    );
    expect(sheetBlock).toMatch(/overflow-y-auto/);
  });

  it("le bouton Renvoyer manuel reste accessible pour status failed/pending", () => {
    // Bouton conditionnel sur failed OU pending, handleResend appelé
    expect(pageSource).toMatch(
      /detailItem\?\.status === "failed" \|\| detailItem\?\.status === "pending"/,
    );
    expect(pageSource).toMatch(/if \(detailItem\) handleResend\(detailItem\)/);
  });

  it("Plus de Dialog wrapper pour le history detail (DialogContent/Footer retirés)", () => {
    // Le code "History Detail Dialog" comment est retiré, on n'a plus que "History Detail SHEET"
    expect(pageSource).not.toMatch(/History Detail Dialog/);
  });

  it("affiche toujours les méta-infos clés (destinataire, sent_at, status, sender, template, subject, body, error)", () => {
    expect(pageSource).toMatch(/Destinataire/);
    expect(pageSource).toMatch(/Date d&apos;envoi/);
    expect(pageSource).toMatch(/Statut/);
    expect(pageSource).toMatch(/Envoyé par/);
    expect(pageSource).toMatch(/Modèle utilisé/);
    expect(pageSource).toMatch(/Corps de l&apos;email/);
  });
});

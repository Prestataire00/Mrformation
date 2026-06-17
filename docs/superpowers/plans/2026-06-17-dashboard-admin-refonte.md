# Refonte tableau de bord admin — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes en checkbox `- [ ]`. Branche : `feat/dashboard-admin-refonte`. Commits ciblés (`git add <fichiers>`, jamais `-A` : fichiers non-suivis hors périmètre).

**Goal:** Alléger le tableau de bord admin et corriger 3 features mal branchées (CA depuis factures, sessions à venir, factures en retard).

**Architecture:** Fonction pure testable pour le CA (`src/lib/dashboard/revenue.ts`) ; le reste = éditions ciblées de `page.tsx` (data) et des composants `Admin*` + `constants.ts` (UI/défauts). Isolation `entity_id` conservée.

**Tech Stack:** Next.js 14, TypeScript strict, Vitest, Supabase, shadcn/ui.

**Référence spec :** `docs/superpowers/specs/2026-06-17-dashboard-admin-refonte-design.md`

---

## File Structure
| Fichier | Rôle | Action |
|---------|------|--------|
| `src/lib/dashboard/revenue.ts` | Fonction pure `computeRevenueFromInvoices` | Créer |
| `src/lib/dashboard/__tests__/revenue.test.ts` | Tests TDD | Créer |
| `src/app/(dashboard)/admin/page.tsx` | CA via factures, sessions 'planned', factures en retard, attentionCount | Modifier |
| `src/app/(dashboard)/admin/_components/AdminHero.tsx` | Bandeau slim | Modifier |
| `src/app/(dashboard)/admin/_components/AdminKPICards.tsx` | 4 cartes + ligne compacte formations | Modifier |
| `src/app/(dashboard)/admin/_components/constants.ts` | Défauts widgets (activity/calendar off, 2 KPI off) | Modifier |

---

## Task 1 : Fonction pure CA depuis factures (TDD)

**Files:** Create `src/lib/dashboard/revenue.ts`, Test `src/lib/dashboard/__tests__/revenue.test.ts`

- [ ] **Step 1 : Écrire le test**
```ts
import { describe, it, expect } from "vitest";
import { computeRevenueFromInvoices, type InvoiceLite } from "../revenue";

const Y = 2026;
describe("computeRevenueFromInvoices", () => {
  it("réalisé = factures payées de l'année (par paid_at)", () => {
    const inv: InvoiceLite[] = [
      { amount: 1000, status: "paid", paid_at: "2026-03-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { amount: 500, status: "paid", paid_at: "2025-12-01T00:00:00Z", created_at: "2025-11-01T00:00:00Z" }, // année préc.
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 1000, previsionnel: 0 });
  });
  it("paid sans paid_at → repli sur created_at", () => {
    const inv: InvoiceLite[] = [{ amount: 800, status: "paid", paid_at: null, created_at: "2026-02-01T00:00:00Z" }];
    expect(computeRevenueFromInvoices(inv, Y).realise).toBe(800);
  });
  it("prévisionnel = factures émises non payées de l'année (pending/sent/late)", () => {
    const inv: InvoiceLite[] = [
      { amount: 300, status: "pending", paid_at: null, created_at: "2026-04-01T00:00:00Z" },
      { amount: 200, status: "sent", paid_at: null, created_at: "2026-05-01T00:00:00Z" },
      { amount: 100, status: "late", paid_at: null, created_at: "2026-06-01T00:00:00Z" },
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 0, previsionnel: 600 });
  });
  it("cancelled ignoré ; amount null = 0", () => {
    const inv: InvoiceLite[] = [
      { amount: 9999, status: "cancelled", paid_at: null, created_at: "2026-01-01T00:00:00Z" },
      { amount: null, status: "paid", paid_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 0, previsionnel: 0 });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** : `npx vitest run src/lib/dashboard/__tests__/revenue.test.ts` → FAIL (module manquant).

- [ ] **Step 3 : Implémenter `src/lib/dashboard/revenue.ts`**
```ts
export interface InvoiceLite {
  amount: number | null;
  status: string;
  paid_at: string | null;
  created_at: string;
}

const UNPAID = new Set(["pending", "sent", "late"]);

/** Réalisé = factures payées de `year` (par paid_at, repli created_at).
 *  Prévisionnel = factures émises non payées de `year` (pending/sent/late). */
export function computeRevenueFromInvoices(
  invoices: InvoiceLite[],
  year: number,
): { realise: number; previsionnel: number } {
  let realise = 0;
  let previsionnel = 0;
  for (const inv of invoices) {
    const amt = inv.amount ?? 0;
    if (inv.status === "paid") {
      const ref = inv.paid_at ?? inv.created_at;
      if (new Date(ref).getUTCFullYear() === year) realise += amt;
    } else if (UNPAID.has(inv.status)) {
      if (new Date(inv.created_at).getUTCFullYear() === year) previsionnel += amt;
    }
  }
  return { realise: Math.round(realise), previsionnel: Math.round(previsionnel) };
}
```

- [ ] **Step 4 : Vérifier** : tests PASS (4/4) ; `npx tsc --noEmit` → 0 erreur.
- [ ] **Step 5 : Commit** : `git add src/lib/dashboard/revenue.ts src/lib/dashboard/__tests__/revenue.test.ts && git commit -m "feat(dashboard): CA depuis factures (fonction pure TDD)"`

---

## Task 2 : Brancher la page sur les vraies données

**Files:** Modify `src/app/(dashboard)/admin/page.tsx`

- [ ] **Step 1 : Lire** la page pour localiser : le bloc de calcul du CA (≈ lignes 280-373, qui lit `crm_prospects` + parse `notes` + projection N-1/N-2), la requête « sessions à venir » (≈ l.450-460), le state (`caRealise`, `caPrevisionnel`, `overdueTasks`, `alerts`), et le rendu `AdminAttentionPanel` (≈ l.628-632) + `<AdminHero attentionCount=...>` (≈ l.602).

- [ ] **Step 2 : CA depuis factures.** Importer le helper en tête : `import { computeRevenueFromInvoices } from "@/lib/dashboard/revenue";`. **Remplacer tout le bloc de calcul CA** (les requêtes `crm_prospects` won/pipeline/N-1/N-2 + le parsing des notes + le calcul `previsionnel`) par :
```ts
    // CA depuis les factures (source fiable ; remplace l'ancien parsing des notes CRM).
    let invoicesQ = supabase
      .from("formation_invoices")
      .select("amount, status, paid_at, created_at");
    if (entityId) invoicesQ = invoicesQ.eq("entity_id", entityId);
    const { data: invoices } = await invoicesQ;
    const { realise, previsionnel } = computeRevenueFromInvoices(invoices ?? [], year);
    setCaRealise(realise);
    setCaPrevisionnel(previsionnel);
```
Supprimer le code mort devenu inutile (variables des prospects won/pipeline/N-1/N-2 si elles ne servent qu'au CA).

- [ ] **Step 3 : Compte factures en retard.** Ajouter un state `const [overdueInvoices, setOverdueInvoices] = useState(0);` (près de `caRealise`). Dans la même zone de fetch, ajouter :
```ts
    let lateInvQ = supabase
      .from("formation_invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "late");
    if (entityId) lateInvQ = lateInvQ.eq("entity_id", entityId);
    const { count: lateCount } = await lateInvQ;
    setOverdueInvoices(lateCount ?? 0);
```

- [ ] **Step 4 : Sessions à venir — inclure `planned`.** Dans la requête `upcoming`, remplacer `.in("status", ["upcoming", "in_progress"])` par `.in("status", ["planned", "upcoming", "in_progress"])`.

- [ ] **Step 5 : Brancher la carte « Factures en retard » + attentionCount.** Dans `AdminAttentionPanel`, remplacer `count: 0` de `overdue-invoices` par `count: overdueInvoices`. Et mettre à jour le hero : `attentionCount={overdueTasks.length + alerts.length + overdueInvoices}`.

- [ ] **Step 6 : Vérifier** : `npx tsc --noEmit` → 0 erreur. `npx vitest run` → vert.
- [ ] **Step 7 : Commit** : `git add "src/app/(dashboard)/admin/page.tsx" && git commit -m "fix(dashboard): CA via factures, sessions 'planned', factures en retard réelles"`

---

## Task 3 : Allègement visuel

**Files:** Modify `AdminHero.tsx`, `AdminKPICards.tsx`, `constants.ts`, `page.tsx`

- [ ] **Step 1 : Hero slim (`AdminHero.tsx`).** Lire le composant. Réduire le bloc à un **bandeau compact** : une seule rangée (flex, items-center, justify-between) — à gauche : `Bonjour/Bon... {firstName}` + une ligne `{ongoingSessions} formation(s) en cours · {attentionCount} à traiter` ; à droite : le bouton `Voir ce qui demande votre attention` (Link `#attention`). Garder le dégradé de marque mais en hauteur réduite (`py-4` au lieu d'un grand bloc, pas de gros titre `text-4xl`). Conserver la signature de props (`firstName`, `ongoingSessions`, `attentionCount`).

- [ ] **Step 2 : KPI 6→4 + ligne compacte (`constants.ts`).** Dans `DEFAULT_KPI_CONFIG`, passer `sessions_en_cours` et `sessions_terminees` à `visible: false` (lignes 65-66). Les 4 cartes restantes visibles : `clients_actifs`, `nouveaux_apprenants`, `ca_realise`, `ca_previsionnel`.

- [ ] **Step 3 : Ligne compacte formations (`AdminKPICards.tsx`).** Sous la grille des cartes KPI, ajouter une ligne compacte (toujours visible) résumant les formations :
```tsx
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 px-1">
        <span><strong className="text-gray-800">{ongoingSessions}</strong> formation{ongoingSessions > 1 ? "s" : ""} en cours</span>
        <span><strong className="text-gray-800">{doneSessions}</strong> terminée{doneSessions > 1 ? "s" : ""} {year}</span>
      </div>
```
(Les props `ongoingSessions`, `doneSessions`, `year` existent déjà.) Placer ce bloc juste après la grille de cartes, dans le même conteneur racine du composant.

- [ ] **Step 4 : Replier calendrier + activité par défaut (`constants.ts`).** Dans `DEFAULT_WIDGET_CONFIG` (≈ l.54-59), passer `activity` et `calendar` à `visible: false`. (Réactivables via « Personnaliser ».)

- [ ] **Step 5 : Retirer le doublon « tâches en retard » (`page.tsx`).** Supprimer le bloc de rendu de la liste détaillée :
```tsx
          {isWidgetVisible("alerts") && overdueTasks.length > 0 && (
            <AdminOverdueTasks overdueTasks={overdueTasks} />
          )}
```
(Le bandeau compact `AdminAttentionPanel` conserve l'info « Tâches en retard » cliquable.) Retirer l'import `AdminOverdueTasks` s'il devient inutilisé (vérifier qu'il n'est pas utilisé ailleurs dans le fichier).

- [ ] **Step 6 : Vérifier** : `npx tsc --noEmit` → 0 erreur. `npx vitest run` → vert. (Vérifier qu'aucun import ne devient orphelin → erreur lint/tsc.)
- [ ] **Step 7 : Commit** : `git add "src/app/(dashboard)/admin/page.tsx" "src/app/(dashboard)/admin/_components/AdminHero.tsx" "src/app/(dashboard)/admin/_components/AdminKPICards.tsx" "src/app/(dashboard)/admin/_components/constants.ts" && git commit -m "feat(dashboard): allègement (hero slim, 4 KPI, calendrier/activité repliés, doublon retiré)"`

---

## Notes d'exécution
- **TDD** strict sur Task 1. Tasks 2-3 : tsc + suite verte (pas de test unitaire UI).
- **Isolation `entity_id`** : ne jamais retirer le filtre entité des requêtes (factures, sessions).
- **Ne pas toucher** : le mécanisme « Personnaliser » (on ne change que des valeurs `visible` par défaut), le CRM/prospects.
- Effet visuel réel à confirmer après déploiement Netlify.

## Self-Review (fait)
- Couverture spec : F1 CA factures (Task 1 + Task 2 §2) ✓ · F2 sessions 'planned' (Task 2 §4) ✓ · F3 factures en retard (Task 2 §3+§5) ✓ · A1 hero slim (Task 3 §1) ✓ · A2 doublon retiré (Task 3 §5) ✓ · A3 calendrier+activité repliés (Task 3 §4) ✓ · A4 6→4 KPI + ligne compacte (Task 3 §2+§3) ✓ · entity_id ✓.
- Placeholders : aucun (code réel fourni ; les lignes approximatives renvoient à une lecture ciblée).
- Cohérence types : `InvoiceLite` / `computeRevenueFromInvoices` identiques entre Task 1 et Task 2 ; props `AdminHero`/`AdminKPICards` inchangées.

# Sous-chantier Émargement — Volet A Sécurité (P0-1 + P0-2)

> **Spec validée par Wissam le 2026-05-26.**
> Source : Deep-dive [docs/deep-dive-tab-emargements.md](../../deep-dive-tab-emargements.md) (commit `4676b65`).

---

## 1. Contexte

Le deep-dive BMAD de l'onglet Émargement (TabEmargements 1144 LOC + TabAbsences 375 LOC) du 2026-05-26 a identifié **2 bugs P0 confirmés en production** plus une dette technique substantielle (Volets B/C/D/E/F). Ce sous-chantier traite **uniquement le Volet A — Sécurité multi-tenant** (~10h) pour fermer rapidement la faille publique et la non-conformité Qualiopi.

Les Volets B (type safety) et C (robustesse) seront traités dans un **Sous-chantier 2** indépendant après merge prod du Volet A.

**Score qualité visé après Volet A** : passage de 6/10 à ~7/10 (sécurité résolue, dette technique restante).

---

## 2. Goal

Fermer les 2 bugs P0 de sécurité de l'émargement + audit défensif des `entity_id` sur les routes INSERT/UPDATE critiques.

---

## 3. Périmètre

### 3.1 In-scope

**Livrable 1 — Fix RLS `signing_tokens` (P0-1)** : DROP de la policy `signing_tokens_public_read TO anon USING (true)` qui permet l'énumération massive des tokens via PostgREST.

**Livrable 2 — Canvas admin bulk (P0-2)** : remplacement de la string littérale `signature_data: "admin_bulk"` par une vraie signature graphique dessinée par l'admin (canvas réutilisé via `<SignaturePad>`) et appliquée à N personnes en bulk.

**Livrable 3 — Audit entity_id ciblé** : passage en revue défensif de 6 routes API émargement/signatures qui font INSERT ou UPDATE, fix si finding.

### 3.2 Out-of-scope (reportés au Sous-chantier 2)

- Retrait des 5× `(e: any)` et 13× `as unknown as` dans TabEmargements + TabAbsences
- Catch + toast sur les 3 catch vides
- `await onRefresh()` sur les fire-and-forget
- Retry/backoff polling 3s
- Fallback `signer_id = user.id` orphelin
- Retrait du panneau debug verbose en prod

### 3.3 Out-of-scope (Volets D/E/F, plus tard)

- UX pilotage (vue d'ensemble signataires, relance, PDF 1-clic)
- Découpage de TabEmargements 1144 LOC en sections/
- Retrait de `/admin/signatures` legacy 1279 LOC
- Tests Vitest service `load-signatures`, `save-signature`

### 3.4 Cleanup rétroactif `admin_bulk`

**Décision** : ignorer les signatures historiques contenant `"admin_bulk"`. Pas de migration SQL de cleanup. Les futures signatures (post-fix) seront conformes. Les sessions terminées ne régénèrent pas leurs PDFs.

---

## 4. Architecture

### 4.1 Livrable 1 — Migration SQL `drop_signing_tokens_public_read.sql`

**État actuel** ([supabase/migrations/add_missing_rls_policies.sql:36-38](../../../supabase/migrations/add_missing_rls_policies.sql)) :

```sql
CREATE POLICY "signing_tokens_public_read" ON signing_tokens
  FOR SELECT TO anon
  USING (true);  -- ⚠️ TOUS les tokens lisibles par n'importe qui avec la clé anon
```

**Pourquoi le DROP est sans risque** : les pages publiques `/sign/[token]` et `/questionnaire/[token]` ne lisent **pas** `signing_tokens` via le client Supabase anon. Elles passent par les routes API serveur :
- `/api/documents/sign-status?token=...`
- `/api/documents/sign` (POST)

Ces routes utilisent `SUPABASE_SERVICE_ROLE_KEY` ([sign-status:7-9](../../../src/app/api/documents/sign-status/route.ts)) qui **bypass RLS**. La policy `TO anon` est purement décorative et constitue une faille pure.

**Nouvelle migration** :

```sql
-- supabase/migrations/drop_signing_tokens_public_read.sql
-- ============================================================
-- Migration : Suppression de la policy RLS publique sur signing_tokens
-- ============================================================
-- Cette policy permettait `GET /rest/v1/signing_tokens` à n'importe qui
-- via la clé anon (énumération massive de tokens de signature).
--
-- En pratique, aucun code ne s'appuyait sur cette policy : les pages
-- publiques /sign/[token] passent par /api/documents/sign-status qui
-- utilise SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
--
-- La policy `signing_tokens_authenticated_all` (existante) reste en place
-- pour les rôles authenticated avec filtrage entity_id strict.
-- ============================================================

DROP POLICY IF EXISTS "signing_tokens_public_read" ON signing_tokens;
```

### 4.2 Livrable 2 — Canvas admin bulk

**État actuel** ([TabEmargements.tsx:397-432](../../../src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx#L397)) :

```ts
const handleBulkSign = async () => {
  setBulkSigning(true);
  let signed = 0;
  const all = [
    ...bulkSignSlot.unsignedTrainers.map(t => ({ id: t.id, type: "trainer" as const })),
    ...bulkSignSlot.unsignedLearners.map(l => ({ id: l.id, type: "learner" as const })),
  ];

  for (const person of all) {
    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: formation.id,
          signature_data: "admin_bulk",  // ← LITTÉRAL
          time_slot_id: bulkSignSlot.slotId,
          signer_id: person.id,
          signer_type: person.type,
        }),
      });
      if (res.ok) signed++;
    } catch {
      // continue on error
    }
  }
  // ...
};
```

**Le sanitizer existant ne bloque pas la string** : [sanitize-svg.ts:83-102](../../../src/lib/utils/sanitize-svg.ts) — `sanitizeSignatureSvg("admin_bulk")` retourne `"admin_bulk"` tel quel (aucune balise HTML à strip). La string passe à l'INSERT et contamine les PDFs Qualiopi.

**Architecture cible** : Dialog en 2 étapes :

```
┌─────────────────────────────────────────────────────────┐
│ Dialog bulkSignSlot (étendu en 2 étapes)                │
│                                                          │
│  step="confirm":                                         │
│    "Marquer N personnes comme présentes ?"               │
│    [Annuler] [Suivant →]                                 │
│                                                          │
│  step="sign":                                            │
│    "Dessinez votre signature (sera appliquée à N pers.)"│
│    <SignaturePad onChange={setAdminSignature} />        │
│    [← Retour] [Confirmer]                                │
└─────────────────────────────────────────────────────────┘
```

**Type du state** :

```ts
interface BulkSignDialogState {
  open: boolean;
  step: "confirm" | "sign";
  slotId: string;
  slotLabel: string;
  unsignedLearners: Array<{ id: string; name: string }>;
  unsignedTrainers: Array<{ id: string; name: string }>;
  adminSignature: string | null;
}
```

**Helper de validation** (nouveau, `src/lib/utils/validate-bulk-signature.ts`) :

```ts
/**
 * Valide qu'un signature_data est utilisable pour un bulk-sign admin.
 * Reject :
 *  - null / vide
 *  - La string littérale "admin_bulk" (bug historique pré-fix)
 *  - Toute string sans préfixe data: ni structure SVG
 */
export function isValidAdminBulkSignature(signatureData: string | null): boolean {
  if (!signatureData || typeof signatureData !== "string") return false;
  if (signatureData === "admin_bulk") return false;
  // Accept data URL images (PNG/JPG/SVG) ou SVG raw
  if (signatureData.startsWith("data:image/")) return true;
  if (signatureData.trim().startsWith("<svg")) return true;
  return false;
}
```

Ce helper sera utilisé :
1. Côté client pour bloquer le bouton "Confirmer" tant que pas de signature valide
2. Côté serveur (route `/api/signatures` POST) en défense en profondeur — refus 400 si signature invalide

**Modification de `handleBulkSign`** :

```ts
const handleBulkSign = async () => {
  // Garde côté UI (le disabled du bouton garantit déjà ce cas)
  if (!isValidAdminBulkSignature(bulkSignSlot.adminSignature)) {
    toast({ title: "Signature admin manquante", variant: "destructive" });
    return;
  }
  setBulkSigning(true);
  // ...
  for (const person of all) {
    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: formation.id,
          signature_data: bulkSignSlot.adminSignature,  // ← signature dessinée
          time_slot_id: bulkSignSlot.slotId,
          signer_id: person.id,
          signer_type: person.type,
        }),
      });
      if (res.ok) signed++;
    } catch {
      // continue on error
    }
  }
  // ... (rest unchanged)
};
```

**Défense en profondeur côté route API** : ajouter dans `/api/signatures` POST une rejection 400 si `signature_data === "admin_bulk"`. C'est défensif et zero-risk côté flow client (qui n'envoie plus jamais cette valeur).

### 4.3 Livrable 3 — Audit entity_id ciblé

**6 routes auditées** :

| # | Route | Méthode | Table cible | Type op |
|---|-------|---------|-------------|---------|
| 1 | `/api/signatures` | POST | `signatures` | INSERT |
| 2 | `/api/emargement/slots` | POST | `session_time_slots` (ou équivalent) | INSERT |
| 3 | `/api/emargement/sign-canvas` | POST | `signatures` | INSERT (token public) |
| 4 | `/api/emargement/justify-absence` | POST/PATCH | `enrollment_absences` (à confirmer) | INSERT/UPDATE |
| 5 | `/api/emargement/marquer-absent` | POST | `enrollments` | UPDATE |
| 6 | `/api/signatures/[id]` | DELETE | `signatures` | DELETE |

**Procédure d'audit pour chaque route** :

Pour chaque route, vérifier en lisant le code :
- **INSERT** : la valeur `entity_id` est-elle bien passée au `.insert({...})` ? Si oui, d'où vient-elle (auth.profile.entity_id, résolu via token, ou autre) ?
- **UPDATE/DELETE** : le filtre `WHERE` inclut-il `entity_id` (direct ou proxy via session_id) ? Si non, peut-on attaquer cross-tenant en passant un id d'une autre entité ?

**Procédure de fix** (si finding) :
- INSERT manquant : ajouter `entity_id: auth.profile.entity_id` (ou résolu via le token public)
- WHERE manquant : ajouter `.eq("entity_id", auth.profile.entity_id)`

**Livrable** : un fichier `docs/audits/2026-05-26-emargement-entity-id-audit.md` listant les 6 routes avec verdict :
- ✅ OK (entity_id présent et correct)
- ⚠️ Fixed (manquait, fixé dans ce sous-chantier)

---

## 5. Tests

### 5.1 Tests Vitest TDD failing-first

**Fichier** : `src/lib/utils/__tests__/validate-bulk-signature.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";

describe("isValidAdminBulkSignature", () => {
  it("rejette null et string vide", () => {
    expect(isValidAdminBulkSignature(null)).toBe(false);
    expect(isValidAdminBulkSignature("")).toBe(false);
  });

  it("rejette la string littérale 'admin_bulk'", () => {
    expect(isValidAdminBulkSignature("admin_bulk")).toBe(false);
  });

  it("accepte un data URL PNG", () => {
    expect(isValidAdminBulkSignature("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("accepte un SVG raw", () => {
    expect(isValidAdminBulkSignature("<svg width='100'><path d='M0 0L10 10' /></svg>")).toBe(true);
  });

  it("rejette toute string sans préfixe data: ni SVG", () => {
    expect(isValidAdminBulkSignature("juste du texte")).toBe(false);
    expect(isValidAdminBulkSignature("admin_signature")).toBe(false);
  });
});
```

### 5.2 Tests Vitest existants

La suite complète (baseline ≥ 526 tests) doit rester verte après les modifications.

### 5.3 Coverage cible

- `validate-bulk-signature.ts` : 100% (helper trivial)
- Pas de modification du seuil existant sur `questionnaire-scoring.ts` (100% maintenu)

---

## 6. Critères d'acceptance

**Technique** :
- [ ] Migration `drop_signing_tokens_public_read.sql` créée
- [ ] `handleBulkSign` n'envoie plus jamais la string `"admin_bulk"` (vérifié par grep + tests)
- [ ] Dialog bulk admin a 2 étapes (confirm → sign) avec canvas SignaturePad
- [ ] State `BulkSignDialogState` étendu avec `step` + `adminSignature`
- [ ] Helper `isValidAdminBulkSignature` exporté + utilisé côté client (gate UI) + côté serveur (défense en profondeur)
- [ ] Route `/api/signatures` POST refuse 400 si `signature_data === "admin_bulk"`
- [ ] Audit doc créé avec verdict sur les 6 routes
- [ ] Tests Vitest verts (suite complète, baseline + 5 nouveaux tests)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` success

**Validation manuelle Wissam (pre-push prod)** :
- [ ] `curl -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/signing_tokens?limit=1"` renvoie `[]` après migration
- [ ] Page `/sign/<token>` continue de fonctionner sur un token valide existant (test sur compte témoin)
- [ ] Bulk-sign UI : Dialog s'ouvre, étape 1 fonctionne, étape 2 affiche canvas, dessiner + confirmer = signatures créées
- [ ] DB check : `SELECT signature_data FROM signatures WHERE signed_at >= now() - interval '5 minutes'` → tous data URLs PNG/SVG, aucun `"admin_bulk"`
- [ ] PDF feuille d'émargement post-bulk : signatures graphiques visibles dans le PDF

---

## 7. Pattern d'exécution

**Branche** : `feat/emargement-volet-a-securite` (depuis `main` à `4676b65`)

**Découpage suggéré** (~8-10 tâches bite-sized 2-5 min) :

1. **Task 0** — Baseline + branche + grep recap (tests verts, TS clean, 2 P0 listés)
2. **Task 1** — Helper `isValidAdminBulkSignature` + 5 tests TDD failing-first
3. **Task 2** — Migration SQL `drop_signing_tokens_public_read.sql` + commentaire détaillé
4. **Task 3** — Défense en profondeur route `/api/signatures` POST (refus 400 si "admin_bulk")
5. **Task 4** — Extension state `BulkSignDialogState` (step + adminSignature)
6. **Task 5** — Dialog 2-étapes (confirm → sign) + intégration SignaturePad
7. **Task 6** — Modifier `handleBulkSign` pour utiliser `adminSignature` + retirer "admin_bulk" littéral
8. **Task 7** — Audit entity_id 6 routes + création doc verdict
9. **Task 8** — Vérification finale (tests verts + tsc + build)
10. **Task 9** — STOP pour validation manuelle stricte Wissam (curl RLS + bulk-sign UI + DB check)
11. **Task 10** — Après Go — finishing-a-development-branch (merge main + push)

**Sécurité prod** :
- Migration SQL appliquée **après merge** dans Supabase Dashboard (pattern habituel des chantiers précédents)
- Pas de breaking change dans le code applicatif (la policy DROP n'impacte aucun consumer)

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Migration DROP policy casse un consumer caché non identifié | Très faible | Élevé | Recherche exhaustive `signing_tokens` dans le code avant DROP. Migration appliquée avec rollback préparé (`CREATE POLICY IF NOT EXISTS ...`). |
| Le SignaturePad ne renvoie pas un format compatible avec le sanitizer existant | Faible | Moyen | Test manuel pre-push avec dessin réel ; le SignaturePad renvoie déjà des data URL PNG (vérifié dans `/sign/[token]`). |
| Admin clique trop vite (canvas vide) | Moyen | Faible | Bouton "Confirmer" disabled tant que `!adminSignature`. |
| Boucle séquentielle 5 round-trips lente sur 20+ personnes | Faible | Faible | YAGNI — si problème, on optimisera plus tard (Approche C reportée). |
| Audit entity_id trouve des findings nombreux qui débordent du scope | Faible | Moyen | Si > 3h de fix sont nécessaires, escalation au user pour décider de scope creep vs report. |

---

## 9. Estimation finale

| Livrable | Estimation |
|----------|-----------|
| Livrable 1 (RLS DROP + tests) | 1h |
| Livrable 2 (Canvas admin bulk + helper + tests) | 5-6h |
| Livrable 3 (Audit entity_id 6 routes) | 2-3h |
| Validation manuelle + finishing | 1-2h |
| **Total Sous-chantier 1** | **~10h** |

---

## 10. Suite

Après merge prod du Sous-chantier 1, le **Sous-chantier 2** (Volets B + C, ~30h) sera brainstormé séparément pour traiter la dette technique (types, robustesse).

Une fois les sous-chantiers 1 et 2 mergés, le score qualité TabEmargements devrait passer de 6/10 à 8/10 (parité TabConventionDocs post-solidification).

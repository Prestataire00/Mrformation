# Document Variables Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher la génération de PDFs Qualiopi (conventions, attestations, feuilles d'émargement) avec des placeholders `[Xxx]` visibles, via une validation server-side qui retourne 422 + modale UX avec liens vers édition des entités incomplètes.

**Architecture:** Helper `validateDocumentVariables` qui scanne le HTML résolu pour détecter les fallback `[Xxx]` connus, les groupe par entityKey du `ResolveContext`, et expose `entityIds` pour deep linking. Flag `qualiopiBlocking` ajouté au registry des templates système. Route `/api/documents/generate-from-template` retourne 422 pour bloquants incomplets, ou enrichit la réponse JSON avec `warnings` pour non-bloquants. Frontend `IncompleteDataDialog` consommé via un hook `useDocumentGeneration`.

**Tech Stack:** TypeScript strict, Next.js 14 App Router, Vitest, shadcn/ui Dialog.

**Spec source:** `docs/superpowers/specs/2026-05-17-document-vars-validation-design.md`

---

## File Structure

**Files to create:**
- `src/lib/validation/document-vars-validator.ts` — table `FALLBACK_TO_ENTITY_FIELD` + fonction `validateDocumentVariables`
- `src/lib/validation/__tests__/document-vars-validator.test.ts` — tests Vitest
- `src/components/dialogs/IncompleteDataDialog.tsx` — modale UX
- `src/hooks/useDocumentGeneration.ts` — hook wrapper fetch + dialog

**Files to modify:**
- `src/lib/templates/registry.ts` — ajout flag `qualiopiBlocking`
- `src/app/api/documents/generate-from-template/route.ts` — intégration validation avant `service.generate()`
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` — bascule `handleView` vers le hook

---

## Pre-flight check

Avant de démarrer Task 1, vérifie l'état de la branche :

```bash
cd /Users/wissam/Desktop/lms-platform
git status
git log --oneline -3
```

Tu dois être sur `spec/document-vars-validation` avec le commit du spec déjà présent (`29d1135 docs(spec): validation pré-génération des variables documents`). Si ce n'est pas le cas, stop et corrige avant de continuer.

---

### Task 1: Validator skeleton + table FALLBACK_TO_ENTITY_FIELD

**Files:**
- Create: `src/lib/validation/document-vars-validator.ts`

**Contexte :** Le resolver `src/lib/utils/resolve-variables.ts` retourne des chaînes fallback comme `"[Adresse formateur]"`, `"[SIRET client]"`, `"[Nom organisme]"` quand les variables ne sont pas résolvables. La liste exhaustive a été grepée depuis le source (~30 entrées). On ne valide QUE les fallback connus pour éviter les faux positifs (titres du type `[ENGAGEMENT]` dans certains templates).

- [ ] **Step 1: Créer le fichier avec la table + les types**

```typescript
// src/lib/validation/document-vars-validator.ts
/**
 * Validation pré-génération : détecte les variables non résolues dans un HTML
 * de template document et les groupe par entité du ResolveContext.
 *
 * Pourquoi : éviter les PDFs Qualiopi avec placeholders [Xxx] visibles (cf
 * spec docs/superpowers/specs/2026-05-17-document-vars-validation-design.md).
 */
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";

export type EntityKey = "trainer" | "client" | "entity" | "learner" | "session";

export type MissingByEntity = Partial<Record<EntityKey, string[]>>;

export type EntityIds = Partial<Record<EntityKey, string>>;

export type ValidationResult = {
  valid: boolean;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
};

/**
 * Mapping fallback string → entityKey + field. Source de vérité : grep des
 * `[Xxx]` hardcodés dans src/lib/utils/resolve-variables.ts.
 *
 * NB : ne contient QUE les fallback liés à une entité du ResolveContext.
 * Les fallback structurels (`[Tableau signature]`, `[QR Code]`, `[Liste
 * apprenants]`) sont volontairement absents — ils ne représentent pas un
 * champ à compléter par l'utilisateur.
 */
export const FALLBACK_TO_ENTITY_FIELD: Record<string, { entityKey: EntityKey; field: string }> = {
  // Formateur (trainer)
  "[Nom formateur]": { entityKey: "trainer", field: "first_name+last_name" },
  "[Adresse formateur]": { entityKey: "trainer", field: "address" },
  "[SIRET formateur]": { entityKey: "trainer", field: "siret" },
  "[NDA formateur]": { entityKey: "trainer", field: "nda" },
  "[Signature formateur]": { entityKey: "trainer", field: "signature_url" },
  "[Coût formateur]": { entityKey: "trainer", field: "hourly_rate" },

  // Client
  "[Nom client]": { entityKey: "client", field: "company_name" },
  "[Adresse client]": { entityKey: "client", field: "address" },
  "[SIRET client]": { entityKey: "client", field: "siret" },
  "[Téléphone client]": { entityKey: "client", field: "phone" },
  "[Email client]": { entityKey: "client", field: "email" },

  // Organisme (entity)
  "[Nom organisme]": { entityKey: "entity", field: "name" },
  "[SIRET organisme]": { entityKey: "entity", field: "siret" },
  "[NDA]": { entityKey: "entity", field: "nda" },
  "[Adresse organisme]": { entityKey: "entity", field: "address" },
  "[Ville organisme]": { entityKey: "entity", field: "city" },
  "[Email organisme]": { entityKey: "entity", field: "email" },
  "[Tél organisme]": { entityKey: "entity", field: "phone" },
  "[Site organisme]": { entityKey: "entity", field: "website" },
  "[Signature organisme]": { entityKey: "entity", field: "signature_text" },
  "[Représentant organisme]": { entityKey: "entity", field: "president_name" },

  // Apprenant (learner)
  "[Nom apprenant]": { entityKey: "learner", field: "last_name" },
  "[Prénom apprenant]": { entityKey: "learner", field: "first_name" },
  "[Email apprenant]": { entityKey: "learner", field: "email" },
  "[Téléphone apprenant]": { entityKey: "learner", field: "phone" },
  "[Ville de naissance]": { entityKey: "learner", field: "birth_city" },

  // Session
  "[Titre formation]": { entityKey: "session", field: "title" },
  "[Date début]": { entityKey: "session", field: "start_date" },
  "[Date fin]": { entityKey: "session", field: "end_date" },
  "[Date formation]": { entityKey: "session", field: "start_date" },
  "[Lieu]": { entityKey: "session", field: "location" },
  "[Adresse formation]": { entityKey: "session", field: "location" },
  "[Modalité]": { entityKey: "session", field: "mode" },
  "[Durée heures]": { entityKey: "session", field: "planned_hours" },
  "[Montant HT]": { entityKey: "session", field: "total_price" },
  "[Effectifs]": { entityKey: "session", field: "max_participants" },
};

/**
 * Valide qu'un template HTML peut être généré sans laisser de placeholders
 * `[Variable]` visibles. Appelle le resolver puis scanne le HTML résolu pour
 * détecter les fallback connus (cf FALLBACK_TO_ENTITY_FIELD).
 */
export function validateDocumentVariables(
  html: string,
  context: ResolveContext,
): ValidationResult {
  // Placeholder — implémentation à la Task 2 (TDD).
  void html;
  void context;
  void resolveDocumentVariables;
  return { valid: true, missingByEntity: {}, entityIds: {} };
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS (pas d'erreurs sur ce nouveau fichier).

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation/document-vars-validator.ts
git commit -m "$(cat <<'EOF'
feat(validator): squelette + table FALLBACK_TO_ENTITY_FIELD

Types ValidationResult / MissingByEntity / EntityIds + mapping
des ~30 fallback resolver vers les entityKey du ResolveContext.
Implémentation de la fonction à la task suivante (TDD).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: TDD validateDocumentVariables

**Files:**
- Create: `src/lib/validation/__tests__/document-vars-validator.test.ts`
- Modify: `src/lib/validation/document-vars-validator.ts` (remplacer le stub)

**Contexte TDD :** On écrit 7 tests qui couvrent les cas critiques. Les tests doivent ÉCHOUER au premier run (stub retourne toujours `valid: true`), puis PASSER une fois l'implémentation faite.

- [ ] **Step 1: Écrire le fichier de tests complet**

```typescript
// src/lib/validation/__tests__/document-vars-validator.test.ts
import { describe, it, expect } from "vitest";
import {
  validateDocumentVariables,
  FALLBACK_TO_ENTITY_FIELD,
} from "../document-vars-validator";
import type { ResolveContext } from "@/lib/utils/resolve-variables";

const baseContext: ResolveContext = {
  session: {
    id: "session-1",
    title: "Formation manager",
    start_date: "2026-06-01T09:00:00Z",
    end_date: "2026-06-02T17:00:00Z",
    location: "Paris",
    mode: "presentiel",
    planned_hours: 14,
    max_participants: 12,
    total_price: 1900,
  } as ResolveContext["session"],
  entity: {
    name: "C3V Formation",
    siret: "12345678901234",
    nda: "11750000000",
    address: "10 rue X",
    postal_code: "75009",
    city: "Paris",
    email: "contact@c3v.fr",
    phone: "0102030405",
    website: "c3v.fr",
    president_name: "Loris",
    president_title: "Gérant",
    signature_text: "Signé",
    stamp_url: null,
    signature_url: null,
    logo_url: null,
  } as ResolveContext["entity"],
};

describe("validateDocumentVariables", () => {
  it("retourne valid=true si template ne référence aucune variable", () => {
    const html = "<p>Texte statique sans variables</p>";
    const result = validateDocumentVariables(html, baseContext);
    expect(result.valid).toBe(true);
    expect(result.missingByEntity).toEqual({});
  });

  it("retourne valid=true si toutes les variables sont résolues", () => {
    const html = "<p>[%Nom du formateur%] - [%Adresse formateur%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: {
        id: "trainer-1",
        first_name: "Wissam",
        last_name: "Bouakline",
        address: "10 rue X",
        postal_code: "75009",
        city: "Paris",
      } as ResolveContext["trainer"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(true);
  });

  it("détecte [Adresse formateur] manquant et le groupe sous trainer + expose entityId", () => {
    const html = "<p>[%Nom du formateur%] - [%Adresse formateur%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: {
        id: "trainer-1",
        first_name: "Wissam",
        last_name: "Bouakline",
        address: null,
      } as ResolveContext["trainer"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer).toContain("address");
    expect(result.entityIds.trainer).toBe("trainer-1");
  });

  it("détecte plusieurs fields manquants sur la même entité (dédupliqués)", () => {
    const html = "<p>[%Adresse formateur%] [%SIRET formateur%] [%NDA formateur%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: {
        id: "trainer-1",
        first_name: "Wissam",
        last_name: "Bouakline",
        address: null,
        siret: null,
        nda: null,
      } as ResolveContext["trainer"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer?.sort()).toEqual(["address", "nda", "siret"]);
  });

  it("détecte fields manquants sur plusieurs entités (trainer + client)", () => {
    const html = "<p>[%Adresse formateur%] [%SIRET du client%]</p>";
    const context: ResolveContext = {
      ...baseContext,
      trainer: { id: "trainer-1", first_name: "W", last_name: "B", address: null } as ResolveContext["trainer"],
      client: { id: "client-1", company_name: "ACME", siret: null } as ResolveContext["client"],
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer).toContain("address");
    expect(result.missingByEntity.client).toContain("siret");
    expect(result.entityIds.trainer).toBe("trainer-1");
    expect(result.entityIds.client).toBe("client-1");
  });

  it("ignore les [...] qui ne sont pas des fallback connus du resolver", () => {
    const html = "<p>Titre : [ENGAGEMENT DE STAGIAIRE] - texte normal</p>";
    const result = validateDocumentVariables(html, baseContext);
    expect(result.valid).toBe(true);
  });

  it("expose la table FALLBACK_TO_ENTITY_FIELD avec au moins 30 entrées", () => {
    // Sanity check : si quelqu'un casse la table par accident, ce test fail.
    expect(Object.keys(FALLBACK_TO_ENTITY_FIELD).length).toBeGreaterThanOrEqual(30);
    // Et que chaque entrée a bien la structure attendue.
    for (const [fallback, mapping] of Object.entries(FALLBACK_TO_ENTITY_FIELD)) {
      expect(fallback.startsWith("[")).toBe(true);
      expect(fallback.endsWith("]")).toBe(true);
      expect(["trainer", "client", "entity", "learner", "session"]).toContain(mapping.entityKey);
      expect(typeof mapping.field).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd /Users/wissam/Desktop/lms-platform && npx vitest run src/lib/validation/__tests__/document-vars-validator.test.ts
```

Expected: 6 tests FAIL (le 1er passe par chance car stub retourne valid:true et template sans variable), 1 test PASS (le sanity check sur la table).

- [ ] **Step 3: Implémenter `validateDocumentVariables`**

Remplacer le stub dans `src/lib/validation/document-vars-validator.ts` par :

```typescript
export function validateDocumentVariables(
  html: string,
  context: ResolveContext,
): ValidationResult {
  const resolved = resolveDocumentVariables(html, context);

  const missingByEntity: MissingByEntity = {};
  const entityIds: EntityIds = {};

  for (const [fallback, { entityKey, field }] of Object.entries(FALLBACK_TO_ENTITY_FIELD)) {
    if (!resolved.includes(fallback)) continue;

    if (!missingByEntity[entityKey]) {
      missingByEntity[entityKey] = [];
    }
    if (!missingByEntity[entityKey]!.includes(field)) {
      missingByEntity[entityKey]!.push(field);
    }

    const entityRecord = context[entityKey] as { id?: string } | undefined;
    if (entityRecord?.id) {
      entityIds[entityKey] = entityRecord.id;
    }
  }

  return {
    valid: Object.keys(missingByEntity).length === 0,
    missingByEntity,
    entityIds,
  };
}
```

- [ ] **Step 4: Relancer les tests**

```bash
cd /Users/wissam/Desktop/lms-platform && npx vitest run src/lib/validation/__tests__/document-vars-validator.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Lancer la suite complète pour vérifier zéro régression**

```bash
cd /Users/wissam/Desktop/lms-platform && npx vitest run 2>&1 | tail -20
```

Expected: 386 + 7 = 393 tests passent (ou plus si autres tests ont été ajoutés depuis).

- [ ] **Step 6: Typecheck**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS, zéro erreur.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/document-vars-validator.ts src/lib/validation/__tests__/document-vars-validator.test.ts
git commit -m "$(cat <<'EOF'
feat(validator): implémente validateDocumentVariables + 7 tests

Scan du HTML résolu contre la table FALLBACK_TO_ENTITY_FIELD pour
détecter les variables non résolues, groupe par entityKey, expose
les entityIds depuis le ResolveContext.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Flag qualiopiBlocking dans le registry

**Files:**
- Modify: `src/lib/templates/registry.ts:54-129` (interface + entrées)

- [ ] **Step 1: Ajouter le champ à l'interface `SystemTemplate`**

Dans `src/lib/templates/registry.ts`, remplacer l'interface (lignes 54-59 actuelles) :

```typescript
export interface SystemTemplate {
  html: string;
  footer: string;
  /** Owner type attendu — pour validation côté caller. */
  ownerType: "learner" | "company" | "trainer" | "session";
  /**
   * Si true, la route generate-from-template retourne 422
   * (INCOMPLETE_DATA) plutôt que de générer un PDF avec des
   * placeholders `[Xxx]` visibles. Réservé aux docs Qualiopi
   * (conventions, attestations, feuilles d'émargement).
   */
  qualiopiBlocking: boolean;
}
```

- [ ] **Step 2: Marquer les 7 doc_types bloquants**

Toujours dans `src/lib/templates/registry.ts`, ajouter `qualiopiBlocking: true` sur les entrées suivantes du `SYSTEM_TEMPLATES_BY_DOC_TYPE` :

- `attestation_assiduite` (ligne ~77)
- `feuille_emargement` (ligne ~82)
- `feuille_emargement_collectif` (ligne ~87)
- `convention_entreprise` (ligne ~92)
- `convention_intervention` (ligne ~97)
- `contrat_sous_traitance` (ligne ~102)
- `certificat_realisation` (ligne ~72)

Et marquer `qualiopiBlocking: false` sur toutes les autres entrées du registry (convocation, programme_formation, cgv, reglement_interieur, politique_confidentialite) — la TS strict empêchera l'oubli.

Exemple :

```typescript
convention_intervention: {
  html: CONVENTION_INTERVENTION_HTML,
  footer: CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
  ownerType: "trainer",
  qualiopiBlocking: true,
},
convocation: {
  html: CONVOCATION_APPRENANT_HTML,
  footer: CONVOCATION_APPRENANT_FOOTER_TEMPLATE,
  ownerType: "learner",
  qualiopiBlocking: false,
},
```

- [ ] **Step 3: Typecheck pour vérifier qu'aucune entrée n'a été oubliée**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS. Si une entrée du registry oublie `qualiopiBlocking`, TypeScript signale une erreur (champ requis manquant).

- [ ] **Step 4: Lancer les tests pour vérifier zéro régression**

```bash
cd /Users/wissam/Desktop/lms-platform && npx vitest run 2>&1 | tail -10
```

Expected: tous les tests passent (le nouveau champ n'est pas consommé encore).

- [ ] **Step 5: Commit**

```bash
git add src/lib/templates/registry.ts
git commit -m "$(cat <<'EOF'
feat(registry): ajout flag qualiopiBlocking sur SystemTemplate

7 doc_types Qualiopi marqués bloquants (conventions, attestations,
émargements). Les autres (convocation, programme, cgv, etc.) restent
non-bloquants. Consommé par la route generate-from-template à la
task suivante.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Intégration validation dans la route

**Files:**
- Modify: `src/app/api/documents/generate-from-template/route.ts` (~ligne 363 et ~ligne 423)

**Contexte :** La route actuelle construit un `ResolveContext` à la ligne 352, résout le HTML à la ligne 363, puis appelle `service.generate()` à la ligne 372 et écrit en cache à la ligne 419. On insère la validation entre 363 et 372. Si bloquant et invalide → 422 immédiat, pas de génération, pas de cache. Si non bloquant et invalide → on continue mais on enrichit la réponse JSON ligne 423 avec un champ `warnings`.

- [ ] **Step 1: Ajouter l'import du validator**

En haut de `src/app/api/documents/generate-from-template/route.ts`, après les autres imports `@/lib/...` :

```typescript
import { validateDocumentVariables } from "@/lib/validation/document-vars-validator";
```

- [ ] **Step 2: Insérer le check de validation avant `service.generate()`**

Juste après `const resolvedHtml = resolveDocumentVariables(systemTemplate.html, ctx);` (ligne ~363 actuelle) et `const resolvedFooter = resolveDocumentVariables(systemTemplate.footer, ctx);` (ligne ~364), insérer :

```typescript
// Validation pré-génération : refuse de générer un PDF Qualiopi avec
// des placeholders [Xxx] visibles. Cf spec
// docs/superpowers/specs/2026-05-17-document-vars-validation-design.md
const validation = validateDocumentVariables(systemTemplate.html, ctx);
if (!validation.valid && systemTemplate.qualiopiBlocking) {
  return NextResponse.json(
    {
      error: "INCOMPLETE_DATA",
      docType: payload.doc_type,
      missingByEntity: validation.missingByEntity,
      entityIds: validation.entityIds,
    },
    { status: 422 },
  );
}
```

- [ ] **Step 3: Propager `validation` jusqu'au return JSON final**

Toujours dans le même fichier, on a besoin de l'objet `validation` au niveau du return JSON ligne ~423. Vu qu'il est déclaré à l'intérieur du `if (systemTemplate)`, on doit le hisser au scope englobant.

À côté des autres `let` hoistés (lignes 241-243 actuelles, juste après `let pdfNameBase: string;`), ajouter :

```typescript
let validationWarnings: { missingByEntity: import("@/lib/validation/document-vars-validator").MissingByEntity } | null = null;
```

Puis dans le bloc qui contient le check de validation (issu du Step 2), remplacer ce qu'on a écrit par :

```typescript
const validation = validateDocumentVariables(systemTemplate.html, ctx);
if (!validation.valid && systemTemplate.qualiopiBlocking) {
  return NextResponse.json(
    {
      error: "INCOMPLETE_DATA",
      docType: payload.doc_type,
      missingByEntity: validation.missingByEntity,
      entityIds: validation.entityIds,
    },
    { status: 422 },
  );
}
if (!validation.valid) {
  // Non-bloquant : on génère mais on prévient le client via le payload.
  validationWarnings = { missingByEntity: validation.missingByEntity };
}
```

- [ ] **Step 4: Enrichir le return JSON final**

Le return actuel (ligne ~423) est :

```typescript
return NextResponse.json({
  base64: pdfBase64,
  filename,
  sizeBytes,
  cached: false,
});
```

Remplacer par :

```typescript
return NextResponse.json({
  base64: pdfBase64,
  filename,
  sizeBytes,
  cached: false,
  ...(validationWarnings && { warnings: validationWarnings }),
});
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Lancer la suite de tests**

```bash
cd /Users/wissam/Desktop/lms-platform && npx vitest run 2>&1 | tail -10
```

Expected: tous les tests passent. Aucun test ne couvre cette route directement (validation manuelle prévue post-merge), mais aucune régression ne doit apparaître ailleurs.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/documents/generate-from-template/route.ts
git commit -m "$(cat <<'EOF'
feat(route): intègre validateDocumentVariables avant génération PDF

Si template qualiopiBlocking + variables manquantes → 422
INCOMPLETE_DATA avec missingByEntity + entityIds pour deep linking
côté UI. Si non-bloquant + variables manquantes → 200 + champ
warnings dans la réponse JSON (toast frontend).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Composant IncompleteDataDialog

**Files:**
- Create: `src/components/dialogs/IncompleteDataDialog.tsx`

**Contexte :** Modal shadcn qui reçoit le payload 422 (`{ missingByEntity, entityIds, docType }`) et affiche les champs manquants groupés par entité avec un bouton "Compléter le profil" par groupe qui ouvre la page d'édition de l'entité dans un nouvel onglet. À la fermeture (clic sur "Recharger après édition"), notifie le caller pour relancer la génération.

- [ ] **Step 1: Créer le composant**

```typescript
// src/components/dialogs/IncompleteDataDialog.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type {
  EntityKey,
  MissingByEntity,
  EntityIds,
} from "@/lib/validation/document-vars-validator";

const ENTITY_LABEL: Record<EntityKey, string> = {
  trainer: "Formateur",
  client: "Client",
  entity: "Organisme",
  learner: "Apprenant",
  session: "Session",
};

const ENTITY_ICON: Record<EntityKey, string> = {
  trainer: "🧑‍🏫",
  client: "🏢",
  entity: "🏛️",
  learner: "👤",
  session: "📅",
};

const FIELD_LABEL: Record<string, string> = {
  "first_name+last_name": "Nom complet",
  first_name: "Prénom",
  last_name: "Nom",
  address: "Adresse",
  postal_code: "Code postal",
  city: "Ville",
  siret: "SIRET",
  nda: "N° Déclaration d'Activité (NDA)",
  signature_url: "Signature (image)",
  signature_text: "Signature (texte)",
  hourly_rate: "Tarif horaire",
  company_name: "Raison sociale",
  email: "Email",
  phone: "Téléphone",
  name: "Nom",
  website: "Site web",
  president_name: "Représentant",
  birth_city: "Ville de naissance",
  title: "Titre",
  start_date: "Date de début",
  end_date: "Date de fin",
  location: "Lieu",
  mode: "Modalité",
  planned_hours: "Durée (heures)",
  total_price: "Montant HT",
  max_participants: "Nombre de participants",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  convention_entreprise: "la convention de formation",
  convention_intervention: "la convention d'intervention",
  contrat_sous_traitance: "le contrat de sous-traitance",
  attestation_assiduite: "l'attestation d'assiduité",
  certificat_realisation: "le certificat de réalisation",
  feuille_emargement: "la feuille d'émargement",
  feuille_emargement_collectif: "la feuille d'émargement collective",
};

function buildEditUrl(entityKey: EntityKey, entityId: string | undefined, sessionId: string | undefined): string | null {
  if (entityKey === "trainer" && entityId) return `/admin/trainers/${entityId}`;
  if (entityKey === "client" && entityId) return `/admin/clients/${entityId}`;
  if (entityKey === "learner" && entityId) return `/admin/learners/${entityId}`;
  if (entityKey === "entity") return `/admin/settings`;
  if (entityKey === "session" && sessionId) return `/admin/formations/${sessionId}`;
  return null;
}

export type IncompleteDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType?: string;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
  sessionId?: string;
  onRetry?: () => void;
};

export function IncompleteDataDialog({
  open,
  onOpenChange,
  docType,
  missingByEntity,
  entityIds,
  sessionId,
  onRetry,
}: IncompleteDataDialogProps) {
  const docLabel = docType ? (DOC_TYPE_LABEL[docType] ?? "le document") : "le document";
  const entityKeys = Object.keys(missingByEntity) as EntityKey[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Impossible de générer {docLabel}
          </DialogTitle>
          <DialogDescription>
            Des données obligatoires sont manquantes pour produire un document conforme Qualiopi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {entityKeys.map((entityKey) => {
            const fields = missingByEntity[entityKey] ?? [];
            const editUrl = buildEditUrl(entityKey, entityIds[entityKey], sessionId);
            return (
              <div key={entityKey} className="border rounded-md p-3 space-y-2">
                <div className="font-medium flex items-center gap-2">
                  <span>{ENTITY_ICON[entityKey]}</span>
                  <span>{ENTITY_LABEL[entityKey]}</span>
                </div>
                <ul className="text-sm text-muted-foreground list-disc pl-5">
                  {fields.map((field) => (
                    <li key={field}>{FIELD_LABEL[field] ?? field}</li>
                  ))}
                </ul>
                {editUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => window.open(editUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Compléter le profil
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {onRetry && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onRetry();
              }}
            >
              Recharger après édition
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS. Si le composant `Dialog` ou `Button` n'est pas trouvé, vérifier que les imports `@/components/ui/dialog` et `@/components/ui/button` existent (devrait être OK, ce sont des composants shadcn standards déjà présents dans le projet).

- [ ] **Step 3: Commit**

```bash
git add src/components/dialogs/IncompleteDataDialog.tsx
git commit -m "$(cat <<'EOF'
feat(ui): IncompleteDataDialog pour blocage Qualiopi

Modal shadcn qui affiche les champs manquants groupés par entité avec
un bouton 'Compléter le profil' qui ouvre la page d'édition de
l'entité dans un nouvel onglet. Bouton 'Recharger après édition'
permet de relancer la génération une fois les données complétées.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Hook useDocumentGeneration + bascule TabConventionDocs.handleView

**Files:**
- Create: `src/hooks/useDocumentGeneration.ts`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (handleView ~ligne 457)

**Contexte :** Le hook centralise la logique fetch + catch 422 + ouverture modal + retry. `handleView` actuellement fait le fetch directement et catch un éventuel error.

- [ ] **Step 1: Créer le hook**

```typescript
// src/hooks/useDocumentGeneration.ts
"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { IncompleteDataDialog } from "@/components/dialogs/IncompleteDataDialog";
import type {
  EntityIds,
  MissingByEntity,
} from "@/lib/validation/document-vars-validator";

export type GenerateRequest = {
  template_id?: string;
  doc_type?: string;
  context: {
    session_id?: string;
    learner_id?: string;
    client_id?: string;
    trainer_id?: string;
  };
};

export type GenerateSuccess = {
  base64: string;
  filename: string;
  sizeBytes?: number;
  cached?: boolean;
  warnings?: { missingByEntity: MissingByEntity };
};

type IncompleteState = {
  open: boolean;
  docType?: string;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
  sessionId?: string;
  lastRequest?: GenerateRequest;
};

/**
 * Hook centralisant les appels à /api/documents/generate-from-template.
 * Catch automatiquement les 422 INCOMPLETE_DATA et ouvre la modal
 * IncompleteDataDialog avec deep links vers édition des entités.
 *
 * Usage :
 *   const { generate, incompleteDialog } = useDocumentGeneration();
 *   const result = await generate({ doc_type: "convention_intervention", context: {...} });
 *   if (result) { // PDF généré }
 *   // Rendu : <>{incompleteDialog}</>
 */
export function useDocumentGeneration() {
  const { toast } = useToast();
  const [incomplete, setIncomplete] = useState<IncompleteState>({
    open: false,
    missingByEntity: {},
    entityIds: {},
  });

  const generate = useCallback(
    async (request: GenerateRequest): Promise<GenerateSuccess | null> => {
      try {
        const res = await fetch("/api/documents/generate-from-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const json = await res.json();

        if (res.status === 422 && json.error === "INCOMPLETE_DATA") {
          setIncomplete({
            open: true,
            docType: json.docType,
            missingByEntity: json.missingByEntity ?? {},
            entityIds: json.entityIds ?? {},
            sessionId: request.context.session_id,
            lastRequest: request,
          });
          return null;
        }

        if (!res.ok) {
          throw new Error(json.error ?? "Échec génération PDF");
        }

        if (json.warnings?.missingByEntity) {
          const entities = Object.keys(json.warnings.missingByEntity).join(", ");
          toast({
            title: "Document généré avec données incomplètes",
            description: `Champs manquants sur : ${entities}. Le PDF a été produit mais reste à compléter.`,
          });
        }

        return json as GenerateSuccess;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur génération PDF";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
        return null;
      }
    },
    [toast],
  );

  const incompleteDialog = (
    <IncompleteDataDialog
      open={incomplete.open}
      onOpenChange={(open) => setIncomplete((prev) => ({ ...prev, open }))}
      docType={incomplete.docType}
      missingByEntity={incomplete.missingByEntity}
      entityIds={incomplete.entityIds}
      sessionId={incomplete.sessionId}
      onRetry={
        incomplete.lastRequest
          ? () => {
              const req = incomplete.lastRequest!;
              void generate(req);
            }
          : undefined
      }
    />
  );

  return { generate, incompleteDialog };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Modifier `TabConventionDocs.handleView` pour utiliser le hook**

Dans `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` :

a) Ajouter l'import en haut du fichier :

```typescript
import { useDocumentGeneration } from "@/hooks/useDocumentGeneration";
```

b) Au début du composant (à côté des autres `useState` / `useToast`), instancier le hook :

```typescript
const { generate: generateDocument, incompleteDialog } = useDocumentGeneration();
```

c) Remplacer le corps de `handleView` (lignes 457-512 actuelles) par :

```typescript
const handleView = async (doc: FormationConventionDocument) => {
  const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
  const ownerLearnerId = doc.owner_type === "learner" ? doc.owner_id : undefined;
  const ownerClientId = doc.owner_type === "company" ? doc.owner_id : undefined;
  const ownerTrainerId = doc.owner_type === "trainer" ? doc.owner_id : undefined;

  const result = await generateDocument({
    template_id: doc.template_id || undefined,
    doc_type: doc.template_id ? undefined : doc.doc_type,
    context: {
      session_id: formation.id,
      learner_id: ownerLearnerId,
      client_id: ownerClientId,
      trainer_id: ownerTrainerId,
    },
  });

  if (!result) return; // 422 INCOMPLETE_DATA → la modal s'ouvre, ou autre erreur déjà toastée

  const byteChars = atob(result.base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const pdfDataUrl = URL.createObjectURL(blob);

  setPreviewDoc({
    open: true,
    html: "",
    pdfDataUrl,
    title: label,
    filename: `${doc.doc_type}_${Date.now()}`,
  });
};
```

d) Monter la modal dans le JSX rendu par le composant (à côté du `<PreviewDialog />` ou autre dialog existant) :

```tsx
{incompleteDialog}
```

Place ce snippet juste avant la fermeture du `</>` final ou à proximité des autres dialogs (rechercher `<PreviewDialog` ou `setPreviewDoc` pour identifier la zone).

- [ ] **Step 4: Typecheck**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Lancer la suite de tests**

```bash
cd /Users/wissam/Desktop/lms-platform && npx vitest run 2>&1 | tail -10
```

Expected: tous les tests passent (393+).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDocumentGeneration.ts src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabConventionDocs.tsx
git commit -m "$(cat <<'EOF'
feat(ui): hook useDocumentGeneration + bascule handleView

Le hook catch automatiquement les 422 INCOMPLETE_DATA et ouvre la
modal IncompleteDataDialog. handleView de TabConventionDocs simplifié
(plus de try/catch redondant, plus de fallback legacy generateDocHtml).
handleSendPreview / autres call sites peuvent être migrés au besoin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Test manuel + push + PR

**Files:**
- Aucun (validation manuelle + opérations git/gh)

**Contexte :** Vu que ces routes n'ont pas de tests automatisés (Puppeteer/CloudConvert lourd en CI), la validation finale se fait manuellement par Wissam après merge. Avant de pusher, on lance une dernière passe complète localement.

- [ ] **Step 1: Lancer la suite complète une dernière fois**

```bash
cd /Users/wissam/Desktop/lms-platform && npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: typecheck PASS + tous les tests passent.

- [ ] **Step 2: Vérifier l'état git**

```bash
git status
git log --oneline -8
```

Expected: working tree clean, 6 commits ajoutés depuis le commit du spec (`29d1135`) — un commit par task (1-6).

- [ ] **Step 3: Push et création de la PR**

```bash
git push -u origin spec/document-vars-validation
gh pr create --title "feat(documents): validation pré-génération des variables (Qualiopi-blocking)" --body "$(cat <<'EOF'
## Summary
- Helper `validateDocumentVariables` qui détecte les fallback `[Xxx]` non résolus dans le HTML et les groupe par entité du `ResolveContext`
- Flag `qualiopiBlocking` sur le registry des templates système — true pour conventions, attestations, feuilles d'émargement
- Route `/api/documents/generate-from-template` retourne `422 INCOMPLETE_DATA` pour les bloquants incomplets, sinon enrichit la réponse JSON avec `warnings`
- Modal `IncompleteDataDialog` + hook `useDocumentGeneration` qui consomme le 422 et propose des liens vers édition des entités
- Bascule de `TabConventionDocs.handleView` vers le hook

Spec : `docs/superpowers/specs/2026-05-17-document-vars-validation-design.md`

## Test plan
- [ ] Convention intervention sur formateur avec adresse/NDA/SIRET vides → modal apparaît avec 3 fields listés + bouton "Compléter le profil"
- [ ] Clic "Compléter le profil" → ouvre `/admin/trainers/<id>` dans un nouvel onglet
- [ ] Compléter les 3 champs → revenir → "Recharger après édition" → PDF généré OK sans placeholders
- [ ] Convocation (non bloquante) avec données partielles → PDF généré + toast warning
- [ ] Convention entreprise sur client complet → PDF normal sans modal
- [ ] Typecheck `npx tsc --noEmit` OK
- [ ] Suite Vitest 393+ tests passent

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Vérifier que la PR est créée**

L'URL de la PR sera affichée. Stop ici — la suite (review + merge) est à la main de l'utilisateur.

---

## Self-Review (effectué après écriture)

**Spec coverage** :
- ✅ Helper `validateDocumentVariables` → Task 2
- ✅ Table `FALLBACK_TO_ENTITY_FIELD` → Task 1
- ✅ Flag `qualiopiBlocking` + 7 doc_types marqués → Task 3
- ✅ Route 422 pour bloquants → Task 4
- ✅ Route warnings JSON pour non-bloquants → Task 4
- ✅ Composant `IncompleteDataDialog` → Task 5
- ✅ Hook `useDocumentGeneration` → Task 6
- ✅ Intégration `TabConventionDocs` → Task 6
- ✅ Tests unitaires validateur (6+) → Task 2
- ⚠ **Batch endpoints `incompleteDocs[]`** : volontairement hors scope MVP (cf spec section "Batch endpoints" et instruction utilisateur "YAGNI scope"). À traiter dans un PR séparé si besoin après usage réel.
- ⚠ **Tests d'intégration route** : pas de tests Vitest pour la route (cohérent avec le reste des routes du projet, validation manuelle via test plan PR).

**Placeholder scan** : aucun TBD / TODO / "handle edge cases" / "similar to Task N". Tout le code est inline.

**Type consistency** :
- `MissingByEntity`, `EntityIds`, `EntityKey`, `ValidationResult` définis Task 1, réutilisés Tasks 2, 4, 5, 6
- `validateDocumentVariables(html, context)` signature identique partout
- `qualiopiBlocking: boolean` défini Task 3, lu Task 4

**Cohérence avec le code réel** :
- Route retourne `{ base64, filename, sizeBytes, cached }` (vérifié ligne 423 du source) — le hook lit `json.base64` (et non `pdfBase64`, contrairement à ce que la spec laissait entendre par endroits)
- `handleView` dans TabConventionDocs fait déjà `atob(json.base64)` — pas de changement de shape JSON requis

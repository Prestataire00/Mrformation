# Design : Validation des variables avant génération de documents

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (brainstorming session)
**Statut** : approved (brainstorming)
**Story** : Bug reporté en test post-PR #114 (convention intervention affiche `[Adresse formateur]`, `[NDA formateur]`, `[SIRET formateur]`)

## Contexte / Problème

Les PDFs générés affichent des placeholders entre crochets pour les variables non résolues : `[Adresse formateur]`, `[NDA formateur]`, `[SIRET formateur]`, `[SIRET du client]`, etc. Cas observé sur screenshot Wissam : convention d'intervention pour le formateur Wissam Bouakline dont le record `trainers` n'a pas `address`, `nda`, `siret` renseignés.

### Cause technique

Le resolver (`src/lib/utils/resolve-variables.ts:resolveVariables`) retourne volontairement un fallback `[Nom de la variable]` quand une variable référencée par le template n'est pas résolvable depuis le `ResolveContext`. Ce fallback est :
- **lisible** par Loris (vs `{{adresse_formateur}}` qui apparaîtrait comme du texte brut buggé)
- **mais visible dans le PDF final** s'il n'y a pas de garde-fou en amont

Aucune validation pré-génération n'existe aujourd'hui — la route `/api/documents/generate-from-template` accepte n'importe quel context, et le PDF est généré tel quel.

### Impact

- **Documents Qualiopi incomplets** envoyés aux clients/financeurs/auditeurs (conventions, attestations, feuilles d'émargement)
- **Image pro dégradée** : un PDF avec `[NDA formateur]` en clair fait amateur
- **Risque audit Qualiopi** : non-conformité si docs envoyés avec champs vides
- **Loris ne sait pas qu'il manque des données** tant qu'il n'ouvre pas le PDF généré

## Décisions de scope (brainstorming validé)

| Question | Réponse |
|---|---|
| Strictness | **Hybride** : bloquant pour docs Qualiopi, warning toast pour le reste |
| Docs bloquants | Convention formation (entreprise), Convention intervention (formateur), Attestations (assiduité/compétences/réalisation), Feuilles d'émargement (collectif + individuel) |
| UX du blocage | Modal détaillée avec liens directs vers édition profil entité |
| Détection des champs critiques | Auto via parsing du template (zéro config) |
| Dashboard santé pro-actif | Hors scope MVP (YAGNI) |

## Comportement attendu

### Au clic sur "Générer" ou "Voir le PDF"

**Cas 1 — doc bloquant + données complètes** → génération normale, retourne le PDF.

**Cas 2 — doc bloquant + variables critiques manquantes** → la route retourne `422 Unprocessable Entity` avec le payload :
```json
{
  "error": "INCOMPLETE_DATA",
  "docType": "convention_intervention",
  "missingByEntity": {
    "trainer": ["address", "nda", "siret"],
    "client": ["siret"]
  },
  "entityIds": {
    "trainer": "uuid-formateur",
    "client": "uuid-client"
  }
}
```

Le frontend ouvre une **modal détaillée** listant les champs manquants groupés par entité, avec un bouton "Compléter le profil" par groupe qui pointe vers la page d'édition de l'entité concernée.

**Cas 3 — doc non bloquant + variables manquantes** → génération OK (200), réponse JSON enrichie d'un champ `warnings: { missingByEntity }`. Le frontend affiche un toast Sonner informatif (non-bloquant).

**Cas 4 — doc non bloquant + données complètes** → génération normale, pas de toast.

## Architecture

### Composant 1 : helper de validation

Fichier : `src/lib/validation/document-vars-validator.ts` (nouveau)

```typescript
import type { ResolveContext } from "@/lib/utils/resolve-variables";

// NB : les clés correspondent aux propriétés du ResolveContext
// (trainer, client, entity, learner, session) — pas une traduction française.
export type MissingByEntity = {
  trainer?: string[];
  client?: string[];
  entity?: string[];   // = organisme (entity = entité organisationnelle au sens DB)
  learner?: string[];
  session?: string[];
};

export type EntityIds = {
  trainer?: string;
  client?: string;
  entity?: string;
  learner?: string;
  session?: string;
};

export type ValidationResult = {
  valid: boolean;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
};

/**
 * Valide qu'un template HTML peut être généré sans laisser de placeholders
 * `[Variable]` visibles dans le PDF final.
 *
 * Stratégie : appelle le resolver sur le HTML, scanne le résultat pour détecter
 * les fallback `[Xxx]` restants, les groupe par entité (trainer/client/etc.).
 *
 * @param html - Template HTML brut (avec `[%Variable Sellsy%]` ou `{{technical_key}}`)
 * @param context - ResolveContext complet (session, learner, client, trainer, entity, ...)
 * @returns ValidationResult avec missing groupés par entité
 */
export function validateDocumentVariables(
  html: string,
  context: ResolveContext,
): ValidationResult;
```

**Logique interne** :
1. Appelle `resolveDocumentVariables(html, context)` → obtient `resolvedHtml`
2. Scanne `resolvedHtml` avec regex `/\[([A-ZÉÈÀÂa-zéèàâ' ]+(?: [a-zéèàâ']+)*)\]/g` pour trouver tous les fallback `[Xxx]` restants
3. Pour chaque fallback détecté, mappe vers l'entité concernée via une table `FALLBACK_TO_ENTITY_FIELD` (clé = entityKey du ResolveContext) :
   - `[Adresse formateur]` → `{ entityKey: "trainer", field: "address" }`
   - `[NDA formateur]` → `{ entityKey: "trainer", field: "nda" }`
   - `[SIRET formateur]` → `{ entityKey: "trainer", field: "siret" }`
   - `[SIRET du client]` → `{ entityKey: "client", field: "siret" }`
   - `[Adresse organisme]` → `{ entityKey: "entity", field: "address" }`
   - etc. (table maintenue, ~30 entrées pour couvrir les fallback connus listés dans `resolve-variables.ts`)
4. Extrait les `entityIds` depuis le `context` (`context.trainer?.id`, `context.client?.id`, `context.session?.id`, etc.)
5. Retourne `{ valid: missingByEntity vide, missingByEntity, entityIds }`

**Table `FALLBACK_TO_ENTITY_FIELD`** : co-localisée avec `ALIAS_TO_VARIABLE_KEY` dans `resolve-variables.ts` (ou à côté dans `document-vars-validator.ts`). Source de vérité : la liste des fallback hardcodés dans `resolveVariables()` (~30 placeholders).

### Composant 2 : flag bloquant dans le registry

Fichier : `src/lib/templates/registry.ts` (modification)

Ajout d'un champ `qualiopiBlocking: boolean` dans l'interface `SystemTemplate` :

```typescript
export interface SystemTemplate {
  html: string;
  footer: string;
  ownerType: "learner" | "company" | "trainer" | "session";
  /**
   * Si true, la route generate-from-template refuse de générer le PDF
   * (422) tant que les variables critiques ne sont pas résolues.
   * Réservé aux docs sensibles Qualiopi.
   */
  qualiopiBlocking: boolean;
}
```

Marqué `true` pour :
- `convention_entreprise`
- `convention_intervention`
- `contrat_sous_traitance`
- `attestation_assiduite`
- `certificat_realisation`
- `feuille_emargement`
- `feuille_emargement_collectif`

Marqué `false` pour les autres (convocation, programme_formation, cgv, reglement_interieur, politique_confidentialite).

**Note** : les templates custom user (créés via éditeur HTML par l'admin) ne sont **pas** dans le registry → comportement non-bloquant par défaut. Hors scope MVP (peut être ajouté plus tard via un flag DB sur la table `documents_templates`).

### Composant 3 : intégration dans la route

Fichier : `src/app/api/documents/generate-from-template/route.ts` (modification)

Juste **avant** l'appel à `service.generate(...)` (ligne ~372 actuelle) :

```typescript
import { validateDocumentVariables } from "@/lib/validation/document-vars-validator";

// `html` = HTML brut du template (system ou custom), `resolveCtx` = ResolveContext
// déjà construit pour resolveDocumentVariables (cf code existant lignes ~280-365).
const systemTemplate = payload.doc_type ? getSystemTemplate(payload.doc_type) : null;
const isBlocking = systemTemplate?.qualiopiBlocking ?? false;

const validation = validateDocumentVariables(html, resolveCtx);

// Bloquant + incomplet → 422 immédiat (pas de génération, pas de cache)
if (!validation.valid && isBlocking) {
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

// ... appel service.generate(...) inchangé, qui produit `result.buffer` puis
// la réponse JSON `{ pdfBase64, cacheHit, engineUsed, latencyMs, ... }`

// Non bloquant + incomplet : on enrichit la réponse JSON avec un champ `warnings`
// (le frontend lit pour afficher un toast Sonner).
return NextResponse.json({
  pdfBase64: result.buffer.toString("base64"),
  cacheHit: result.cacheHit,
  engineUsed: result.engineUsed,
  latencyMs: result.latencyMs,
  ...(!validation.valid && { warnings: { missingByEntity: validation.missingByEntity } }),
});
```

**Note** : on n'utilise pas le header `X-Doc-Warnings` finalement (la route retourne déjà un JSON avec le PDF en base64, autant ajouter un champ `warnings` dans le body — plus simple côté client).

**Critique** : la validation tourne avant l'écriture en cache du PDF. Si validation échoue → on ne génère pas le PDF, on ne pollue pas le cache.

### Composant 4 : modal de blocage frontend

Fichier : `src/components/dialogs/IncompleteDataDialog.tsx` (nouveau)

Props :
```typescript
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType: string;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
};
```

Layout (shadcn Dialog) :

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Impossible de générer la convention d'intervention   │
├─────────────────────────────────────────────────────────┤
│ Des données obligatoires sont manquantes pour produire  │
│ un document conforme Qualiopi :                         │
│                                                          │
│ 🧑 Formateur                                             │
│   • Adresse                                              │
│   • N° Déclaration d'Activité (NDA)                      │
│   • SIRET                                                │
│   [ Compléter le profil du formateur → ]                 │
│                                                          │
│ 🏢 Client                                                │
│   • SIRET                                                │
│   [ Compléter le profil du client → ]                    │
│                                                          │
│                    [Annuler]  [Recharger après édition]  │
└─────────────────────────────────────────────────────────┘
```

Mapping entité → route d'édition :
- `trainer` → `/admin/trainers/<id>` (Sheet d'édition existant)
- `client` → `/admin/clients/<id>`
- `organisme` → `/admin/settings/entity` (paramètres organisme actuel)
- `apprenant` → `/admin/learners/<id>`
- `session` → `/admin/formations/<formation_id>` (selon contexte)

Mapping technique field → libellé UI (table co-localisée dans le composant) :
- `address` → "Adresse"
- `nda` → "N° Déclaration d'Activité (NDA)"
- `siret` → "SIRET"
- `postal_code` → "Code postal"
- `city` → "Ville"
- ... (~15 entrées pour couvrir les fields connus)

Bouton "Recharger après édition" : ferme la modal + relance l'action de génération (call `/api/documents/generate-from-template` à nouveau).

### Composant 5 : intégration dans les hooks de génération

Modifier tous les call sites qui consomment `/api/documents/generate-from-template` pour catch le 422 :
- `TabConventionDocs.handleView(doc)` et `handleSend(doc)`
- `TabConventionDocs.handleGenerateClick(...)`
- Tous les batch endpoints (`generate-conventions-batch`, `generate-attestations-assiduite-batch`, etc.) : appellent la route en interne, mais les batch retournent un `errors[]` qu'il faut enrichir (cf section "Batch endpoints" ci-dessous)

Helper hook réutilisable : `src/hooks/useDocumentGeneration.ts` (nouveau) qui wrappe le fetch + la gestion modal :

```typescript
const { generate, incompleteDialog } = useDocumentGeneration();

// Dans le composant :
<>
  <Button onClick={() => generate({ doc_type: "convention_intervention", context: {...} })}>
    Générer
  </Button>
  {incompleteDialog}
</>
```

## Batch endpoints

Cas spécial : les batch (`generate-conventions-batch`, etc.) génèrent N docs en parallèle. Que faire si certains sont valides et d'autres bloqués ?

**Décision MVP** : pour les batch, ne PAS échouer le batch entier. Continuer à générer les docs valides, et retourner dans le payload de réponse un tableau `incompleteDocs[]` :

```json
{
  "generated": [...],
  "errors": [...],
  "incompleteDocs": [
    {
      "ownerId": "trainer-uuid",
      "ownerName": "Wissam Bouakline",
      "missingByEntity": { "trainer": ["address", "nda", "siret"] }
    }
  ]
}
```

Le frontend (batch dialog) affiche un toast résumé : "12 documents générés, 2 incomplets (cliquer pour voir)". Le clic ouvre une modal listant les ownerName + missing fields, avec un lien par owner.

## Edge cases

- **Variables conditionnelles** (ex: bloc `Sous-traitant` dans convention intervention qui n'apparaît que si `session.is_subcontracted === true`) : si le bloc n'est pas rendu, les variables qu'il contient ne sont pas dans le HTML résolu → pas détectées comme manquantes. ✅ Comportement correct.
- **Variables avec valeur valide mais entre crochets** (ex: titre `[ENGAGEMENT]` dans un template) : risque de faux positif. Mitigation : regex stricte qui matche uniquement les fallback connus listés dans `FALLBACK_TO_ENTITY_FIELD`. Tout `[Texte]` non listé est ignoré.
- **Template custom user** avec variable inconnue (`[%Champ inventé%]`) : non listée dans `ALIAS_TO_VARIABLE_KEY` → le resolver retourne `[%Champ inventé%]` (avec `[%...%]` complet) → pas détecté par notre regex `[Xxx]`. ✅ Comportement OK (on ne valide que les variables canoniques).
- **Apprenant orphelin** (`enrollment.client_id = null`) : déjà géré par fallback resolver `[Nom du client]` etc. → bloqué par notre validator. ⚠ Mais c'est précisément le cas où il faut bloquer (Loris doit rattacher l'apprenant à un client avant de générer la convention).
- **Variables organisme manquantes** (entity n'a pas `signature_url`, `stamp_url`) : aujourd'hui le resolver retourne `""` (chaîne vide) pour les images, pas un fallback `[...]`. ✅ Pas bloqué. Logique : un cachet manquant n'empêche pas la conformité Qualiopi (signature texte suffit).
- **Cache PDF** : si validation échoue → on ne génère pas → on n'écrit pas en cache. ✅ Pas de stale 422.
- **Performance** : la validation appelle déjà `resolveDocumentVariables` (qui est appelée juste après pour le PDF). Optimisation : refactor pour appeler le resolver une seule fois et passer `resolvedHtml` à la fois à la validation et au PDF generator. +0ms latence.

## Tests

### Tests unitaires (nouveau fichier)

`src/lib/validation/__tests__/document-vars-validator.test.ts` :

```typescript
describe("validateDocumentVariables", () => {
  it("retourne valid=true si toutes les variables sont résolues", () => {
    const html = "<p>[%Nom du formateur%] - [%Adresse formateur%]</p>";
    const context = {
      session: { ... },
      trainer: { id: "t1", first_name: "Wissam", last_name: "Bouakline", address: "10 rue X" },
    };
    expect(validateDocumentVariables(html, context).valid).toBe(true);
  });

  it("détecte [Adresse formateur] manquant et le groupe sous trainer", () => {
    const html = "<p>[%Nom du formateur%] - [%Adresse formateur%]</p>";
    const context = {
      trainer: { id: "t1", first_name: "Wissam", last_name: "Bouakline", address: null },
    };
    const result = validateDocumentVariables(html, context);
    expect(result.valid).toBe(false);
    expect(result.missingByEntity.trainer).toContain("address");
    expect(result.entityIds.trainer).toBe("t1");
  });

  it("détecte plusieurs fields manquants sur la même entité", () => {
    // trainer sans address, nda, siret → 3 fields manquants regroupés
  });

  it("détecte fields manquants sur plusieurs entités (trainer + client)", () => {
    // missingByEntity.trainer + missingByEntity.client tous deux non vides
  });

  it("ignore les [...] qui ne sont pas des fallback connus", () => {
    const html = "<p>Titre : [ENGAGEMENT DE STAGIAIRE]</p>";
    expect(validateDocumentVariables(html, ctx).valid).toBe(true);
  });

  it("retourne valid=true si template ne référence aucune variable", () => {
    const html = "<p>Texte statique sans variables</p>";
    expect(validateDocumentVariables(html, {}).valid).toBe(true);
  });
});
```

### Tests d'intégration route

`src/app/api/documents/generate-from-template/__tests__/route.test.ts` (nouveau ou existant à étendre) :

- POST `convention_intervention` avec trainer incomplet → 422 + payload `INCOMPLETE_DATA`
- POST `convention_intervention` avec trainer complet → 200 + PDF
- POST `convocation` (non bloquant) avec données incomplètes → 200 + champ `warnings` dans le JSON

### Tests manuels (Wissam post-deploy)

1. **Convention intervention bloquante** : prendre un formateur sans adresse/NDA/SIRET → clic "Générer" → modal apparaît avec 3 fields listés + bouton "Compléter le profil"
2. **Compléter via modal** : remplir adresse/NDA/SIRET dans le profil formateur → revenir → "Recharger après édition" → PDF généré OK
3. **Convocation non bloquante** : générer une convocation sans certaines vars optionnelles → toast warning mais PDF présent
4. **Batch** : déclencher batch conventions avec 1 formateur incomplet sur 3 → 2 PDFs OK + section "1 incomplet" dans le résultat

## Hors scope (post-MVP)

- **Dashboard santé global** des entités (déjà tranché YAGNI)
- **Badge "données complètes"** sur cards formation (déjà tranché YAGNI)
- **Configurabilité admin** des champs requis par doc_type (auto-détection suffit)
- **Templates custom user** marqués bloquants (nécessite UI admin pour le flag, hors scope)
- **Validation côté client en pré-saisie** (ex: griser le bouton "Générer" si données incomplètes au mount) : nécessite endpoint dédié `/api/documents/validate-vars` et logique de fetch au mount. Si Loris demande après usage réel, story séparée.
- **Migration des fallback resolver vers null** : aujourd'hui le resolver retourne `[Xxx]`, on pourrait le faire retourner `null` et gérer les manquants en amont. Refactor invasif, hors scope.

## Risques

- **Régression sur docs déjà générés** : aucune, on n'invalide pas le cache existant. Les anciens PDFs avec fallback restent en cache.
- **Faux positif sur templates user custom** : non bloquant par défaut (registry only) → pas de risque.
- **Latence ajoutée** : ~0ms si on partage `resolvedHtml` entre validator et generator. Sinon ~5ms pour re-resolve.
- **Maintenance de la table `FALLBACK_TO_ENTITY_FIELD`** : doit rester en sync avec les fallback hardcodés du resolver. Mitigation : test qui parse `resolve-variables.ts` et vérifie que chaque fallback `[Xxx]` du source est dans la table. Hors scope MVP (manuel pour l'instant).

## Definition of Done

- [ ] Helper `validateDocumentVariables` créé + 6 tests unitaires passent
- [ ] Table `FALLBACK_TO_ENTITY_FIELD` documente les ~30 fallback connus
- [ ] Champ `qualiopiBlocking` ajouté à `SystemTemplate` + 7 doc_types marqués
- [ ] Route `generate-from-template` retourne 422 pour bloquants incomplets
- [ ] Route enrichit la réponse JSON avec `warnings` pour non bloquants incomplets
- [ ] Composant `IncompleteDataDialog` créé avec liens vers édition entités
- [ ] Hook `useDocumentGeneration` créé + intégré dans `TabConventionDocs`
- [ ] Batch endpoints enrichis avec `incompleteDocs[]` dans payload
- [ ] Typecheck `npx tsc --noEmit` OK
- [ ] Tests 386/386 + nouveaux passent
- [ ] PR créée + mergée
- [ ] Test manuel Wissam : convention intervention bloquante, compléter formateur, regénération OK

## Intégration BMad

Cette story s'intègre dans l'epic E5 (Robustesse génération documents) — ou crée un nouvel epic E6 si pas approprié. À créer via skill `bmad-create-story` après validation du spec.

Story candidate :
- **Titre** : "Validation pré-génération des variables documents"
- **Epic** : E5 ou E6 selon décision Loris/PO
- **Estimation** : 3-5 jours dev (1 sprint)
- **Priorité** : High (risque Qualiopi)

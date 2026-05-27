# Sous-chantier 2 `/admin/documents` — V2 Patch UX page racine

> **Spec validée par Wissam le 2026-05-27.**
> Source : Deep-dive [docs/deep-dive-admin-documents.md](../../deep-dive-admin-documents.md) (commit `18b3f5d`) + exploration approfondie via agent Explore.
> Pré-requis : Sous-chantier 1 V1+V3+bonus mergé en prod (commit `54d5502`).

---

## 1. Contexte

Le deep-dive BMAD du 2026-05-27 a donné le verbatim de Wissam : « c'est une catastrophe il faut tout repenser » sur `/admin/documents`. Score initial **4.5/10** (le plus bas mesuré).

Le **Sous-chantier 1** (V1+V3+bonus, mergé `54d5502`) a éliminé les 5 listes inline désynchronisées et rendu les pages satellites découvrables via tabs sticky. Score passé à ~5.5/10.

Ce **Sous-chantier 2 (V2 Patch UX)** s'attaque aux **3 douleurs UX critiques restantes** sur la page racine, identifiées par exploration approfondie :

1. **Impossible d'envoyer un doc officiel directement** : aucun bouton "Envoyer" sur les 12 templates Officials du catalogue. L'admin doit créer une copie perso (5+ clicks) pour envoyer une convocation.
2. **QuickAction "Envoyer à un apprenant" trompeur** : bascule juste vers l'onglet Custom + toast, ne fait rien d'utile.
3. **Pas d'aide inline pour les variables** dans le modal d'édition de template : l'admin doit naviguer hors page pour découvrir les noms exacts.

L'agent Explore a recommandé l'**Option A "Patch ciblé"** (~3-4h) — fix ces 3 douleurs sans refonte de layout. Validé par Wissam.

### 1.1 Findings d'exploration

Le rapport d'exploration a confirmé que :
- **Le hook `useDocumentGeneration`** (`src/hooks/useDocumentGeneration.tsx`) est déjà utilisé par TabConventionDocs et TabEmargements, mais **PAS** par la page racine (qui a sa propre `handleGenerate()` locale).
- **Le composant `<InsertVariableButton>`** (`src/components/editor/InsertVariableButton.tsx`) existe et est utilisé par `/admin/emails`. Réutilisable tel quel pour la page racine (paramètre `context: "document"`).
- **Le Dialog SEND** (lignes 1959-2120 de page.tsx) gère déjà le workflow "choisir destinataire + envoyer" mais accepte uniquement les templates en DB. Doit être **étendu** pour accepter aussi les templates officiels du registry.

---

## 2. Goal

Fixer les 3 douleurs UX critiques de la page racine `/admin/documents` (Officials non-envoyables, QuickAction trompeur, helper variables manquant) **sans changer le layout global** ni l'organisation des onglets actuels.

---

## 3. Périmètre

### 3.1 In-scope — 3 livrables

| # | Livrable | Estimation |
|---|----------|-----------|
| 1 | Bouton **"Envoyer"** sur les 12 templates Officiels du catalogue + extension Dialog SEND | ~2h |
| 2 | Réparer **QuickAction "Envoyer à un apprenant"** (ouvre Dialog SEND) | ~30 min |
| 3 | Ajouter **`<InsertVariableButton context="document">`** dans modal édition template | ~30 min |

**Estimation totale** : **~3-4h** (vs 5-7h estimé spec original — pattern de sur-estimation cohérent avec sous-chantiers précédents).

### 3.2 Out-of-scope (volets ultérieurs)

- **V4** : Sécurité multi-tenant (3 violations résiduelles) — futur sous-chantier
- **V5** : Refacto architectural page racine 2295 LOC — DEFER selon Wissam
- **V6** : Tests Vitest — bonus optionnel
- **Refonte layout** : option B (décomposition) ou C (page simplifiée) du deep-dive — non choisies

### 3.3 Out-of-scope (volontaire)

- **Pagination "Documents générés"** (problème UX #3 du rapport agent, mais pas dans le top 3 des douleurs prioritaires Wissam)
- **Bouton "Supprimer" sur Documents générés** (intentionnel pour audit trail)
- **Migration de la page racine vers `useDocumentGeneration`** (le `handleGenerate()` local marche, gap architectural à traiter dans un futur volet refacto)

---

## 4. Architecture

### 4.1 Livrable 1 — Bouton "Envoyer" sur les Officials

**État actuel** ([page.tsx:1070-1095](../../../src/app/(dashboard)/admin/documents/page.tsx)) :

Chaque card Official template dans le catalogue affiche :
- **Aperçu** (lit le HTML du template registry)
- **Modifier ma version** (si template DB perso lié au doc_type, ouvre modal édition)
- **Utiliser comme base** (sinon, crée une copie DB pré-remplie)

**Aucun bouton "Envoyer".** L'admin doit créer une copie perso pour pouvoir envoyer un doc officiel — workflow 5+ clicks pour une action quotidienne.

**Architecture cible** : ajouter un bouton **"Envoyer"** sur chaque card Official template, click ouvre le Dialog SEND avec le template officiel pré-sélectionné.

```tsx
// Dans la map OFFICIAL_TEMPLATES, ajouter le bouton :
<Button
  size="sm"
  onClick={() => openSendDialog({ officialDocType: ot.id, name: ot.name })}
>
  <Send className="h-4 w-4 mr-1" />
  Envoyer
</Button>
```

**Extension Dialog SEND** : le Dialog accepte actuellement `template_id` (DB) pour les templates personnalisés. Il doit être étendu pour accepter aussi `officialDocType` (registry).

```ts
// Avant
interface SendDialogState {
  open: boolean;
  template_id: string | null;  // Template DB perso uniquement
  // ...
}

// Après
interface SendDialogState {
  open: boolean;
  template_id: string | null;        // Template DB perso (registry SOURCE B)
  officialDocType: string | null;    // doc_type du registry (registry SOURCE A)
  requireTemplateChoice: boolean;    // Si true, étape "choisir template" en début
  // ...
}
```

**Génération du PDF** : la route `/api/documents/generate-from-template` accepte déjà les 2 modes (`template_id` ou `doc_type`). On choisit selon ce qui est fourni :

```ts
const generateBody = officialDocType
  ? { doc_type: officialDocType, context: {...} }
  : { template_id, context: {...} };
const res = await fetch("/api/documents/generate-from-template", { ..., body: JSON.stringify(generateBody) });
```

**Workflow attendu** :
1. Admin clique **"Envoyer"** sur card Convocation (Official)
2. Dialog SEND s'ouvre avec `officialDocType: "convocation"` pré-rempli
3. Step 1 : Admin choisit destinataire (learner + session) + sujet/corps email
4. Step 2 : Confirmation
5. Click "Envoyer" → PDF généré depuis le registry → email en queue → toast succès

Réduction : 5+ clicks → **2 clicks** pour l'use case le plus fréquent.

### 4.2 Livrable 2 — Réparer QuickAction "Envoyer à un apprenant"

**État actuel** ([page.tsx:1012-1025](../../../src/app/(dashboard)/admin/documents/page.tsx)) :

```tsx
<button onClick={() => {
  setActiveTab("custom");
  toast({ title: "Choisissez un modèle..." });
}}>
  📤 Envoyer à un apprenant
</button>
```

Click → bascule juste vers l'onglet Custom + toast. **Trompeur** : admin s'attend à un dialog "choisir template + destinataire", trouve un onglet vide.

**Architecture cible** : click ouvre le Dialog SEND en mode "choisir template" (`requireTemplateChoice: true`).

```tsx
<button onClick={() => openSendDialog({ requireTemplateChoice: true })}>
  📤 Envoyer à un apprenant
</button>
```

Le Dialog SEND détecte `requireTemplateChoice: true` et ajoute un step initial "Quel template envoyer ?" listant Officials + Custom. Une fois template choisi, le workflow normal continue (destinataire + envoyer).

### 4.3 Livrable 3 — Helper variables dans modal édition template

**État actuel** ([page.tsx:1594-1840](../../../src/app/(dashboard)/admin/documents/page.tsx)) : modal d'édition de template avec RichTextEditor. **Aucun helper variables.** L'admin doit aller sur `/admin/documents/variables` (maintenant accessible via tabs sticky V3) pour découvrir les noms.

**Architecture cible** : réutiliser `<InsertVariableButton context="document" onInsert={...} />` depuis `src/components/editor/InsertVariableButton.tsx`.

Le composant :
- Lit `TEMPLATE_VARIABLES` depuis `@/lib/template-variables` (source de vérité, sync avec V1.3 helpers)
- Filtre par `availableIn.includes("document")` via prop `context: "document"`
- Affiche un popover avec search + categorized list
- Callback `onInsert(placeholder)` injecte la variable au curseur (e.g. `[%Nom de l'apprenant%]`)

**Implémentation dans modal édition** :

```tsx
// Dans le modal d'édition (TemplateDialog ou similaire)
import { InsertVariableButton } from "@/components/editor/InsertVariableButton";

// ... dans le JSX, au-dessus du RichTextEditor :
<InsertVariableButton
  context="document"
  onInsert={(placeholder) => {
    // Injecter le placeholder au curseur du RichTextEditor
    // (pattern à adapter selon l'editor utilisé)
    insertAtCursor(placeholder);
  }}
/>
```

**Pattern** : identique à `/admin/emails/page.tsx:1124` qui utilise déjà ce composant avec `context="email"`.

### 4.4 Note technique sur Dialog SEND

Le Dialog SEND actuel a probablement la structure suivante (à confirmer en Task 0 audit) :

- **State** : `{ open, template_id, learner_id, session_id, subject, body, step }`
- **Step 1** : Choisir destinataire (learner_id ou session_id) + sujet/corps
- **Step 2** : Confirmation + preview + envoi

**Modifications nécessaires** :
1. Ajouter `officialDocType: string | null` au state
2. Ajouter `requireTemplateChoice: boolean` au state
3. Si `requireTemplateChoice`, prefixer un **Step 0** : "Choisir template" (radio list Officials + Custom)
4. À la génération du PDF, choisir entre `template_id` ou `doc_type` selon ce qui est rempli
5. Validation : refuser submit si NI `template_id` NI `officialDocType` n'est rempli

---

## 5. Tests

### 5.1 Aucun nouveau test Vitest requis

Pure UI refacto + extension fonctionnelle d'un dialog existant. Les 550 tests existants restent verts comme garde de régression.

### 5.2 Audit Task 0 (préalable)

**Avant de toucher au Dialog SEND**, en Task 0 :
- Lire `src/app/(dashboard)/admin/documents/page.tsx:1959-2120` pour comprendre la structure exacte du Dialog SEND
- Identifier le state (interface, hook useState)
- Identifier la fonction handler (probablement `handleSend()`)
- Identifier où le PDF est généré (probablement appel à `/api/documents/generate-from-template`)
- **Documenter le résultat dans un commit "docs(documents): audit Dialog SEND avant extension V2"** pour traçabilité

### 5.3 Smoke check manuel (~15 min en Task 6)

Liste complète au § 6 ci-dessous.

---

## 6. Critères d'acceptance

**Technique** :
- [ ] Audit Dialog SEND complété en Task 0 (compréhension state + handler + génération PDF)
- [ ] Dialog SEND étendu : accepte `officialDocType` en plus de `template_id`
- [ ] Dialog SEND : si `requireTemplateChoice: true`, ajoute step 0 "choisir template"
- [ ] 12 cards Officials du catalogue ont un bouton "Envoyer" (à côté de "Aperçu" + "Utiliser comme base")
- [ ] QuickAction "Envoyer à un apprenant" ouvre Dialog SEND en mode `requireTemplateChoice: true`
- [ ] Modal édition template a `<InsertVariableButton context="document">` visible au-dessus du RichTextEditor
- [ ] Vitest 550/550 maintenu
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` success

**Validation manuelle Wissam (smoke check ~15 min en Task 6)** :
- [ ] Catalogue Official → chaque template (12) a "Envoyer" + "Aperçu" + "Utiliser comme base"
- [ ] Click "Envoyer" sur Convocation → Dialog SEND s'ouvre, template Convocation pré-sélectionné
- [ ] Renseigner destinataire (apprenant + session) → step 2 confirmation → click "Envoyer" → toast succès
- [ ] Vérifier que l'email arrive avec le PDF Convocation correct (variables substituées)
- [ ] Click QuickAction "Envoyer à un apprenant" → Dialog SEND s'ouvre, step 0 = "choisir template" avec liste Officials + Custom
- [ ] Sélectionner un template puis suivre workflow → email envoyé
- [ ] Modal "Nouveau template" → bouton "Insérer variable" visible → popover affiche 30+ variables filtrées par `context="document"` → click sur `{{nom_apprenant}}` injecte le placeholder au curseur dans le textarea
- [ ] Workflow existant non-régressé : créer template perso, supprimer, modifier, envoyer Custom

---

## 7. Pattern d'exécution

**Branche** : `feat/admin-documents-volet-2-patch-ux` (depuis `main` à `54d5502`)

**~7 tasks bite-sized** :

| Task | Livrable | Estimation |
|------|----------|-----------|
| 0 | Baseline + branche + **audit Dialog SEND** (state, handler, génération PDF) | 30 min |
| 1 | Étendre Dialog SEND pour accepter `officialDocType` + `requireTemplateChoice` | 1h |
| 2 | Ajouter bouton "Envoyer" sur les 12 cards Officials | 45 min |
| 3 | Réparer QuickAction "Envoyer à un apprenant" | 20 min |
| 4 | Ajouter `<InsertVariableButton>` dans modal édition template | 30 min |
| 5 | Vérification finale (Vitest + tsc + build + grep cohérence) | 15 min |
| 6 | STOP smoke check Wissam (~15 min) | manuel |
| 7 | Finishing après Go (merge + push prod) | 10 min |

**Ordre intentionnel** : Task 1 (extension Dialog SEND) avant Task 2 (consommateurs) car Task 2 dépend de l'API étendue de Task 1. Task 3 (QuickAction) après Task 2 car réutilise `requireTemplateChoice`. Task 4 (InsertVariableButton) indépendant.

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|-----------|
| Le Dialog SEND a une architecture qui rend l'extension complexe (handler couplé à `template_id`) | Moyen | Moyen | Audit Task 0 avant de coder. Si trop complexe, escalation Wissam pour décider entre refacto Dialog ou approche alternative. |
| La route `/api/documents/generate-from-template` ne supporte pas `doc_type` en plus de `template_id` | Faible | Élevé | Vérifié en exploration : le hook `useDocumentGeneration` accepte les 2 modes, donc la route supporte. À reconfirmer en Task 0. |
| `<InsertVariableButton>` ne s'intègre pas avec le RichTextEditor actuel | Faible | Moyen | Le composant prend un callback `onInsert(placeholder)`. À adapter au state textarea — pattern identique à emails/page.tsx. |
| Régression UX subtile sur le workflow Custom existant | Faible | Moyen | Smoke check stricte Task 6, focus sur "Envoyer" depuis Custom (workflow existant non-régressé). |
| Le step 0 "choisir template" du Dialog SEND introduit une friction supplémentaire pour les flows déjà template-pré-sélectionné | Faible | Faible | Le step 0 ne s'affiche QUE si `requireTemplateChoice: true`. Workflow direct préservé pour les clicks depuis cards Officials/Custom. |

---

## 9. Estimation finale

| Tâche | Estimation |
|-------|-----------|
| Tasks 0-5 (audit + 3 livrables + cleanup) | ~3-4h |
| Task 6 (smoke check manuel Wissam) | ~15 min |
| Task 7 (finishing) | ~10 min |
| **Total Sous-chantier 2** | **~3-4h** |

---

## 10. Suite

Après merge prod du Sous-chantier 2 :

- **Score `/admin/documents`** : passe de **~5.5/10 → ~7/10 estimé** (les 3 douleurs UX prioritaires Wissam sont fixées).
- **Sous-chantiers ultérieurs possibles** :
  - V4 Sécurité multi-tenant (3 violations résiduelles, ~4-6h)
  - V5 Refacto archi page racine 2295 LOC (DEFER selon Wissam)
  - V6 Tests Vitest (bonus)
- **Bénéfice immédiat pour l'admin** :
  - **2 clicks** pour envoyer une Convocation (au lieu de 5+)
  - QuickAction "Envoyer à un apprenant" fonctionne enfin
  - Variables découvrables directement dans le modal d'édition (pas besoin de quitter la page)

L'admin verra **dès le merge** une page beaucoup plus utilisable pour ses workflows quotidiens (convocations, conventions, attestations).

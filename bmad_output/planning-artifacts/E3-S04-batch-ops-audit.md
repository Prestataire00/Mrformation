# Audit batch operations TabConventionDocs (E3-S04)

**Date :** 2026-06-07
**Fichier :** `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (~2219 LOC)
**FR mapping :** FR-B-03 (préparation)
**Objectif :** Cartographier toutes les batch operations pour spécifier E3-S05 (dialog confirmation) et E3-S06 (handlers).

## Vue d'ensemble

| # | Batch op | Lignes | Mode d'échec | Refetch | Error handling |
|---|----------|--------|--------------|---------|----------------|
| 1 | initializeDefaultDocs | 341-449 | Partial (insert batch) | oui | try/catch + toast |
| 2 | handleMassSendWithPDF | 765-795 | Partial (server-side) | oui | try/catch + toast |
| 3 | handleDownloadAllPDF | 799-862 | Partial (2 paths) | non | try/catch + toast (server) / silent (legacy) |
| 4 | handleMassSignatureRequest | 866-895 | Partial (server-side) | oui | try/catch + toast |
| 5 | handleMassConfirm | 901-919 | Atomic (single update) | oui | result.ok check + toast |
| 6 | handleMassSend | 922-955 | Partial (for loop) | oui | catch vide (console.error seul, continue) |
| 7 | handleConfirmAllForOwner | 958-971 | Atomic (single update) | oui | result.ok check + toast |
| 8 | handleAssignTemplateToAll | 1013-1045 | Partial (upsert batch) | oui | try/catch + toast |

**Total : 8 batch operations identifiées.**

---

## Batch op 1 : initializeDefaultDocs

- **Lignes code :** 341-449
- **Déclencheur UI :** Automatique au montage (useEffect ligne 454-458) quand enrollments/companies/trainers changent
- **Preconditions :** `entity.id` présent, `loadingTemplates === false`, au moins 1 enrollment/company/trainer
- **Scope :** Crée les documents par défaut pour chaque owner (learner × 8 docs, company × 7 docs, trainer × 5 docs). Potentiellement 100+ inserts pour une session de 20 apprenants.
- **Mode d'échec :** Partial — un seul `insertDocs()` avec tout le batch. Si l'insert échoue, aucun doc n'est créé (atomique au niveau DB, mais le calcul des rows est best-effort).
- **Refetch présent :** Oui (`await onRefresh()` ligne 437)
- **Error handling :** try/catch avec toast destructive + console.error. **Correct.**
- **Flag anti-concurrence :** `initializing` state empêche les appels parallèles.
- **Risque E3-S05 :** Pas besoin de dialog confirmation (auto-trigger, pas d'action utilisateur).

## Batch op 2 : handleMassSendWithPDF

- **Lignes code :** 765-795
- **Déclencheur UI :** Bouton "Envoyer tout" par section (learner/company/trainer × docType). Référencé aux lignes 1819, 1901.
- **Preconditions :** Des documents du type existent pour la session
- **Scope :** Envoie par email TOUS les documents d'un type pour un ownerType (ex: toutes les convocations de tous les apprenants). Utilise `sendBatchEmail()` — route server-side.
- **Mode d'échec :** Partial — le serveur retourne `successCount` + `failureCount` + `errors[]`. Les échecs individuels sont reportés dans le toast mais l'opération continue.
- **Refetch présent :** Oui (`await onRefresh()` ligne 794)
- **Error handling :** try/catch avec toast destructive pour erreur globale. Partial failures reportés dans le toast description. **Correct.**
- **Loading state :** `massSending` avec clé `${ownerType}-${docType}`.
- **Risque E3-S05 :** **BESOIN DIALOG** — envoi emails en masse, irréversible, l'admin doit confirmer le nombre de destinataires.

## Batch op 3 : handleDownloadAllPDF

- **Lignes code :** 799-862
- **Déclencheur UI :** Bouton "Télécharger ZIP" par section. Référencé aux lignes 1831.
- **Preconditions :** Des documents du type existent
- **Scope :** Télécharge TOUS les PDFs d'un type en ZIP. Deux chemins :
  - **Server-side** (ligne 807-833) : si `hasBatchEndpoint(docType)` → `downloadBatchZip()` → ZIP Puppeteer côté serveur. Couvre 6 doc_types originaux.
  - **Legacy client-side** (ligne 836-861) : boucle `for...of` avec `exportHtmlToPDF()` + `setTimeout(600ms)` entre chaque PDF. Couvre les 15+ doc_types secondaires.
- **Mode d'échec :** 
  - Server-side : Partial (failureCount reporté, erreurs dans _erreurs.txt du ZIP)
  - Legacy : **Silent partial** — si un PDF échoue, la boucle continue sans toast ni compteur d'échecs.
- **Refetch présent :** Non (téléchargement pur, pas de mutation DB)
- **Error handling :**
  - Server-side : try/catch + toast. **Correct.**
  - Legacy : **Aucun try/catch dans la boucle.** Si `generateDocHtml()` ou `exportHtmlToPDF()` throw, la boucle s'arrête silencieusement. **BUG.**
- **Loading state :** `massDownloading` avec clé `${ownerType}-${docType}`.
- **Risque E3-S05 :** Dialog optionnel (pas irréversible, mais utile pour les gros volumes).

## Batch op 4 : handleMassSignatureRequest

- **Lignes code :** 866-895
- **Déclencheur UI :** Bouton "Demander signatures" par type de doc. Non visible dans le JSX lu (probablement dans DocMatrixSection ou conditionnel).
- **Preconditions :** `hasBatchSignatureRequestEndpoint(docType)` retourne true
- **Scope :** Envoie des demandes de signature électronique à TOUS les owners d'un type de doc (ex: toutes les conventions entreprise). Utilise `requestBatchSignatures()` — route server-side.
- **Mode d'échec :** Partial — le serveur retourne `successCount` + `failureCount` + `errors[]`.
- **Refetch présent :** Oui (`await onRefresh()` ligne 894)
- **Error handling :** try/catch + toast avec partial failure reporting. **Correct.**
- **Loading state :** `massRequestingSig` avec clé `docType`.
- **Risque E3-S05 :** **BESOIN DIALOG** — envoi de liens de signature par email, irréversible, liens valides 30 jours.

## Batch op 5 : handleMassConfirm

- **Lignes code :** 901-919
- **Déclencheur UI :** Bouton "Tout figer" par type de doc. Référencé aux lignes 1681, 1807, 1889.
- **Preconditions :** Des documents en statut "draft" existent pour ce docType
- **Scope :** Fige (confirme) TOUS les documents draft d'un type pour la session. Utilise `updateDocsByDocType()` — single update SQL avec filtre `onlyStatus: "draft"`.
- **Mode d'échec :** Atomic — un seul UPDATE SQL. Tout passe ou rien.
- **Refetch présent :** Oui (`await onRefresh()` ligne 918)
- **Error handling :** result.ok check + toast. Pas de try/catch wrapping `updateDocsByDocType`. **Risque si throw** — mais le service retourne `{ ok, error }` donc pas de throw attendu.
- **Loading state :** `saving` avec clé `mass-confirm-${docType}`.
- **Risque E3-S05 :** Dialog recommandé — figer = verrouiller, l'admin doit savoir combien de docs seront affectés.

## Batch op 6 : handleMassSend

- **Lignes code :** 922-955
- **Déclencheur UI :** Bouton "Envoyer" par type de doc (vue legacy). Référencé à la ligne 1691.
- **Preconditions :** Des documents confirmés (`is_confirmed`) et non envoyés (`!is_sent`) existent
- **Scope :** Envoie par email TOUS les docs confirmés d'un type à leurs learners respectifs. **Boucle client-side** `for...of` avec `fetch("/api/emails/send")` + `markDocSent()` par doc.
- **Mode d'échec :** **Partial avec continue silencieux.** Si un envoi échoue, le `catch` fait `console.error` et continue la boucle. Le compteur `sent` n'inclut que les succès.
- **Refetch présent :** Oui (`await onRefresh()` ligne 954)
- **Error handling :** **INSUFFISANT.** Le catch interne (ligne 948) fait `console.error` mais **aucun toast d'échec.** L'admin ne sait pas si des envois ont échoué. Seul le toast succès final (`${sent} document(s) envoyé(s)`) s'affiche — sans mentionner les échecs. **BUG.**
- **Loading state :** `saving` avec clé `mass-send-${docType}`.
- **Note :** Cette fonction semble être un **legacy doublon** de `handleMassSendWithPDF` (qui utilise la route batch server-side). À vérifier si elle est encore utilisée.
- **Risque E3-S05 :** **BESOIN DIALOG** — envoi emails en masse, irréversible.

## Batch op 7 : handleConfirmAllForOwner

- **Lignes code :** 958-971
- **Déclencheur UI :** Bouton "Tout figer" par owner (dans le header de chaque section apprenant/entreprise/formateur). Ligne 1290.
- **Preconditions :** Au moins 1 doc non confirmé pour cet owner
- **Scope :** Fige TOUS les documents d'un owner spécifique (ex: tous les docs de l'apprenant Dupont). Utilise `updateDocsForOwner()` — single UPDATE SQL.
- **Mode d'échec :** Atomic — single UPDATE.
- **Refetch présent :** Oui (`await onRefresh()` ligne 970)
- **Error handling :** result.ok check + toast. **Correct.**
- **Loading state :** `saving` avec clé `confirm-all-owner-${ownerId}`. **Note :** le check disabled utilise `confirm-all-${ownerId}` (sans `owner-` prefix) → **mismatch potentiel** à vérifier dans le JSX (ligne 1293).
- **Risque E3-S05 :** Dialog optionnel (moins critique que le mass confirm global).

## Batch op 8 : handleAssignTemplateToAll

- **Lignes code :** 1013-1045
- **Déclencheur UI :** Bouton "Attribuer à tous" pour un template custom. Référencé à la ligne 1736.
- **Preconditions :** `entity.id` présent, un template sélectionné, au moins 1 enrollment avec learner
- **Scope :** Crée un document custom pour CHAQUE apprenant de la session avec le template sélectionné. Utilise `upsertDocsIgnoreDuplicates()`.
- **Mode d'échec :** Partial — upsert batch, les duplicates sont ignorées (pas d'erreur).
- **Refetch présent :** Oui (`await onRefresh()` ligne 1044)
- **Error handling :** try/catch avec console.error + toast. **Note :** le toast succès (ligne 1043) s'affiche même si le try/catch a catchée une erreur — **BUG** (le `setSaving(null)` et `toast` succès sont hors du try/catch).
- **Loading state :** `saving` avec clé `assign-all`.
- **Risque E3-S05 :** Dialog recommandé — l'admin doit confirmer l'attribution à N apprenants.

---

## Résumé des bugs trouvés

| # | Bug | Batch op | Sévérité |
|---|-----|----------|----------|
| B1 | Legacy download (client-side) : pas de try/catch dans la boucle `for...of` | handleDownloadAllPDF | Moyenne |
| B2 | handleMassSend : catch silencieux (console.error sans toast), admin non informé des échecs | handleMassSend | Haute |
| B3 | handleAssignTemplateToAll : toast succès hors du try/catch, s'affiche même après erreur | handleAssignTemplateToAll | Moyenne |
| B4 | handleConfirmAllForOwner : mismatch loading key (`confirm-all-owner-` vs `confirm-all-`) | handleConfirmAllForOwner | Basse |

## Open Questions

1. **Cancel en vol possible ?** Non — aucune des 8 ops n'a de mécanisme d'annulation. Les routes server-side (batch send, batch download, batch signature) sont fire-and-forget. Pour les boucles client-side (`handleMassSend`, `handleDownloadAllPDF` legacy), un AbortController serait nécessaire.

2. **Quel pattern de progress UI ?** Actuellement : loading state booléen par type (`massSending`, `massDownloading`, `massRequestingSig`). Aucune barre de progression, aucun compteur "3/15 envoyés". Les routes server-side retournent le résultat en une fois (pas de streaming). **Recommandation E3-S06 :** pour les ops client-side, un compteur `${sent}/${total}` dans le toast serait suffisant. Pour les ops server-side, le résultat final est déjà reporté (successCount/failureCount).

3. **handleMassSend vs handleMassSendWithPDF — doublon ?** `handleMassSend` (ligne 922) est une version legacy qui envoie l'email **sans pièce jointe PDF** (juste le texte). `handleMassSendWithPDF` (ligne 765) utilise la route batch server-side et inclut le PDF en pièce jointe. Les deux sont référencées dans le JSX (lignes 1691 et 1819). **Clarification produit nécessaire :** faut-il retirer `handleMassSend` ou le conserver comme fallback ?

4. **Scope E3-S05 (dialogs confirmation) :** Quelles ops nécessitent un dialog ?
   - **Obligatoire :** handleMassSendWithPDF, handleMassSignatureRequest, handleMassSend (envois irréversibles)
   - **Recommandé :** handleMassConfirm, handleAssignTemplateToAll (actions en masse modifiant l'état)
   - **Optionnel :** handleDownloadAllPDF (pas irréversible)
   - **Pas nécessaire :** initializeDefaultDocs (auto-trigger), handleConfirmAllForOwner (scope limité à 1 owner)

5. **Entity_id check :** Les 5 services appelés (`updateDocsByDocType`, `updateDocsForOwner`, `insertDocs`, `upsertDocsIgnoreDuplicates`, `markDocSent`) prennent-ils tous `entity_id` en paramètre ? Oui pour `updateDocsByDocType` et `updateDocsForOwner` (vérifié dans les signatures). `markDocSent` prend seulement `docId` — **à auditer** pour vérifier qu'une RLS policy couvre le cas.

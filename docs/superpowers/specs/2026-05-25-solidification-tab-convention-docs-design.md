# Spec — Solidification du sous-onglet Documents > Conventions

> **Date** : 2026-05-25
> **Branche cible** : `feat/tab-convention-docs-solidification` (depuis `main`)
> **Base de cadrage** : [docs/deep-dive-tab-convention-docs.md](../../deep-dive-tab-convention-docs.md)
> **Méthode** : brainstorming → spec → writing-plans → subagent-driven-development (pattern identique aux 3 chantiers précédents)

---

## 1. Contexte et problème

Le deep-dive du 2026-05-25 a identifié sur l'onglet « Documents > Conventions » (`TabConventionDocs`, 2 101 LOC, le plus gros sous-composant Tab*) :

- **6 bugs critiques de sécurité multi-tenant** : 5 `documents.update()` sans `entity_id` filter (lignes 960, 1016, 1576, 1796 + 1 inline), `document_templates.select()` sans `entity_id` (ligne 508), `document_signatures.select()` sans `entity_id` (ligne 472).
- **1 bug critique de type safety** : cast `as unknown as Record<string, string>` ligne 1140 produit silencieusement `signer_email` undefined → tooltip badge incorrect.
- **6 bugs majeurs** : 14 `onRefresh()` fire-and-forget, 2 handlers sans try/catch (`handleMassConfirm`, `handleConfirmAllForOwner`), `catch {}` vide ligne 844 (swallow PDF generation errors), 2 `console.error` silencieuses (lignes 427 + 1096), 3 casts `as unknown as string[]` (DocMatrixSection signature), 2 TODOs Stories F1.x/F2.x (~15 doc_types sans route batch server → fallback client 600-800 ms × N docs).
- **Dette** : monolithe 2 101 LOC, 8 appels Supabase inline, constantes redondantes, zéro test unitaire sur le composant, pas d'AbortController, références au legacy `formation_convention_documents`.

L'onglet est fonctionnel à ~65 %. Cette spec décrit un chantier de solidification monobloc qui corrige les 7 bugs critiques + les 6 majeurs, crée 15 routes batch email pour résoudre les Stories F1.x/F2.x, et ajoute une couverture de tests sur les helpers.

## 2. Décisions de design (validées en brainstorming)

| Sujet | Choix |
|---|---|
| **Stories F1.x/F2.x** | 15 routes séparées (pattern existant `send-{type}s-batch-email`) |
| **Découpage du composant en `sections/`** | **Hors scope** — chantier dédié ultérieur |
| **Helpers `documents-store`** | 4 helpers spécifiques (granularité fine) |
| **Tests** | Helpers seulement (~16-20 tests Vitest) |
| **Service `batchSendDocsEmail`** | Logique métier centralisée dans `batch-email-handler.ts`, chaque route = thin wrapper |
| **`hasBatchSendEndpoint`** | Mise à jour pour couvrir 21 doc_types (6 existants + 15 nouveaux), suppression des fallback client |

## 3. Architecture cible

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/lib/services/documents-store.ts` | + 4 helpers : `updateDocsByDocType`, `updateDocsForOwner`, `getTemplateById`, `getLatestSignatureForDoc` |
| `src/lib/services/batch-email-handler.ts` | + service `batchSendDocsEmail(supabase, entityId, sessionId, docType)` |
| `src/lib/utils/batch-doc-send.ts` | `BATCH_SEND_ENDPOINTS` enrichi avec les 15 nouveaux doc_types |
| `src/lib/types/index.ts` | `FormationConventionDocument.signer_email?: string \| null` + `signer_name?: string \| null` |
| `src/components/formations/DocMatrixSection.tsx` | `docTypes: readonly string[]` (accepte `ConventionDocType[]` sans cast) |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` | Refactor : migration vers helpers + retrait casts + await onRefresh + try/catch + visibility + retrait fallbacks Stories F.x |

### Fichiers créés

| Fichier | Rôle |
|---|---|
| `src/lib/services/__tests__/documents-store.test.ts` | Tests des 4 nouveaux helpers (~16-20 tests) |
| `src/app/api/documents/send-cgv-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-reglement-interieur-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-politique-confidentialite-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-planning-semaine-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-feuille-emargement-vierge-batch-email/route.ts` | Story F1.x |
| `src/app/api/documents/send-bilans-poe-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-reponses-evaluations-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-reponses-satisfaction-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-resultats-evaluations-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-attestations-aipr-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-attestations-competences-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-attestations-abandon-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-certificats-travail-hauteur-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-certificats-diplome-batch-email/route.ts` | Story F2.x |
| `src/app/api/documents/send-avis-habilitation-electrique-batch-email/route.ts` | Story F2.x (couvre les 9 variantes via body) |

**Aucune migration SQL** dans ce chantier.

## 4. Spécifications par volet

### Volet A — Sécurité multi-tenant (résout B1, B2, B3)

#### A.1 — 4 nouveaux helpers dans `documents-store.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export type OwnerType = "session" | "learner" | "company" | "trainer" | "client" | "financier";

/**
 * UPDATE en masse de documents par doc_type pour une session.
 * Filtre par entity_id + source_id (session) + doc_type. Filtre optionnel
 * onlyStatus permet de cibler uniquement les rows en draft (pattern legacy
 * pour mass confirm).
 *
 * Résout les UPDATE inline (TabConventionDocs.tsx:960, 1576) qui manquaient
 * .eq("entity_id", entityId) — violation CLAUDE.md.
 */
export async function updateDocsByDocType(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  docType: string,
  patch: Record<string, unknown>,
  options?: { onlyStatus?: string },
): Promise<ServiceResult<{ updated: number }>> {
  let query = supabase
    .from("documents")
    .update(patch)
    .eq("entity_id", entityId)
    .eq("source_table", "sessions")
    .eq("source_id", sessionId)
    .eq("doc_type", docType);
  if (options?.onlyStatus) {
    query = query.eq("status", options.onlyStatus);
  }
  const { error, count } = await query.select("id", { count: "exact", head: true });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, updated: count ?? 0 };
}

/**
 * UPDATE en masse de documents pour un destinataire (owner) précis.
 * Filtre par entity_id + source_id (session) + owner_type + owner_id.
 *
 * Résout TabConventionDocs.tsx:1016, 1796.
 */
export async function updateDocsForOwner(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  ownerType: OwnerType,
  ownerId: string,
  patch: Record<string, unknown>,
): Promise<ServiceResult<{ updated: number }>> {
  const { error, count } = await supabase
    .from("documents")
    .update(patch)
    .eq("entity_id", entityId)
    .eq("source_table", "sessions")
    .eq("source_id", sessionId)
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .select("id", { count: "exact", head: true });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, updated: count ?? 0 };
}

/**
 * SELECT un template par ID en filtrant par entity_id (défense en profondeur).
 *
 * Résout TabConventionDocs.tsx:508 qui fetchait par template_id seulement —
 * un attaquant connaissant l'UUID pouvait charger un template cross-tenant.
 */
export async function getTemplateById(
  supabase: SupabaseClient,
  entityId: string,
  templateId: string,
): Promise<ServiceResult<{ template: DocumentTemplate | null }>> {
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, name, type, content, variables, mode, source_docx_url, default_for_doc_type")
    .eq("entity_id", entityId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, template: (data as DocumentTemplate | null) ?? null };
}

/**
 * SELECT la dernière signature pour un document.
 * Filtre via le document parent (lui-même scopé par entity_id) — défense en
 * profondeur : on vérifie d'abord que le document appartient à entityId, puis
 * on lit sa signature.
 *
 * Résout TabConventionDocs.tsx:472.
 */
export async function getLatestSignatureForDoc(
  supabase: SupabaseClient,
  entityId: string,
  documentId: string,
): Promise<ServiceResult<{ signature: { signer_name: string | null; signed_at: string | null } | null }>> {
  // 1. Confirmer que le doc appartient à entityId
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!doc) return { ok: true, signature: null };

  // 2. Lire la signature
  const { data: sig, error } = await supabase
    .from("document_signatures")
    .select("signer_name, signed_at")
    .eq("document_id", documentId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, signature: sig ?? null };
}
```

#### A.2 — Migration des 7 appels Supabase inline

Le composant migre :
- L508 `document_templates.select` → `getTemplateById(supabase, formation.entity_id, doc.template_id)`
- L472 `document_signatures.select` → `getLatestSignatureForDoc(supabase, formation.entity_id, doc.id)`
- L960 `documents.update` (mass confirm by type) → `updateDocsByDocType(supabase, formation.entity_id, formation.id, docType, { is_confirmed: true }, { onlyStatus: "draft" })`
- L1016 `documents.update` (confirm all for owner) → `updateDocsForOwner(supabase, formation.entity_id, formation.id, ownerType, ownerId, { is_confirmed: true })`
- L1576 idem
- L1796 idem (inline custom docs)

Acceptance : `grep -nE "supabase\.from\(\"(documents|document_templates|document_signatures)\"\)" TabConventionDocs.tsx` retourne 0.

### Volet B — Type safety (résout B4, M5)

#### B.1 — Bug `signer_email` (ligne 1140)

**Investigation préalable requise** : le champ `signer_email` est lu via `(doc as unknown as Record<string, string>).signer_email` mais son origine n'est pas évidente. La table `documents` n'a pas cette colonne directement. Il faut identifier où vit cette donnée :

- Option 1 : `signing_tokens.recipient_email` (la colonne où l'admin a envoyé le sign-request) — accessible via jointure
- Option 2 : `documents.metadata` JSONB qui stockerait `{ "signer_email": "..." }`
- Option 3 : champ ajouté par une migration récente non documentée
- Option 4 : **dead code** — le champ n'existe nulle part en BDD, le tooltip est cassé depuis le départ

**Action attendue par l'implémenteur** :
1. Vérifier si la colonne existe via `grep -rn "signer_email" supabase/`
2. Vérifier les jointures dans `getDocsForSession` (`src/lib/services/documents-store.ts`)
3. Selon le résultat :
   - **Si le champ existe** (option 1, 2 ou 3) : ajouter `signer_email?: string | null` à l'interface `FormationConventionDocument` + s'assurer que la jointure le charge bien. Retirer le cast.
   - **Si le champ n'existe pas** (option 4) : retirer le tooltip + le cast. Soit simplifier (`title="Envoyé pour signature"` sans dépendance), soit appeler `getLatestSignatureForDoc` à la volée pour récupérer `signer_name` (qui existe bien dans `document_signatures`).

Dans tous les cas, l'objectif est : **`grep -n "as unknown as" TabConventionDocs.tsx` retourne 0 à la fin** (acceptance criterion §5).

#### B.2 — `DocMatrixSection.docTypes` signature ajustée

Dans `src/components/formations/DocMatrixSection.tsx`, modifier l'interface props :
```ts
interface DocMatrixSectionProps {
  // ... existing
  docTypes: readonly string[];  // ← accepte ConventionDocType[] sans cast
  // ... existing
}
```

Dans `TabConventionDocs.tsx:1629, 1643, 1657`, remplacer :
```ts
docTypes={DEFAULT_LEARNER_DOCS as unknown as string[]}
```
par :
```ts
docTypes={DEFAULT_LEARNER_DOCS}
```

Acceptance : `grep -n "as unknown as" TabConventionDocs.tsx` retourne 0.

### Volet C — Robustesse (résout M1, M2, M3, M4)

#### C.1 — `await onRefresh()` partout (M1)

14 sites identifiés. Audit transverse :
```bash
grep -nE "^[[:space:]]+onRefresh\(\);" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"
```
Avant fix : ~14 résultats. Après fix : 0.

#### C.2 — try/catch sur handlers (M2)

`handleMassConfirm` (L958) et `handleConfirmAllForOwner` (L1013) deviennent :
```ts
const handleMassConfirm = async (docType: string) => {
  setSaving(`confirm-all-${docType}`);
  const result = await updateDocsByDocType(
    supabase, formation.entity_id, formation.id, docType,
    { is_confirmed: true },
    { onlyStatus: "draft" },
  );
  setSaving(null);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: `${result.updated} documents figés` });
  await onRefresh();
};
```

Pattern identique pour `handleConfirmAllForOwner` avec `updateDocsForOwner`.

#### C.3 — Compteur `failed++` dans `catch {}` vide (M3)

Ligne 844 dans `handleMassSendWithPDF()` :
```ts
// Avant :
} catch { /* swallow */ }

// Après :
} catch {
  failed++;
}
```

Le toast final affiche déjà `${succeeded} / ${failed}` — le compteur est juste rendu fidèle.

#### C.4 — Toasts sur `console.error` silencieuses (M4)

Ligne 427 `initializeDefaultDocs` :
```ts
} catch (err) {
  console.error("[initializeDefaultDocs] insert error:", err);
  toast({
    title: "Erreur",
    description: "Impossible de créer les documents par défaut",
    variant: "destructive",
  });
}
```

Ligne 1096 `handleAssignTemplateToAll` :
```ts
} catch (err: unknown) {
  console.error("[handleAssignTemplateToAll] upsert failed:", err);
  const message = err instanceof Error ? err.message : "Échec de l'attribution";
  toast({ title: "Erreur", description: message, variant: "destructive" });
}
```

### Volet D — Stories F1.x/F2.x : 15 routes batch email (résout M6)

#### D.1 — Service unifié `batchSendDocsEmail`

Ajouté à `src/lib/services/batch-email-handler.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueEmail } from "@/lib/services/email-queue";

export type BatchSendResult = ServiceResult<{
  sent: number;
  failed: number;
  errors: Array<{ recipient: string; reason: string }>;
}>;

/**
 * Envoie un document de type docType à tous les destinataires concernés
 * d'une session, via la queue email.
 *
 * Routage par docType (resolveRecipientsForDocType()):
 *  - learner-bound (convocation, certificat, attestation_*, etc.) → enrollments
 *  - company-bound (convention_entreprise, planning_semaine) → formation_companies
 *  - trainer-bound (convention_intervention, charte_formateur) → formation_trainers
 *  - session-bound (cgv, reglement_interieur, politique_confidentialite) → 1 destinataire = entité contact
 *
 * Le PDF est généré via le helper interne resolveDocumentPDF(docType, sessionId, recipientId)
 * qui réutilise les générateurs existants des routes generate-*.
 *
 * Retourne { sent, failed, errors[] } avec détail par destinataire.
 */
export async function batchSendDocsEmail(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  docType: string,
): Promise<BatchSendResult> {
  // 1. Charger la session avec check entity_id
  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, start_date, end_date, location, entity_id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (!session) return { ok: false, error: { message: "Session introuvable" } };

  // 2. Résoudre la liste des destinataires selon le docType
  const recipients = await resolveRecipientsForDocType(supabase, sessionId, docType);
  if (recipients.length === 0) {
    return { ok: true, sent: 0, failed: 0, errors: [] };
  }

  // 3. Pour chaque destinataire, générer le PDF + enqueue email
  let sent = 0;
  let failed = 0;
  const errors: Array<{ recipient: string; reason: string }> = [];

  for (const recipient of recipients) {
    try {
      const pdfBuffer = await resolveDocumentPDF(supabase, docType, sessionId, recipient.id);
      const { subject, body } = buildEmailContent(docType, session, recipient);
      await enqueueEmail(supabase, {
        to: recipient.email,
        subject,
        body,
        entity_id: entityId,
        session_id: sessionId,
        recipient_type: recipient.type,
        recipient_id: recipient.id,
        attachments: [{
          type: "file_buffer",
          filename: `${docType}_${recipient.id}.pdf`,
          content: pdfBuffer,
        }],
      });
      sent++;
    } catch (err) {
      failed++;
      errors.push({
        recipient: recipient.email,
        reason: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  return { ok: true, sent, failed, errors };
}
```

Helpers privés : `resolveRecipientsForDocType` (mapping doc_type → table source) et `resolveDocumentPDF` (réutilise les routes generate-* en interne via leurs services).

#### D.2 — 15 routes thin-wrapper

Chaque route suit le pattern strict suivant (exemple `send-cgv-batch-email`) :

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { batchSendDocsEmail } from "@/lib/services/batch-email-handler";

const Body = z.object({ session_id: z.string().uuid() });

/**
 * POST /api/documents/send-cgv-batch-email
 *
 * Envoi par email des CGV à toute la session (Story F1.x).
 * Auth : admin / super_admin / trainer.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin", "super_admin", "trainer"]);
  if (auth.error) return auth.error;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: "Requête invalide", details: (err as Error).message }, { status: 400 });
  }

  const result = await batchSendDocsEmail(
    auth.supabase, auth.profile.entity_id, body.session_id, "cgv",
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors,
  });
}
```

Les 14 autres routes diffèrent uniquement par la 4ᵉ valeur passée à `batchSendDocsEmail` (le `docType`).

**Cas spécial — Habilitation électrique** : 1 seule route `send-avis-habilitation-electrique-batch-email` qui accepte le doc_type dans le body :
```ts
const Body = z.object({
  session_id: z.string().uuid(),
  doc_type: z.enum([
    "avis_hab_elec_generique",
    "avis_hab_elec_b0_bf_bs",
    "avis_hab_elec_b1v_b2v_br",
    // ... 9 variantes
  ]),
});
```

#### D.3 — Mise à jour `BATCH_SEND_ENDPOINTS` + retrait fallbacks client

Dans `src/lib/utils/batch-doc-send.ts`, étendre `BATCH_SEND_ENDPOINTS` avec les 15 nouveaux mappings (cf §3 design).

Dans `TabConventionDocs.tsx` :
- `handleMassSendWithPDF` (L805) — le bloc `else` du fallback client (la boucle 800 ms) devient inatteignable. À supprimer + TODO L805 retiré.
- `handleDownloadAllPDF` (L899) — idem si toutes les routes `generate-*-batch` existent pour les nouveaux doc_types. À vérifier ; si certains manquent, créer aussi la route batch (générer N PDFs + ZIP côté serveur).

**Note importante** : la mise à jour de `hasBatchSendEndpoint` couvre l'envoi email (M6 partie 1). Pour l'envoi en ZIP, il faut aussi `hasBatchEndpoint` qui pointe vers les routes `generate-*-batch`. Vérifier l'état du `BATCH_DOWNLOAD_ENDPOINTS` dans `batch-doc-download.ts` — si des doc_types manquent leur route `generate-*-batch`, les ajouter (hors scope strict mais à mentionner).

### Volet F — Tests

`src/lib/services/__tests__/documents-store.test.ts` (nouveau) :

**4 tests par helper × 4 helpers = 16 tests** :

1. `updateDocsByDocType` :
   - Filtre les 4 colonnes attendues (entity_id, source_table, source_id, doc_type)
   - Filtre optionnel `onlyStatus` ajouté quand spécifié
   - Retourne `{ ok: true, updated: count }` sur succès
   - Retourne `{ ok: false, error: { message } }` sur erreur Supabase

2. `updateDocsForOwner` :
   - Filtre les 5 colonnes (entity_id, source_table, source_id, owner_type, owner_id)
   - Retour sur succès / erreur

3. `getTemplateById` :
   - Retourne le template si trouvé (avec filtre entity_id)
   - Retourne `null` si template introuvable
   - Erreur Supabase

4. `getLatestSignatureForDoc` :
   - Vérification 2-step : doc existe ET appartient à entityId → signature retournée
   - Si doc pas dans entityId → `{ ok: true, signature: null }` (pas d'erreur)
   - Si pas de signature → `{ ok: true, signature: null }`
   - Erreur Supabase

Cible totale : 475 → ≥ 491 tests.

## 5. Acceptance criteria

L'implémentation est complète quand TOUS les critères sont vrais :

- [ ] `grep -nE "supabase\.from\(\"(documents|document_templates|document_signatures)\"\)" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"` retourne 0 (tout passe par helpers)
- [ ] `grep -n "as unknown as" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"` retourne 0
- [ ] `grep -nE "^[[:space:]]+onRefresh\(\);" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"` retourne 0 (tous précédés de await)
- [ ] `grep -n "catch {}" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"` retourne 0
- [ ] Chaque `console.error` du composant est suivi d'un `toast({ variant: "destructive", ... })` dans le même handler
- [ ] `grep -n "TODO Story F" "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx"` retourne 0 (TODOs résolus)
- [ ] Les 4 helpers (`updateDocsByDocType`, `updateDocsForOwner`, `getTemplateById`, `getLatestSignatureForDoc`) sont exportés depuis `src/lib/services/documents-store.ts`
- [ ] Le service `batchSendDocsEmail` est exporté depuis `src/lib/services/batch-email-handler.ts`
- [ ] Les 15 nouvelles routes existent sous `src/app/api/documents/send-*-batch-email/route.ts`
- [ ] `hasBatchSendEndpoint(docType)` retourne `true` pour ≥ 21 doc_types (6 existants + 15 nouveaux)
- [ ] `signer_email?` ajouté à `FormationConventionDocument` dans `src/lib/types/index.ts`
- [ ] `DocMatrixSection.docTypes` accepte `readonly string[]`
- [ ] Tests : ≥ 491 verts, TypeScript clean
- [ ] Build : `npm run build` réussi

## 6. Hors scope (explicite)

- **Découpage du composant en `sections/`** — chantier dédié ultérieur (D1 de la dette)
- **Tests sur le composant TabConventionDocs.tsx** lui-même — e2e existant couvre les flux critiques
- **Tests sur les 15 nouvelles routes batch email** — pattern identique, redondant
- **Retrait du legacy `formation_convention_documents`** — la migration b-3 à b-7 est un chantier séparé
- **AbortController sur les fetchs longs** — nice-to-have hors scope
- **Refonte des constantes `DOC_LABELS`/`DOC_COLORS`** — laissées dans le composant
- **Routes `generate-*-batch` manquantes** (si certains doc_types n'ont pas leur ZIP server-side) — à examiner dans le plan d'exécution mais hors scope strict
- **eIDAS pipeline implementation** — l'infrastructure existe (champs BDD) mais pas l'intégration runtime, hors scope

## 7. Plan d'exécution attendu (à formaliser par writing-plans)

Découpage suggéré en ~17 tâches :

1. **Tâche 1** : Branche `feat/tab-convention-docs-solidification` + baseline (tests verts, TS clean)
2. **Tâche 2** : Types `FormationConventionDocument.signer_email?` + `signer_name?` + `DocMatrixSection.docTypes` signature
3. **Tâche 3** : Helper `updateDocsByDocType` + tests
4. **Tâche 4** : Helper `updateDocsForOwner` + tests
5. **Tâche 5** : Helper `getTemplateById` + tests
6. **Tâche 6** : Helper `getLatestSignatureForDoc` + tests
7. **Tâche 7** : Service `batchSendDocsEmail` dans `batch-email-handler.ts` + helpers privés `resolveRecipientsForDocType` + `resolveDocumentPDF` (+ tests intégration légers)
8. **Tâches 8-12** : 5 routes batch email Story F1.x (cgv, reglement_interieur, politique_confidentialite, planning_semaine, feuille_emargement_vierge)
9. **Tâches 13-17** : 5 routes batch email Story F2.x partie 1 (bilan_poe, reponses_evaluations, reponses_satisfaction, resultats_evaluations, attestation_aipr)
10. **Tâches 18-22** : 5 routes batch email Story F2.x partie 2 (attestation_competences, attestation_abandon, certificat_travail_hauteur, certificat_diplome, avis_habilitation_electrique)
11. **Tâche 23** : Update `BATCH_SEND_ENDPOINTS` dans `batch-doc-send.ts` (21 doc_types)
12. **Tâche 24** : Refactor TabConventionDocs — Volet C (await onRefresh + try/catch + visibility) + Volet B (retrait casts)
13. **Tâche 25** : Refactor TabConventionDocs — Volet A (migration vers helpers)
14. **Tâche 26** : Retrait des fallbacks client-side (M6) + suppression TODOs Story F.x
15. **Tâche 27** : Vérification finale acceptance criteria + build

Note : les tâches 8-22 (15 routes) peuvent être groupées en 5 packs de 3 routes chacune si l'implémenteur est rapide, ou exécutées une par une si le pattern est strictement respecté. À confirmer par writing-plans.

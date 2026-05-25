# Spec — Solidification du sous-onglet Qualiopi

> **Date** : 2026-05-25
> **Branche cible** : `feat/qualiopi-solidification` (depuis `main`)
> **Base de cadrage** : [docs/deep-dive-qualiopi.md](../../deep-dive-qualiopi.md)
> **Méthode** : brainstorming → spec → writing-plans → subagent-driven-development (workflow superpowers identique à Automatisations)

---

## 1. Contexte et problème

Le deep-dive du 2026-05-25 a identifié sur l'onglet Qualiopi (TabQualiopi de la fiche formation) :

- **4 bugs critiques** : deux scores divergents entre composant et liste (B1) ; `loadQualiopiIndicators` qui lit `enrollments`/`signatures` sans filtre `entity_id` (B2) ; `qualiopi_score` non typé dans l'interface `Session`, cast `as unknown as` (B3) ; mapping `status` → `is_signed/is_sent` dupliqué entre `getDocsForSession()` et la route `qualiopi-mock-audit` (B4).
- **6 bugs majeurs** : update `qualiopi_score` sans error handling (M1) ; checks manuels stockés en JSON sérialisé dans le champ partagé `sessions.notes` (M2) ; bouton « Traiter » qui fait un full reload (M3) ; N+1 queries dans `fetchResponseCounts` (M4) ; table `qualiopi_snapshots` créée mais jamais écrite (M5) ; route `qualiopi-check-proof` complète et testée mais aucune UI ne l'appelle (M6).
- **Dette** : prop `onRefresh` jamais utilisée, absence de validation Zod sur les routes IA, pas d'`AbortController`, audit limité à `slice(0, 3)`, persistance bloquée si `score === 0`, zéro test sur le composant ou `loadQualiopiIndicators`.

L'onglet est fonctionnel à ~70 %. Cette spec décrit un chantier de solidification monobloc qui corrige les 4 critiques, traite les 6 majeurs, purge la dette et construit la feature « historique des snapshots » avec UI.

## 2. Décisions de design (validées en brainstorming)

| Sujet | Choix |
|---|---|
| **Score unifié** | Nouvelle lib `src/lib/services/qualiopi-score.ts` |
| **Manual checks** | Nouvelle colonne `sessions.qualiopi_manual JSONB` (migration des `notes` existantes) |
| **Snapshots** | Cron Netlify quotidien (`0 3 * * *`), insert uniquement si le score a changé depuis le dernier snapshot |
| **Historique UI** | Sparkline à côté du badge + Sheet shadcn dépliable avec graphique linéaire + tableau |
| **Audit IA complet** | Sheet shadcn « Voir l'audit détaillé » depuis le card actuel |
| **`qualiopi_snapshots`** | Construite (table existe déjà, ajout de l'écriture + UI) |
| **`qualiopi-check-proof`** | Retrait complet (drop route + drop table, après vérification 0 row) |

## 3. Architecture cible

```
src/lib/services/
  qualiopi-score.ts                 ← NEW : buildQualiopiItems + computeQualiopiScore
  qualiopi-snapshots.ts             ← NEW : helpers de snapshotting (logique "si changé")
  load-session-aggregates.ts        ← MOD : entity_id filter sur enrollments/signatures

src/lib/utils/
  document-status.ts                ← NEW : mapStatusToFlags(status) → { is_signed, is_sent, is_confirmed }

src/lib/types/
  index.ts (Session)                ← MOD : ajout qualiopi_score, qualiopi_manual

src/app/(dashboard)/admin/formations/[id]/_components/
  TabQualiopi.tsx                                 ← MOD : utilise qualiopi-score lib + refactor persistance + retrait code mort
  QualiopiSparkline.tsx                           ← NEW
  QualiopiHistoryDetail.tsx                       ← NEW (Sheet)
  QualiopiAuditDetail.tsx                         ← NEW (Sheet)

src/app/api/
  ai/qualiopi-mock-audit/route.ts                 ← MOD : utilise mapStatusToFlags + Zod
  ai/qualiopi-check-proof/route.ts                ← DEL
  qualiopi/snapshots/route.ts                     ← NEW : POST (cron) + GET (Sheet)

netlify/functions/
  process-qualiopi-snapshots.mts                  ← NEW : cron `0 3 * * *`

supabase/migrations/
  qualiopi_solidification.sql                     ← NEW

src/lib/__tests__/
  qualiopi-score.test.ts                          ← MOD : étendu (couverture composant ET liste)
  qualiopi-snapshots.test.ts                      ← NEW
  document-status.test.ts                         ← NEW
src/lib/services/__tests__/
  load-session-aggregates.test.ts                 ← NEW (focus loadQualiopiIndicators)
```

## 4. Spécifications par volet

### Volet A — Score unifié (résout B1)

**Constat précis** (vérifié par grep le 2026-05-25) : `computeQualiopiScore` exporté actuel n'est appelé que par les tests. Les listes formations et le KPI lisent directement la colonne `sessions.qualiopi_score` (persistée par le composant). Donc en runtime, il n'y a qu'UNE seule logique en vie — celle inline dans `TabQualiopi.tsx`. L'autre est une logique morte testée par des tests qui valident… une chose que personne n'appelle.

**Fix** : extraire la logique du composant dans une lib testable. Supprimer la fonction morte. Migrer ses tests pour tester la nouvelle lib.

**Fichier** : `src/lib/services/qualiopi-score.ts`

```ts
import type { Session } from "@/lib/types";

export type QualiopiCategory = "documents" | "evaluations" | "sous_traitance";
export type QualiopiItemType = "auto" | "auto_percent" | "manual";

export interface QualiopiScoreItem {
  id: string;
  label: string;
  category: QualiopiCategory;
  type: QualiopiItemType;
  value: boolean;
  percent?: number;
  subLabel?: string;
}

export interface ComputeOptions {
  /**
   * Counts de réponses aux questionnaires par clé (eval_preformation,
   * eval_postformation, satisfaction). Quand fourni, les items auto_percent
   * utilisent le % réel. Quand absent, ils valent 0% (pas de questionnaire rempli).
   */
  responseCounts?: Record<string, { total: number; done: number }>;
  /** Lu pour les checks manuels (sous-traitance). Sinon false. */
  manualChecks?: Record<string, boolean>;
}

/** Construit la liste exhaustive des items Qualiopi pour une formation. */
export function buildQualiopiItems(formation: Session, opts?: ComputeOptions): QualiopiScoreItem[];

/** Calcule le score (0–100) à partir des items. */
export function computeQualiopiScore(formation: Session, opts?: ComputeOptions): number;
```

**Règles métier (alignées sur la version composant actuelle)** :
- 8 items de base : `convention_signed`, `convocation_sent` (allSent), `convention_intervention_signed`, `eval_preformation` (%), `eval_postformation` (%), `satisfaction_learner` (%), `certificat_sent` (allSent), `support_cours` (elearningAssignments.length > 0).
- Si `formation.is_subcontracted === true`, ajoute 2 items sous-traitance : `docs_formation_sent` (auto), `docs_post_formation_received` (manuel).
- Score = `round((sum_achieved / count_items) * 100)` où `achieved = percent/100` pour `auto_percent`, `value ? 1 : 0` pour les autres.

**Consumers** :
- **TabQualiopi.tsx** : appelle `buildQualiopiItems(formation, { responseCounts, manualChecks })` pour la liste rendue + `computeQualiopiScore` (même opts) pour le badge. La fonction inline du composant est supprimée.
- **Snapshots cron** (volet G) : appelle `computeQualiopiScore(formation, { responseCounts, manualChecks })` après avoir chargé responseCounts et manualChecks pour la session.
- **Plus de fonction `computeQualiopiScore` exportée depuis `TabQualiopi.tsx`.** L'export à `src/lib/services/qualiopi-score.ts` devient l'unique source.

**Tests** : `qualiopi-score.test.ts` migré pour importer depuis `@/lib/services/qualiopi-score` au lieu du composant.

### Volet B — Sécurité multi-tenant (résout B2)

`src/lib/services/load-session-aggregates.ts` :

- En tête de `loadQualiopiIndicators(supabase, sessionId)`, charger `session.entity_id` une fois.
- Propager via `.eq("entity_id", entityId)` sur **toutes** les queries Supabase de la fonction : `enrollments`, `signatures`, `questionnaire_responses`, etc.
- Si `session` introuvable → retourner un `QualiopiIndicators` neutre (zéros) avec un `console.warn` (cohérent avec le pattern existant des autres helpers).

### Volet C — Typage propre (résout B3)

`src/lib/types/index.ts` (ou fichier équivalent qui définit `Session`) :

```ts
export interface Session {
  // ... (existant)
  qualiopi_score?: number | null;
  qualiopi_manual?: Record<string, boolean> | null;
}
```

**Audit transverse** : `grep -rn "as unknown as { qualiopi" src/` doit renvoyer 0 résultat à la fin.

### Volet D — Mapping `status` → flags factorisé (résout B4)

`src/lib/utils/document-status.ts` :

```ts
export type DocStatus = "draft" | "generated" | "sent" | "signed" | "cancelled";

export interface DocFlags {
  is_confirmed: boolean;  // status !== draft
  is_sent: boolean;       // status in ('sent', 'signed')
  is_signed: boolean;     // status === 'signed'
}

export function mapStatusToFlags(status: DocStatus | string | null | undefined): DocFlags {
  const s = (status ?? "draft") as DocStatus;
  return {
    is_confirmed: s !== "draft",
    is_sent: s === "sent" || s === "signed",
    is_signed: s === "signed",
  };
}
```

**Consumers à migrer** :
- `src/app/api/ai/qualiopi-mock-audit/route.ts` : remplace le mapping inline (lignes 34-40).
- `src/lib/services/documents-store.ts` (fonction `getDocsForSession`) : remplace son mapping inline.

### Volet E — Persistance robuste (résout M1, M2)

**Migration SQL** (`supabase/migrations/qualiopi_solidification.sql`) :

```sql
-- 1. Nouvelle colonne pour les checks manuels Qualiopi
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qualiopi_manual JSONB DEFAULT '{}'::jsonb;

-- 2. Migration des notes existants (best-effort, idempotent)
UPDATE sessions
SET qualiopi_manual = COALESCE((notes::jsonb -> 'qualiopi_manual'), '{}'::jsonb)
WHERE notes IS NOT NULL
  AND notes ~ '^[\s]*{'    -- ressemble à du JSON
  AND (qualiopi_manual = '{}'::jsonb OR qualiopi_manual IS NULL);

-- 3. Drop check-proof (vérif préalable manuelle : COUNT == 0)
-- À EXÉCUTER MANUELLEMENT après vérification :
--   SELECT count(*) FROM qualiopi_proof_checks;
--   -- si 0 → DROP TABLE IF EXISTS qualiopi_proof_checks;
```

**Code TabQualiopi** :

- Au chargement, lire `formation.qualiopi_manual` (depuis la prop) — plus de requête sur `sessions.notes`.
- `handleManualToggle(itemId, checked)` :
  ```ts
  const newChecks = { ...manualChecks, [itemId]: checked };
  setManualChecks(newChecks);
  const { error } = await supabase
    .from("sessions")
    .update({ qualiopi_manual: newChecks })
    .eq("id", formation.id);
  if (error) {
    setManualChecks(manualChecks); // rollback optimiste
    toast({ title: "Échec de la sauvegarde", description: error.message, variant: "destructive" });
  }
  ```

- Persistance score :
  ```ts
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { error } = await supabase.from("sessions").update({ qualiopi_score: score }).eq("id", formation.id);
      if (error) console.warn("[qualiopi] persist score failed:", error.message);
    })();
  }, [score, loading, formation.id, supabase]);
  ```
  **Suppression de la condition `if (score === 0) return`.** Une formation peut légitimement valoir 0.

### Volet F — UX & perf (résout M3, M4)

**Bouton « Traiter »** :
- Remplacer `window.location.href = url.toString()` par `router.replace(url.pathname + "?" + url.searchParams.toString())` (import `useRouter` de `next/navigation`).
- Conserve l'état React, scroll position, contexte utilisateur.

**`fetchResponseCounts`** :
- Remplacer la boucle N+1 par une seule query Supabase :
  ```ts
  const allQuestionnaireIds = [
    ...preFormation.map(a => a.questionnaire_id),
    ...postFormation.map(a => a.questionnaire_id),
    ...satisAssignments.map(a => a.questionnaire_id),
  ];
  const { data: groupedCounts } = await supabase.rpc("count_responses_by_questionnaire", {
    p_session_id: formation.id,
    p_questionnaire_ids: allQuestionnaireIds,
  });
  ```
- **Fonction RPC** (à créer dans la migration) :
  ```sql
  CREATE OR REPLACE FUNCTION count_responses_by_questionnaire(
    p_session_id UUID,
    p_questionnaire_ids UUID[]
  ) RETURNS TABLE(questionnaire_id UUID, response_count BIGINT)
  LANGUAGE sql STABLE AS $$
    SELECT questionnaire_id, COUNT(*)::BIGINT
    FROM questionnaire_responses
    WHERE session_id = p_session_id
      AND questionnaire_id = ANY(p_questionnaire_ids)
    GROUP BY questionnaire_id;
  $$;
  ```

### Volet G — Snapshots (construction de la feature)

**Logique helper** : `src/lib/services/qualiopi-snapshots.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SnapshotResult {
  inserted: number;
  skipped: number;
  errors: number;
}

/**
 * Pour chaque session "active" d'une entité, recalcule le score Qualiopi
 * et insère un snapshot dans qualiopi_snapshots uniquement s'il diffère du
 * dernier snapshot (par session_id, le plus récent par snapshot_date).
 */
export async function snapshotEntityQualiopi(
  supabase: SupabaseClient,
  entityId: string,
): Promise<SnapshotResult>;
```

**Définition « session active »** :
```sql
end_date >= NOW() - INTERVAL '6 months'
OR start_date <= NOW() + INTERVAL '12 months'
```

**Cron Netlify** : `netlify/functions/process-qualiopi-snapshots.mts`

```ts
import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("CRON_SECRET missing", { status: 500 });

  const res = await fetch(`${baseUrl}/api/qualiopi/snapshots`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const data = await res.json();
  console.log("[cron] qualiopi-snapshots result:", JSON.stringify(data));
  return new Response(JSON.stringify(data), { status: res.status });
};

export const config: Config = { schedule: "0 3 * * *" };
```

**Route API** : `src/app/api/qualiopi/snapshots/route.ts`

- `POST` : authentifié par `CRON_SECRET` (le bypass middleware existe déjà depuis le fix Automatisations). Itère sur les entités, appelle `snapshotEntityQualiopi(supabase, entityId)`, retourne `{ totalInserted, totalSkipped, errors }`.
- `GET` : authentifié `requireRole(["admin","super_admin","trainer"])`. Query param `session_id`. Retourne `qualiopi_snapshots` filtrés par `session_id` (et `entity_id` du user, défense en profondeur). Limit 90 derniers + ORDER BY `snapshot_date DESC`.

**Composant Sparkline** : `QualiopiSparkline.tsx`

```ts
interface Props { sessionId: string; }
// Fetch GET /api/qualiopi/snapshots?session_id=X (30 derniers points)
// Render <ResponsiveContainer><LineChart><Line dot=false /></LineChart></ResponsiveContainer>
// Compact : 80x24px, à côté du Badge score
```

**Composant HistoryDetail** : `QualiopiHistoryDetail.tsx`

- Sheet shadcn (panneau latéral droit, largeur lg)
- En-tête : titre formation + score actuel
- Body : graphique linéaire complet (recharts) + tableau snapshots dates/scores (10 par page, paginer si > 10)
- Si aucun snapshot : empty state « Premier snapshot demain à 3h UTC »

### Volet H — Audit complet IA (résout dette)

`QualiopiAuditDetail.tsx` (Sheet shadcn) :

- Déclenché par bouton « Voir l'audit détaillé » dans le card audit du TabQualiopi.
- Affiche `auditResult` complet : verdict + findings groupés par critère (1–7) + plan d'action complet avec priority (urgent/high/medium).
- Le card du TabQualiopi conserve son résumé compact (3 premiers findings).

### Volet I — Cleanup `qualiopi-check-proof` (résout M6)

1. **Vérification BDD** : `SELECT count(*) FROM qualiopi_proof_checks` doit être 0 (sinon, escalader à Wissam).
2. **Drop table** : `DROP TABLE IF EXISTS qualiopi_proof_checks;` (inclus dans la migration, ou exécuté manuellement avec garde-fou).
3. **Suppression du fichier** : `rm src/app/api/ai/qualiopi-check-proof/route.ts`.
4. **Mise à jour des tests e2e** : retirer le test `qualiopi-check-proof protégée` dans `e2e/qualiopi-ia.spec.ts`.

### Volet J — Tests (résout absence de couverture)

**`src/lib/__tests__/qualiopi-score.test.ts`** (migré depuis l'ancien fichier, import depuis `@/lib/services/qualiopi-score`) :
- Formation vide (rien d'assigné, rien de signé) → 0%
- Formation avec convention signée seule → 1/8 = 13%
- Formation avec questionnaires assignés mais 0 réponse (responseCounts à 0/N) → les `auto_percent` valent 0
- Formation avec questionnaires 100% remplis → les `auto_percent` valent 100
- Formation tous documents OK + questionnaires 100% → 100%
- Formation avec `is_subcontracted=true` → 10 items au lieu de 8
- `manualChecks` absents → items manuels valent `false`
- `manualChecks={ docs_post_formation_received: true }` → item manuel `true`

**`src/lib/__tests__/qualiopi-snapshots.test.ts`** (nouveau) :
- Premier snapshot pour une session → insert
- Score inchangé depuis le dernier snapshot → skip
- Score changé → insert
- Pas de session active dans l'entité → 0 inserted, 0 skipped, 0 errors

**`src/lib/__tests__/document-status.test.ts`** (nouveau) :
- 5 statuts (draft, generated, sent, signed, cancelled) → flags attendus
- null / undefined / status inconnu → flags par défaut (draft-like)

**`src/lib/services/__tests__/load-session-aggregates.test.ts`** (nouveau, focus Qualiopi) :
- `loadQualiopiIndicators` charge bien `session.entity_id` puis filtre toutes les queries
- Calcul de `satisfactionRate` correct sur scale 1-5
- `acquisitionRate` respecte le seuil 70%
- Si session introuvable → renvoie valeurs neutres sans crash

### Volet K — Dette résiduelle

- Retirer la prop `onRefresh` de `TabQualiopi` (et de son call site).
- Ajouter `AbortController` sur le fetch `qualiopi-mock-audit` :
  ```ts
  useEffect(() => () => abortController.current?.abort(), []);
  ```
- Schéma Zod pour le body de `qualiopi-mock-audit` :
  ```ts
  const Body = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("formation"), session_id: z.string().uuid() }),
    z.object({ mode: z.literal("global") }),
  ]);
  ```

## 5. Migrations SQL

Toutes regroupées dans `supabase/migrations/qualiopi_solidification.sql` :

```sql
-- ============================================================
-- Migration : Solidification Qualiopi — 2026-05-25
-- ============================================================

-- 1. Nouvelle colonne sessions.qualiopi_manual
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qualiopi_manual JSONB DEFAULT '{}'::jsonb;

-- 2. Migration depuis sessions.notes (best-effort, tolérante au texte invalide).
--    Une fonction temporaire intercepte les exceptions du cast ::jsonb pour les
--    sessions dont notes contient du texte libre commençant par { mais qui n'est
--    pas du JSON valide. Plus sûr qu'un CASE WHEN regex seul.
CREATE OR REPLACE FUNCTION pg_temp.safe_extract_qualiopi_manual(input_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
  IF input_notes IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN COALESCE((input_notes::jsonb -> 'qualiopi_manual'), '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$$;

UPDATE sessions
SET qualiopi_manual = pg_temp.safe_extract_qualiopi_manual(notes)
WHERE qualiopi_manual = '{}'::jsonb OR qualiopi_manual IS NULL;

-- pg_temp est auto-cleaned en fin de session, pas besoin de DROP.

-- 3. Fonction RPC pour batching des response counts
CREATE OR REPLACE FUNCTION count_responses_by_questionnaire(
  p_session_id UUID,
  p_questionnaire_ids UUID[]
) RETURNS TABLE(questionnaire_id UUID, response_count BIGINT)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT questionnaire_id, COUNT(*)::BIGINT
  FROM questionnaire_responses
  WHERE session_id = p_session_id
    AND questionnaire_id = ANY(p_questionnaire_ids)
  GROUP BY questionnaire_id;
$$;
GRANT EXECUTE ON FUNCTION count_responses_by_questionnaire TO authenticated;

-- 4. Drop check-proof (À EXÉCUTER APRÈS VÉRIFICATION COUNT = 0)
-- SELECT count(*) FROM qualiopi_proof_checks;
-- Si 0 → décommenter :
-- DROP TABLE IF EXISTS qualiopi_proof_checks;
```

## 6. Acceptance criteria

L'implémentation est jugée terminée quand TOUS les critères suivants sont vrais :

- [ ] `grep -rn "as unknown as { qualiopi" src/` retourne 0
- [ ] `grep -rn "computeQualiopiScore" src/` ne pointe plus que vers `src/lib/services/qualiopi-score.ts` (et ses imports)
- [ ] Toutes les queries de `loadQualiopiIndicators` ont un `.eq("entity_id", entityId)` (vérifiable par grep)
- [ ] La table `qualiopi_proof_checks` n'existe plus en BDD
- [ ] Le fichier `src/app/api/ai/qualiopi-check-proof/route.ts` n'existe plus
- [ ] La colonne `sessions.qualiopi_manual` existe et est utilisée par TabQualiopi (plus de lecture/écriture de `sessions.notes` pour les manual checks)
- [ ] Le bouton « Traiter » utilise `router.replace` (plus de `window.location.href` dans TabQualiopi)
- [ ] La requête `fetchResponseCounts` fait 1 round-trip BDD au lieu de N
- [ ] Une Netlify Scheduled Function `process-qualiopi-snapshots.mts` est planifiée `0 3 * * *`
- [ ] Le composant `QualiopiSparkline.tsx` est rendu à côté du badge dans TabQualiopi
- [ ] Le bouton « Voir l'historique détaillé » ouvre `QualiopiHistoryDetail` (Sheet)
- [ ] Le bouton « Voir l'audit détaillé » ouvre `QualiopiAuditDetail` (Sheet) avec tous les findings
- [ ] La prop `onRefresh` n'apparaît plus dans `TabQualiopi.tsx`
- [ ] Le fetch `qualiopi-mock-audit` est annulable via `AbortController`
- [ ] La route `qualiopi-mock-audit` valide son body avec Zod
- [ ] Tests : `qualiopi-score.test.ts` étendu, 3 nouveaux fichiers de tests, tous passants (cible : ≥ 460/460 vert)
- [ ] Aucun TypeScript error : `npx tsc --noEmit` clean

## 7. Hors scope (intentionnellement)

- Refonte UX globale du TabQualiopi (rest the same look, on cible la dette)
- Notifications push si score chute (peut être un chantier ultérieur)
- Export PDF de l'historique des snapshots
- Internationalisation
- Critères Qualiopi 1-7 mapping explicite par item de la checklist (UX nice-to-have)
- Schéma Zod sur `qualiopi-mock-audit` côté réponse LLM (le LLM est trusté)

## 8. Plan d'exécution attendu (à formaliser par writing-plans)

Le plan d'implémentation, produit par la skill `writing-plans`, décomposera ce chantier en tâches granulaires. Découpage suggéré (à confirmer par writing-plans) :

1. Migration SQL + types `Session` étendus (Volet C + base de E + base de F RPC)
2. `document-status.ts` utilitaire + tests (Volet D)
3. `qualiopi-score.ts` lib (extraction depuis TabQualiopi) + migration des tests existants + suppression de `computeQualiopiScore` inline du composant (Volet A)
4. `loadQualiopiIndicators` entity_id filter + tests (Volet B)
5. Refactor TabQualiopi (persistance + bouton Traiter + retrait prop morte + AbortController + suppression code mort)
6. Batching `fetchResponseCounts` via RPC
7. `qualiopi-snapshots.ts` + route API `/api/qualiopi/snapshots` + cron Netlify + tests
8. `QualiopiSparkline` + `QualiopiHistoryDetail` (Sheet)
9. `QualiopiAuditDetail` (Sheet) + retrait `slice(0, 3)`
10. Zod sur `qualiopi-mock-audit` + utilise `mapStatusToFlags`
11. Cleanup `qualiopi-check-proof` (drop route + drop table + retrait test e2e)
12. Vérification finale (acceptance criteria, build, tests, typecheck)

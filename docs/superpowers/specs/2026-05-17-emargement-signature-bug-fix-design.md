# Design : Fix bug signature émargement (QR + admin direct)

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (brainstorming session)
**Statut** : approved (brainstorming)
**Story** : Bug critique production — signature impossible sur les 2 flows (QR + admin direct)

## Contexte / Problème

L'utilisateur (super_admin Wissam) reporte que la signature des feuilles d'émargement ne fonctionne plus :
- Via QR code : "Erreur 500" affichée sur la page publique `/emargement/[token]` après clic Valider
- Via signature directe dans `TabEmargements` (admin space) : toast "Erreur réseau" après clic Valider, en réalité un 500 HTTP

### Diagnostic (audit complet)

Investigation via Netlify Functions logs → vraie erreur identifiée :

```
ERROR ⨯ Error [ERR_REQUIRE_ESM]:
require() of ES Module /var/task/node_modules/@exodus/bytes/encoding-lite.js
from /var/task/node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js
not supported.
```

**Chaîne de causalité** :
- `src/lib/utils/sanitize-svg.ts:1` importe `isomorphic-dompurify`
- En runtime serverless Node.js (Netlify Functions), `isomorphic-dompurify` charge `jsdom`
- `jsdom` charge `html-encoding-sniffer` (CommonJS)
- `html-encoding-sniffer` tente `require('@exodus/bytes/encoding-lite.js')` (ESM-only depuis v5)
- → Crash au load du module
- → Next.js renvoie la page HTML 500 générique
- → Côté client, `JSON.parse(<html>)` échoue → catch dans `handleAdminSign` → toast "Erreur réseau"

**Routes API impactées** (3) :
- `/api/signatures` (admin direct sign via TabEmargements)
- `/api/emargement/sign` (QR public sign)
- `/api/documents/sign` (signature de documents convention)

### Anomalies secondaires identifiées (audit RLS)

L'investigation a aussi révélé des problèmes RLS sur `signatures` qui auraient bloqué la signature même après fix du sanitizer :

1. **RLS `signatures_admin_all`** : exige `user_role() = 'admin'` strict, exclut `super_admin`. Diagnostic en prod confirmé : la fonction `user_role()` existe bien dans le schéma `public` (pas `auth`), mais la policy n'accepte qu'`admin`.
2. **RLS `signatures_trainer_insert`** : exige `signer_id = auth.uid()` mais `signer_id` est le `trainer.id` (pas le `profile.id`). Empêche un formateur de signer pour lui-même via la route authentifiée.
3. **RLS `signing_tokens_admin_all`** : même problème super_admin probable.
4. **Vieille contrainte `unique_session_signer`** (sans `time_slot_id`) : non présente en prod (vérifié via `pg_constraint`). `DROP IF EXISTS` reste safe.

### Anomalie #4 : route GET `/api/emargement` manque `all_slots`

La page publique `src/app/emargement/[token]/page.tsx:243` attend `refreshData.all_slots` après une signature pour proposer les créneaux restants. La route GET ne retourne pas ce champ → après la 1ère signature QR, l'utilisateur ne peut pas signer le créneau suivant sans rescanner.

## Comportement attendu après fix

### Admin direct sign (TabEmargements)
- Super_admin / admin clique "Signer" pour un apprenant/formateur sur un créneau
- SignaturePad s'ouvre, l'utilisateur dessine
- Clic Valider → POST `/api/signatures` → 200 + signature en DB
- Toast "Signature enregistrée pour X"
- Refresh de la liste, la ligne passe de "En attente" à "Signé"

### QR code sign
- Apprenant/formateur scanne QR → ouvre `/emargement/[token]`
- Page affiche détails session + canvas
- Clic Valider → POST `/api/emargement/sign` → 200
- Si token session (multi-slots) : après signature, page affiche les créneaux restants à signer (via `all_slots`)
- Si token individual : message de succès final

### Lecture des signatures
- Super_admin / admin voit toutes les signatures de son entité dans TabEmargements (RLS read)
- Formateur voit ses propres signatures et celles de ses sessions assignées
- Apprenant voit ses propres signatures

## Architecture du fix

### Composant 1 — `sanitize-svg.ts` (remplacer isomorphic-dompurify)

Fichier : `src/lib/utils/sanitize-svg.ts`

Approche : **garder DOMPurify identique**, remplacer le DOM provider crashant (`jsdom` via `isomorphic-dompurify`) par `linkedom` (pure JS, ESM/CJS friendly, ~30kb, utilisé par Vite + Astro). Comportement de sanitization bit-pour-bit identique → zéro régression sur les 5 consumers.

```typescript
import DOMPurify from "dompurify";
import { parseHTML } from "linkedom";

const { window } = parseHTML("<!DOCTYPE html><html><body></body></html>");
const purify = DOMPurify(window as unknown as Window);

// Whitelists tags + attrs identiques à l'existant (cf code actuel)
const ALLOWED_TAGS = [...];
const ALLOWED_ATTR = [...];
const FORBID_TAGS = [...];

export function sanitizeSignatureSvg(input: string): string {
  if (!input || typeof input !== "string") return "";
  if (/^data:image\/(png|jpeg|jpg|gif|webp);/i.test(input)) return input;

  const cleaned = purify.sanitize(input, {
    USE_PROFILES: { svg: true, svgFilters: false },
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR: ["href", "xlink:href"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });

  return typeof cleaned === "string" ? cleaned : String(cleaned);
}
```

Changements `package.json` :
- ➖ `"isomorphic-dompurify": "^3.12.0"` (et toute la chaîne jsdom transitive)
- ➕ `"linkedom": "^0.18.0"`
- ✅ `"dompurify": "^3.3.3"` (déjà présent, conservé)
- ✅ `"@types/dompurify": "^3.0.5"` (conservé)

### Composant 2 — Migration SQL

Fichier : `supabase/migrations/fix_emargement_signature_bug.sql`

Exécution manuelle dans Supabase Dashboard SQL Editor (cohérent CLAUDE.md).

```sql
-- 1. Safety net : drop vieille contrainte UNIQUE si présente (no-op en prod, déjà absente)
ALTER TABLE signatures DROP CONSTRAINT IF EXISTS unique_session_signer;

-- 2. Safety net : colonnes attendues par la route (no-op si déjà présentes)
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS time_slot_id UUID REFERENCES formation_time_slots(id) ON DELETE SET NULL;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signature_method TEXT DEFAULT 'handwritten';

-- 3. Garantir le partial unique index slot-aware
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_sig_slot
  ON signatures (session_id, signer_id, signer_type, time_slot_id)
  WHERE time_slot_id IS NOT NULL;

-- 4. RLS signatures : admin → admin/super_admin (user_role() en public, pas auth)
DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id()) OR session_id IS NULL)
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND (session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id()) OR session_id IS NULL)
  );

-- 5. RLS trainer insert : signer_id = trainer.id (via profile_id), pas auth.uid()
DROP POLICY IF EXISTS "signatures_trainer_insert" ON signatures;
CREATE POLICY "signatures_trainer_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    user_role() = 'trainer'
    AND signer_type = 'trainer'
    AND signer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- 6. RLS trainer read (même correction)
DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND (
      signer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
      OR session_id IN (
        SELECT s.id FROM sessions s
        JOIN trainers t ON t.id = s.trainer_id
        WHERE t.profile_id = auth.uid() AND s.entity_id = user_entity_id()
      )
    )
  );

-- 7. signing_tokens : super_admin manquait probablement aussi
DROP POLICY IF EXISTS "signing_tokens_admin_all" ON signing_tokens;
CREATE POLICY "signing_tokens_admin_all" ON signing_tokens
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  );

-- Note : signatures_learner_* policies inchangées (signer_id = auth.uid() côté learner reste correct)
```

### Composant 3 — Route GET `/api/emargement` (ajout `all_slots`)

Fichier : `src/app/api/emargement/route.ts`

Après récupération de `tokenData` + `session_id`, charger tous les créneaux de la session avec leur statut signé pour le signer du token :

```typescript
// Charger tous les créneaux de la session
const { data: slots } = await supabase
  .from("formation_time_slots")
  .select("id, start_time, end_time, slot_label")
  .eq("session_id", tokenData.session_id)
  .order("start_time", { ascending: true });

// Pour le signer du token, identifier les slots déjà signés
const signerId = tokenData.signer_type === "trainer"
  ? tokenData.trainer_id
  : tokenData.learner_id;

let signedSlotIds = new Set<string>();
if (signerId) {
  const { data: existingSigs } = await supabase
    .from("signatures")
    .select("time_slot_id")
    .eq("session_id", tokenData.session_id)
    .eq("signer_id", signerId)
    .eq("signer_type", tokenData.signer_type ?? "learner");
  signedSlotIds = new Set(
    (existingSigs ?? []).map((s) => s.time_slot_id).filter((id): id is string => Boolean(id))
  );
}

const all_slots = (slots ?? []).map((s) => ({
  id: s.id,
  start_time: s.start_time,
  end_time: s.end_time,
  label: s.slot_label,
  signed: signedSlotIds.has(s.id),
}));

// Ajouter all_slots à la response JSON existante
return NextResponse.json({
  ...existingResponse,
  all_slots,
});
```

Le frontend (`src/app/emargement/[token]/page.tsx:243`) consomme déjà ce champ via :
```typescript
if (refreshData.all_slots) {
  setRemainingSlots(sortSlotsByStart(refreshData.all_slots));
}
```

Donc aucune modification frontend requise.

## Tests

### Tests Vitest sanitize-svg

Fichier : `src/lib/utils/__tests__/sanitize-svg.test.ts` (étendre s'il existe, sinon créer)

5 vecteurs :

```typescript
describe("sanitizeSignatureSvg (DOMPurify + linkedom)", () => {
  it("préserve un SVG SignaturePad valide", () => {
    const svg = '<svg viewBox="0 0 400 128" xmlns="http://www.w3.org/2000/svg"><path d="M5 30 L100 50" stroke="#1e3a8a" stroke-width="2" fill="none"/></svg>';
    const out = sanitizeSignatureSvg(svg);
    expect(out).toContain("<svg");
    expect(out).toContain("<path");
    expect(out).toContain('d="M5 30 L100 50"');
    expect(out).toContain('stroke="#1e3a8a"');
  });

  it("bypass data:image/png en data URL raster", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    expect(sanitizeSignatureSvg(dataUrl)).toBe(dataUrl);
  });

  it("strip <script> dans SVG", () => {
    const svg = '<svg><script>alert(1)</script><path d="M0 0"/></svg>';
    const out = sanitizeSignatureSvg(svg);
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  it("strip event handlers (onclick, onload)", () => {
    const svg = '<svg onload="alert(1)"><path d="M0 0" onclick="alert(2)"/></svg>';
    const out = sanitizeSignatureSvg(svg);
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
  });

  it("strip foreignObject et iframe", () => {
    const svg = '<svg><foreignObject><iframe src="evil"/></foreignObject><path d="M0 0"/></svg>';
    const out = sanitizeSignatureSvg(svg);
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("iframe");
  });
});
```

### Tests manuels post-deploy (Wissam)

Une fois la PR mergée et Netlify deployé :

1. **Admin direct sign** : ouvrir TabEmargements d'une formation, cliquer "Signer" pour un apprenant, dessiner, Valider → toast "Signature enregistrée pour X" + ligne passe à "Signé"
2. **QR code sign (1 créneau)** : générer QR pour 1 apprenant + 1 créneau → scanner → signer → page de succès
3. **QR code sign (session, multi-créneaux)** : générer QR session pour 1 apprenant → scanner → signer le 1er créneau → page propose le 2e créneau → signer le 2e → succès
4. **Lecture signatures admin** : retourner sur TabEmargements après signature QR → vérifier que les signatures apparaissent (RLS read)
5. **PDFs émargement** : générer `feuille_emargement` (individuelle) + `feuille_emargement_collectif` → vérifier que les signatures (image SVG) sont rendues correctement dans les PDFs
6. **Cas formateur** : générer QR pour le formateur → scanner → signer → vérifier dans TabEmargements ligne formateur passe à "Signé"

## Edge cases

- **isomorphic-dompurify utilisé ailleurs** : grep confirme que `sanitize-svg.ts` est le seul consommateur (5 call sites du helper, 0 import direct ailleurs). La suppression du package est safe.
- **DOMPurify ESM vs CJS** : `dompurify` (sans `isomorphic-`) supporte les deux. linkedom aussi. Compatible Next.js 14 App Router.
- **Signatures existantes en DB** : sanitizées par l'ancien isomorphic-dompurify. Le nouveau (DOMPurify + linkedom) doit produire le même comportement → rendu identique en lecture.
- **Cache PDF** : les PDFs émargement déjà en cache ne sont pas invalidés par ce fix. Si Loris veut voir les signatures dans des PDFs déjà cachés, soit purger le cache, soit régénérer (touch `sessions.updated_at`).
- **Migration SQL idempotente** : tous les `DROP IF EXISTS` + `CREATE POLICY` + `ADD COLUMN IF NOT EXISTS` sont safe à re-runner.

## Hors scope

- **Validation enrollment dans `/api/signatures` POST** : explicitement écarté (le client doit pouvoir signer pour n'importe quel apprenant de son entité sans contrainte d'enrollment).
- **Rôle `client` autorisé à signer via TabEmargements** : pas dans le scope MVP. Le client peut déjà signer via QR code public.
- **Refactor SignaturePad** : composant fonctionne, pas touché.
- **Audit fonctionnel des PDFs émargement** : la résolution du bug + test manuel suffit (étape 5 du test plan). Si anomalies découvertes au test, story séparée.
- **Tests E2E Playwright** sur le flow signature : nécessite infra Puppeteer + Supabase de test, hors scope MVP.

## Risques

- **Régression sur signatures existantes** : faible. DOMPurify est conservé identique, seul le DOM provider change. linkedom est testé et utilisé en production par Astro/Vite.
- **linkedom bug subtil** : si linkedom diffère de jsdom sur un cas SVG, comportement légèrement différent. Mitigation : tests Vitest couvrent les 5 vecteurs critiques.
- **Migration SQL casse une autre policy** : faible. Les `DROP POLICY IF EXISTS` ciblent des noms précis. Les autres policies (learner_*, trainer_read avant ré-écriture) ne sont pas touchées.
- **Memory project_rls_state.md mentionne ~50 tables avec allow_all** : si une policy `allow_all` existe sur `signatures` en plus des nouvelles, c'est OK (RLS permissif = OR). Pas de conflit.

## Definition of Done

- [ ] `src/lib/utils/sanitize-svg.ts` réécrit (DOMPurify + linkedom, comportement identique)
- [ ] `package.json` : `isomorphic-dompurify` retiré, `linkedom` ajouté
- [ ] `npm install` + `npm run build` OK localement
- [ ] Migration SQL `fix_emargement_signature_bug.sql` créée
- [ ] Migration exécutée manuellement en prod par Wissam (Supabase Dashboard)
- [ ] Route GET `/api/emargement` retourne `all_slots`
- [ ] 5 tests Vitest sanitize-svg passent
- [ ] Typecheck `npx tsc --noEmit` clean
- [ ] Suite Vitest existante (393 tests) continue à passer
- [ ] PR créée + mergée
- [ ] Test manuel Wissam : 6 cas du test plan validés post-deploy

## Définitions techniques de référence

- **Memoire `project_rls_state.md`** : "Helpers user_role() en `public` pas `auth`" — confirmé via query `pg_proc`
- **Diagnostic colonnes prod** : `signatures` a bien `time_slot_id`, `ip_address`, `user_agent`, `signature_method` (vérifié via `information_schema.columns`)
- **Diagnostic contraintes prod** : `unique_session_signer` absente, `signatures_signature_method_check` valide (handwritten/typed/click_to_sign)
- **Netlify Functions log** : `ERR_REQUIRE_ESM` confirmé, stack trace pointe vers `html-encoding-sniffer` → `@exodus/bytes`

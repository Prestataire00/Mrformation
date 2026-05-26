# Sous-chantier Émargement — Volets B+C + 2 obs résiduelles cross-tenant

> **Spec validée par Wissam le 2026-05-26.**
> Source : Deep-dive [docs/deep-dive-tab-emargements.md](../../deep-dive-tab-emargements.md) + Audit Volet A [docs/audits/2026-05-26-emargement-entity-id-audit.md](../../audits/2026-05-26-emargement-entity-id-audit.md).
> Pré-requis : Sous-chantier 1 Volet A Sécurité mergé en prod (commit `f0fb68e`).

---

## 1. Contexte

Le Sous-chantier 1 Volet A Sécurité Émargement (mergé `f0fb68e` le 2026-05-26) a fermé les 2 bugs P0 (RLS publique + canvas admin bulk) ainsi que 2 vulnérabilités HIDDEN cross-tenant trouvées par l'audit (`/api/emargement` POST + `/api/emargement/slots` POST). Score qualité passé de 6/10 → 7/10.

Ce **Sous-chantier 2** clôt les Volets B (type safety) + C (robustesse) du deep-dive + traite les 2 observations résiduelles cross-tenant identifiées dans l'audit Volet A mais reportées (info disclosure non-critique). Cible : **score 8/10** (parité TabConventionDocs post-solidification).

**Scope réel** : l'exploration a montré que le deep-dive avait sur-estimé les counts. La scope effective est **~5-6h** (vs 30h estimé initialement) car :
- 0 occurrence `(e: any)` dans TabEmargements/TabAbsences (déjà migrés)
- 0 `as unknown as` dans les 2 composants (deep-dive disait 13, faux)
- 2 catches "vides" mais intentionnels (`// continue` dans for-loops, design correct)
- Pas de polling 3s à fixer (deep-dive faux)

---

## 2. Goal

Clore les Volets B + C de TabEmargements + résoudre les 2 observations résiduelles cross-tenant pour atteindre le score qualité 8/10 sur le sous-système Émargement.

---

## 3. Périmètre

### 3.1 In-scope — 6 livrables

| # | Livrable | Volet | Fichier | Estimation |
|---|----------|-------|---------|-----------|
| 1 | Typer 2× `as unknown as` Supabase joins | B | `src/app/api/emargement/live-status/route.ts:67,83` | 30 min |
| 2 | Await 3× `onRefresh()` fire-and-forget | C | `src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx:88, 128, 149` | 15 min |
| 3 | Gate debug panel par NODE_ENV !== production | C | `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx:1096` | 30 min |
| 4 | Refuser 400 si admin sans bodySignerId + bodySignerType | C | `src/app/api/signatures/route.ts:75-117` | 1h |
| 5 | Ownership check `/api/emargement/post-session-eval` POST | Obs A.1 | `src/app/api/emargement/post-session-eval/route.ts` | 1h |
| 6 | Ownership check `/api/emargement/slots` GET | Obs A.2 | `src/app/api/emargement/slots/route.ts` (handler GET) | 1h |

**Total estimé** : ~5-6h (incluant tests, vérifications, commits).

### 3.2 Out-of-scope (reportés)

**Volets D / E / F (selon deep-dive)** :
- D : UX pilotage (vue d'ensemble signataires, relance non-signataires, PDF 1-clic) — ~18h
- E : Refacto architectural (découpage TabEmargements 1144 LOC en `sections/`, retrait `/admin/signatures` legacy 1279 LOC) — ~32h
- F : Tests Vitest service (load-signatures, save-signature) — ~14h

Ces volets ne sont pas planifiés à date — décision à prendre après ce sous-chantier 2.

---

## 4. Architecture par livrable

### 4.1 Livrable 1 — Typer `live-status/route.ts`

**État actuel** ([live-status/route.ts:67,83](../../../src/app/api/emargement/live-status/route.ts)) :

```ts
const learners: PersonStatus[] = ((enrollments ?? []) as unknown as Array<{
  learner: { id: string; first_name: string; last_name: string; email: string | null } | null
}>)
```

**Problème** : le double cast `as unknown as` court-circuite TypeScript. Si la query Supabase change (champ ajouté/renommé/typé différemment), aucune erreur de compile.

**Fix** : déclarer 2 interfaces locales nommées + utiliser le pattern Supabase `.returns<T>()` pour typer le retour de la query directement.

```ts
interface EnrollmentWithLearner {
  learner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}

interface FormationTrainerWithTrainer {
  trainer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}

const { data: enrollments } = await supabase
  .from("enrollments")
  .select(`learner:learners(id, first_name, last_name, email)`)
  // ... filters
  .returns<EnrollmentWithLearner[]>();

// Cast retiré :
const learners: PersonStatus[] = (enrollments ?? []).map(/* ... */);
```

Idem pour `formationTrainers` avec `FormationTrainerWithTrainer`.

### 4.2 Livrable 2 — Await `onRefresh()`

**État actuel** ([TabAbsences.tsx](../../../src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx)) :

- Ligne 88 (`handleAdd`) : `onRefresh();` ← fire-and-forget
- Ligne 128 (`handleAutoDetect`) : `onRefresh();` ← fire-and-forget
- Ligne 149 (`handleUpdateStatus`) : `onRefresh();` ← fire-and-forget
- Ligne 98 (`handleDelete`) : `await onRefresh();` ✅ déjà OK

**Fix** : ajouter `await` devant les 3 appels non-awaited. Uniformise avec le pattern de `handleDelete`.

**Justification** : sans `await`, la fonction handler peut se terminer (et fermer un dialog, par exemple) AVANT que le refresh ait fini. Race condition possible : l'UI affiche encore l'ancien état pendant un instant. Avec `await`, on garantit l'ordre.

### 4.3 Livrable 3 — Gate debug panel par NODE_ENV

**État actuel** ([TabEmargements.tsx:1096-1119](../../../src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx)) :

```tsx
{qrSlotTokens.debug && (
  <div className="...">
    <div>session_id : {qrSlotTokens.debug.session_id}</div>
    <div>profile.entity_id : {qrSlotTokens.debug.profile_entity_id}</div>
    <div>slots trouvés : {qrSlotTokens.debug.slots_count}</div>
    {/* ... */}
  </div>
)}
```

Le panneau expose en prod : `session_id`, `profile.entity_id`, comptes SQL, erreurs INSERT, traces d'itération. Utile en dev, inacceptable en prod.

**Fix** : ajouter la condition `process.env.NODE_ENV !== "production"` :

```tsx
{process.env.NODE_ENV !== "production" && qrSlotTokens.debug && (
  <div className="...">
    {/* ... bloc inchangé */}
  </div>
)}
```

**Avantage** : Next.js inline `process.env.NODE_ENV` au build. En prod, la condition devient `false && qrSlotTokens.debug` que le bundler élimine totalement (dead code elimination). Aucun risque d'exposition.

### 4.4 Livrable 4 — Refuser admin sans bodySignerId+bodySignerType

**État actuel** ([api/signatures/route.ts:75-117](../../../src/app/api/signatures/route.ts)) :

```ts
} else if (["admin", "super_admin"].includes(role)) {
  // Admin can sign on behalf — use signer_type from body
  signerType = bodySignerType || "learner";  // ← default silencieux
}
// ...
const effectiveSignerId = (["admin", "super_admin"].includes(role) && bodySignerId)
  ? bodySignerId
  : userId;  // ← fallback silencieux à admin's userId
```

**Problème** : un admin POST sans `bodySignerType` → defaults à `"learner"`. Sans `bodySignerId` → defaults à admin's `userId`. Résultat : ligne `signer_type=learner, signer_id=<admin_uuid>` incohérente (le learner avec cet ID n'existe pas, l'admin n'est pas un learner).

Le schéma contraint `signer_type IN ('learner', 'trainer')`, donc impossible d'avoir `signer_type='admin'`. Le fix doit imposer l'explicit côté caller.

**Fix** : refuser 400 si admin sans les 2 champs, valider bodySignerType :

```ts
} else if (["admin", "super_admin"].includes(role)) {
  // Admin signe pour quelqu'un d'autre : DOIT fournir bodySignerId + bodySignerType
  // explicitement (pas de fallback silencieux vers admin's userId/'learner' qui
  // créerait des signatures orphelines incohérentes).
  if (!bodySignerId || !bodySignerType) {
    return NextResponse.json(
      { error: "Pour signer en tant qu'administrateur, signer_id et signer_type sont obligatoires." },
      { status: 400 },
    );
  }
  if (bodySignerType !== "learner" && bodySignerType !== "trainer") {
    return NextResponse.json(
      { error: "signer_type doit être 'learner' ou 'trainer'." },
      { status: 400 },
    );
  }
  signerType = bodySignerType;
} else {
  return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
}
```

Puis `effectiveSignerId` devient inconditionnel :
```ts
const effectiveSignerId = ["admin", "super_admin"].includes(role) ? bodySignerId : userId;
```

**Compat client** : les 2 call-sites client (`handleAdminSign` + `handleBulkSign` dans TabEmargements) envoient déjà `bodySignerId` + `bodySignerType`. Zéro régression UI. La validation côté serveur durcit juste la contrainte.

### 4.5 Livrable 5 — Ownership check `/api/emargement/post-session-eval` POST

**État actuel** : la route accepte un `session_id` dans le body et envoie des emails post-session sans vérifier que la session appartient à l'entité de l'utilisateur. Un admin entité A pourrait potentiellement spam les apprenants d'une session entité B.

**Fix** : ajouter le même pattern que les fixes Volet A (commits `57c75bf`, `47e3457`, `24050f9`) :

```ts
import { resolveActiveEntityId } from "@/lib/crm/active-entity";

// Au début du handler POST, après auth, avant tout traitement :
const { data: sessionCheck, error: sessionCheckError } = await supabase
  .from("sessions")
  .select("entity_id")
  .eq("id", session_id)
  .single();

if (sessionCheckError || !sessionCheck) {
  return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
}

const activeEntityId = resolveActiveEntityId(auth.profile);
if (sessionCheck.entity_id !== activeEntityId) {
  return NextResponse.json(
    { error: "Accès non autorisé à cette session" },
    { status: 403 },
  );
}
```

### 4.6 Livrable 6 — Ownership check `/api/emargement/slots` GET

**État actuel** : le handler GET de cette route lit aujourd'hui les tokens + learner_ids d'une session via `createServiceClient()` (service_role bypass RLS) sans vérifier l'ownership de la session. Permet à un admin entité A de lire les données d'une session entité B (lecture seule).

**Fix** : appliquer **exactement** le même pattern que Livrable 5 au handler GET de `slots/route.ts`. Le handler POST a déjà reçu ce fix en Volet A (commit `47e3457`) ; il faut maintenant le faire sur GET.

---

## 5. Tests

### 5.1 Tests automatisés

**Aucun nouveau test Vitest requis**. Les modifications sont défensives (refus 400, ownership checks) ou structurelles (await, gate NODE_ENV) — pas de nouvelle logique métier complexe à couvrir.

**Tests existants doivent rester verts** : baseline post-Volet A = 539 passing (48 fichiers).

### 5.2 Smoke check manuel (~15 min)

Validation manuelle légère après merge prod :
- [ ] Admin sign-on-behalf marche encore (Sign on behalf Dialog d'une session)
- [ ] Admin bulk-sign marche encore (canvas 2 étapes Volet A pas régressé)
- [ ] Debug panel invisible en prod : `npm run build && npm run start` localement, ouvrir la modale QR codes → vérifier absence du bloc debug
- [ ] TabAbsences : add absence → la liste se rafraîchit, sans race condition visible
- [ ] curl `/api/signatures` POST en admin sans bodySignerId → renvoie 400 avec message clair

---

## 6. Critères d'acceptance

**Technique** :
- [ ] 0 occurrence `as unknown as` dans `src/app/api/emargement/live-status/route.ts`
- [ ] 3 `onRefresh()` awaited dans TabAbsences (handleAdd, handleAutoDetect, handleUpdateStatus)
- [ ] Debug panel TabEmargements gated par `process.env.NODE_ENV !== "production"`
- [ ] `/api/signatures` POST refuse 400 si admin sans bodySignerId + bodySignerType (valide aussi le type)
- [ ] `/api/emargement/post-session-eval` POST a un ownership check `resolveActiveEntityId`
- [ ] `/api/emargement/slots` GET a un ownership check `resolveActiveEntityId`
- [ ] Vitest : 539/539 ✓
- [ ] `npx tsc --noEmit` : clean ✓
- [ ] `npm run build` : success ✓

**Validation manuelle** : 5 checks ci-dessus (§ 5.2) tous verts avant merge prod.

---

## 7. Pattern d'exécution

**Branche** : `feat/emargement-volet-bc-securite` (depuis `main` à `f0fb68e`)

**Découpage suggéré** (~8-10 tâches bite-sized 2-5 min) :

1. **Task 0** — Baseline + branche + grep recap des items à fixer
2. **Task 1** — Livrable 1 : typer `live-status/route.ts` (2× `as unknown as` → interfaces + `.returns<T>()`)
3. **Task 2** — Livrable 2 : await 3× `onRefresh()` TabAbsences
4. **Task 3** — Livrable 3 : gate debug panel TabEmargements par NODE_ENV
5. **Task 4** — Livrable 4 : refuser 400 si admin sans bodySignerId/Type
6. **Task 5** — Livrable 5 : ownership check `/api/emargement/post-session-eval` POST
7. **Task 6** — Livrable 6 : ownership check `/api/emargement/slots` GET
8. **Task 7** — Vérification finale (Vitest + tsc + build)
9. **Task 8** — STOP smoke check léger Wissam (~15 min, checklist § 5.2)
10. **Task 9** — Après Go : finishing-a-development-branch (merge + push prod)

**Sécurité prod** :
- Pas de migration SQL
- Pas de changement UI critique (canvas Volet A préservé)
- Smoke check léger suffit (vs validation stricte Volet A)

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Le typing strict via `.returns<T>()` casse l'inférence Supabase sur certaines queries | Faible | Faible | `tsc --noEmit` capture immédiatement ; les interfaces sont locales (pas exportées) donc fail-loud |
| Le refus 400 sur admin sans bodySignerId casse un call-site inconnu non identifié | Faible | Moyen | Grep cross-codebase avant fix pour identifier tous les call-sites ; les 2 connus envoient déjà ces champs |
| Le gate NODE_ENV casse le panneau debug en dev/preview Netlify | Très faible | Faible | Netlify preview est en mode `production` build mais `NODE_ENV=production` — le panneau sera invisible en preview aussi. Acceptable (preview ≠ debug) |
| Ownership check casse les routes pour super_admin | Très faible | Élevé | Utilise `resolveActiveEntityId` (pattern CRM rodé) qui lit le cookie pour super_admin, identique aux fixes Volet A déjà mergés |
| Race condition entre `await onRefresh()` et un autre event utilisateur | Très faible | Faible | Pas de changement de logique, juste timing — uniforme avec `handleDelete` qui marche déjà |

---

## 9. Estimation finale

| Livrable | Estimation |
|----------|-----------|
| Livrable 1 (typing live-status) | 30 min |
| Livrable 2 (await onRefresh) | 15 min |
| Livrable 3 (gate debug NODE_ENV) | 30 min |
| Livrable 4 (refuser 400 admin) | 1h |
| Livrable 5 (ownership post-session-eval) | 1h |
| Livrable 6 (ownership slots GET) | 1h |
| Vérifications + smoke check + finishing | 1h |
| **Total Sous-chantier 2** | **~5-6h** |

---

## 10. Suite

Après merge prod du Sous-chantier 2 :

- **Score TabEmargements** : 7/10 → **8/10** (parité TabConventionDocs post-solidification, objectif atteint).
- **Volets D / E / F** (UX pilotage, refacto architectural, tests Vitest service) : décision ouverte. Soit traités en sous-chantiers ultérieurs si besoin, soit reportés sine die selon priorités produit.
- **Sous-système Émargement** : sécurité multi-tenant complète + dette technique réduite + cross-tenant info disclosure résolu. Solidification suffisante pour passage en mode "maintenance only" avec confiance.

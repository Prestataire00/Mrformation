---
name: create-doc-template
description: Use when creating a new PDF document template for the LMS platform (attestation, certificat, contrat, lettre, avis, bilan…). Builds template + 3 API endpoints (mock/single/batch) + UI section in test-convention page, following the resolver pattern with `[%Var%]` Sellsy aliases.
---

# Create PDF Document Template

When the user asks to create a new PDF document for the LMS platform — typically by sending a Sellsy spec text containing `[%Nom de l'apprenant%]` and similar variables.

## Architecture

The doc system has 5 layers :

1. **Templates HTML** — `src/lib/templates/{kebab-name}.ts` : export `X_HTML` + `X_FOOTER_TEMPLATE` constants with `[%Var%]` placeholders.
2. **Resolver** — `src/lib/utils/resolve-variables.ts` : the `ALIAS_TO_VARIABLE_KEY` map converts `[%Sellsy Label%]` → `{{tech_key}}` → resolved value via the function under that tech key.
3. **Service** — `src/lib/services/document-generation/` : `DocumentGenerationService.generate()` with cache (SHA-256 from `cacheInputs`) + Puppeteer/CloudConvert engines fallback.
4. **Endpoints** — 3 per doc :
   - `src/app/api/documents/generate-{name}-mock/route.ts` — instant PDF with fake data (Patrick ATTLAN + UNICIL)
   - `src/app/api/documents/generate-{name}/route.ts` — real data, body `{ sessionId, learnerId }` (or just `sessionId` if per-session)
   - `src/app/api/documents/generate-{name}-batch/route.ts` — body `{ sessionId }` → ZIP fail-soft with 1 PDF per learner
5. **UI** — `src/app/(dashboard)/admin/test-convention/page.tsx` : section per doc with state + useEffect + handlers + 3 cards (mock colored / single white / batch purple) + 2 result cards.

## Available Variables

All `[%Var%]` aliases are listed in `variables-catalog.md` in this skill directory (auto-synced from `ALIAS_TO_VARIABLE_KEY`).

If a new variable is needed (e.g. `[%Date de naissance de l'apprenant%]` for a new doc) :
1. Check if the tech key exists in `resolve-variables.ts` (search `"{{date_naissance`)
2. If yes : just add an alias line in `ALIAS_TO_VARIABLE_KEY`
3. If no : add the tech key resolver function (uses `data.learner`, `data.session`, etc.) AND the alias

## Steps

1. **Read the user's doc spec** — extract title, body text, `[%Var%]` references, sections, signatures
2. **Identify variables needed** — match against `variables-catalog.md`
3. **Add new aliases if needed** in `ALIAS_TO_VARIABLE_KEY` (and update `variables-catalog.md`)
4. **Clone an existing template** as starting point :
   - Per (session, learner) → clone `bilan-poe.ts` or `contrat-engagement-stagiaire.ts`
   - Per session only → clone `reponses-evaluations.ts`
   - Per (session, learner, client) → clone `certificat-travail-hauteur.ts`
   - Multi-page (header + 2nd page tableau) → clone `avis-habilitation-electrique-bt.ts`
5. **Create 3 endpoints** by cloning the matching existing endpoints :
   - Search/replace template constant name + import path + docType cache key
   - Update the mock data to be realistic for the new doc
6. **Add UI section** to `/admin/test-convention/page.tsx` :
   - State block (~10 lines)
   - `useEffect` for learner loading
   - 3 handlers (mock, single, batch)
   - JSX section at end : section header + 3 cards + 2 result cards
   - Choose a unique Tailwind color (not used by other sections) for the mock card
7. **Verify** : `npx tsc --noEmit` + `npx vitest run`
8. **Branch + commit + PR + merge** :
   - Branch : `feat/doc-{kebab-name}`
   - Commit title : `feat({kebab-name}): {short description}`
   - PR body : summary + files + test plan

## Conventions

- **Multi-tenant always** : every template MUST use `[%Nom de l'organisme%]`, `[%Cachet de l'organisme%]`, `[%Adresse de l'organisme%]` etc. so MR and C3V both work.
- **`[%Cachet de l'organisme%]` ≠ `[%Signature de l'organisme%]`** : Cachet = official stamp (`entity.stamp_url`), Signature = scribble. Always use Cachet.
- **Footer template** : always include SIRET + NDA + `<span class="pageNumber"></span>`.
- **Batch fail-soft** : use `Promise.allSettled` + JSZip with `_erreurs.txt` summary for failures.
- **Mock cache busting** : `session_updated_at: new Date().toISOString()` so mock always regenerates fresh.
- **Manual fill lines** : for fields like "Date de naissance" or "Date de signature" with no DB source, use `<span class="fill" style="min-width:120px;">…</span>` (dotted underline placeholder).
- **Strikethrough patterns** (Initial/Recyclage) : use `<s style="color:#9ca3af;">Recyclage</s>` for the inactive option, `<strong>Initiale</strong>` for the active.
- **Icons** : import from `lucide-react`. Existing : `Zap` (habilitation), `BookMarked` (POE), `HardHat` (BTP), `LogOut` (abandon/décharge), `ScrollText` (contrat), `BarChart3` (résultats).

## Sub-files in this skill

- `variables-catalog.md` — full list of `[%Var%]` aliases (regenerate after adding a new one)
- `endpoint-template.md` — the 3-endpoint pattern code template
- `ui-section-template.md` — the test-convention UI section template (state + handlers + JSX)

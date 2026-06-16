# RGPD Lot B — Signed-URL partagé + privatisation `formation-docs` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Servir tous les fichiers de documents via signed-URL (TTL court) après contrôle rôle+entité, puis privatiser le bucket `formation-docs`.

**Architecture:** **Code-first, puis ops** (ordre critique : un signed-URL fonctionne aussi sur un bucket public, donc on migre le code d'abord ; on privatise le bucket SEULEMENT une fois le code en prod, sinon les téléchargements `getPublicUrl` cassent immédiatement). Un endpoint partagé `/api/storage/signed-url` prend `{ table, id }` (jamais un path brut du client), recharge la ligne côté serveur, vérifie l'entité, et renvoie un signed-URL.

**Tech Stack:** Next.js route handlers, Supabase Storage (`createSignedUrl`), Postgres (migration bucket).

**Référence cadrage :** `bmad_output/planning-artifacts/2026-06-15-cadrage-confidentialite-fichiers-rgpd.md` (Lot B + D).

---

## État vérifié (ancrage)
- `TabDocsPartages.tsx` : upload `formation-docs` → stocke `file_url = getPublicUrl(...)` (URL publique complète, `:99,111`) ; download `href={doc.file_url}` (`:175`) ; delete via `split("/formation-docs/")` (`:134-136`).
- `admin/documents/page.tsx` : `handleDownload` → `window.open(doc.file_url)` (`:1046-1048`, generated_documents) ; download `client_documents` (`:1675-1680`).
- `formation-docs` bucket `public=true` (`create_formation_docs_bucket.sql:16`).
- Pattern signed-URL existant : `/api/trainer/documents/[id]/file-url`, `/api/trainers/[id]/cv/url` (charge la ligne, vérifie l'appartenance, `createSignedUrl`).

---

## File Structure
| Fichier | Rôle | Action |
|---------|------|--------|
| `src/lib/storage/extract-storage-path.ts` | Pur : extrait `(bucket, path)` d'un `file_url` (URL publique OU path interne) | Créer + test |
| `src/app/api/storage/signed-url/route.ts` | Endpoint partagé POST `{ table, id }` → signed-URL après check entité | Créer |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabDocsPartages.tsx` | upload stocke le **path** ; download via endpoint | Modifier |
| `src/app/(dashboard)/admin/documents/page.tsx` | downloads via endpoint | Modifier |
| `supabase/migrations/privatize_formation_docs_bucket.sql` | bucket privé (ops, APRÈS code) | Créer |

---

## Task 1 : Helper pur `extractStoragePath`

**Files:** Create `src/lib/storage/extract-storage-path.ts` + `src/lib/storage/__tests__/extract-storage-path.test.ts`

- [ ] **Step 1 : Test (RED)**

```typescript
import { describe, it, expect } from "vitest";
import { extractStoragePath } from "../extract-storage-path";

describe("extractStoragePath", () => {
  it("extrait bucket+path d'une URL publique Supabase", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/formation-docs/sess/abc.pdf?t=1";
    expect(extractStoragePath(url)).toEqual({ bucket: "formation-docs", path: "sess/abc.pdf" });
  });
  it("extrait d'une URL signée (object/sign)", () => {
    const url = "https://x.supabase.co/storage/v1/object/sign/invoices/a/b.pdf?token=z";
    expect(extractStoragePath(url)).toEqual({ bucket: "invoices", path: "a/b.pdf" });
  });
  it("traite un path interne nu comme (defaultBucket, path)", () => {
    expect(extractStoragePath("sess/abc.pdf", "formation-docs")).toEqual({ bucket: "formation-docs", path: "sess/abc.pdf" });
  });
  it("retourne null si vide", () => {
    expect(extractStoragePath(null)).toBeNull();
  });
});
```

- [ ] **Step 2 : Run → FAIL.** `npx vitest run src/lib/storage/__tests__/extract-storage-path.test.ts`

- [ ] **Step 3 : Implémentation (GREEN)**

```typescript
/**
 * Extrait { bucket, path } d'un `file_url` Supabase Storage, qu'il soit :
 * - une URL publique  (.../object/public/<bucket>/<path>?...)
 * - une URL signée    (.../object/sign/<bucket>/<path>?token=...)
 * - un path interne nu (<path>) — alors `defaultBucket` est requis.
 * Retourne null si l'entrée est vide.
 */
export function extractStoragePath(
  fileUrl: string | null | undefined,
  defaultBucket?: string,
): { bucket: string; path: string } | null {
  if (!fileUrl) return null;
  const m = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (m) return { bucket: m[1], path: m[2] };
  if (defaultBucket) return { bucket: defaultBucket, path: fileUrl.replace(/\?.*$/, "") };
  return null;
}
```

- [ ] **Step 4 : Run → PASS.**
- [ ] **Step 5 : Commit** `git add src/lib/storage && git commit -m "feat(rgpd): helper extractStoragePath (Lot B)"`

---

## Task 2 : Endpoint partagé `/api/storage/signed-url`

**Files:** Create `src/app/api/storage/signed-url/route.ts`

- [ ] **Step 1 : Implémentation**

POST `{ table: "formation_documents"|"generated_documents"|"client_documents", id: string }`. Charge la ligne, vérifie l'entité (directe ou via FK), extrait `(bucket, path)` via `extractStoragePath`, renvoie `createSignedUrl(path, 3600)`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { extractStoragePath } from "@/lib/storage/extract-storage-path";

const TABLES: Record<string, { fileCol: string; bucket: string }> = {
  formation_documents: { fileCol: "file_url", bucket: "formation-docs" },
  generated_documents: { fileCol: "file_url", bucket: "formation-docs" },
  client_documents: { fileCol: "file_url", bucket: "documents" },
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "commercial", "trainer"]);
  if (auth.error) return auth.error;
  try {
    const { table, id } = (await request.json()) as { table?: string; id?: string };
    const cfg = table ? TABLES[table] : undefined;
    if (!cfg || !id) return NextResponse.json({ error: "table/id invalides" }, { status: 400 });

    // Charge la ligne (RLS applique l'isolation ; on refait un check entité explicite).
    const { data: row } = await auth.supabase.from(table!).select(`${cfg.fileCol}, entity_id`).eq("id", id).maybeSingle();
    if (!row) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    const entityId = (row as { entity_id?: string | null }).entity_id;
    if (auth.profile.role !== "super_admin" && entityId && entityId !== auth.profile.entity_id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const loc = extractStoragePath((row as Record<string, string | null>)[cfg.fileCol], cfg.bucket);
    if (!loc) return NextResponse.json({ error: "Fichier absent" }, { status: 404 });

    const { data, error } = await auth.supabase.storage.from(loc.bucket).createSignedUrl(loc.path, 3600);
    if (error || !data?.signedUrl) return NextResponse.json({ error: "Lien indisponible" }, { status: 500 });
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "storage/signed-url") }, { status: 500 });
  }
}
```

> ⚠️ `client_documents`/`generated_documents` n'ont pas tous `entity_id` direct partout : `generated_documents.entity_id` existe depuis Lot A ; `client_documents` n'en a pas → le `select("entity_id")` y échouerait. **À adapter** : pour `client_documents`, résoudre l'entité via `client_id → clients.entity_id` (sous-requête) au lieu de `entity_id` direct. (Détail à finaliser à l'implémentation — voir Lot D.)

- [ ] **Step 2 : Ajouter `/api/storage` à `API_PERMISSIONS`** (`src/lib/auth/permissions.ts`) : `["/api/storage", ["super_admin","admin","commercial","trainer"]]`.

- [ ] **Step 3 : Commit.**

---

## Task 3 : Migrer les call-sites (download via endpoint)

**Files:** Modify `TabDocsPartages.tsx`, `admin/documents/page.tsx`

- [ ] **Step 1 : TabDocsPartages** — remplacer `href={doc.file_url}` par un `onClick` qui POST `/api/storage/signed-url` `{ table:"formation_documents", id: doc.id }` puis `window.open(url)`. (L'upload peut continuer à stocker `getPublicUrl` pour l'instant — le download passe par signed-URL, ce qui marche sur bucket public ET privé.)
- [ ] **Step 2 : admin/documents** — `handleDownload` et le download `client_documents` : même bascule vers l'endpoint signed-URL.
- [ ] **Step 3 : Vérif** `npm test` + `npm run build` ; smoke : un téléchargement passe par l'endpoint.
- [ ] **Step 4 : Commit.** (déployable : marche sur bucket encore public.)

---

## Task 4 : Privatiser `formation-docs` (ops, APRÈS Task 3 en prod)

**Files:** Create `supabase/migrations/privatize_formation_docs_bucket.sql`

- [ ] **Step 1 : Migration**

```sql
-- À jouer dans Supabase Dashboard APRÈS que le code Task 3 soit en prod.
UPDATE storage.buckets SET public = false WHERE id = 'formation-docs';
DROP POLICY IF EXISTS "formation-docs public read" ON storage.objects;
CREATE POLICY "formation-docs auth read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'formation-docs');
```

- [ ] **Step 2 :** Jouer dans Dashboard ; vérifier qu'un téléchargement (via signed-URL) fonctionne toujours et qu'une URL publique directe renvoie 400/403.
- [ ] **Step 3 : Commit du fichier de migration.**

---

## Self-review notes
- Ordre critique respecté : code (Tasks 1-3) AVANT privatisation (Task 4).
- L'endpoint prend `{table,id}` (jamais un path client) → pas de path traversal.
- `client_documents` (pas d'`entity_id` direct) : résolution via `clients.entity_id` à finaliser (Lot D recoupé).
- Helpers RLS migration : `formation-docs` policy = `authenticated` (lecture ouverte aux connectés ; affiner par entité possible en v2).

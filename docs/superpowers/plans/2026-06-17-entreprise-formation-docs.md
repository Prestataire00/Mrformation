# Documents de formation sur la fiche entreprise — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes en checkbox `- [ ]`. Branche : `feat/entreprise-formation-docs`. Commits ciblés (`git add <fichiers>`, jamais `-A`).

**Goal:** Afficher sur la fiche entreprise les documents générés pendant ses formations (conventions + attestations/certificats/etc. de ses apprenants), groupés par formation.

**Architecture:** Fonction pure de groupement (`src/lib/documents/group-formation-docs.ts`, TDD) + intégration dans `admin/clients/[id]/page.tsx` (requête `documents` scopée entité+entreprise, rendu groupé, fusion de la carte conventions existante).

**Tech Stack:** Next.js 14, TypeScript strict, Vitest, Supabase, shadcn/ui.

**Référence spec :** `docs/superpowers/specs/2026-06-17-entreprise-formation-docs-design.md`

---

## File Structure
| Fichier | Rôle | Action |
|---------|------|--------|
| `src/lib/documents/group-formation-docs.ts` | Fonction pure de groupement par session | Créer |
| `src/lib/documents/__tests__/group-formation-docs.test.ts` | Tests TDD | Créer |
| `src/app/(dashboard)/admin/clients/[id]/page.tsx` | Fetch docs + rendu section + fusion conventions | Modifier |

---

## Task 1 : Fonction pure de groupement (TDD)

**Files:** Create `src/lib/documents/group-formation-docs.ts`, Test `src/lib/documents/__tests__/group-formation-docs.test.ts`

- [ ] **Step 1 : Écrire le test**
```ts
import { describe, it, expect } from "vitest";
import { groupFormationDocsBySession, type RawFormationDoc, type SessionLite, type LearnerLite } from "../group-formation-docs";

const sessions: SessionLite[] = [
  { id: "s1", title: "Sécurité", start_date: "2026-03-01" },
  { id: "s2", title: "Management", start_date: "2026-05-01" },
];
const learners = new Map<string, LearnerLite>([
  ["l1", { id: "l1", first_name: "Marie", last_name: "Durand" }],
]);
const label = (t: string) => ({ convention_formation: "Convention", attestation_assiduite: "Attestation d'assiduité" }[t] ?? t);

describe("groupFormationDocsBySession", () => {
  it("groupe par session, libelle le type, résout le destinataire (entreprise/apprenant)", () => {
    const docs: RawFormationDoc[] = [
      { id: "d1", doc_type: "convention_formation", source_id: "s1", owner_type: "company", owner_id: "c1", file_url: "u1", status: "signed", created_at: "2026-03-02" },
      { id: "d2", doc_type: "attestation_assiduite", source_id: "s1", owner_type: "learner", owner_id: "l1", file_url: "u2", status: "generated", created_at: "2026-03-03" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g).toHaveLength(1);
    expect(g[0].session.id).toBe("s1");
    expect(g[0].docs[0]).toMatchObject({ typeLabel: "Convention", recipientLabel: "Entreprise" });
    expect(g[0].docs[1]).toMatchObject({ typeLabel: "Attestation d'assiduité", recipientLabel: "Marie Durand" });
  });

  it("apprenant inconnu → repli « Apprenant » ; type inconnu → doc_type brut", () => {
    const docs: RawFormationDoc[] = [
      { id: "d3", doc_type: "truc_inconnu", source_id: "s2", owner_type: "learner", owner_id: "lX", file_url: null, status: "generated", created_at: "2026-05-02" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g[0].docs[0]).toMatchObject({ typeLabel: "truc_inconnu", recipientLabel: "Apprenant", fileUrl: null });
  });

  it("doc dont la source n'est pas une session de l'entreprise est ignoré ; sessions triées par date desc", () => {
    const docs: RawFormationDoc[] = [
      { id: "d4", doc_type: "convention_formation", source_id: "s1", owner_type: "company", owner_id: "c1", file_url: "u", status: "sent", created_at: "2026-03-02" },
      { id: "d5", doc_type: "convention_formation", source_id: "s2", owner_type: "company", owner_id: "c1", file_url: "u", status: "sent", created_at: "2026-05-02" },
      { id: "d6", doc_type: "x", source_id: "AUTRE", owner_type: "company", owner_id: "c1", file_url: "u", status: "sent", created_at: "2026-01-01" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g.map((x) => x.session.id)).toEqual(["s2", "s1"]); // desc par start_date
    expect(g.flatMap((x) => x.docs.map((d) => d.id))).not.toContain("d6");
  });

  it("dans une session : conventions (entreprise) avant docs apprenants", () => {
    const docs: RawFormationDoc[] = [
      { id: "dL", doc_type: "attestation_assiduite", source_id: "s1", owner_type: "learner", owner_id: "l1", file_url: "u", status: "generated", created_at: "2026-03-05" },
      { id: "dC", doc_type: "convention_formation", source_id: "s1", owner_type: "company", owner_id: "c1", file_url: "u", status: "signed", created_at: "2026-03-01" },
    ];
    const g = groupFormationDocsBySession(docs, sessions, learners, label);
    expect(g[0].docs.map((d) => d.id)).toEqual(["dC", "dL"]);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** : `npx vitest run src/lib/documents/__tests__/group-formation-docs.test.ts` → FAIL (module manquant).

- [ ] **Step 3 : Implémenter `src/lib/documents/group-formation-docs.ts`**
```ts
export interface RawFormationDoc {
  id: string;
  doc_type: string;
  source_id: string;
  owner_type: string | null;
  owner_id: string | null;
  file_url: string | null;
  status: string;
  created_at: string;
}
export interface SessionLite { id: string; title: string; start_date: string; }
export interface LearnerLite { id: string; first_name: string; last_name: string; }
export interface GroupedDoc {
  id: string;
  typeLabel: string;
  recipientLabel: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;
}
export interface SessionDocGroup { session: SessionLite; docs: GroupedDoc[]; }

export function groupFormationDocsBySession(
  docs: RawFormationDoc[],
  sessions: SessionLite[],
  learnersById: Map<string, LearnerLite>,
  labelOf: (docType: string) => string,
): SessionDocGroup[] {
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const groups = new Map<string, GroupedDoc[]>();

  for (const d of docs) {
    if (!sessionsById.has(d.source_id)) continue; // hors périmètre entreprise
    let recipientLabel: string;
    if (d.owner_type === "company") {
      recipientLabel = "Entreprise";
    } else {
      const l = d.owner_id ? learnersById.get(d.owner_id) : undefined;
      recipientLabel = l ? `${l.first_name} ${l.last_name}`.trim() : "Apprenant";
    }
    const g = groups.get(d.source_id) ?? [];
    g.push({
      id: d.id,
      typeLabel: labelOf(d.doc_type),
      recipientLabel,
      status: d.status,
      fileUrl: d.file_url,
      createdAt: d.created_at,
    });
    groups.set(d.source_id, g);
  }

  // tri : entreprise avant apprenants, puis par date
  const rank = (gd: GroupedDoc) => (gd.recipientLabel === "Entreprise" ? 0 : 1);
  for (const list of groups.values()) {
    list.sort((a, b) => rank(a) - rank(b) || a.recipientLabel.localeCompare(b.recipientLabel) || a.createdAt.localeCompare(b.createdAt));
  }

  return Array.from(groups.entries())
    .map(([sid, d]) => ({ session: sessionsById.get(sid)!, docs: d }))
    .sort((a, b) => b.session.start_date.localeCompare(a.session.start_date)); // desc
}
```

- [ ] **Step 4 : Vérifier** : tests PASS (4/4) ; `npx tsc --noEmit` → 0 erreur.
- [ ] **Step 5 : Commit** : `git add src/lib/documents/group-formation-docs.ts src/lib/documents/__tests__/group-formation-docs.test.ts && git commit -m "feat(entreprise): helper de groupement des documents de formation (TDD)"`

---

## Task 2 : Intégration fiche entreprise

**Files:** Modify `src/app/(dashboard)/admin/clients/[id]/page.tsx`

- [ ] **Step 1 : Lire** la page pour repérer : l'état `learners` (type `Learner`), `sessions` (type `SessionHistory`), le `Promise.all` de chargement (≈ l.265-273), l'état/fetch `formationDocs`/`fetchFormationDocs` (≈ l.517-560) et son **rendu** (≈ l.1836-1844, carte « …documents générés depuis les fiches formation »), la variable `entityId`, `clientId`.

- [ ] **Step 2 : Imports** en tête :
```ts
import { groupFormationDocsBySession, type RawFormationDoc, type SessionDocGroup } from "@/lib/documents/group-formation-docs";
```

- [ ] **Step 3 : Libellés de type** — ajouter un petit résolveur (réutilise les libellés connus, repli sur le doc_type brut). Le placer dans le composant ou au-dessus :
```ts
const DOC_TYPE_LABELS: Record<string, string> = {
  convention_formation: "Convention de formation",
  convention: "Convention",
  attestation_assiduite: "Attestation d'assiduité",
  attestation_competences: "Attestation de compétences",
  certificat_realisation: "Certificat de réalisation",
  convocation: "Convocation",
  feuille_emargement: "Feuille d'émargement",
  programme_formation: "Programme de formation",
  reglement_interieur: "Règlement intérieur",
  cgv: "CGV",
};
const docTypeLabel = (t: string) => DOC_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
```

- [ ] **Step 4 : État + fetch** — ajouter `const [formationDocGroups, setFormationDocGroups] = useState<SessionDocGroup[]>([]);` (près de `formationDocs`). Et la fonction de chargement (2 requêtes fusionnées pour éviter un `.or` imbriqué fragile) :
```ts
const fetchFormationDocuments = useCallback(async () => {
  if (!entityId) return;
  const sessionIds = sessions.map((s) => s.id);
  const learnerIds = learners.map((l) => l.id);
  if (sessionIds.length === 0) { setFormationDocGroups([]); return; }

  const base = () => supabase
    .from("documents")
    .select("id, doc_type, source_id, owner_type, owner_id, file_url, status, created_at")
    .eq("entity_id", entityId)
    .eq("source_table", "sessions")
    .in("source_id", sessionIds);

  const [{ data: companyDocs }, { data: learnerDocs }] = await Promise.all([
    base().eq("owner_type", "company").eq("owner_id", clientId),
    learnerIds.length > 0
      ? base().eq("owner_type", "learner").in("owner_id", learnerIds)
      : Promise.resolve({ data: [] as RawFormationDoc[] }),
  ]);

  const all = [...(companyDocs ?? []), ...(learnerDocs ?? [])] as RawFormationDoc[];
  const learnersById = new Map(learners.map((l) => [l.id, l]));
  setFormationDocGroups(
    groupFormationDocsBySession(
      all,
      sessions.map((s) => ({ id: s.id, title: s.title, start_date: s.start_date })),
      learnersById,
      docTypeLabel,
    ),
  );
}, [supabase, entityId, clientId, sessions, learners]);
```
> ⚠️ `fetchFormationDocuments` dépend de `sessions` + `learners` déjà chargés. L'appeler **après** eux : ajouter un `useEffect(() => { void fetchFormationDocuments(); }, [fetchFormationDocuments])` (il se redéclenchera quand `sessions`/`learners` changent). Ne PAS l'ajouter dans le `Promise.all` initial (les sessions/learners n'y sont pas encore en state).

- [ ] **Step 5 : Rendu** — remplacer la carte `formationDocs` existante (≈ l.1836-1844) par la nouvelle section groupée :
```tsx
{formationDocGroups.length > 0 ? (
  <Card>
    <CardHeader>
      <CardTitle>Documents de formation</CardTitle>
      <CardDescription>
        {formationDocGroups.reduce((n, g) => n + g.docs.length, 0)} document(s) générés sur {formationDocGroups.length} formation(s)
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {formationDocGroups.map((g) => (
        <details key={g.session.id} className="rounded-lg border">
          <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {g.session.title} <span className="text-gray-400 font-normal">· {new Date(g.session.start_date).toLocaleDateString("fr-FR")} · {g.docs.length} doc(s)</span>
          </summary>
          <div className="border-t divide-y">
            {g.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{d.typeLabel} <span className="text-gray-400">— {d.recipientLabel}</span></span>
                <span className="text-xs text-gray-400 shrink-0">{new Date(d.createdAt).toLocaleDateString("fr-FR")}</span>
                {d.fileUrl ? (
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline shrink-0">Télécharger</a>
                ) : (
                  <span className="text-xs text-gray-300 shrink-0">—</span>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </CardContent>
  </Card>
) : null}
```

- [ ] **Step 6 : Fusion / nettoyage** — retirer l'ancien rendu de la carte `formationDocs` (celui remplacé), l'état `formationDocs`/`setFormationDocs`, la fonction `fetchFormationDocs`, et son appel dans le `Promise.all` (l.~272). (Les conventions entreprise apparaissent désormais dans la nouvelle section.) Vérifier qu'aucun import/variable ne devient orphelin.

- [ ] **Step 7 : Vérifier** : `npx tsc --noEmit` → 0 erreur. `npx vitest run` → vert.
- [ ] **Step 8 : Commit** : `git add "src/app/(dashboard)/admin/clients/[id]/page.tsx" && git commit -m "feat(entreprise): section Documents de formation (groupée par formation)"`

---

## Notes d'exécution
- **TDD** strict sur Task 1. Task 2 : tsc + suite verte.
- **Isolation** : `entity_id` + scope `source_id ∈ sessions de l'entreprise` et `owner_id ∈ {clientId} ∪ apprenants` — ne jamais retirer.
- **Téléchargement** : `file_url` direct (même affichage que les liens existants de la fiche). Si un bucket privé bloque l'accès, c'est un suivi séparé (RGPD signed-url) — hors périmètre.
- Effet visuel à confirmer après déploiement.

## Self-Review (fait)
- Couverture spec : requête company+learner scopée (Task2 §4) ✓ · groupé par formation (helper + rendu) ✓ · libellé type (docTypeLabel + helper) ✓ · destinataire entreprise/apprenant (helper) ✓ · fusion conventions (Task2 §6) ✓ · empty state (§5 rendu `? :`) ✓ · doc sans file_url (§5) ✓ · entity_id ✓ · TDD helper ✓.
- Placeholders : aucun (code réel ; ancrages de lignes + lecture préalable).
- Cohérence types : `RawFormationDoc`/`SessionDocGroup`/`SessionLite`/`LearnerLite` identiques entre Task 1 et Task 2.

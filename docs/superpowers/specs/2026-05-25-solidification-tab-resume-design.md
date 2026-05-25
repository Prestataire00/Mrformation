# Spec — Solidification du sous-onglet Résumé

> **Date** : 2026-05-25
> **Branche cible** : `feat/tab-resume-solidification` (depuis `main`)
> **Base de cadrage** : [docs/deep-dive-tab-resume.md](../../deep-dive-tab-resume.md)
> **Méthode** : brainstorming → spec → writing-plans → subagent-driven-development (workflow identique à Qualiopi)

---

## 1. Contexte et problème

Le deep-dive du 2026-05-25 a identifié sur l'onglet Résumé (TabResume, 1ᵉʳ tab de la fiche formation, le plus utilisé) :

- **3 bugs critiques** : (B1) `ResumeCompanies` fetche `contacts` sans filtre `entity_id` → fuite cross-tenant possible ; (B2) `ResumeDangerZone` cascade delete redondante et risquée — boucle DELETE sur 6 sub-tables avant DELETE session, alors que les FKs sont déjà `ON DELETE CASCADE` ; (B3) casts `as unknown as { individual_price?: number }` et `as unknown as { email?: string }` dans `ResumeLearners`/`ResumeCompanies` — types `Enrollment` et `Client` incomplets.
- **~10 bugs majeurs** : 5 UPDATE `sessions` sans `entity_id` filter, `onRefresh()` fire-and-forget dans 6+ handlers, 2 boutons stubs (Historique + Envoyer visio), `catch {}` vide swallow errors bulk send-welcome, toasts d'erreur génériques sans `error.message`, pas de validation URL visio, state local non re-sync au Annuler, `ResumeFinanciers` update sans `session_id` check, `getTrainerStats` inline.
- **Dette** : zéro test unitaire sur les composants, aucun formulaire en RHF + Zod, 3 patterns d'écriture coexistent.

L'onglet est fonctionnel à ~75 %. Cette spec décrit un chantier de solidification monobloc qui corrige les 3 critiques + les majeurs, construit la feature « Envoyer visio par email », retire le stub « Historique », extrait 2 services, et ajoute la couverture de tests.

## 2. Décisions de design (validées en brainstorming)

| Sujet | Choix |
|---|---|
| **Helpers de persistance session** | Tout dans `src/lib/services/sessions.ts` (existant) — ajout de `updateSessionField`, `duplicateSession`, `deleteSession`, `sendVisioLinkToLearners` |
| **« Envoyer visio par email »** | Construit : route API dédiée + email_queue async |
| **Contenu email visio** | Texte codé en dur avec variables résolues (pas de template configurable UI) |
| **« Historique »** | Retrait complet (bouton + import) |
| **Re-sync drafts au Cancel** | Pattern `useEffect` inline (pas de hook partagé) |
| **RHF + Zod** | **Hors scope** — dette explicite pour chantier ultérieur |
| **`useInlineEditor`** | **Hors scope** — pattern inline suffit |
| **Refactor des 5 gros sous-composants** | Patchs ciblés uniquement (entity_id, casts, onRefresh, session_id check) — pas de refacto structurel |

## 3. Architecture cible

```
src/lib/types/
  index.ts                                    ← MOD : Enrollment.individual_price + Client.email

src/lib/services/
  sessions.ts                                 ← MOD : + updateSessionField + duplicateSession + deleteSession + sendVisioLinkToLearners
  trainer-hours.ts                            ← NEW : getTrainerStats(formation, trainerId)
  __tests__/sessions.test.ts                  ← MOD : tests des 4 nouvelles fonctions
  __tests__/trainer-hours.test.ts             ← NEW : tests getTrainerStats

src/app/api/sessions/[id]/
  send-visio-link/route.ts                    ← NEW : POST authentifié, délègue au service

src/app/(dashboard)/admin/formations/[id]/_components/sections/
  ResumeActions.tsx                           ← MOD : duplicateSession via service + retrait Historique
  ResumeDangerZone.tsx                        ← MOD : 1 seul DELETE sessions (CASCADE BDD)
  ResumeDescription.tsx                       ← MOD : updateSessionField + useEffect cancel-reset + error.message + await
  ResumeLocation.tsx                          ← MOD : updateSessionField + useEffect cancel-reset + error.message + await
  ResumeManager.tsx                           ← MOD : updateSessionField + error.message + await
  ResumeVisioLink.tsx                         ← MOD : Zod URL validation + bouton « Envoyer » fonctionnel + confirm dialog
  ResumeCompanies.tsx                         ← MOD : entity_id sur fetch contacts + retrait casts
  ResumeLearners.tsx                          ← MOD : retrait casts + visibility bulk send + await
  ResumeFinanciers.tsx                        ← MOD : .eq("session_id", ...) sur update + await
  ResumeTrainers.tsx                          ← MOD : getTrainerStats via service + await
```

**Aucune migration SQL** : le chantier ne modifie pas le schéma BDD (pas de nouvelle colonne, pas de RPC).

## 4. Spécifications par volet

### Volet A — Sécurité & intégrité (résout B1, B2, B3)

#### A.1 — `ResumeCompanies` fetch contacts avec entity_id (B1)

[ResumeCompanies.tsx:65-68](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeCompanies.tsx#L65-L68) :
```ts
const { data: contactsData } = await supabase
  .from("contacts")
  .select("id, email, first_name, last_name, is_primary")
  .eq("client_id", clientId)
  .eq("entity_id", formation.entity_id);  // ← AJOUT
```

#### A.2 — `ResumeDangerZone` cascade simplifiée (B2)

Remplacer la boucle DELETE par un service `deleteSession`. Le composant devient :
```ts
const handleDelete = async () => {
  setDeleting(true);
  const result = await deleteSession(supabase, formation.id, formation.entity_id);
  setDeleting(false);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: "Formation supprimée" });
  router.push("/admin/sessions");
};
```

Le service `deleteSession` :
```ts
export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult> {
  // PostgreSQL gère le cleanup automatiquement selon les FKs :
  //   ON DELETE CASCADE → row supprimée :
  //     formation_trainers, formation_companies, formation_financiers,
  //     formation_comments, formation_time_slots, enrollments,
  //     qualiopi_snapshots, formation_invoices, formation_invoice_lines,
  //     formation_evaluation/satisfaction/elearning_assignments
  //   ON DELETE SET NULL → row conservée, session_id passé à NULL :
  //     signatures, documents, formation_documents, email_history,
  //     qualiopi_mock_audits, qualiopi_proof_checks, questionnaire_responses,
  //     generated_documents
  //
  // Le comportement SET NULL est intentionnel pour préserver l'historique
  // (réponses apprenants, logs emails, audits IA, signatures). Si on voulait
  // un cleanup total, il faudrait soit migrer les FKs en CASCADE (perte de
  // l'historique), soit faire un cleanup applicatif explicite. Hors scope ici.
  //
  // → Comportement identique au code actuel (qui ne supprime pas non plus ces
  // tables SET NULL).
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true };
}
```

#### A.3 — Types `Enrollment` et `Client` étendus (B3)

Dans `src/lib/types/index.ts`, à l'interface `Enrollment` :
```ts
  individual_price?: number | null;
```

À l'interface `Client` :
```ts
  email?: string | null;
```

(Ces champs existent en BDD — confirmés via les migrations `add_individual_pricing.sql` et le schema clients — mais étaient absents des types TS.)

**Audit transverse** : `grep -rn "as unknown as { individual_price\|as unknown as { email" src/` doit retourner 0 résultat. Les casts dans `ResumeLearners:277-284` + `ResumeCompanies:82-84, 117-118` deviennent obsolètes et sont retirés.

### Volet B — Persistance robuste (résout M1, M2, M7, M10)

#### B.1 — Service `updateSessionField`

Ajouté à `src/lib/services/sessions.ts` :
```ts
/**
 * UPDATE atomique d'un ou plusieurs champs d'une session.
 * Filtre par id ET entity_id (défense en profondeur). Renvoie ServiceResult
 * pour que le caller gère le toast avec error.message.
 */
export async function updateSessionField(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
  patch: Record<string, unknown>,
): Promise<ServiceResult> {
  const { error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true };
}
```

**Consumers** :
- `ResumeDescription.handleSave` → `updateSessionField(supabase, formation.id, formation.entity_id, { description })`
- `ResumeLocation.handleSave` → `updateSessionField(supabase, formation.id, formation.entity_id, { mode, location })`
- `ResumeManager.handleSave` → `updateSessionField(supabase, formation.id, formation.entity_id, { manager_id: selectedManager || null })`
- `ResumeVisioLink.handleSave` → `updateSessionField(supabase, formation.id, formation.entity_id, { visio_link: parsed.data || null })`
- `ResumeActions.handleStart` → `updateSessionField(supabase, formation.id, formation.entity_id, { status: "in_progress" })`

Pattern de gestion d'erreur **uniformisé** :
```ts
const result = await updateSessionField(supabase, formation.id, formation.entity_id, { description });
if (!result.ok) {
  toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
  return;
}
toast({ title: "Description mise à jour" });
setEditing(false);
await onRefresh();
```

#### B.2 — Service `duplicateSession`

```ts
export async function duplicateSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ newId: string }>> {
  const { data: src, error: readErr } = await supabase
    .from("sessions")
    .select("training_id, entity_id, title, start_date, end_date, location, mode, max_participants, notes, type, domain, description, total_price, planned_hours, program_id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (readErr || !src) {
    return { ok: false, error: { message: readErr?.message ?? "Session introuvable" } };
  }
  const { data, error } = await supabase
    .from("sessions")
    .insert({ ...src, title: `${src.title} (copie)`, status: "upcoming" })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Échec duplication" } };
  }
  return { ok: true, newId: data.id };
}
```

`ResumeActions.handleDuplicate` devient un thin wrapper qui toast + redirige `router.push("/admin/formations/" + result.newId)`.

#### B.3 — M10 : `ResumeFinanciers` update avec session_id check

Dans tous les `updateStatus(...)` du composant (lignes ~147-149) :
```ts
const { error } = await supabase
  .from("formation_financiers")
  .update({ status, updated_at: new Date().toISOString(), ...extra })
  .eq("id", id)
  .eq("session_id", formation.id);  // ← AJOUT (défense en profondeur, cohérent avec le delete)
```

#### B.4 — Audit transverse `onRefresh`

Cible : `grep -n "onRefresh()" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/` retourne 0 résultat (tous précédés de `await`).

Fichiers concernés (estimation depuis le deep-dive) :
- `ResumeDescription:35`
- `ResumeManager:48`
- `ResumeLocation:53`
- `ResumeTrainers:103`
- `ResumeLearners:131, 179, 329`
- `ResumeCompanies` (idem M2)

### Volet C — Validation & UX (résout M5, M8, M9)

#### C.1 — Zod URL visio (M8)

Dans `ResumeVisioLink.handleSave` :
```ts
import { z } from "zod";

const VisioUrlSchema = z.union([
  z.literal(""),
  z.string().url({ message: "URL invalide (https://meet.google.com/... ou https://zoom.us/...)" }),
]);

const handleSave = async () => {
  const parsed = VisioUrlSchema.safeParse(visioLink);
  if (!parsed.success) {
    toast({
      title: "URL invalide",
      description: parsed.error.errors[0]?.message,
      variant: "destructive",
    });
    return;
  }
  setSaving(true);
  const result = await updateSessionField(
    supabase, formation.id, formation.entity_id,
    { visio_link: parsed.data || null },
  );
  setSaving(false);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: "Lien de visio mis à jour" });
  await onRefresh();
};
```

#### C.2 — Re-sync drafts au Cancel (M9)

Dans `ResumeDescription` :
```ts
useEffect(() => {
  if (!editing) setDescription(formation.description || "");
}, [formation.description, editing]);
```

Dans `ResumeLocation` :
```ts
useEffect(() => {
  if (!editing) {
    setMode(formation.mode);
    setLocation(formation.location || "");
  }
}, [formation.mode, formation.location, editing]);
```

Effet : si `editing === false`, le state local est re-synchronisé depuis la prop à chaque update du prop (annulation OU sauvegarde réussie). Tant que `editing === true`, le draft est préservé (l'utilisateur tape sans être interrompu).

#### C.3 — Visibility bulk send-welcome (M5)

Dans `ResumeLearners`, remplacer le `} catch { /* skip */ }` par un compteur :
```ts
const handleSendAccessToAll = async () => {
  setSending(true);
  let succeeded = 0;
  let failed = 0;
  for (const learner of learnersWithEmail) {
    try {
      const res = await fetch(`/api/learners/${learner.id}/send-welcome`, { method: "POST" });
      if (res.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  setSending(false);
  toast({
    title: `${succeeded} email(s) envoyé(s)`,
    description: failed > 0 ? `${failed} échec(s) — vérifiez les logs` : undefined,
    variant: failed > 0 ? "destructive" : "default",
  });
};
```

### Volet D — Stubs (résout M3 retrait + M4 construction)

#### D.1 — Retrait bouton « Historique » (M3)

Dans `ResumeActions.tsx` :
- Supprimer le bloc `<Button>...</Button>` lignes ~97-99
- Supprimer l'import `History` de la ligne `import { Copy, Play, History, Loader2 } from "lucide-react";` (devient `import { Copy, Play, Loader2 } from "lucide-react";`)

#### D.2 — Construction « Envoyer visio par email » (M4)

##### Service `sendVisioLinkToLearners` dans `src/lib/services/sessions.ts`

```ts
import { enqueueEmail } from "@/lib/services/email-queue";

export async function sendVisioLinkToLearners(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ enqueued: number; skipped: number }>> {
  // 1. Charger la session (avec check entity_id + visio_link non vide)
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("id, title, start_date, end_date, location, visio_link, entity_id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (sessErr || !session) {
    return { ok: false, error: { message: sessErr?.message ?? "Session introuvable" } };
  }
  if (!session.visio_link) {
    return { ok: false, error: { message: "Aucun lien visio configuré pour cette formation" } };
  }

  // 2. Charger les learners inscrits (status registered/confirmed) avec email
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
    .eq("session_id", sessionId)
    .in("status", ["registered", "confirmed"]);

  let enqueued = 0;
  let skipped = 0;
  for (const e of enrollments ?? []) {
    const l = e.learner as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
    if (!l?.email) {
      skipped++;
      continue;
    }
    const subject = `Lien visio — ${session.title}`;
    const body = `Bonjour ${l.first_name},

Voici le lien pour rejoindre la formation "${session.title}" en visio :

${session.visio_link}

Dates : du ${session.start_date} au ${session.end_date}${session.location ? `
Lieu : ${session.location}` : ""}

À bientôt,
L'équipe de formation`;

    try {
      await enqueueEmail(supabase, {
        to: l.email,
        subject,
        body,
        entity_id: entityId,
        session_id: sessionId,
        recipient_type: "learner",
        recipient_id: l.id,
      });
      enqueued++;
    } catch {
      skipped++;
    }
  }

  return { ok: true, enqueued, skipped };
}
```

##### Route API `src/app/api/sessions/[id]/send-visio-link/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sendVisioLinkToLearners } from "@/lib/services/sessions";

const Params = z.object({ id: z.string().uuid() });

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["admin", "super_admin", "trainer"]);
  if (auth.error) return auth.error;

  const parsed = Params.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "session_id invalide" }, { status: 400 });
  }

  const result = await sendVisioLinkToLearners(
    auth.supabase,
    parsed.data.id,
    auth.profile.entity_id,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    enqueued: result.enqueued,
    skipped: result.skipped,
  });
}
```

##### UI dans `ResumeVisioLink.tsx`

Ajouter un dialog de confirmation + handler :
```tsx
const [confirmSend, setConfirmSend] = useState(false);
const [sending, setSending] = useState(false);

const handleSendVisio = async () => {
  setSending(true);
  try {
    const res = await fetch(`/api/sessions/${formation.id}/send-visio-link`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur");
    toast({
      title: `${data.enqueued} email(s) en file`,
      description: data.skipped > 0
        ? `${data.skipped} apprenant(s) sans email ignoré(s)`
        : undefined,
    });
    setConfirmSend(false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setSending(false);
  }
};
```

Le bouton « Envoyer » (déjà présent, lignes ~57-63) ouvre `setConfirmSend(true)` au lieu du toast "Fonctionnalité à venir". Un dialog confirme et appelle `handleSendVisio`.

### Volet E — Refactor (résout M11)

#### E.1 — Extraction `getTrainerStats` dans `src/lib/services/trainer-hours.ts`

```ts
import type { Session, FormationTrainer, Signature, FormationTimeSlot } from "@/lib/types";

export interface TrainerHoursStats {
  trainer_id: string;
  hours_planned: number;
  hours_done: number;
  signed_slots: number;
  total_slots: number;
}

/**
 * Calcule les heures réalisées d'un trainer en réconciliant les signatures
 * d'émargement avec les time slots de la formation. Pure — peut être testé
 * unitairement avec des fixtures.
 */
export function getTrainerStats(
  formation: Pick<Session, "formation_trainers" | "formation_time_slots" | "signatures">,
  trainerId: string,
): TrainerHoursStats {
  const slots = (formation.formation_time_slots ?? []) as FormationTimeSlot[];
  const trainerAssignment = (formation.formation_trainers ?? [])
    .find(t => t.trainer_id === trainerId);

  if (!trainerAssignment) {
    return { trainer_id: trainerId, hours_planned: 0, hours_done: 0, signed_slots: 0, total_slots: 0 };
  }

  // Heures planifiées : depuis l'assignment ou somme des durées des slots assignés
  const hours_planned = trainerAssignment.hours_planned ?? 0;

  // Heures réalisées : somme des durées des slots où le trainer a signé
  const trainerSignatures = ((formation.signatures ?? []) as Signature[])
    .filter(s => s.signer_id === trainerId && s.signer_type === "trainer");

  const signedSlotIds = new Set(
    trainerSignatures.map(s => s.time_slot_id).filter((id): id is string => Boolean(id)),
  );

  const hours_done = slots
    .filter(s => signedSlotIds.has(s.id))
    .reduce((sum, s) => sum + (s.duration_hours ?? 0), 0);

  return {
    trainer_id: trainerId,
    hours_planned,
    hours_done,
    signed_slots: signedSlotIds.size,
    total_slots: slots.length,
  };
}
```

`ResumeTrainers.tsx` importe et remplace son `getTrainerStats` inline (lignes ~46-68).

**Note** : la logique exacte (champs `duration_hours`, `hours_planned`, etc.) peut nécessiter ajustement à l'implémentation selon le shape réel des relations. Le service doit reproduire fidèlement le comportement actuel du composant (regression-free).

### Volet F — Tests

#### F.1 — `src/lib/services/__tests__/sessions.test.ts` (extension)

Ajouter (le fichier existe déjà avec d'autres tests) :
- `updateSessionField` filtre par id + entity_id (mock Supabase observe les `.eq` calls)
- `updateSessionField` retourne `{ ok: false, error: { message } }` sur erreur Supabase
- `updateSessionField` retourne `{ ok: true }` sur succès
- `duplicateSession` copie les 14 champs + suffixe `(copie)` + status `upcoming`
- `duplicateSession` retourne erreur si session pas dans l'entité
- `deleteSession` exécute un seul DELETE avec entity_id
- `sendVisioLinkToLearners` : visio_link vide → `{ ok: false }`
- `sendVisioLinkToLearners` : learner sans email → `skipped++`
- `sendVisioLinkToLearners` : tout OK → `enqueued = N`

#### F.2 — `src/lib/services/__tests__/trainer-hours.test.ts` (nouveau)

- Aucune signature → `hours_done = 0`
- Signatures partielles → ratio correct
- Signatures complètes → `hours_done = hours_planned` (approx)
- Trainer non assigné → tout à 0

Cible : 461 → ≥ 475 tests.

## 5. Acceptance criteria

- [ ] `grep -rn "as unknown as { individual_price\|as unknown as { email" src/` retourne 0
- [ ] `grep -rn "from(\"contacts\")" src/` : tous les hits ont `.eq("entity_id", ...)` adjacent
- [ ] `ResumeDangerZone.tsx` ne contient plus de boucle `for (const table of tables)` ni `delete().eq("session_id", ...)` sur les sub-tables (uniquement un appel `deleteSession`)
- [ ] `ResumeActions.tsx` n'a plus le bouton « Historique » (audit : `grep -n "Historique" src/app/.../sections/ResumeActions.tsx` → 0)
- [ ] `ResumeVisioLink.tsx` a un bouton « Envoyer » fonctionnel (plus de "Fonctionnalité à venir")
- [ ] Route POST `/api/sessions/[id]/send-visio-link/route.ts` existe avec validation Zod + requireRole
- [ ] `updateSessionField`, `duplicateSession`, `deleteSession`, `sendVisioLinkToLearners` exportés depuis `src/lib/services/sessions.ts`
- [ ] `getTrainerStats` exporté depuis `src/lib/services/trainer-hours.ts` (plus inline dans le composant)
- [ ] Interfaces `Enrollment` et `Client` ont respectivement `individual_price?` et `email?`
- [ ] `grep -nE "[^a-zA-Z]onRefresh\(\)$" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/*.tsx` retourne 0 (tous précédés de `await`)
- [ ] `grep -n "toast({ title: \"Erreur\", variant: \"destructive\" })" src/app/.../sections/` retourne 0 (tous avec `description: ...`)
- [ ] Tests : ≥ 475 verts, TypeScript clean
- [ ] Build Next.js réussi (`npm run build`)

## 6. Hors scope (explicite)

- RHF + Zod sur les 12 sous-composants — chantier dédié ultérieur
- Hook partagé `useInlineEditor` — YAGNI, pattern inline suffit
- Refactor structurel des 5 gros sous-composants (Trainers/Learners/Companies/Financiers/PriceHours) — patchs ciblés uniquement
- Audit log "Historique" — bouton retiré, feature non construite
- Template email visio configurable par l'admin — texte codé en dur
- Sélection des destinataires de l'envoi visio — envoi à tous les learners inscrits (status registered/confirmed)
- i18n des emails
- Notifications push post-envoi

## 7. Plan d'exécution attendu (à formaliser par writing-plans)

Découpage suggéré (à confirmer par writing-plans) :

1. **Types `Session/Enrollment/Client` étendus** + audit transverse retrait des casts `as unknown as`
2. **Services `sessions.ts` étendu** (updateSessionField + duplicateSession + deleteSession) + tests
3. **Service `trainer-hours.ts`** + tests
4. **Service `sendVisioLinkToLearners`** dans sessions.ts + tests (sans la route encore)
5. **Route API `/api/sessions/[id]/send-visio-link`** + e2e protection auth
6. **Refactor `ResumeDangerZone`** (1 DELETE, plus la boucle)
7. **Refactor `ResumeCompanies`** (entity_id contacts + retrait casts)
8. **Refactor `ResumeLearners`** (retrait casts + visibility bulk send + await onRefresh)
9. **Refactor `ResumeDescription/Location/Manager/VisioLink`** (updateSessionField + useEffect cancel-reset + error.message + await)
10. **Refactor `ResumeActions`** (duplicateSession via service + retrait Historique)
11. **Refactor `ResumeFinanciers`** (.eq session_id + await)
12. **Refactor `ResumeTrainers`** (getTrainerStats via service + await)
13. **`ResumeVisioLink` bouton « Envoyer » fonctionnel** (UI + confirm dialog + fetch route)
14. **Vérification finale** : tous les acceptance criteria + tests verts + tsc clean + build OK

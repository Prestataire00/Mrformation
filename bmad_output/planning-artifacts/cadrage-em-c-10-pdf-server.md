# Cadrage em-c-10 — Génération PDF serveur facture + devis

**Auteur :** Mary (Business Analyst, BMad)
**Date :** 2026-05-28
**Statut :** Cadrage compact v1.0 (✅ validé le 2026-05-28 par Wissam)
**Source story :** em-c-9 a scaffold-é la chaîne (descriptor → resolver) mais resolveFacture/resolveDevis retournent null + log warn. em-c-10 implémente la génération PDF effective.
**Périmètre :** 1 story (~4h), pas un module entier — d'où ce cadrage compact (~120 lignes vs 400 pour les cadrages modulaires).

> **Décisions validées le 2026-05-28** :
> 1. **Approche PDF : Puppeteer + 2 nouveaux templates HTML** (facture.html, devis.html) servis par le moteur PDF existant (`generatePdfFromFragment`). Pas de réutilisation des modules jsPDF côté client. Plus propre pour le futur.
> 2. **Refactor `crm/quotes/process-reminders` → `enqueueEmail`** (envoi async via worker ~5min max delay). Cohérent avec invoices/process-reminders.
> 3. **Fallback texte signature devis** : si la SVG signature ne peut pas être rendue en image côté serveur, fallback texte (nom + date + IP). Acceptable pour les relances pré-signature.
> 4. **Defaults safe** : champs entity manquants (siret, nda, logo) → chaines vides ou no-op au lieu de crash. PDF généré dans tous les cas.

---

## 0. Résumé exécutif

Loris a remonté que cocher "Facture" / "Devis" dans un template email ne joint pas le PDF. La chaîne est branchée (em-c-7/8/9) mais la **génération PDF côté serveur n'existe pas encore**. Cette story comble ce dernier maillon via 2 templates HTML rendus par Puppeteer (pattern déjà utilisé pour les 30 autres doc_types). Cleanup au passage : la route `crm/quotes/process-reminders` qui envoie en Resend direct est migrée vers `enqueueEmail` pour homogénéiser avec invoices.

**Effort estimé** : ~4h dev + 30 min test prod.

---

## 1. État actuel (post 24 PRs Epic A+B+C+D+F + em-c-7/8/9)

### Ce qui marche
- UI `/admin/emails` : Loris coche "Facture" / "Devis" dans la section "Documents système" du dialog d'édition template (em-c-7)
- `buildAttachmentsForRecipient` route 30 doc_types vers `EmailAttachmentDescriptor` (em-c-8)
- `invoices/process-reminders` push descriptor `{ type: "facture", payload: { invoice_id } }` dans `enqueueEmail` si template a "facture" dans `attachment_doc_types` (em-c-9)
- Worker `process-scheduled` appelle `resolveAttachments` qui dispatch vers `resolveFacture`/`resolveDevis` (em-c-9)
- Tests Vitest baseline 795 verts, build Next.js ✓

### Ce qui manque (= scope em-c-10)
- `resolveFacture(supabase, invoice_id)` retourne null + log warn `email_attachment_facture_pending_implementation`
- `resolveDevis(supabase, quote_id)` retourne null + log warn `email_attachment_devis_pending_implementation`
- `crm/quotes/process-reminders` envoie via Resend direct (pas d'attachments support) — pas branché sur la queue

### Résultat utilisateur actuel
Loris coche "Facture" sur template Relance facture → cron tourne → mail part **sans la PJ** + log warn Netlify. Bug visible business (relance facture sans la facture jointe ≠ relance utile).

---

## 2. Architecture cible

```
┌──────────────────────────────────────────────────────────────┐
│  Loris coche "Facture" dans template em-c-7 UI               │
└──────────────────────────────┬───────────────────────────────┘
                               │ stocké dans attachment_doc_types
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Cron invoices/process-reminders (em-b-1 + em-c-9)           │
│     enqueueEmail({                                           │
│       attachments: [                                         │
│         { type: "facture", payload: { invoice_id } }         │
│       ]                                                      │
│     })                                                       │
└──────────────────────────────┬───────────────────────────────┘
                               │ store in email_history.attachments
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Worker /api/emails/process-scheduled                        │
│     → resolveAttachments(supabase, descriptors)              │
│        → resolveOne → desc.type === "facture"                │
│           → resolveFacture(supabase, invoice_id)             │
└──────────────────────────────┬───────────────────────────────┘
                               │ 🆕 em-c-10
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  resolveFacture (NEW)                                        │
│  1. Load invoice + lines + entity + session depuis Supabase  │
│  2. Build vars { reference, montant, lignes_html, ... }      │
│  3. Render HTML via fact_template.html (NEW)                 │
│  4. generatePdfFromFragment(html, "Facture") via Puppeteer   │
│  5. Return { filename, content: Buffer }                     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
                          Resend.send(attachments)
```

Idem pour `resolveDevis` avec `devis_template.html`.

**Templates HTML facture/devis** : créés en `src/lib/templates/static/facture.html` et `devis.html` (pattern existant pour les 30 autres doc_types). Variables Mustache `{{xxx}}` résolues côté serveur avant Puppeteer.

---

## 3. Stories d'implémentation séquencées

| # | Story | Effort | Bloque |
|---|-------|--------|--------|
| **em-c-10.1** | Template HTML `facture.html` + variables Mustache + style print | 1h | em-c-10.2 |
| **em-c-10.2** | Implémenter `resolveFacture` : load invoice + lines + entity + render HTML + Puppeteer | 1h | smoke test |
| **em-c-10.3** | Template HTML `devis.html` (similaire facture) | 0.75h | em-c-10.4 |
| **em-c-10.4** | Implémenter `resolveDevis` | 0.75h | em-c-10.5 |
| **em-c-10.5** | Refactor `crm/quotes/process-reminders` : passage à `enqueueEmail` + push descriptor `{ type: "devis", payload: { quote_id } }` | 0.5h | smoke test |
| **em-c-10.6** | Tests Vitest + grep guardrails | 0.5h | merge |
| **TOTAL** | | **~4.5h** | |

**Stratégie séquencement** : 10.1 + 10.2 d'abord (facture, le cas le plus business-critical). Puis 10.3 + 10.4 (devis). Puis 10.5 (refactor). Puis 10.6 (tests). Permet smoke test prod intermédiaire après facture si Wissam veut valider tôt.

---

## 4. Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Template HTML facture pixel-different du jsPDF actuel (TabFinances preview) | Élevée | Moyen | **Acceptable** : Loris voit version A en download direct (jsPDF client), version B en email (Puppeteer serveur). Documenté dans le commit + docs/emails.md. Future story em-c-12 pourra unifier. |
| Lignes facture complexes (TVA, remises, lots) mal rendues en HTML | Moyen | Élevé (compta) | Tester avec 3 cas réels (facture simple, facture multi-lignes, avoir) en staging avant merge. Build helper `formatInvoiceLineRow()` réutilisable. |
| Logo / signature entité manquante en DB pour C3V | Faible | Faible | Defaults safe (chaine vide → no-op dans HTML). PDF basique sans logo mais pas crash. |
| Refactor crm/quotes envoi async casse une feature existante | Faible | Moyen | Tester en staging : envoyer une relance devis manuelle, vérifier que le mail arrive ≤5 min. Le worker traite toutes les 5 min via cron Netlify. |
| Puppeteer Railway sidecar timeout sur PDF facture lourd | Faible | Faible | NFR-DOC-2 du module documents dit < 5s pour 4 pages. Facture 1-2 pages → safe. |

---

## 5. Critères d'acceptance (DoD em-c-10)

1. ✅ Loris coche "Facture" sur template "Relance facture 1er rappel" → save → cron next run → email reçu avec PJ `facture-XXX-2026.pdf` (Puppeteer-generated)
2. ✅ Idem pour "Devis" sur template "Suivi proposition 1ère relance"
3. ✅ Logs Netlify : event `email_attachment_facture_generated` (succès) avec `latency_ms` < 5s. Plus de `_pending_implementation`.
4. ✅ `npm run build` ✓ Compiled, `tsc --noEmit` clean
5. ✅ `npx vitest run` baseline 795 → 810+ (≥15 nouveaux tests)
6. ✅ Smoke test prod : Wissam envoie une relance manuelle test, ouvre le PDF reçu, vérifie qu'il contient :
   - Référence facture/devis, montant, échéance
   - Logo entité (si défini)
   - Lignes factures avec TVA
   - Notes / mention si présentes
   - Footer entité (siret, nda, mentions légales)
7. ✅ `crm/quotes/process-reminders` utilise `enqueueEmail` (plus de `resend.emails.send` direct)
8. ✅ `docs/emails.md` § 10 mis à jour : retirer em-c-10 de "Hors scope V1"

---

## 6. Décisions reportées (em-c-11+)

- **Unifier preview client et email serveur** : aujourd'hui TabFinances utilise jsPDF côté client pour download/preview, em-c-10 utilise Puppeteer serveur pour email. 2 versions visuelles. Story em-c-12 future : migrer TabFinances vers même endpoint serveur, 1 source de vérité PDF.
- **6 doc_types non attachables** (attestation_assiduite, cgv, etc. — cf docs/emails.md §10) : restent skip silencieux. Cleanup futur soit retrait UI soit extension union EmailAttachmentDescriptor.
- **Tests E2E Playwright** (em-f-4 différé) : smoke check manuel Wissam suffit pour V1.

---

## 7. Prochaines étapes

1. ✅ **Validation cadrage** par Wissam (date 2026-05-28)
2. **Architecture rapide** via Winston (`bmad-agent-architect`) si Wissam veut formaliser le template HTML schema et le builder Supabase serveur — OU **passage direct à l'implémentation** car le scope est petit et bien défini.
3. **Implémentation** des 6 sous-stories séquencées (em-c-10.1 → 10.6), commit par commit.
4. **Smoke test prod** : Wissam déclenche manuellement une relance, vérifie PDF reçu en pièce jointe.
5. **Mise à jour docs/emails.md** : retirer em-c-10 de Hors scope, marquer "résolu 2026-XX-XX".

> **Question ouverte non bloquante** : faut-il un toggle env var (`USE_PUPPETEER_PDF_FACTURE`) au début pour rollback rapide en prod si le PDF Puppeteer plante ? Ou on accepte le risque + revert PR si besoin ? Recommandation Mary : pas de flag, revert PR si bug — le code reste plus simple et le worker peut être désactivé via Netlify Functions toggle si urgence absolue.

---

**Fin du cadrage compact em-c-10 v1.0** — prêt pour validation et implémentation.

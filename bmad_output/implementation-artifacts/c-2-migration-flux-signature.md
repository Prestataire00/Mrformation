---
storyId: C2
storyKey: c-2-migration-flux-signature
epic: C
title: Migration des flux de signature legacy vers /api/documents/sign unifié
status: done (résolution : scope révisé)
priority: med
effort: 0.25 j-h (analyse + ADR, pas d'implémentation)
sourcePRD: prd-documents.md FR-DOC-21
sourceEpic: epics-documents.md Epic C
createdAt: 2026-05-15
revisedAt: 2026-05-17
completedAt: 2026-05-17
---

# Story C2 — Migration flux signature (résolution analytique)

## Statement initial

**As a** product owner,
**I want** que tous les flux de signature passent par l'endpoint unifié `/api/documents/sign`,
**So that** on a 1 seule source de vérité pour les signatures + audit Qualiopi centralisé.

## Analyse approfondie (2026-05-17)

Audit complet du code révèle **3 flux distincts**, pas 1 flux legacy unique :

| Flux | Endpoint | Table | Sémantique | Caller |
|---|---|---|---|---|
| **A. Signature de DOCUMENT** | `/api/documents/sign` ✅ (C1) | `document_signatures` (new) + `formation_convention_documents.is_signed` | Le client/learner signe un PDF reçu par magic link email | `/sign/[token]/page.tsx` |
| **B. Signature d'ÉMARGEMENT** | `/api/emargement/sign` | `signatures` (legacy) + `signature_evidence` (audit) + `signing_tokens` | L'apprenant signe sa présence à un créneau horaire spécifique (time_slot_id) | `/emargement/[token]/page.tsx` |
| **C. Signature admin inline** | `/api/signatures` | `signatures` (legacy) | L'admin signe à la place du learner/trainer dans TabEmargements quand le créneau est passé | `TabEmargements.handleAdminSign` |

## Décision : scope révisé → status quo backend, cleanup UI séparé

### Pourquoi ne PAS forcer la convergence backend

1. **Sémantique métier distincte** : "signer un PDF" et "signer une présence à un créneau" sont 2 actions différentes avec 2 modèles de données différents (le flux B a `time_slot_id`, `signature_method`, `signature_evidence` qui n'ont pas de sens pour A).
2. **API plus claire séparée** : forcer un endpoint générique demanderait des params optionnels conditionnels (code smell) et masquerait la distinction métier.
3. **Risque/reward défavorable** : le flux émargement est **LIVE Qualiopi** avec audit trail conforme. Le refacto pour un gain architectural marginal n'est pas justifié.
4. **C1 a déjà unifié ce qui devait l'être** : les signatures de documents (conventions, attestations, devis) qui partageaient des paths legacy disparates passent maintenant tous par `/api/documents/sign`.

### Ce qui reste à faire (sorti du scope c-2)

- **UI cleanup** : remplacer le composant inline `InlineSignaturePad` (dans `TabEmargements.tsx:63`) par le `SignaturePad` partagé (`src/components/signatures/SignaturePad.tsx`) qui utilise déjà DOMPurify + react-signature-canvas. Pure cohérence UI, pas de changement de flux backend.
- **Tracking** : ajouté dans Epic E comme story `e-1.1` (hygiène UI signatures).

## Architecture finale documentée

```
SIGNATURES par sémantique métier :
├── Documents PDF → /api/documents/sign + document_signatures (C1 unified)
│   ├── conventions entreprise
│   ├── attestations / certificats
│   ├── devis CRM (quotes)
│   └── tout futur doc avec requires_signature=true
│
└── Émargement présence → /api/emargement/sign + signatures + signature_evidence
    ├── apprenant signe son créneau (magic link)
    └── admin signe à la place (TabEmargements, /api/signatures)
```

## Definition of Done

- [x] Analyse complète des flux signature documentée
- [x] Décision "2 flux par design" justifiée et tracée
- [x] Story `e-1.1` créée pour le cleanup UI restant
- [x] Sprint-status : c-2 → done (résolution analytique)
- [x] Pas de changement code backend (status quo préservé pour flux LIVE Qualiopi)

## Notes

Cette résolution **clôture C2 sans implémentation** car l'analyse a révélé que le scope initial (« migrer tout vers `/api/documents/sign` ») reposait sur une mauvaise compréhension de la sémantique métier des différents flux signature. La bonne décision est de garder 2 flux distincts et bien nommés plutôt qu'un endpoint générique qui mélange les responsabilités.

C3 (audit trail Qualiopi) est déjà done ; cette résolution ne change rien à ce statut.

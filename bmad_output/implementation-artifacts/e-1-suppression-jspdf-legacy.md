---
storyId: E1
storyKey: e-1-suppression-jspdf-legacy
epic: E
title: Suppression jsPDF legacy (résolution analytique)
status: done (résolution : scope révisé en sous-stories par fichier)
priority: low (révisé depuis high)
effort: 0.25 j-h (analyse + ADR, pas d'implémentation)
sourcePRD: prd-documents.md FR-DOC-35/36/37/38
sourceEpic: epics-documents.md Epic E
createdAt: 2026-05-15
revisedAt: 2026-05-17
completedAt: 2026-05-17
---

# Story E1 — Suppression jsPDF legacy (résolution analytique)

## Statement initial

**As a** dev équipe,
**I want** supprimer les 56 imports jsPDF restants pour basculer 100% sur la stack unifiée Puppeteer/CloudConvert via DocumentGenerationService,
**So that** on a 1 seule lib PDF, moins de dépendances bundle, et cohérence architecture.

## Analyse approfondie (2026-05-17)

Audit complet du code révèle que le compteur initial "56 imports" était **incorrect** (probablement comptage erroné via grep large incluant indirects/node_modules).

**Réalité du code** : **7 fichiers utility client-side seulement** sous `src/lib/*` :

| Fichier | Lignes | Risque | Usage |
|---|---|---|---|
| `qr-pdf-export.ts` | 309 | LOW | QR grille apprenants/formateurs |
| `questionnaire-qr-pdf-export.ts` | 51 | LOW | QR grille questionnaires |
| `pdf-export.ts` | 1059 | MED | BPF report (réglementaire) + HTML→PDF générique + `exportHtmlToPDFBase64()` |
| `invoice-pdf-export.ts` | 462 | **HIGH** | Factures financières/comptables (compliance) |
| `devis-pdf.ts` | 720 | MED-HIGH | Devis CRM + CGV légales |
| `planning-hebdo-pdf-export.ts` | 258 | MED | Planning hebdo signatures |
| `emargement-pdf-export.ts` | 417 | MED | Feuilles émargement signatures |
| **Total** | **3276** | | 11 consumers client-side |

**Tous sont des utility libraries client-side** (rien dans `src/app/api/*`), avec ~11 consumers depuis composants admin.

## Décision : scope révisé → status quo + split par sous-stories

### Pourquoi NE PAS migrer en masse

1. **Effort vs valeur défavorable** : 3-5 j-h pour migrer 3276 lignes → zéro gain user visible. Loris ne fait pas la différence.
2. **Risque élevé sur invoice/devis** : flux financiers/légaux LIVE. Refacto pour gain architectural ne justifie pas le risque.
3. **Stack séparée OK par design** : 
   - **Server-side** (Puppeteer + DocumentGenerationService + cache) : conventions, attestations, certificats, convocations, émargements individuels → c'est ce qui passe par les batch endpoints F1/F2.x/F3
   - **Client-side** (jsPDF utility) : exports utilisateurs immédiats (QR à imprimer, BPF report téléchargé, factures envoyées par mail au comptable)
4. **Pas de blocker bundle** : ces 7 fichiers sont en dynamic imports / route-level → ne pèsent que sur les routes qui les utilisent (TabFinances, TabQuestionnaires, etc.).
5. **Travail récent unrelated** : la session 2026-05-17 a déjà refactor `TabConventionDocs.handleDownloadAllPDF` (F1) et `handleMassSendWithPDF` (F2) pour utiliser les endpoints server-side. Les autres fichiers jsPDF sont des paths distincts.

### Ce qui reste à faire (split en sous-stories par catégorie)

Les sous-stories ci-dessous sont **tracées en backlog** pour traçabilité, à activer **uniquement si un blocker concret émerge** (bug jsPDF, exigence bundle size, etc.) :

- **e-1.2** : Migrer `qr-pdf-export.ts` + `questionnaire-qr-pdf-export.ts` (LOW risk, ~1 j-h total)
- **e-1.3** : Migrer `pdf-export.ts` (MED risk, ~1-2 j-h, complexe — utilisé pour BPF + email attachments)
- **e-1.4** : Migrer `invoice-pdf-export.ts` (HIGH risk, ~1-1.5 j-h, flux financier — qualification approfondie requise avant)
- **e-1.5** : Migrer `devis-pdf.ts` (MED-HIGH risk, ~1-1.5 j-h, CGV signatures)
- **e-1.6** : Migrer `planning-hebdo-pdf-export.ts` (MED risk, ~0.5-1 j-h)
- **e-1.7** : Migrer `emargement-pdf-export.ts` (MED risk, ~0.5-1 j-h)
- **e-1.8** : Cleanup final (drop `jspdf` + `jspdf-autotable` + `html2canvas` de package.json, ~0.25 j-h, après e-1.2 à e-1.7)

**Total potentiel** : 5-9 j-h si tout migré (vs estimation initiale "1-2 j-h" qui sous-estimait).

## Definition of Done

- [x] Audit complet réalisé (7 fichiers, 3276 lignes, classés par risque)
- [x] Décision scope révisée documentée + justifiée
- [x] 7 sous-stories e-1.2 à e-1.8 tracées dans sprint-status pour activation future
- [x] Sprint-status : e-1 → done (résolution analytique)
- [x] Pas de changement code (status quo préservé pour flux client-side stables)

## Notes

Cette résolution **clôture E1 sans implémentation** car l'analyse a révélé que le scope original ("supprimer 56 imports") reposait sur un compteur erroné, et que la migration intégrale (3-5 j-h) ne se justifie pas pour des fichiers utility stables qui font leur job.

Si un futur incident lié à jsPDF (bug, vulnérabilité CVE, bundle bloat critique) émerge, activer les sous-stories e-1.x par ordre de risque croissant : QR codes d'abord (LOW), facturation en dernier (HIGH).

**Parallèle avec c-2** : même pattern de résolution analytique (analyser → réviser le scope → split en sous-stories → documenter). Pas de code écrit, mais évite à un futur dev 3-5 j-h de migration inutile.

# Documentation projet — index BMAD

> Index généré par le workflow BMAD `document-project`.
> **Note :** aucun scan complet du projet n'a été réalisé. Seuls les deep-dives ciblés ci-dessous existent à ce jour.

**Dernière mise à jour :** 2026-05-25
**Deep-Dives :** 3

## Deep-Dive Documentation

Analyses exhaustives de zones spécifiques du codebase :

- [Sous-onglet E-learning](./deep-dive-elearning.md) — Analyse complète du sous-système e-learning : sous-onglet `TabElearning` de la fiche formation, espace admin (hub / création / éditeur), 22 routes API, 14 tables, pipeline de génération IA. ~30 fichiers, ~9 000 LOC. Généré le 2026-05-22.
- [Sous-onglet Automatisations](./deep-dive-automatisations.md) — Analyse complète de l'onglet `TabAutomation` de la fiche formation et de son moteur : 2 composants, `lib/automation/*`, 7 routes API, 3 tables, 7 migrations. État des lieux honnête : Timeline fonctionnelle, vue Règles cassée (`is_active`), bouton « Tester » et actions en masse non fonctionnels, moteur date-based non planifié. 18 fichiers, ~2 550 LOC. Généré le 2026-05-22.
- [Sous-onglet Qualiopi](./deep-dive-qualiopi.md) — Analyse complète de l'onglet `TabQualiopi` : composant 526 LOC, 2 routes API IA (audit blanc + check preuves), `loadQualiopiIndicators`, 3 tables dédiées + RLS, page « Suivi Qualité » avec 7 critères. État des lieux : fonctionnel à 70 % avec 4 bugs critiques (scores divergents UI/liste, entity_id manquant sur enrollments/signatures, `qualiopi_score` non typé, mapping `status` dupliqué), 6 bugs majeurs et de la dette (`qualiopi_snapshots` morte, `qualiopi-check-proof` orpheline). ~13 fichiers, ~2 850 LOC. Généré le 2026-05-25.

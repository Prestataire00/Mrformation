# Audit — Organisation d'une formation (page `/admin/formations/[id]`)

> **Date** : 2026-05-25
> **Branche** : main (post-merge des 3 chantiers Automatisations + Qualiopi + Résumé)
> **Méthode** : BMAD `document-project` — audit horizontal, cross-tabs (pas un deep-dive technique).
> **Cible** : la cohérence du parcours « organiser une formation » de bout en bout, à travers les 10 onglets visibles et les 14 sous-composants Tab*.

---

## 1. Vue d'ensemble

La fiche formation détaillée est **l'écran le plus complexe du LMS** : ~7 800 LOC répartis sur **1 page racine (`page.tsx`, 479 LOC)** + **14 sous-composants Tab*** + leurs sous-dossiers de sections.

L'utilisateur cible : un admin (et parfois un trainer) qui organise une session de formation professionnelle de bout en bout — création, planning, inscription, émargement, évaluation, certificats, facturation.

**État synthétique : 9 onglets sur 10 sont fonctionnels et bien construits. 1 onglet (Documents > Conventions) est anormalement gros (2101 LOC). Le header de la page a 2 boutons stubs dans le DropdownMenu. 11 casts `as unknown as` résiduels violent CLAUDE.md.**

---

## 2. Architecture de l'orchestration

### 2.1 Page racine `page.tsx` (479 LOC)

[src/app/(dashboard)/admin/formations/[id]/page.tsx](src/app/(dashboard)/admin/formations/[id]/page.tsx) fait 3 choses :

1. **Charge la formation** avec ~14 relations Supabase en parallèle, plus les documents unifiés via `getDocsForSession()` (table `documents`).
2. **Rend le header** : titre, badges (status / INTRA-INTER / mode / sous-traitance), KPIs (4 cards : Apprenants / Documents / Créneaux / Qualiopi%), boutons d'action.
3. **Rend les 10 onglets** (Résumé, Planning, Documents, Émargement, Questionnaires, E-Learning, Finances, Qualiopi, Automatisation, Communication) en utilisant le composant `<Tabs>` de shadcn. Persistance de l'onglet actif via query param `?tab=…`.

### 2.2 Mapping onglets UI → composants Tab*

| Onglet UI | Composants Tab* utilisés | Pattern de groupement |
|---|---|---|
| **Résumé** | `TabResume` | Direct |
| **Planning** | `TabPlanning` + `TabParcours` | Sub-tabs (Planning / Parcours pédagogique) |
| **Documents** | `TabConventionDocs` + `TabProgramme` + `TabDocsPartages` | Sub-tabs (Conventions / Programme / Documents partagés) |
| **Émargement** | `TabEmargements` + `TabAbsences` | Rendus **séquentiellement** (pas en sub-tabs) |
| **Questionnaires** | `TabQuestionnaires` | Direct (fusionne anciennement TabEvaluation + TabSatisfaction) |
| **E-Learning** | `TabElearning` | Direct |
| **Finances** | `TabFinances` | Direct |
| **Qualiopi** | `TabQualiopi` | Direct |
| **Automatisation** | `TabAutomation` | Direct |
| **Communication** | `TabMessagerie` | Direct |

**Total : 14 sous-composants Tab* pour 10 onglets visibles** (4 sont groupés via sub-tabs ou rendus séquentiellement).

### 2.3 Inventaire détaillé des 14 sous-composants

| Tab | LOC | État | Deep-dive ? | Notes |
|---|---|---|---|---|
| [TabResume](src/app/(dashboard)/admin/formations/[id]/_components/TabResume.tsx) | 145 + 12 sections (~2700) | ✅ Solidifié | [Oui](deep-dive-tab-resume.md) | Chantier 2026-05-25 |
| [TabPlanning](src/app/(dashboard)/admin/formations/[id]/_components/TabPlanning.tsx) | 321 | ✅ Propre | Non | Calendrier + semaine + jour |
| [TabParcours](src/app/(dashboard)/admin/formations/[id]/_components/TabParcours.tsx) | 189 | ✅ Solidifié | Non | Édition inline, export CSV |
| [TabEmargements](src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx) | **1144** | ✅ Propre | Non | Gros mais bien structuré. Signatures + QR + tokens |
| [TabAbsences](src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx) | 375 | ✅ Solidifié | Non | CRUD + auto-détection |
| [TabElearning](src/app/(dashboard)/admin/formations/[id]/_components/TabElearning.tsx) | 579 | ✅ Solidifié | [Oui](deep-dive-elearning.md) | Chantier 2026-05-22 |
| [TabMessagerie](src/app/(dashboard)/admin/formations/[id]/_components/TabMessagerie.tsx) | 702 | ✅ Propre | Non | Templates + libre + scheduling |
| [TabProgramme](src/app/(dashboard)/admin/formations/[id]/_components/TabProgramme.tsx) | 376 | ✅ Solidifié | Non | Assign/remove program |
| [TabFinances](src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx) | **1199** + 2 sub-files | ⚠️ Moyen | Non | **5× `as unknown as`** |
| [TabConventionDocs](src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx) | **2101** | ⚠️ Moyen | Non | **3× casts, 2× TODOs Story F.x** |
| [TabDocsPartages](src/app/(dashboard)/admin/formations/[id]/_components/TabDocsPartages.tsx) | 309 | ✅ Propre | Non | Upload/delete docs |
| [TabQuestionnaires](src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx) | 395 | ✅ Solidifié | Non | **Non listé dans CLAUDE.md** — fusionne ancien Eval+Satisfaction |
| [TabQualiopi](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx) | 421 | ✅ Solidifié | [Oui](deep-dive-qualiopi.md) | Chantier 2026-05-25 |
| [TabAutomation](src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx) | 310 | ✅ Solidifié | [Oui](deep-dive-automatisations.md) | Chantier 2026-05-22 |

**Couverture deep-dives** : 4/14 tabs ont fait l'objet d'un audit détaillé + chantier de solidification. Les 10 autres sont à l'état "propre / moyen" sans avoir été audités ligne par ligne.

---

## 3. Parcours utilisateur « organiser une formation A → Z »

L'utilisateur passe **séquentiellement** par les onglets selon les phases de la formation. L'audit révèle un ordre logique implicite :

### Phase A — Création & cadrage (avant la formation)

| Étape | Onglet | Action |
|---|---|---|
| A1 | **Résumé** | Créer la formation (existence via liste), attribuer manager, ajouter formateurs (avec rôles + tarifs), ajouter entreprises clientes, inscrire apprenants, déclarer financeurs (OPCO), saisir prix & heures planifiées |
| A2 | **Planning** | Définir les créneaux (date/heure/durée) — sub-tab "Planning" |
| A3 | **Planning** > Parcours | Détailler le parcours pédagogique (objectifs, modules) — sub-tab "Parcours pédagogique" |
| A4 | **Documents** > Programme | Assigner un programme de formation Qualiopi |
| A5 | **Documents** > Conventions | Générer conventions formation (apprenant/entreprise) + conventions intervention (formateur) + convocations (apprenants) |
| A6 | **Automatisation** | Configurer les règles (ex: convocations J-3, certificats J+1 fin) |

### Phase B — Pendant la formation

| Étape | Onglet | Action |
|---|---|---|
| B1 | **Émargement** | Recueillir signatures (par créneau, via QR ou inline). Tab montre Émargement + Absences ensemble. |
| B2 | **E-Learning** | Suivre la progression e-learning si modules attribués |
| B3 | **Communication** | Envoyer messages aux apprenants (templates `convocation`, `info_pratique`, etc. ou messages libres) |

### Phase C — Fin de formation

| Étape | Onglet | Action |
|---|---|---|
| C1 | **Questionnaires** | Envoyer évaluations finales (pré/post) + satisfaction à chaud |
| C2 | **Documents** > Conventions | Générer + envoyer certificats de réalisation |
| C3 | **Header** | Cliquer « Terminer » (déclenche l'automatisation `on_session_completion`) |

### Phase D — Après la formation

| Étape | Onglet | Action |
|---|---|---|
| D1 | **Finances** | Générer factures entreprises (cascade prix → factures pending si modif), suivre les paiements, suivre dossiers OPCO |
| D2 | **Qualiopi** | Audit blanc IA, score visible, snapshot quotidien (futur) |
| D3 | **Questionnaires** | Satisfaction à froid (J+30) si configurée en automatisation |
| D4 | **Documents** > Documents partagés | Archives, documents post-formation |

---

## 4. Ruptures de cohérence cross-tabs

### 🔴 R1 — Stubs dans le DropdownMenu du header (page.tsx)

[page.tsx:293-299](src/app/(dashboard)/admin/formations/[id]/page.tsx#L293-L299) :

```tsx
<DropdownMenuItem className="gap-2 text-xs">
  <Copy className="h-3.5 w-3.5" /> Dupliquer la formation
</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem className="gap-2 text-xs text-red-600 focus:text-red-600">
  <Trash2 className="h-3.5 w-3.5" /> Supprimer
</DropdownMenuItem>
```

**Aucun `onClick` ni handler.** Cliquer ne fait rien. Et ces actions sont **déjà fonctionnelles ailleurs** :
- « Dupliquer » → `TabResume > ResumeActions` (fonctionnel via `duplicateSession`)
- « Supprimer » → `TabResume > ResumeDangerZone` (fonctionnel via `deleteSession`)

→ **Duplication d'actions** (header stub vs Résumé fonctionnel) + UX confuse. À soit câbler, soit retirer du DropdownMenu.

### 🔴 R2 — 11 casts `as unknown as` résiduels (violation CLAUDE.md)

Distribution :

| Fichier | Lignes | Pattern |
|---|---|---|
| `page.tsx` | 119 | `setFormation(formationWithDocs as unknown as Session)` |
| `page.tsx` | 245 | `(formation as unknown as { is_subcontracted?: boolean }).is_subcontracted` |
| `TabFinances.tsx` | 93, 94, 266, 282, 333 | TVA exempt/rate + client cast invoice builder |
| `TabConventionDocs.tsx` | 1140, 1629, 1643 | signer_email + DEFAULT_LEARNER/COMPANY_DOCS |
| `TabAutomation.tsx` | 124 | `formation.is_subcontracted` |

**Pattern** : ces casts indiquent des types incomplets (`Session` n'a pas tous ses champs) ou des shapes BDD pas reflétés dans `src/lib/types`. C'est le **même pattern que B3 du chantier TabResume** (résolu pour `individual_price` + `email`). Il reste 5 autres champs à typer correctement.

### 🟠 R3 — TabConventionDocs : 2101 LOC, ingestable

[TabConventionDocs.tsx](src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx) est **2,1× plus gros que le 2ᵉ plus gros tab** (TabFinances 1199 LOC) et **7× plus gros** qu'un tab moyen. Il gère :
- Génération conventions formation (apprenant/entreprise)
- Génération conventions intervention (formateur, sous-traitance)
- Génération convocations
- Génération certificats de réalisation
- Génération attestations d'assiduité
- Documents secondaires (~23 types)
- Templates Word custom (mode docx_fidelity vs editable)
- Signature électronique (canvas + token public + eIDAS)
- Envoi par email
- 2 TODOs Story F1.x et F2.x : migration progressive de doc_types vers leurs endpoints

**Risque** : bugs cachés non détectables sans audit ligne par ligne. C'est le **prochain candidat pour un chantier de solidification** (taille comparable à Résumé + Qualiopi cumulés).

### 🟠 R4 — Onglet Émargement : Émargement + Absences sans sub-tabs

[page.tsx:415-418](src/app/(dashboard)/admin/formations/[id]/page.tsx#L415-L418) :

```tsx
<TabsContent value="emargement" className="mt-6 space-y-8">
  <TabEmargements formation={formation} onRefresh={fetchFormation} />
  <TabAbsences formation={formation} onRefresh={fetchFormation} />
</TabsContent>
```

Les 2 composants sont rendus **séquentiellement, en colonne**, sans sub-tabs. C'est **incohérent** avec les autres groupements (Planning et Documents utilisent des sub-tabs). Le commentaire mentionne « retour client Loris » — probablement un choix UX intentionnel pour montrer les deux côte-à-côte.

→ Acceptable mais à documenter. Pas un bug, juste une asymétrie UX.

### 🟡 R5 — `useToast` + double-pattern d'erreur dans page.tsx

`handleToggleComplete` ([ligne 161-195](src/app/(dashboard)/admin/formations/[id]/page.tsx#L161-L195)) :
- Erreur capturée avec `err instanceof Error ? err.message : "Erreur"` ✓ bon pattern
- Mais `fetch("/api/formations/automation-rules/trigger-event", ...)` ne propage **aucune erreur** au toast — `.catch(console.error)` silent. L'utilisateur ne sait pas si les automatisations ont été déclenchées ou non.

→ Pattern d'erreur incohérent : l'update session a un toast, le fetch automation n'en a pas.

### 🟡 R6 — Documentation outdated (CLAUDE.md)

CLAUDE.md liste **13 tabs** dont `TabEvaluation` et `TabSatisfaction` séparés. La réalité du code :
- Ces deux ont été **fusionnés en `TabQuestionnaires`**
- 2 tabs additionnels existent : `TabAutomation` et `TabQualiopi`
- Donc 14 sous-composants Tab* (et 10 onglets UI)

→ CLAUDE.md à mettre à jour pour refléter l'état actuel.

### 🟡 R7 — Quelques décisions de groupement à valider

- **« Documents » groupe 3 sous-tabs** mais TabConventionDocs représente 80% du contenu. Pourrait être éclaté.
- **« Communication » et « Automatisation » sont séparés** alors qu'ils sont fortement liés (les automatisations DÉCLENCHENT des communications). À envisager comme groupement futur ?
- **« Finances » et « Qualiopi »** sont séparés alors que Qualiopi consomme des données financières (financeurs OPCO).

### 🟡 R8 — Workflow `handleToggleComplete` enclenche automation_rules cross-tab

[page.tsx:175-181](src/app/(dashboard)/admin/formations/[id]/page.tsx#L175-L181) — quand l'admin clique « Terminer », un fetch déclenche `trigger_type: "on_session_completion"`. Ce trigger doit matcher une règle dans **TabAutomation**. Si aucune règle existe → pas d'envoi de certificats. C'est **dépendant d'une configuration cross-tab** que l'utilisateur peut oublier.

→ **Recommandation** : afficher dans le dialog « Terminer » un compteur des règles `on_session_completion` configurées (« 3 automatisations seront déclenchées »).

---

## 5. Tabs cassés / partiellement implémentés / stubs résiduels

### Stubs résiduels (after les 3 chantiers de solidification)

| Localisation | Description | Sévérité |
|---|---|---|
| `page.tsx:293-295` | DropdownMenu "Dupliquer la formation" sans handler | 🔴 Visible UI |
| `page.tsx:297-299` | DropdownMenu "Supprimer" sans handler | 🔴 Visible UI |
| `TabConventionDocs.tsx:805` | `// TODO Story F2.x : migrer doc_types restants` | 🟡 Tech-debt |
| `TabConventionDocs.tsx:899` | `// TODO Story F1.x : migrer doc_types (cgv, planning_semaine, etc.)` | 🟡 Tech-debt |

### Tabs nécessitant un audit approfondi

| Tab | Pourquoi |
|---|---|
| **TabConventionDocs (2101 LOC)** | Taille critique, 3 casts, 2 TODOs Story, gère 6+ types de documents + signature + envoi |
| **TabFinances (1199 LOC)** | 5 casts, gère factures + paiements + OPCO cascade prix |
| **TabEmargements (1144 LOC)** | Gros mais pas de violations détectées au survol — audit confirmation |
| **TabMessagerie (702 LOC)** | Gros, gère scheduling + templates + bulk send |

### Tabs sans dette visible (pas urgent d'auditer)

TabPlanning (321), TabParcours (189), TabAbsences (375), TabProgramme (376), TabDocsPartages (309), TabQuestionnaires (395) — propres, taille raisonnable, pas de violations détectées.

---

## 6. Plan d'action priorisé

### Quick wins (< 1 jour cumulé)

| # | Action | Effort | Bénéfice |
|---|---|---|---|
| QW1 | Câbler ou retirer les 2 stubs DropdownMenu de `page.tsx` (R1) | XS | UX immédiate |
| QW2 | Mettre à jour CLAUDE.md pour refléter les 14 tabs réels (R6) | XS | Doc à jour |
| QW3 | Ajouter `await onRefresh()` final + error toast au fetch automation (R5) | XS | Visibility |
| QW4 | Ajouter compteur de règles `on_session_completion` dans le dialog Terminer (R8) | S | UX guidante |

### Chantier intermédiaire (1-2 jours)

| # | Action | Effort | Bénéfice |
|---|---|---|---|
| CI1 | Étendre les types `Session/Client/etc.` pour les 5 champs castés via `as unknown as` (R2), audit transverse | S | CLAUDE.md compliance, type safety |

### Chantier majeur (3-5 jours)

| # | Action | Effort | Bénéfice |
|---|---|---|---|
| CM1 | **Deep-dive + solidification TabConventionDocs** (2101 LOC, 3 casts, 2 TODOs Story) | L | Réduit le plus gros risque restant ; pattern Qualiopi/Résumé/Automatisations |
| CM2 | **Deep-dive + solidification TabFinances** (1199 LOC, 5 casts, cascade complexe) | M-L | Sécurité multi-tenant + robustesse |

### Décisions UX à valider (à brainstormer si besoin)

- Faut-il garder « Émargement » + « Absences » groupés sans sub-tabs (R4) ou les séparer ?
- Faut-il regrouper « Automatisation » + « Communication » (R7) ?
- Faut-il garder le tab « Documents » comme parapluie (3 sub-tabs) ou éclater Conventions en tab dédié ?

---

## 7. Synthèse en 1 paragraphe

La page formation est **bien architecturée et globalement saine** : 10 onglets UI clairement groupés, un chargement parallèle efficient, et un parcours utilisateur cohérent A→Z. Trois chantiers de solidification récents (Automatisations, Qualiopi, Résumé, E-learning) ont nettoyé 4/14 sous-composants. Les **10 sous-composants restants** sont propres pour la plupart, à 2 exceptions près : `TabConventionDocs` (2101 LOC) et `TabFinances` (1199 LOC) qui méritent un deep-dive + chantier de solidification car ils concentrent à eux deux **8 des 11 casts `as unknown as`** restants et de la complexité métier importante (signature électronique, cascade prix, OPCO). Les autres ruptures sont mineures : 2 stubs UI dans le header (5 min à corriger), CLAUDE.md outdated, et quelques choix UX à valider. **Aucune rupture critique du parcours utilisateur** n'a été détectée — un admin peut organiser une formation de A à Z sans bug bloquant.

---

## 8. Référence — Deep-dives existants

- [docs/deep-dive-elearning.md](deep-dive-elearning.md) (2026-05-22) — TabElearning, 22 routes API
- [docs/deep-dive-automatisations.md](deep-dive-automatisations.md) (2026-05-22) — TabAutomation, moteur cron
- [docs/deep-dive-qualiopi.md](deep-dive-qualiopi.md) (2026-05-25) — TabQualiopi, snapshots
- [docs/deep-dive-tab-resume.md](deep-dive-tab-resume.md) (2026-05-25) — TabResume, 12 sections

**Total : 4 deep-dives produits dans la même séquence, 3 chantiers de solidification mergés en prod.**

---

**Fin de l'audit horizontal.** Prêt à enchaîner sur les quick wins (QW1-QW4) et/ou un chantier de solidification ciblé (CM1 ou CM2).

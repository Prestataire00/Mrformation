# Refonte UX de la page Finances — Design

**Date :** 2026-05-21
**Statut :** Validé
**Périmètre :** Onglet Finances de la fiche formation — `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx`. Refonte purement UI : aucun changement de base de données, de migration, ni de route API.

---

## 1. Contexte & problème

L'onglet Finances est jugé peu intuitif. Six problèmes identifiés :

1. **3 sections figées, 2 souvent vides.** Une formation est facturée à un seul type de destinataire ; les 2 autres sections (Apprenants / Entreprises / Financeurs) affichent un encadré « Aucune facture » qu'on fait défiler pour rien.
2. **Densité et contraste.** Titres en gris très clair, texte 10–11 px, boutons ras. Rien ne ressort.
3. **Surcharge d'actions.** Jusqu'à 5 micro-boutons par ligne de facture (PDF · Email · Payée · Modifier · Avoir).
4. **KPIs incomplets.** Facturé / Payé / En attente / Charges — pas de « En retard » (la donnée existe pourtant), pas de marge.
5. **Charges bricolées.** 5ᵉ section en bas, avec un mini-formulaire en ligne — mode d'interaction différent du reste.
6. **Aucune hiérarchie.** 3 tableaux empilés ; rien ne distingue une facture en retard d'une facture payée.

### Cadrage (issu du brainstorming)

- **Rôle principal de la page : facturer** — créer / générer / envoyer des factures.
- **L'auto-génération domine**, avec de la création manuelle au cas par cas.
- **Marge : secondaire** — utile à consulter, mais présentation discrète / repliable.

---

## 2. Décision : approche « Polish ciblé »

On **conserve la structure en 3 sections par type** et on corrige les défauts, sans refondre l'architecture de la page. Les approches « tableau de bord unifié » (liste unique) et « piloté par le flux » (bandeau d'état dirigiste) ont été écartées — la structure familière est conservée.

---

## 3. Design — les 5 zones

### Zone 1 — Indicateurs (KPI)

Quatre cartes : **Facturé** (avec barre de progression vs objectif `formation.total_price`) · **Encaissé** · **En attente** · **En retard**.

- « Payé » est renommé **« Encaissé »**.
- **« En retard »** est ajouté (montant des factures au statut `late`).
- **« Charges »** quitte le bandeau du haut → rejoint la zone 5.
- Contraste corrigé : libellés lisibles, fin du gris-400.

Les quatre cartes correspondent à des champs déjà renvoyés par l'API `/invoices` (`total_invoiced`, `total_paid`, `total_pending`, `total_late`) — aucun calcul nouveau côté serveur.

### Zone 2 — Barre d'action

- Un titre **« Factures »** et **un seul** bouton **« + Créer une facture »** (le choix du type se fait dans le dialogue — voir §4.2).
- **« Importer une facture »** : lien secondaire discret à côté du bouton.
- Le **bandeau d'auto-génération** (bleu) est conservé, conditionnel (`canAutoGenerate`), et porte l'action **« ⚡ Générer les factures »**.

### Zone 3 — Sections par type

- Les 3 sections (Apprenants / Entreprises / Financeurs) sont conservées **pour l'affichage**.
- **Une section sans facture est masquée** — fin des encadrés « Aucune facture ».
- En-tête de section lisible : icône + nom + nombre de factures + total de la section.
- Les boutons « + Facture » et « Importer » **par section** sont **retirés** (centralisés en zone 2).

### Zone 4 — Lignes de facture

Colonnes : référence · destinataire · montant · statut + échéance · **un bouton d'action contextuel + un menu « ⋯ »**.

- Texte agrandi et lisible (fin du 10–11 px).
- Le bouton visible et le contenu du menu dépendent du statut — voir §4.3.

### Zone 5 — Charges & marge

- Bloc **repliable**, **replié par défaut**, en bas de page.
- En-tête replié : « Charges & marge » + la marge prévisionnelle.
- Déplié : le tableau des charges + l'ajout de charge en ligne (inchangé) + la **marge** = Facturé − Charges.

---

## 4. Résolutions des zones d'ombre des workflows

### 4.1 Picker entreprise (formations INTER)

Le modal « À quelle entreprise facturez-vous ? » se déclenche désormais **quand le type « Entreprise » est sélectionné dans le dialogue** sur une formation INTER — et non plus à l'ouverture du dialogue. Sélectionner un type Apprenant ou Financeur n'ouvre aucun picker. Le `useEffect` actuel qui ouvre le picker sur `invoiceDialog` est remplacé par un déclenchement sur le changement de `recipient_type`.

### 4.2 Type de destinataire par défaut

« + Créer une facture » ouvre le dialogue avec un type par défaut intelligent :
- **Entreprise** si `formation.formation_companies` est non vide ;
- sinon **Financeur** si `formation.formation_financiers` est non vide ;
- sinon **Apprenant**.

### 4.3 Actions de ligne — adaptées au statut

Règle serveur **H7** : une facture non-`pending` ne peut plus voir son contenu modifié (la route PATCH renvoie 409). Le bouton contextuel et le menu « ⋯ » respectent ce mapping :

| Statut | Bouton visible | Menu « ⋯ » |
|--------|----------------|------------|
| `pending` | Envoyer (email) | Télécharger PDF · Marquer payée · Modifier · Créer un avoir |
| `sent` | Marquer payée | Télécharger PDF · Envoyer · Créer un avoir |
| `late` | Marquer payée | Télécharger PDF · Envoyer · Créer un avoir |
| `paid` | Télécharger PDF | Envoyer · Créer un avoir |
| `cancelled` | Télécharger PDF | Envoyer |
| Avoir (`is_avoir`) | Télécharger PDF | Envoyer |

Conditions reprises du code actuel :
- **Modifier** : uniquement statut `pending` et non-avoir.
- **Marquer payée** : si statut ∉ {`paid`, `cancelled`} et non-avoir.
- **Créer un avoir** : si non-avoir et statut ≠ `cancelled`.

### 4.4 KPIs « En attente » et « En retard »

« En attente » agrège les statuts `pending` et `sent` (champ `total_pending`). « En retard » correspond au statut `late` (champ `total_late`), alimenté par le cron `process-reminders` (`src/app/api/invoices/process-reminders/route.ts`). C'est cohérent avec la page Rapports et le dashboard admin, qui comptent les retards de la même façon. Aucun calcul alternatif n'est introduit.

*Dépendance opérationnelle (hors périmètre) : si le cron `process-reminders` ne tourne pas, aucune facture ne bascule en `late` — à vérifier côté planification.*

### 4.5 État « zéro facture »

Si la formation n'a aucune facture, les 3 sections sont masquées. Un **état vide** explicite est alors affiché : « Aucune facture pour cette formation » avec les actions Créer / Générer accessibles.

### 4.6 Bandeau d'auto-génération

Le comportement actuel est conservé : `canAutoGenerate` = formation au statut `completed` ET non `invoice_generated` ET aucune facture. Le bandeau disparaît dès la première facture. Sa logique de déclenchement n'est **pas** revue (hors périmètre « polish »).

### 4.7 Marge

Marge = `stats.total_invoiced − stats.total_charges`, calculée côté client. « Facturé » (`total_invoiced`) exclut déjà les avoirs — comportement actuel conservé.

---

## 5. Architecture & implémentation

- Fichier concerné : `TabFinances.tsx` (~1400 lignes). La refonte porte surtout sur le rendu (le `return` JSX) et sur le déclenchement du picker (§4.1).
- **Décomposition recommandée** — le fichier est trop gros ; extraire des sous-composants ciblés améliore la lisibilité et facilite l'implémentation :
  - `FinancesKpiBand` — la zone 1.
  - `InvoiceSection` — un en-tête de section + son tableau de lignes.
  - `InvoiceRow` — une ligne de facture.
  - `InvoiceActionsMenu` — le bouton contextuel + le menu « ⋯ » (logique du §4.3).
  - `ChargesPanel` — la zone 5 repliable.
- Le menu « ⋯ » utilise le composant shadcn `DropdownMenu` (vérifier sa présence dans `src/components/ui/` ; l'ajouter si absent).
- **Aucun changement** de base de données, de migration ni de route API. Mêmes endpoints, mêmes données, mêmes handlers métier.

---

## 6. Hors périmètre

- Refonte de la logique d'auto-génération ou du déclencheur du bandeau (§4.6).
- Changement du modèle de données ou des routes API.
- Système de relances (`process-reminders`).
- L'approche « tableau de bord unifié » (liste de factures unique).

---

## 7. Tests

- `TabFinances` n'a pas de test de composant aujourd'hui ; la refonte étant UI, on n'en introduit pas de lourd.
- Tout helper pur extrait (notamment le mapping statut → actions du §4.3 et le calcul de marge) est couvert par des tests unitaires Vitest.

---

## 8. Critères de succès

- Les sections sans facture ne s'affichent plus.
- Un seul point de création de facture (zone 2).
- Chaque ligne a au plus un bouton + un menu « ⋯ », adaptés au statut.
- KPIs affichés : Facturé / Encaissé / En attente / En retard, lisibles et contrastés.
- Bloc Charges & marge replié par défaut.
- Aucune régression fonctionnelle : création, édition, auto-génération, export PDF, envoi email, avoir, picker INTER.

# Documentation : Calcul du CA Previsionnel

## Presentation generale

Le **CA Previsionnel** (Chiffre d'Affaires Previsionnel) est un indicateur cle affiche sur le tableau de bord administrateur de la plateforme LMS. Il represente une estimation du chiffre d'affaires total que l'organisme de formation peut esperer realiser sur l'annee en cours.

Ce calcul est entierement automatique et se base sur les donnees presentes dans le CRM (module Prospects) de la plateforme.

---

## Source des donnees

Toutes les donnees proviennent de la table `crm_prospects` (les fiches prospects du CRM).

Le montant de chaque affaire est extrait automatiquement depuis le champ **Notes** de la fiche prospect. Le systeme recherche la mention `Montant HT :` suivie d'un montant en euros.

**Exemple :** Si les notes d'un prospect contiennent `Montant HT : 5 500,00`, le systeme extraira la valeur **5 500 euros**.

> **Important** : Si le montant n'est pas renseigne dans les notes avec le format "Montant HT : XXXX", la fiche prospect ne sera pas prise en compte dans le calcul.

---

## Les 3 composantes du calcul

### 1. CA Realise (ce qui est deja gagne)

C'est la somme de tous les montants HT des prospects dont le statut est **"Gagne"** (`won`) sur l'annee en cours.

**Exemple concret :**
- Prospect A : statut "Gagne", Montant HT : 3 000 euros
- Prospect B : statut "Gagne", Montant HT : 7 500 euros
- **CA Realise = 10 500 euros**

---

### 2. Pipeline pondere (les affaires en cours, ponderees par leur probabilite de conversion)

Les prospects qui ne sont pas encore gagnes mais qui sont dans le pipeline commercial sont comptabilises, mais avec un **coefficient de probabilite** qui depend de leur avancement dans le processus de vente :

| Statut du prospect | Signification | Coefficient | Explication |
|---|---|---|---|
| **Devis envoye** (`proposal`) | Un devis a ete envoye au client | **60%** | 6 chances sur 10 de se concretiser |
| **Qualifie** (`qualified`) | Le besoin est identifie et confirme | **30%** | 3 chances sur 10 |
| **Contacte** (`contacted`) | Premier contact etabli | **10%** | 1 chance sur 10 |

**Exemple concret :**
- Prospect C : statut "Devis envoye", Montant HT : 10 000 euros -> 10 000 x 0.60 = **6 000 euros**
- Prospect D : statut "Qualifie", Montant HT : 8 000 euros -> 8 000 x 0.30 = **2 400 euros**
- Prospect E : statut "Contacte", Montant HT : 5 000 euros -> 5 000 x 0.10 = **500 euros**
- **Pipeline pondere = 8 900 euros**

> Les prospects avec statut "Perdu" (`lost`) ou "Nouveau" (`new`) ne sont pas pris en compte.

---

### 3. Projection tendancielle (basee sur l'historique des annees precedentes)

Le systeme analyse l'historique des annees precedentes pour projeter une tendance. Il y a 3 scenarios possibles :

#### Scenario A : 2 annees d'historique disponibles (N-1 et N-2)

Le systeme calcule le **taux de croissance** entre les deux annees passees et l'applique pour projeter l'annee en cours.

**Formule :**
```
Taux de croissance = (CA annee N-1 - CA annee N-2) / CA annee N-2
Projection tendancielle = CA annee N-1 x (1 + Taux de croissance)
```

**Exemple concret :**
- CA 2024 (N-2) : 80 000 euros
- CA 2025 (N-1) : 100 000 euros
- Taux de croissance : (100 000 - 80 000) / 80 000 = **+25%**
- Projection tendancielle pour 2026 : 100 000 x 1.25 = **125 000 euros**

#### Scenario B : 1 seule annee d'historique (N-1 seulement)

Le systeme **annualise** le CA deja realise (projette le rythme actuel sur 12 mois) et le compare au CA de l'annee precedente.

**Formule :**
```
CA annualise = CA realise / (mois en cours / 12)
Projection = max(CA annee N-1, CA annualise)
```

**Exemple concret (en mars, soit mois 3/12) :**
- CA realise en mars 2026 : 30 000 euros
- CA annualise : 30 000 / (3/12) = 30 000 / 0.25 = **120 000 euros**
- CA 2025 (N-1) : 100 000 euros
- Projection tendancielle : max(100 000, 120 000) = **120 000 euros**

#### Scenario C : Aucun historique (premiere annee d'activite)

Pas de tendance possible, on utilise simplement :
```
CA Previsionnel = CA Realise + Pipeline pondere
```

---

## Formule finale

Le CA Previsionnel est le **maximum** entre :
1. La **projection tendancielle** (basee sur l'historique)
2. Le **CA Realise + Pipeline pondere** (basee sur les donnees concretes de l'annee)

```
CA Previsionnel = max(Projection tendancielle, CA Realise + Pipeline pondere)
```

**Pourquoi prendre le maximum ?**
Cela garantit que le previsionnel ne soit jamais inferieur a ce qui est deja concretement en cours. Si la tendance historique donne un chiffre plus optimiste, on le retient. Si au contraire les affaires en cours depassent la tendance, c'est le montant reel qui est retenu.

---

## Exemple complet

Prenons un organisme de formation en **mars 2026** :

**Donnees :**
- CA 2024 : 80 000 euros
- CA 2025 : 100 000 euros
- Prospects gagnes en 2026 : 25 000 euros (CA Realise)
- Pipeline 2026 :
  - 1 devis envoye a 15 000 euros
  - 2 prospects qualifies a 8 000 euros chacun
  - 3 prospects contactes a 4 000 euros chacun

**Etape 1 - CA Realise :**
25 000 euros

**Etape 2 - Pipeline pondere :**
- Devis : 15 000 x 0.60 = 9 000
- Qualifies : (8 000 + 8 000) x 0.30 = 4 800
- Contactes : (4 000 + 4 000 + 4 000) x 0.10 = 1 200
- **Total pipeline : 15 000 euros**

**Etape 3 - Projection tendancielle :**
- Taux de croissance 2024 -> 2025 : +25%
- Projection : 100 000 x 1.25 = 125 000 euros

**Etape 4 - Resultat final :**
- Option A (tendance) : 125 000 euros
- Option B (realise + pipeline) : 25 000 + 15 000 = 40 000 euros
- **CA Previsionnel = max(125 000, 40 000) = 125 000 euros**

---

## Comment ameliorer la precision du CA Previsionnel ?

1. **Toujours renseigner le "Montant HT" dans les notes des prospects** en respectant le format : `Montant HT : XXXX`
2. **Mettre a jour regulierement le statut des prospects** (Contacte -> Qualifie -> Devis envoye -> Gagne/Perdu)
3. **Ne pas laisser de prospects "en attente" indefiniment** : les marquer comme perdus s'ils ne donnent plus suite, pour ne pas gonfler artificiellement le pipeline
4. **Plus l'historique est long, plus la projection est fiable** : a partir de 2 annees completes d'utilisation, le systeme peut calculer des tendances de croissance

---

## Ou voir ce KPI ?

Le CA Previsionnel est visible sur :
- **Tableau de bord Admin** : carte KPI "CA Previsionnel 2026" (avec le filtre par entite si applicable)
- **Rapports > Commercial** : dans le rapport commercial detaille

---

*Document genere le 14 mars 2026 - Plateforme LMS MR FORMATION*

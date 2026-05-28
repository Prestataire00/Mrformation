# UX Design du module Emails — MR / C3V Formation

**Auteur :** Sally (UX Designer, BMad)
**Date :** 2026-05-28
**Statut :** UX design — v1.0 (✅ validé le 2026-05-28 par Wissam)
**Demandeur :** Wissam (dev) au nom de Loris (gérant OF, persona principal)
**Source :** [cadrage-module-emails.md](./cadrage-module-emails.md) — v1.0 validé 2026-05-28
**Focus principal :** Lot C de la refonte (UI `/admin/emails`)

---

## 0. Résumé exécutif UX

Loris ouvre `/admin/emails` aujourd'hui et **a peur de toucher quoi que ce soit**. Pas parce que l'UI est laide — elle est même correcte — mais parce qu'**aucun élément visuel ne lui dit où il est en sécurité**. Quel template est en train d'envoyer un mail ce soir ? Lequel je peux modifier ? Lequel est cassé ? Si je clique "Modifier", est-ce que je vais casser 17 automations ?

L'UX cible répond à 4 promesses simples, dans l'ordre d'apparition à l'écran :

1. **"Je vois immédiatement à quoi sert chaque template"** — catégorisation visuelle forte (relance facture / convocation / OPCO / campagne / custom).
2. **"Je sais qui s'en sert avant d'y toucher"** — usage badge inline, panel détaillé en sidebar du dialog d'édition.
3. **"Je peux essayer en sécurité"** — preview live avec variables résolues sur un cas d'usage réel choisi par Loris (une session/apprenant/client de son choix).
4. **"Je peux revenir en arrière"** — soft-archive au lieu de delete, onglet "Archivés" pour restaurer, et `email_history` reste le filet ultime.

**Principe sous-jacent** (Don Norman) : *make the affordances visible, make the consequences predictable*. Aujourd'hui, ni l'un ni l'autre. Demain, les deux.

---

## 1. Persona Loris — rappel synthétique

| Attribut | Valeur |
|---|---|
| **Rôle** | Gérant OF (MR Formation + C3V Formation), admin solo |
| **Compétences tech** | Non-développeur. Utilise quotidiennement le LMS, écrit ses propres mails dans Gmail. Maîtrise Word, pas le HTML. |
| **Volume** | ~50 mails / semaine envoyés via la plateforme (mix transactionnels + relances). 25+ templates actifs au total. |
| **Frustration #1** | "Je ne sais pas pourquoi mes relances OPCO partent toujours avec le même texte alors que je crois l'avoir modifié dans l'interface" |
| **Frustration #2** | "J'évite de toucher aux templates car j'ai peur d'en casser un qui part automatiquement" |
| **Frustration #3** | "Pour C3V, je dois tout refaire à la main alors que c'est le même message" |
| **Time on task acceptable** | < 30 sec pour éditer un sujet de mail, < 2 min pour créer un nouveau template, < 10 sec pour comprendre si un template est "à risque" |
| **Touchpoints** | Desktop principalement (Macbook), occasionnel iPad pour validation rapide |

> **Loris en une phrase** : *un utilisateur courageux mais prudent — il veut faire, mais ne veut pas casser.*

---

## 2. Jobs-To-Be-Done (JTBD)

Quand Loris ouvre `/admin/emails`, il vient pour **un de ces 7 jobs** (par ordre de fréquence observée) :

| JTBD | Fréquence | Time on task cible |
|---|---|---|
| **J1** — Modifier le wording d'un template existant (relance, convocation…) | Plusieurs fois par semaine | < 60 sec |
| **J2** — Voir l'historique des mails envoyés ce matin / la semaine | Quotidien | < 15 sec pour scanner |
| **J3** — Renvoyer un mail (erreur destinataire, ajout d'info) | 2-3× par semaine | < 30 sec |
| **J4** — Envoyer un mail one-shot depuis un template | 1× par semaine | < 90 sec |
| **J5** — Créer un nouveau template | 1× par mois | < 5 min |
| **J6** — Comprendre pourquoi un template ne part pas | 1× par mois | < 2 min |
| **J7** — Dupliquer un template MR ↔ C3V | 1× par mois | < 30 sec |

Tout le design priorise **J1 + J2** (90% du trafic).

---

## 3. Information Architecture (IA)

### 3.1 Sitemap `/admin/emails` refondue

```
/admin/emails
├── 📂 Modèles (par défaut)            ← J1, J5
│   ├── Filtres : Catégorie / Recherche / Statut (actif/archivé)
│   ├── Vue : Cards (par défaut) | Liste compacte
│   └── Action principale : "Nouveau modèle"
│
├── 📨 Historique                       ← J2, J3, J6
│   ├── Filtres : Statut / Date / Destinataire / Template
│   └── Action principale : "Envoyer un mail" (one-shot)
│
├── ⚙️ Automatisations                  ← (consolidé : ex-RelancesTab + formation_automation_rules)
│   ├── Sous-tabs : Relances | Déclencheurs formation | CRM
│   └── Lien profond vers Modèles (le template lié)
│
└── 🗄️ Archivés                         ← restauration / nettoyage
    ├── Templates archivés (soft-delete)
    └── Action : Restaurer | Supprimer définitivement (avec confirmation forte)
```

Différences vs IA actuelle :
- **3 tabs → 4 tabs** : "Archivés" ajouté (J6 + filet de sécurité).
- **"Relances" disparaît du niveau 1** : intégré dans "Automatisations" (sous-tab). Justification : les relances sont une **catégorie** de templates, pas un onglet à part. Elles vivent désormais dans "Modèles" avec un filtre `category=reminder`, et leur configuration de trigger vit dans "Automatisations".
- **Quick actions repensées** (cf. §4.2)

### 3.2 Catégories de templates (filter top-level)

| Code | Label UI | Couleur badge | Exemple |
|---|---|---|---|
| `transactional` | 📤 Transactionnel | Slate | Confirmation inscription, reset password |
| `automation` | ⚙️ Automatisation | Blue | Convocation J-7, Bilan J+7 |
| `reminder` | ⏰ Relance | Orange | Relance facture 1ère/2ème/finale, OPCO |
| `batch` | 📦 Envoi batch | Indigo | Convocation batch, Attestations batch |
| `campaign` | 📣 Campagne | Purple | Newsletter, prospection |
| `custom` | ✏️ Custom | Gray | Mail one-shot personnalisé |

Code couleur **cohérent** avec les badges `/admin/documents` (qui utilisent déjà slate/blue/emerald pour distinguer Official vs Custom).

---

## 4. Navigation principale

### 4.1 Sticky tabs (cohérence avec `/admin/documents` V3)

Réutilisation du composant `DocumentsTabsNav` (sticky en haut, scroll-aware), renommé en `EmailsTabsNav`. 4 onglets visibles, badge count sur "Archivés" si > 0 et sur "Historique" si erreurs récentes.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📂 Modèles    📨 Historique  ⚠️3   ⚙️ Automatisations    🗄️ Archivés  4    │  ← sticky
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Quick action cards (header, repensées)

Les 3 quick actions actuelles (Create / Send / View history) sont remplacées par **2 cards** plus actionnables :

```
┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
│  ✏️  Créer un modèle                │  │  📨  Envoyer un mail maintenant     │
│                                     │  │                                     │
│  Ajoute un nouveau template à ta    │  │  Choisis un destinataire et un      │
│  bibliothèque MR Formation.         │  │  template, ou écris tout à la main. │
│                                     │  │                                     │
│  [Catégorie : Custom] ▼             │  │  [Apprenant ▼] [Template ▼]         │
└─────────────────────────────────────┘  └─────────────────────────────────────┘
```

Look : emerald-50 border emerald-200 (= même style que `/admin/documents` quick action "Envoyer à un apprenant" déjà patché en V2.2).

Différence vs actuel : on **supprime** la card "View history" car l'onglet sticky le fait déjà — duplication inutile. On **enrichit** "Créer" avec un pré-filtre de catégorie (Loris sait souvent dès le départ s'il crée une relance ou une campagne).

---

## 5. User flows critiques

### 5.1 Flow J1 — Modifier un template (parcours principal, 90% du trafic)

```
Loris arrive sur /admin/emails (tab Modèles par défaut)
       │
       ▼
[Vue cards filtrable]  ← scanne visuellement par catégorie/couleur
       │
       │ identifie le template "Relance facture - 1er rappel"
       ▼
[Click sur la card]    ← single click → ouvre le dialog d'édition
       │               ← (PAS de menu "..." à 2 clicks — direct edit)
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Dialog Édition (max-w-7xl, 3 colonnes)                     │
│                                                              │
│  [GAUCHE]              [CENTRE]               [DROITE]       │
│  Métadonnées           Éditeur                Preview live   │
│  + Usage panel         (Tiptap + InsertVar)   sur contexte   │
│                                                réel + Usage  │
└─────────────────────────────────────────────────────────────┘
       │
       │ Loris voit en haut à gauche : "⚠️ Utilisé par 3 automations actives"
       │ Click sur le badge → expand le panel Usage (liste des 3 rules)
       │
       ▼
[Modifie le subject ou body]
       │
       │ Preview live à droite met à jour en temps réel avec variables résolues
       │ (Loris a choisi un cas réel : Session "Habilitation B2 - juin 2026" + apprenant J. Dupont)
       │
       ▼
[Click "Enregistrer"]
       │
       │ Si template utilisé par automations actives :
       │   → Confirm modal "Ce template est utilisé par 3 automations. Modifier ?"
       │   → Bouton primary : "Oui, enregistrer" (default focus)
       │   → Bouton secondary : "Annuler"
       │
       ▼
✅ Toast "Template enregistré. Les prochains envois utiliseront cette version."
       │
       ▼
Retour à la vue cards. La card modifiée a un indicateur "Modifié à l'instant" pendant 30 sec.
```

**Time on task** : 30-60 sec si modification mineure, jusqu'à 3 min si réécriture complète. ✅ Sous cible.

### 5.2 Flow J5 — Créer un nouveau template

```
Loris clique "Créer un modèle" (quick action card ou bouton "+" dans la vue)
       │
       ▼
[Dialog Création — même layout que Édition, 3 colonnes]
       │
       │ Champs obligatoires marqués * en orange
       │ Catégorie pré-sélectionnée (depuis quick action) ou défaut "Custom"
       │
       ▼
[Bouton secondaire en bas : "Partir d'un modèle existant ▼"]
       │
       │ Click → popover liste des templates de la même catégorie
       │ → Click sur un template → copie subject + body dans l'éditeur
       │
       ▼
[Loris édite, voit preview live, ajoute des variables via InsertVariableButton]
       │
       ▼
[Click "Enregistrer"]
       │
       │ Validation Zod côté client (name obligatoire, subject obligatoire, body non vide)
       │
       ▼
✅ Toast "Modèle créé. Tu peux maintenant l'utiliser dans une automation ou un envoi."
       │
       ▼
Retour à la vue cards. La nouvelle card a un highlight border-emerald-400 pendant 30 sec.
```

### 5.3 Flow J6 — Comprendre pourquoi un template ne part pas

```
Loris se rend dans Historique (tab)
       │
       ▼
[Filter rapide : Status = "Échec"] (chip cliquable au-dessus de la liste)
       │
       ▼
[Liste des emails en échec — 3 entrées récentes]
       │
       │ Chaque ligne montre : destinataire | sujet | template_name | erreur (short)
       │
       ▼
[Click sur une ligne en échec]
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  Detail panel (slide-in droite, pas un dialog full)      │
│                                                           │
│  Email à : jean.dupont@example.com                       │
│  Status : ❌ Échec — "Variable {{nom_client}} non résolue"│
│  Template : Convocation J-7                              │
│  [Voir le template] [Renvoyer manuellement]              │
│                                                           │
│  Body envoyé (capture exacte) ─────                      │
│  Bonjour {{nom_client}}, ...                             │
└──────────────────────────────────────────────────────────┘
```

**Innovation clé** : `email_history.body` archive le **rendu réel** envoyé (variables substituées ou non). Loris voit immédiatement la cause technique sans poser de question à Wissam.

### 5.4 Flow J7 — Dupliquer un template MR → C3V (super_admin uniquement)

```
Loris (super_admin) est sur un template MR
       │
       ▼
[Hover card → menu contextuel "..."]
       │
       ▼
[Click "Dupliquer vers C3V Formation"]
       │
       ▼
[Confirm dialog]
       │
       │ Préviewable : "Une copie sera créée dans C3V Formation avec le même
       │  contenu. Tu pourras l'éditer indépendamment."
       │
       ▼
✅ Toast "Template dupliqué vers C3V. [Voir →]"
       │
       │ Click [Voir →] → bascule l'entité active sur C3V + ouvre la copie
```

### 5.5 Flow archive / restauration

```
[Tab Modèles] → hover card → menu "..." → "Archiver"
       │
       ▼
Si template utilisé par automation active :
  → Modal bloquante "Ce template est utilisé par 3 automations actives.
                     Désactive-les d'abord ou redirige-les vers un autre template."
  → [Voir les automations] (lien profond /admin/emails?tab=automations&template=X)

Sinon :
  → Confirm soft "Archiver ce template ? Il restera dans 'Archivés' et tu pourras le restaurer."
       │
       ▼
[Tab Archivés affiche le template, opacity-60]
       │
       │ Action sur un template archivé : [Restaurer] | [Supprimer définitivement]
       │
       ▼
"Supprimer définitivement" → confirm fort "Cette action est irréversible. L'historique
des mails envoyés via ce template restera consultable, mais le template lui-même
sera perdu. Tape 'supprimer' pour confirmer."
       │
       ▼
[Input texte requis = 'supprimer'] → bouton danger devient actif
```

---

## 6. Wireframes des écrans clés (ASCII)

### 6.1 Vue principale "Modèles" — mode cards (par défaut)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ /admin/emails                                                            [MR ▼]      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ 📂 Modèles    📨 Historique    ⚙️ Automatisations    🗄️ Archivés                    │  sticky
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─ ✏️ Créer un modèle ─────────────┐    ┌─ 📨 Envoyer un mail maintenant ────────┐ │
│  │ Nouveau template dans MR.        │    │ One-shot vers apprenant/client/list.    │ │
│  │ [Catégorie : Custom ▼]           │    │ [Choisir destinataire →]                │ │
│  └──────────────────────────────────┘    └─────────────────────────────────────────┘ │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ 🔍 [Rechercher…]   [Toutes catégories ▼]  [✓ Actifs seulement] [Tri : récent ▼]│    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Affichage : 24 modèles actifs                                  [▦ Cards] [≡ Liste] │
│                                                                                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐                  │
│  │ ⏰ RELANCE                  │  │ ⚙️ AUTOMATISATION           │                  │
│  │ Relance facture - 1er       │  │ Convocation J-7             │                  │
│  │ rappel                      │  │                             │                  │
│  │                             │  │ ⚠️ Utilisé par 3 automations│                  │
│  │ "Bonjour {{client}}, nous…" │  │ "Bonjour {{apprenant}}, …"  │                  │
│  │                             │  │                             │                  │
│  │ Modifié par toi il y a 3j   │  │ Modifié par toi il y a 12j  │                  │
│  │                             │  │                             │                  │
│  │ [Modifier] [⋯]              │  │ [Modifier] [⋯]              │                  │
│  └─────────────────────────────┘  └─────────────────────────────┘                  │
│                                                                                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐                  │
│  │ 📦 ENVOI BATCH              │  │ 📤 TRANSACTIONNEL           │                  │
│  │ Attestation d'assiduité     │  │ Confirmation inscription    │                  │
│  │                             │  │                             │                  │
│  │ "Veuillez trouver ci-joint…"│  │ "Bienvenue {{nom}}…"        │                  │
│  │                             │  │                             │                  │
│  │ Modifié il y a 1 mois       │  │ Modifié il y a 2 semaines   │                  │
│  │                             │  │                             │                  │
│  │ [Modifier] [⋯]              │  │ [Modifier] [⋯]              │                  │
│  └─────────────────────────────┘  └─────────────────────────────┘                  │
│                                                                                      │
│  [Charger plus…]                                                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Détails de la card** :
- **Top-left** : badge catégorie (couleur + emoji). Toujours la première chose vue.
- **Title** : nom du template (font-semibold, truncate à 2 lignes max).
- **Usage warning** : badge orange "⚠️ Utilisé par N automations" SI N ≥ 1 — sinon absent (pas de "0 usages" qui pollue).
- **Preview snippet** : 1ʳᵉ ligne du body en italic gris, 60 chars max truncate.
- **Footer** : audit ("Modifié par toi il y a 3j") + 2 actions ("Modifier" primary + "⋯" menu contextuel).
- **Menu ⋯** : Dupliquer, Archiver, Dupliquer vers C3V (si super_admin), Voir l'historique d'envois.

### 6.2 Vue principale "Modèles" — mode liste (alternative compacte)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Catégorie | Nom                       | Usage | Modifié      | Actions              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ⏰ Relance| Relance facture - 1er     │ —    │ il y a 3j    │ [✎] [⋯]              │
│ ⚙️ Auto.  | Convocation J-7           │ ⚠️ 3 │ il y a 12j   │ [✎] [⋯]              │
│ 📦 Batch  | Attestation d'assiduité   │ —    │ il y a 1 mois│ [✎] [⋯]              │
│ 📤 Trans. | Confirmation inscription  │ —    │ il y a 2 sem.│ [✎] [⋯]              │
│ ⏰ Relance| Relance OPCO              │ ⚠️ 2 │ jamais       │ [✎] [⋯]              │  ← seed jamais touché
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Pour Loris qui veut scanner 24 templates en 5 sec, le mode liste est plus efficace. Toggle persisté en localStorage.

### 6.3 Dialog Édition / Création — layout 3 colonnes

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Modifier le modèle "Convocation J-7"                                                          [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                      │
│  ┌─ MÉTA ─────────────┐  ┌─ ÉDITEUR ────────────────────────────┐  ┌─ PREVIEW LIVE ──────────────┐ │
│  │                     │  │                                       │  │                              │ │
│  │ Catégorie *         │  │ Sujet *                              │  │ Contexte de preview :        │ │
│  │ [⚙️ Automatisation▼]│  │ [Convocation - {{formation}} J-7   ] │  │ [Session ▼] Habilitation B2  │ │
│  │                     │  │                                       │  │ [Apprenant ▼] J. Dupont      │ │
│  │ Nom *               │  │ Variables [📋 Insérer une variable ▼]│  │                              │ │
│  │ [Convocation J-7  ] │  │                                       │  │ ───────────────────────────  │ │
│  │                     │  │ Corps *                              │  │                              │ │
│  │ Destinataire        │  │ ┌─────────────────────────────────┐ │  │ Sujet : Convocation -        │ │
│  │ [Apprenant ▼]       │  │ │ Bonjour {{nom_apprenant}},      │ │  │ Habilitation B2 J-7          │ │
│  │                     │  │ │                                  │ │  │                              │ │
│  │ Pièces jointes      │  │ │ Nous vous rappelons que la       │ │  │ Bonjour Jean Dupont,         │ │
│  │ auto :              │  │ │ formation "{{formation}}"        │ │  │                              │ │
│  │ ☑ Convocation       │  │ │ commence le {{date_debut}} à    │ │  │ Nous vous rappelons que la   │ │
│  │ ☐ Programme         │  │ │ {{lieu}}.                       │ │  │ formation "Habilitation B2"  │ │
│  │ ☐ CGV               │  │ │                                  │ │  │ commence le 15 juin 2026 à   │ │
│  │                     │  │ │ Cordialement,                    │ │  │ Marseille.                   │ │
│  │ Expéditeur          │  │ │ L'équipe MR Formation            │ │  │                              │ │
│  │ (laisser vide       │  │ └─────────────────────────────────┘ │  │ Cordialement,                │ │
│  │  pour utiliser le   │  │                                       │  │ L'équipe MR Formation        │ │
│  │  défaut entité)     │  │ 4 variables détectées ✓             │  │                              │ │
│  │ [Nom expéditeur  ]  │  │                                       │  │ ───────────────────────────  │ │
│  │ [Email expéditeur]  │  │                                       │  │                              │ │
│  │                     │  │                                       │  │ ⚠️ Utilisé par 3 automations │ │
│  │ ⚠️ Usage actuel    │  │                                       │  │ ▼ Voir lesquelles            │ │
│  │ ┌─────────────────┐│  │                                       │  │                              │ │
│  │ │ • Auto. "Convoc │ │  │                                       │  │ Audit :                      │ │
│  │ │   J-7" (active) │ │  │                                       │  │ Créé par toi le 2026-03-12   │ │
│  │ │ • Auto. "Convoc │ │  │                                       │  │ Modifié par toi il y a 12j   │ │
│  │ │   J-3" (active) │ │  │                                       │  │                              │ │
│  │ │ • Batch convoc. │ │  │                                       │  │                              │ │
│  │ │   (utilisé par  │ │  │                                       │  │                              │ │
│  │ │   route admin)  │ │  │                                       │  │                              │ │
│  │ └─────────────────┘│  │                                       │  │                              │ │
│  └─────────────────────┘  └───────────────────────────────────────┘  └──────────────────────────────┘ │
│                                                                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [🗄️ Archiver]                                              [Annuler]  [💾 Enregistrer]            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Détails clés du dialog** :
- **3 colonnes responsive** : `lg` → 3 colonnes (300px + 1fr + 360px). `md` → 2 colonnes (méta empilée au-dessus). `sm` → 1 colonne avec accordéon meta/preview repliés.
- **Preview live** : sélecteurs de contexte en haut (Session + Apprenant) → variables résolues en temps réel. Persistance du contexte choisi en localStorage par user.
- **Usage panel** : toujours visible en méta (gauche). Click sur un item du panel → navigation vers l'automation correspondante (lien profond).
- **Badge "variables détectées ✓"** : compte les `{{xxx}}` du body et valide qu'elles existent dans `template-variables.ts`. Si inconnue → liste les inconnues en orange.
- **Bouton "Archiver"** en bottom-left (action destructive faible), séparé du flux Annuler/Enregistrer.
- **Save** : disabled tant que la validation Zod n'est pas verte.

### 6.4 Vue Historique

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│  ┌─ Filtres rapides ──────────────────────────────────────────────────┐            │
│  │ [Tout] [✓ Envoyé] [⏱ En attente] [❌ Échec ⚠️3] [Aujourd'hui] [...] │            │
│  └─────────────────────────────────────────────────────────────────────┘            │
│                                                                                      │
│  ┌─ Filtres avancés ─────────────────────────────────────────────────┐             │
│  │ 🔍 [destinataire…]  [Template ▼]  [Du ___ au ___]  [Réinitialiser]│             │
│  └────────────────────────────────────────────────────────────────────┘             │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ Status │ Destinataire           │ Sujet                  │ Template     │ Date │   │
│  ├────────┼────────────────────────┼────────────────────────┼──────────────┼──────┤   │
│  │ ✓ Sent │ jean.dupont@…          │ Convocation - Habilit. │ Convoc. J-7  │ 9h12 │   │
│  │ ❌Failed│ marie.test@…           │ Relance facture        │ Relance fact.│ 8h45 │ ◄ │   │
│  │ ⏱ Pend.│ paul.client@…          │ OPCO à déposer         │ OPCO depos.  │ 8h00 │   │
│  │ ✓ Sent │ … 47 lignes            │                        │              │      │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  [Détail panel slide-in à droite quand une ligne est cliquée]                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Vue Automatisations (consolidée)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Sous-tabs : [Relances] [Déclencheurs formation] [Automatisations CRM]              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  📋 Sous-tab "Relances" actif                                                        │
│                                                                                      │
│  ┌─ Relances facture ───────────────────────────────────────────────────┐          │
│  │ ☑ Actif                                                                │          │
│  │                                                                        │          │
│  │ 1ʳᵉ relance — J+7 après date d'échéance                                │          │
│  │   Template lié : [Relance facture - 1er rappel ▼] [Modifier →]        │          │
│  │                                                                        │          │
│  │ 2ᵉ relance  — J+15                                                     │          │
│  │   Template lié : [Relance facture - 2ème rappel ▼] [Modifier →]       │          │
│  │                                                                        │          │
│  │ Relance finale — J+30                                                  │          │
│  │   Template lié : [Mise en demeure ▼] [Modifier →]                     │          │
│  └────────────────────────────────────────────────────────────────────────┘          │
│                                                                                      │
│  [+ Ajouter une règle de relance]                                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Principe** : la config trigger (jours, conditions) vit ici. Le **contenu** du mail (subject/body) vit dans `/admin/emails` tab Modèles. Lien profond bidirectionnel.

### 6.6 Vue Archivés

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│  4 modèles archivés. Ils ne sont plus envoyés mais l'historique reste consultable.  │
│                                                                                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐                  │
│  │ ⏰ RELANCE (archivé)        │  │ ✏️ CUSTOM (archivé)         │                  │
│  │ Ancien rappel facture v1    │  │ Test promo été 2025         │                  │
│  │                             │  │                             │                  │
│  │ Archivé par toi il y a 2 m. │  │ Archivé par toi il y a 8 m. │                  │
│  │                             │  │                             │                  │
│  │ [Restaurer] [Supprimer def.]│  │ [Restaurer] [Supprimer def.]│                  │
│  └─────────────────────────────┘  └─────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Cards en opacity-60. Restaurer = `is_active = TRUE`. Supprimer définitivement = double confirmation avec input texte.

### 6.7 Empty states

```
─── Tab Modèles vide (entité fraîche) ───────────────────────────────────────────────
│
│      📂
│   Aucun modèle d'email pour le moment.
│
│   Au déploiement, MR Formation est livré avec 25 modèles par défaut. Si tu ne les
│   vois pas, c'est un problème de seed — préviens Wissam.
│
│   [✏️ Créer un modèle de zéro]
│

─── Filtre catégorie sans résultat ──────────────────────────────────────────────────
│
│      🔍
│   Aucun modèle "Campagne" dans MR Formation.
│
│   [Réinitialiser les filtres]   [Créer un modèle "Campagne"]
│

─── Tab Archivés vide ───────────────────────────────────────────────────────────────
│
│      🗄️
│   Rien d'archivé pour le moment.
│   Quand tu archiveras un modèle, il apparaîtra ici (et tu pourras toujours le
│   restaurer).
```

---

## 7. Composants UI détaillés (handoff dev)

### 7.1 `<TemplateCard>` (`src/app/(dashboard)/admin/emails/_components/TemplateCard.tsx`)

| Prop | Type | Notes |
|---|---|---|
| `template` | `EmailTemplate` | objet enrichi avec `usage_count` calculé via la vue SQL |
| `viewMode` | `"card" \| "row"` | switch entre les 2 layouts |
| `onEdit` | `() => void` | ouvre le dialog d'édition |
| `onMenuAction` | `(action: 'duplicate' \| 'archive' \| 'duplicate_to_entity' \| 'view_history') => void` | actions du menu ⋯ |

États visuels :
- `is_active = false` → opacity-60, pas d'action edit primary
- `usage_count > 0` → badge orange usage
- `updated_at` < 24h → badge "Modifié à l'instant" pendant 30s après save
- Hover → border-blue-300, shadow-sm

### 7.2 `<TemplateEditDialog>` (composant 3 colonnes)

Structure :
- Header : titre dynamique (Création / Édition de "X")
- Body : 3 colonnes en flexbox responsive
- Footer : actions séparées (Archiver à gauche, Annuler/Enregistrer à droite)

Composants enfants :
- `<MetaPanel>` (gauche) : catégorie, nom, recipient_type, attachments, sender override, usage
- `<EditorPanel>` (centre) : subject input + RichTextEditor (Tiptap réutilisé) + InsertVariableButton (existant)
- `<PreviewPanel>` (droite) : sélecteurs contexte + preview HTML rendered avec `resolveVariables()` côté client

État partagé : `templateForm` (React Hook Form + Zod) + `previewContext` (local state).

### 7.3 `<UsageBadge>` (`_components/UsageBadge.tsx`)

```tsx
<UsageBadge count={3} variant="warning" />
//  →  ⚠️ Utilisé par 3 automations
```

Click → ouvre une `<UsagePopover>` listant les usages avec liens profonds vers chaque automation/règle.

### 7.4 `<CategoryFilter>` (chips)

Liste de chips cliquables, multi-sélection. État persistant en URL params (`?category=reminder,automation`) pour permettre le partage et le bookmark.

### 7.5 `<HistoryDetailPanel>` (slide-in droite, pas full dialog)

Réutilisation du pattern `Sheet` de shadcn/ui (déjà installé). Width 480px desktop, full-width mobile.

### 7.6 `<DuplicateToEntityButton>` (super_admin only)

Conditionnel : `if (userRole === 'super_admin' && entities.length > 1)`. Apparaît dans le menu ⋯ de chaque card.

---

## 8. États et micro-interactions

### 8.1 Loading states

- **Tab change** : skeleton cards (6 cards en placeholder) pendant fetch initial
- **Dialog open** : pas de loader si data déjà en cache, sinon spinner centré
- **Save in progress** : bouton "Enregistrer" → "Enregistrement…" + spinner inline + disabled
- **Preview live** : pas de loader sur recalc variable (instantané côté client)

### 8.2 Warnings et confirmations

| Trigger | UI | Bloquant ? |
|---|---|---|
| Edit template avec usage actif | Banner dans dialog top + confirm modal sur save | Non (warning only) |
| Archive template avec usage actif | Modal bloquante | **Oui** (Loris doit désactiver l'automation d'abord) |
| Delete définitif (depuis archives) | Modal avec input texte "supprimer" | **Oui** (saisie obligatoire) |
| Variable inconnue dans body | Inline warning "❓ {{variable_inconnue}} non reconnue" sous l'éditeur | Non (peut enregistrer quand même) |
| Concurrent edit detected | Toast "Quelqu'un a modifié ce template entre-temps. [Recharger]" | **Oui** (force reload) |
| Quitter sans sauvegarder | Confirm browser-native + custom modal "Modifications non sauvegardées" | **Oui** |

**Concurrent edit detection** : on stocke `updated_at` au load du dialog, on le compare au save (`if .eq("updated_at", initialUpdatedAt) → ok, sinon → 409`).

### 8.3 Feedback positif

- Toast vert succès après save / archive / restore / duplicate
- Highlight 30s sur la card modifiée (border-emerald-400 → fade)

### 8.4 Erreurs

- Erreurs Supabase → toast destructive + log structuré côté client
- Erreurs réseau → retry button dans le toast
- Erreurs validation → inline sous chaque champ (RHF + Zod standard)

---

## 9. Variables et insertion

Le composant `InsertVariableButton` (déjà existant, partagé avec `/admin/documents`) est branché dans la toolbar de Tiptap (déjà fait pour documents — pattern à recopier).

Variables émail-spécifiques (à filtrer via `context: "email"`) :
- `{{nom_apprenant}}`, `{{prenom_apprenant}}`, `{{email_apprenant}}`
- `{{formation}}`, `{{date_debut}}`, `{{date_fin}}`, `{{lieu}}`, `{{horaires}}`
- `{{nom_client}}`, `{{entreprise}}`, `{{date_echeance}}`, `{{montant_ttc}}`
- `{{numero_facture}}`, `{{numero_devis}}`, `{{reference}}`
- `{{sender_name}}` (auto-résolu = entity_name ou override template)
- 83 au total, déjà cataloguées dans `template-variables.ts`

Aucune nouvelle variable à ajouter — on réutilise telle quelle.

---

## 10. Responsive

| Breakpoint | Layout |
|---|---|
| `xl` (≥1280px) | 3-column dialog, 3-column grid cards (24 visibles en 8 rangées) |
| `lg` (≥1024px) | 3-column dialog, 2-column grid cards |
| `md` (≥768px) | 2-column dialog (preview en sous-section repliable), 1-column cards |
| `sm` (<768px) | 1-column dialog (accordéons), liste compacte par défaut (pas cards) |

**Mobile critique** : Loris consulte parfois l'historique depuis iPad. La tab "Historique" doit être 100% utilisable mobile. Édition complète mobile = nice-to-have, pas obligatoire (Loris édite sur Mac dans 95% des cas).

---

## 11. Accessibilité (a11y)

- **Contraste** : tous les badges catégories validés WCAG AA contre fond white/gray-50
- **Focus order** : Catégorie → Nom → Subject → Body → Variables button → Preview context → Save
- **ARIA** : labels explicites sur tous les inputs (`aria-label="Sujet de l'email"`), live region sur le toast (`role="status"` ou `role="alert"` pour erreurs)
- **Keyboard nav** : `⌘+S` (Mac) / `Ctrl+S` (Win) déclenche Save dans le dialog. `Esc` ferme avec confirm si modifs non sauvegardées.
- **Screen reader** : badge usage doit annoncer "3 automations utilisent ce template" (pas juste "3")
- **Reduced motion** : respect `prefers-reduced-motion` sur les transitions cards et confetti

---

## 12. Cohérence avec `/admin/documents`

Patterns réutilisés à l'identique :
- Sticky tabs en haut (composant `EmailsTabsNav` basé sur `DocumentsTabsNav`)
- Quick action cards emerald-50 / border emerald-200
- Dialogs max-w-5xl / max-w-7xl pour les édits complexes
- `InsertVariableButton` dans la toolbar Tiptap
- `RichTextEditor` (Tiptap) — même composant
- Menus "⋯" sur cards avec actions (Modifier / Archiver / Dupliquer)
- Cards avec badge catégorie top-left + footer audit
- Empty states avec emoji XXL + texte court + CTA primary

Patterns nouveaux (à factoriser plus tard si réutilisables) :
- **Vue Mode toggle** (Cards / Liste) → si Loris l'utilise vraiment, à porter sur documents et formations
- **Detail Panel slide-in** (Sheet shadcn) pour l'historique → potentiellement réutilisable pour `/admin/clients` et autres listings
- **Usage badge + popover** → spécifique aux templates pour l'instant

---

## 13. Non-objectifs UX (intentionnellement out-of-scope V1)

- ❌ **Visual builder drag-and-drop type Mailchimp** — Tiptap + variables suffit. ROI faible pour Loris solo, dette UI élevée.
- ❌ **Preview multi-device** (desktop / mobile / dark mode) — le rendu Resend est testable manuellement.
- ❌ **A/B testing intégré** — overkill pour Loris.
- ❌ **Suggestions IA de wording** — joli à montrer mais hors scope, à voir en V2.
- ❌ **Tags / labels custom** sur les templates — `category` enum suffit.
- ❌ **Multi-langue** — MR/C3V envoient en FR uniquement aujourd'hui.
- ❌ **Variables computed live** (= variables calculées à partir d'autres variables) — pas demandé par Loris.
- ❌ **Versioning visuel** (diff entre v1 et v2 d'un template) — `email_history.body` archive le rendu envoyé, c'est suffisant pour audit.

---

## 14. Décisions verrouillées le 2026-05-28

Les 5 questions ouvertes ont été tranchées en session avec Wissam :

1. **Sender override par template** : ✅ **Conservé**. Champs `sender_name`/`sender_email` optionnels positionnés en bas du panel méta gauche (pas primary). Default vide → fallback sender entity. Loris le découvre quand il en a besoin, ignore sinon. Schéma cadrage §4.2 déjà aligné.
2. **Vue Mode toggle (Cards / Liste)** : ✅ **Conservé**. Les deux modes implémentés, toggle persisté en `localStorage`. Default = Cards.
3. **Sub-tab Automatisations** : ✅ **3 sous-tabs distincts** (Relances / Déclencheurs formation / Automatisations CRM). Les triggers sont sémantiquement différents (jours vs enum vs JSONB) — unifier en filter masquerait la séparation des préoccupations.
4. **Confetti à la 1ʳᵉ création** : ❌ **Retiré**. Ton trop "fun startup" pour le contexte LMS / Qualiopi.
5. **Catégorie "Campaign"** : ✅ **Conservée dans le filter** même si Lot E différé. Préparation à l'arrivée future ; cards "Campaign" simplement vides aujourd'hui (empty state explicite).

---

## 15. Prochaines étapes

1. **Validation UX** par Wissam (5 questions ci-dessus)
2. **Architecture** via `bmad-create-architecture` (Winston) — qui doit s'aligner sur :
   - Le schéma cible déjà décrit dans le cadrage §4.2
   - Le composant `<TemplateEditDialog>` 3 colonnes (impact bundle size ?)
   - La vue SQL `email_template_usage` pour le tracking inverse (perf à valider)
3. **PRD** via `bmad-create-prd` (John) — formaliser les acceptance criteria par lot
4. **Epics + stories** via `bmad-create-epics-and-stories` — Lot C devient probablement 4-5 epics (UI refonte, soft-delete, usage tracking, sender override, archive)
5. **Sprint planning** + cycle stories

> **Suggestion Sally** : valider ce UX **avant** PRD, car le PRD doit pouvoir citer les wireframes (sections 5 et 6) comme spec de référence. Inverser l'ordre standard PRD→UX permet ici d'éviter un PRD abstrait qui devra être réécrit après le UX.

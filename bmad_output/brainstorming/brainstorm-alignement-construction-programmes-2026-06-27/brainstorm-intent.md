# Intent — Internaliser la construction des programmes de formation

Contexte : LMS MR Formation / C3V Formation. Plateforme de gestion de formation (LMS + CRM + BPF/Qualiopi). Ce document fige les décisions issues de la session de brainstorming du 2026-06-27 et sert d'input direct à la spec / au dev.

## Problème / intention

Aujourd'hui la construction d'un programme de formation se fait **100 % hors plateforme** : ChatGPT (avec un prompt-type) pour générer le contenu, puis Gamma pour la mise en page propre, puis envoi de la proposition à l'entreprise. La plateforme n'est pas utilisée pour ça.

On veut **internaliser** ce travail (contenu + mise en page) pour remplacer ChatGPT + Gamma, sans créer de doublon avec ce qui existe déjà côté plateforme (modèle de données programme/session, route de génération IA, template PDF).

## Le breakthrough

La construction de programme est **d'abord un ACTE COMMERCIAL** : c'est un document de vente produit avant signature, pas un livrable pédagogique. Cette lecture justifie sa présence côté CRM/prospect et **dissout le faux problème de « doublon »** : ce n'est pas deux fonctionnalités concurrentes, c'est un même moteur servi à deux moments (proposition prospect, puis programme de la formation signée).

## Décisions verrouillées

1. **Objectif** : remplacer ChatGPT + Gamma par un générateur interne. Le générateur est un **outil autonome réutilisable**, pas une fonctionnalité enfouie dans un seul écran.
2. **Mise en page** : un **template PDF interne 4 pages**, un seul habillage standard. Pas de choix de couleur, pas de logique couleur, pas d'éditeur de mise en page interactif. La qualité visuelle cible = les 2 PDF exemples fournis (« Bien installer le résident » 14h, vert, et « Communication managériale Niveau 2 » 14h, bleu). Si la plateforme sort exactement ce niveau, Gamma est supprimé (zéro retouche côté client aujourd'hui, donc un template propre suffit).
3. **Contenu** : génération **IA** à partir du **prompt-type fourni par le client**, paramétré. Le nom et la durée sont **pré-remplis automatiquement** depuis la formation ; un **champ libre optionnel « précisions »** couvre les cas particuliers (ex : DPC/TP, public cible spécifique).
4. **Flux quasi un-clic** : générer → relecture rapide à l'écran → bouton **Régénérer** + correction manuelle légère possible → **Générer le PDF**. Filet de sécurité léger, pas d'éditeur lourd : le 1er jet est généralement le bon.
5. **Un seul chemin de création** : l'IA **remplace** la saisie manuelle séquence-par-séquence. La logique de lien programme → session existante est **conservée telle quelle** (le modèle de données ne change pas, seule la façon de créer le contenu change).
6. **Deux points d'entrée** pour le même générateur : (a) côté **CRM / prospect** comme document de vente, et (b) dans l'**onglet Programme d'une formation**.
7. **Pas de report automatique prospect → formation**. Raisons : le programme peut changer entre la proposition et la formation réelle ; un prospect peut donner plusieurs formations (pas de 1:1) ; le lien prospect↔formation n'est pas propre. La reprise reste **manuelle / explicite**, jamais automatique.

## Modèle de données — comment le lien se fait

- Une **session n'est jamais reliée directement à un programme**.
- Chaîne réelle : `session.training_id` → `training.program_id` → `programs`.
- Le point d'accrochage du programme est donc la **FORMATION (training)**, pas la session. Les sessions héritent du programme via leur training, automatiquement.
- Scénario « vendu en amont » : on rattache le programme au moment de **créer la formation** (set `training.program_id`). Geste manuel volontaire ; les sessions suivent seules.

## Décision tranchée — Option B

À la génération côté prospect : **sauver une vraie ligne `programs` « flottante »** (non rattachée à une formation) **+ le PDF de vente**. À la signature, on la **rattache à la formation d'un clic** (set `training.program_id`).

- On **génère UNE fois**, puis on rattache. **Pas de régénération** au passage prospect → formation.
- Cela **nécessite d'ajouter un lien / stockage programme ↔ prospect qui n'existe pas aujourd'hui** → point à concevoir en spec.

## Existant à réutiliser / ne pas doublonner

L'objectif est d'**aligner et réutiliser** ces briques existantes, pas d'en créer des parallèles :

- Route `api/ai/generate-program` (`generateStructuredProgram` via OpenAI) — moteur de génération de contenu.
- Template `programme-formation.ts` — PDF 4 pages déjà existant.
- Onglet `TabProgramme` — point d'entrée côté formation.

## Questions ouvertes pour la spec

- **Stockage du programme flottant côté prospect** : où exactement matérialiser le lien `programs` ↔ prospect (nouvelle colonne, table de liaison, champ sur le prospect) ? C'est le principal manque structurel.
- **Modèle exact du prompt** à injecter : confirmer le prompt-type client comme system prompt, et son paramétrage (nom / durée / précisions).
- **Normes à gérer via le champ « précisions »** : quelles normes DPC / TP (et autres) doivent être prises en compte, et comment.
- Vérifier que la sortie du template PDF interne atteint réellement la qualité des 2 exemples avant de supprimer Gamma.

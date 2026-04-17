# Checklist Recette — LMS MR Formation / C3V Formation

> Date de génération : 2026-04-17
> Version : V1 Post-Vague 4

---

## 1. Authentification & Sécurité

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 1.1 | Login admin | Se connecter avec admin@mrformation.fr | Redirection vers /select-entity puis /admin | |
| 1.2 | Login mauvais mot de passe | Mot de passe incorrect | Message d'erreur, pas de connexion | |
| 1.3 | Sélection entité | Cliquer sur MR FORMATION | Dashboard admin MR FORMATION | |
| 1.4 | Sélection entité C3V | Cliquer sur C3V FORMATION | Dashboard admin C3V | |
| 1.5 | Page publique /sign | Accéder /sign/token sans auth | Page chargée (pas redirect login) | |
| 1.6 | Page publique /emargement | Accéder /emargement/token sans auth | Page chargée (pas redirect login) | |
| 1.7 | API non-auth | GET /api/clients sans cookie | 401 JSON | |
| 1.8 | Accès admin par trainer | Trainer accède /admin/clients | Redirigé vers / | |
| 1.9 | Accès CRM par client | Client accède /admin/crm | Redirigé vers / | |
| 1.10 | Reset password | Cliquer "Mot de passe oublié" | Page reset accessible | |

## 2. CRM — Pipeline & Prospects

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 2.1 | Pipeline Kanban | Accéder /admin/crm | Colonnes pipeline visibles | |
| 2.2 | Créer prospect | Bouton "Nouveau prospect" | Dialog création, champ entreprise requis | |
| 2.3 | Enrichir Pappers | Bouton "Enrichir via Pappers" (si SIRET) | Données entreprise récupérées | |
| 2.4 | Score prospect | Vérifier badge score coloré | Score affiché, couleur cohérente | |
| 2.5 | Fiche prospect | Cliquer sur un prospect | Page détail avec boutons action | |
| 2.6 | Actions Email/Devis/Note | Cliquer chaque bouton | Dialog/redirection correspondante | |
| 2.7 | Modifier prospect | Bouton Modifier → edit form | Champs éditables, sauvegarde OK | |
| 2.8 | Adresse prospect | Vérifier champs adresse/ville/CP | Champs visibles et éditables | |
| 2.9 | Convertir en client | Status "won" → bouton Convertir | Client créé, redirection fiche client | |
| 2.10 | Scoring triable | Colonne score dans la liste | Tri par score fonctionne | |
| 2.11 | Email IA | Bouton "Rédiger avec l'IA" | Dialog avec 6 types de contexte | |
| 2.12 | Caractères spéciaux | Nom entreprise avec &, ', accents | Sauvegarde et affichage corrects | |

## 3. Devis

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 3.1 | Créer devis | /admin/crm/quotes/new | Formulaire avec lignes produits | |
| 3.2 | Lignes produits | Ajouter/supprimer des lignes | Calcul totaux HT/TVA/TTC auto | |
| 3.3 | SearchSelect programme | Chercher un programme | Résultats autocomplete | |
| 3.4 | Référence auto | Champ référence pré-rempli DEV-2026-XXX | Format correct | |
| 3.5 | Sauvegarde | Cliquer "Créer le devis" | Devis créé, redirection | |
| 3.6 | Mode édition | ?edit=ID dans URL | Données rechargées correctement | |
| 3.7 | Montant 0 lignes | Créer devis sans aucune ligne | Message erreur validation | |
| 3.8 | Devis client | ?client_id=ID dans URL | Nom client pré-rempli | |
| 3.9 | PDF download | Télécharger le PDF | Fichier .pdf téléchargé | |
| 3.10 | Changement statut | Menu → Envoyer/Accepter | Statut mis à jour | |
| 3.11 | Signature électronique | Envoyer pour signature | Lien signature envoyé par email | |
| 3.12 | Notes & mentions | Section collapsible | Mention légale pré-remplie | |

## 4. Formations

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 4.1 | Liste formations | /admin/trainings | Cards formations affichées | |
| 4.2 | Toggle Kanban | Cliquer icône Kanban | 3 colonnes : À venir/En cours/Terminée | |
| 4.3 | Créer session | Bouton "Planifier" | Form inline avec titre, dates, mode | |
| 4.4 | Type INTRA/INTER | Select type dans le formulaire | Labels corrects | |
| 4.5 | Checkbox sous-traitance | Cocher "Sous-traitance" | Message automatisation affiché | |
| 4.6 | SearchSelect programme | Chercher un programme | Autocomplete fonctionne | |
| 4.7 | Pastille Qualiopi | Cards avec score > 0 | Pastille colorée visible | |
| 4.8 | Bouton Terminer (Kanban) | Cliquer "Terminer" sur carte en cours | Carte passe dans "Terminée" | |
| 4.9 | Fiche formation | Cliquer sur une carte | 6 onglets visibles | |
| 4.10 | Formateurs SearchSelect | Ajouter un formateur | Dialog avec recherche autocomplete | |
| 4.11 | Apprenants SearchSelect | Ajouter un apprenant | Dialog avec recherche autocomplete | |
| 4.12 | Créer apprenant inline | Bouton "Créer un apprenant" | Dialog prénom/nom/email | |
| 4.13 | Auto-lien INTRA | Ajouter apprenant en INTRA | client_id auto-rempli | |
| 4.14 | Entreprises SearchSelect | Ajouter une entreprise | Dialog avec recherche autocomplete | |
| 4.15 | Formations fiche client | Aller dans fiche client → Formations | Sessions via enrollments ET formation_companies | |
| 4.16 | Dates sans décalage | Créer créneaux 9h-17h | Affichage correct (pas 11h-19h) | |
| 4.17 | Date fin avant début | Date fin < date début | Message erreur validation | |

## 5. Qualiopi

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 5.1 | Onglet Qualiopi | Cliquer sur l'onglet | Score global + checklist | |
| 5.2 | Pastilles couleur | Vérifier les pastilles | Rouge (0-33%), Orange (34-66%), Vert (67%+) | |
| 5.3 | Auto-détection convention | Convention signée en base | Item coché automatiquement | |
| 5.4 | Auto-détection convocation | Convocations envoyées | Item coché automatiquement | |
| 5.5 | Items sous-traitance | Formation sous-traitée | 3 items supplémentaires affichés | |
| 5.6 | Checkbox manuelle | Cocher "Documents post-formation reçus" | Sauvegardé en base | |
| 5.7 | Score persiste | Recharger la page | Score identique | |

## 6. Documents & Conventions

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 6.1 | Docs apprenant | Onglet Documents | Convocation, Certificat, Attestation, Émargement | |
| 6.2 | Pas de micro-certificat | Vérifier docs apprenant | Micro-certificat absent | |
| 6.3 | Docs entreprise | Section entreprise | Convention, Émargement collectif | |
| 6.4 | Docs formateur | Section formateur | Convention intervention, Contrat sous-traitance | |
| 6.5 | Auto-confirmation CGV | Docs CGV/Politique/Règlement/Programme | Badge "Confirmé" dès création | |
| 6.6 | Confirmer document | Bouton "Confirmer" | Badge passe à "Confirmé" | |
| 6.7 | Réinitialiser confirmation | Bouton undo | Badge revient à "Non confirmé" | |
| 6.8 | Envoyer pour signature | Convention confirmée → bouton signature | Email envoyé avec lien | |
| 6.9 | Code couleur | Bordure gauche par type | Bleu convocation, Vert certificat, Violet convention | |
| 6.10 | PDF preview | Bouton "Voir" | Aperçu HTML du document | |

## 7. Facturation

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 7.1 | Créer facture | Onglet Finances → Facture | Dialog avec lignes de produits | |
| 7.2 | Pré-remplir lignes | Bouton "Pré-remplir" | Lignes depuis données session | |
| 7.3 | Ajouter/supprimer lignes | Boutons + / × | Calcul totaux mis à jour | |
| 7.4 | Référence externe | Champ N° commande client | Sauvegardé correctement | |
| 7.5 | Auto-génération | Formation completed → Auto-générer | Factures créées automatiquement | |
| 7.6 | PDF facture | Télécharger PDF | PDF avec lignes de produits | |
| 7.7 | Marquer payée | Bouton "Payée" | Statut mis à jour | |
| 7.8 | Page globale factures | /admin/reports/factures | KPIs + liste + filtres | |
| 7.9 | Sessions cliquables | Cliquer nom formation | Redirige vers /admin/formations/[id] | |
| 7.10 | Facture montant négatif | Tenter montant < 0 | Message erreur ou montant absolu | |

## 8. Emails

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 8.1 | Page emails | /admin/emails | Interface email visible | |
| 8.2 | Composer email | Bouton Composer → dialog | Champs To, Objet, Corps | |
| 8.3 | Prévisualiser | Bouton "Prévisualiser" | Modal avec rendu FROM/TO/Objet/Corps | |
| 8.4 | Variables non résolues | Taper {{nom}} sans contexte | Warning variables non résolues | |
| 8.5 | Historique emails | Liste des emails envoyés | Tableau avec dates, destinataires, statuts | |

## 9. Formateurs

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 9.1 | Fiche formateur | Cliquer sur un formateur | 4 onglets : Profil, Documents, Compétences, Sessions | |
| 9.2 | Champ NDA | Section Informations juridiques | Champ NDA visible et éditable | |
| 9.3 | Upload document | Onglet Documents → Ajouter | Upload fichier avec type (URSSAF, NDA, Diplôme) | |
| 9.4 | Liste documents | Après upload | Document affiché avec type, nom, date | |

## 10. Tâches

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 10.1 | Page tâches | /admin/crm/tasks | Liste de tâches | |
| 10.2 | Clic tâche prospect | Cliquer une tâche liée prospect | Redirige vers fiche prospect | |
| 10.3 | Clic tâche client | Cliquer une tâche liée client | Redirige vers fiche client | |
| 10.4 | Clic tâche sans lien | Cliquer une tâche sans prospect/client | Ouvre édition inline | |

## 11. Automatisations

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 11.1 | Destinataires | Créer règle avec type "companies" | Emails envoyés aux entreprises liées | |
| 11.2 | Triggers | Vérifier les 5 types de triggers | Tous fonctionnels | |

## 12. Veille

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 12.1 | Page veille | /admin/veille | Actualités RSS + Notes | |
| 12.2 | Analyse IA | Bouton "Analyser avec l'IA" | Card analyse avec recommandations | |
| 12.3 | Cache analyse | Recharger la page | Dernière analyse toujours visible | |

## 13. Multi-Entité

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 13.1 | Isolation clients | Admin MR → voir clients | Seulement clients MR FORMATION | |
| 13.2 | Isolation prospects | Admin MR → voir prospects | Seulement prospects MR FORMATION | |
| 13.3 | Isolation sessions | Admin MR → voir formations | Seulement formations MR FORMATION | |
| 13.4 | Switch entité | Se déconnecter → reconnecter → C3V | Données C3V uniquement | |

## 14. Cas Limites

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 14.1 | Champs vides obligatoires | Soumettre formulaire vide | Messages d'erreur sur champs requis | |
| 14.2 | Caractères spéciaux | Nom avec &, ', ", accents, émojis | Sauvegarde et affichage corrects | |
| 14.3 | SIRET invalide | Entrer 5 chiffres au lieu de 14 | Pas de crash (validation côté client) | |
| 14.4 | Email invalide | "not-an-email" | Validation HTML5 bloque | |
| 14.5 | Formation sans apprenant | Ouvrir une formation vide | Message "Aucun apprenant inscrit" | |
| 14.6 | Facture sur non-completed | Tenter auto-generate sur formation "upcoming" | Refusé ou message | |

## 15. Responsive

| # | Cas de test | Action | Résultat attendu | ✅/❌ |
|---|------------|--------|-----------------|------|
| 15.1 | Dashboard mobile | 375px viewport | Layout adapté, pas de scroll horizontal | |
| 15.2 | Pipeline mobile | 375px viewport | Colonnes scrollables | |
| 15.3 | Fiche formation mobile | 375px viewport | Onglets fonctionnels | |
| 15.4 | Sidebar mobile | 375px viewport | Menu hamburger ou drawer | |

---

> **Total : 114 cas de test manuels**
> Complémente les ~160 tests automatisés (unitaires + E2E + RLS)

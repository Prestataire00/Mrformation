# Checklist de tests manuels — MR Formation LMS

> Date de création : 2026-03-30
> Testeur : _______________
> Environnement : Production (Netlify)
> URL : _______________

---

## 1. Authentification

- [ ] Connexion admin — email + mot de passe → redirige vers /admin
- [ ] Connexion formateur — redirige vers /trainer
- [ ] Connexion apprenant — redirige vers /learner
- [ ] Connexion client — redirige vers /client
- [ ] Déconnexion — retour à la page login
- [ ] Sélection entité MR FORMATION — couleur rouge #374151 dans la sidebar
- [ ] Sélection entité C3V FORMATION — couleur bleue #2563EB dans la sidebar
- [ ] Accès refusé si un apprenant tente /admin → redirection
- [ ] Accès refusé si un formateur tente /admin/users → redirection
- [ ] Reset password — email de réinitialisation reçu

---

## 2. CRM — Prospects & Pipeline

- [ ] Créer un prospect depuis le Kanban — card apparaît dans la colonne "Lead"
- [ ] Changer statut prospect par drag-and-drop — card se déplace
- [ ] Fiche prospect — onglets Tâches, Commentaires, Emails, Historique visibles
- [ ] Créer une tâche depuis la fiche prospect — apparaît dans l'onglet
- [ ] Ajouter un commentaire — apparaît avec date et auteur
- [ ] Envoyer un email depuis la fiche prospect — apparaît dans l'historique
- [ ] Prix affiché sur la card Kanban — vert si montant > 0, gris si 0
- [ ] Total par colonne Kanban calculé correctement
- [ ] Export Excel prospects — fichier .xlsx téléchargé avec 8 colonnes
- [ ] Filtre par statut — liste filtrée correctement
- [ ] Filtre par source — liste filtrée correctement
- [ ] Filtre par assigné — liste filtrée correctement
- [ ] Filtre par date (du/au) — résultats dans la plage
- [ ] Filtre par montant minimum — résultats filtrés côté client

---

## 3. CRM — Devis

- [ ] Créer un devis depuis /admin/crm/quotes/new — référence auto-générée M-FAC-XXX
- [ ] Ajouter des lignes (description, quantité, prix unitaire) — total calculé
- [ ] Télécharger PDF devis — bouton "PDF" visible dans le tableau
- [ ] PDF contient les bonnes infos société (MR FORMATION ou C3V selon entité)
- [ ] Envoyer devis par email — dialog avec destinataire pré-rempli + PDF joint
- [ ] Vérifier email reçu avec PDF en pièce jointe
- [ ] Changer statut devis : draft → sent → accepted
- [ ] Convertir devis accepté en formation — bouton "Créer une formation" visible
- [ ] Dialog de conversion affiche le résumé (dates, client, montant)
- [ ] Formation créée avec les données pré-remplies du devis
- [ ] Bouton "Voir la formation créée" apparaît après conversion

---

## 4. CRM — Dashboard

- [ ] 5 KPI principaux affichés (prospects, gagnés, conversion, CA, pipeline)
- [ ] 4 KPI tâches (dues, retard, rappels actifs, complétées)
- [ ] 3 KPI avancés (taille deal, cycle vente, taux perte)
- [ ] Graphique funnel de conversion — barres horizontales
- [ ] Graphique pipeline devis — camembert
- [ ] Graphique revenus mensuels — barres vertes (6 mois)

---

## 5. CRM — Tâches & Rappels

- [ ] Section "Rappels" visible dans /admin/crm/tasks entre "En retard" et "Aujourd'hui"
- [ ] Badge nombre de rappels affiché
- [ ] KPI "Rappels actifs" dans le dashboard CRM
- [ ] Notification task_reminder dans le panel notifications (cloche)
- [ ] Créer une tâche avec date de rappel — apparaît dans la section Rappels

---

## 6. CRM — Campagnes Email

- [ ] Créer une campagne — nom, objet, contenu
- [ ] Segmentation "Tous les prospects" — compteur affiche le nombre
- [ ] Segmentation "Par code NAF" — filtre actif
- [ ] Segmentation "Segment personnalisé" — rule builder fonctionnel
- [ ] Programmer une campagne (date future) — statut "Planifiée"
- [ ] Envoyer une campagne — confirmation requise, sent_count incrémenté

---

## 7. CRM — Formulaires

- [ ] Page /admin/crm/formulaires accessible — liste des questionnaires
- [ ] Attribuer un questionnaire à une formation — dialog avec select session
- [ ] Envoyer un questionnaire par email — segmentation tous/entreprise/individuel
- [ ] Email reçu avec lien vers le questionnaire

---

## 8. CRM — Suivi Commercial

- [ ] Page /admin/crm/suivi accessible — timeline d'actions
- [ ] 4 KPI (actions, appels, emails, relances) affichés
- [ ] Filtres type/date/recherche fonctionnels
- [ ] Créer une action commerciale — apparaît dans la timeline

---

## 9. Clients & Apprenants

- [ ] Créer un client/entreprise — formulaire complet
- [ ] Fiche client : onglets Tâches, Commentaires, Emails, Contacts visibles
- [ ] Modifier fiche client — champs téléphone, email, OPCO, financement, BPF, pays
- [ ] Ajouter un contact à un client — nom, email, téléphone, poste, is_primary
- [ ] Créer un apprenant — bouton "+ Ajouter un apprenant" sur la liste
- [ ] Modifier fiche apprenant — champs date naissance, genre, nationalité, adresse, n° sécu, niveau
- [ ] Envoi email individuel (icône Mail par ligne) — dialog s'ouvre
- [ ] Sélection multiple (checkboxes) + barre flottante — "X apprenants sélectionnés"
- [ ] Envoi email en masse — dialog template/libre, toast résumé
- [ ] Export Excel apprenants — fichier .xlsx téléchargé

---

## 10. Formateurs

- [ ] Liste formateurs — recherche, pagination
- [ ] CVthèque — filtres compétences
- [ ] Fiche formateur — sections juridique, adresse, bancaire visibles
- [ ] Modifier SIRET, statut juridique, IBAN — sauvegarde OK
- [ ] Bouton "Envoyer un email" dans le header — dialog template/libre
- [ ] Email reçu par le formateur

---

## 11. Certificateurs

- [ ] Page /admin/certificateurs accessible
- [ ] Créer un certificateur (RNCP, CQP, RS, Titre Pro)
- [ ] Modifier / supprimer un certificateur
- [ ] Filtres type + actifs uniquement
- [ ] Export Excel certificateurs

---

## 12. Formations — Fiche formation

- [ ] 13 onglets visibles : Résumé, Planning, Parcours, Émargements, Absences, Docs Partagés, Messagerie, Programme, Évaluation, Satisfaction, Convention, Finances, e-Learning

### Résumé
- [ ] Prix total et heures éditable
- [ ] Entreprises + financeurs affichés

### Planning
- [ ] Créer des créneaux demi-journées (BulkSlotCreator)
- [ ] Calendrier semaine/mois affiché

### Émargements
- [ ] Générer QR codes — dialog avec vraies images QR (pas du texte)
- [ ] Exporter QR en PDF — une page par créneau
- [ ] Imprimer feuille vide — HTML avec tableau
- [ ] Cocher présences en masse — bouton par créneau, dialog confirmation
- [ ] Signer pour un apprenant (admin) — pad signature fonctionnel

### Absences
- [ ] Ajouter une absence manuellement
- [ ] Détecter absences automatiquement — bouton, dialog, toast résumé
- [ ] Absences créées avec status "unjustified" et reason auto

### Messagerie
- [ ] Envoyer email individuel par apprenant
- [ ] Envoyer email en masse (template)
- [ ] Programmer un email (date future) — status "pending" en base
- [ ] Email programmé envoyé par le cron (vérifier email_history)

### Convention & Documents
- [ ] Bouton "Voir" — preview HTML dans dialog
- [ ] Bouton "Télécharger PDF" — PDF généré et téléchargé
- [ ] Bouton "Confirmer" — statut passe à CONFIRMÉ
- [ ] Bouton "Envoyer" — email envoyé, statut ENVOYÉ
- [ ] Statuts affichés : (NON CONFIRMÉ - NON ENVOYÉ) ou (CONFIRMÉ - ENVOYÉ)

### Finances
- [ ] 4 KPI stats (facturé, payé, attente, retard)
- [ ] Créer facture apprenant — référence auto FAC-1
- [ ] Créer facture entreprise — même logique
- [ ] Créer facture financeur — même logique
- [ ] Marquer payée — statut passe à "paid"
- [ ] Créer un avoir — montant négatif, préfixe AV
- [ ] Ajouter une charge — label + montant
- [ ] Modifier le préfixe — aperçu live FAC-1 → MFAC-1
- [ ] Total charges affiché en bas

### e-Learning
- [ ] Créer un cours (si OPENAI_API_KEY configurée)
- [ ] Assigner un cours à une formation

---

## 13. Automatisation Formations

- [ ] Page /admin/trainings/automation — 4 règles par défaut affichées
- [ ] Bandeau amber "Réglages par défaut" si non sauvegardé
- [ ] Enregistrer — bandeau vert "activée"
- [ ] Modifier days_offset — sauvegarde OK
- [ ] Activer/désactiver une règle (switch)
- [ ] Exécuter maintenant — toast résumé emails

---

## 14. Emails — Page admin

- [ ] Créer un modèle email avec variables {{nom_apprenant}}
- [ ] Prévisualisation temps réel (colonne droite)
- [ ] Insertion variable au curseur (pas en fin de texte)
- [ ] Envoyer un email — sélection contexte (session, client, apprenant)
- [ ] Variables résolues dans le preview
- [ ] Blocage envoi si variables non résolues — toast rouge
- [ ] Bandeau rouge "Variables non résolues — l'envoi est bloqué"
- [ ] Détail email — corps HTML rendu correctement
- [ ] Bouton "Renvoyer" pour email failed
- [ ] Bouton "Envoyer maintenant" pour email pending

---

## 15. Documents — Page admin

- [ ] 5 modèles par défaut visibles (Convention, Convocation, Certificat, Attestation, Émargement)
- [ ] Bouton "Utiliser" — ouvre dialog génération
- [ ] Sélectionner session + client + apprenant → variables résolues
- [ ] Générer document — sauvegardé dans generated_documents
- [ ] Télécharger en PDF — PDF téléchargé

---

## 16. Suivis & Bilans

- [ ] Suivi des Absences — tableau avec stats %
- [ ] Amélioration Continue — accessible depuis sidebar
- [ ] Suivi Commercial — timeline actions
- [ ] Incidents Qualité — page accessible
- [ ] BPF — formulaire complet avec sections A-G
- [ ] BPF + E-Learning — page accessible
- [ ] Suivi des Factures — stats + filtres + tableau + export Excel
- [ ] Affacturage — créer un lot, sélectionner factures, taux d'avance
- [ ] Qualité — multi-indicateurs, graphiques

---

## 17. Questionnaires & Satisfaction

- [ ] Créer un questionnaire (satisfaction/evaluation/survey)
- [ ] Ajouter des questions (rating, texte, choix multiple, oui/non)
- [ ] Distribuer à une formation
- [ ] Dashboard satisfaction — KPI, couverture Qualiopi
- [ ] Apprenant peut remplir le questionnaire
- [ ] Réponses visibles dans les stats admin

---

## 18. Vue Formateur (/trainer)

- [ ] Dashboard — stats sessions, planning semaine
- [ ] Planning — calendrier hebdomadaire
- [ ] Sessions — liste avec filtres
- [ ] Signature session — pad signature multi-créneaux
- [ ] Cours & documents — 3 onglets
- [ ] Contrats — liste avec téléchargement
- [ ] Tâches — CRUD complet
- [ ] Évaluations — satisfaction apprenants + questionnaires à remplir
- [ ] Sidebar — "Évaluations" avec icône Star visible

---

## 19. Vue Apprenant (/learner)

- [ ] Dashboard — profil, inscriptions, certificats
- [ ] Mes Formations — groupement par formation
- [ ] E-Learning — catalogue + player (slides, quiz, flashcards, exam)
- [ ] Calendrier — vues mois/semaine/jour, export iCal
- [ ] Questionnaires — liste + formulaire multi-type
- [ ] Contacts — entité + formateurs
- [ ] Mes Documents — docs confirmés en lecture seule, preview HTML, PAS de PDF
- [ ] Sidebar — "Mes Documents" avec icône FileText visible

---

## 20. La Veille Réglementaire

- [ ] Page /admin/veille accessible
- [ ] Flux RSS — articles ou fallback liens directs
- [ ] Ajouter une note de veille — titre, contenu, source, URL
- [ ] Supprimer une note — confirmation

---

## 21. Contact & Conseils

- [ ] Page /admin/contact-conseils accessible
- [ ] Section IA INFINITY — bouton mailto fonctionne
- [ ] 6 liens ressources — s'ouvrent dans un nouvel onglet
- [ ] 6 conseils Qualiopi affichés

---

## 22. Support

- [ ] Page /admin/support — bouton "Contacter le support"
- [ ] Couleur bouton #3DB5C5
- [ ] Mailto acces.prestataires@i-a-infinity.com

---

## 23. Emails Réels (Resend)

- [ ] Envoyer un email de test — vérifier réception en boîte
- [ ] FROM = "MR Formation <noreply@mrformation.fr>" pour MR
- [ ] FROM = "C3V Formation <noreply@c3vformation.fr>" pour C3V
- [ ] Aucune variable {{}} visible dans l'email reçu
- [ ] PDF en pièce jointe (devis) — fichier ouvrable
- [ ] Email programmé — reçu après le cron (max 1h de délai)

---

## 24. Sécurité

- [ ] Pas de clé API dans le code source (script audit = PASS)
- [ ] Routes API protégées (script audit = PASS)
- [ ] 0 erreur TypeScript (script audit = PASS)
- [ ] RLS Supabase — un apprenant ne voit que ses données
- [ ] Un formateur ne peut pas modifier un autre formateur

---

## Résumé

| Module | Tests | Passés | Échoués |
|--------|-------|--------|---------|
| Auth | 10 | | |
| CRM Prospects | 14 | | |
| CRM Devis | 11 | | |
| CRM Dashboard | 6 | | |
| CRM Tâches | 5 | | |
| CRM Campagnes | 6 | | |
| CRM Formulaires | 4 | | |
| CRM Suivi | 4 | | |
| Clients & Apprenants | 10 | | |
| Formateurs | 6 | | |
| Certificateurs | 5 | | |
| Formations (13 onglets) | 30 | | |
| Automatisation | 6 | | |
| Emails admin | 10 | | |
| Documents admin | 5 | | |
| Suivis & Bilans | 9 | | |
| Questionnaires | 6 | | |
| Vue Formateur | 9 | | |
| Vue Apprenant | 8 | | |
| La Veille | 4 | | |
| Contact & Conseils | 3 | | |
| Support | 3 | | |
| Emails Resend | 6 | | |
| Sécurité | 5 | | |
| **TOTAL** | **183** | | |

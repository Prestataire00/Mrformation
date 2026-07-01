# Variables Catalog — Sellsy aliases `[%Var%]`

Auto-synced from `src/lib/utils/resolve-variables.ts` `ALIAS_TO_VARIABLE_KEY` map.
**Last sync** : 2026-07-01

When creating a new template, use these `[%Var%]` placeholders. The resolver converts them to actual values at PDF generation time.

---

## 🏢 Organisme de formation

Loaded automatically via `loadEntitySettings(supabase, profile.entity_id)`. Multi-tenant (MR + C3V).

| Alias | Tech key | Notes |
|---|---|---|
| `[%Nom de l'organisme%]` | `{{nom_organisme}}` | ex: "MR FORMATION" |
| `[%Adresse de l'organisme%]` | `{{adresse_organisme}}` | Adresse complète |
| `[%Ville de l'organisme%]` | `{{ville_organisme}}` | ex: "Marseille" |
| `[%NDA de l'organisme%]` | `{{nda_organisme}}` | Numéro de déclaration d'activité |
| `[%SIRET de l'organisme%]` | `{{siret_organisme}}` | |
| `[%Email de l'organisme%]` | `{{email_organisme}}` | |
| `[%Téléphone de l'organisme%]` | `{{telephone_organisme}}` | |
| `[%Site web de l'organisme%]` | `{{site_organisme}}` | |
| `[%Logo de l'organisme%]` | `{{logo_organisme}}` | `<img>` tag avec entity.logo_url |
| `[%Cachet de l'organisme%]` | `{{tampon_organisme}}` | **Cachet officiel** — préférer à Signature |
| `[%Signature de l'organisme%]` | `{{signature_organisme}}` | Gribouillis du signataire (rarement utilisé — préférer Cachet) |
| `[%Nom du représentant de l'organisme%]` | `{{representant_organisme}}` | Pour "Je soussigné..." |
| `[%Titre du représentant de l'organisme%]` | `{{titre_representant_organisme}}` | ex: "Directeur" |

---

## 👤 Apprenant (stagiaire)

Requires `data.learner` in `ResolveContext`.

| Alias | Tech key | Notes |
|---|---|---|
| `[%Nom de l'apprenant%]` | `{{nom_apprenant}}` | Prénom + NOM |
| `[%Email de l'apprenant%]` | `{{email_apprenant}}` | |
| `[%Ville de naissance de l'apprenant%]` | `{{ville_naissance_apprenant}}` | Utilisé par AIPR |
| `[%Profil du stagiaire%]` | `{{profil_stagiaire}}` | Description du profil cible |
| `[%Heures de formation réalisées par l'apprenant%]` | `{{heures_realisees_apprenant}}` | Basé sur `signedLearnerIds` |
| `[%Taux de réalisation%]` | `{{taux_realisation}}` | % heures réalisées / prévues |

---

## 👨‍🏫 Formateur

Requires `data.trainer` ou `data.session.formation_trainers`.

| Alias | Tech key | Notes |
|---|---|---|
| `[%Nom du formateur%]` | `{{nom_formateur_complet}}` | Formateur unique |
| `[%Nom du/des formateur(s)%]` | `{{formateurs_noms}}` | Liste séparée par virgules |
| `[%Formateurs de la formation%]` | `{{formateurs_noms}}` | Alias |
| `[%Équipe pédagogique%]` | `{{equipe_pedagogique}}` | Composition équipe |
| `[%Adresse du formateur%]` | `{{adresse_formateur}}` | |
| `[%SIRET du formateur%]` | `{{siret_formateur}}` | |
| `[%NDA du formateur%]` | `{{nda_formateur}}` | |
| `[%Lien de l'extranet du formateur%]` | `{{lien_extranet_formateur}}` | Magic link |
| `[%Coût total du formateur (HT)%]` | `{{cout_formateur_ht}}` | Depuis `formation_trainers.agreed_cost_ht` |

---

## 🏭 Client / Entreprise

Requires `data.client` in `ResolveContext`. Pour INTER (multi-entreprises) voir section dédiée.

| Alias | Tech key | Notes |
|---|---|---|
| `[%Nom du client%]` | `{{nom_client}}` | `clients.company_name` |
| `[%Nom de l'entreprise%]` | `{{nom_client}}` | Alias |
| `[%Adresse du client%]` | `{{client_adresse}}` | |
| `[%Adresse de l'entreprise%]` | `{{client_adresse}}` | Alias |
| `[%SIRET du client%]` | `{{client_siret}}` | |
| `[%Nom du représentant légal du client%]` | `{{client_representant}}` | |
| `[%Nombre d'apprenants du client%]` | `{{formation_effectifs}}` | Pour INTER |
| `[%Apprenants du client%]` | `{{liste_apprenants}}` | Liste filtrée par client |
| `[%Liste des stagiaires de la session%]` | `{{liste_apprenants}}` | Tous les apprenants inscrits à la session (noms, sans filtre client) — ajouté pour contrat_sous_traitance |

---

## 🎓 Formation

Requires `data.session` (et `data.session.training`).

| Alias | Tech key | Notes |
|---|---|---|
| `[%Nom de la formation%]` | `{{titre_formation}}` | `session.title` |
| `[%Nom du programme associé%]` | `{{titre_formation}}` | Alias |
| `[%Description de la formation%]` | `{{description_formation}}` | |
| `[%Type d'action de formation%]` | `{{type_action_formation}}` | ex: "Adaptation et développement des compétences" |
| `[%Type de diplôme décerné%]` | `{{type_diplome}}` | |
| `[%Durée de la formation%]` | `{{duree_heures}}` | en heures, ex: "35" |
| `[%Total des heures des créneaux de la formation%]` | `{{duree_heures}}` | Alias |
| `[%Durée en jours%]` | `{{duree_jours}}` | |
| `[%Lieu de la formation%]` | `{{lieu}}` | `session.location` |
| `[%Adresse de la formation%]` | `{{adresse_formation}}` | Alias de location |
| `[%Modalité de la formation%]` | `{{formation_modalite}}` | ex: "Présentiel" |
| `[%Modalité d'accès%]` | `{{modalite_acces}}` | |
| `[%Délais d'accès%]` | `{{delais_acces}}` | |
| `[%Prérequis%]` | `{{programme_prerequis}}` | |
| `[%Objectifs%]` | `{{programme_objectifs}}` | |
| `[%Liste objectifs pédagogiques%]` | `{{liste_objectifs_pedagogiques}}` | Liste puces HTML |
| `[%Objectifs pédagogiques du programme%]` | `{{liste_objectifs_pedagogiques}}` | Alias |
| `[%Contenu pédagogique%]` | `{{contenu_pedagogique}}` | Sections HTML |
| `[%Moyens pédagogiques%]` | `{{moyens_pedagogiques}}` | |
| `[%Dispositif d'évaluation%]` | `{{dispositif_evaluation}}` | |
| `[%Taux de satisfaction%]` | `{{taux_satisfaction}}` | % session |
| `[%Effectif max%]` | `{{effectif_max}}` | Capacité max |
| `[%Date de création du programme%]` | `{{date_creation_programme}}` | |
| `[%Version du programme%]` | `{{version_programme}}` | |

---

## 📅 Dates

| Alias | Tech key | Notes |
|---|---|---|
| `[%Date d'aujourd'hui%]` | `{{date_today}}` | Jour de génération |
| `[%Date de début de la formation%]` | `{{date_debut}}` | Format français |
| `[%Date de fin de la formation%]` | `{{date_fin}}` | |
| `[%Dates de la formation%]` | `{{dates_formation}}` | "du X au Y" |
| `[%Vos dates en détail%]` | `{{dates_detail}}` | Liste détaillée par créneau |

---

## 💰 Montants

| Alias | Tech key | Notes |
|---|---|---|
| `[%Montant HT%]` | `{{montant_ht}}` | |
| `[%Montant TTC%]` | `{{montant_ttc}}` | |
| `[%Montant TVA%]` | `{{montant_tva}}` | |
| `[%Tableau des coûts du client%]` | `{{tableau_couts_client}}` | Multi-entreprises |

---

## ✍️ Signatures & émargements

Requires `signedLearnerIds: Set<string>` ou `signaturesById: Map<string, string>` in `ResolveContext`.

| Alias | Tech key | Notes |
|---|---|---|
| `[%Signature de l'intervenant%]` | `{{signature_intervenant}}` | Signature du formateur |
| `[%E-signature de l'apprenant%]` | `{{e_signature_apprenant}}` | Ligne signature vide pour scan/pen |
| `[%E-signature du Formateur%]` | `{{e_signature_formateur}}` | |
| `[%E-signature du client%]` | `{{e_signature_client}}` | |
| `[%Tableau de signature de l'apprenant%]` | `{{tableau_signature_individuel}}` | Émargement individuel apprenant |
| `[%Tableau de signature entreprise compact%]` | `{{tableau_signature_compact}}` | Émargement collectif |

---

## 📱 QR codes / Extranet

| Alias | Tech key | Notes |
|---|---|---|
| `[%QR Code de l'extranet de l'apprenant%]` | `{{qr_code_extranet_apprenant}}` | QR pour magic link (apprenant). Requires `extranetQrDataUrl` in context |
| `[%Lien de l'extranet du formateur%]` | `{{lien_extranet_formateur}}` | URL texte |

---

## 📄 Tableaux & documents générés

| Alias | Tech key | Notes |
|---|---|---|
| `[%Tableau des résultats des évaluations%]` | `{{tableau_resultats_evaluations}}` | Per apprenant. Requires `evaluationResults` |
| `[%Tableau des réponses des questionnaires de satisfaction (suivi qualité)%]` | `{{tableau_reponses_satisfaction}}` | Agrégés session. Requires `sessionAggregates` |
| `[%Tableau des réponses des évaluations%]` | `{{tableau_reponses_evaluations}}` | Agrégés session |
| `[%Tableau du suivi qualité%]` | `{{tableau_suivi_qualite}}` | KPIs Qualiopi |
| `[%Code d'identification du certificat%]` | `{{code_certificat}}` | SHA-256 13 chars. Requires `certificateCode` |
| `[%Résultat examen AIPR%]` | `{{resultat_examen_aipr}}` | "a réussi" / "a échoué" selon `aiprExamResult` |

---

## ⚙️ Autres

| Alias | Tech key | Notes |
|---|---|---|
| `[%URL Logo Ministère du Travail%]` | `{{url_logo_ministere_travail}}` | Pour certificat de réalisation |

---

## ResolveContext

```ts
interface ResolveContext {
  session?: Session | null;
  client?: Client | null;
  learner?: Learner | null;
  trainer?: Trainer | null;
  profile?: { first_name: string; last_name: string } | null;
  signedLearnerIds?: Set<string>;        // → heures réalisées
  signaturesById?: Map<string, string>;  // → signatures dans émargements
  extranetQrDataUrl?: string;            // → QR code apprenant
  certificateCode?: string;              // → code certificat
  aiprExamResult?: "success" | "echec";  // → résultat AIPR
  evaluationResults?: Array<...>;        // → tableau résultats apprenant
  sessionAggregates?: {...};             // → tableaux satisfaction session
  entity?: {...};                        // → org info (loadEntitySettings)
}
```

Pour chaque nouveau doc, déterminer le contexte requis et charger les bonnes données côté API avant d'appeler `resolveDocumentVariables(HTML, context)`.

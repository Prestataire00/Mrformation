// ──────────────────────────────────────────────
// Catalogue typé de toutes les variables de templates
// Source de vérité : src/lib/utils/resolve-variables.ts (ALIAS_TO_VARIABLE_KEY)
// Synchronisé : 2026-05-16 — 83 aliases
//
// Format des balises : [%Sellsy Label%] dans les templates HTML.
// Le resolver convertit [%...%] en {{tech_key}} puis évalue les fonctions.
// ──────────────────────────────────────────────

export type VariableCategory =
  | "organisme"
  | "apprenant"
  | "formateur"
  | "client"
  | "formation"
  | "dates"
  | "montants"
  | "signatures"
  | "qr"
  | "documents"
  | "autres";

export interface TemplateVariable {
  /** Tech key sans braces (ex: "nom_apprenant") */
  key: string;
  /** Balise Sellsy `[%...%]` — à copier-coller dans les templates */
  placeholder: string;
  /** Tech placeholder `{{...}}` — interne au resolver */
  techPlaceholder: string;
  /** Libellé court */
  label: string;
  /** Description détaillée */
  description?: string;
  /** Exemple de rendu */
  example: string;
  category: VariableCategory;
  availableIn: ("document" | "email")[];
}

export const CATEGORY_LABELS: Record<VariableCategory, { label: string; icon: string }> = {
  organisme: { label: "Organisme de formation", icon: "🏢" },
  apprenant: { label: "Apprenant / Stagiaire", icon: "👤" },
  formateur: { label: "Formateur", icon: "👨‍🏫" },
  client: { label: "Client / Entreprise", icon: "🏭" },
  formation: { label: "Formation", icon: "🎓" },
  dates: { label: "Dates", icon: "📅" },
  montants: { label: "Montants", icon: "💰" },
  signatures: { label: "Signatures & émargements", icon: "✍️" },
  qr: { label: "QR codes / Extranet", icon: "📱" },
  documents: { label: "Tableaux & documents générés", icon: "📄" },
  autres: { label: "Autres", icon: "⚙️" },
};

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // ── 🏢 ORGANISME ──
  { key: "nom_organisme", placeholder: "[%Nom de l'organisme%]", techPlaceholder: "{{nom_organisme}}", label: "Nom de l'organisme", description: "Nom de l'organisme de formation (multi-tenant : MR ou C3V)", example: "MR FORMATION", category: "organisme", availableIn: ["document", "email"] },
  { key: "adresse_organisme", placeholder: "[%Adresse de l'organisme%]", techPlaceholder: "{{adresse_organisme}}", label: "Adresse de l'organisme", example: "12 rue Saint-Ferréol, 13001 Marseille", category: "organisme", availableIn: ["document", "email"] },
  { key: "ville_organisme", placeholder: "[%Ville de l'organisme%]", techPlaceholder: "{{ville_organisme}}", label: "Ville de l'organisme", example: "Marseille", category: "organisme", availableIn: ["document", "email"] },
  { key: "nda_organisme", placeholder: "[%NDA de l'organisme%]", techPlaceholder: "{{nda_organisme}}", label: "NDA de l'organisme", description: "Numéro de déclaration d'activité (Préfet)", example: "93 13 12345 13", category: "organisme", availableIn: ["document", "email"] },
  { key: "siret_organisme", placeholder: "[%SIRET de l'organisme%]", techPlaceholder: "{{siret_organisme}}", label: "SIRET de l'organisme", example: "12345678900012", category: "organisme", availableIn: ["document", "email"] },
  { key: "email_organisme", placeholder: "[%Email de l'organisme%]", techPlaceholder: "{{email_organisme}}", label: "Email de l'organisme", example: "contact@mrformation.fr", category: "organisme", availableIn: ["document", "email"] },
  { key: "telephone_organisme", placeholder: "[%Téléphone de l'organisme%]", techPlaceholder: "{{telephone_organisme}}", label: "Téléphone de l'organisme", example: "04 91 00 00 00", category: "organisme", availableIn: ["document", "email"] },
  { key: "site_organisme", placeholder: "[%Site web de l'organisme%]", techPlaceholder: "{{site_organisme}}", label: "Site web de l'organisme", example: "www.mrformation.fr", category: "organisme", availableIn: ["document", "email"] },
  { key: "logo_organisme", placeholder: "[%Logo de l'organisme%]", techPlaceholder: "{{logo_organisme}}", label: "Logo de l'organisme", description: "Insère le logo en `<img>` (depuis entity.logo_url)", example: "[Image logo]", category: "organisme", availableIn: ["document"] },
  { key: "tampon_organisme", placeholder: "[%Cachet de l'organisme%]", techPlaceholder: "{{tampon_organisme}}", label: "Cachet de l'organisme", description: "Cachet officiel signé. Préférer à 'Signature de l'organisme' qui est un simple gribouillis.", example: "[Image cachet]", category: "organisme", availableIn: ["document"] },
  { key: "signature_organisme", placeholder: "[%Signature de l'organisme%]", techPlaceholder: "{{signature_organisme}}", label: "Signature de l'organisme", description: "Signature scribble du signataire. Rarement utilisé — préférer Cachet.", example: "[Image signature]", category: "signatures", availableIn: ["document"] },
  { key: "representant_organisme", placeholder: "[%Nom du représentant de l'organisme%]", techPlaceholder: "{{representant_organisme}}", label: "Représentant de l'organisme", description: "Pour 'Je soussigné(e), ...'", example: "Brigitte MARTINEAU", category: "organisme", availableIn: ["document", "email"] },
  { key: "titre_representant_organisme", placeholder: "[%Titre du représentant de l'organisme%]", techPlaceholder: "{{titre_representant_organisme}}", label: "Titre du représentant", description: "Fonction du signataire", example: "Directrice", category: "organisme", availableIn: ["document"] },

  // ── 👤 APPRENANT ──
  { key: "nom_apprenant", placeholder: "[%Nom de l'apprenant%]", techPlaceholder: "{{nom_apprenant}}", label: "Nom de l'apprenant", description: "Prénom + Nom de l'apprenant inscrit à la session", example: "Patrick ATTLAN", category: "apprenant", availableIn: ["document", "email"] },
  { key: "email_apprenant", placeholder: "[%Email de l'apprenant%]", techPlaceholder: "{{email_apprenant}}", label: "Email de l'apprenant", description: "Vide si l'apprenant n'a qu'un email synthétique (`@learner.*.local`).", example: "patrick.attlan@example.fr", category: "apprenant", availableIn: ["document", "email"] },
  { key: "identifiant_apprenant", placeholder: "[%Identifiant de connexion de l'apprenant%]", techPlaceholder: "{{identifiant_apprenant}}", label: "Identifiant de connexion de l'apprenant", description: "Username slug (Epic 2.5). Fallback : email réel si pas de username.", example: "patrick.attlan", category: "apprenant", availableIn: ["document", "email"] },
  { key: "ville_naissance_apprenant", placeholder: "[%Ville de naissance de l'apprenant%]", techPlaceholder: "{{ville_naissance_apprenant}}", label: "Ville de naissance", description: "Utilisé par l'AIPR (proximité réseaux)", example: "Marseille", category: "apprenant", availableIn: ["document"] },
  { key: "profil_stagiaire", placeholder: "[%Profil du stagiaire%]", techPlaceholder: "{{profil_stagiaire}}", label: "Profil du stagiaire", description: "Description du profil cible (programme)", example: "Salariés en reconversion", category: "apprenant", availableIn: ["document"] },
  { key: "heures_realisees_apprenant", placeholder: "[%Heures de formation réalisées par l'apprenant%]", techPlaceholder: "{{heures_realisees_apprenant}}", label: "Heures réalisées par l'apprenant", description: "Basé sur les émargements (signedLearnerIds)", example: "28", category: "apprenant", availableIn: ["document"] },
  { key: "taux_realisation", placeholder: "[%Taux de réalisation%]", techPlaceholder: "{{taux_realisation}}", label: "Taux de réalisation", description: "% heures réalisées / prévues", example: "80", category: "apprenant", availableIn: ["document"] },
  { key: "ligne_assiduite", placeholder: "[%Ligne d'assiduité%]", techPlaceholder: "{{ligne_assiduite}}", label: "Ligne d'assiduité", description: "Phrase complète heures réalisées + taux (par créneau émargé) ; repli honnête si l'émargement par créneau n'est pas renseigné", example: "Durée effectivement suivie : 10.50 heures, soit un taux de 75.00 %", category: "apprenant", availableIn: ["document"] },

  // ── 👨‍🏫 FORMATEUR ──
  { key: "nom_formateur_complet", placeholder: "[%Nom du formateur%]", techPlaceholder: "{{nom_formateur_complet}}", label: "Nom du formateur", description: "Pour le formateur courant (data.trainer)", example: "Brigitte MARTINEAU", category: "formateur", availableIn: ["document"] },
  { key: "formateurs_noms_alias_pluriel", placeholder: "[%Nom du/des formateur(s)%]", techPlaceholder: "{{formateurs_noms}}", label: "Nom(s) du/des formateur(s)", description: "Liste séparée par virgules (formation_trainers)", example: "Brigitte MARTINEAU, Jean DURAND", category: "formateur", availableIn: ["document"] },
  { key: "formateurs_noms", placeholder: "[%Formateurs de la formation%]", techPlaceholder: "{{formateurs_noms}}", label: "Formateurs de la formation", description: "Liste séparée par virgules", example: "Brigitte MARTINEAU, Jean DURAND", category: "formateur", availableIn: ["document", "email"] },
  { key: "equipe_pedagogique", placeholder: "[%Équipe pédagogique%]", techPlaceholder: "{{equipe_pedagogique}}", label: "Équipe pédagogique", description: "Composition équipe + qualifications", example: "Équipe de 3 formateurs experts...", category: "formateur", availableIn: ["document"] },
  { key: "adresse_formateur", placeholder: "[%Adresse du formateur%]", techPlaceholder: "{{adresse_formateur}}", label: "Adresse du formateur", example: "10 rue de la République, 13002 Marseille", category: "formateur", availableIn: ["document"] },
  { key: "siret_formateur", placeholder: "[%SIRET du formateur%]", techPlaceholder: "{{siret_formateur}}", label: "SIRET du formateur", example: "98765432100012", category: "formateur", availableIn: ["document"] },
  { key: "nda_formateur", placeholder: "[%NDA du formateur%]", techPlaceholder: "{{nda_formateur}}", label: "NDA du formateur", description: "Si formateur indépendant déclaré", example: "93 13 67890 13", category: "formateur", availableIn: ["document"] },
  { key: "lien_extranet_formateur", placeholder: "[%Lien de l'extranet du formateur%]", techPlaceholder: "{{lien_extranet_formateur}}", label: "Lien extranet formateur", description: "URL texte (pour magic link formateur)", example: "https://mrformation.fr/trainer/abc123", category: "qr", availableIn: ["document", "email"] },
  { key: "cout_formateur_ht", placeholder: "[%Coût total du formateur (HT)%]", techPlaceholder: "{{cout_formateur_ht}}", label: "Coût formateur HT", description: "agreed_cost_ht depuis formation_trainers", example: "1200.00", category: "montants", availableIn: ["document"] },

  // ── 🏭 CLIENT / ENTREPRISE ──
  { key: "nom_client", placeholder: "[%Nom du client%]", techPlaceholder: "{{nom_client}}", label: "Nom du client", description: "clients.company_name", example: "UNICIL", category: "client", availableIn: ["document", "email"] },
  { key: "nom_client_alias_entreprise", placeholder: "[%Nom de l'entreprise%]", techPlaceholder: "{{nom_client}}", label: "Nom de l'entreprise", description: "Synonyme de 'Nom du client'", example: "UNICIL", category: "client", availableIn: ["document", "email"] },
  { key: "client_adresse", placeholder: "[%Adresse du client%]", techPlaceholder: "{{client_adresse}}", label: "Adresse du client", example: "11 rue Armeny, 13006 Marseille", category: "client", availableIn: ["document"] },
  { key: "client_adresse_alias_entreprise", placeholder: "[%Adresse de l'entreprise%]", techPlaceholder: "{{client_adresse}}", label: "Adresse de l'entreprise", description: "Synonyme de 'Adresse du client'", example: "11 rue Armeny, 13006 Marseille", category: "client", availableIn: ["document"] },
  { key: "client_siret", placeholder: "[%SIRET du client%]", techPlaceholder: "{{client_siret}}", label: "SIRET du client", example: "57362075400032", category: "client", availableIn: ["document"] },
  { key: "client_representant", placeholder: "[%Nom du représentant légal du client%]", techPlaceholder: "{{client_representant}}", label: "Représentant légal du client", description: "Signataire côté client", example: "M. Pierre MARTIN", category: "client", availableIn: ["document"] },
  { key: "formation_effectifs", placeholder: "[%Nombre d'apprenants du client%]", techPlaceholder: "{{formation_effectifs}}", label: "Nombre d'apprenants du client", description: "Pour formations INTER (multi-entreprises)", example: "5", category: "client", availableIn: ["document"] },
  { key: "liste_apprenants", placeholder: "[%Apprenants du client%]", techPlaceholder: "{{liste_apprenants}}", label: "Apprenants du client", description: "Liste filtrée par client (INTER)", example: "Patrick ATTLAN, Marie DUPONT...", category: "client", availableIn: ["document"] },

  // ── 🎓 FORMATION ──
  { key: "titre_formation", placeholder: "[%Nom de la formation%]", techPlaceholder: "{{titre_formation}}", label: "Nom de la formation", description: "session.title", example: "POE Managers de Proximité", category: "formation", availableIn: ["document", "email"] },
  { key: "titre_formation_alias_programme", placeholder: "[%Nom du programme associé%]", techPlaceholder: "{{titre_formation}}", label: "Nom du programme associé", description: "Synonyme de 'Nom de la formation'", example: "POE Managers de Proximité", category: "formation", availableIn: ["document"] },
  { key: "description_formation", placeholder: "[%Description de la formation%]", techPlaceholder: "{{description_formation}}", label: "Description de la formation", example: "Formation visant à...", category: "formation", availableIn: ["document"] },
  { key: "type_action_formation", placeholder: "[%Type d'action de formation%]", techPlaceholder: "{{type_action_formation}}", label: "Type d'action de formation", description: "Catégorisation officielle (code travail)", example: "Adaptation et développement des compétences", category: "formation", availableIn: ["document"] },
  { key: "type_diplome", placeholder: "[%Type de diplôme décerné%]", techPlaceholder: "{{type_diplome}}", label: "Type de diplôme décerné", example: "Certificat de réalisation", category: "formation", availableIn: ["document"] },
  { key: "duree_heures", placeholder: "[%Durée de la formation%]", techPlaceholder: "{{duree_heures}}", label: "Durée de la formation", description: "En heures (planned_hours)", example: "35", category: "formation", availableIn: ["document", "email"] },
  { key: "duree_heures_alias_total", placeholder: "[%Total des heures des créneaux de la formation%]", techPlaceholder: "{{duree_heures}}", label: "Total des heures", description: "Synonyme de Durée de la formation", example: "35", category: "formation", availableIn: ["document"] },
  { key: "duree_jours", placeholder: "[%Durée en jours%]", techPlaceholder: "{{duree_jours}}", label: "Durée en jours", example: "5", category: "formation", availableIn: ["document"] },
  { key: "lieu", placeholder: "[%Lieu de la formation%]", techPlaceholder: "{{lieu}}", label: "Lieu de la formation", description: "session.location", example: "Centre MR, 12 rue Saint-Ferréol, 13001 Marseille", category: "formation", availableIn: ["document", "email"] },
  { key: "adresse_formation", placeholder: "[%Adresse de la formation%]", techPlaceholder: "{{adresse_formation}}", label: "Adresse de la formation", description: "Alias direct de session.location", example: "Centre MR, 12 rue Saint-Ferréol, 13001 Marseille", category: "formation", availableIn: ["document"] },
  { key: "formation_modalite", placeholder: "[%Modalité de la formation%]", techPlaceholder: "{{formation_modalite}}", label: "Modalité", example: "Présentiel", category: "formation", availableIn: ["document"] },
  { key: "modalite_acces", placeholder: "[%Modalité d'accès%]", techPlaceholder: "{{modalite_acces}}", label: "Modalité d'accès", example: "Inscription via formulaire en ligne", category: "formation", availableIn: ["document"] },
  { key: "delais_acces", placeholder: "[%Délais d'accès%]", techPlaceholder: "{{delais_acces}}", label: "Délais d'accès", example: "Sous 15 jours après inscription", category: "formation", availableIn: ["document"] },
  { key: "programme_prerequis", placeholder: "[%Prérequis%]", techPlaceholder: "{{programme_prerequis}}", label: "Prérequis", example: "Aucun prérequis", category: "formation", availableIn: ["document"] },
  { key: "programme_objectifs", placeholder: "[%Objectifs%]", techPlaceholder: "{{programme_objectifs}}", label: "Objectifs (texte)", example: "Maîtriser les fondamentaux du management...", category: "formation", availableIn: ["document"] },
  { key: "liste_objectifs_pedagogiques", placeholder: "[%Liste objectifs pédagogiques%]", techPlaceholder: "{{liste_objectifs_pedagogiques}}", label: "Liste objectifs pédagogiques", description: "Liste à puces HTML", example: "<ul><li>Acquérir...</li><li>Maîtriser...</li></ul>", category: "formation", availableIn: ["document"] },
  { key: "liste_objectifs_pedagogiques_alias_programme", placeholder: "[%Objectifs pédagogiques du programme%]", techPlaceholder: "{{liste_objectifs_pedagogiques}}", label: "Objectifs pédagogiques du programme", description: "Synonyme de Liste objectifs pédagogiques", example: "<ul><li>Acquérir...</li></ul>", category: "formation", availableIn: ["document"] },
  { key: "contenu_pedagogique", placeholder: "[%Contenu pédagogique%]", techPlaceholder: "{{contenu_pedagogique}}", label: "Contenu pédagogique", description: "Sections HTML structurées (modules)", example: "Module 1 : Introduction...", category: "formation", availableIn: ["document"] },
  { key: "moyens_pedagogiques", placeholder: "[%Moyens pédagogiques%]", techPlaceholder: "{{moyens_pedagogiques}}", label: "Moyens pédagogiques", description: "Liste des moyens (ateliers, supports...)", example: "Études de cas, mises en situation...", category: "formation", availableIn: ["document"] },
  { key: "dispositif_evaluation", placeholder: "[%Dispositif d'évaluation%]", techPlaceholder: "{{dispositif_evaluation}}", label: "Dispositif d'évaluation", example: "QCM en fin de formation + mise en situation", category: "formation", availableIn: ["document"] },
  { key: "taux_satisfaction", placeholder: "[%Taux de satisfaction%]", techPlaceholder: "{{taux_satisfaction}}", label: "Taux de satisfaction", description: "% session (Qualiopi)", example: "92", category: "formation", availableIn: ["document"] },
  { key: "effectif_max", placeholder: "[%Effectif max%]", techPlaceholder: "{{effectif_max}}", label: "Effectif maximum", example: "12", category: "formation", availableIn: ["document"] },
  { key: "date_creation_programme", placeholder: "[%Date de création du programme%]", techPlaceholder: "{{date_creation_programme}}", label: "Date de création du programme", example: "15/01/2025", category: "formation", availableIn: ["document"] },
  { key: "version_programme", placeholder: "[%Version du programme%]", techPlaceholder: "{{version_programme}}", label: "Version du programme", example: "v2.1", category: "formation", availableIn: ["document"] },

  // ── 📅 DATES ──
  { key: "date_today", placeholder: "[%Date d'aujourd'hui%]", techPlaceholder: "{{date_today}}", label: "Date d'aujourd'hui", description: "Jour de génération du document", example: "16/05/2026", category: "dates", availableIn: ["document", "email"] },
  { key: "date_debut", placeholder: "[%Date de début de la formation%]", techPlaceholder: "{{date_debut}}", label: "Date de début", example: "15/09/2025", category: "dates", availableIn: ["document", "email"] },
  { key: "date_fin", placeholder: "[%Date de fin de la formation%]", techPlaceholder: "{{date_fin}}", label: "Date de fin", example: "19/09/2025", category: "dates", availableIn: ["document", "email"] },
  { key: "dates_formation", placeholder: "[%Dates de la formation%]", techPlaceholder: "{{dates_formation}}", label: "Dates de la formation", description: "Format 'du X au Y'", example: "du 15/09/2025 au 19/09/2025", category: "dates", availableIn: ["document", "email"] },
  { key: "dates_detail", placeholder: "[%Vos dates en détail%]", techPlaceholder: "{{dates_detail}}", label: "Dates en détail", description: "Liste détaillée des créneaux", example: "Lundi 15/09 09:00-17:00, Mardi 16/09 09:00-17:00...", category: "dates", availableIn: ["document"] },

  // ── 💰 MONTANTS ──
  { key: "montant_ht", placeholder: "[%Montant HT%]", techPlaceholder: "{{montant_ht}}", label: "Montant HT", example: "1500.00", category: "montants", availableIn: ["document"] },
  { key: "montant_ttc", placeholder: "[%Montant TTC%]", techPlaceholder: "{{montant_ttc}}", label: "Montant TTC", example: "1800.00", category: "montants", availableIn: ["document"] },
  { key: "montant_tva", placeholder: "[%Montant TVA%]", techPlaceholder: "{{montant_tva}}", label: "Montant TVA", example: "300.00", category: "montants", availableIn: ["document"] },
  { key: "tableau_couts_client", placeholder: "[%Tableau des coûts du client%]", techPlaceholder: "{{tableau_couts_client}}", label: "Tableau des coûts du client", description: "Pour conventions multi-entreprises (INTER)", example: "[Tableau HTML]", category: "montants", availableIn: ["document"] },

  // ── ✍️ SIGNATURES ──
  { key: "signature_intervenant", placeholder: "[%Signature de l'intervenant%]", techPlaceholder: "{{signature_intervenant}}", label: "Signature de l'intervenant", description: "Signature du formateur courant", example: "[Image signature]", category: "signatures", availableIn: ["document"] },
  { key: "e_signature_apprenant", placeholder: "[%E-signature de l'apprenant%]", techPlaceholder: "{{e_signature_apprenant}}", label: "E-signature apprenant", description: "Zone signature vide pour scan ou pen", example: "[Ligne signature]", category: "signatures", availableIn: ["document"] },
  { key: "e_signature_formateur", placeholder: "[%E-signature du Formateur%]", techPlaceholder: "{{e_signature_formateur}}", label: "E-signature formateur", example: "[Ligne signature]", category: "signatures", availableIn: ["document"] },
  { key: "e_signature_client", placeholder: "[%E-signature du client%]", techPlaceholder: "{{e_signature_client}}", label: "E-signature client", example: "[Ligne signature]", category: "signatures", availableIn: ["document"] },
  { key: "tableau_signature_individuel", placeholder: "[%Tableau de signature de l'apprenant%]", techPlaceholder: "{{tableau_signature_individuel}}", label: "Tableau émargement individuel", description: "Pour émargement individuel apprenant (par créneau)", example: "[Tableau HTML]", category: "signatures", availableIn: ["document"] },
  { key: "tableau_signature_compact", placeholder: "[%Tableau de signature entreprise compact%]", techPlaceholder: "{{tableau_signature_compact}}", label: "Tableau émargement collectif", description: "Émargement collectif compact (entreprise)", example: "[Tableau HTML]", category: "signatures", availableIn: ["document"] },

  // ── 📄 TABLEAUX & DOCUMENTS ──
  { key: "tableau_resultats_evaluations", placeholder: "[%Tableau des résultats des évaluations%]", techPlaceholder: "{{tableau_resultats_evaluations}}", label: "Résultats des évaluations (par apprenant)", description: "Tableau HTML avec scores par questionnaire", example: "[Tableau HTML]", category: "documents", availableIn: ["document"] },
  { key: "tableau_reponses_satisfaction", placeholder: "[%Tableau des réponses des questionnaires de satisfaction (suivi qualité)%]", techPlaceholder: "{{tableau_reponses_satisfaction}}", label: "Réponses satisfaction (agrégés session)", description: "Vue admin/Qualiopi", example: "[Tableau HTML]", category: "documents", availableIn: ["document"] },
  { key: "tableau_reponses_evaluations", placeholder: "[%Tableau des réponses des évaluations%]", techPlaceholder: "{{tableau_reponses_evaluations}}", label: "Réponses évaluations (agrégés session)", description: "Statistiques évaluations toute la session", example: "[Tableau HTML]", category: "documents", availableIn: ["document"] },
  { key: "tableau_suivi_qualite", placeholder: "[%Tableau du suivi qualité%]", techPlaceholder: "{{tableau_suivi_qualite}}", label: "Suivi qualité (KPIs Qualiopi)", example: "[Tableau HTML]", category: "documents", availableIn: ["document"] },
  { key: "code_certificat", placeholder: "[%Code d'identification du certificat%]", techPlaceholder: "{{code_certificat}}", label: "Code d'identification du certificat", description: "SHA-256 13 chars unique (learner+session)", example: "a3f8c2d9e1b5", category: "documents", availableIn: ["document"] },
  { key: "resultat_examen_aipr", placeholder: "[%Résultat examen AIPR%]", techPlaceholder: "{{resultat_examen_aipr}}", label: "Résultat examen AIPR", description: "'a réussi' ou 'a échoué'", example: "a réussi", category: "documents", availableIn: ["document"] },

  // ── ⚙️ AUTRES ──
  { key: "url_logo_ministere_travail", placeholder: "[%URL Logo Ministère du Travail%]", techPlaceholder: "{{url_logo_ministere_travail}}", label: "URL Logo Ministère du Travail", description: "Pour certificat de réalisation officiel", example: "/ministere-du-travail.png", category: "autres", availableIn: ["document"] },
];

/**
 * Retourne le nombre de variables par catégorie.
 */
export function getCategoryCounts(): Record<VariableCategory, number> {
  const counts = {} as Record<VariableCategory, number>;
  for (const cat of Object.keys(CATEGORY_LABELS) as VariableCategory[]) {
    counts[cat] = TEMPLATE_VARIABLES.filter((v) => v.category === cat).length;
  }
  return counts;
}

/**
 * Variables disponibles pour les documents (UI helper).
 * Dérivé de TEMPLATE_VARIABLES, filtré par `availableIn.includes("document")`.
 *
 * Format : { key (sans braces), label } — utilisé par
 * admin/documents/page.tsx pour afficher la liste des variables
 * connues + détecter les variables inconnues dans les templates custom.
 *
 * Note : `EMAIL_VARIABLES` n'a pas été ajouté car le dead code
 * `AVAILABLE_VARIABLES` dans admin/emails/page.tsx a été supprimé
 * (le composant `InsertVariableButton` utilise déjà directement
 * TEMPLATE_VARIABLES filtré par `availableIn: "email"`).
 */
export const DOCUMENT_VARIABLES: { key: string; label: string }[] = TEMPLATE_VARIABLES
  .filter((v) => v.availableIn.includes("document"))
  .map((v) => ({ key: v.key, label: v.label }));

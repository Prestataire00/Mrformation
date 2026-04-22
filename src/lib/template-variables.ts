// ──────────────────────────────────────────────
// Catalogue typé de toutes les variables de templates
// Source de vérité : src/lib/utils/resolve-variables.ts
// ──────────────────────────────────────────────

export type VariableCategory =
  | "apprenant"
  | "formateur"
  | "client"
  | "formation"
  | "dates"
  | "montants"
  | "documents"
  | "autres";

export interface TemplateVariable {
  key: string;
  placeholder: string;
  label: string;
  description?: string;
  example: string;
  category: VariableCategory;
  availableIn: ("document" | "email")[];
}

export const CATEGORY_LABELS: Record<VariableCategory, { label: string; icon: string }> = {
  apprenant: { label: "Apprenant", icon: "👤" },
  formateur: { label: "Formateur", icon: "👨‍🏫" },
  client: { label: "Entreprise cliente", icon: "🏢" },
  formation: { label: "Formation", icon: "🎓" },
  dates: { label: "Dates", icon: "📅" },
  montants: { label: "Montants", icon: "💰" },
  documents: { label: "Documents", icon: "📄" },
  autres: { label: "Autres", icon: "⚙️" },
};

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // ── Apprenant ──
  {
    key: "nom_apprenant",
    placeholder: "{{nom_apprenant}}",
    label: "Nom complet de l'apprenant",
    description: "Prénom + Nom de l'apprenant",
    example: "Jean DURAND",
    category: "apprenant",
    availableIn: ["document", "email"],
  },
  {
    key: "prenom_apprenant",
    placeholder: "{{prenom_apprenant}}",
    label: "Prénom de l'apprenant",
    example: "Jean",
    category: "apprenant",
    availableIn: ["document", "email"],
  },
  {
    key: "email_apprenant",
    placeholder: "{{email_apprenant}}",
    label: "Email de l'apprenant",
    example: "jean.durand@email.com",
    category: "apprenant",
    availableIn: ["document", "email"],
  },
  {
    key: "telephone_apprenant",
    placeholder: "{{telephone_apprenant}}",
    label: "Téléphone de l'apprenant",
    example: "06 12 34 56 78",
    category: "apprenant",
    availableIn: ["document"],
  },
  {
    key: "signature_apprenant",
    placeholder: "{{signature_apprenant}}",
    label: "Signature de l'apprenant",
    description: "Zone de signature (rempli automatiquement)",
    example: "[Signature]",
    category: "apprenant",
    availableIn: ["document"],
  },
  {
    key: "liste_apprenants",
    placeholder: "{{liste_apprenants}}",
    label: "Liste des apprenants",
    description: "Tous les apprenants inscrits, séparés par des virgules",
    example: "DURAND Jean, MARTIN Marie",
    category: "apprenant",
    availableIn: ["document"],
  },

  // ── Formateur ──
  {
    key: "nom_formateur",
    placeholder: "{{nom_formateur}}",
    label: "Nom du formateur",
    example: "Pierre DUPONT",
    category: "formateur",
    availableIn: ["document", "email"],
  },
  {
    key: "formateurs_noms",
    placeholder: "{{formateurs_noms}}",
    label: "Noms de tous les formateurs",
    description: "Liste complète si plusieurs formateurs assignés",
    example: "DUPONT Pierre, LEROY Sophie",
    category: "formateur",
    availableIn: ["document"],
  },
  {
    key: "signature_formateur",
    placeholder: "{{signature_formateur}}",
    label: "Signature du formateur",
    example: "[Signature]",
    category: "formateur",
    availableIn: ["document"],
  },

  // ── Client / Entreprise ──
  {
    key: "nom_client",
    placeholder: "{{nom_client}}",
    label: "Nom de l'entreprise",
    example: "ACME Formation SAS",
    category: "client",
    availableIn: ["document", "email"],
  },
  {
    key: "client_adresse",
    placeholder: "{{client_adresse}}",
    label: "Adresse complète du client",
    example: "12 Rue de la Formation 75008 Paris",
    category: "client",
    availableIn: ["document"],
  },
  {
    key: "client_siret",
    placeholder: "{{client_siret}}",
    label: "SIRET du client",
    example: "44306184100047",
    category: "client",
    availableIn: ["document"],
  },
  {
    key: "client_representant",
    placeholder: "{{client_representant}}",
    label: "Représentant du client",
    description: "Contact principal de l'entreprise",
    example: "MARTIN Isabelle",
    category: "client",
    availableIn: ["document"],
  },
  {
    key: "entreprise_contact",
    placeholder: "{{entreprise_contact}}",
    label: "Contact entreprise",
    description: "Même que client_representant (alias)",
    example: "MARTIN Isabelle",
    category: "client",
    availableIn: ["document", "email"],
  },
  {
    key: "telephone_client",
    placeholder: "{{telephone_client}}",
    label: "Téléphone du client",
    example: "01 23 45 67 89",
    category: "client",
    availableIn: ["document", "email"],
  },
  {
    key: "email_client",
    placeholder: "{{email_client}}",
    label: "Email du client",
    example: "contact@acme.fr",
    category: "client",
    availableIn: ["document", "email"],
  },

  // ── Formation ──
  {
    key: "titre_formation",
    placeholder: "{{titre_formation}}",
    label: "Titre de la formation",
    example: "Management d'équipe — Niveau 1",
    category: "formation",
    availableIn: ["document", "email"],
  },
  {
    key: "lieu",
    placeholder: "{{lieu}}",
    label: "Lieu de la formation",
    example: "Salle 3A, Paris 75001",
    category: "formation",
    availableIn: ["document", "email"],
  },
  {
    key: "duree_heures",
    placeholder: "{{duree_heures}}",
    label: "Durée en heures",
    example: "21",
    category: "formation",
    availableIn: ["document", "email"],
  },
  {
    key: "formation_modalite",
    placeholder: "{{formation_modalite}}",
    label: "Modalité",
    description: "En présentiel / À distance / Hybride",
    example: "En présentiel",
    category: "formation",
    availableIn: ["document"],
  },
  {
    key: "formation_effectifs",
    placeholder: "{{formation_effectifs}}",
    label: "Nombre d'apprenants inscrits",
    example: "8",
    category: "formation",
    availableIn: ["document"],
  },

  // ── Dates ──
  {
    key: "date_debut",
    placeholder: "{{date_debut}}",
    label: "Date de début",
    example: "15 janvier 2026",
    category: "dates",
    availableIn: ["document", "email"],
  },
  {
    key: "date_fin",
    placeholder: "{{date_fin}}",
    label: "Date de fin",
    example: "17 janvier 2026",
    category: "dates",
    availableIn: ["document", "email"],
  },
  {
    key: "date_formation",
    placeholder: "{{date_formation}}",
    label: "Date de la formation",
    description: "Alias de date_debut",
    example: "15 janvier 2026",
    category: "dates",
    availableIn: ["document", "email"],
  },
  {
    key: "date_today",
    placeholder: "{{date_today}}",
    label: "Date du jour",
    example: "20 avril 2026",
    category: "dates",
    availableIn: ["document", "email"],
  },
  {
    key: "date_limite",
    placeholder: "{{date_limite}}",
    label: "Date limite",
    example: "30 avril 2026",
    category: "dates",
    availableIn: ["document", "email"],
  },

  // ── Montants ──
  {
    key: "montant",
    placeholder: "{{montant}}",
    label: "Montant HT (alias)",
    example: "3500.00",
    category: "montants",
    availableIn: ["document", "email"],
  },
  {
    key: "montant_ht",
    placeholder: "{{montant_ht}}",
    label: "Montant HT",
    example: "3500.00",
    category: "montants",
    availableIn: ["document"],
  },
  {
    key: "montant_tva",
    placeholder: "{{montant_tva}}",
    label: "Montant TVA (20%)",
    example: "700.00",
    category: "montants",
    availableIn: ["document"],
  },
  {
    key: "montant_ttc",
    placeholder: "{{montant_ttc}}",
    label: "Montant TTC",
    example: "4200.00",
    category: "montants",
    availableIn: ["document"],
  },
  {
    key: "numero_facture",
    placeholder: "{{numero_facture}}",
    label: "Numéro de facture",
    description: "Format : FACT-YYYY-MM",
    example: "FACT-2026-04",
    category: "montants",
    availableIn: ["document"],
  },

  // ── Autres ──
  {
    key: "nom_commercial",
    placeholder: "{{nom_commercial}}",
    label: "Nom du commercial",
    description: "Utilisateur connecté qui envoie le document",
    example: "Sophie LEROY",
    category: "autres",
    availableIn: ["email"],
  },
  {
    key: "lien_connexion",
    placeholder: "{{lien_connexion}}",
    label: "Lien de connexion",
    description: "URL de connexion à la plateforme",
    example: "https://mrformation.fr/login",
    category: "autres",
    availableIn: ["email"],
  },
  {
    key: "lien_signature",
    placeholder: "{{lien_signature}}",
    label: "Lien de signature",
    description: "URL de signature électronique (devis, convention)",
    example: "https://mrformation.fr/sign/abc123",
    category: "autres",
    availableIn: ["email"],
  },

  // ── Programme (objectifs, contenu, prérequis) ──
  {
    key: "programme_objectifs",
    placeholder: "{{programme_objectifs}}",
    label: "Objectifs pédagogiques",
    description: "Liste des objectifs du programme de formation",
    example: "Maîtriser les techniques de management",
    category: "formation",
    availableIn: ["document"],
  },
  {
    key: "programme_prerequis",
    placeholder: "{{programme_prerequis}}",
    label: "Prérequis",
    description: "Prérequis nécessaires pour suivre la formation",
    example: "Aucun prérequis particulier",
    category: "formation",
    availableIn: ["document"],
  },
  {
    key: "programme_public",
    placeholder: "{{programme_public}}",
    label: "Public visé",
    example: "Managers et chefs d'équipe",
    category: "formation",
    availableIn: ["document"],
  },
  {
    key: "programme_contenu",
    placeholder: "{{programme_contenu}}",
    label: "Contenu du programme",
    description: "Description détaillée du contenu pédagogique",
    example: "Jour 1 : Introduction...",
    category: "formation",
    availableIn: ["document"],
  },

  // ── Signature organisme ──
  {
    key: "signature_organisme",
    placeholder: "{{signature_organisme}}",
    label: "Signature organisme",
    description: "Nom et fonction du signataire de l'organisme",
    example: "VICHOT Marc — Gérant",
    category: "autres",
    availableIn: ["document"],
  },
  {
    key: "nda_organisme",
    placeholder: "{{nda_organisme}}",
    label: "N° déclaration d'activité",
    example: "93132013113",
    category: "autres",
    availableIn: ["document", "email"],
  },
  {
    key: "siret_organisme",
    placeholder: "{{siret_organisme}}",
    label: "SIRET de l'organisme",
    example: "91311329600036",
    category: "autres",
    availableIn: ["document", "email"],
  },
];

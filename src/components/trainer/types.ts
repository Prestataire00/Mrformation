// ─── Types partagés pour les composants formateur ────────────────────────────

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  path: string;
}

export type SessionDocType =
  | "feuille_emargement"
  | "evaluation"
  | "compte_rendu"
  | "bilan_pedagogique"
  | "autre";

export type AdminDocType =
  | "cv"
  | "diplome"
  | "certification"
  | "habilitation"
  | "attestation"
  | "autre";

export interface TrainerDocument {
  id: string;
  trainer_id: string;
  entity_id: string | null;
  scope: "session" | "admin";
  session_id: string | null;
  doc_type: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  sessions?: { id: string; training_title: string; start_date: string } | null;
}

export const SESSION_DOC_TYPE_LABELS: Record<SessionDocType, string> = {
  feuille_emargement: "Feuille d'émargement",
  evaluation: "Évaluation",
  compte_rendu: "Compte-rendu",
  bilan_pedagogique: "Bilan pédagogique",
  autre: "Autre",
};

export const ADMIN_DOC_TYPE_LABELS: Record<AdminDocType, string> = {
  cv: "CV",
  diplome: "Diplôme",
  certification: "Certification",
  habilitation: "Habilitation",
  attestation: "Attestation",
  autre: "Autre",
};

export const SESSION_DOC_TYPE_COLORS: Record<SessionDocType, string> = {
  feuille_emargement: "bg-blue-100 text-blue-800",
  evaluation: "bg-green-100 text-green-800",
  compte_rendu: "bg-orange-100 text-orange-800",
  bilan_pedagogique: "bg-purple-100 text-purple-800",
  autre: "bg-gray-100 text-gray-800",
};

export const ADMIN_DOC_TYPE_COLORS: Record<AdminDocType, string> = {
  cv: "bg-blue-100 text-blue-800",
  diplome: "bg-green-100 text-green-800",
  certification: "bg-amber-100 text-amber-800",
  habilitation: "bg-red-100 text-red-800",
  attestation: "bg-purple-100 text-purple-800",
  autre: "bg-gray-100 text-gray-800",
};

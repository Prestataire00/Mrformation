"use client";

/**
 * Scaffold em-c-1 — TemplateListView (Tab Modèles).
 *
 * Implémentation complète en em-c-2 :
 *   - Toggle vue Cards / Liste persisté localStorage
 *   - Filtre par catégorie (CategoryFilter chips multi-select)
 *   - Recherche texte
 *   - Cards TemplateCard avec UsageBadge
 *   - Empty states
 *
 * En attendant, ce composant renvoie null (page.tsx conserve son
 * rendu actuel via le state local activeTab).
 */
export interface TemplateListViewProps {
  /** Permet à em-c-3 d'ouvrir le dialog d'édition depuis une card */
  onEdit?: (templateId: string) => void;
}

export function TemplateListView(_props: TemplateListViewProps) {
  return null;
}

/**
 * Types partagés pour les templates et documents du module Documents.
 *
 * `DocumentType` est la catégorie d'un document utilisée pour le rendu UI
 * (badge couleur, icône) — différente du `doc_type` du registry système
 * qui identifie un template spécifique.
 *
 * Mapping conceptuel :
 *   - "agreement"   → conventions
 *   - "certificate" → certificats, attestations
 *   - "attendance"  → émargements, plannings
 *   - "invoice"     → factures, devis
 *   - "other"       → CGV, règlement intérieur, etc.
 */
export type DocumentType = "agreement" | "certificate" | "attendance" | "invoice" | "other";

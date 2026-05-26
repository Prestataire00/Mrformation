/**
 * Valide qu'un signature_data est utilisable pour un bulk-sign admin (Qualiopi).
 *
 * Reject :
 *  - null / vide
 *  - La string littérale "admin_bulk" (bug historique pré-fix Volet A Émargement)
 *  - Toute string sans préfixe data:image/ ni structure SVG raw
 *
 * Accept :
 *  - data URL image (data:image/png;base64,..., data:image/jpeg, etc.)
 *  - SVG raw (commence par <svg, format émis par <SignaturePad>)
 *
 * Utilisé côté client (gate UI du bouton "Confirmer") et côté serveur (route
 * /api/signatures POST en défense en profondeur).
 */
export function isValidAdminBulkSignature(signatureData: string | null): boolean {
  if (!signatureData || typeof signatureData !== "string") return false;
  if (signatureData === "admin_bulk") return false;
  if (signatureData.startsWith("data:image/")) return true;
  if (signatureData.trim().startsWith("<svg")) return true;
  return false;
}

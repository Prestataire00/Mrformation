/**
 * Valide qu'un signature_data est utilisable pour un bulk-sign admin (Qualiopi).
 *
 * Reject :
 *  - null / vide
 *  - La string littérale "admin_bulk" (bug historique pré-fix Volet A Émargement)
 *  - data:image/svg+xml (vecteur XSS — base64 SVG peut contenir du JS, non bypassé par sanitizeSignatureSvg)
 *  - Toute string sans préfixe data:image/ ni structure SVG raw
 *
 * Accept :
 *  - data URL image (data:image/png;base64,..., data:image/jpeg, etc.)
 *  - SVG raw (commence par <svg, format émis par <SignaturePad>)
 *
 * Utilisé côté client (gate UI du bouton "Confirmer") et côté serveur (route
 * /api/signatures POST en défense en profondeur).
 */
export function isValidAdminBulkSignature(signatureData: string | null): signatureData is string {
  if (!signatureData || typeof signatureData !== "string") return false;
  if (signatureData === "admin_bulk") return false;
  // Exclut volontairement data:image/svg+xml : un SVG encodé en base64
  // peut contenir du XSS. Aligné sur sanitizeSignatureSvg qui ne le
  // bypass pas non plus (src/lib/utils/sanitize-svg.ts).
  if (signatureData.startsWith("data:image/") && !signatureData.startsWith("data:image/svg")) {
    return true;
  }
  // Case-sensitive intentionnel : <SignaturePad> émet toujours en minuscules,
  // et sanitizeSignatureSvg normalise via xmlMode:true côté serveur.
  if (signatureData.trim().startsWith("<svg")) return true;
  return false;
}

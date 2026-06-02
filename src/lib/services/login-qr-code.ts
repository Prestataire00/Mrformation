import QRCode from "qrcode";

/**
 * Lot H : génère un QR code data URL pointant vers la page de connexion
 * de l'espace apprenant. Utilisé dans la convocation (en haut à droite)
 * pour faciliter l'accès au compte sans avoir à retaper l'URL.
 *
 * Le QR encode l'URL `/login` (page de saisie email + mot de passe).
 * Volontairement PAS un magic link : Loris veut un QR qui mène à la
 * page de connexion classique pour que l'apprenant saisisse son
 * identifiant (= email) et son mot de passe affichés sur la convocation.
 *
 * Async (QRCode.toDataURL retourne une Promise). À pré-calculer côté API
 * avant l'appel resolveDocumentVariables — le builder côté resolver est
 * sync et ne peut pas appeler la lib QRCode.
 *
 * @returns data URL `data:image/png;base64,...` ou null en cas d'erreur
 */
export async function generateLoginQrDataUrl(): Promise<string | null> {
  try {
    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.URL ||
      "https://mrformationcrm.netlify.app"
    ).replace(/\/+$/, "");
    const loginUrl = `${baseUrl}/login`;
    return await QRCode.toDataURL(loginUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch (err) {
    console.warn("[login-qr-code] generateLoginQrDataUrl failed:", err);
    return null;
  }
}

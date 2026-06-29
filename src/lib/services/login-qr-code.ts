import QRCode from "qrcode";

/**
 * Lot H : génère un QR code data URL pointant vers la page de connexion
 * de l'espace apprenant. Utilisé dans la convocation (en haut à droite)
 * pour faciliter l'accès au compte sans avoir à retaper l'URL.
 *
 * Le QR encode l'URL `/login` (page de saisie identifiant + mot de passe).
 * Volontairement PAS un magic link : Loris veut un QR qui mène à la
 * page de connexion classique pour que l'apprenant saisisse son
 * identifiant et son mot de passe affichés sur la convocation.
 *
 * Le QR n'est plus une URL fixe : si `entitySlug` est fourni, l'URL devient
 * `/login?entity=<slug>` afin de pré-remplir le sélecteur d'organisme côté
 * page login (apprenant sans email connecté par identifiant → plus de
 * « choisissez un organisme » manuel). Sans slug, repli sur `/login`.
 *
 * Async (QRCode.toDataURL retourne une Promise). À pré-calculer côté API
 * avant l'appel resolveDocumentVariables — le builder côté resolver est
 * sync et ne peut pas appeler la lib QRCode.
 *
 * @param entitySlug slug de l'entité de l'apprenant (`entities.slug`), optionnel
 * @returns data URL `data:image/png;base64,...` ou null en cas d'erreur
 */
export async function generateLoginQrDataUrl(
  entitySlug?: string,
): Promise<string | null> {
  try {
    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.URL ||
      "https://mrformationcrm.netlify.app"
    ).replace(/\/+$/, "");
    const loginUrl =
      typeof entitySlug === "string" && entitySlug.length > 0
        ? `${baseUrl}/login?entity=${encodeURIComponent(entitySlug)}`
        : `${baseUrl}/login`;
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

/**
 * Garde de robustesse pour le chargement du logo des PDF (devis, factures…).
 *
 * `fetch` ne lève PAS d'erreur sur un 404 : si le fichier logo est absent (cas
 * C3V `/logo-c3v-formation.png`), le corps de la réponse (HTML 404) finissait
 * passé à `jsPDF.addImage(..., "PNG")`, qui plante → document impossible à
 * générer. On ne retient donc le logo que si la réponse est `ok` ET de type image.
 */
export function isUsableImageResponse(ok: boolean, contentType: string | null): boolean {
  return ok && !!contentType && contentType.toLowerCase().startsWith("image/");
}

/**
 * Charge une image en data URL, ou `null` si indisponible/invalide (jamais
 * d'exception). Utilise `fetch` + `FileReader` (navigateur). Le paramètre
 * `fetchFn` permet l'injection en test.
 */
export async function loadImageDataUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchFn(url);
    if (!isUsableImageResponse(response.ok, response.headers.get("content-type"))) {
      return null;
    }
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

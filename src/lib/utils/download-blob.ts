/**
 * Convertit un PDF base64 en Blob téléchargeable et déclenche le download
 * dans le navigateur. Utilisé par les handlers Tab*Docs / Tab*Emargements
 * qui consomment la réponse de /api/documents/generate-from-template.
 *
 * Pourquoi pas data:application/pdf,<base64> : Chrome bloque ce schéma
 * dans certains contextes (iframe, popup) pour des raisons de sécurité.
 * Le pattern blob URL fonctionne universellement.
 */
export function downloadBase64Pdf(base64: string, filename: string): void {
  if (typeof window === "undefined") {
    throw new Error("downloadBase64Pdf can only be called from a browser environment");
  }
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick (laisse le browser démarrer le download)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

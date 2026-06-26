/**
 * Récupère un signed-URL pour un document via l'endpoint partagé
 * `/api/storage/signed-url` (contrôle rôle+entité côté serveur). À utiliser
 * côté client pour télécharger/prévisualiser un fichier sans exposer d'URL
 * publique permanente. Lève une erreur en cas d'échec (le caller gère le toast).
 */
export async function fetchSignedDocUrl(
  table: "formation_documents" | "program_documents" | "generated_documents" | "client_documents",
  id: string,
): Promise<string> {
  const res = await fetch("/api/storage/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, id }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Lien de téléchargement indisponible");
  }
  return data.url;
}

"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Breadcrumb conditionnel "← Retour à la formation".
 *
 * Affiche un lien retour vers /admin/formations/<id>?tab=<tab> si l'URL
 * actuelle contient les query params `from=formation` et `from_id=<uuid>`.
 * Sinon, ne rend rien (composant invisible).
 *
 * Usage : appelé en tête des pages /admin/documents, /admin/questionnaires, etc.
 * Doit être paired avec un Link href contenant ces query params côté origine :
 *   <Link href={`/admin/documents?from=formation&from_id=${formation.id}`}>
 */
export function BackToFormationLink({ defaultTab = "documents" }: { defaultTab?: string }) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const fromId = searchParams.get("from_id");
  const fromTab = searchParams.get("from_tab") || defaultTab;

  if (from !== "formation" || !fromId) return null;

  // Validation basique UUID (anti-injection : on construit une URL, donc on filtre)
  if (!/^[0-9a-f-]{32,36}$/i.test(fromId)) return null;

  return (
    <Link
      href={`/admin/formations/${fromId}?tab=${encodeURIComponent(fromTab)}`}
      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline mb-4"
    >
      <ArrowLeft className="h-4 w-4" />
      Retour à la formation
    </Link>
  );
}

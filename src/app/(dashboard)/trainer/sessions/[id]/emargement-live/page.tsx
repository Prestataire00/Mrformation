"use client";

import { useParams, useRouter } from "next/navigation";
import EmargementLiveView from "@/components/emargement/EmargementLiveView";

// Mode présentation émargement (formateur). Même composant que l'admin ;
// [id] = session_id. Les routes /api/emargement/{live-status,slots} autorisent
// le rôle trainer ; l'accès à la session est vérifié côté API (assignation).
export default function TrainerEmargementLivePage() {
  const params = useParams();
  const router = useRouter();
  return <EmargementLiveView sessionId={params.id as string} onQuit={() => router.back()} />;
}

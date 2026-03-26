"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Legacy redirect: /admin/trainings/[id] → /admin/trainings
 * Les formations sont maintenant gérées directement comme sessions.
 * La page de gestion détaillée est à /admin/formations/[sessionId].
 */
export default function TrainingDetailRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/trainings");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );
}

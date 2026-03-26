"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LearnerSessionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/learner/my-trainings");
  }, [router]);
  return null;
}

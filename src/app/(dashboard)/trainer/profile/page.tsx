import { ProfilePage } from "@/components/ProfilePage";
import { GmailConnectionCard } from "@/components/GmailConnectionCard";
import { TrainerCvCard } from "@/components/trainer/TrainerCvCard";
import { Suspense } from "react";

export default function TrainerProfilePage() {
  return (
    <div className="space-y-6">
      <ProfilePage />
      <TrainerCvCard />
      <Suspense>
        <GmailConnectionCard />
      </Suspense>
    </div>
  );
}

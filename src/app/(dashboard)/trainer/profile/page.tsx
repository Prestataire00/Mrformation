import { ProfilePage } from "@/components/ProfilePage";
import { GmailConnectionCard } from "@/components/GmailConnectionCard";
import { Suspense } from "react";

export default function TrainerProfilePage() {
  return (
    <div className="space-y-6">
      <ProfilePage />
      <Suspense>
        <GmailConnectionCard />
      </Suspense>
    </div>
  );
}

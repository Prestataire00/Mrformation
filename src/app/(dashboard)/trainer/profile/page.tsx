import { ProfilePage } from "@/components/ProfilePage";
import { TrainerCvCard } from "@/components/trainer/TrainerCvCard";

export default function TrainerProfilePage() {
  return (
    <div className="space-y-6">
      <ProfilePage />
      <TrainerCvCard />
    </div>
  );
}

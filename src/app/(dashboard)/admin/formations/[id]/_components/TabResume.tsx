"use client";

import type { Session } from "@/lib/types";
import { ResumeActions } from "./sections/ResumeActions";
import { ResumeManager } from "./sections/ResumeManager";
import { ResumeLocation } from "./sections/ResumeLocation";
import { ResumeTrainers } from "./sections/ResumeTrainers";
import { ResumeLearners } from "./sections/ResumeLearners";
import { ResumePriceHours } from "./sections/ResumePriceHours";
import { ResumeCompanies } from "./sections/ResumeCompanies";
import { ResumeFinanciers } from "./sections/ResumeFinanciers";
import { ResumeDescription } from "./sections/ResumeDescription";
import { ResumeComments } from "./sections/ResumeComments";
import { ResumeVisioLink } from "./sections/ResumeVisioLink";
import { ResumeDangerZone } from "./sections/ResumeDangerZone";

interface TabResumeProps {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabResume({ formation, onRefresh }: TabResumeProps) {
  return (
    <div className="space-y-6">
      <ResumeActions formation={formation} onRefresh={onRefresh} />
      <ResumeManager formation={formation} onRefresh={onRefresh} />
      <ResumeLocation formation={formation} onRefresh={onRefresh} />
      <ResumeTrainers formation={formation} onRefresh={onRefresh} />
      <ResumeLearners formation={formation} onRefresh={onRefresh} />
      <ResumePriceHours formation={formation} onRefresh={onRefresh} />
      <ResumeCompanies formation={formation} onRefresh={onRefresh} />
      <ResumeFinanciers formation={formation} onRefresh={onRefresh} />
      <ResumeDescription formation={formation} onRefresh={onRefresh} />
      <ResumeComments formation={formation} onRefresh={onRefresh} />
      <ResumeVisioLink formation={formation} onRefresh={onRefresh} />
      <ResumeDangerZone formation={formation} onRefresh={onRefresh} />
    </div>
  );
}

"use client";

import type { Session } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MapPin, Euro, Link2, GraduationCap } from "lucide-react";
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
      {/* Quick actions */}
      <ResumeActions formation={formation} onRefresh={onRefresh} />

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ COLONNE GAUCHE (2/3) ═══ */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card Intervenants */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-blue-500" />
                Intervenants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResumeManager formation={formation} onRefresh={onRefresh} />
              <div className="border-t pt-4">
                <ResumeTrainers formation={formation} onRefresh={onRefresh} />
              </div>
            </CardContent>
          </Card>

          {/* Card Participants */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-green-500" />
                Participants
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {formation.enrollments?.length || 0} apprenant{(formation.enrollments?.length || 0) !== 1 ? "s" : ""}
                  {(formation.formation_companies?.length || 0) > 0 && ` · ${formation.formation_companies?.length} entreprise${(formation.formation_companies?.length || 0) !== 1 ? "s" : ""}`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResumeCompanies formation={formation} onRefresh={onRefresh} />
              <div className="border-t pt-4">
                <ResumeLearners formation={formation} onRefresh={onRefresh} />
              </div>
            </CardContent>
          </Card>

          {/* Financeurs */}
          <ResumeFinanciers formation={formation} onRefresh={onRefresh} />

          {/* Description & Commentaires */}
          <ResumeDescription formation={formation} onRefresh={onRefresh} />
          <ResumeComments formation={formation} onRefresh={onRefresh} />
        </div>

        {/* ═══ COLONNE DROITE (1/3) ═══ */}
        <div className="space-y-6">
          {/* Lieu & modalités */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-500" />
                Lieu & modalités
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ResumeLocation formation={formation} onRefresh={onRefresh} />
              {formation.visio_link && (
                <div className="border-t pt-3">
                  <ResumeVisioLink formation={formation} onRefresh={onRefresh} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Infos formation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Euro className="h-4 w-4 text-emerald-500" />
                Infos formation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResumePriceHours formation={formation} onRefresh={onRefresh} />
            </CardContent>
          </Card>

          {/* Liens rapides & Danger zone */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4 text-gray-500" />
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResumeDangerZone formation={formation} onRefresh={onRefresh} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

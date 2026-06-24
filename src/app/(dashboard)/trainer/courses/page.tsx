"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { pickTrainerRecord } from "@/lib/auth/trainer-session-access";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BookOpen, FileText, ShieldCheck } from "lucide-react";
import { CourseMaterialsTab } from "@/components/trainer/CourseMaterialsTab";
import { SessionDocumentsTab } from "@/components/trainer/SessionDocumentsTab";
import { AdminDocumentsTab } from "@/components/trainer/AdminDocumentsTab";

export default function TrainerCoursesPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const [trainerId, setTrainerId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchTrainerId = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Multi-entité : un profil peut posséder plusieurs fiches (1/entité). On
      // prend celle de l'entité active ; mono-entité (cas courant) → la fiche
      // unique, strictement comme l'ancien .single() (aucune régression).
      const { data: trainers } = await supabase
        .from("trainers")
        .select("id, entity_id")
        .eq("profile_id", user.id);
      const trainer = pickTrainerRecord(trainers, entityId);

      if (trainer) setTrainerId(trainer.id);
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId]);

  useEffect(() => { fetchTrainerId(); }, [fetchTrainerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trainerId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Profil formateur non trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes Cours & Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Supports de cours, documents de session et documents administratifs
        </p>
      </div>

      <Tabs defaultValue="courses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="courses" className="gap-1.5 text-xs sm:text-sm">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Supports de cours</span>
            <span className="sm:hidden">Cours</span>
          </TabsTrigger>
          <TabsTrigger value="session-docs" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documents de session</span>
            <span className="sm:hidden">Session</span>
          </TabsTrigger>
          <TabsTrigger value="admin-docs" className="gap-1.5 text-xs sm:text-sm">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Documents administratifs</span>
            <span className="sm:hidden">Administratif</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="courses">
          <CourseMaterialsTab trainerId={trainerId} />
        </TabsContent>

        <TabsContent value="session-docs">
          <SessionDocumentsTab trainerId={trainerId} />
        </TabsContent>

        <TabsContent value="admin-docs">
          <AdminDocumentsTab trainerId={trainerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

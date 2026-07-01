"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSharedSupportsForLearner, type SharedSupport } from "@/lib/services/trainer-course-sharing";
import type { UploadedFile } from "@/components/trainer/types";
import { Upload, Trash2, FileText, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { fetchSignedDocUrl } from "@/lib/storage/fetch-signed-doc-url";
import { Badge } from "@/components/ui/badge";
import type { Session, FormationDocument, FormationDocCategory, ProgramDocument } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

interface DocSection {
  category: FormationDocCategory;
  title: string;
  subtitle: string;
  grouped?: "learner" | "trainer";
}

const SECTIONS: DocSection[] = [
  {
    category: "learner",
    title: "Documents Apprenants",
    subtitle: "Documents spécifiques par apprenant",
    grouped: "learner",
  },
  {
    category: "program_support",
    title: "Supports du programme",
    subtitle: "Supports pédagogiques accessibles à tous",
  },
  {
    category: "common",
    title: "Documents Communs",
    subtitle: "Documents partagés avec tous les participants",
  },
  {
    category: "private",
    title: "Documents Privés",
    subtitle: "Visibles uniquement par les administrateurs",
  },
  {
    category: "trainer",
    title: "Documents Formateurs",
    subtitle: "Documents par formateur",
    grouped: "trainer",
  },
  {
    category: "common_trainer",
    title: "Documents Communs (formateurs)",
    subtitle: "Documents partagés entre formateurs et administrateurs",
  },
];

export function TabDocsPartages({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Lot D : supports PUBLIÉS partagés par le formateur pour cette session (lecture seule).
  // getSharedSupportsForLearner est session-scoped (renvoie les supports publiés d'une session).
  const [trainerSupports, setTrainerSupports] = useState<SharedSupport[]>([]);
  useEffect(() => {
    let active = true;
    getSharedSupportsForLearner(supabase, [formation.id]).then((s) => {
      if (active) setTrainerSupports(s);
    });
    return () => {
      active = false;
    };
  }, [supabase, formation.id]);

  const handleDownloadTrainerFile = async (courseId: string, file: UploadedFile) => {
    try {
      const res = await fetch(`/api/trainer/courses/${courseId}/file-url?path=${encodeURIComponent(file.path)}`);
      if (!res.ok) throw new Error("Impossible de générer le lien");
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléchargement impossible.",
        variant: "destructive",
      });
    }
  };

  const documents = formation.formation_documents || [];
  const enrollments = formation.enrollments || [];
  const trainers = formation.formation_trainers || [];
  // Supports hérités du programme (source unique, lecture seule : gérés sur la
  // page détail du programme). Publiés automatiquement à toutes ses sessions.
  const programDocs = formation.program?.program_documents || [];

  const getDocsForCategory = (category: FormationDocCategory, entityId?: string) => {
    return documents.filter((d) => {
      if (d.category !== category) return false;
      if (category === "learner" && entityId) return d.learner_id === entityId;
      if (category === "trainer" && entityId) return d.trainer_id === entityId;
      return true;
    });
  };

  const handleUpload = async (
    category: FormationDocCategory,
    file: File,
    learnerId?: string,
    trainerId?: string
  ) => {
    const uploadKey = `${category}-${learnerId || trainerId || "general"}`;
    setUploading(uploadKey);

    try {
      // Upload to Supabase Storage
      const filePath = `${formation.id}/${category}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("formation-docs")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("formation-docs")
        .getPublicUrl(filePath);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Insert document record
      const { error: insertError } = await supabase.from("formation_documents").insert({
        session_id: formation.id,
        category,
        learner_id: learnerId || null,
        trainer_id: trainerId || null,
        file_name: file.name,
        file_url: urlData.publicUrl,
        uploaded_by: user?.id || null,
      });

      if (insertError) throw insertError;

      toast({ title: "Document partagé" });
      await onRefresh();
    } catch (error) {
      console.error("[TabDocsPartages] handleUpload failed:", error);
      const message = error instanceof Error ? error.message : "Impossible d'uploader le document";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      return;
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (doc: FormationDocument) => {
    setDeleting(doc.id);

    // Extract file path from URL for storage deletion (non-blocking)
    try {
      const urlParts = doc.file_url.split("/formation-docs/");
      if (urlParts[1]) {
        await supabase.storage.from("formation-docs").remove([urlParts[1]]);
      }
    } catch (storageError) {
      console.warn("[TabDocsPartages] Storage deletion failed (non-blocking):", storageError);
    }

    try {
      const { error } = await supabase.from("formation_documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast({ title: "Document supprimé" });
      await onRefresh();
    } catch (error) {
      console.error("[TabDocsPartages] handleDelete failed:", error);
      const message = error instanceof Error ? error.message : "Impossible de supprimer le document";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      return;
    } finally {
      setDeleting(null);
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    category: FormationDocCategory,
    learnerId?: string,
    trainerId?: string
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(category, file, learnerId, trainerId);
    }
    e.target.value = "";
  };

  const handleOpenDoc = async (doc: FormationDocument) => {
    try {
      const url = await fetchSignedDocUrl("formation_documents", doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléchargement impossible.",
        variant: "destructive",
      });
    }
  };

  const handleOpenProgramDoc = async (doc: ProgramDocument) => {
    try {
      const url = await fetchSignedDocUrl("program_documents", doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléchargement impossible.",
        variant: "destructive",
      });
    }
  };

  // Liste lecture seule des supports hérités du programme (pas de suppression
  // ici : la gestion se fait sur la page détail du programme).
  const renderProgramDocs = () => {
    if (programDocs.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Hérités du programme</Badge>
        </div>
        {programDocs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-2 bg-blue-50/50 rounded-lg"
          >
            <button
              type="button"
              onClick={() => handleOpenProgramDoc(doc)}
              className="flex items-center gap-2 text-sm hover:underline flex-1 min-w-0 text-left"
            >
              <FileText className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="truncate">{doc.file_name}</span>
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderDocList = (docs: FormationDocument[], uploadKey: string) => (
    <div className="space-y-2">
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
          <button
            type="button"
            onClick={() => handleOpenDoc(doc)}
            className="flex items-center gap-2 text-sm hover:underline flex-1 min-w-0 text-left"
          >
            <FileText className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="truncate">{doc.file_name}</span>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="text-red-500 hover:text-red-700 shrink-0"
            onClick={() => handleDelete(doc)}
            disabled={deleting === doc.id}
          >
            {deleting === doc.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ))}
      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Aucun document</p>
      )}
    </div>
  );

  const renderUploadButton = (
    category: FormationDocCategory,
    learnerId?: string,
    trainerId?: string
  ) => {
    const key = `${category}-${learnerId || trainerId || "general"}`;
    const isUploading = uploading === key;
    return (
      <>
        <input
          type="file"
          ref={(el) => { fileInputRefs.current[key] = el; }}
          className="hidden"
          onChange={(e) => handleFileChange(e, category, learnerId, trainerId)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRefs.current[key]?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          Ajouter
        </Button>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{formation.title} — Documents Partagés</h2>

      {trainerSupports.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> Supports partagés par le formateur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trainerSupports.map((s) => (
              <div key={s.link_id} className="p-3 bg-green-50/50 rounded-lg">
                <p className="font-medium text-sm">{s.course.title}</p>
                {s.course.description && (
                  <p className="text-xs text-muted-foreground mb-1">{s.course.description}</p>
                )}
                <div className="space-y-1 mt-2">
                  {s.course.files.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleDownloadTrainerFile(s.course.id, f)}
                      className="flex items-center gap-2 text-sm hover:underline text-left"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-green-600" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {SECTIONS.map((section) => (
        <Card key={section.category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              {section.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{section.subtitle}</p>
          </CardHeader>
          <CardContent>
            {section.grouped === "learner" ? (
              // Grouped by learner
              <div className="space-y-4">
                {enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Aucun apprenant inscrit</p>
                ) : (
                  enrollments.map((enrollment) => {
                    const learner = enrollment.learner;
                    if (!learner) return null;
                    const docs = getDocsForCategory("learner", learner.id);
                    return (
                      <div key={enrollment.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {learner.first_name} {learner.last_name}
                          </span>
                          {renderUploadButton("learner", learner.id)}
                        </div>
                        {renderDocList(docs, `learner-${learner.id}`)}
                      </div>
                    );
                  })
                )}
              </div>
            ) : section.grouped === "trainer" ? (
              // Grouped by trainer
              <div className="space-y-4">
                {trainers.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Aucun formateur assigné</p>
                ) : (
                  trainers.map((ft) => {
                    const trainer = ft.trainer;
                    if (!trainer) return null;
                    const docs = getDocsForCategory("trainer", trainer.id);
                    return (
                      <div key={ft.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {trainer.first_name} {trainer.last_name}
                          </span>
                          {renderUploadButton("trainer", undefined, trainer.id)}
                        </div>
                        {renderDocList(docs, `trainer-${trainer.id}`)}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              // Simple category
              <div className="space-y-3">
                {section.category === "program_support" && renderProgramDocs()}
                {renderDocList(getDocsForCategory(section.category), `${section.category}-general`)}
                <div>{renderUploadButton(section.category)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

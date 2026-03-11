"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trainer, TrainerCompetency, Session } from "@/lib/types";
import { cn, getInitials, formatCurrency, formatDate, formatDateTime, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  X,
  CalendarDays,
  Clock,
  Star,
  MapPin,
  Monitor,
  Users,
  Upload,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";

type TrainerWithCompetencies = Trainer & { competencies: TrainerCompetency[] };

type SessionWithTraining = Session & {
  training: { title: string } | null;
  _count: { enrollments: number };
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  expert: "Expert",
};

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  expert: "bg-red-100 text-red-700",
};

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

const MODE_COLORS: Record<string, string> = {
  presentiel: "bg-teal-100 text-teal-700",
  distanciel: "bg-purple-100 text-purple-700",
  hybride: "bg-indigo-100 text-indigo-700",
};

export default function TrainerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [trainer, setTrainer] = useState<TrainerWithCompetencies | null>(null);
  const [sessions, setSessions] = useState<SessionWithTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    type: "internal" as "internal" | "external",
    bio: "",
    hourly_rate: "",
    availability_notes: "",
  });

  // CV upload
  const [uploading, setUploading] = useState(false);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvTextLength, setCvTextLength] = useState(0);

  // Competencies
  const [newCompetency, setNewCompetency] = useState({ competency: "", level: "intermediate" as "beginner" | "intermediate" | "expert" });
  const [addingComp, setAddingComp] = useState(false);

  // Delete competency confirmation
  const [compToDelete, setCompToDelete] = useState<TrainerCompetency | null>(null);

  const fetchTrainer = useCallback(async () => {
    setLoading(true);

    // Try with competencies join first
    let { data, error } = await supabase
      .from("trainers")
      .select("*, competencies:trainer_competencies(*)")
      .eq("id", id)
      .single();

    // Fallback: if join fails, fetch trainer alone
    if (error) {
      console.warn("trainer_competencies join failed:", error.message);
      const fallback = await supabase
        .from("trainers")
        .select("*")
        .eq("id", id)
        .single();
      data = fallback.data ? { ...fallback.data, competencies: [] } : null;
      error = fallback.error;
    }

    if (error || !data) {
      toast({ title: "Erreur", description: "Formateur introuvable.", variant: "destructive" });
      router.push("/admin/trainers");
      return;
    }

    const t = data as TrainerWithCompetencies;
    setTrainer(t);
    setFormData({
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email || "",
      phone: t.phone || "",
      type: t.type,
      bio: t.bio || "",
      hourly_rate: t.hourly_rate?.toString() || "",
      availability_notes: t.availability_notes || "",
    });
    // CV fields
    const raw = t as unknown as Record<string, unknown>;
    setCvUrl(raw.cv_url as string | null);
    setCvTextLength((raw.cv_text as string)?.length || 0);
    setLoading(false);
  }, [id]);

  const fetchSessions = useCallback(async () => {
    const { data } = await supabase
      .from("sessions")
      .select("*, training:trainings(title), enrollments:enrollments(id)")
      .eq("trainer_id", id)
      .order("start_date", { ascending: false });

    if (data) {
      const mapped = (data as unknown[]).map((s: unknown) => {
        const sess = s as Record<string, unknown>;
        const enrollments = sess.enrollments as unknown[];
        return {
          ...sess,
          _count: { enrollments: enrollments?.length ?? 0 },
        };
      });
      setSessions(mapped as SessionWithTraining[]);
    }
  }, [id]);

  useEffect(() => {
    fetchTrainer();
    fetchSessions();
  }, [fetchTrainer, fetchSessions]);

  const handleSaveProfile = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({ title: "Champs requis", description: "Prénom et nom sont obligatoires.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("trainers")
      .update({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        type: formData.type,
        bio: formData.bio.trim() || null,
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        availability_notes: formData.availability_notes.trim() || null,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profil mis à jour", description: "Les informations ont été enregistrées." });
      await fetchTrainer();
    }
    setSaving(false);
  };

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Format invalide", description: "Seuls les fichiers PDF sont acceptés.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("cv", file);

      const res = await fetch(`/api/trainers/${id}/cv`, {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Erreur lors de l'upload");
      }

      setCvUrl(result.cv_url);
      setCvTextLength(result.cv_text_length || 0);
      toast({
        title: "CV uploadé",
        description: result.cv_text_length > 0
          ? `Texte extrait (${result.cv_text_length} caractères) — recherche par mots-clés activée.`
          : "Fichier enregistré (extraction du texte non disponible).",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  };

  const handleAddCompetency = async () => {
    if (!newCompetency.competency.trim()) return;
    setAddingComp(true);
    const { error } = await supabase.from("trainer_competencies").insert({
      trainer_id: id,
      competency: newCompetency.competency.trim(),
      level: newCompetency.level,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setNewCompetency({ competency: "", level: "intermediate" });
      await fetchTrainer();
    }
    setAddingComp(false);
  };

  const handleDeleteCompetency = async (comp: TrainerCompetency) => {
    const { error } = await supabase.from("trainer_competencies").delete().eq("id", comp.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Compétence supprimée" });
      setCompToDelete(null);
      await fetchTrainer();
    }
  };

  // Stats
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const totalHours = sessions.reduce((acc, s) => {
    if (!s.start_date || !s.end_date) return acc;
    const diff = (new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / (1000 * 60 * 60);
    return acc + Math.max(0, diff);
  }, 0);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!trainer) return null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/trainers")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-indigo-100 text-indigo-700 font-semibold">
              {getInitials(trainer.first_name, trainer.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {trainer.first_name} {trainer.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                className={cn(
                  "text-xs",
                  trainer.type === "internal"
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                    : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                )}
              >
                {trainer.type === "internal" ? "Interne" : "Externe"}
              </Badge>
              {trainer.email && <span className="text-sm text-gray-500">{trainer.email}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
              <p className="text-xs text-gray-500">Sessions totales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{Math.round(totalHours)}</p>
              <p className="text-xs text-gray-500">Heures formées</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-yellow-50 flex items-center justify-center">
              <Star className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{completedSessions}</p>
              <p className="text-xs text-gray-500">Sessions terminées</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profil">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="competences">Compétences</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        {/* PROFIL TAB */}
        <TabsContent value="profil" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations personnelles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Prénom <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData((p) => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData((p) => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Téléphone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData((p) => ({ ...p, type: v as "internal" | "external" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Interne</SelectItem>
                      <SelectItem value="external">Externe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Taux horaire (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData((p) => ({ ...p, hourly_rate: e.target.value }))}
                  placeholder="75.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Biographie</Label>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
                  rows={4}
                  placeholder="Présentation du formateur..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes de disponibilité</Label>
                <Textarea
                  value={formData.availability_notes}
                  onChange={(e) => setFormData((p) => ({ ...p, availability_notes: e.target.value }))}
                  rows={2}
                  placeholder="Ex: Disponible du lundi au vendredi..."
                />
              </div>
              {/* CV Upload */}
              <Separator />
              <div className="space-y-3">
                <Label className="text-base font-semibold">Curriculum Vitae (PDF)</Label>
                {cvUrl ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <FileText className="h-5 w-5 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800">CV enregistré</p>
                      <p className="text-xs text-green-600">
                        {cvTextLength > 0
                          ? `${cvTextLength.toLocaleString("fr-FR")} caractères extraits — recherche par mots-clés active`
                          : "Fichier enregistré"}
                      </p>
                    </div>
                    <a
                      href={cvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-green-700 hover:text-green-900"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border-2 border-dashed border-gray-200 text-center">
                    <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Aucun CV uploadé</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Uploadez un PDF pour activer la recherche par mots-clés dans la CVthèque
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={handleCvUpload}
                      disabled={uploading}
                    />
                    <span className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition",
                      uploading
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 cursor-pointer"
                    )}>
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyse en cours...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          {cvUrl ? "Remplacer le CV" : "Uploader un CV"}
                        </>
                      )}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPETENCES TAB */}
        <TabsContent value="competences" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compétences ({trainer.competencies.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* List */}
              {trainer.competencies.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Aucune compétence renseignée.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trainer.competencies.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border">
                      <div className="flex items-center gap-3">
                        <Badge className={cn("text-xs font-medium", LEVEL_COLORS[c.level])}>
                          {LEVEL_LABELS[c.level]}
                        </Badge>
                        <span className="text-sm font-medium text-gray-800">{c.competency}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-red-600"
                        onClick={() => setCompToDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              {/* Add new */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Ajouter une compétence</p>
                <Input
                  placeholder="Ex: React, Gestion de projet, Excel..."
                  value={newCompetency.competency}
                  onChange={(e) => setNewCompetency((p) => ({ ...p, competency: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCompetency()}
                />
                <div className="flex gap-2">
                  <Select
                    value={newCompetency.level}
                    onValueChange={(v) => setNewCompetency((p) => ({ ...p, level: v as typeof newCompetency.level }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Débutant</SelectItem>
                      <SelectItem value="intermediate">Intermédiaire</SelectItem>
                      <SelectItem value="expert">Expert</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddCompetency}
                    disabled={addingComp || !newCompetency.competency.trim()}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SESSIONS TAB */}
        <TabsContent value="sessions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions assignées ({sessions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CalendarDays className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Aucune session assignée à ce formateur.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div key={session.id} className="p-4 rounded-lg border bg-gray-50 hover:bg-white transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900 truncate">{session.title}</p>
                            <Badge className={cn("text-xs", STATUS_COLORS[session.status] || "bg-gray-100 text-gray-600")}>
                              {SESSION_STATUS_LABELS[session.status] || session.status}
                            </Badge>
                            <Badge className={cn("text-xs", MODE_COLORS[session.mode] || "bg-gray-100 text-gray-600")}>
                              {MODE_LABELS[session.mode] || session.mode}
                            </Badge>
                          </div>
                          {session.training && (
                            <p className="text-xs text-gray-500">{session.training.title}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(session.start_date)} — {formatDate(session.end_date)}
                            </span>
                            {session.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {session.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {session._count.enrollments} inscrit{session._count.enrollments !== 1 ? "s" : ""}
                              {session.max_participants ? ` / ${session.max_participants}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Competency Confirmation */}
      <Dialog open={!!compToDelete} onOpenChange={(o) => !o && setCompToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer la compétence</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer <strong>{compToDelete?.competency}</strong> ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompToDelete(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => compToDelete && handleDeleteCompetency(compToDelete)}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

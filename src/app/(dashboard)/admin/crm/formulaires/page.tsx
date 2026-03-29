"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Loader2, Link2, Send, ExternalLink, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface QItem {
  id: string;
  title: string;
  type: string;
  is_active: boolean;
  quality_indicator_type: string | null;
  questions_count: number;
}

interface SessionItem {
  id: string;
  title: string;
  start_date: string | null;
}

interface LearnerItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  client_id: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  satisfaction: "Satisfaction",
  evaluation: "Évaluation",
  survey: "Enquête",
};

const TYPE_COLORS: Record<string, string> = {
  satisfaction: "bg-green-100 text-green-700",
  evaluation: "bg-blue-100 text-blue-700",
  survey: "bg-violet-100 text-violet-700",
};

export default function FormulairesPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const router = useRouter();

  const [questionnaires, setQuestionnaires] = useState<QItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign dialog
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignQ, setAssignQ] = useState<QItem | null>(null);
  const [assignSessionId, setAssignSessionId] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Send dialog
  const [sendDialog, setSendDialog] = useState(false);
  const [sendQ, setSendQ] = useState<QItem | null>(null);
  const [sendSessionId, setSendSessionId] = useState("");
  const [segmentation, setSegmentation] = useState<"all" | "company" | "individual">("all");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [sessionLearners, setSessionLearners] = useState<LearnerItem[]>([]);
  const [loadingLearners, setLoadingLearners] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    const [qRes, sRes] = await Promise.all([
      supabase
        .from("questionnaires")
        .select("id, title, type, is_active, quality_indicator_type, questions(id)")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sessions")
        .select("id, title, start_date")
        .eq("entity_id", entityId)
        .order("start_date", { ascending: false }),
    ]);

    setQuestionnaires(
      (qRes.data ?? []).map((q: any) => ({
        id: q.id,
        title: q.title,
        type: q.type,
        is_active: q.is_active,
        quality_indicator_type: q.quality_indicator_type,
        questions_count: Array.isArray(q.questions) ? q.questions.length : 0,
      }))
    );
    setSessions((sRes.data as SessionItem[]) ?? []);
    setLoading(false);
  }, [supabase, entityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchLearners = useCallback(async (sessionId: string) => {
    setLoadingLearners(true);
    const { data } = await supabase
      .from("enrollments")
      .select("learner_id, learner:learners!enrollments_learner_id_fkey(id, first_name, last_name, email, client_id)")
      .eq("session_id", sessionId)
      .neq("status", "cancelled");

    const learners = (data ?? [])
      .map((e: any) => e.learner as LearnerItem)
      .filter(Boolean);
    setSessionLearners(learners);
    setLoadingLearners(false);
  }, [supabase]);

  // Assign
  const openAssign = (q: QItem) => {
    setAssignQ(q);
    setAssignSessionId("");
    setAutoSend(false);
    setAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!assignQ || !assignSessionId) return;
    setAssigning(true);
    const { error } = await supabase
      .from("questionnaire_sessions")
      .upsert({
        questionnaire_id: assignQ.id,
        session_id: assignSessionId,
        auto_send_on_completion: autoSend,
      }, { onConflict: "questionnaire_id,session_id" });
    setAssigning(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Questionnaire attribué à la formation" });
      setAssignDialog(false);
    }
  };

  // Send
  const openSend = (q: QItem) => {
    setSendQ(q);
    setSendSessionId("");
    setSegmentation("all");
    setSelectedLearnerId("");
    setSelectedCompanyId("");
    setSessionLearners([]);
    setSendDialog(true);
  };

  const handleSendSessionChange = (sessionId: string) => {
    setSendSessionId(sessionId);
    setSegmentation("all");
    setSelectedLearnerId("");
    setSelectedCompanyId("");
    if (sessionId) fetchLearners(sessionId);
    else setSessionLearners([]);
  };

  const handleSendEmails = async () => {
    if (!sendQ || !sendSessionId) return;

    let targets = sessionLearners.filter((l) => l.email);

    if (segmentation === "company" && selectedCompanyId) {
      targets = targets.filter((l) => l.client_id === selectedCompanyId);
    } else if (segmentation === "individual" && selectedLearnerId) {
      targets = targets.filter((l) => l.id === selectedLearnerId);
    }

    if (targets.length === 0) {
      toast({ title: "Aucun destinataire avec email", variant: "destructive" });
      return;
    }

    setSending(true);
    const baseUrl = window.location.origin;
    let sent = 0;

    for (const learner of targets) {
      const link = `${baseUrl}/learner/questionnaires/${sendQ.id}?session_id=${sendSessionId}`;
      try {
        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: learner.email,
            subject: `Questionnaire — ${sendQ.title}`,
            body: `Bonjour ${learner.first_name},\n\nNous vous invitons à remplir le questionnaire suivant :\n\n${link}\n\nMerci,\nL'équipe formation`,
          }),
        });
        if (res.ok) sent++;
      } catch { /* continue */ }
    }

    setSending(false);
    toast({ title: `${sent} email${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}` });
    setSendDialog(false);
  };

  // Companies from learners
  const companies = Array.from(
    new Map(
      sessionLearners
        .filter((l) => l.client_id)
        .map((l) => [l.client_id, l.client_id])
    ).keys()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formulaires & Questionnaires</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Attribuez et envoyez des questionnaires aux apprenants
          </p>
        </div>
        <Button
          onClick={() => router.push("/admin/questionnaires")}
          style={{ background: "#3DB5C5" }}
          className="text-white hover:opacity-90"
        >
          Gérer les questionnaires
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Titre</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Questions</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Statut</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {questionnaires.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-gray-400">
                  Aucun questionnaire trouvé
                </td>
              </tr>
            ) : (
              questionnaires.map((q) => (
                <tr key={q.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{q.title}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${TYPE_COLORS[q.type] ?? "bg-gray-100 text-gray-700"} hover:${TYPE_COLORS[q.type] ?? "bg-gray-100"} text-xs`}>
                      {TYPE_LABELS[q.type] ?? q.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{q.questions_count}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={q.is_active ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                      {q.is_active ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openAssign(q)}>
                        <Link2 className="h-3 w-3" /> Attribuer
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-[#3DB5C5]" onClick={() => openSend(q)}>
                        <Mail className="h-3 w-3" /> Envoyer
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push("/admin/questionnaires")}>
                        <ExternalLink className="h-3 w-3" /> Réponses
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attribuer &quot;{assignQ?.title}&quot; à une formation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Formation</Label>
              <Select value={assignSessionId} onValueChange={setAssignSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une formation..." />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} {s.start_date ? `(${new Date(s.start_date).toLocaleDateString("fr-FR")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={autoSend} onCheckedChange={setAutoSend} />
              Envoi automatique à la fin de la session
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Annuler</Button>
            <Button onClick={handleAssign} disabled={assigning || !assignSessionId}>
              {assigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Attribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer &quot;{sendQ?.title}&quot; par email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Formation</Label>
              <Select value={sendSessionId} onValueChange={handleSendSessionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une formation..." />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} {s.start_date ? `(${new Date(s.start_date).toLocaleDateString("fr-FR")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sendSessionId && (
              <>
                {loadingLearners ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Destinataires</Label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="seg" checked={segmentation === "all"} onChange={() => setSegmentation("all")} />
                          Tous les apprenants ({sessionLearners.filter((l) => l.email).length} avec email)
                        </label>
                        {companies.length > 0 && (
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name="seg" checked={segmentation === "company"} onChange={() => setSegmentation("company")} />
                            Par entreprise
                          </label>
                        )}
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="seg" checked={segmentation === "individual"} onChange={() => setSegmentation("individual")} />
                          Individuel
                        </label>
                      </div>
                    </div>

                    {segmentation === "company" && (
                      <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une entreprise..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((cId) => {
                            const count = sessionLearners.filter((l) => l.client_id === cId && l.email).length;
                            return (
                              <SelectItem key={cId!} value={cId!}>
                                Entreprise ({count} apprenant{count > 1 ? "s" : ""})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}

                    {segmentation === "individual" && (
                      <Select value={selectedLearnerId} onValueChange={setSelectedLearnerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un apprenant..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sessionLearners.filter((l) => l.email).map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.first_name} {l.last_name} — {l.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Un email avec le lien du questionnaire sera envoyé à chaque apprenant sélectionné.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>Annuler</Button>
            <Button onClick={handleSendEmails} disabled={sending || !sendSessionId}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" /> Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

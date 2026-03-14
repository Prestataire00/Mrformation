"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, Clock, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import type {
  Session, EmailTemplate, EmailHistory, EmailRecipientType,
} from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────
interface Recipient {
  id: string;
  name: string;
  email: string | null;
  type: EmailRecipientType;
}

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

type DialogMode = "template" | "libre" | "schedule_template" | "schedule_libre";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  sent: { label: "Envoyé", className: "bg-green-100 text-green-700" },
  failed: { label: "Échoué", className: "bg-red-100 text-red-700" },
  pending: { label: "En attente", className: "bg-yellow-100 text-yellow-700" },
};

// ─── Component ───────────────────────────────────────────────────
export function TabMessagerie({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [emailHistory, setEmailHistory] = useState<EmailHistory[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("libre");
  const [dialogRecipients, setDialogRecipients] = useState<Recipient[]>([]);
  const [isMass, setIsMass] = useState(false);

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [sending, setSending] = useState(false);

  // ─── Data ────────────────────────────────────────────────────
  const enrollments = formation.enrollments || [];
  const companies = formation.formation_companies || [];
  const trainers = formation.formation_trainers || [];
  const financiers = formation.formation_financiers || [];
  const manager = formation.manager;

  // Build recipient lists
  const learnerRecipients: Recipient[] = enrollments
    .filter((e) => e.learner)
    .map((e) => ({
      id: e.learner!.id,
      name: `${e.learner!.first_name} ${e.learner!.last_name}`,
      email: e.learner!.email,
      type: "learner" as const,
    }));

  const companyRecipients: Recipient[] = companies
    .filter((c) => c.client)
    .map((c) => ({
      id: c.client_id,
      name: c.client!.company_name,
      email: c.email || null,
      type: "client" as const,
    }));

  const trainerRecipients: Recipient[] = trainers
    .filter((t) => t.trainer)
    .map((t) => ({
      id: t.trainer!.id,
      name: `${t.trainer!.first_name} ${t.trainer!.last_name}`,
      email: t.trainer!.email,
      type: "trainer" as const,
    }));

  const financierRecipients: Recipient[] = financiers.map((f) => ({
    id: f.id,
    name: f.name,
    email: null,
    type: "financier" as const,
  }));

  // ─── Fetch email history for this formation ──────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("email_history")
      .select("*, template:email_templates(id, name, type)")
      .eq("session_id", formation.id)
      .order("sent_at", { ascending: false });
    setEmailHistory((data as EmailHistory[]) || []);
    setLoadingHistory(false);
  }, [formation.id, supabase]);

  const fetchTemplates = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .eq("entity_id", profile.entity_id)
      .order("name");
    setTemplates((data as EmailTemplate[]) || []);
  }, [supabase]);

  useEffect(() => {
    fetchHistory();
    fetchTemplates();
  }, [fetchHistory, fetchTemplates]);

  // ─── Filter history by recipient ─────────────────────────────
  const getHistoryFor = (email: string | null) => {
    if (!email) return [];
    return emailHistory.filter(
      (h) => h.recipient_email.toLowerCase() === email.toLowerCase()
    );
  };

  // ─── Open dialog ─────────────────────────────────────────────
  const openDialog = (mode: DialogMode, recipients: Recipient[], mass = false) => {
    setDialogMode(mode);
    setDialogRecipients(recipients);
    setIsMass(mass);
    setSelectedTemplateId("");
    setEmailSubject("");
    setEmailBody("");
    setScheduleDate("");
    setScheduleTime("");
    setDialogOpen(true);
  };

  // ─── Apply template ──────────────────────────────────────────
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      // Resolve variables for first recipient
      const r = dialogRecipients[0];
      const learner = r?.type === "learner"
        ? enrollments.find((e) => e.learner?.id === r.id)?.learner
        : undefined;
      const trainer = r?.type === "trainer"
        ? trainers.find((t) => t.trainer?.id === r.id)?.trainer
        : undefined;
      const client = r?.type === "client"
        ? companies.find((c) => c.client_id === r.id)?.client
        : undefined;

      const resolved = {
        session: formation,
        learner: learner || null,
        trainer: trainer || null,
        client: client || null,
      };
      setEmailSubject(resolveVariables(tmpl.subject, resolved));
      setEmailBody(resolveVariables(tmpl.body, resolved));
    }
  };

  // ─── Send email(s) ───────────────────────────────────────────
  const handleSend = async () => {
    if (!emailSubject.trim()) {
      toast({ title: "L'objet est requis", variant: "destructive" });
      return;
    }

    const isSchedule = dialogMode === "schedule_template" || dialogMode === "schedule_libre";

    setSending(true);
    let successCount = 0;
    let failCount = 0;

    for (const recipient of dialogRecipients) {
      if (!recipient.email) {
        failCount++;
        continue;
      }

      // Resolve per-recipient variables for mass sends
      let subject = emailSubject;
      let body = emailBody;
      if (isMass && (dialogMode === "template" || dialogMode === "schedule_template")) {
        const tmpl = templates.find((t) => t.id === selectedTemplateId);
        if (tmpl) {
          const learner = recipient.type === "learner"
            ? enrollments.find((e) => e.learner?.id === recipient.id)?.learner
            : undefined;
          const resolved = {
            session: formation,
            learner: learner || null,
            trainer: null,
            client: null,
          };
          subject = resolveVariables(tmpl.subject, resolved);
          body = resolveVariables(tmpl.body, resolved);
        }
      }

      if (isSchedule) {
        // Store as pending in email_history directly
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("entity_id")
          .eq("id", user?.id || "")
          .single();

        const { error } = await supabase.from("email_history").insert({
          entity_id: profile?.entity_id,
          template_id: selectedTemplateId || null,
          recipient_email: recipient.email,
          subject,
          body,
          status: "pending",
          sent_by: user?.id || null,
          sent_at: scheduleDate && scheduleTime
            ? `${scheduleDate}T${scheduleTime}:00`
            : new Date().toISOString(),
          session_id: formation.id,
          recipient_type: recipient.type,
          recipient_id: recipient.id,
        });
        if (error) failCount++;
        else successCount++;
      } else {
        // Send immediately via API
        try {
          const res = await fetch("/api/emails/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: recipient.email,
              subject,
              body,
              template_id: selectedTemplateId || undefined,
              session_id: formation.id,
              recipient_type: recipient.type,
              recipient_id: recipient.id,
            }),
          });
          const data = await res.json();
          if (data.success) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }
    }

    setSending(false);
    setDialogOpen(false);

    if (successCount > 0) {
      toast({
        title: isSchedule
          ? `${successCount} email(s) programmé(s)`
          : `${successCount} email(s) envoyé(s)`,
      });
    }
    if (failCount > 0) {
      toast({
        title: `${failCount} échec(s)`,
        description: "Vérifiez les adresses email",
        variant: "destructive",
      });
    }

    fetchHistory();
  };

  // ─── Render action buttons for a recipient group ─────────────
  const renderActionButtons = (recipients: Recipient[], mass = false) => {
    const isTemplate = (mode: DialogMode) => mode === "template" || mode === "schedule_template";
    const btnClass = (variant: "green" | "orange") =>
      variant === "green"
        ? "bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
        : "bg-orange-400 hover:bg-orange-500 text-white text-xs";

    const prefix = mass ? " en mass" : "";

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className={btnClass("green")}
          onClick={() => openDialog("template", recipients, mass)}
        >
          <Mail className="h-3 w-3 mr-1" /> Envoyer un e-mail (template){prefix}
        </Button>
        <Button
          size="sm"
          className={btnClass("orange")}
          onClick={() => openDialog("libre", recipients, mass)}
        >
          <Mail className="h-3 w-3 mr-1" /> Envoyer un e-mail (libre){prefix}
        </Button>
        <Button
          size="sm"
          className={btnClass("orange")}
          onClick={() => openDialog("schedule_libre", recipients, mass)}
        >
          <Clock className="h-3 w-3 mr-1" /> Programmer un e-mail (libre){prefix}
        </Button>
        <Button
          size="sm"
          className={btnClass("orange")}
          onClick={() => openDialog("schedule_template", recipients, mass)}
        >
          <Clock className="h-3 w-3 mr-1" /> Programmer un e-mail (Template){prefix}
        </Button>
      </div>
    );
  };

  // ─── Render email history table ──────────────────────────────
  const renderHistory = (recipientEmail: string | null) => {
    const history = getHistoryFor(recipientEmail);
    if (history.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic mt-2">
          Pas d&apos;emails envoyés{recipientEmail ? ` à ${recipientEmail}` : ""}
        </p>
      );
    }
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-semibold">Date</th>
              <th className="text-left py-2 px-3 font-semibold">Objet</th>
              <th className="text-left py-2 px-3 font-semibold">Email</th>
              <th className="text-left py-2 px-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const badge = STATUS_BADGES[h.status] || STATUS_BADGES.pending;
              return (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                    {new Date(h.sent_at).toLocaleString("fr-FR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="py-2 px-3">{h.subject}</td>
                  <td className="py-2 px-3 text-muted-foreground">{h.recipient_email}</td>
                  <td className="py-2 px-3">
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ─── Render a recipient section ──────────────────────────────
  const renderRecipientSection = (
    title: string,
    recipients: Recipient[],
    showMassButtons = false
  ) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg uppercase">
          {title} ({recipients.length}):
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showMassButtons && recipients.length > 0 && (
          <div className="mb-4">{renderActionButtons(recipients, true)}</div>
        )}

        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun</p>
        ) : (
          recipients.map((r) => (
            <div key={r.id} className="bg-muted/20 rounded-lg p-4 space-y-3">
              <p className="font-medium">{r.name}</p>
              {renderHistory(r.email)}
              <div className="pt-2">{renderActionButtons([r])}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );

  // ─── Dialog title ────────────────────────────────────────────
  const dialogTitle = (() => {
    const isSchedule = dialogMode.startsWith("schedule");
    const isTemplate = dialogMode.includes("template");
    const action = isSchedule ? "Programmer" : "Envoyer";
    const type = isTemplate ? "(template)" : "(libre)";
    const mass = isMass ? " en mass" : "";
    return `${action} un e-mail ${type}${mass}`;
  })();

  const isTemplate = dialogMode === "template" || dialogMode === "schedule_template";
  const isSchedule = dialogMode === "schedule_template" || dialogMode === "schedule_libre";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{formation.title}</h2>

      {loadingHistory ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* APPRENANTS */}
          {renderRecipientSection("Apprenants", learnerRecipients, true)}

          {/* ENTREPRISES */}
          {renderRecipientSection("Entreprises", companyRecipients)}

          {/* FORMATEURS */}
          {renderRecipientSection("Formateurs", trainerRecipients)}

          {/* FINANCEURS */}
          {renderRecipientSection("Financeurs", financierRecipients)}

          {/* MANAGER */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg uppercase">Manager:</CardTitle>
            </CardHeader>
            <CardContent>
              {manager ? (
                <div className="bg-muted/20 rounded-lg p-4 space-y-3">
                  <p className="font-medium">
                    {manager.first_name} {manager.last_name}
                  </p>
                  {renderHistory(manager.email)}
                  <div className="pt-2">
                    {renderActionButtons([
                      {
                        id: manager.id,
                        name: `${manager.first_name} ${manager.last_name}`,
                        email: manager.email || null,
                        type: "manager",
                      },
                    ])}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Pas de manager attribué
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Send/Schedule Dialog ──────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Destinataires */}
            <div>
              <Label>Destinataire(s)</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {dialogRecipients.map((r) => (
                  <Badge key={r.id} variant="outline" className="text-xs">
                    {r.name} {r.email ? `(${r.email})` : "(pas d'email)"}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Template select */}
            {isTemplate && (
              <div>
                <Label>Modèle d&apos;email</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un modèle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.type ? `(${t.type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Scheduling */}
            {isSchedule && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Date d&apos;envoi</Label>
                  <Input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label>Heure d&apos;envoi</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Subject */}
            <div>
              <Label>Objet *</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Objet de l'email..."
              />
            </div>

            {/* Body */}
            <div>
              <Label>Corps du message</Label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={8}
                placeholder="Contenu de l'email..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSchedule ? (
                <>
                  <Clock className="h-4 w-4 mr-1" /> Programmer
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" /> Envoyer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

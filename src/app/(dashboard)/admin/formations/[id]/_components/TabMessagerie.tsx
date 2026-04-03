"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, Clock, Mail, Loader2, Zap, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  // Automation
  const [automationRules, setAutomationRules] = useState<Array<{
    id: string; name: string | null; trigger_type: string; days_offset: number;
    is_enabled: boolean; recipient_type: string; template_id: string | null;
    document_type: string; template?: { name: string } | null;
  }>>([]);
  const [automationHistory, setAutomationHistory] = useState<Array<{
    subject: string; status: string; sent_at: string; recipient_email: string;
  }>>([]);

  useEffect(() => {
    if (!formation.entity_id) return;
    supabase
      .from("formation_automation_rules")
      .select("*, template:email_templates(name)")
      .eq("entity_id", formation.entity_id)
      .eq("is_enabled", true)
      .then(({ data }) => setAutomationRules(data ?? []));
    supabase
      .from("email_history")
      .select("subject, status, sent_at, recipient_email")
      .eq("session_id", formation.id)
      .order("sent_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setAutomationHistory(data ?? []));
  }, [supabase, formation.entity_id, formation.id]);

  function getRuleTargetDate(rule: typeof automationRules[0]): string {
    if (rule.trigger_type === "session_start_minus_days") {
      const start = new Date(formation.start_date);
      start.setDate(start.getDate() - rule.days_offset);
      return start.toLocaleDateString("fr-FR");
    } else {
      const end = new Date(formation.end_date);
      end.setDate(end.getDate() + rule.days_offset);
      return end.toLocaleDateString("fr-FR");
    }
  }

  function getRuleStatus(rule: typeof automationRules[0]): { label: string; color: string } {
    const targetDate = rule.trigger_type === "session_start_minus_days"
      ? new Date(formation.start_date)
      : new Date(formation.end_date);
    if (rule.trigger_type === "session_start_minus_days") {
      targetDate.setDate(targetDate.getDate() - rule.days_offset);
    } else {
      targetDate.setDate(targetDate.getDate() + rule.days_offset);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const sent = automationHistory.some((h) =>
      h.subject.includes(rule.name || rule.document_type) && h.status === "sent"
    );

    if (sent) return { label: "Envoyé", color: "bg-green-100 text-green-700" };
    if (targetDate < today) return { label: "Date passée", color: "bg-gray-100 text-gray-500" };
    if (targetDate.getTime() === today.getTime()) return { label: "Aujourd'hui", color: "bg-orange-100 text-orange-700" };
    return { label: getRuleTargetDate(rule), color: "bg-blue-100 text-blue-700" };
  }

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    learners: true, companies: false, trainers: false, financiers: false, manager: false,
  });

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

    await fetchHistory();
    await onRefresh();
  };

  // ─── Compact action dropdown for a recipient ──────────────────
  const renderActionDropdown = (recipients: Recipient[], mass = false, label = "Envoyer") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
          <Mail className="h-3 w-3" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openDialog("template", recipients, mass)}>
          <Mail className="h-3 w-3 mr-2" /> Email (template){mass ? " en masse" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDialog("libre", recipients, mass)}>
          <Mail className="h-3 w-3 mr-2" /> Email (libre){mass ? " en masse" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDialog("schedule_template", recipients, mass)}>
          <Clock className="h-3 w-3 mr-2" /> Programmer (template){mass ? " en masse" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openDialog("schedule_libre", recipients, mass)}>
          <Clock className="h-3 w-3 mr-2" /> Programmer (libre){mass ? " en masse" : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ─── Render email history (compact table) ──────────────────
  const renderHistory = (recipientEmail: string | null) => {
    const history = getHistoryFor(recipientEmail);
    if (history.length === 0) return null;
    return (
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {history.slice(0, 3).map((h) => {
              const badge = STATUS_BADGES[h.status] || STATUS_BADGES.pending;
              return (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                    {new Date(h.sent_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-1.5 pr-3 truncate max-w-[200px]">{h.subject}</td>
                  <td className="py-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {history.length > 3 && (
          <p className="text-xs text-muted-foreground mt-1">+{history.length - 3} autre(s)</p>
        )}
      </div>
    );
  };

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ─── Render a recipient section ──────────────────────────────
  const renderRecipientSection = (
    key: string,
    title: string,
    recipients: Recipient[],
    showMassButtons = false
  ) => {
    const isExpanded = expandedSections[key];
    return (
      <div className="border rounded-lg overflow-hidden">
        {/* Section header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleSection(key)}
        >
          <div className="flex items-center gap-2">
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">({recipients.length})</span>
          </div>
          {showMassButtons && recipients.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              {renderActionDropdown(recipients, true, "Envoi masse")}
            </div>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="divide-y">
            {recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3 italic">Aucun</p>
            ) : (
              recipients.map((r) => (
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{r.name}</span>
                      {r.email && (
                        <span className="text-xs text-muted-foreground ml-2">{r.email}</span>
                      )}
                      {!r.email && (
                        <span className="text-xs text-orange-500 ml-2">Pas d&apos;email</span>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      {renderActionDropdown([r])}
                    </div>
                  </div>
                  {renderHistory(r.email)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Dialog title ────────────────────────────────────────────
  const dialogTitle = (() => {
    const isSchedule = dialogMode.startsWith("schedule");
    const isTempl = dialogMode.includes("template");
    const action = isSchedule ? "Programmer" : "Envoyer";
    const type = isTempl ? "(template)" : "(libre)";
    const mass = isMass ? " en masse" : "";
    return `${action} un e-mail ${type}${mass}`;
  })();

  const isTemplate = dialogMode === "template" || dialogMode === "schedule_template";
  const isSchedule = dialogMode === "schedule_template" || dialogMode === "schedule_libre";

  return (
    <div className="space-y-4">
      {/* Section Automatisation */}
      {automationRules.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-yellow-500" />
              Emails automatiques
            </h3>
            <a href="/admin/trainings/automation" className="text-xs text-muted-foreground hover:underline">
              Configurer
            </a>
          </div>
          <div className="space-y-1.5">
            {automationRules.map((rule) => {
              const status = getRuleStatus(rule);
              const label = rule.name || rule.template?.name || rule.document_type;
              const recipient = rule.recipient_type === "trainers" ? "Formateurs" : rule.recipient_type === "all" ? "Tous" : "Apprenants";
              const trigger = rule.trigger_type === "session_start_minus_days"
                ? `J-${rule.days_offset} avant début`
                : `J+${rule.days_offset} après fin`;
              return (
                <div key={rule.id} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-yellow-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{trigger} · {recipient}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
          {automationHistory.length > 0 && (
            <details className="mt-1.5">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Historique ({automationHistory.length})
              </summary>
              <div className="mt-1 space-y-0.5">
                {automationHistory.slice(0, 5).map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-muted-foreground py-0.5">
                    <span className="truncate max-w-[200px]">{h.subject}</span>
                    <span className={h.status === "sent" ? "text-green-600" : "text-red-500"}>
                      {h.status === "sent" ? "Envoyé" : "Échoué"} {new Date(h.sent_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {loadingHistory ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {renderRecipientSection("learners", "Apprenants", learnerRecipients, true)}
          {renderRecipientSection("companies", "Entreprises", companyRecipients)}
          {renderRecipientSection("trainers", "Formateurs", trainerRecipients)}
          {renderRecipientSection("financiers", "Financeurs", financierRecipients)}

          {/* Manager */}
          <div className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleSection("manager")}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedSections.manager ? "" : "-rotate-90"}`} />
                <span className="text-sm font-medium">Manager</span>
              </div>
            </div>
            {expandedSections.manager && (
              <div className="px-4 py-2.5">
                {manager ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{manager.first_name} {manager.last_name}</span>
                        {manager.email && (
                          <span className="text-xs text-muted-foreground ml-2">{manager.email}</span>
                        )}
                      </div>
                      {renderActionDropdown([{
                        id: manager.id,
                        name: `${manager.first_name} ${manager.last_name}`,
                        email: manager.email || null,
                        type: "manager",
                      }])}
                    </div>
                    {renderHistory(manager.email)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Pas de manager attribué</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Send/Schedule Dialog ──────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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

            <div>
              <Label>Objet *</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Objet de l'email..."
              />
            </div>

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
                <><Clock className="h-4 w-4 mr-1" /> Programmer</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Envoyer</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

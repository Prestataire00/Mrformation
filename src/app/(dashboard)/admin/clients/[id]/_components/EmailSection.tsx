"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Send,
  Mail,
  Plus,
  Loader2,
  Trash2,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Copy,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate } from "@/lib/utils";

interface EmailHistoryItem {
  id: string;
  recipient_email: string;
  subject: string;
  body: string | null;
  status: "sent" | "failed" | "pending";
  sent_at: string;
  template_id: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  created_at: string;
}

const EMAIL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "Envoyé", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  failed: { label: "Échoué", color: "bg-red-100 text-red-700", icon: AlertCircle },
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700", icon: Clock },
};

interface EmailSectionProps {
  clientId: string;
  clientName: string;
  contacts: Array<{ email: string | null; first_name: string; last_name: string }>;
}

export default function EmailSection({ clientId, clientName, contacts }: EmailSectionProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [emailHistory, setEmailHistory] = useState<EmailHistoryItem[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Compose form
  const [composeForm, setComposeForm] = useState({
    to: "",
    subject: "",
    body: "",
  });

  // Template form
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    body: "",
    category: "general",
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const contactEmails = contacts.filter((c) => c.email).map((c) => ({
    email: c.email!,
    label: `${c.first_name} ${c.last_name} <${c.email}>`,
  }));

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/emails/history?recipient_type=client&recipient_id=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setEmailHistory(data.history ?? []);
      }
    } catch {
      // Fallback to direct query (works for admin role)
      const { data } = await supabase
        .from("email_history")
        .select("id, recipient_email, subject, body, status, sent_at, template_id")
        .eq("recipient_type", "client")
        .eq("recipient_id", clientId)
        .order("sent_at", { ascending: false })
        .limit(50);
      if (data) setEmailHistory(data as EmailHistoryItem[]);
    }
  }, [supabase, clientId]);

  const fetchTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      setTemplates(data as EmailTemplate[]);
    }
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchHistory(), fetchTemplates()]).then(() => setLoading(false));
  }, [fetchHistory, fetchTemplates]);

  async function handleSendEmail() {
    if (!composeForm.to.trim() || !composeForm.subject.trim()) {
      toast({ title: "Erreur", description: "Destinataire et objet sont requis.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeForm.to.trim(),
          subject: composeForm.subject.trim(),
          body: composeForm.body.trim(),
          recipient_type: "client",
          recipient_id: clientId,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.success) throw new Error(json.error || "Erreur d'envoi");
      toast({ title: "Email envoyé", description: json.message || `Email envoyé à ${composeForm.to}` });
      setComposeForm({ to: "", subject: "", body: "" });
      fetchHistory();
    } catch (err: unknown) {
      toast({
        title: "Erreur d'envoi",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  function applyTemplate(template: EmailTemplate) {
    setComposeForm((f) => ({
      ...f,
      subject: template.subject.replace(/\{client\}/g, clientName),
      body: template.body.replace(/\{client\}/g, clientName),
    }));
    toast({ title: "Template appliqué", description: template.name });
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim() || !templateForm.subject.trim()) return;
    setSavingTemplate(true);
    try {
      if (editingTemplateId) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            name: templateForm.name.trim(),
            subject: templateForm.subject.trim(),
            body: templateForm.body.trim(),
            category: templateForm.category || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingTemplateId);
        if (error) throw error;
        toast({ title: "Template mis à jour" });
      } else {
        const { error } = await supabase.from("email_templates").insert({
          name: templateForm.name.trim(),
          subject: templateForm.subject.trim(),
          body: templateForm.body.trim(),
          category: templateForm.category || null,
        });
        if (error) throw error;
        toast({ title: "Template créé" });
      }
      setTemplateDialogOpen(false);
      setEditingTemplateId(null);
      setTemplateForm({ name: "", subject: "", body: "", category: "general" });
      fetchTemplates();
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    const { error } = await supabase.from("email_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ title: "Template supprimé" });
    }
  }

  function openEditTemplate(template: EmailTemplate) {
    setEditingTemplateId(template.id);
    setTemplateForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category || "general",
    });
    setTemplateDialogOpen(true);
  }

  function openCreateTemplate() {
    setEditingTemplateId(null);
    setTemplateForm({ name: "", subject: "", body: "", category: "general" });
    setTemplateDialogOpen(true);
  }

  // Save current compose as template
  function saveComposeAsTemplate() {
    setEditingTemplateId(null);
    setTemplateForm({
      name: "",
      subject: composeForm.subject,
      body: composeForm.body,
      category: "general",
    });
    setTemplateDialogOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="compose" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 max-w-md">
        <TabsTrigger value="compose" className="gap-1.5 text-xs">
          <Send className="h-3.5 w-3.5" />
          Composer
        </TabsTrigger>
        <TabsTrigger value="templates" className="gap-1.5 text-xs">
          <LayoutTemplate className="h-3.5 w-3.5" />
          Templates ({templates.length})
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-1.5 text-xs">
          <Clock className="h-3.5 w-3.5" />
          Historique ({emailHistory.length})
        </TabsTrigger>
      </TabsList>

      {/* ---- Compose ---- */}
      <TabsContent value="compose" className="space-y-4">
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="p-4 space-y-3">
            {/* Recipient */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-10 flex-shrink-0">À :</Label>
              {contactEmails.length > 0 ? (
                <Select
                  value={composeForm.to}
                  onValueChange={(v) => setComposeForm((f) => ({ ...f, to: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sélectionner un contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contactEmails.map((c) => (
                      <SelectItem key={c.email} value={c.email}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={composeForm.to}
                  onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))}
                  placeholder="email@exemple.fr"
                  className="h-9 text-sm"
                  type="email"
                />
              )}
            </div>

            <Separator />

            {/* Subject */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-10 flex-shrink-0">Objet :</Label>
              <Input
                value={composeForm.subject}
                onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Objet de l'email"
                className="h-9 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
              />
            </div>

            <Separator />

            {/* Body */}
            <Textarea
              value={composeForm.body}
              onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Rédigez votre email..."
              rows={8}
              className="resize-none border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
            />
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50/50 rounded-b-lg">
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <Select onValueChange={(id) => {
                  const tpl = templates.find((t) => t.id === id);
                  if (tpl) applyTemplate(tpl);
                }}>
                  <SelectTrigger className="h-8 text-xs w-auto gap-1.5 border-dashed">
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    <SelectValue placeholder="Appliquer un template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {composeForm.body.trim() && (
                <Button variant="ghost" size="sm" onClick={saveComposeAsTemplate} className="text-xs gap-1 h-8">
                  <Copy className="h-3 w-3" />
                  Sauver comme template
                </Button>
              )}
            </div>
            <Button
              onClick={handleSendEmail}
              disabled={sending || !composeForm.to.trim() || !composeForm.subject.trim()}
              className="gap-1.5"
              size="sm"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Envoyer
            </Button>
          </div>
        </div>
      </TabsContent>

      {/* ---- Templates ---- */}
      <TabsContent value="templates" className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Créez et gérez vos templates d&apos;email. Utilisez <code className="bg-gray-100 px-1 rounded text-xs">{"{client}"}</code> pour insérer le nom du client.
          </p>
          <Button size="sm" onClick={openCreateTemplate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nouveau template
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed">
            <LayoutTemplate className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-gray-700">Aucun template</p>
            <p className="text-sm text-muted-foreground mt-1">
              Créez des templates pour gagner du temps.
            </p>
            <Button size="sm" onClick={openCreateTemplate} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              Créer un template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="group rounded-lg border p-4 space-y-2 transition-shadow hover:shadow-sm bg-white"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{tpl.name}</p>
                      {tpl.category && (
                        <Badge variant="outline" className="text-[10px] mt-0.5">{tpl.category}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyTemplate(tpl)}>
                      <Copy className="h-3.5 w-3.5 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(tpl)}>
                      <Pencil className="h-3.5 w-3.5 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteTemplate(tpl.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">Objet : {tpl.subject}</p>
                <p className="text-xs text-gray-500 line-clamp-2">{tpl.body}</p>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ---- History ---- */}
      <TabsContent value="history" className="space-y-4">
        {emailHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed">
            <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-gray-700">Aucun email envoyé</p>
            <p className="text-sm text-muted-foreground mt-1">
              Les emails envoyés à ce client apparaîtront ici.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {emailHistory.map((email) => {
                const statusCfg = EMAIL_STATUS_CONFIG[email.status];
                const StatusIcon = statusCfg.icon;
                return (
                  <div key={email.id} className="flex items-start gap-3 rounded-lg border p-3.5 bg-white hover:shadow-sm transition">
                    <div className={cn("flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center", statusCfg.color.split(" ")[0])}>
                      <StatusIcon className={cn("h-4 w-4", statusCfg.color.split(" ")[1])} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{email.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            À : {email.recipient_email}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge className={cn("text-[10px] border-0", statusCfg.color)}>
                            {statusCfg.label}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(email.sent_at, "dd/MM/yyyy HH:mm")}
                          </span>
                        </div>
                      </div>
                      {email.body && (
                        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{email.body}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </TabsContent>

      {/* ---- Template Dialog ---- */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplateId ? "Modifier le template" : "Nouveau template"}
            </DialogTitle>
            <DialogDescription>
              Utilisez <code className="bg-gray-100 px-1 rounded text-xs">{"{client}"}</code> pour insérer dynamiquement le nom du client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nom du template <span className="text-red-500">*</span></Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Bienvenue client"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select value={templateForm.category} onValueChange={(v) => setTemplateForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Général</SelectItem>
                    <SelectItem value="relance">Relance</SelectItem>
                    <SelectItem value="formation">Formation</SelectItem>
                    <SelectItem value="facturation">Facturation</SelectItem>
                    <SelectItem value="bienvenue">Bienvenue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Objet <span className="text-red-500">*</span></Label>
              <Input
                value={templateForm.subject}
                onChange={(e) => setTemplateForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Objet de l'email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Corps de l&apos;email</Label>
              <Textarea
                value={templateForm.body}
                onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
                rows={8}
                className="resize-none text-sm"
                placeholder="Bonjour,&#10;&#10;Nous vous contactons au sujet de..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={savingTemplate || !templateForm.name.trim() || !templateForm.subject.trim()}
              className="gap-1.5"
            >
              {savingTemplate && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingTemplateId ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

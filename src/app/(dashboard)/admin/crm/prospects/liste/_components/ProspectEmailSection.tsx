"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Mail,
  Clock,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate } from "@/lib/utils";
import type { CrmProspect, EmailTemplate } from "@/lib/types";

// ── Template tags ────────────────────────────────────────────────────────────

const TEMPLATE_TAGS = [
  { label: "Nom de l'entreprise", key: "company_name" },
  { label: "SIRET", key: "siret" },
  { label: "Email", key: "email" },
  { label: "Téléphone", key: "phone" },
  { label: "Nom du contact", key: "contact_name" },
  { label: "Source", key: "source" },
];

function resolveTag(key: string, prospect: CrmProspect): string {
  const map: Record<string, string | null> = {
    company_name: prospect.company_name,
    siret: prospect.siret,
    email: prospect.email,
    phone: prospect.phone,
    contact_name: prospect.contact_name,
    source: prospect.source,
  };
  return map[key] ?? "";
}

interface EmailHistoryEntry {
  id: string;
  subject: string;
  body: string | null;
  status: "sent" | "failed" | "pending";
  sent_at: string;
  recipient_email: string;
}

interface ProspectEmailSectionProps {
  prospectId: string;
  prospect: CrmProspect;
}

export default function ProspectEmailSection({ prospectId, prospect }: ProspectEmailSectionProps) {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // History
  const [history, setHistory] = useState<EmailHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // ── Fetch templates ─────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .eq("entity_id", entityId)
      .order("name");
    setTemplates((data as EmailTemplate[]) ?? []);
    setLoadingTemplates(false);
  }, [supabase, entityId]);

  // ── Fetch history ───────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("email_history")
      .select("id, subject, body, status, sent_at, recipient_email")
      .eq("recipient_type", "prospect")
      .eq("recipient_id", prospectId)
      .order("sent_at", { ascending: false })
      .limit(50);
    setHistory((data as EmailHistoryEntry[]) ?? []);
    setLoadingHistory(false);
  }, [supabase, prospectId]);

  useEffect(() => {
    fetchTemplates();
    fetchHistory();
  }, [fetchTemplates, fetchHistory]);

  // ── Apply template ──────────────────────────────────────────────────────────

  function applyTemplate(templateId: string) {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplateId(templateId);
    setSubject(tmpl.subject);
    setMessage(tmpl.body);
  }

  // ── Insert tag at cursor ───────────────────────────────────────────────────

  function insertTag(tagKey: string) {
    const tagText = `[%${tagKey}%]`;
    const textarea = messageRef.current;
    if (!textarea) {
      setMessage((m) => m + tagText);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = message.slice(0, start);
    const after = message.slice(end);
    const newMessage = before + tagText + after;
    setMessage(newMessage);

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + tagText.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  // ── Replace tags with real values ──────────────────────────────────────────

  function resolveTags(text: string): string {
    return text.replace(/\[%([^%]+)%\]/g, (_, key) => {
      return resolveTag(key, prospect) || "";
    });
  }

  // ── Send email ─────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!prospect?.email || !subject.trim() || !message.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const resolvedSubject = resolveTags(subject);
      const resolvedBody = resolveTags(message);

      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: prospect.email,
          subject: resolvedSubject,
          body: resolvedBody,
          entity_id: entityId || undefined,
          recipient_type: "prospect",
          recipient_id: prospectId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: data.simulated
            ? "Email journalisé (Resend non configuré)"
            : `Email envoyé avec succès à ${prospect.email}`,
        });
        toast({ title: "Email envoyé" });
        setSubject("");
        setMessage("");
        setSelectedTemplateId("");
        fetchHistory();
      } else {
        setResult({
          success: false,
          message: data.error || "Erreur lors de l'envoi",
        });
      }
    } catch {
      setResult({ success: false, message: "Erreur réseau" });
    } finally {
      setSending(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Tabs defaultValue="compose" className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-4">
        <TabsTrigger
          value="compose"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2 text-sm"
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Composer
        </TabsTrigger>
        <TabsTrigger
          value="history"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2 text-sm"
        >
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Historique ({history.length})
        </TabsTrigger>
      </TabsList>

      {/* ── Compose Tab ──────────────────────────────────────────────────────── */}
      <TabsContent value="compose" className="mt-4 space-y-4">
        {!prospect.email ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-gray-700">Aucun email</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ce prospect n&apos;a pas d&apos;adresse email renseignée.
            </p>
          </div>
        ) : (
          <>
            {/* Template selector */}
            <div className="space-y-1.5">
              <Label>Modèle d&apos;email</Label>
              <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingTemplates ? "Chargement..." : "Choisir un modèle (optionnel)"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipient */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Destinataire : <span className="font-medium text-gray-700">{prospect.email}</span>
              </Label>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label>Sujet <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Sujet de l'email"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                Balises (cliquer pour insérer)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_TAGS.map((tag) => (
                  <button
                    key={tag.key}
                    type="button"
                    onClick={() => insertTag(tag.key)}
                    className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label>Message <span className="text-red-500">*</span></Label>
              <Textarea
                ref={messageRef}
                placeholder="Rédigez votre message ici..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="resize-none text-sm"
              />
            </div>

            {/* Result */}
            {result && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-3 text-sm",
                  result.success
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                )}
              >
                {result.success ? (
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                )}
                {result.message}
              </div>
            )}

            {/* Send button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !message.trim()}
                className="gap-1.5"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Envoi en cours..." : "Envoyer"}
              </Button>
            </div>
          </>
        )}
      </TabsContent>

      {/* ── History Tab ──────────────────────────────────────────────────────── */}
      <TabsContent value="history" className="mt-4">
        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-gray-700">Aucun email envoyé</p>
            <p className="text-sm text-muted-foreground mt-1">
              L&apos;historique des emails envoyés à ce prospect apparaîtra ici.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{entry.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          entry.status === "sent" && "border-green-200 bg-green-50 text-green-700",
                          entry.status === "failed" && "border-red-200 bg-red-50 text-red-700",
                          entry.status === "pending" && "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {entry.status === "sent" ? "Envoyé" : entry.status === "failed" ? "Échoué" : "En attente"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(entry.sent_at, "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                  {entry.body && (
                    <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                      {entry.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </TabsContent>
    </Tabs>
  );
}

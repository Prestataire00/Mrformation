"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CrmProspect } from "@/lib/types";

// ── Template tags ────────────────────────────────────────────────────────────

const TEMPLATE_TAGS = [
  { label: "Nom de l'organisme", key: "company_name" },
  { label: "SIRET de l'organisme", key: "siret" },
  { label: "Email de l'organisme", key: "email" },
  { label: "Téléphone de l'organisme", key: "phone" },
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SendEmailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { entityId } = useEntity();
  const prospectId = params.id as string;
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const [prospect, setProspect] = useState<CrmProspect | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const [subject, setSubject] = useState(searchParams.get("subject") ?? "");
  const [message, setMessage] = useState(searchParams.get("body") ?? "");

  // IA state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiType, setAiType] = useState("first_contact");
  const [aiCustom, setAiCustom] = useState("");
  const [showAiDialog, setShowAiDialog] = useState(false);

  // ── Fetch prospect ─────────────────────────────────────────────────────────

  const fetchProspect = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("crm_prospects")
      .select("*")
      .eq("id", prospectId)
      .eq("entity_id", entityId)
      .single();
    if (data) setProspect(data as CrmProspect);
    setLoading(false);
  }, [prospectId, supabase, entityId]);

  useEffect(() => {
    fetchProspect();
  }, [fetchProspect]);

  // ── Insert tag at cursor ───────────────────────────────────────────────────

  function insertTag(tag: string) {
    const tagText = `[%${tag}%]`;
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

    // Restore cursor position after the inserted tag
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + tagText.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  // ── Replace tags with real values ──────────────────────────────────────────

  function resolveTags(text: string): string {
    if (!prospect) return text;
    return text.replace(/\[%([^%]+)%\]/g, (_, key) => {
      const tag = TEMPLATE_TAGS.find((t) => t.label === key);
      if (tag) return resolveTag(tag.key, prospect) || "";
      return "";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#DC2626]" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Prospect introuvable.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-[#DC2626] hover:text-[#991B1B] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Revenir
        </button>
        <h1 className="text-lg font-medium text-gray-600">
          Lead / <span className="font-bold text-gray-900">Envoyer l&apos;email</span>
        </h1>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h2 className="mb-6 text-xl font-bold text-gray-900">
          Envoyez un email à {prospect.company_name}
        </h2>

        <div className="space-y-5">
          {/* Destinataire */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email : <span className="font-normal text-gray-500">{prospect.email || "Aucun email"}</span>
            </label>
          </div>

          {/* Bouton IA */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => setShowAiDialog(true)}
              disabled={aiLoading}
            >
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Rédiger avec l&apos;IA
            </Button>
            {subject && message && <span className="text-xs text-muted-foreground italic">Généré par IA — vérifiez avant d&apos;envoyer</span>}
          </div>

          {/* Dialog IA */}
          {showAiDialog && (
            <div className="p-4 border border-indigo-200 rounded-lg bg-indigo-50 space-y-3">
              <p className="text-sm font-medium text-indigo-800">Type d&apos;email :</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "first_contact", label: "Première prise de contact" },
                  { value: "quote_followup", label: "Relance devis" },
                  { value: "post_meeting", label: "Suite à un appel" },
                  { value: "reactivation", label: "Réactivation prospect" },
                  { value: "thank_you", label: "Remerciement" },
                  { value: "custom", label: "Personnalisé" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAiType(opt.value)}
                    className={`text-xs px-3 py-2 rounded-lg border transition-colors ${aiType === opt.value ? "border-indigo-500 bg-indigo-100 text-indigo-800 font-medium" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {aiType === "custom" && (
                <Textarea
                  value={aiCustom}
                  onChange={(e) => setAiCustom(e.target.value)}
                  placeholder="Décrivez le type d'email souhaité..."
                  rows={2}
                  className="text-sm"
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={async () => {
                    setAiLoading(true);
                    try {
                      const res = await fetch("/api/ai/draft-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          prospect_id: prospectId,
                          context_type: aiType,
                          custom_instructions: aiType === "custom" ? aiCustom : undefined,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setSubject(data.subject);
                      setMessage(data.body);
                      setShowAiDialog(false);
                    } catch {
                      setResult({ success: false, message: "Service IA indisponible" });
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                >
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Générer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAiDialog(false)}>Annuler</Button>
              </div>
            </div>
          )}

          {/* Sujet */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Sujet du courriel<span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Écrivez le sujet"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Balises */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Balises paramétrées à glisser-déposer (cliquer pour insérer)
            </label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_TAGS.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => insertTag(tag.label)}
                  className="rounded-md border border-[#DC2626] bg-[#FEF2F2] px-3 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEE2E2] transition cursor-pointer"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Message<span className="text-red-500">*</span>
            </label>
            {/* Toolbar */}
            <div className="flex items-center gap-1 rounded-t-lg border border-b-0 border-gray-300 bg-gray-100 px-3 py-1.5">
              <button
                type="button"
                onClick={() => insertTag("Nom du contact")}
                className="rounded px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-200 transition"
                title="Insérer nom du contact"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => insertTag("Nom de l'organisme")}
                className="rounded px-2 py-1 text-xs italic text-gray-600 hover:bg-gray-200 transition"
                title="Insérer nom organisme"
              >
                I
              </button>
              <div className="mx-2 h-4 w-px bg-gray-300" />
              <span className="text-[10px] text-gray-400">
                Utilisez les balises ci-dessus pour personnaliser le message
              </span>
            </div>
            <Textarea
              ref={messageRef}
              placeholder="Rédigez votre message ici…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="rounded-t-none resize-none text-sm"
            />
          </div>

          {/* Result */}
          {result && (
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
                result.success
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {result.success ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {result.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => router.back()}
            >
              Annuler
            </Button>
            <button
              onClick={handleSend}
              disabled={sending || !prospect.email || !subject.trim() || !message.trim()}
              className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
              style={{ backgroundColor: "#DC2626" }}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Envoi en cours…" : "ENVOYER"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

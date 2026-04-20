"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ChevronRight, ChevronLeft, Check, AlertTriangle, Info } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  entityId: string;
}

// ── Constants ──

const CONTEXTS = [
  { value: "before", label: "Avant une formation", trigger: "session_start_minus_days", scope: "formation" },
  { value: "after", label: "Après une formation", trigger: "session_end_plus_days", scope: "formation" },
  { value: "event_formation", label: "Sur un événement de formation", trigger: "", scope: "formation" },
  { value: "event_crm", label: "Sur un événement commercial", trigger: "", scope: "crm" },
] as const;

const FORMATION_EVENTS = [
  { value: "on_session_completion", label: "À la clôture de la formation" },
  { value: "on_enrollment", label: "À l'inscription d'un apprenant" },
  { value: "on_signature_complete", label: "Quand les signatures sont complètes" },
  { value: "certificate_ready", label: "Quand un certificat est prêt" },
];

const CRM_EVENTS = [
  { value: "invoice_overdue", label: "Quand une facture est en retard" },
  { value: "questionnaire_reminder", label: "Rappel questionnaire non rempli" },
  { value: "opco_deposit_reminder", label: "Rappel dépôt OPCO" },
];

const RECIPIENTS = [
  { value: "learners", label: "Apprenants" },
  { value: "trainers", label: "Formateurs" },
  { value: "companies", label: "Entreprises clientes" },
  { value: "all", label: "Tous (apprenants + formateurs)" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Envoyer un email", icon: "📧", description: "Avec un template personnalisé" },
  { value: "generate_document", label: "Générer un document", icon: "📄", description: "Génération auto d'un PDF" },
  { value: "send_questionnaire", label: "Envoyer un questionnaire", icon: "📋", description: "Satisfaction ou évaluation" },
];

// ── Types for options API ──

interface OptionsData {
  email_templates: Array<{ id: string; name: string; subject: string }>;
  document_types: Array<{ key: string; label: string; category: string; icon: string }>;
  satisfaction_types: Array<{ key: string; label: string; description: string }>;
  evaluation_types: Array<{ key: string; label: string; description: string }>;
  questionnaires: Array<{ id: string; name: string; type: string }>;
}

export function RuleWizard({ open, onClose, onCreated, entityId }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<OptionsData | null>(null);

  // Step 1 — Quand
  const [context, setContext] = useState("");
  // Step 2 — Délai
  const [daysOffset, setDaysOffset] = useState("5");
  const [eventType, setEventType] = useState("");
  // Step 3 — Action
  const [actionType, setActionType] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [recipientType, setRecipientType] = useState("learners");
  const [satisfactionType, setSatisfactionType] = useState("");
  // Step 4 — Récap
  const [ruleName, setRuleName] = useState("");

  const selectedContext = CONTEXTS.find(c => c.value === context);
  const triggerType = selectedContext?.trigger || eventType;
  const scope = selectedContext?.scope || "formation";
  const isDateBased = context === "before" || context === "after";

  // Fetch options when wizard opens
  useEffect(() => {
    if (open && !options) {
      fetch("/api/automation/options").then(r => r.json()).then(setOptions).catch(() => {});
    }
  }, [open, options]);

  // ── Auto-generate name ──
  const autoName = (() => {
    const actionLabel = actionType === "send_email"
      ? (options?.email_templates.find(t => t.id === templateId)?.name || "Email")
      : actionType === "generate_document"
        ? (options?.document_types.find(d => d.key === documentType)?.label || "Document")
        : actionType === "send_questionnaire"
          ? (options?.satisfaction_types.find(s => s.key === satisfactionType)?.label ||
             options?.evaluation_types.find(e => e.key === satisfactionType)?.label || "Questionnaire")
          : "Action";
    const offsetLabel = isDateBased ? (context === "before" ? `J-${daysOffset}` : `J+${daysOffset}`) : "";
    return `${actionLabel}${offsetLabel ? ` ${offsetLabel}` : ""}`.slice(0, 60);
  })();

  // ── Summary text ──
  const summaryText = (() => {
    const when = isDateBased
      ? `${daysOffset} jour${Number(daysOffset) > 1 ? "s" : ""} ${context === "before" ? "avant le début" : "après la fin"} de chaque formation`
      : (FORMATION_EVENTS.find(e => e.value === eventType) || CRM_EVENTS.find(e => e.value === eventType))?.label || "sur un événement";

    const who = RECIPIENTS.find(r => r.value === recipientType)?.label?.toLowerCase() || recipientType;

    if (actionType === "send_email") {
      const tpl = options?.email_templates.find(t => t.id === templateId);
      return `${when}, un email "${tpl?.name || "template"}" sera envoyé aux ${who}.`;
    }
    if (actionType === "generate_document") {
      const doc = options?.document_types.find(d => d.key === documentType);
      return `${when}, le document "${doc?.label || documentType}" sera généré pour les ${who}.`;
    }
    if (actionType === "send_questionnaire") {
      const sType = options?.satisfaction_types.find(s => s.key === satisfactionType) ||
                    options?.evaluation_types.find(e => e.key === satisfactionType);
      return `${when}, un questionnaire "${sType?.label || "satisfaction"}" sera envoyé aux apprenants.`;
    }
    return `${when}, une action sera exécutée.`;
  })();

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = {
        name: ruleName || autoName,
        trigger_type: triggerType,
        days_offset: isDateBased ? Number(daysOffset) : 0,
        document_type: actionType === "generate_document" ? documentType
          : actionType === "send_questionnaire" ? satisfactionType
          : "email",
        recipient_type: recipientType,
        template_id: templateId || null,
        is_enabled: true,
        entity_id: entityId,
      };

      const endpoint = scope === "formation"
        ? "/api/formations/automation-rules"
        : "/api/crm/automations";

      if (scope === "formation") {
        const existing = await fetch(endpoint).then(r => r.json());
        const currentRules = existing.rules || [];
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: [...currentRules, payload] }),
        });
        if (!res.ok) throw new Error("Erreur création");
      } else {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Erreur création");
      }

      toast({ title: "Règle créée", description: ruleName || autoName });
      resetAndClose();
      onCreated();
    } catch {
      toast({ title: "Erreur", description: "Impossible de créer la règle", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setContext("");
    setDaysOffset("5");
    setEventType("");
    setActionType("");
    setTemplateId("");
    setDocumentType("");
    setRecipientType("learners");
    setSatisfactionType("");
    setRuleName("");
    onClose();
  };

  const canNext = () => {
    if (step === 1) return !!context;
    if (step === 2) return isDateBased ? Number(daysOffset) >= 0 : !!eventType;
    if (step === 3) {
      if (!actionType) return false;
      if (actionType === "send_email") return !!templateId || (options?.email_templates.length === 0);
      if (actionType === "generate_document") return !!documentType;
      if (actionType === "send_questionnaire") return !!satisfactionType;
      return true;
    }
    return true;
  };

  // Group document types by category
  const docsByCategory = (options?.document_types || []).reduce((acc, d) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {} as Record<string, typeof options extends null ? never : NonNullable<typeof options>["document_types"]>);

  const CATEGORY_LABELS: Record<string, string> = {
    contract: "Contractuel",
    certificate: "Certificats",
    communication: "Communications",
    attendance: "Émargement",
    informative: "Informatif",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Nouvelle règle d&apos;automation
            <Badge variant="outline" className="text-[10px]">Étape {step}/4</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-[#374151]" : "bg-gray-200"}`} />
          ))}
        </div>

        <div className="min-h-[240px] space-y-4">
          {/* ══ Step 1 — Quand ══ */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Quand cette règle doit-elle se déclencher ?</p>
              <div className="space-y-2">
                {CONTEXTS.map(c => (
                  <button key={c.value} onClick={() => setContext(c.value)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${context === c.value ? "border-[#374151] bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <p className="text-sm font-medium">{c.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══ Step 2 — Délai ══ */}
          {step === 2 && (
            <div className="space-y-3">
              {isDateBased ? (
                <>
                  <p className="text-sm font-medium">Combien de jours {context === "before" ? "avant le début" : "après la fin"} ?</p>
                  <div className="flex items-center gap-3">
                    <Input type="number" min="0" max="90" value={daysOffset} onChange={(e) => setDaysOffset(e.target.value)} className="w-24" />
                    <span className="text-sm text-muted-foreground">jour{Number(daysOffset) > 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-xs text-muted-foreground bg-blue-50 rounded-lg p-3">
                    Exemple : si la formation {context === "before" ? "commence" : "finit"} le 20 avril,
                    la règle s&apos;exécutera le{" "}
                    <strong>{(() => { const d = new Date("2026-04-20"); d.setDate(d.getDate() + (context === "before" ? -Number(daysOffset) : Number(daysOffset))); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); })()}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Quel événement déclenche la règle ?</p>
                  <div className="space-y-2">
                    {(context === "event_formation" ? FORMATION_EVENTS : CRM_EVENTS).map(ev => (
                      <button key={ev.value} onClick={() => setEventType(ev.value)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${eventType === ev.value ? "border-[#374151] bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <p className="text-sm">{ev.label}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ Step 3 — Action (intelligent) ══ */}
          {step === 3 && (
            <div className="space-y-4">
              {/* 3.1 — Type d'action */}
              {!actionType ? (
                <>
                  <p className="text-sm font-medium">Quel type d&apos;action ?</p>
                  <div className="space-y-2">
                    {ACTION_TYPES.map(a => (
                      <button key={a.value} onClick={() => setActionType(a.value)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{a.icon}</span>
                          <div>
                            <p className="text-sm font-medium">{a.label}</p>
                            <p className="text-xs text-muted-foreground">{a.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* Back to action type selection */}
                  <button onClick={() => setActionType("")} className="text-xs text-muted-foreground hover:text-gray-700 flex items-center gap-1">
                    <ChevronLeft className="h-3 w-3" /> Changer le type d&apos;action
                  </button>

                  {/* 3.2 — Paramètres selon l'action */}

                  {/* ── Email ── */}
                  {actionType === "send_email" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">Template email</Label>
                        {options && options.email_templates.length > 0 ? (
                          <Select value={templateId} onValueChange={setTemplateId}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un template..." /></SelectTrigger>
                            <SelectContent>
                              {options.email_templates.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  <span>{t.name}</span>
                                  <span className="text-gray-400 ml-2 text-xs">— {t.subject}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="mt-1 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-xs">
                              <p className="font-medium text-amber-800">Aucun template email créé</p>
                              <Link href="/admin/emails" className="text-amber-700 underline">Créer un template →</Link>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm">Destinataires</Label>
                        <Select value={recipientType} onValueChange={setRecipientType}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RECIPIENTS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* ── Document ── */}
                  {actionType === "generate_document" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">Type de document</Label>
                        <Select value={documentType} onValueChange={setDocumentType}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un type..." /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(docsByCategory).map(([cat, docs]) => (
                              <SelectGroup key={cat}>
                                <SelectLabel>{CATEGORY_LABELS[cat] || cat}</SelectLabel>
                                {docs.map(d => (
                                  <SelectItem key={d.key} value={d.key}>
                                    <span className="mr-1.5">{d.icon}</span> {d.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm">Pour qui ?</Label>
                        <Select value={recipientType} onValueChange={setRecipientType}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="learners">Chaque apprenant</SelectItem>
                            <SelectItem value="companies">L&apos;entreprise cliente</SelectItem>
                            <SelectItem value="trainers">Chaque formateur</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* ── Questionnaire ── */}
                  {actionType === "send_questionnaire" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">Type de questionnaire</Label>
                        <Select value={satisfactionType} onValueChange={setSatisfactionType}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Satisfaction</SelectLabel>
                              {(options?.satisfaction_types || []).map(s => (
                                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                              ))}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Évaluation</SelectLabel>
                              {(options?.evaluation_types || []).map(e => (
                                <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800">Le questionnaire sera envoyé par email aux apprenants avec un lien unique pour y répondre.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══ Step 4 — Récap ══ */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm leading-relaxed">
                <p className="font-medium text-gray-900 mb-2">Récapitulatif</p>
                <p className="text-gray-700">{summaryText}</p>
              </div>
              <div>
                <Label className="text-sm">Nom de la règle</Label>
                <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder={autoName} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Laissez vide pour utiliser le nom auto-généré</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetAndClose}>Annuler</Button>
            {step < 4 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="gap-1">
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleCreate} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Créer la règle
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

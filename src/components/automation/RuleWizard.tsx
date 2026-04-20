"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ChevronRight, ChevronLeft, Check } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  entityId: string;
}

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

export function RuleWizard({ open, onClose, onCreated, entityId }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [context, setContext] = useState("");
  // Step 2
  const [daysOffset, setDaysOffset] = useState("5");
  const [eventType, setEventType] = useState("");
  // Step 3
  const [recipientType, setRecipientType] = useState("learners");
  const [documentType, setDocumentType] = useState("");
  // Step 4
  const [ruleName, setRuleName] = useState("");

  const selectedContext = CONTEXTS.find(c => c.value === context);
  const triggerType = selectedContext?.trigger || eventType;
  const scope = selectedContext?.scope || "formation";

  const isDateBased = context === "before" || context === "after";
  const needsEventSelect = context === "event_formation" || context === "event_crm";

  // Auto-generate name
  const autoName = (() => {
    const parts: string[] = [];
    if (documentType) parts.push(documentType.replace(/_/g, " "));
    else parts.push("Action");
    if (isDateBased) {
      parts.push(context === "before" ? `J-${daysOffset}` : `J+${daysOffset}`);
    }
    return parts.join(" ").slice(0, 50);
  })();

  // Summary text
  const summaryText = (() => {
    const when = isDateBased
      ? `${daysOffset} jour${Number(daysOffset) > 1 ? "s" : ""} ${context === "before" ? "avant le début" : "après la fin"} de chaque formation`
      : (FORMATION_EVENTS.find(e => e.value === eventType) || CRM_EVENTS.find(e => e.value === eventType))?.label || "sur un événement";
    const who = RECIPIENTS.find(r => r.value === recipientType)?.label || recipientType;
    return `${when}, un email sera envoyé aux ${who.toLowerCase()}.`;
  })();

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = {
        name: ruleName || autoName,
        trigger_type: triggerType,
        days_offset: isDateBased ? Number(daysOffset) : 0,
        document_type: documentType || "email",
        recipient_type: recipientType,
        is_enabled: true,
        entity_id: entityId,
      };

      const endpoint = scope === "formation"
        ? "/api/formations/automation-rules"
        : "/api/crm/automations";

      // For formation rules, we PUT all rules (the API replaces all)
      // So we need to GET existing, add new, then PUT
      if (scope === "formation") {
        const existing = await fetch(endpoint).then(r => r.json());
        const currentRules = existing.rules || [];
        const allRules = [...currentRules, payload];

        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: allRules }),
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
    setRecipientType("learners");
    setDocumentType("");
    setRuleName("");
    onClose();
  };

  const canNext = () => {
    if (step === 1) return !!context;
    if (step === 2) return isDateBased ? Number(daysOffset) >= 0 : !!eventType;
    if (step === 3) return !!recipientType;
    return true;
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

        <div className="min-h-[200px] space-y-4">
          {/* Step 1 — Quand ? */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Quand cette règle doit-elle se déclencher ?</p>
              <div className="space-y-2">
                {CONTEXTS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setContext(c.value)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${context === c.value ? "border-[#374151] bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <p className="text-sm font-medium">{c.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Délai / Événement */}
          {step === 2 && (
            <div className="space-y-3">
              {isDateBased ? (
                <>
                  <p className="text-sm font-medium">
                    Combien de jours {context === "before" ? "avant le début" : "après la fin"} ?
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      max="90"
                      value={daysOffset}
                      onChange={(e) => setDaysOffset(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">jour{Number(daysOffset) > 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-xs text-muted-foreground bg-blue-50 rounded-lg p-3">
                    Exemple : si la formation {context === "before" ? "commence" : "finit"} le 20 avril,
                    la règle s&apos;exécutera le{" "}
                    <strong>
                      {(() => {
                        const d = new Date("2026-04-20");
                        d.setDate(d.getDate() + (context === "before" ? -Number(daysOffset) : Number(daysOffset)));
                        return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
                      })()}
                    </strong>.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Quel événement déclenche la règle ?</p>
                  <div className="space-y-2">
                    {(context === "event_formation" ? FORMATION_EVENTS : CRM_EVENTS).map(ev => (
                      <button
                        key={ev.value}
                        onClick={() => setEventType(ev.value)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${eventType === ev.value ? "border-[#374151] bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <p className="text-sm">{ev.label}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3 — Action */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">À qui envoyer ?</p>
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECIPIENTS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div>
                <Label className="text-sm">Type de document (optionnel)</Label>
                <Input
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  placeholder="Ex: convocation, questionnaire_satisfaction..."
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Step 4 — Récap */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm leading-relaxed">
                <p className="font-medium text-gray-900 mb-2">Récapitulatif</p>
                <p className="text-gray-700">{summaryText}</p>
              </div>
              <div>
                <Label className="text-sm">Nom de la règle</Label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder={autoName}
                  className="mt-1"
                />
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

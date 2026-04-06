"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { CheckCircle, Info, Loader2, Play, Save, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

interface AutomationRule {
  id: string | null;
  entity_id: string;
  trigger_type: string;
  document_type: string;
  days_offset: number;
  is_enabled: boolean;
  template_id: string | null;
  recipient_type: string;
  name: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  convention_entreprise: "Convention entreprise",
  convocation: "Convocation",
  certificat_realisation: "Certificat de réalisation",
  questionnaire_satisfaction: "Questionnaire de satisfaction",
};

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  session_start_minus_days: "jours avant le début",
  session_end_plus_days: "jours après la fin",
  on_session_creation: "à la création de la session",
  on_session_completion: "à la complétion (terminé)",
  opco_deposit_reminder: "rappel dépôt OPCO (J-X avant début)",
};

const RECIPIENT_LABELS: Record<string, string> = {
  learners: "📚 Apprenants",
  trainers: "🎓 Formateurs",
  all: "👥 Tous",
};

export default function AutomationPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const { entityId } = useEntity();

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runErrors, setRunErrors] = useState<string[]>([]);
  const [showErrorsDialog, setShowErrorsDialog] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/formations/automation-rules");
      const data = await res.json();
      if (res.ok) {
        setRules(data.rules);
        setIsDefault(data.is_default);
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les règles", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    if (!entityId) return;
    supabase.from("email_templates").select("id, name, subject, body").eq("entity_id", entityId)
      .then(({ data }) => setTemplates(data ?? []));
  }, [supabase, entityId]);

  const updateRule = (index: number, field: keyof AutomationRule, value: unknown) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const addRule = () => {
    setRules((prev) => [...prev, {
      id: null,
      entity_id: entityId || "",
      trigger_type: "session_start_minus_days",
      document_type: "convocation",
      days_offset: 5,
      is_enabled: true,
      template_id: null,
      recipient_type: "learners",
      name: "",
    }]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/formations/automation-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Réglages enregistrés", description: `${data.saved} règle${data.saved !== 1 ? "s" : ""} sauvegardée${data.saved !== 1 ? "s" : ""}` });
        setIsDefault(false);
        fetchRules();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/formations/automation-rules/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Exécution terminée",
          description: `${data.emails_sent} email${data.emails_sent !== 1 ? "s" : ""} envoyé${data.emails_sent !== 1 ? "s" : ""} (${data.processed} traité${data.processed !== 1 ? "s" : ""})`,
        });
        if (data.errors && data.errors.length > 0) {
          setRunErrors(data.errors);
          setShowErrorsDialog(true);
        }
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible d'exécuter les règles", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#DC2626] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/trainings" className="text-[#DC2626] hover:underline">Formations</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Automatisation</span>
      </div>

      <h1 className="text-gray-700 text-xl font-bold mb-6">Formations / Réglages d&apos;Automatisation</h1>

      {isDefault && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <Info className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-sm font-medium">
            Réglages par défaut — pas encore sauvegardés
          </p>
        </div>
      )}

      {!isDefault && !loading && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4 mb-8">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-green-700 text-sm font-medium">
            L&apos;automatisation des emails est activée dans votre compte
          </p>
        </div>
      )}

      {/* Rules section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-gray-700 font-semibold text-base mb-1">Règles d&apos;automatisation</h2>
        <p className="text-sm text-gray-500 mb-6">
          Configurez les envois automatiques liés aux formations. Vous pouvez lier un modèle email pour personnaliser le contenu.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#DC2626]" />
          </div>
        ) : (
          <div className="space-y-6">
            {rules.map((rule, index) => (
              <div key={`${rule.trigger_type}-${rule.document_type}-${index}`} className="p-4 border border-gray-100 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0" style={{ background: "#DC2626" }}>
                    {index + 1}
                  </span>
                  <Switch
                    checked={rule.is_enabled}
                    onCheckedChange={(checked) => updateRule(index, "is_enabled", checked)}
                  />
                  <Input
                    value={rule.name || ""}
                    onChange={(e) => updateRule(index, "name", e.target.value)}
                    placeholder={DOCUMENT_TYPE_LABELS[rule.document_type] ?? "Nom de la règle"}
                    className="flex-1 h-8 text-sm"
                    disabled={!rule.is_enabled}
                  />
                  <button
                    onClick={() => removeRule(index)}
                    className="text-xs text-red-400 hover:text-red-600 px-2"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-3 pl-9">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Document</Label>
                    <Select
                      value={rule.document_type}
                      onValueChange={(v) => updateRule(index, "document_type", v)}
                      disabled={!rule.is_enabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Déclencheur</Label>
                    <div className="flex items-center gap-1">
                      {(rule.trigger_type === "session_start_minus_days" || rule.trigger_type === "session_end_plus_days" || rule.trigger_type === "opco_deposit_reminder") && (
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={rule.days_offset}
                          onChange={(e) => updateRule(index, "days_offset", parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-xs text-center"
                          disabled={!rule.is_enabled}
                        />
                      )}
                      <Select
                        value={rule.trigger_type}
                        onValueChange={(v) => updateRule(index, "trigger_type", v)}
                        disabled={!rule.is_enabled}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="session_start_minus_days">avant début</SelectItem>
                          <SelectItem value="session_end_plus_days">après fin</SelectItem>
                          <SelectItem value="on_session_creation">à la création</SelectItem>
                          <SelectItem value="on_session_completion">à la complétion</SelectItem>
                          <SelectItem value="opco_deposit_reminder">rappel OPCO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Template email</Label>
                    <Select
                      value={rule.template_id || "none"}
                      onValueChange={(v) => updateRule(index, "template_id", v === "none" ? null : v)}
                      disabled={!rule.is_enabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="— Défaut —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Email automatique —</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Destinataires</Label>
                    <Select
                      value={rule.recipient_type || "learners"}
                      onValueChange={(v) => updateRule(index, "recipient_type", v)}
                      disabled={!rule.is_enabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RECIPIENT_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addRule} className="w-full gap-2">
              <Plus className="h-4 w-4" /> Ajouter une règle
            </Button>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            style={{ background: "#DC2626" }}
            className="text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
          <Button
            variant="outline"
            onClick={handleRun}
            disabled={running || loading || isDefault}
          >
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {running ? "Exécution..." : "Exécuter maintenant"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Récapitulatif des relances actives</h3>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-2">
            {rules.filter((r) => r.is_enabled).map((rule, i) => {
              const tpl = rule.template_id ? templates.find((t) => t.id === rule.template_id) : null;
              return (
                <div key={`summary-${i}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {rule.name || DOCUMENT_TYPE_LABELS[rule.document_type] || rule.document_type}
                    {tpl && <span className="text-xs text-gray-400 ml-2">({tpl.name})</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{RECIPIENT_LABELS[rule.recipient_type] || "📚"}</span>
                    <span className="font-medium text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">
                      {rule.trigger_type === "session_start_minus_days" ? `J-${rule.days_offset}` : rule.trigger_type === "session_end_plus_days" ? `J+${rule.days_offset}` : rule.trigger_type === "on_session_creation" ? "Création" : rule.trigger_type === "on_session_completion" ? "Complétion" : rule.trigger_type === "opco_deposit_reminder" ? `OPCO J-${rule.days_offset}` : rule.trigger_type}
                    </span>
                  </div>
                </div>
              );
            })}
            {rules.filter((r) => r.is_enabled).length === 0 && (
              <p className="text-sm text-gray-400 italic">Aucune règle active</p>
            )}
          </div>
        )}
      </div>

      {/* Errors Dialog */}
      <Dialog open={showErrorsDialog} onOpenChange={setShowErrorsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Erreurs lors de l&apos;exécution
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {runErrors.map((err, i) => (
              <p key={i} className="text-sm text-red-600 bg-red-50 rounded p-2">{err}</p>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowErrorsDialog(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle, Info, Loader2, Play, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
};

export default function AutomationPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<AutomationRule[]>([]);
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

  const updateRule = (index: number, field: keyof AutomationRule, value: unknown) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
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
    <div className="p-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/trainings" className="text-[#3DB5C5] hover:underline">Formations</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Automatisation</span>
      </div>

      {/* Title */}
      <h1 className="text-gray-700 text-xl font-bold mb-6">Formations / Réglages d&apos;Automatisation</h1>

      {/* Default banner */}
      {isDefault && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <Info className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-700 text-sm font-medium">
            Réglages par défaut — pas encore sauvegardés
          </p>
        </div>
      )}

      {/* Success banner */}
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
        <h2 className="text-gray-700 font-semibold text-base mb-1">Réglages des relances :</h2>
        <p className="text-sm text-gray-500 mb-6">
          Configurez le délai en jours et activez ou désactivez chaque règle d&apos;envoi automatique.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#3DB5C5]" />
          </div>
        ) : (
          <div className="space-y-6">
            {rules.map((rule, index) => (
              <div key={`${rule.trigger_type}-${rule.document_type}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: "#3DB5C5" }}
                  >
                    {index + 1}
                  </span>
                  <Switch
                    checked={rule.is_enabled}
                    onCheckedChange={(checked) => updateRule(index, "is_enabled", checked)}
                  />
                  <span className="text-sm text-gray-700 flex-1 min-w-[200px]">
                    {DOCUMENT_TYPE_LABELS[rule.document_type] ?? rule.document_type}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={rule.days_offset}
                      onChange={(e) => updateRule(index, "days_offset", parseInt(e.target.value) || 1)}
                      className="w-20 text-center"
                      disabled={!rule.is_enabled}
                    />
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                      {TRIGGER_TYPE_LABELS[rule.trigger_type] ?? rule.trigger_type}
                    </span>
                  </div>
                </div>
                {index < rules.length - 1 && <hr className="mt-6 border-gray-100" />}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            style={{ background: "#3DB5C5" }}
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
            {rules.filter((r) => r.is_enabled).map((rule) => (
              <div key={`summary-${rule.trigger_type}-${rule.document_type}`} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {DOCUMENT_TYPE_LABELS[rule.document_type] ?? rule.document_type}
                </span>
                <span className="font-medium text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">
                  {rule.trigger_type === "session_start_minus_days" ? `J-${rule.days_offset}` : `J+${rule.days_offset}`}
                </span>
              </div>
            ))}
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

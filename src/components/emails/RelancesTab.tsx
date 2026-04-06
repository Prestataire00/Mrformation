"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Loader2, Save, RotateCcw, Mail, FileText, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

interface ReminderConfig {
  settingId: string;
  templateId: string;
  key: string;
  label: string;
  description: string;
  isEnabled: boolean;
  daysDelay: number;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  variables: string[];
}

const REMINDER_DEFS: Array<{
  key: string;
  label: string;
  description: string;
  category: "invoice" | "quote" | "opco";
  defaultDelay: number;
  variables: string[];
}> = [
  { key: "reminder_invoice_first", label: "Rappel courtois", description: "Premier rappel après échéance", category: "invoice", defaultDelay: 7, variables: ["reference", "montant", "entreprise", "formation", "date_echeance"] },
  { key: "reminder_invoice_second", label: "Rappel ferme", description: "Deuxième rappel de paiement", category: "invoice", defaultDelay: 21, variables: ["reference", "montant", "entreprise", "formation", "date_echeance"] },
  { key: "reminder_invoice_final", label: "Mise en demeure", description: "Dernier rappel avant recouvrement", category: "invoice", defaultDelay: 45, variables: ["reference", "montant", "entreprise", "formation", "date_echeance"] },
  { key: "reminder_quote_first", label: "Suivi proposition", description: "Premier suivi après envoi", category: "quote", defaultDelay: 3, variables: ["reference", "entreprise", "date_echeance"] },
  { key: "reminder_quote_second", label: "Relance", description: "Deuxième relance", category: "quote", defaultDelay: 7, variables: ["reference", "entreprise", "date_echeance"] },
  { key: "reminder_quote_final", label: "Dernière chance", description: "Relance finale avant expiration", category: "quote", defaultDelay: 14, variables: ["reference", "entreprise", "date_echeance"] },
  { key: "reminder_opco", label: "Rappel dépôt OPCO", description: "Dépôt de prise en charge non effectué", category: "opco", defaultDelay: 7, variables: ["entreprise", "formation", "date_echeance"] },
];

const CATEGORY_CONFIG = {
  invoice: { label: "Relances factures", icon: FileText, color: "text-red-600" },
  quote: { label: "Relances devis", icon: Mail, color: "text-blue-600" },
  opco: { label: "Rappels OPCO", icon: Building2, color: "text-amber-600" },
};

export function RelancesTab() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [configs, setConfigs] = useState<ReminderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    // Fetch settings
    const { data: settings } = await supabase
      .from("reminder_settings")
      .select("*")
      .eq("entity_id", entityId);

    // Fetch templates
    const { data: templates } = await supabase
      .from("email_templates")
      .select("*")
      .eq("entity_id", entityId)
      .in("type", REMINDER_DEFS.map((d) => d.key));

    const result: ReminderConfig[] = REMINDER_DEFS.map((def) => {
      const setting = (settings || []).find((s) => s.reminder_key === def.key);
      const template = (templates || []).find((t) => t.type === def.key);

      return {
        settingId: setting?.id || "",
        templateId: template?.id || "",
        key: def.key,
        label: def.label,
        description: def.description,
        isEnabled: setting?.is_enabled ?? true,
        daysDelay: setting?.days_delay ?? def.defaultDelay,
        subject: template?.subject || "",
        body: template?.body || "",
        defaultSubject: "",
        defaultBody: "",
        variables: def.variables,
      };
    });

    setConfigs(result);
    setLoading(false);
  }, [entityId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (key: string, enabled: boolean) => {
    if (!entityId) return;
    const config = configs.find((c) => c.key === key);
    if (!config) return;

    if (config.settingId) {
      await supabase.from("reminder_settings").update({ is_enabled: enabled, updated_at: new Date().toISOString() }).eq("id", config.settingId);
    } else {
      await supabase.from("reminder_settings").insert({ entity_id: entityId, reminder_key: key, is_enabled: enabled, days_delay: config.daysDelay });
    }

    setConfigs((prev) => prev.map((c) => c.key === key ? { ...c, isEnabled: enabled } : c));
    toast({ title: enabled ? "Relance activée" : "Relance désactivée" });
  };

  const handleDaysChange = async (key: string, days: number) => {
    if (!entityId) return;
    const config = configs.find((c) => c.key === key);
    if (!config) return;

    if (config.settingId) {
      await supabase.from("reminder_settings").update({ days_delay: days, updated_at: new Date().toISOString() }).eq("id", config.settingId);
    } else {
      await supabase.from("reminder_settings").insert({ entity_id: entityId, reminder_key: key, is_enabled: config.isEnabled, days_delay: days });
    }

    setConfigs((prev) => prev.map((c) => c.key === key ? { ...c, daysDelay: days } : c));
  };

  const handleSaveTemplate = async (key: string) => {
    if (!entityId) return;
    const config = configs.find((c) => c.key === key);
    if (!config) return;

    setSaving(key);

    if (config.templateId) {
      await supabase.from("email_templates").update({
        subject: config.subject,
        body: config.body,
      }).eq("id", config.templateId);
    } else {
      const { data } = await supabase.from("email_templates").insert({
        entity_id: entityId,
        name: config.label,
        subject: config.subject,
        body: config.body,
        type: key,
        variables: config.variables.map((v) => `{{${v}}}`),
      }).select("id").single();
      if (data) {
        setConfigs((prev) => prev.map((c) => c.key === key ? { ...c, templateId: data.id } : c));
      }
    }

    setSaving(null);
    toast({ title: "Template sauvegardé" });
  };

  const updateConfig = (key: string, field: "subject" | "body", value: string) => {
    setConfigs((prev) => prev.map((c) => c.key === key ? { ...c, [field]: value } : c));
  };

  const renderCategory = (category: "invoice" | "quote" | "opco") => {
    const categoryConfigs = configs.filter((c) => {
      const def = REMINDER_DEFS.find((d) => d.key === c.key);
      return def?.category === category;
    });

    return (
      <div className="space-y-4">
        {categoryConfigs.map((config) => (
          <div key={config.key} className={`border rounded-lg overflow-hidden ${config.isEnabled ? "" : "opacity-60"}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.isEnabled}
                  onCheckedChange={(checked) => handleToggle(config.key, checked)}
                />
                <div>
                  <span className="text-sm font-medium">{config.label}</span>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Délai :</span>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={config.daysDelay}
                  onChange={(e) => handleDaysChange(config.key, parseInt(e.target.value) || 7)}
                  className="w-16 h-7 text-xs text-center"
                />
                <span className="text-xs text-muted-foreground">jours</span>
              </div>
            </div>

            {/* Template editor */}
            {config.isEnabled && (
              <div className="px-4 py-3 space-y-3">
                <div>
                  <Label className="text-xs">Objet de l&apos;email</Label>
                  <Input
                    value={config.subject}
                    onChange={(e) => updateConfig(config.key, "subject", e.target.value)}
                    placeholder="Objet..."
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Corps du message</Label>
                  <Textarea
                    value={config.body}
                    onChange={(e) => updateConfig(config.key, "body", e.target.value)}
                    rows={6}
                    className="text-sm font-mono"
                    placeholder="Contenu de l'email..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {config.variables.map((v) => (
                      <Badge key={v} variant="outline" className="text-xs cursor-pointer hover:bg-blue-50"
                        onClick={() => {
                          updateConfig(config.key, "body", config.body + `{{${v}}}`);
                        }}
                      >
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => fetchData()}
                    >
                      <RotateCcw className="h-3 w-3" /> Réinitialiser
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleSaveTemplate(config.key)}
                      disabled={saving === config.key}
                    >
                      {saving === config.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Sauvegarder
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Personnalisez les emails de relance et activez/désactivez chaque type.
      </p>

      <Tabs defaultValue="invoice" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoice" className="gap-2">
            <FileText className="h-4 w-4" /> Factures
          </TabsTrigger>
          <TabsTrigger value="quote" className="gap-2">
            <Mail className="h-4 w-4" /> Devis
          </TabsTrigger>
          <TabsTrigger value="opco" className="gap-2">
            <Building2 className="h-4 w-4" /> OPCO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoice">{renderCategory("invoice")}</TabsContent>
        <TabsContent value="quote">{renderCategory("quote")}</TabsContent>
        <TabsContent value="opco">{renderCategory("opco")}</TabsContent>
      </Tabs>
    </div>
  );
}

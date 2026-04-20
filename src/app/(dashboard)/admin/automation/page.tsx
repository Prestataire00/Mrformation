"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Zap, Plus, Search, Package, CheckCircle, Clock, Trash2,
} from "lucide-react";
import { RuleWizard } from "@/components/automation/RuleWizard";
import { QuickStartPacks } from "@/components/automation/QuickStartPacks";
import { TRIGGER_LABELS } from "@/lib/automation/compute-events";

interface Rule {
  id: string;
  name: string | null;
  trigger_type: string;
  days_offset: number | null;
  document_type: string | null;
  recipient_type: string;
  is_enabled: boolean;
  condition_subcontracted: boolean | null;
  created_at?: string;
}

export default function AutomationPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const { entity } = useEntity();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";

  const [formationRules, setFormationRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");

  const fetchRules = useCallback(async () => {
    if (!entity?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from("formation_automation_rules")
      .select("id, name, trigger_type, days_offset, document_type, recipient_type, is_enabled, condition_subcontracted, created_at")
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false });

    setFormationRules(data || []);
    setLoading(false);
  }, [entity?.id, supabase]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggle = async (rule: Rule) => {
    const { error } = await supabase
      .from("formation_automation_rules")
      .update({ is_enabled: !rule.is_enabled })
      .eq("id", rule.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: rule.is_enabled ? "Règle désactivée" : "Règle activée" });
      fetchRules();
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!confirm(`Supprimer la règle "${rule.name || rule.trigger_type}" ?`)) return;
    const { error } = await supabase
      .from("formation_automation_rules")
      .delete()
      .eq("id", rule.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Règle supprimée" });
      fetchRules();
    }
  };

  const allRules = formationRules;
  const existingRuleNames = allRules.map(r => r.name || "").filter(Boolean);

  const filteredRules = allRules.filter(r =>
    !search ||
    (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
    r.trigger_type.toLowerCase().includes(search.toLowerCase()) ||
    (r.document_type || "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = allRules.filter(r => r.is_enabled).length;

  if (loading) return <div className="p-6 flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const renderRuleRow = (rule: Rule) => {
    const triggerLabel = TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type;
    const offset = rule.days_offset || 0;
    const offsetLabel = offset > 0
      ? rule.trigger_type.includes("minus") ? `J-${offset}` : `J+${offset}`
      : "";

    return (
      <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Switch
            checked={rule.is_enabled}
            onCheckedChange={() => handleToggle(rule)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn("text-sm font-medium truncate", !rule.is_enabled && "text-muted-foreground line-through")}>
                {rule.name || triggerLabel}
              </p>
              {offsetLabel && (
                <Badge variant="outline" className="text-[10px] shrink-0">{offsetLabel}</Badge>
              )}
              {rule.condition_subcontracted && (
                <Badge variant="outline" className="text-[10px] shrink-0 border-purple-200 text-purple-700">Sous-traitance</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {triggerLabel} — {rule.recipient_type} — {rule.document_type || "email"}
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 shrink-0" onClick={() => handleDelete(rule)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-500" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Automatisations</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} règle{activeCount !== 1 ? "s" : ""} active{activeCount !== 1 ? "s" : ""} sur {allRules.length}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
            const el = document.getElementById("packs-section");
            el?.scrollIntoView({ behavior: "smooth" });
          }}>
            <Package className="h-3.5 w-3.5" /> Ajouter un pack
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setWizardOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nouvelle règle
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: allRules.length, icon: Zap, color: "text-gray-600" },
          { label: "Actives", value: activeCount, icon: CheckCircle, color: "text-emerald-600" },
          { label: "Désactivées", value: allRules.length - activeCount, icon: Clock, color: "text-amber-600" },
          { label: "Formations", value: formationRules.length, icon: Zap, color: "text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-2.5">
              <Icon className={cn("h-4 w-4", color)} />
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Packs section */}
      <div id="packs-section">
        <QuickStartPacks onActivated={fetchRules} existingRuleNames={existingRuleNames} />
      </div>

      {/* Rules tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            Toutes ({allRules.length})
          </TabsTrigger>
          <TabsTrigger value="formations" className="text-xs gap-1.5">
            Formations ({formationRules.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Rechercher une règle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          {filteredRules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto text-gray-300 mb-3" />
              <p className="text-sm">Aucune règle configurée</p>
              <p className="text-xs mt-1">Activez un pack ou créez votre première règle</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRules.map(renderRuleRow)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="formations" className="mt-4 space-y-2">
          {formationRules.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-8">Aucune règle formation</p>
          ) : (
            formationRules.map(renderRuleRow)
          )}
        </TabsContent>
      </Tabs>

      {/* Wizard */}
      <RuleWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={fetchRules}
        entityId={entity?.id || ""}
      />
    </div>
  );
}

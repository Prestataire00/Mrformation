"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RelancesTab } from "@/components/emails/RelancesTab";
import { Cog, GraduationCap, Briefcase, ExternalLink } from "lucide-react";

/**
 * Story em-c-5 — Tab Automatisations avec 3 sous-tabs.
 *
 * 1. Relances : RelancesTab existant (config invoice/quote/OPCO reminders)
 * 2. Déclencheurs formation : lecture seule des formation_automation_rules
 *    avec liens profonds vers /admin/formations/[id] pour édition
 * 3. Automatisations CRM : lecture seule des crm_automation_rules
 *    (post-fix RLS em-a-4, entity-scoped) avec lien vers
 *    /admin/crm/automations pour édition.
 *
 * Cette tab est un dashboard read-only — l'édition se fait dans les
 * pages dédiées (formations / crm). Séparation des préoccupations claire
 * (UX Sally §3.1) : "Le contenu du template vit dans /admin/emails,
 * la config trigger vit dans Automatisations / pages dédiées."
 */

type FormationAutomationRule = {
  id: string;
  name: string;
  trigger_type: string;
  document_type: string | null;
  days_offset: number | null;
  is_enabled: boolean;
  template_id: string | null;
  template_name?: string;
  session_count?: number;
};

type CrmAutomationRule = {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
};

export function AutomationsTab() {
  const { entity } = useEntity();
  const supabase = createClient();
  const { toast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<"reminders" | "formation" | "crm">("reminders");

  const [formationRules, setFormationRules] = useState<FormationAutomationRule[]>([]);
  const [crmRules, setCrmRules] = useState<CrmAutomationRule[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFormationRules = useCallback(async () => {
    if (!entity?.id) return;
    setLoading(true);
    // Join template name pour affichage lisible
    const { data, error } = await supabase
      .from("formation_automation_rules")
      .select("id, name, trigger_type, document_type, days_offset, is_enabled, template_id, template:email_templates(name)")
      .eq("entity_id", entity.id)
      .order("trigger_type", { ascending: true });
    setLoading(false);
    if (error) {
      toast({ title: "Erreur chargement rules formation", description: error.message, variant: "destructive" });
      return;
    }
    const enriched = (data ?? []).map((r) => {
      const tplRel = (r as Record<string, unknown>).template;
      const tpl = Array.isArray(tplRel) ? tplRel[0] : tplRel;
      return {
        ...r,
        template_name: (tpl as { name?: string } | null)?.name,
      } as FormationAutomationRule;
    });
    setFormationRules(enriched);
  }, [entity?.id, supabase, toast]);

  const fetchCrmRules = useCallback(async () => {
    if (!entity?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_automation_rules")
      .select("id, name, trigger_type, action_type, is_enabled, config")
      .eq("entity_id", entity.id)
      .order("trigger_type", { ascending: true });
    setLoading(false);
    if (error) {
      toast({ title: "Erreur chargement rules CRM", description: error.message, variant: "destructive" });
      return;
    }
    setCrmRules((data ?? []) as CrmAutomationRule[]);
  }, [entity?.id, supabase, toast]);

  useEffect(() => {
    if (activeSubTab === "formation") fetchFormationRules();
    else if (activeSubTab === "crm") fetchCrmRules();
  }, [activeSubTab, fetchFormationRules, fetchCrmRules]);

  return (
    <Tabs
      value={activeSubTab}
      onValueChange={(v) => setActiveSubTab(v as typeof activeSubTab)}
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="reminders" className="gap-2">
          <Cog className="h-3.5 w-3.5" /> Relances
        </TabsTrigger>
        <TabsTrigger value="formation" className="gap-2">
          <GraduationCap className="h-3.5 w-3.5" /> Déclencheurs formation
        </TabsTrigger>
        <TabsTrigger value="crm" className="gap-2">
          <Briefcase className="h-3.5 w-3.5" /> Automatisations CRM
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reminders">
        <RelancesTab />
      </TabsContent>

      <TabsContent value="formation" className="space-y-3">
        <div className="text-sm text-gray-600">
          Règles d&apos;envoi automatique liées aux sessions de formation. L&apos;édition se fait dans la page de chaque
          session (onglet Automation).
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : formationRules.length === 0 ? (
          <div className="text-sm text-gray-400 italic py-8 text-center">
            Aucune règle d&apos;automation formation configurée pour cette entité.
          </div>
        ) : (
          <div className="space-y-2">
            {formationRules.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 bg-white flex items-center gap-3">
                <Badge className={r.is_enabled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                  {r.is_enabled ? "Actif" : "Désactivé"}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    {r.trigger_type} {r.days_offset !== null ? `· ${r.days_offset >= 0 ? "+" : ""}${r.days_offset}j` : ""}
                    {r.template_name ? ` · Template: ${r.template_name}` : " · Pas de template lié"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="crm" className="space-y-3">
        <div className="text-sm text-gray-600 flex items-center gap-2 justify-between flex-wrap">
          <span>
            Règles d&apos;automation côté CRM (conversion prospect, relances devis, etc.).
          </span>
          <Link
            href="/admin/crm/automations"
            className="text-blue-600 hover:text-blue-700 text-xs inline-flex items-center gap-1"
          >
            Éditer dans /admin/crm/automations <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : crmRules.length === 0 ? (
          <div className="text-sm text-gray-400 italic py-8 text-center">
            Aucune automation CRM configurée pour cette entité.
          </div>
        ) : (
          <div className="space-y-2">
            {crmRules.map((r) => {
              const cfgTplId =
                typeof r.config === "object" && r.config && "template_id" in r.config
                  ? (r.config as { template_id?: string }).template_id
                  : undefined;
              return (
                <div key={r.id} className="border rounded-lg p-3 bg-white flex items-center gap-3">
                  <Badge className={r.is_enabled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {r.is_enabled ? "Actif" : "Désactivé"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{r.name}</p>
                    <p className="text-xs text-gray-500">
                      {r.trigger_type} → {r.action_type}
                      {r.action_type === "send_email" && cfgTplId ? " · template lié dans config" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

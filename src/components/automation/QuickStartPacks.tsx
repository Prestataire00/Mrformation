"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, Package } from "lucide-react";
import { AUTOMATION_PACKS, type AutomationPack, type AutomationRuleTemplate } from "@/lib/automation/default-packs";

interface Props {
  onActivated: () => void;
  existingRuleNames: string[];
}

const COLOR_MAP: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50/50 hover:border-blue-300",
  green: "border-green-200 bg-green-50/50 hover:border-green-300",
  purple: "border-purple-200 bg-purple-50/50 hover:border-purple-300",
  amber: "border-amber-200 bg-amber-50/50 hover:border-amber-300",
};

export function QuickStartPacks({ onActivated, existingRuleNames }: Props) {
  const { toast } = useToast();
  const [selectedPack, setSelectedPack] = useState<AutomationPack | null>(null);
  const [checkedRules, setCheckedRules] = useState<Set<number>>(new Set());
  const [activating, setActivating] = useState(false);

  const openPack = (pack: AutomationPack) => {
    setSelectedPack(pack);
    // Pre-check all rules that don't already exist
    const checked = new Set<number>();
    pack.rules.forEach((r, i) => {
      if (!existingRuleNames.some(n => n.toLowerCase() === r.name.toLowerCase())) {
        checked.add(i);
      }
    });
    setCheckedRules(checked);
  };

  const toggleRule = (idx: number) => {
    setCheckedRules(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleActivate = async () => {
    if (!selectedPack) return;
    setActivating(true);
    try {
      const rulesToCreate = selectedPack.rules.filter((_, i) => checkedRules.has(i));

      // Fetch existing formation rules
      const existingRes = await fetch("/api/formations/automation-rules");
      const existing = await existingRes.json();
      const currentRules: AutomationRuleTemplate[] = existing.rules || [];

      // Separate by scope
      const formationRules = rulesToCreate.filter(r => r.scope === "formation");

      if (formationRules.length > 0) {
        const newRules = formationRules.map(r => ({
          name: r.name,
          trigger_type: r.trigger_type,
          days_offset: r.days_offset ?? 0,
          document_type: r.document_type || "email",
          recipient_type: r.recipient_type || "learners",
          is_enabled: true,
        }));

        const allRules = [...currentRules, ...newRules];
        const res = await fetch("/api/formations/automation-rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: allRules }),
        });
        if (!res.ok) {
          const errBody = await res.text();
          console.error("[pack-activation] PUT failed:", res.status, errBody);
          throw new Error(`Erreur serveur (${res.status})`);
        }
      }

      toast({
        title: `${selectedPack.name} activé`,
        description: `${checkedRules.size} règle${checkedRules.size > 1 ? "s" : ""} créée${checkedRules.size > 1 ? "s" : ""}`,
      });
      setSelectedPack(null);
      onActivated();
    } catch (err) {
      console.error("[pack-activation]", err);
      toast({ title: "Erreur d'activation", description: err instanceof Error ? err.message : "Impossible d'activer le pack", variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Packs de démarrage rapide</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {AUTOMATION_PACKS.map(pack => (
            <Card
              key={pack.id}
              className={`cursor-pointer transition-all border-2 ${COLOR_MAP[pack.color] || COLOR_MAP.blue}`}
              onClick={() => openPack(pack)}
            >
              <CardContent className="p-4">
                <div className="text-2xl mb-2">{pack.icon}</div>
                <h4 className="text-sm font-semibold text-gray-900">{pack.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">{pack.description}</p>
                <Badge variant="outline" className="text-[10px] mt-2">{pack.rules.length} règle{pack.rules.length > 1 ? "s" : ""}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pack detail dialog */}
      <Dialog open={!!selectedPack} onOpenChange={(o) => !o && setSelectedPack(null)}>
        <DialogContent className="max-w-lg">
          {selectedPack && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-xl">{selectedPack.icon}</span>
                  {selectedPack.name}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{selectedPack.description}</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {selectedPack.rules.map((rule, idx) => {
                  const isDuplicate = existingRuleNames.some(n => n.toLowerCase() === rule.name.toLowerCase());
                  return (
                    <label
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checkedRules.has(idx) ? "border-[#374151] bg-gray-50" : "border-gray-200"
                      } ${isDuplicate ? "opacity-60" : ""}`}
                    >
                      <Checkbox
                        checked={checkedRules.has(idx)}
                        onCheckedChange={() => toggleRule(idx)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{rule.name}</p>
                          {isDuplicate && <Badge variant="outline" className="text-[9px] text-amber-600">Existe déjà</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedPack(null)}>Annuler</Button>
                <Button onClick={handleActivate} disabled={activating || checkedRules.size === 0} className="gap-1">
                  {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Activer {checkedRules.size} règle{checkedRules.size > 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

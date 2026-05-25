"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

export interface AuditFinding {
  critere: number;
  status: string;
  question: string;
  recommendation: string;
}

export interface AuditAction {
  title: string;
  priority: string;
  estimated_effort?: string;
}

export interface AuditResult {
  overall_verdict: string;
  findings: AuditFinding[];
  action_plan: AuditAction[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AuditResult | null;
}

function verdictBadgeClass(verdict: string): string {
  if (verdict === "conforme") return "bg-green-500";
  if (verdict === "ecarts_majeurs") return "bg-red-500";
  return "bg-amber-500";
}

function verdictLabel(verdict: string): string {
  if (verdict === "conforme") return "Conforme";
  if (verdict === "ecarts_majeurs") return "Écarts majeurs";
  if (verdict === "ecarts_mineurs") return "Écarts mineurs";
  return "À améliorer";
}

function findingIcon(status: string) {
  if (status === "conforme") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "ecart_majeur") return <XCircle className="h-4 w-4 text-red-600" />;
  return <AlertCircle className="h-4 w-4 text-amber-600" />;
}

function priorityClass(priority: string): string {
  if (priority === "urgent") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  return "bg-blue-50 text-blue-700";
}

export function QualiopiAuditDetail({ open, onOpenChange, result }: Props) {
  if (!result) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Audit blanc IA</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mt-4">Aucun audit chargé.</p>
        </SheetContent>
      </Sheet>
    );
  }

  // Groupe les findings par critère (1-7)
  const byCritere = new Map<number, AuditFinding[]>();
  for (const f of result.findings) {
    if (!byCritere.has(f.critere)) byCritere.set(f.critere, []);
    byCritere.get(f.critere)!.push(f);
  }
  const sortedCriteres = [...byCritere.keys()].sort((a, b) => a - b);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Audit blanc IA — détail
            <Badge className={verdictBadgeClass(result.overall_verdict)}>
              {verdictLabel(result.overall_verdict)}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            {result.findings.length} constat(s) · {result.action_plan.length} action(s) recommandée(s)
          </SheetDescription>
        </SheetHeader>

        {/* Findings groupés par critère */}
        <div className="mt-6 space-y-5">
          {sortedCriteres.map(critere => (
            <div key={critere} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 text-sm font-semibold">
                Critère {critere}
              </div>
              <div className="divide-y">
                {byCritere.get(critere)!.map((f, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {findingIcon(f.status)}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{f.question}</p>
                        {f.recommendation && (
                          <p className="text-xs text-muted-foreground mt-1">💡 {f.recommendation}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Plan d'action */}
        {result.action_plan.length > 0 && (
          <div className="mt-8">
            <h4 className="text-sm font-semibold mb-3">Plan d&apos;action recommandé</h4>
            <div className="space-y-2">
              {result.action_plan.map((a, i) => (
                <div key={i} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.estimated_effort && (
                      <p className="text-xs text-muted-foreground mt-0.5">Effort estimé : {a.estimated_effort}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-xs border-0 ${priorityClass(a.priority)}`}>
                    {a.priority}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

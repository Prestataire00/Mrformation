"use client";

/**
 * Story aut-b-1 — DryRunDialog universel (formations + CRM).
 *
 * Composant pivot utilisé par toutes les surfaces UI où Loris clique
 * "🧪 Tester sans envoyer" :
 * - /admin/automation (B.2)
 * - /admin/crm/automations (C.3)
 * - TabAutomation dans formations/[id] (B.3)
 * - CrmRuleWizard étape 5 (C.1, intégré au wizard)
 *
 * Discriminator : `domain: "formation" | "crm"` (CD-AUT-5)
 * → Détermine quelle route API appeler et quel payload attendre.
 *
 * UX-DR-AUT-1 : Dialog max-w-4xl, PAS Sheet (focus complet sur le test)
 * UX-DR-AUT-2 : libellé "🧪 Tester sans envoyer" + bannière indélébile
 * UX-DR-AUT-7 : variables non résolues = warning non-bloquant
 * UX-DR-AUT-9 : statuts à 3 niveaux uniquement
 *
 * NFR-AUT-SEC-5 : garantie côté serveur (routes aut-a-6 et aut-a-3 ne
 * font aucun envoi en mode dry-run). Ce composant n'a pas à le vérifier.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Mail, Users, Paperclip, Activity } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

export type DryRunDomain = "formation" | "crm";

type Recipient = {
  id: string;
  email?: string;
  name: string;
  type?: string;
};

type RenderedEmail = {
  subject: string;
  body: string;
};

type AttachmentDescriptor = {
  key: string;
  type: "system" | "custom_docx";
  custom_name?: string;
};

// Payload retourné par /api/automation/dry-run (proxy formations)
type FormationDryRunResult = {
  mode: "dry-run";
  rule_id: string;
  rule_name?: string;
  session_id: string;
  recipients: Recipient[];
  rendered_email: RenderedEmail | null;
  attachments: AttachmentDescriptor[];
  warnings: string[];
};

// Payload retourné par /api/crm/automations/dry-run (proxy CRM)
type CrmEligibility = {
  count: number;
  sample: Array<{ id: string; name: string }>;
};

type CrmDryRunResult = {
  mode: "dry-run";
  entity_id: string;
  trigger_type: string;
  eligibility: Record<string, CrmEligibility>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  ruleId: string;
  ruleName?: string;
  domain: DryRunDomain;
  sessionId?: string;
  onDisableRule?: () => Promise<void> | void;
};

// ── Composant principal ──────────────────────────────────────────────────

export function DryRunDialog({
  open,
  onClose,
  ruleId,
  ruleName,
  domain,
  sessionId,
  onDisableRule,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formationResult, setFormationResult] = useState<FormationDryRunResult | null>(null);
  const [crmResult, setCrmResult] = useState<CrmDryRunResult | null>(null);
  const [disabling, setDisabling] = useState(false);

  // Fetch dry-run au mount
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    setFormationResult(null);
    setCrmResult(null);

    const url =
      domain === "formation"
        ? "/api/automation/dry-run"
        : "/api/crm/automations/dry-run";

    const body =
      domain === "formation"
        ? { rule_id: ruleId, session_id: sessionId }
        : { rule_id: ruleId };

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        // Les routes proxy aut-a-6 wrappent dans { data, error } ;
        // le payload réel est dans data
        const payload = json.data;
        if (domain === "formation") {
          setFormationResult(payload as FormationDryRunResult);
        } else {
          setCrmResult(payload as CrmDryRunResult);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, ruleId, sessionId, domain]);

  const handleDisable = async () => {
    if (!onDisableRule) return;
    setDisabling(true);
    try {
      await onDisableRule();
      onClose();
    } finally {
      setDisabling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            🧪 Aperçu : {ruleName ?? "Règle d'automatisation"}
          </DialogTitle>
          <DialogDescription>
            Voici ce qui aurait été envoyé si la règle se déclenchait
            maintenant.
          </DialogDescription>
        </DialogHeader>

        {/* UX-DR-AUT-2 : bannière jaune indélébile (toujours visible quel
            que soit l'onglet actif ou l'état de chargement) */}
        <div
          role="alert"
          className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm font-medium text-yellow-900 flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Aucun email envoyé. Mode aperçu.
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Calcul de l&apos;aperçu en cours…
            </span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            Impossible de calculer l&apos;aperçu : {error}
          </div>
        )}

        {!loading && !error && domain === "formation" && formationResult && (
          <FormationDryRunContent result={formationResult} />
        )}

        {!loading && !error && domain === "crm" && crmResult && (
          <CrmDryRunContent result={crmResult} />
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          {onDisableRule ? (
            <Button
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDisable}
              disabled={disabling}
            >
              {disabling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Désactiver la règle
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sous-composant : contenu formation (3 onglets) ───────────────────────

function FormationDryRunContent({ result }: { result: FormationDryRunResult }) {
  const recipientCount = result.recipients.length;
  const attachmentCount = result.attachments.length;
  const hasEmail = result.rendered_email !== null;

  // Empty state si 0 destinataires
  if (recipientCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-4xl mb-2" aria-hidden>
          🤷
        </span>
        <p className="font-medium">Aucun destinataire ciblé actuellement.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Cette règle est configurée correctement, mais aucune cible ne
          remplit les conditions aujourd&apos;hui.
        </p>
        {result.warnings.length > 0 && (
          <ul className="text-sm text-yellow-900 mt-3 list-disc list-inside">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue="recipients" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="recipients" className="gap-1.5">
          <Users className="h-4 w-4" />
          Destinataires ({recipientCount})
        </TabsTrigger>
        {hasEmail && (
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="h-4 w-4" />
            Aperçu mail
          </TabsTrigger>
        )}
        <TabsTrigger value="attachments" className="gap-1.5">
          <Paperclip className="h-4 w-4" />
          Pièces jointes ({attachmentCount})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="recipients" className="space-y-2 mt-4">
        <ul className="divide-y rounded-md border">
          {result.recipients.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between p-3 text-sm"
            >
              <div>
                <span className="font-medium">{r.name || "—"}</span>
                {r.email && (
                  <span className="text-muted-foreground ml-2">
                    &lt;{r.email}&gt;
                  </span>
                )}
              </div>
              {r.type && (
                <Badge variant="outline" className="text-xs">
                  {r.type}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </TabsContent>

      {hasEmail && result.rendered_email && (
        <TabsContent value="email" className="space-y-3 mt-4">
          {/* UX-DR-AUT-7 : warnings visibles, non bloquants */}
          {result.warnings.length > 0 && (
            <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {result.warnings.length} avertissement
                {result.warnings.length > 1 ? "s" : ""} :
              </p>
              <ul className="list-disc list-inside mt-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Sujet
            </p>
            <p className="text-sm rounded-md border bg-muted/30 p-2">
              {result.rendered_email.subject || (
                <span className="italic text-muted-foreground">(vide)</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Corps (variables non résolues affichées telles quelles)
            </p>
            <pre className="text-sm rounded-md border bg-muted/30 p-2 whitespace-pre-wrap font-sans max-h-72 overflow-y-auto">
              {result.rendered_email.body || (
                <span className="italic text-muted-foreground">(vide)</span>
              )}
            </pre>
          </div>
        </TabsContent>
      )}

      <TabsContent value="attachments" className="space-y-2 mt-4">
        {attachmentCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucune pièce jointe ne sera générée pour cette règle.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {result.attachments.map((a) => (
              <li
                key={a.key}
                className="flex items-center justify-between p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span>{a.custom_name ?? a.key}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {a.type === "custom_docx" ? "Document Word" : "Système"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ── Sous-composant : contenu CRM (eligibility par trigger) ───────────────

function CrmDryRunContent({ result }: { result: CrmDryRunResult }) {
  const entries = Object.entries(result.eligibility);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-4xl mb-2" aria-hidden>
          🤷
        </span>
        <p className="font-medium">Aucune cible éligible actuellement.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Cette règle est configurée correctement, mais aucune cible CRM ne
          remplit les conditions aujourd&apos;hui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-2">
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Activity className="h-4 w-4" />
        Déclencheur évalué : <code className="text-xs">{result.trigger_type}</code>
      </p>
      {entries.map(([trigger, eligibility]) => (
        <div key={trigger} className="rounded-md border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              <code className="text-xs">{trigger}</code>
            </p>
            <Badge variant="secondary">
              {eligibility.count} cible{eligibility.count > 1 ? "s" : ""}
            </Badge>
          </div>
          {eligibility.sample.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Aucune cible éligible aujourd&apos;hui.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-1">
                Aperçu des {Math.min(5, eligibility.sample.length)} premières :
              </p>
              <ul className="text-sm space-y-1">
                {eligibility.sample.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
              {eligibility.count > eligibility.sample.length && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                  + {eligibility.count - eligibility.sample.length} autre
                  {eligibility.count - eligibility.sample.length > 1 ? "s" : ""}
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

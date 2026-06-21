"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Download, Send, PenLine, ChevronDown, ChevronUp } from "lucide-react";

export interface BulkDocRow {
  docType: string;
  label: string;
  count: number;
  canDownload: boolean;
  canSend: boolean;
  signable: boolean;
}

export interface BulkDocGroup {
  ownerType: "learner" | "company" | "trainer";
  ownerLabel: string;
  rows: BulkDocRow[];
}

interface Props {
  groups: BulkDocGroup[];
  savingKey: string | null;
  massSending: string | null;
  massDownloading: string | null;
  massRequestingSig: string | null;
  onConfirmAll: (docType: string, ownerType: "learner" | "company" | "trainer") => void;
  onDownloadAll: (ownerType: "learner" | "company" | "trainer", docType: string) => void;
  onSendAll: (ownerType: "learner" | "company" | "trainer", docType: string) => void;
  onRequestSignature: (docType: string) => void;
}

export function BulkDocActionsPanel({
  groups, savingKey, massSending, massDownloading, massRequestingSig,
  onConfirmAll, onDownloadAll, onSendAll, onRequestSignature,
}: Props) {
  const [open, setOpen] = useState(true);
  const visibleGroups = groups.filter((g) => g.rows.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b text-left"
      >
        <span className="text-sm font-medium">Actions en masse</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y">
          {visibleGroups.map((group) => (
            <div key={group.ownerType} className="px-4 py-2 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.ownerLabel}</p>
              {group.rows.map((row) => {
                const key = `${group.ownerType}-${row.docType}`;
                const isConfirming = savingKey === `mass-confirm-${row.docType}`;
                const isSending = massSending === key;
                const isDownloading = massDownloading === key;
                const isSigning = massRequestingSig === row.docType;
                return (
                  <div key={row.docType} className="flex items-center justify-between py-1 gap-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {row.label} <span className="text-gray-400">({row.count})</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button
                        size="sm" variant="outline" className="h-6 text-xs gap-1"
                        onClick={() => onConfirmAll(row.docType, group.ownerType)}
                        disabled={isConfirming}
                        title={`Figer tous les ${row.label.toLowerCase()}`}
                      >
                        {isConfirming && <Loader2 className="h-3 w-3 animate-spin" />}
                        <CheckCircle className="h-3 w-3" /> Tout figer
                      </Button>
                      {row.canDownload && (
                        <Button
                          size="sm" variant="ghost" className="h-6 text-xs gap-1"
                          onClick={() => onDownloadAll(group.ownerType, row.docType)}
                          disabled={massDownloading !== null}
                          title={`ZIP de tous les ${row.label.toLowerCase()}`}
                        >
                          {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          Télécharger ({row.count})
                        </Button>
                      )}
                      {row.canSend && (
                        <Button
                          size="sm" variant="outline" className="h-6 text-xs gap-1"
                          onClick={() => onSendAll(group.ownerType, row.docType)}
                          disabled={massSending !== null}
                        >
                          {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Envoyer tout
                        </Button>
                      )}
                      {row.signable && (
                        <Button
                          size="sm" variant="outline"
                          className="h-6 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={() => onRequestSignature(row.docType)}
                          disabled={massRequestingSig !== null}
                          title="Crée un magic link de signature (valide 30 jours)"
                        >
                          {isSigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
                          Demander signature
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SlotTokensResponse {
  slots: {
    slot: { id: string; title: string | null; start_time: string; end_time: string; slot_order: number };
    learner_tokens: { token: string; person: { id: string; first_name: string; last_name: string; email: string | null } }[];
    trainer_tokens: { token: string; person: { id: string; first_name: string; last_name: string; email: string | null } }[];
  }[];
  total_tokens: number;
  debug?: {
    session_id: string;
    slots_count: number;
    enrollments_count: number;
    enrollment_statuses: string[];
    enrollments_with_learner: number;
    trainers_count: number;
    trainers_with_data: number;
    enrollments_error: string | null;
    profile_entity_id: string;
    insert_errors: { type: string; phase?: string; code: string | undefined; message: string; details?: string; hint?: string }[];
    first_iteration_trace: { existing_data: boolean; existing_error: string | null; insert_data: boolean; insert_error: string | null } | null;
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface QrCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrSlotTokens: SlotTokensResponse | null;
  qrImages: Record<string, string>;
  exportingPdf: boolean;
  onExportPdf: () => void;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function QrCodesDialog({
  open,
  onOpenChange,
  qrSlotTokens,
  qrImages,
  exportingPdf,
  onExportPdf,
}: QrCodesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            QR Codes générés
            {qrSlotTokens && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                — {qrSlotTokens.slots.reduce((sum, s) => sum + (s.learner_tokens?.length ?? 0) + (s.trainer_tokens?.length ?? 0), 0)} QR
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {qrSlotTokens && (
          <div className="space-y-6">
            {/* Empty state global : aucun apprenant inscrit */}
            {qrSlotTokens.slots.every((s) => (s.learner_tokens?.length ?? 0) === 0 && (s.trainer_tokens?.length ?? 0) === 0) && (
              <div className="text-left py-6 px-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <p className="text-sm text-amber-900 font-medium">Aucun apprenant ni formateur inscrit dans cette session.</p>
                {process.env.NODE_ENV !== "production" && qrSlotTokens.debug && (
                  <div className="text-xs font-mono bg-white/70 border border-amber-200 rounded p-2 text-amber-900 space-y-0.5">
                    <div>session_id : <span className="font-semibold">{qrSlotTokens.debug.session_id}</span></div>
                    <div>profile.entity_id : <span className="font-semibold">{qrSlotTokens.debug.profile_entity_id}</span></div>
                    <div>slots trouvés : <span className="font-semibold">{qrSlotTokens.debug.slots_count}</span></div>
                    <div>enrollments trouvés : <span className="font-semibold">{qrSlotTokens.debug.enrollments_count}</span> (statuts : {qrSlotTokens.debug.enrollment_statuses.join(", ") || "aucun"})</div>
                    <div>enrollments avec learner lié : <span className="font-semibold">{qrSlotTokens.debug.enrollments_with_learner}</span></div>
                    <div>formation_trainers trouvés : <span className="font-semibold">{qrSlotTokens.debug.trainers_count}</span> (avec data : {qrSlotTokens.debug.trainers_with_data})</div>
                    {qrSlotTokens.debug.enrollments_error && (
                      <div className="text-red-700">erreur SQL enrollments : {qrSlotTokens.debug.enrollments_error}</div>
                    )}
                    {qrSlotTokens.debug.first_iteration_trace && (
                      <div className="mt-2 pt-2 border-t border-amber-300 text-amber-900">
                        <div className="font-semibold mb-1">1ère itération (slot 1 × learner 1) :</div>
                        <div className="ml-2">existing trouvé : <span className="font-semibold">{qrSlotTokens.debug.first_iteration_trace.existing_data ? "oui" : "non"}</span></div>
                        {qrSlotTokens.debug.first_iteration_trace.existing_error && <div className="ml-2 text-red-700">existing error : {qrSlotTokens.debug.first_iteration_trace.existing_error}</div>}
                        <div className="ml-2">INSERT data retourné : <span className="font-semibold">{qrSlotTokens.debug.first_iteration_trace.insert_data ? "oui" : "non"}</span></div>
                        {qrSlotTokens.debug.first_iteration_trace.insert_error && <div className="ml-2 text-red-700">INSERT error : {qrSlotTokens.debug.first_iteration_trace.insert_error}</div>}
                      </div>
                    )}
                    {qrSlotTokens.debug.insert_errors.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-300">
                        <div className="font-semibold text-red-700 mb-1">Erreurs INSERT signing_tokens ({qrSlotTokens.debug.insert_errors.length}) :</div>
                        {qrSlotTokens.debug.insert_errors.map((err, i) => (
                          <div key={i} className="text-red-700 ml-2 mt-1">
                            <div>· [{err.type}] phase={err.phase ?? "?"} code={err.code ?? "?"} — {err.message}</div>
                            {err.details && <div className="ml-3 text-red-600">details : {err.details}</div>}
                            {err.hint && <div className="ml-3 text-red-600">hint : {err.hint}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-amber-700">
                  Si <code>enrollments_count = 0</code> mais que vous voyez l&apos;apprenant en bas de la page, c&apos;est un problème de session_id ou de RLS service_role. Si <code>enrollments_with_learner</code> est inférieur à <code>enrollments_count</code>, la jointure FK <code>learners</code> est cassée.
                </p>
              </div>
            )}

            {qrSlotTokens.slots.map(slotData => {
              const hasLearners = (slotData.learner_tokens?.length ?? 0) > 0;
              const hasTrainers = (slotData.trainer_tokens?.length ?? 0) > 0;
              if (!hasLearners && !hasTrainers) return null;
              return (
                <div key={slotData.slot.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {new Date(slotData.slot.start_time).toLocaleDateString("fr-FR")}{" "}
                      {formatTime(slotData.slot.start_time)} - {formatTime(slotData.slot.end_time)}
                    </Badge>
                  </div>

                  {hasTrainers && (
                    <>
                      <p className="text-xs font-semibold text-purple-700">Formateurs</p>
                      <div className="grid grid-cols-3 gap-2">
                        {slotData.trainer_tokens.map(t => {
                          if (!t.person) {
                            console.warn("[QR modal] trainer token sans person:", t);
                            return (
                              <div key={t.token} className="text-center p-2 border border-red-200 rounded-lg bg-red-50">
                                <p className="text-xs text-red-700">Formateur introuvable</p>
                                <p className="text-[10px] text-red-500 break-all">{t.token.slice(0, 8)}…</p>
                              </div>
                            );
                          }
                          return (
                            <div key={t.token} className="text-center p-2 border rounded-lg bg-purple-50/50">
                              <p className="text-xs font-medium mb-1 truncate">
                                {t.person.last_name} {t.person.first_name}
                              </p>
                              {qrImages[t.token] ? (
                                <img src={qrImages[t.token]} alt={`QR ${t.person.last_name}`} className="w-32 h-32 mx-auto" />
                              ) : (
                                <div className="w-32 h-32 mx-auto bg-gray-100 animate-pulse rounded flex items-center justify-center">
                                  <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {hasLearners && (
                    <>
                      <p className="text-xs font-semibold text-blue-700">Apprenants</p>
                      <div className="grid grid-cols-3 gap-2">
                        {slotData.learner_tokens.map(t => {
                          if (!t.person) {
                            console.warn("[QR modal] learner token sans person:", t);
                            return (
                              <div key={t.token} className="text-center p-2 border border-red-200 rounded-lg bg-red-50">
                                <p className="text-xs text-red-700">Apprenant introuvable</p>
                                <p className="text-[10px] text-red-500 break-all">{t.token.slice(0, 8)}…</p>
                              </div>
                            );
                          }
                          return (
                            <div key={t.token} className="text-center p-2 border rounded-lg">
                              <p className="text-xs font-medium mb-1 truncate">
                                {t.person.last_name} {t.person.first_name}
                              </p>
                              {qrImages[t.token] ? (
                                <img src={qrImages[t.token]} alt={`QR ${t.person.last_name}`} className="w-32 h-32 mx-auto" />
                              ) : (
                                <div className="w-32 h-32 mx-auto bg-gray-100 animate-pulse rounded flex items-center justify-center">
                                  <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onExportPdf} disabled={exportingPdf}>
            {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Exporter en PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

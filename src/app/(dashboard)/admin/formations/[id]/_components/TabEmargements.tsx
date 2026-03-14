"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  QrCode, Send, Printer, CheckSquare, Loader2, Video, ExternalLink, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { Session, FormationTimeSlot, Signature } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabEmargements({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [generatingToken, setGeneratingToken] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tokenDialog, setTokenDialog] = useState(false);

  const timeSlots = formation.formation_time_slots || [];
  const signatures = formation.signatures || [];
  const enrollments = formation.enrollments || [];
  const trainers = formation.formation_trainers || [];

  const getSignaturesForSlot = (slot: FormationTimeSlot) => {
    // Signatures linked to this specific time slot
    const slotSigs = signatures.filter((s) => s.time_slot_id === slot.id);
    if (slotSigs.length > 0) return slotSigs;
    // Fallback: signatures without time_slot_id, matched by date
    const slotDate = new Date(slot.start_time).toDateString();
    return signatures.filter(
      (s) => !s.time_slot_id && new Date(s.signed_at).toDateString() === slotDate
    );
  };

  const handleGenerateSessionToken = async () => {
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/emargement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: formation.id, type: "session" }),
      });
      const data = await res.json();
      if (data.tokens?.[0]) {
        const token = data.tokens[0].token;
        setSessionToken(token);
        setTokenDialog(true);
      } else {
        toast({ title: "Erreur", description: data.error || "Impossible de générer le lien", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleGenerateIndividualTokens = async () => {
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/emargement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: formation.id, type: "individual" }),
      });
      const data = await res.json();
      if (data.tokens?.length > 0) {
        toast({ title: `${data.tokens.length} lien(s) individuel(s) généré(s)` });
      } else {
        toast({ title: "Aucun apprenant inscrit", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setGeneratingToken(false);
    }
  };

  const emargementUrl = sessionToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/emargement/${sessionToken}`
    : "";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(emargementUrl);
    toast({ title: "Lien copié !" });
  };

  const handlePrintEmpty = () => {
    const rows = timeSlots
      .map((slot, i) => {
        const start = new Date(slot.start_time);
        const end = new Date(slot.end_time);
        const learnerRows = enrollments
          .map((e) => {
            const l = e.learner;
            if (!l) return "";
            return `<tr><td style="padding:8px;border:1px solid #ddd;">${l.first_name} ${l.last_name}</td><td style="padding:8px;border:1px solid #ddd;width:200px;"></td></tr>`;
          })
          .join("");
        const trainerRows = trainers
          .map((t) => {
            const tr = t.trainer;
            if (!tr) return "";
            return `<tr><td style="padding:8px;border:1px solid #ddd;">${tr.first_name} ${tr.last_name} (Formateur)</td><td style="padding:8px;border:1px solid #ddd;width:200px;"></td></tr>`;
          })
          .join("");
        return `
          <h3>Créneau ${i + 1} — ${start.toLocaleDateString("fr-FR")} ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">Nom</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Signature</th></tr></thead>
            <tbody>${trainerRows}${learnerRows}</tbody>
          </table>`;
      })
      .join("");
    const html = `<html><head><title>Feuille d'émargement — ${formation.title}</title></head><body style="font-family:sans-serif;padding:24px;"><h1>Feuille d'émargement</h1><h2>${formation.title}</h2>${rows}</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions globales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions d&apos;émargement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleGenerateSessionToken} disabled={generatingToken}>
              {generatingToken ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              Générer le lien d&apos;émargement
            </Button>
            <Button variant="outline" onClick={handleGenerateIndividualTokens} disabled={generatingToken}>
              <Send className="h-4 w-4 mr-2" /> Envoyer liens individuels
            </Button>
            <Button variant="outline" onClick={handlePrintEmpty}>
              <Printer className="h-4 w-4 mr-2" /> Imprimer feuille vide
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Par créneau */}
      {timeSlots.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucun créneau planifié. Créez des créneaux dans l&apos;onglet Planning.
          </CardContent>
        </Card>
      ) : (
        timeSlots.map((slot, index) => {
          const slotSignatures = getSignaturesForSlot(slot);
          const start = new Date(slot.start_time);
          const end = new Date(slot.end_time);
          const durationMs = end.getTime() - start.getTime();
          const durationH = Math.floor(durationMs / (1000 * 60 * 60));
          const durationM = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          const durationStr = durationH > 0
            ? `${durationH}h${durationM > 0 ? durationM.toString().padStart(2, "0") : ""}`
            : `${durationM}min`;

          return (
            <Card key={slot.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Session {index + 1} : {slot.title || formation.title}
                  </CardTitle>
                  <Badge variant="outline">{durationStr}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {start.toLocaleDateString("fr-FR")} {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  {" - "}
                  {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Formateurs */}
                {trainers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Émargements Formateurs</h4>
                    <div className="space-y-2">
                      {trainers.map((ft) => {
                        const trainer = ft.trainer;
                        if (!trainer) return null;
                        const sig = slotSignatures.find(
                          (s) => s.signer_id === trainer.id && s.signer_type === "trainer"
                        );
                        return (
                          <div
                            key={ft.id}
                            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                          >
                            <span className="text-sm font-medium">
                              {trainer.first_name} {trainer.last_name}
                            </span>
                            {sig ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                <CheckSquare className="h-3 w-3 mr-1" /> Signé
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                En attente
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Apprenants */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Émargements Apprenants ({enrollments.length})
                  </h4>
                  {enrollments.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Aucun apprenant inscrit</p>
                  ) : (
                    <div className="space-y-2">
                      {enrollments.map((enrollment) => {
                        const learner = enrollment.learner;
                        if (!learner) return null;
                        const sig = slotSignatures.find(
                          (s) => s.signer_id === learner.id && s.signer_type === "learner"
                        );
                        return (
                          <div
                            key={enrollment.id}
                            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                          >
                            <span className="text-sm font-medium">
                              {learner.first_name} {learner.last_name}
                            </span>
                            {sig ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                <CheckSquare className="h-3 w-3 mr-1" /> Signé
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                En attente
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Compteur */}
                <div className="flex items-center gap-4 pt-2 border-t text-sm text-muted-foreground">
                  <span>
                    Formateurs : {slotSignatures.filter((s) => s.signer_type === "trainer").length}/{trainers.length}
                  </span>
                  <span>
                    Apprenants : {slotSignatures.filter((s) => s.signer_type === "learner").length}/{enrollments.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Dialog lien émargement */}
      <Dialog open={tokenDialog} onOpenChange={setTokenDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lien d&apos;émargement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Partagez ce lien avec les participants pour qu&apos;ils puissent signer leur émargement.
              Le lien expire dans 24h.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-3 rounded-lg break-all">
                {emargementUrl}
              </code>
              <Button size="icon" variant="outline" onClick={handleCopyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(emargementUrl, "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Ouvrir dans un nouvel onglet
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialog(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

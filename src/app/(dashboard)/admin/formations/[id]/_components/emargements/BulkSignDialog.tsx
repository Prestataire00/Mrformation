"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signatures/SignaturePad";

export interface BulkSignDialogState {
  open: boolean;
  step: "confirm" | "sign";
  slotId: string;
  unsignedLearners: { id: string; name: string }[];
  unsignedTrainers: { id: string; name: string }[];
  adminSignature: string | null;
}

export const initialBulkSignState: BulkSignDialogState = {
  open: false,
  step: "confirm",
  slotId: "",
  unsignedLearners: [],
  unsignedTrainers: [],
  adminSignature: null,
};

interface BulkSignDialogProps {
  bulkSignSlot: BulkSignDialogState;
  setBulkSignSlot: (
    state:
      | BulkSignDialogState
      | ((prev: BulkSignDialogState) => BulkSignDialogState),
  ) => void;
  bulkSigning: boolean;
  onBulkSign: () => Promise<void>;
}

export function BulkSignDialog({
  bulkSignSlot,
  setBulkSignSlot,
  bulkSigning,
  onBulkSign,
}: BulkSignDialogProps) {
  return (
    <Dialog
      open={bulkSignSlot.open}
      onOpenChange={(open) => {
        if (!open) {
          // Reset au close pour éviter la fuite d'état entre 2 ouvertures
          setBulkSignSlot(initialBulkSignState);
        } else {
          setBulkSignSlot((prev) => ({ ...prev, open: true }));
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {bulkSignSlot.step === "confirm"
              ? "Cocher les présences en masse"
              : "Votre signature (appliquée à tous)"}
          </DialogTitle>
        </DialogHeader>

        {bulkSignSlot.step === "confirm" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Marquer {bulkSignSlot.unsignedLearners.length} apprenant
              {bulkSignSlot.unsignedLearners.length !== 1 ? "s" : ""} et{" "}
              {bulkSignSlot.unsignedTrainers.length} formateur
              {bulkSignSlot.unsignedTrainers.length !== 1 ? "s" : ""} non encore
              signé
              {bulkSignSlot.unsignedLearners.length +
                bulkSignSlot.unsignedTrainers.length !==
              1
                ? "s"
                : ""}{" "}
              comme présent
              {bulkSignSlot.unsignedLearners.length +
                bulkSignSlot.unsignedTrainers.length !==
              1
                ? "s"
                : ""}{" "}
              sur ce créneau ?
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBulkSignSlot(initialBulkSignState)}
              >
                Annuler
              </Button>
              <Button
                onClick={() =>
                  setBulkSignSlot((prev) => ({ ...prev, step: "sign" }))
                }
              >
                Suivant →
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              Dessinez votre signature. Elle sera enregistrée pour les{" "}
              {bulkSignSlot.unsignedLearners.length +
                bulkSignSlot.unsignedTrainers.length}{" "}
              personnes sélectionnées.
            </p>
            <SignaturePad
              label="Signature de l'administrateur"
              isSigned={!!bulkSignSlot.adminSignature}
              onSign={(svgData) =>
                setBulkSignSlot((prev) => ({ ...prev, adminSignature: svgData }))
              }
              onClear={() =>
                setBulkSignSlot((prev) => ({ ...prev, adminSignature: null }))
              }
              disabled={bulkSigning}
            />
            {bulkSigning && (
              <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  setBulkSignSlot((prev) => ({
                    ...prev,
                    step: "confirm",
                    adminSignature: null,
                  }))
                }
                disabled={bulkSigning}
              >
                ← Retour
              </Button>
              <Button
                onClick={onBulkSign}
                disabled={bulkSigning || !bulkSignSlot.adminSignature}
              >
                {bulkSigning && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Confirmer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

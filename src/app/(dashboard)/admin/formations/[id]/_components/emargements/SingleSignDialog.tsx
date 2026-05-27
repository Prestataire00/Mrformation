"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import type { FormationTimeSlot } from "@/lib/types";

export interface SignDialogState {
  open: boolean;
  slotId: string;
  signerId: string;
  signerType: "learner" | "trainer";
  signerName: string;
}

interface SingleSignDialogProps {
  signDialog: SignDialogState;
  setSignDialog: (state: SignDialogState | ((prev: SignDialogState) => SignDialogState)) => void;
  timeSlots: FormationTimeSlot[];
  signing: boolean;
  onAdminSign: (svgData: string) => Promise<void>;
  formatSlotLabel: (slot: FormationTimeSlot) => string;
}

export function SingleSignDialog({
  signDialog,
  setSignDialog,
  timeSlots,
  signing,
  onAdminSign,
  formatSlotLabel,
}: SingleSignDialogProps) {
  return (
    <Dialog open={signDialog.open} onOpenChange={(open) => setSignDialog((prev) => ({ ...prev, open }))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Signer pour {signDialog.signerName}
            {(() => {
              const slot = timeSlots.find(s => s.id === signDialog.slotId);
              return slot ? (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  Créneau : {formatSlotLabel(slot)}
                </span>
              ) : null;
            })()}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-2">
          Dessinez la signature pour valider la présence de {signDialog.signerName}.
        </p>
        <SignaturePad
          label={`Signature pour ${signDialog.signerName}`}
          isSigned={false}
          onSign={onAdminSign}
          onClear={() => { /* no-op : le dialog se ferme après onSign */ }}
          disabled={signing}
        />
        {signing && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setSignDialog((prev) => ({ ...prev, open: false }))}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

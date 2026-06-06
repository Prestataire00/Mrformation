"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface BatchOpsConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  itemsCount: number;
  itemsLabel: string;
  failureMode: "atomic" | "partial";
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function BatchOpsConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemsCount,
  itemsLabel,
  failureMode,
  onConfirm,
  isLoading,
}: BatchOpsConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const loading = isLoading || confirming;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || (
              <>
                Cette action va affecter <strong>{itemsCount} {itemsLabel}</strong>.
                {failureMode === "partial"
                  ? " En cas d'erreur, les éléments déjà traités ne seront pas annulés."
                  : " L'opération est atomique : tout passe ou rien."}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmer ({itemsCount} {itemsLabel})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

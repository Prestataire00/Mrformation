"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface DialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "default" | "destructive";
}

/**
 * Hook réutilisable pour remplacer window.confirm() par un Dialog shadcn.
 *
 * Usage :
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *
 *   async function handleDelete() {
 *     const ok = await confirm({
 *       title: "Supprimer ?",
 *       description: "Cette action est irréversible.",
 *     });
 *     if (!ok) return;
 *     // ... delete logic
 *   }
 *
 *   // En fin de JSX :
 *   <ConfirmDialog />
 */
export function useConfirmDialog() {
  const [state, setState] = useState<DialogState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirmer",
    variant: "destructive",
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (opts: {
      title: string;
      description?: string;
      confirmLabel?: string;
      variant?: "default" | "destructive";
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setState({
          open: true,
          title: opts.title,
          description: opts.description || "",
          confirmLabel: opts.confirmLabel || "Confirmer",
          variant: opts.variant || "destructive",
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  function ConfirmDialog() {
    return (
      <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state.title}</DialogTitle>
            {state.description && (
              <DialogDescription>{state.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Annuler
            </Button>
            <Button
              variant={state.variant === "destructive" ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              {state.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return { confirm, ConfirmDialog };
}

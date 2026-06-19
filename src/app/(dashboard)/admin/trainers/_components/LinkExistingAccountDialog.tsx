"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface OrphanAccount {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface LinkExistingAccountDialogProps {
  trainerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

export default function LinkExistingAccountDialog({
  trainerId,
  open,
  onOpenChange,
  onLinked,
}: LinkExistingAccountDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<OrphanAccount[]>([]);
  const [search, setSearch] = useState("");

  const loadCandidates = useCallback(async () => {
    setCandidates([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/trainers/${trainerId}/access/candidates`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setCandidates(data.candidates ?? []);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [trainerId, toast]);

  useEffect(() => {
    if (open) {
      setSearch("");
      loadCandidates();
    }
  }, [open, loadCandidates]);

  const filtered = candidates.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.email ?? "").toLowerCase().includes(q) ||
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(q)
    );
  });

  const handleLink = async (profileId: string) => {
    setLinkingId(profileId);
    try {
      const res = await fetch(`/api/trainers/${trainerId}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la liaison");
      toast({ title: "Compte relié", description: "La fiche est désormais reliée au compte sélectionné." });
      onOpenChange(false);
      onLinked();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Relier à un compte existant</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par email ou nom"
              className="pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                <p className="text-sm">Chargement…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Aucun compte formateur non relié disponible.
              </div>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-2" disabled={linkingId !== null} onClick={() => handleLink(c.id)}>
                    {linkingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Relier
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

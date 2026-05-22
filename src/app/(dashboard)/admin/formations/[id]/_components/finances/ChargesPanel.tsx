import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronDown, Trash2, Plus, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeMargin, type Charge } from "@/lib/utils/finances-display";

interface Props {
  charges: Charge[];
  totalInvoiced: number;
  totalCharges: number;
  /** Insère une charge ; doit rejeter en cas d'échec — l'appelant est responsable d'afficher l'erreur (toast). */
  onAddCharge: (label: string, amount: number) => Promise<void>;
  onDeleteCharge: (id: string) => void;
}

/** Zone 5 du spec : charges + marge, repliables (repliées par défaut). */
export function ChargesPanel({
  charges,
  totalInvoiced,
  totalCharges,
  onAddCharge,
  onDeleteCharge,
}: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const margin = computeMargin({
    total_invoiced: totalInvoiced,
    total_charges: totalCharges,
  });

  const handleAdd = async () => {
    const parsed = parseFloat(amount);
    if (!label.trim() || isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      await onAddCharge(label.trim(), parsed);
      setLabel("");
      setAmount("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm"
      >
        <span className="flex items-center gap-2 font-medium text-gray-700">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Charges &amp; marge
        </span>
        <span className="text-muted-foreground">
          Marge {formatCurrency(margin)} · {charges.length} charge
          {charges.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {charges.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5">{c.label}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(c.amount)}</td>
                    <td className="py-1.5 text-right w-8">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500"
                        aria-label={`Supprimer la charge « ${c.label} »`}
                        onClick={() => onDeleteCharge(c.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Libellé de la charge…"
              className="h-8 text-sm flex-1 max-w-[220px]"
            />
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant"
              className="h-8 text-sm w-28"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleAdd}
              disabled={saving || !label.trim() || !amount}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Ajouter
            </Button>
          </div>

          <div className="flex justify-between text-sm border-t pt-2">
            <span className="text-muted-foreground">Marge (Facturé − Charges)</span>
            <span className={`font-bold ${margin >= 0 ? "text-green-700" : "text-red-600"}`}>
              {formatCurrency(margin)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

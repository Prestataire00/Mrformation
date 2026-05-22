import { formatCurrency } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { Stats } from "@/lib/utils/finances-display";

interface Props {
  stats: Stats;
  /** Objectif de facturation (`formation.total_price`), ou null si absent. */
  objectif: number | null;
}

/** Zone 1 du spec : 4 cartes d'indicateurs financiers. */
export function FinancesKpiBand({ stats, objectif }: Props) {
  const pct =
    objectif && objectif > 0
      ? Math.min(100, (stats.total_invoiced / objectif) * 100)
      : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">Facturé</p>
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.total_invoiced)}</p>
        {pct !== null && objectif !== null && (
          <div className="mt-2">
            <Progress
              value={pct}
              className="h-1.5"
              aria-label={`Facturé : ${Math.round(pct)} % de l'objectif`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              sur {formatCurrency(objectif)} objectif
            </p>
          </div>
        )}
      </div>
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">Encaissé</p>
        <p className="text-2xl font-bold text-green-700">{formatCurrency(stats.total_paid)}</p>
      </div>
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">En attente</p>
        <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.total_pending)}</p>
      </div>
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">En retard</p>
        <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.total_late)}</p>
      </div>
    </div>
  );
}

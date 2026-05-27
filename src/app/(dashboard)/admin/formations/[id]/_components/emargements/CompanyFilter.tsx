"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { FormationCompany } from "@/lib/types";

interface CompanyFilterProps {
  isInter: boolean;
  companies: FormationCompany[];
  filterClientId: string | null;
  onChange: (clientId: string | null) => void;
  enrollmentsCount: number;
  allEnrollmentsCount: number;
}

export function CompanyFilter({
  isInter,
  companies,
  filterClientId,
  onChange,
  enrollmentsCount,
  allEnrollmentsCount,
}: CompanyFilterProps) {
  if (!isInter || companies.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-blue-50">
      <span className="text-muted-foreground">Filtrer par entreprise :</span>
      <Select
        value={filterClientId ?? "all"}
        onValueChange={(v) => onChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[240px]">
          <SelectValue placeholder="Toutes les entreprises" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les entreprises</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.client_id} value={c.client_id}>
              {c.client?.company_name || `Client ${c.client_id.slice(0, 8)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {enrollmentsCount}/{allEnrollmentsCount} apprenant
        {allEnrollmentsCount !== 1 ? "s" : ""}
      </span>
      {filterClientId && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          × Effacer
        </Button>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Building2, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PappersCompany {
  company_name: string;
  siret: string;
  siren: string;
  legal_form: string;
  address: string;
  city: string;
  postal_code: string;
  capital: number | null;
  revenue: number | null;
  employees: string | null;
  naf_code: string | null;
  creation_date: string | null;
  is_demo?: boolean;
}

export interface CompanySearchResult {
  company_name: string;
  siret: string;
  siren: string;
  legal_form: string;
  address: string;
  city: string;
  postal_code: string;
  capital: number | null;
  naf_code: string | null;
}

export interface CompanySearchProps {
  /** Called when the user selects a company from the dropdown */
  onSelect: (company: CompanySearchResult) => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Additional className for the wrapper */
  className?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSiret(siret: string): string {
  // format: 000 000 000 00000
  const s = siret.replace(/\s/g, "");
  if (s.length === 14) {
    return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
  }
  return siret;
}

function formatCapital(capital: number | null): string {
  if (capital === null || capital === undefined) return "";
  return capital.toLocaleString("fr-FR") + " €";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompanySearch({
  onSelect,
  placeholder = "Rechercher une entreprise par nom ou SIRET…",
  className,
  disabled = false,
}: CompanySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PappersCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoWarningVisible, setDemoWarningVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pappers/search?q=${encodeURIComponent(q.trim())}`);
      const json = (await res.json()) as {
        data?: PappersCompany[];
        demo?: boolean;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(json.error ?? "Erreur lors de la recherche");
        setResults([]);
        setOpen(false);
        return;
      }

      const companies = json.data ?? [];
      setResults(companies);
      setDemoMode(json.demo ?? false);

      if (json.demo) {
        setDemoWarningVisible(true);
      }

      setOpen(companies.length > 0);
    } catch {
      setError("Impossible de contacter le service de recherche");
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setOpen(false);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setOpen(false);
    setError(null);
    inputRef.current?.focus();
  }

  function handleSelect(company: PappersCompany) {
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelect({
      company_name: company.company_name,
      siret: company.siret,
      siren: company.siren,
      legal_form: company.legal_form,
      address: company.address,
      city: company.city,
      postal_code: company.postal_code,
      capital: company.capital,
      naf_code: company.naf_code,
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      {/* Demo warning banner */}
      {demoWarningVisible && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <span className="flex-1">
            <strong>Mode démo</strong> — Configurez{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">PAPPERS_API_KEY</code> dans{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">.env.local</code> pour obtenir des données
            réelles.
          </span>
          <button
            type="button"
            onClick={() => setDemoWarningVisible(false)}
            className="ml-1 flex-shrink-0 text-amber-600 hover:text-amber-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <Search className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="pl-9 pr-20"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {/* Pappers badge */}
          <span className="hidden rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 sm:inline">
            Pappers
          </span>
          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {results.length} résultat{results.length > 1 ? "s" : ""}
            </span>
            {demoMode && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                Démo
              </span>
            )}
          </div>

          <ul className="max-h-64 overflow-y-auto">
            {results.map((company, index) => (
              <li key={company.siret || index}>
                <button
                  type="button"
                  onClick={() => handleSelect(company)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                >
                  {/* Icon */}
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                    <Building2 className="h-4 w-4" />
                  </div>

                  {/* Main info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {company.company_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {company.legal_form && (
                        <span className="mr-2">{company.legal_form}</span>
                      )}
                      {company.city && company.postal_code && (
                        <span>
                          {company.city} ({company.postal_code})
                        </span>
                      )}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      {company.siret && (
                        <span className="font-mono">
                          SIRET {formatSiret(company.siret)}
                        </span>
                      )}
                      {company.naf_code && (
                        <span>NAF {company.naf_code}</span>
                      )}
                      {company.capital && (
                        <span>Capital {formatCapital(company.capital)}</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow indicator */}
                  <span className="mt-1 flex-shrink-0 text-xs font-medium text-blue-500">
                    Sélectionner
                  </span>
                </button>
                {index < results.length - 1 && (
                  <div className="mx-3 border-t border-gray-50" />
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-400">
            Données fournies par{" "}
            <span className="font-semibold text-blue-500">Pappers.fr</span>
            {demoMode && " · Mode démonstration"}
          </div>
        </div>
      )}
    </div>
  );
}

export default CompanySearch;

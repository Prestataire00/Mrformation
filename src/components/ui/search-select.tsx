"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchSelectProps {
  options: SearchSelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  maxResults?: number;
  className?: string;
  disabled?: boolean;
}

/** Normalise pour recherche : lowercase, sans accents, sans ponctuation */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function SearchSelect({
  options,
  onSelect,
  placeholder = "Rechercher...",
  maxResults = 20,
  className,
  disabled,
}: SearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-normalize all options for search performance
  const indexed = useMemo(
    () => options.map(o => ({
      ...o,
      _norm: normalize(`${o.label || ""} ${o.sublabel || ""}`),
    })),
    [options]
  );

  const { filtered, totalMatching } = useMemo(() => {
    if (!query.trim()) {
      return { filtered: indexed.slice(0, maxResults), totalMatching: indexed.length };
    }
    const q = normalize(query);
    const matching = indexed.filter(o => o._norm.includes(q));
    return { filtered: matching.slice(0, maxResults), totalMatching: matching.length };
  }, [query, indexed, maxResults]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = useCallback((value: string) => {
    onSelect(value);
    setQuery("");
    setOpen(false);
  }, [onSelect]);

  const truncated = totalMatching > filtered.length;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-8 pr-8 h-8 text-sm"
          disabled={disabled}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto">
          {filtered.map((option) => (
            <button
              type="button"
              key={option.value}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              onClick={() => handleSelect(option.value)}
            >
              <span className="font-medium">{option.label || "(sans nom)"}</span>
              {option.sublabel && (
                <span className="text-xs text-muted-foreground ml-2">— {option.sublabel}</span>
              )}
            </button>
          ))}
          {truncated && (
            <div className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-t italic">
              {totalMatching - filtered.length} résultat(s) supplémentaire(s). Précisez votre recherche.
            </div>
          )}
        </div>
      )}

      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg">
          <p className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat pour &quot;{query}&quot;</p>
        </div>
      )}

      {open && !query.trim() && options.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg">
          <p className="px-3 py-2 text-sm text-muted-foreground">Aucune option disponible</p>
        </div>
      )}
    </div>
  );
}

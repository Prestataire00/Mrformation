"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Building2, UserSearch, Users, GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/useDebounce";
import {
  globalSearchEntities,
  GLOBAL_SEARCH_MIN_CHARS,
  type GlobalSearchResults,
} from "@/lib/services/global-search";

interface Props {
  /** Entité active : la recherche est filtrée dessus. Null → pas de recherche. */
  entityId: string | null;
}

const EMPTY: GlobalSearchResults = { clients: [], prospects: [], learners: [], sessions: [] };

export function GlobalSearch({ entityId }: Props) {
  const router = useRouter();
  // Référence stable : évite de relancer l'effet à chaque render.
  const [supabase] = useState(() => createClient());

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY);

  const debounced = useDebounce(value, 300);
  // Garde anti-"stale request" : on ignore les réponses dépassées (search-as-you-type).
  const reqId = useRef(0);

  useEffect(() => {
    const q = debounced.trim();
    if (!entityId || q.length < GLOBAL_SEARCH_MIN_CHARS) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    const myReq = ++reqId.current;
    setLoading(true);
    globalSearchEntities(supabase, entityId, q)
      .then((res) => {
        if (myReq !== reqId.current) return;
        setResults(
          res.ok
            ? { clients: res.clients, prospects: res.prospects, learners: res.learners, sessions: res.sessions }
            : EMPTY,
        );
      })
      .catch(() => {
        if (myReq === reqId.current) setResults(EMPTY);
      })
      .finally(() => {
        if (myReq === reqId.current) setLoading(false);
      });
  }, [debounced, entityId, supabase]);

  function go(href: string) {
    setOpen(false);
    setValue("");
    setResults(EMPTY);
    router.push(href);
  }

  const q = debounced.trim();
  const hasResults =
    results.clients.length > 0 ||
    results.prospects.length > 0 ||
    results.learners.length > 0 ||
    results.sessions.length > 0;
  const showEmpty = !loading && q.length >= GLOBAL_SEARCH_MIN_CHARS && !hasResults;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // À la fermeture, on repart propre : pas de résultats périmés au ré-ouverture
        // ni après un changement d'entité.
        if (!o) {
          setValue("");
          setResults(EMPTY);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Recherche globale"
          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 transition-colors rounded-lg text-sm text-white/80 w-52 focus:outline-none"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs truncate text-left flex-1">
            {value || "Rechercher…"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={value}
            onValueChange={setValue}
            placeholder="Entreprise, prospect, apprenant, formation…"
            aria-label="Rechercher une entreprise, un prospect, un apprenant ou une formation"
          />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche…
              </div>
            )}
            {q.length > 0 && q.length < GLOBAL_SEARCH_MIN_CHARS && !loading && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                Tapez au moins {GLOBAL_SEARCH_MIN_CHARS} caractères.
              </div>
            )}
            {showEmpty && <CommandEmpty>Aucun résultat</CommandEmpty>}

            {results.clients.length > 0 && (
              <CommandGroup heading="Entreprises">
                {results.clients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`client-${c.id}`}
                    onSelect={() => go(`/admin/clients/${c.id}`)}
                    className="cursor-pointer"
                  >
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.company_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.learners.length > 0 && (
              <CommandGroup heading="Apprenants">
                {results.learners.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`learner-${l.id}`}
                    onSelect={() => go(`/admin/clients/apprenants/${l.id}`)}
                    className="cursor-pointer"
                  >
                    <Users className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{l.first_name} {l.last_name}</span>
                      {l.email && (
                        <span className="text-[11px] text-muted-foreground truncate">{l.email}</span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.sessions.length > 0 && (
              <CommandGroup heading="Formations">
                {results.sessions.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`session-${s.id}`}
                    onSelect={() => go(`/admin/formations/${s.id}`)}
                    className="cursor-pointer"
                  >
                    <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.prospects.length > 0 && (
              <CommandGroup heading="Prospects">
                {results.prospects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`prospect-${p.id}`}
                    onSelect={() => go(`/admin/crm/prospects/${p.id}`)}
                    className="cursor-pointer"
                  >
                    <UserSearch className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{p.company_name}</span>
                      {p.contact_name && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {p.contact_name}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

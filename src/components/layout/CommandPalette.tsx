"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import {
  GraduationCap, Building2, Users, UserCheck, Receipt,
  LayoutDashboard, Plus,
} from "lucide-react";

interface SearchResults {
  sessions: Array<{ id: string; title: string; status: string }>;
  clients: Array<{ id: string; company_name: string }>;
  learners: Array<{ id: string; first_name: string; last_name: string; email: string | null }>;
  trainers: Array<{ id: string; first_name: string; last_name: string }>;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ sessions: [], clients: [], learners: [], trainers: [] });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ sessions: [], clients: [], learners: [], trainers: [] });
      return;
    }
    const timer = setTimeout(async () => {
      const q = `%${query}%`;
      const [s, c, l, t] = await Promise.all([
        supabase.from("sessions").select("id, title, status").ilike("title", q).limit(5),
        supabase.from("clients").select("id, company_name").ilike("company_name", q).limit(5),
        supabase.from("learners").select("id, first_name, last_name, email").or(`first_name.ilike.${q},last_name.ilike.${q}`).limit(5),
        supabase.from("trainers").select("id, first_name, last_name").or(`first_name.ilike.${q},last_name.ilike.${q}`).limit(5),
      ]);
      setResults({
        sessions: s.data || [],
        clients: c.data || [],
        learners: l.data || [],
        trainers: t.data || [],
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, supabase]);

  const go = useCallback((path: string) => {
    setOpen(false);
    setQuery("");
    router.push(path);
  }, [router]);

  const hasResults = results.sessions.length + results.clients.length + results.learners.length + results.trainers.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Rechercher formations, clients, apprenants..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{query.length < 2 ? "Tapez au moins 2 caractères" : "Aucun résultat"}</CommandEmpty>

        <CommandGroup heading="Actions rapides">
          <CommandItem onSelect={() => go("/admin")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Tableau de bord
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/trainings")}>
            <GraduationCap className="mr-2 h-4 w-4" /> Formations
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/clients")}>
            <Building2 className="mr-2 h-4 w-4" /> Entreprises
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/reports/factures")}>
            <Receipt className="mr-2 h-4 w-4" /> Factures
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/crm")}>
            <Plus className="mr-2 h-4 w-4" /> Pipeline CRM
          </CommandItem>
        </CommandGroup>

        {results.sessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Formations">
              {results.sessions.map(s => (
                <CommandItem key={s.id} onSelect={() => go(`/admin/formations/${s.id}`)}>
                  <GraduationCap className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{s.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Entreprises">
              {results.clients.map(c => (
                <CommandItem key={c.id} onSelect={() => go(`/admin/clients/${c.id}`)}>
                  <Building2 className="mr-2 h-4 w-4" /> {c.company_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.learners.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Apprenants">
              {results.learners.map(l => (
                <CommandItem key={l.id} onSelect={() => go(`/admin/clients/apprenants/${l.id}`)}>
                  <Users className="mr-2 h-4 w-4" />
                  <span className="flex-1">{l.first_name} {l.last_name}</span>
                  {l.email && <span className="ml-2 text-xs text-muted-foreground">{l.email}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.trainers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Formateurs">
              {results.trainers.map(t => (
                <CommandItem key={t.id} onSelect={() => go(`/admin/trainers/${t.id}`)}>
                  <UserCheck className="mr-2 h-4 w-4" /> {t.first_name} {t.last_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

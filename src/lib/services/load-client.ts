/**
 * Helper pour charger un client avec ses contacts.
 *
 * BUG CONTOURNÉ : `supabase.from("clients").select("*, contacts(*)")` échoue
 * avec PGRST201 quand il existe 2+ FK entre `clients` et `contacts` en base
 * (cas réel constaté en prod 2026-05-17). PostgREST ne sait pas laquelle
 * utiliser pour le join → query échoue → caller reçoit null silencieusement.
 *
 * Solution : faire 2 queries séparées et merger côté app. Plus robuste,
 * marche quel que soit le nb de FK déclarées.
 *
 * À utiliser PARTOUT au lieu de `select("*, contacts(*)")` direct.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, Contact } from "@/lib/types";

/**
 * Charge 1 client avec ses contacts.
 * Retourne `null` si le client n'existe pas (ou RLS bloque).
 */
export async function loadClientWithContacts(
  supabase: SupabaseClient,
  clientId: string,
): Promise<Client | null> {
  const [{ data: clientRow, error: clientErr }, { data: contactsData }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("contacts").select("*").eq("client_id", clientId),
  ]);
  if (clientErr || !clientRow) return null;
  return { ...clientRow, contacts: (contactsData ?? []) as Contact[] } as Client;
}

/**
 * Charge N clients avec leurs contacts (batch). Retourne Map<clientId, Client>.
 * Optimisé : 2 queries (vs 2N).
 */
export async function loadClientsWithContacts(
  supabase: SupabaseClient,
  clientIds: string[],
): Promise<Map<string, Client>> {
  const result = new Map<string, Client>();
  if (clientIds.length === 0) return result;

  const [{ data: clients }, { data: contacts }] = await Promise.all([
    supabase.from("clients").select("*").in("id", clientIds),
    supabase.from("contacts").select("*").in("client_id", clientIds),
  ]);

  const contactsByClient = new Map<string, Contact[]>();
  for (const c of (contacts ?? []) as Contact[]) {
    const list = contactsByClient.get(c.client_id) ?? [];
    list.push(c);
    contactsByClient.set(c.client_id, list);
  }

  for (const cli of (clients ?? []) as Client[]) {
    result.set(cli.id, { ...cli, contacts: contactsByClient.get(cli.id) ?? [] });
  }

  return result;
}

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------- Types ----------

export type PaginationFilters = {
  /** Requis — filtre multi-tenant RLS defense-in-depth */
  entityId: string;
  /** Recherche ilike sur searchColumn (default: "title") */
  search?: string;
  /** Colonne cible pour la recherche ilike (default: "title") */
  searchColumn?: string;
  /** Filtre enum — valeurs autorisées pour la colonne statusColumn */
  statusIn?: string[];
  /** Colonne cible pour le filtre enum (default: "status") */
  statusColumn?: string;
  /** Date ISO min (>=) sur dateColumn */
  dateFrom?: string;
  /** Date ISO max (<=) sur dateColumn */
  dateTo?: string;
  /** Colonne cible pour le filtre date (default: "created_at") */
  dateColumn?: string;
};

export type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
  hasMore: boolean;
};

// ---------- Helper ----------

/**
 * Requête paginée générique côté serveur sur Supabase.
 *
 * Applique systématiquement le filtre `entity_id` (multi-tenant),
 * supporte recherche ilike, filtre enum (`.in()`), et plage de dates.
 *
 * @example
 * ```ts
 * const result = await fetchPaginatedData<ElearningCourse>(client, "elearning_courses", {
 *   filters: { entityId: "ent-1", search: "agile", statusIn: ["published"] },
 *   pageSize: 50,
 *   offset: 0,
 * });
 * ```
 */
export async function fetchPaginatedData<T>(
  client: SupabaseClient,
  tableName: string,
  options: {
    filters: PaginationFilters;
    pageSize: number;
    offset: number;
    /** Utilise count 'exact' par défaut ; passer false pour 'estimated' (tables >10k lignes) */
    countExact?: boolean;
  }
): Promise<PaginatedResult<T>> {
  const { filters, pageSize, offset, countExact = true } = options;

  let query = client
    .from(tableName)
    .select("*", { count: countExact ? "exact" : "estimated" })
    .eq("entity_id", filters.entityId);

  // Recherche ilike
  if (filters.search) {
    const col = filters.searchColumn ?? "title";
    query = query.ilike(col, `%${filters.search}%`);
  }

  // Filtre enum (status, course_type, etc.)
  if (filters.statusIn && filters.statusIn.length > 0) {
    const col = filters.statusColumn ?? "status";
    // Détection booléens : si toutes les valeurs sont "true"/"false" (string),
    // on convertit en boolean JS. PostgREST n'auto-convertit pas strings→booleans
    // sur `.in()` pour les colonnes boolean → match silencieusement vide.
    const allBooleanStrings = filters.statusIn.every(
      (v) => v === "true" || v === "false"
    );
    const values: (string | boolean)[] = allBooleanStrings
      ? filters.statusIn.map((v) => v === "true")
      : filters.statusIn;
    query = query.in(col, values);
  }

  // Plage de dates
  const dateCol = filters.dateColumn ?? "created_at";
  if (filters.dateFrom) {
    query = query.gte(dateCol, filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte(dateCol, filters.dateTo);
  }

  // Pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const totalCount = count ?? 0;

  return {
    data: (data ?? []) as T[],
    totalCount,
    hasMore: offset + pageSize < totalCount,
  };
}

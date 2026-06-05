/**
 * Pédagogie V2 Epic 2.5 — Slugify un nom/prénom pour générer un username learner.
 *
 * Miroir du trigger PostgreSQL `public.slugify_name` côté DB (cf. migration
 * `supabase/migrations/add_learner_username_credentials.sql`). La logique DOIT
 * rester équivalente pour permettre la prévisualisation côté UI avant insert.
 *
 * Règles :
 *  1. Lowercase
 *  2. Accents enlevés (Unicode NFD + strip combining marks)
 *  3. Tout caractère hors [a-z0-9] devient `-`
 *  4. Trim des `-` de début/fin
 *  5. Trunque à 50 chars
 *  6. Si résultat vide → `apprenant` (fallback)
 *
 * Usage côté API/route : pour générer `username` = `slugifyName(firstName) + '.' + slugifyName(lastName)`.
 * La collision est gérée par le trigger PG (suffix `-N`).
 */
export function slugifyName(input: string): string {
  // Étape 1 : enlever accents (NFD + strip combining diacriticals)
  const noAccents = (input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // Étape 2 : lowercase + remplace tout non [a-z0-9] par '-'
  let v = noAccents.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Étape 3 : trim des tirets de début/fin
  v = v.replace(/^-+|-+$/g, "");

  // Étape 4 : trunque à 50 chars
  v = v.substring(0, 50);

  // Étape 5 : fallback si vide
  if (v === "") return "apprenant";

  return v;
}

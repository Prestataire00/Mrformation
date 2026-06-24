"use client";

import { useEffect, useState } from "react";

/** Mappe une heure locale (0–23) sur la salutation française correspondante. */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

/**
 * Salutation dépendant de l'heure LOCALE du navigateur (« Bonjour », « Bon
 * après-midi », « Bonsoir »).
 *
 * Renvoie une chaîne vide tant que le composant n'est pas monté côté client,
 * puis la salutation après montage. Ceci évite tout écart d'hydratation entre
 * le rendu serveur (UTC sur Netlify) et le rendu client (fuseau du navigateur),
 * qui provoquait les erreurs React #425 (text content mismatch) et #422 sur le
 * tableau de bord. La salutation n'est donc jamais calculée pendant le SSR.
 */
export function useTimeGreeting(): string {
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return greeting;
}

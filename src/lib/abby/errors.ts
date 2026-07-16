// Traduction des erreurs Abby (SDK/HTTP) en codes internes stables (AD-16).
// L'UI mappe ces codes vers la microcopy — jamais de message SDK brut à l'écran.

export type AbbyErrorCode =
  | "abby_auth_failed"
  | "abby_plan_no_api"
  | "abby_siret_mismatch"
  | "abby_duplicate"
  | "abby_not_found"
  | "abby_validation"
  | "abby_rate_limited"
  | "abby_network"
  // Extensions assumées de l'union AD-16 :
  // aucune connexion stockée pour l'entité
  | "abby_no_connection"
  // opération refusée car l'état dérivé ne le permet pas (ex. activer sans test réussi)
  | "abby_invalid_state";

const STATUS_TO_CODE: Record<number, AbbyErrorCode> = {
  400: "abby_validation",
  401: "abby_auth_failed",
  403: "abby_plan_no_api",
  404: "abby_not_found",
  409: "abby_duplicate",
  429: "abby_rate_limited",
};

/**
 * Mappe une erreur levée par le SDK Abby (elle expose `status` sur les
 * erreurs HTTP) vers un code interne. Tout ce qui n'est pas identifiable
 * (coupure réseau, 5xx, erreur inattendue) devient `abby_network`.
 */
export function toAbbyErrorCode(err: unknown): AbbyErrorCode {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number" && STATUS_TO_CODE[status]) {
      return STATUS_TO_CODE[status];
    }
  }
  return "abby_network";
}

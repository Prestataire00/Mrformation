import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { greetingForHour, useTimeGreeting } from "../useTimeGreeting";

describe("greetingForHour — mapping heure → salutation", () => {
  it("renvoie « Bonjour » le matin (heure < 12)", () => {
    expect(greetingForHour(0)).toBe("Bonjour");
    expect(greetingForHour(11)).toBe("Bonjour");
  });

  it("renvoie « Bon après-midi » l'après-midi (12 ≤ heure < 18)", () => {
    expect(greetingForHour(12)).toBe("Bon après-midi");
    expect(greetingForHour(17)).toBe("Bon après-midi");
  });

  it("renvoie « Bonsoir » le soir (heure ≥ 18)", () => {
    expect(greetingForHour(18)).toBe("Bonsoir");
    expect(greetingForHour(23)).toBe("Bonsoir");
  });
});

describe("useTimeGreeting — sûreté d'hydratation (régression React #425/#422)", () => {
  it("ne rend AUCUN message dépendant de l'heure au rendu serveur", () => {
    // Le hook doit rester vide tant que le composant n'est pas monté côté client.
    // Ainsi le HTML serveur (UTC) et le premier rendu client (fuseau navigateur)
    // sont identiques → pas de « text content mismatch » d'hydratation.
    function Harness() {
      const greeting = useTimeGreeting();
      return createElement("span", null, greeting);
    }

    const html = renderToStaticMarkup(createElement(Harness));

    expect(html).toBe("<span></span>");
    expect(html).not.toMatch(/Bonjour|Bon après-midi|Bonsoir/);
  });
});

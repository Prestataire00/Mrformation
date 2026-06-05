import { describe, it, expect } from "vitest";
import { slugifyName } from "@/lib/utils/slugify-name";

describe("slugifyName", () => {
  it("enlève les accents", () => {
    expect(slugifyName("Éloïse")).toBe("eloise");
    expect(slugifyName("Müller")).toBe("muller");
    expect(slugifyName("François")).toBe("francois");
  });

  it("convertit espaces en tirets et lowercase", () => {
    expect(slugifyName("Jean Pierre")).toBe("jean-pierre");
    expect(slugifyName("MARIE")).toBe("marie");
  });

  it("préserve les tirets composés", () => {
    expect(slugifyName("Jean-Pierre")).toBe("jean-pierre");
    expect(slugifyName("Dupont-Martin")).toBe("dupont-martin");
  });

  it("retourne 'apprenant' pour input vide ou whitespace-only", () => {
    expect(slugifyName("")).toBe("apprenant");
    expect(slugifyName("   ")).toBe("apprenant");
    expect(slugifyName("\t\n")).toBe("apprenant");
  });

  it("strip les emoji et caractères spéciaux", () => {
    expect(slugifyName("Marie 🎓 Dupont")).toBe("marie-dupont");
    expect(slugifyName("O'Connor")).toBe("o-connor");
    expect(slugifyName("José; DROP TABLE")).toBe("jose-drop-table");
  });

  it("trunque à 50 caractères", () => {
    const long = "a".repeat(100);
    expect(slugifyName(long)).toHaveLength(50);
    expect(slugifyName(long)).toBe("a".repeat(50));
  });

  it("strip les tirets de début et fin", () => {
    expect(slugifyName("---marie---")).toBe("marie");
    expect(slugifyName("@@marie@@")).toBe("marie");
  });

  it("collapse multiple espaces/caracteres spéciaux consécutifs en un seul tiret", () => {
    expect(slugifyName("marie    dupont")).toBe("marie-dupont");
    expect(slugifyName("marie___dupont")).toBe("marie-dupont");
  });
});

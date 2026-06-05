import { describe, it, expect } from "vitest";
import {
  buildSyntheticEmail,
  isSyntheticEmail,
} from "@/lib/utils/learner-email-synthetic";

describe("buildSyntheticEmail", () => {
  it("construit le format <username>@learner.<slug>.local", () => {
    expect(buildSyntheticEmail("marie.dupont", "mr-formation")).toBe(
      "marie.dupont@learner.mr-formation.local",
    );
    expect(buildSyntheticEmail("jean-pierre", "c3v-formation")).toBe(
      "jean-pierre@learner.c3v-formation.local",
    );
  });
});

describe("isSyntheticEmail", () => {
  it("reconnait les emails synthétiques valides", () => {
    expect(isSyntheticEmail("marie.dupont@learner.mr-formation.local")).toBe(true);
    expect(isSyntheticEmail("x@learner.c3v-formation.local")).toBe(true);
    expect(
      isSyntheticEmail("jean-pierre-dupont@learner.mr-formation.local"),
    ).toBe(true);
  });

  it("rejette les emails réels", () => {
    expect(isSyntheticEmail("marie@gmail.com")).toBe(false);
    expect(isSyntheticEmail("user@learner.com")).toBe(false); // pas .local
    expect(isSyntheticEmail("user@example.local")).toBe(false); // pas learner.*
  });

  it("accepte les emails synthétiques avec casing mixte (RFC 5321 §2.4)", () => {
    // Fix M1 review adversariale : les domaines email sont insensibles à
    // la casse — on doit reconnaître un email synthétique même s'il a été
    // saisi avec une casse mixte.
    expect(isSyntheticEmail("user@LEARNER.mr-formation.local")).toBe(true);
    expect(isSyntheticEmail("Pierre@Learner.MR-FORMATION.Local")).toBe(true);
    expect(isSyntheticEmail("MARIE.DUPONT@LEARNER.C3V-FORMATION.LOCAL")).toBe(
      true,
    );
  });

  it("rejette les inputs invalides", () => {
    expect(isSyntheticEmail("")).toBe(false);
    expect(isSyntheticEmail("not-an-email")).toBe(false);
    expect(isSyntheticEmail("@learner..local")).toBe(false);
  });
});

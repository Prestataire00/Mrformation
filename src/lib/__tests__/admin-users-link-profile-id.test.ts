import { describe, it, expect } from "vitest";
import { linkProfilesWithLearnersAndTrainers } from "@/lib/services/admin-users-link";

/**
 * TASK 8 — Refacto jointure cassée `admin/users` (epic-2-5 aut-b-2).
 * La jointure profiles ↔ learners/trainers doit se faire via `profile_id`,
 * pas par comparaison d'email (un learner peut avoir un email synthétique
 * `.local` ≠ de l'email du profil Supabase Auth).
 */

const baseProfile = {
  first_name: "Marie",
  last_name: "Dupont",
  phone: null,
  role: "learner",
  avatar_url: null,
  created_at: "2026-06-04T00:00:00Z",
};

const baseLearner = {
  first_name: "Marie",
  last_name: "Dupont",
  phone: null,
  created_at: "2026-06-04T00:00:00Z",
};

describe("linkProfilesWithLearnersAndTrainers", () => {
  it("joint un learner sans email réel à son profile via profile_id", () => {
    const profiles = [
      { ...baseProfile, id: "prof-1", email: "marie.dupont@example.com" },
    ];
    const learners = [
      {
        ...baseLearner,
        id: "learner-1",
        profile_id: "prof-1",
        // Email synthétique .local volontairement différent de l'email du profile
        email: "marie.dupont.ab12@learner.mr-formation.local",
      },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, learners, []);

    expect(result).toHaveLength(1);
    expect(result[0].linked_learner).toBeDefined();
    expect(result[0].linked_learner?.id).toBe("learner-1");
    expect(result[0].linked_trainer).toBeUndefined();
  });

  it("ne lie pas un learner qui n'a pas de profile_id (legacy)", () => {
    const profiles = [
      { ...baseProfile, id: "prof-2", email: "x@example.com" },
    ];
    const learners = [
      {
        ...baseLearner,
        id: "learner-2",
        profile_id: null,
        email: "x@example.com",
      },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, learners, []);

    expect(result[0].linked_learner).toBeUndefined();
  });

  it("ne joint pas via email même si les emails matchent (sécurité : profile_id only)", () => {
    const profiles = [
      { ...baseProfile, id: "prof-3", email: "shared@example.com" },
    ];
    const learners = [
      {
        ...baseLearner,
        id: "learner-3",
        profile_id: "autre-profile",
        email: "shared@example.com",
      },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, learners, []);

    expect(result[0].linked_learner).toBeUndefined();
  });

  it("joint un trainer via profile_id indépendamment du learner", () => {
    const profiles = [
      { ...baseProfile, id: "prof-4", email: "t@example.com", role: "trainer" },
    ];
    const trainers = [
      {
        ...baseLearner,
        id: "trainer-4",
        profile_id: "prof-4",
        email: "trainer-real@example.com",
      },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, [], trainers);

    expect(result[0].linked_trainer?.id).toBe("trainer-4");
    expect(result[0].linked_learner).toBeUndefined();
  });

  it("retourne tous les profils, même sans learner ni trainer associé", () => {
    const profiles = [
      { ...baseProfile, id: "prof-5", email: "admin@example.com", role: "admin" },
      { ...baseProfile, id: "prof-6", email: "orphan@example.com" },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, [], []);

    expect(result).toHaveLength(2);
    expect(result[0].source).toBe("profile");
    expect(result[0].linked_learner).toBeUndefined();
    expect(result[0].linked_trainer).toBeUndefined();
  });

  it("conserve les champs du profile dans la sortie", () => {
    const profiles = [
      {
        ...baseProfile,
        id: "prof-7",
        email: "complete@example.com",
        phone: "+33600000000",
        avatar_url: "https://example.com/a.png",
      },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, [], []);

    expect(result[0].id).toBe("prof-7");
    expect(result[0].email).toBe("complete@example.com");
    expect(result[0].phone).toBe("+33600000000");
    expect(result[0].avatar_url).toBe("https://example.com/a.png");
  });

  it("gère plusieurs profils avec leurs learners respectifs sans confusion", () => {
    const profiles = [
      { ...baseProfile, id: "prof-A", email: "a@example.com" },
      { ...baseProfile, id: "prof-B", email: "b@example.com" },
    ];
    const learners = [
      { ...baseLearner, id: "learner-B", profile_id: "prof-B", email: "synth@learner.mr-formation.local" },
      { ...baseLearner, id: "learner-A", profile_id: "prof-A", email: "a@example.com" },
    ];

    const result = linkProfilesWithLearnersAndTrainers(profiles, learners, []);

    expect(result.find((u) => u.id === "prof-A")?.linked_learner?.id).toBe("learner-A");
    expect(result.find((u) => u.id === "prof-B")?.linked_learner?.id).toBe("learner-B");
  });
});

import { describe, it, expect, vi } from "vitest";
import { isTrainerAssignedToSession, resolveTrainerSessionIds, resolveTrainerIds } from "../trainer-session-access";

type AnyClient = Parameters<typeof isTrainerAssignedToSession>[0];

/**
 * Mock client Supabase pour les deux helpers.
 * Multi-entité : `trainers` renvoie désormais une LISTE de fiches (un profil peut
 * en avoir plusieurs, une par entité), et `formation_trainers` est filtré par
 * `.in("trainer_id", [...])`. Enregistre les filtres `.eq()`/`.in()` par table.
 */
function makeClient(opts: {
  trainers?: Array<{ id: string }>;
  // formation_trainers rows: pour isTrainerAssignedToSession (assignment) ou
  // pour resolveTrainerSessionIds (links).
  assignment?: Array<{ id: string }>;
  links?: Array<{ session_id: string }>;
}) {
  const calls: Record<string, Record<string, unknown>> = {
    trainers: {},
    formation_trainers: {},
  };

  function chain(table: string, result: unknown) {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        calls[table][col] = val;
        return builder;
      }),
      in: vi.fn((col: string, val: unknown) => {
        calls[table][col] = val;
        return builder;
      }),
      limit: vi.fn(() => builder),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: result, error: null }),
    };
    return builder;
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table === "trainers") return chain("trainers", opts.trainers ?? []);
      if (table === "formation_trainers")
        return chain("formation_trainers", opts.assignment ?? opts.links ?? []);
      throw new Error(`table inattendue: ${table}`);
    }),
    __calls: calls,
  };

  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("isTrainerAssignedToSession", () => {
  it("retourne true quand le formateur existe ET est assigné à la session", async () => {
    const client = makeClient({ trainers: [{ id: "trainer-1" }], assignment: [{ id: "ft-1" }] });
    const result = await isTrainerAssignedToSession(client, "profile-1", "session-1");
    expect(result).toBe(true);
  });

  it("résout le formateur par profile_id, puis formation_trainers par les trainer.id résolus (pas par profile_id)", async () => {
    const client = makeClient({ trainers: [{ id: "trainer-1" }], assignment: [{ id: "ft-1" }] });
    await isTrainerAssignedToSession(client, "profile-1", "session-1");
    // trainers résolu par profile_id (= auth.uid()), PAS par l'id
    expect(client.__calls.trainers.profile_id).toBe("profile-1");
    // formation_trainers filtré par les trainer.id résolus (.in) ET la session
    expect(client.__calls.formation_trainers.trainer_id).toEqual(["trainer-1"]);
    expect(client.__calls.formation_trainers.session_id).toBe("session-1");
  });

  it("retourne false si aucune fiche formateur pour ce profile_id", async () => {
    const client = makeClient({ trainers: [] });
    const result = await isTrainerAssignedToSession(client, "profile-inconnu", "session-1");
    expect(result).toBe(false);
  });

  it("retourne false si le formateur existe mais n'est pas assigné à la session", async () => {
    const client = makeClient({ trainers: [{ id: "trainer-1" }], assignment: [] });
    const result = await isTrainerAssignedToSession(client, "profile-1", "session-autre");
    expect(result).toBe(false);
  });

  it("multi-entité : prend en compte TOUTES les fiches du profil (filtre .in)", async () => {
    const client = makeClient({
      trainers: [{ id: "trainer-mr" }, { id: "trainer-c3v" }],
      assignment: [{ id: "ft-1" }],
    });
    const result = await isTrainerAssignedToSession(client, "profile-1", "session-1");
    expect(result).toBe(true);
    expect(client.__calls.formation_trainers.trainer_id).toEqual(["trainer-mr", "trainer-c3v"]);
  });
});

describe("resolveTrainerSessionIds", () => {
  it("retourne les session_ids du formateur (résolus via formation_trainers)", async () => {
    const client = makeClient({
      trainers: [{ id: "trainer-1" }],
      links: [{ session_id: "s1" }, { session_id: "s2" }],
    });
    const ids = await resolveTrainerSessionIds(client, "profile-1");
    expect(ids).toEqual(["s1", "s2"]);
    expect(client.__calls.trainers.profile_id).toBe("profile-1");
    expect(client.__calls.formation_trainers.trainer_id).toEqual(["trainer-1"]);
  });

  it("déduplique les session_ids", async () => {
    const client = makeClient({
      trainers: [{ id: "trainer-1" }],
      links: [{ session_id: "s1" }, { session_id: "s1" }, { session_id: "s2" }],
    });
    expect(await resolveTrainerSessionIds(client, "profile-1")).toEqual(["s1", "s2"]);
  });

  it("retourne [] si aucune fiche formateur", async () => {
    const client = makeClient({ trainers: [] });
    expect(await resolveTrainerSessionIds(client, "inconnu")).toEqual([]);
  });

  it("retourne [] si le formateur n'a aucune assignation", async () => {
    const client = makeClient({ trainers: [{ id: "trainer-1" }], links: [] });
    expect(await resolveTrainerSessionIds(client, "profile-1")).toEqual([]);
  });

  it("multi-entité (régression bug 'aucune session/0h') : 2 fiches → ne renvoie PAS [] et union les sessions", async () => {
    // Avant le fix, `.single()` échouait avec 2 fiches → [] → dashboard vide.
    const client = makeClient({
      trainers: [{ id: "trainer-mr" }, { id: "trainer-c3v" }],
      links: [{ session_id: "s-mr" }, { session_id: "s-c3v" }],
    });
    const ids = await resolveTrainerSessionIds(client, "profile-1");
    expect(ids).toEqual(["s-mr", "s-c3v"]);
    expect(client.__calls.formation_trainers.trainer_id).toEqual(["trainer-mr", "trainer-c3v"]);
  });
});

describe("resolveTrainerIds (multi-entité — anti-bug .single())", () => {
  it("renvoie l'id pour un profil mono-entité", async () => {
    const client = makeClient({ trainers: [{ id: "t1" }] });
    expect(await resolveTrainerIds(client, "profile-1")).toEqual(["t1"]);
  });

  it("renvoie TOUTES les fiches pour un profil multi-entité (ne casse pas, contrairement à .single())", async () => {
    const client = makeClient({ trainers: [{ id: "t-mr" }, { id: "t-c3v" }] });
    expect(await resolveTrainerIds(client, "profile-1")).toEqual(["t-mr", "t-c3v"]);
  });

  it("renvoie [] si aucune fiche formateur", async () => {
    const client = makeClient({ trainers: [] });
    expect(await resolveTrainerIds(client, "profile-x")).toEqual([]);
  });

  it("déduplique les ids", async () => {
    const client = makeClient({ trainers: [{ id: "t1" }, { id: "t1" }] });
    expect(await resolveTrainerIds(client, "profile-1")).toEqual(["t1"]);
  });
});
